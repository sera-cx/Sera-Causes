/**
 * Strict, dependency-free validation of Sera.cx responses.
 *
 * Faithful port of sera-pay:
 *   - `server/sera-swap-quote.ts`: deployment config pinning (chain id, three
 *     distinct contracts, EIP-712 domain bound to `sera_address`), swap quote
 *     consistency (taker, tokens, recipient, deadline, amounts) and the full
 *     EIP-2612 permit envelope check (domain bound to the input token and the
 *     live chain, spender bound to the live SOR, nonce/value/deadline pinned
 *     to the metadata, deadline never outliving the signed Intent);
 *   - `server/sera-settlement.ts`: tracked-order identity and settlement
 *     economics (payer debit only in the input token, credit in the output
 *     token covering the target, 32-byte non-zero tx hash, fee aggregation).
 *
 * The tracked-order response does not contain the swap recipient, so a
 * validated settlement proves order identity and economics only. On-chain
 * verification of the recipient transfer stays with the caller.
 */
import { ADDRESS_RE, BYTES32_RE, UINT_RE, UUID_RE, type Address, type GasMode, type Hex } from "./types.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_TX_HASH = `0x${"0".repeat(64)}`;
export const UINT256_MAX = (1n << 256n) - 1n;
export const UINT48_MAX = (1n << 48n) - 1n;
const DECIMAL_RE = /^(0|[1-9]\d*)(?:\.(\d+))?$/;

// ---- quote-side errors ----------------------------------------------------

export type SeraQuoteErrorCode =
  | "invalid_request"
  | "unsupported_token"
  | "unsupported_chain"
  | "invalid_config"
  | "invalid_quote"
  | "amount_below_min"
  | "no_liquidity"
  | "sera_rate_limited"
  | "sera_unavailable";

const QUOTE_ERROR_STATUS: Record<SeraQuoteErrorCode, number> = {
  invalid_request: 400,
  unsupported_token: 400,
  unsupported_chain: 400,
  invalid_config: 503,
  invalid_quote: 502,
  amount_below_min: 400,
  no_liquidity: 409,
  sera_rate_limited: 429,
  sera_unavailable: 503,
};

export class SeraQuoteValidationError extends Error {
  override readonly name = "SeraQuoteValidationError";
  readonly status: number;
  readonly field: string | null;
  readonly detail: Readonly<Record<string, unknown>> | null;
  constructor(
    readonly code: SeraQuoteErrorCode,
    message: string,
    options: { field?: string; detail?: Record<string, unknown>; status?: number } = {},
  ) {
    super(message);
    this.status = options.status ?? QUOTE_ERROR_STATUS[code];
    this.field = options.field ?? null;
    this.detail = options.detail ? Object.freeze({ ...options.detail }) : null;
  }
}

type RecordValue = Record<string, unknown>;

function fail(code: SeraQuoteErrorCode, message: string, field?: string, detail?: Record<string, unknown>): never {
  throw new SeraQuoteValidationError(code, message, { field, detail });
}

function asRecord(value: unknown, code: SeraQuoteErrorCode, field: string): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code, `${field} must be an object`, field);
  return value as RecordValue;
}

function asNonEmptyString(value: unknown, code: SeraQuoteErrorCode, field: string): string {
  if (typeof value !== "string" || !value.trim()) fail(code, `${field} must be a non-empty string`, field);
  return value.trim();
}

function asAddress(value: unknown, code: SeraQuoteErrorCode, field: string): Address {
  if (typeof value !== "string" || !ADDRESS_RE.test(value) || value.toLowerCase() === ZERO_ADDRESS) {
    fail(code, `${field} must be a non-zero EVM address`, field);
  }
  return value.toLowerCase() as Address;
}

export function addressesEqual(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function uintString(
  value: unknown,
  maximum: bigint,
  code: SeraQuoteErrorCode,
  field: string,
  options: { positive?: boolean } = {},
): string {
  let normalized: string;
  if (typeof value === "bigint") normalized = value.toString();
  else if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) fail(code, `${field} must be a safe unsigned integer`, field);
    normalized = String(value);
  } else if (typeof value === "string") normalized = value.trim();
  else fail(code, `${field} must be an unsigned integer`, field);

  if (!UINT_RE.test(normalized)) fail(code, `${field} must be an unsigned decimal integer`, field);
  const parsed = BigInt(normalized);
  if (parsed > maximum) fail(code, `${field} is outside its unsigned integer range`, field);
  if (options.positive && parsed === 0n) fail(code, `${field} must be greater than zero`, field);
  return parsed.toString();
}

function uint256(value: unknown, code: SeraQuoteErrorCode, field: string, options: { positive?: boolean } = {}): string {
  return uintString(value, UINT256_MAX, code, field, options);
}

function unixUint48(value: unknown, code: SeraQuoteErrorCode, field: string): number {
  return Number(uintString(value, UINT48_MAX, code, field, { positive: true }));
}

function serverTimestamp(value: unknown, code: SeraQuoteErrorCode, field = "serverTime"): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    fail(code, `${field} must be a positive Unix timestamp`, field);
  }
  return value;
}

function nonNegativeDecimal(value: unknown, code: SeraQuoteErrorCode, field: string): string {
  let text: string;
  if (typeof value === "string") text = value.trim();
  else if (typeof value === "number" && Number.isFinite(value) && value >= 0) text = String(value);
  else fail(code, `${field} must be a non-negative decimal`, field);
  if (!DECIMAL_RE.test(text)) fail(code, `${field} must be a non-negative decimal`, field);
  const [whole, fraction = ""] = text.split(".");
  const normalizedWhole = whole!.replace(/^0+(?=\d)/, "");
  const normalizedFraction = fraction.replace(/0+$/, "");
  return normalizedFraction ? `${normalizedWhole}.${normalizedFraction}` : normalizedWhole;
}

function chainId(value: unknown, code: SeraQuoteErrorCode, field: string): number {
  const numeric = Number(uint256(value, code, field, { positive: true }));
  if (!Number.isSafeInteger(numeric)) fail(code, `${field} must be a safe positive chain id`, field);
  return numeric;
}

export interface Eip712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Address;
}

function parseDomain(value: unknown, code: SeraQuoteErrorCode, field: string): Eip712Domain {
  const record = asRecord(value, code, field);
  return {
    name: asNonEmptyString(record.name, code, `${field}.name`),
    version: asNonEmptyString(record.version, code, `${field}.version`),
    chainId: chainId(record.chainId, code, `${field}.chainId`),
    verifyingContract: asAddress(record.verifyingContract, code, `${field}.verifyingContract`),
  };
}

function domainsEqual(left: Eip712Domain, right: Eip712Domain): boolean {
  return (
    left.name === right.name &&
    left.version === right.version &&
    left.chainId === right.chainId &&
    addressesEqual(left.verifyingContract, right.verifyingContract)
  );
}

// ---- GET /config ----------------------------------------------------------

export interface DeploymentConfig {
  chainId: number;
  seraAddress: Address;
  vaultAddress: Address;
  sorAddress: Address;
  domainSeparator: Hex | null;
  eip712Domain: Eip712Domain;
}

/** Validates the live GET /config response and pins its signing domain to `sera_address`. */
export function validateDeploymentConfig(raw: unknown, expectedChainId: number): DeploymentConfig {
  const expected = chainId(expectedChainId, "unsupported_chain", "expectedChainId");
  const value = asRecord(raw, "invalid_config", "config");
  const actualChainId = chainId(value.chain_id, "invalid_config", "config.chain_id");
  if (actualChainId !== expected) {
    fail("unsupported_chain", `Sera configuration is for chain ${actualChainId}, expected ${expected}`, "config.chain_id", {
      expectedChainId: expected,
      actualChainId,
    });
  }
  const seraAddress = asAddress(value.sera_address, "invalid_config", "config.sera_address");
  const vaultAddress = asAddress(value.vault_address, "invalid_config", "config.vault_address");
  const sorAddress = asAddress(value.sor_address, "invalid_config", "config.sor_address");
  if (new Set([seraAddress, vaultAddress, sorAddress]).size !== 3) {
    fail("invalid_config", "Sera, Vault, and SOR contract addresses must be distinct", "config");
  }
  const eip712Domain = parseDomain(value.eip712_domain, "invalid_config", "config.eip712_domain");
  if (eip712Domain.name !== "Sera" || eip712Domain.version !== "1") {
    fail("invalid_config", "Sera EIP-712 domain name or version is invalid", "config.eip712_domain");
  }
  if (eip712Domain.chainId !== actualChainId) {
    fail("invalid_config", "Sera EIP-712 domain chain does not match config.chain_id", "config.eip712_domain.chainId");
  }
  if (!addressesEqual(eip712Domain.verifyingContract, seraAddress)) {
    fail("invalid_config", "Sera EIP-712 verifyingContract does not match config.sera_address", "config.eip712_domain.verifyingContract");
  }
  let domainSeparator: Hex | null = null;
  if (value.domain_separator !== undefined && value.domain_separator !== null) {
    if (typeof value.domain_separator !== "string" || !BYTES32_RE.test(value.domain_separator)) {
      fail("invalid_config", "config.domain_separator must be a 32-byte hex value", "config.domain_separator");
    }
    domainSeparator = value.domain_separator.toLowerCase() as Hex;
  }
  return { chainId: actualChainId, seraAddress, vaultAddress, sorAddress, domainSeparator, eip712Domain };
}

// ---- POST /swap/quote request ---------------------------------------------

export interface ValidatedSwapQuoteRequest {
  from_token: Address;
  to_token: Address;
  from_amount: string;
  owner_address: Address;
  recipient: Address;
  expiration: number;
  gas_mode: GasMode;
}

export function validateSwapQuoteRequest(
  raw: unknown,
  options: { serverTime: number; expectedGasMode?: GasMode },
): ValidatedSwapQuoteRequest {
  const now = serverTimestamp(options.serverTime, "invalid_request");
  const value = asRecord(raw, "invalid_request", "request");
  const fromToken = asAddress(value.from_token, "invalid_request", "request.from_token");
  const toToken = asAddress(value.to_token, "invalid_request", "request.to_token");
  if (addressesEqual(fromToken, toToken)) {
    fail("invalid_request", "A Sera swap requires different input and output tokens", "request.to_token");
  }
  const expiration = unixUint48(value.expiration, "invalid_request", "request.expiration");
  if (expiration <= now) fail("invalid_request", "Sera quote expiration must be in the future", "request.expiration");
  if (value.gas_mode !== "pay_more" && value.gas_mode !== "receive_less") {
    fail("invalid_request", "request.gas_mode must be pay_more or receive_less", "request.gas_mode");
  }
  if (options.expectedGasMode && value.gas_mode !== options.expectedGasMode) {
    fail("invalid_request", `Sera quote must use ${options.expectedGasMode}`, "request.gas_mode");
  }
  return {
    from_token: fromToken,
    to_token: toToken,
    from_amount: uint256(value.from_amount, "invalid_request", "request.from_amount", { positive: true }),
    owner_address: asAddress(value.owner_address, "invalid_request", "request.owner_address"),
    recipient: asAddress(value.recipient, "invalid_request", "request.recipient"),
    expiration,
    gas_mode: value.gas_mode,
  };
}

/** Rejects an input below the token floor (`/tokens.min_trade_amount_raw`) before spending a quote. */
export function assertMinimumInput(inputAmountRaw: unknown, minimumInputRaw: unknown, options: { symbol?: string } = {}): void {
  const input = uint256(inputAmountRaw, "invalid_request", "inputAmountRaw", { positive: true });
  const minimum = uint256(minimumInputRaw, "invalid_request", "minimumInputRaw");
  if (BigInt(input) < BigInt(minimum)) {
    const symbol = options.symbol?.trim().toUpperCase();
    fail(
      "amount_below_min",
      symbol ? `Amount is below Sera's minimum for ${symbol}` : "Amount is below Sera's token minimum",
      "inputAmountRaw",
      { requestedRaw: input, minimumRaw: minimum, ...(symbol ? { symbol } : {}) },
    );
  }
}

// ---- POST /swap/quote response --------------------------------------------

export interface ValidatedRouteParams {
  taker: Address;
  inputToken: Address;
  outputToken: Address;
  maxInputAmount: string;
  minOutputAmount: string;
  recipient: Address;
  initialDepositAmount: string;
  uuid: string;
  deadline: string;
}

export interface FeeBreakdown {
  gasCostUsd: string;
  gasCostFromToken: string;
}

/** Permit typed data as validated from the Sera envelope (string-valued). `gift.ts` converts it to bigint for signing. */
export interface ValidatedPermitTypedData {
  domain: Eip712Domain;
  primaryType: "Permit";
  types: { Permit: Array<{ name: string; type: string }> };
  message: { owner: Address; spender: Address; value: string; nonce: string; deadline: string };
}

export type AuthorizationKind = "permit" | "approval" | "none";

export interface PermitMetadata {
  permitSupported: boolean;
  permitRequired: boolean;
  authorizationKind: AuthorizationKind;
  token: Address;
  spender: Address;
  owner: Address;
  valueRaw: string;
  currentAllowanceRaw: string;
  nonce: string | null;
  suggestedDeadline: string | null;
  domain: Eip712Domain | null;
  typedData: ValidatedPermitTypedData | null;
}

export interface ValidatedSwapQuote {
  /** Quote-record UUID used only when submitting POST /swap. */
  uuid: string;
  /** The composite uint256 Intent uuid is `routeParams.uuid`. */
  routeParams: ValidatedRouteParams;
  feeBreakdown: FeeBreakdown;
  expiresAt: number;
  permit: PermitMetadata | null;
}

const EXPECTED_PERMIT_FIELDS = [
  { name: "owner", type: "address" },
  { name: "spender", type: "address" },
  { name: "value", type: "uint256" },
  { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint256" },
] as const;

function parsePermitTypes(value: unknown): Array<{ name: string; type: string }> {
  const types = asRecord(value, "invalid_quote", "quote.permit.eip712.types");
  const permit = types.Permit;
  if (!Array.isArray(permit) || permit.length !== EXPECTED_PERMIT_FIELDS.length) {
    fail("invalid_quote", "Permit typed data has an invalid Permit type", "quote.permit.eip712.types.Permit");
  }
  const parsed = permit.map((item, index) => {
    const field = asRecord(item, "invalid_quote", `quote.permit.eip712.types.Permit[${index}]`);
    return {
      name: asNonEmptyString(field.name, "invalid_quote", `quote.permit.eip712.types.Permit[${index}].name`),
      type: asNonEmptyString(field.type, "invalid_quote", `quote.permit.eip712.types.Permit[${index}].type`),
    };
  });
  for (let index = 0; index < EXPECTED_PERMIT_FIELDS.length; index += 1) {
    if (parsed[index]!.name !== EXPECTED_PERMIT_FIELDS[index]!.name || parsed[index]!.type !== EXPECTED_PERMIT_FIELDS[index]!.type) {
      fail("invalid_quote", "Permit typed data fields do not match EIP-2612", `quote.permit.eip712.types.Permit[${index}]`);
    }
  }
  return parsed;
}

function parsePermitTypedData(
  raw: unknown,
  context: {
    config: DeploymentConfig;
    inputToken: Address;
    owner: Address;
    spender: Address;
    valueRaw: string;
    nonce: string;
    suggestedDeadline: string;
    routeDeadline: string;
    serverTime: number;
    metadataDomain: Eip712Domain;
  },
): ValidatedPermitTypedData {
  const value = asRecord(raw, "invalid_quote", "quote.permit.eip712");
  if (value.primaryType !== "Permit") {
    fail("invalid_quote", "Permit typed data primaryType must be Permit", "quote.permit.eip712.primaryType");
  }
  const domain = parseDomain(value.domain, "invalid_quote", "quote.permit.eip712.domain");
  if (!domainsEqual(domain, context.metadataDomain)) {
    fail("invalid_quote", "Permit typed-data domain does not match permit.domain", "quote.permit.eip712.domain");
  }
  if (domain.chainId !== context.config.chainId) {
    fail("invalid_quote", "Permit domain chain does not match the live Sera chain", "quote.permit.eip712.domain.chainId");
  }
  if (!addressesEqual(domain.verifyingContract, context.inputToken)) {
    fail("invalid_quote", "Permit verifyingContract does not match the input token", "quote.permit.eip712.domain.verifyingContract");
  }
  const types = { Permit: parsePermitTypes(value.types) };
  const message = asRecord(value.message, "invalid_quote", "quote.permit.eip712.message");
  const owner = asAddress(message.owner, "invalid_quote", "quote.permit.eip712.message.owner");
  const spender = asAddress(message.spender, "invalid_quote", "quote.permit.eip712.message.spender");
  const permitValue = uint256(message.value, "invalid_quote", "quote.permit.eip712.message.value");
  const nonce = uint256(message.nonce, "invalid_quote", "quote.permit.eip712.message.nonce");
  const deadline = uintString(message.deadline, UINT256_MAX, "invalid_quote", "quote.permit.eip712.message.deadline", { positive: true });
  if (!addressesEqual(owner, context.owner)) {
    fail("invalid_quote", "Permit message owner does not match the quote payer", "quote.permit.eip712.message.owner");
  }
  if (!addressesEqual(spender, context.spender)) {
    fail("invalid_quote", "Permit message spender does not match permit.spender", "quote.permit.eip712.message.spender");
  }
  if (permitValue !== context.valueRaw) {
    fail("invalid_quote", "Permit message value does not match permit.value_raw", "quote.permit.eip712.message.value");
  }
  if (nonce !== context.nonce) {
    fail("invalid_quote", "Permit message nonce does not match permit.nonce", "quote.permit.eip712.message.nonce");
  }
  if (deadline !== context.suggestedDeadline) {
    fail("invalid_quote", "Permit deadline does not match permit.suggested_deadline", "quote.permit.eip712.message.deadline");
  }
  if (BigInt(deadline) <= BigInt(context.serverTime)) {
    fail("invalid_quote", "Permit deadline has expired", "quote.permit.eip712.message.deadline");
  }
  if (BigInt(deadline) > BigInt(context.routeDeadline)) {
    fail("invalid_quote", "Permit deadline must not outlive the signed Sera Intent", "quote.permit.eip712.message.deadline");
  }
  return { domain, primaryType: "Permit", types, message: { owner, spender, value: permitValue, nonce, deadline } };
}

function parsePermitMetadata(
  raw: unknown,
  context: {
    config: DeploymentConfig;
    inputToken: Address;
    owner: Address;
    initialDepositAmount: string;
    routeDeadline: string;
    serverTime: number;
  },
): PermitMetadata | null {
  const initialDeposit = BigInt(context.initialDepositAmount);
  if (raw === undefined || raw === null) {
    if (initialDeposit > 0n) {
      fail("invalid_quote", "Wallet-funded quote did not return Permit or approval metadata", "quote.permit");
    }
    return null;
  }
  const value = asRecord(raw, "invalid_quote", "quote.permit");
  if (typeof value.permit_supported !== "boolean") {
    fail("invalid_quote", "quote.permit.permit_supported must be boolean", "quote.permit.permit_supported");
  }
  if (typeof value.permit_required !== "boolean") {
    fail("invalid_quote", "quote.permit.permit_required must be boolean", "quote.permit.permit_required");
  }
  const permitSupported = value.permit_supported;
  const permitRequired = value.permit_required;
  const token = asAddress(value.token, "invalid_quote", "quote.permit.token");
  const spender = asAddress(value.spender, "invalid_quote", "quote.permit.spender");
  const owner = asAddress(value.owner, "invalid_quote", "quote.permit.owner");
  const valueRaw = uint256(value.value_raw, "invalid_quote", "quote.permit.value_raw");
  const currentAllowanceRaw = uint256(value.current_allowance_raw, "invalid_quote", "quote.permit.current_allowance_raw");

  if (!addressesEqual(token, context.inputToken)) {
    fail("invalid_quote", "Permit token does not match the quote input token", "quote.permit.token");
  }
  if (!addressesEqual(owner, context.owner)) {
    fail("invalid_quote", "Permit owner does not match the quote payer", "quote.permit.owner");
  }
  if (!addressesEqual(spender, context.config.sorAddress)) {
    fail("invalid_quote", "Permit or approval spender does not match the live SOR contract", "quote.permit.spender");
  }
  const allowanceCoversDeposit = BigInt(currentAllowanceRaw) >= initialDeposit;
  if (!allowanceCoversDeposit && BigInt(valueRaw) < initialDeposit) {
    fail("invalid_quote", "Permit or approval value does not cover the wallet deposit", "quote.permit.value_raw");
  }
  if (!permitSupported && permitRequired) {
    fail("invalid_quote", "A token without Permit support cannot require a Permit signature", "quote.permit.permit_required");
  }
  if (permitSupported && !permitRequired && !allowanceCoversDeposit) {
    fail("invalid_quote", "Quote requires token authorization but does not request Permit or approval", "quote.permit");
  }

  let nonce: string | null = null;
  let suggestedDeadline: string | null = null;
  let domain: Eip712Domain | null = null;
  let typedData: ValidatedPermitTypedData | null = null;
  if (permitRequired) {
    nonce = uint256(value.nonce, "invalid_quote", "quote.permit.nonce");
    suggestedDeadline = uintString(value.suggested_deadline, UINT256_MAX, "invalid_quote", "quote.permit.suggested_deadline", { positive: true });
    domain = parseDomain(value.domain, "invalid_quote", "quote.permit.domain");
    typedData = parsePermitTypedData(value.eip712, {
      config: context.config,
      inputToken: context.inputToken,
      owner,
      spender,
      valueRaw,
      nonce,
      suggestedDeadline,
      routeDeadline: context.routeDeadline,
      serverTime: context.serverTime,
      metadataDomain: domain,
    });
  } else if (value.eip712 !== undefined && value.eip712 !== null) {
    fail("invalid_quote", "Permit typed data was returned although permit_required is false", "quote.permit.eip712");
  }

  const authorizationKind: AuthorizationKind = permitRequired
    ? "permit"
    : allowanceCoversDeposit || initialDeposit === 0n
      ? "none"
      : "approval";
  return { permitSupported, permitRequired, authorizationKind, token, spender, owner, valueRaw, currentAllowanceRaw, nonce, suggestedDeadline, domain, typedData };
}

function quoteRecord(raw: unknown): RecordValue {
  const envelope = asRecord(raw, "invalid_quote", "quote response");
  if (Object.prototype.hasOwnProperty.call(envelope, "quote")) {
    return asRecord(envelope.quote, "invalid_quote", "quote response.quote");
  }
  return envelope;
}

/** Validates an executable quote and every field the giver will authorise. */
export function validateSwapQuote(
  raw: unknown,
  context: { request: ValidatedSwapQuoteRequest; config: DeploymentConfig; serverTime: number },
): ValidatedSwapQuote {
  const now = serverTimestamp(context.serverTime, "invalid_quote");
  const quote = quoteRecord(raw);
  const uuid = asNonEmptyString(quote.uuid, "invalid_quote", "quote.uuid");
  if (!UUID_RE.test(uuid)) {
    fail("invalid_quote", "quote.uuid must be a UUID and must not be confused with route_params.uuid", "quote.uuid");
  }
  const route = asRecord(quote.route_params, "invalid_quote", "quote.route_params");
  const routeParams: ValidatedRouteParams = {
    taker: asAddress(route.taker, "invalid_quote", "quote.route_params.taker"),
    inputToken: asAddress(route.inputToken, "invalid_quote", "quote.route_params.inputToken"),
    outputToken: asAddress(route.outputToken, "invalid_quote", "quote.route_params.outputToken"),
    maxInputAmount: uint256(route.maxInputAmount, "invalid_quote", "quote.route_params.maxInputAmount", { positive: true }),
    minOutputAmount: uint256(route.minOutputAmount, "invalid_quote", "quote.route_params.minOutputAmount"),
    recipient: asAddress(route.recipient, "invalid_quote", "quote.route_params.recipient"),
    initialDepositAmount: uint256(route.initialDepositAmount, "invalid_quote", "quote.route_params.initialDepositAmount"),
    uuid: uint256(route.uuid, "invalid_quote", "quote.route_params.uuid", { positive: true }),
    deadline: uintString(route.deadline, UINT48_MAX, "invalid_quote", "quote.route_params.deadline", { positive: true }),
  };

  if (!addressesEqual(routeParams.taker, context.request.owner_address)) {
    fail("invalid_quote", "Quote taker does not match the requested owner", "quote.route_params.taker");
  }
  if (!addressesEqual(routeParams.inputToken, context.request.from_token)) {
    fail("invalid_quote", "Quote input token does not match the request", "quote.route_params.inputToken");
  }
  if (!addressesEqual(routeParams.outputToken, context.request.to_token)) {
    fail("invalid_quote", "Quote output token does not match the request", "quote.route_params.outputToken");
  }
  if (!addressesEqual(routeParams.recipient, context.request.recipient)) {
    fail("invalid_quote", "Quote recipient does not match the requested recipient", "quote.route_params.recipient");
  }
  if (BigInt(routeParams.deadline) !== BigInt(context.request.expiration)) {
    fail("invalid_quote", "Quote Intent deadline does not match the requested expiration", "quote.route_params.deadline");
  }
  if (BigInt(routeParams.deadline) <= BigInt(now)) {
    fail("invalid_quote", "Quote Intent deadline has expired", "quote.route_params.deadline");
  }
  if (BigInt(routeParams.initialDepositAmount) > BigInt(routeParams.maxInputAmount)) {
    fail("invalid_quote", "Quote wallet deposit exceeds maxInputAmount", "quote.route_params.initialDepositAmount");
  }
  if (context.request.gas_mode === "pay_more" && BigInt(routeParams.maxInputAmount) < BigInt(context.request.from_amount)) {
    fail("invalid_quote", "pay_more quote maxInputAmount is below the requested input", "quote.route_params.maxInputAmount");
  }
  if (context.request.gas_mode === "receive_less" && BigInt(routeParams.maxInputAmount) !== BigInt(context.request.from_amount)) {
    fail("invalid_quote", "receive_less quote must preserve the requested input", "quote.route_params.maxInputAmount");
  }
  if (BigInt(routeParams.minOutputAmount) === 0n) {
    fail("no_liquidity", "Sera returned no executable output for this direction and amount", "quote.route_params.minOutputAmount");
  }

  const fees = asRecord(quote.fee_breakdown, "invalid_quote", "quote.fee_breakdown");
  const feeBreakdown: FeeBreakdown = {
    gasCostUsd: nonNegativeDecimal(fees.gas_cost_usd, "invalid_quote", "quote.fee_breakdown.gas_cost_usd"),
    gasCostFromToken: nonNegativeDecimal(fees.gas_cost_from_token, "invalid_quote", "quote.fee_breakdown.gas_cost_from_token"),
  };
  const expiresAt = unixUint48(quote.expires_at, "invalid_quote", "quote.expires_at");
  if (expiresAt <= now) fail("invalid_quote", "Sera quote has already expired", "quote.expires_at");
  if (BigInt(expiresAt) > BigInt(routeParams.deadline)) {
    fail("invalid_quote", "Quote record expiry must not outlive the signed Intent", "quote.expires_at");
  }

  const permit = parsePermitMetadata(quote.permit, {
    config: context.config,
    inputToken: routeParams.inputToken,
    owner: routeParams.taker,
    initialDepositAmount: routeParams.initialDepositAmount,
    routeDeadline: routeParams.deadline,
    serverTime: now,
  });
  return { uuid: uuid.toLowerCase(), routeParams, feeBreakdown, expiresAt, permit };
}

/** Maps recognised Sera/network failures from a quote call; null for anything else. */
export function mapQuoteProviderError(error: unknown): SeraQuoteValidationError | null {
  if (error instanceof SeraQuoteValidationError) return error;
  const value = error && typeof error === "object" ? (error as RecordValue) : null;
  const status = value && typeof value.status === "number" ? value.status : null;
  const codeRaw = value && typeof value.code === "string" ? value.code.toUpperCase() : null;
  if (codeRaw === "NO_LIQUIDITY" || codeRaw === "PAIR_INACTIVE") {
    return new SeraQuoteValidationError("no_liquidity", "Sera has no executable route for this direction and amount");
  }
  if (codeRaw === "AMOUNT_BELOW_MIN") {
    return new SeraQuoteValidationError("amount_below_min", "Amount is below Sera's token minimum", {
      detail: value?.body && typeof value.body === "object" ? { sera: value.body } : undefined,
    });
  }
  if (status === 429 || codeRaw === "RATE_LIMITED" || codeRaw === "TOO_MANY_REQUESTS") {
    return new SeraQuoteValidationError("sera_rate_limited", "Sera quote service is rate limited");
  }
  if ((status !== null && status >= 500) || codeRaw === "TIMEOUT" || codeRaw === "NETWORK") {
    return new SeraQuoteValidationError("sera_unavailable", "Sera quote service is temporarily unavailable");
  }
  return null;
}

// ---- GET /orders/{trade_id} -----------------------------------------------

export type SeraSettlementValidationErrorCode =
  | "INVALID_EXPECTATION"
  | "MALFORMED_ORDER"
  | "ORDER_NOT_SETTLED"
  | "TRADE_ID_MISMATCH"
  | "PAYER_MISMATCH"
  | "ORDER_TYPE_MISMATCH"
  | "INPUT_TOKEN_MISMATCH"
  | "OUTPUT_TOKEN_MISMATCH"
  | "PERSPECTIVE_ORDER_ID_MISMATCH"
  | "DEBIT_TOKEN_MISMATCH"
  | "MISSING_INPUT_DEBIT"
  | "MISSING_OUTPUT_CREDIT"
  | "OUTPUT_UNDERPAID"
  | "INVALID_SETTLEMENT_TX_HASH";

export class SeraSettlementValidationError extends Error {
  override readonly name = "SeraSettlementValidationError";
  readonly retryable: boolean;
  readonly field?: string;
  readonly expected?: string;
  readonly actual?: string;
  constructor(
    readonly code: SeraSettlementValidationErrorCode,
    message: string,
    details: { field?: string; expected?: string; actual?: string; retryable?: boolean } = {},
  ) {
    super(message);
    this.retryable = details.retryable ?? false;
    this.field = details.field;
    this.expected = details.expected;
    this.actual = details.actual;
  }
}

/**
 * What the caller knows about the order it submitted. `tradeId` is required;
 * every other field is checked only when supplied.
 */
export interface SettlementExpectation {
  tradeId: string;
  payerAddress?: string;
  inputTokenAddress?: string;
  outputTokenAddress?: string;
  /** Minimum acceptable credit in the output token (the quote's minOutputAmount). */
  targetOutputAmountRaw?: string;
}

export interface TokenAmount {
  token: Address;
  amountRaw: string;
}

export interface ValidatedSettlement {
  tradeId: string;
  status: "settled";
  payerAddress: Address;
  inputTokenAddress: Address;
  outputTokenAddress: Address;
  /** Total documented payer debit in the input token. */
  actualPayRaw: string;
  /** Total documented credit in the output token. */
  actualReceiveRaw: string;
  /** Fee entries aggregated by token address in deterministic address order. */
  fees: TokenAmount[];
  txHash: Hex;
}

function sfail(code: SeraSettlementValidationErrorCode, message: string, details: { field?: string; expected?: string; actual?: string; retryable?: boolean } = {}): never {
  throw new SeraSettlementValidationError(code, message, details);
}

function sRecord(value: unknown, field: string): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) sfail("MALFORMED_ORDER", `${field} must be an object`, { field });
  return value as RecordValue;
}

function sString(value: unknown, field: string, source: "expectation" | "order" = "order"): string {
  if (typeof value !== "string" || value.trim() === "") {
    sfail(source === "order" ? "MALFORMED_ORDER" : "INVALID_EXPECTATION", `${field} must be a non-empty string`, { field });
  }
  return value.trim();
}

function sAddress(value: unknown, field: string, source: "expectation" | "order"): Address {
  if (typeof value !== "string" || !ADDRESS_RE.test(value.trim())) {
    sfail(source === "order" ? "MALFORMED_ORDER" : "INVALID_EXPECTATION", `${field} must be a 20-byte hex address`, { field });
  }
  return value.trim().toLowerCase() as Address;
}

function sPositiveUint256(value: unknown, field: string, source: "expectation" | "order"): bigint {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) {
    sfail(source === "order" ? "MALFORMED_ORDER" : "INVALID_EXPECTATION", `${field} must be a positive uint256 decimal string`, { field });
  }
  const parsed = BigInt(value);
  if (parsed <= 0n || parsed > UINT256_MAX) {
    sfail(source === "order" ? "MALFORMED_ORDER" : "INVALID_EXPECTATION", `${field} must be between 1 and uint256 max`, { field });
  }
  return parsed;
}

function aggregateTokenAmounts(value: unknown, field: string): Map<Address, bigint> {
  if (!Array.isArray(value)) sfail("MALFORMED_ORDER", `${field} must be an array`, { field });
  const totals = new Map<Address, bigint>();
  for (let index = 0; index < value.length; index += 1) {
    const itemField = `${field}[${index}]`;
    const item = sRecord(value[index], itemField);
    const tokenAddress = sAddress(item.token_address, `${itemField}.token_address`, "order");
    const amountRaw = sPositiveUint256(item.amount_raw, `${itemField}.amount_raw`, "order");
    const total = (totals.get(tokenAddress) ?? 0n) + amountRaw;
    if (total > UINT256_MAX) sfail("MALFORMED_ORDER", `${field} contains an aggregated amount above uint256 max`, { field });
    totals.set(tokenAddress, total);
  }
  return totals;
}

function assertEqual(actual: string, expected: string, code: SeraSettlementValidationErrorCode, field: string, message: string): void {
  if (actual !== expected) sfail(code, message, { field, expected, actual });
}

export interface OrderIdentity {
  tradeId: string;
  payerAddress: Address;
  inputTokenAddress: Address;
  outputTokenAddress: Address;
  status: string;
}

/** Proves the tracked order is the swap the caller submitted (identity only, any status). */
export function validateOrderIdentity(response: unknown, expectation: SettlementExpectation): OrderIdentity {
  const expectedTradeId = sString(expectation.tradeId, "expectation.tradeId", "expectation");
  const order = sRecord(response, "order");
  const tradeId = sString(order.trade_id, "order.trade_id");
  assertEqual(tradeId, expectedTradeId, "TRADE_ID_MISMATCH", "order.trade_id", "Sera trade ID does not match the submitted order");

  const payer = sAddress(order.owner_address, "order.owner_address", "order");
  if (expectation.payerAddress !== undefined) {
    const expectedPayer = sAddress(expectation.payerAddress, "expectation.payerAddress", "expectation");
    assertEqual(payer, expectedPayer, "PAYER_MISMATCH", "order.owner_address", "Sera order owner does not match the giver");
  }

  const orderType = sString(order.order_type, "order.order_type").toLowerCase();
  assertEqual(orderType, "swap", "ORDER_TYPE_MISMATCH", "order.order_type", "Sera order is not a swap");

  const inputToken = sAddress(order.from_token, "order.from_token", "order");
  if (expectation.inputTokenAddress !== undefined) {
    const expectedInput = sAddress(expectation.inputTokenAddress, "expectation.inputTokenAddress", "expectation");
    assertEqual(inputToken, expectedInput, "INPUT_TOKEN_MISMATCH", "order.from_token", "Sera input token does not match the gift");
  }
  const outputToken = sAddress(order.to_token, "order.to_token", "order");
  if (expectation.outputTokenAddress !== undefined) {
    const expectedOutput = sAddress(expectation.outputTokenAddress, "expectation.outputTokenAddress", "expectation");
    assertEqual(outputToken, expectedOutput, "OUTPUT_TOKEN_MISMATCH", "order.to_token", "Sera output token does not match the gift");
  }
  const status = sString(order.status, "order.status").toLowerCase();
  return { tradeId, payerAddress: payer, inputTokenAddress: inputToken, outputTokenAddress: outputToken, status };
}

/**
 * Validate and normalise a settled tracked-order response. Identity
 * comparisons are exact except addresses (case-insensitive); amounts are
 * parsed with bigint and returned as canonical decimal strings.
 */
export function validateSettledOrder(response: unknown, expectation: SettlementExpectation): ValidatedSettlement {
  const identity = validateOrderIdentity(response, expectation);
  const order = sRecord(response, "order");
  const targetOutput =
    expectation.targetOutputAmountRaw === undefined
      ? null
      : sPositiveUint256(expectation.targetOutputAmountRaw, "expectation.targetOutputAmountRaw", "expectation");

  if (identity.status !== "settled") {
    sfail("ORDER_NOT_SETTLED", `Sera order is ${identity.status}, not settled`, {
      field: "order.status",
      expected: "settled",
      actual: identity.status,
      retryable: identity.status === "pending" || identity.status === "matched",
    });
  }

  const settlementSummary = sRecord(order.settlement_summary, "order.settlement_summary");
  const hashValue = sString(settlementSummary.latest_tx_hash, "order.settlement_summary.latest_tx_hash");
  if (!BYTES32_RE.test(hashValue) || hashValue.toLowerCase() === ZERO_TX_HASH) {
    sfail("INVALID_SETTLEMENT_TX_HASH", "Sera settlement transaction hash is missing or invalid", {
      field: "order.settlement_summary.latest_tx_hash",
      actual: hashValue,
    });
  }
  const txHash = hashValue.toLowerCase() as Hex;

  const economics = sRecord(order.settlement_economics, "order.settlement_economics");
  const perspectiveOrderId = sString(economics.perspective_order_id, "order.settlement_economics.perspective_order_id");
  assertEqual(
    perspectiveOrderId,
    identity.tradeId,
    "PERSPECTIVE_ORDER_ID_MISMATCH",
    "order.settlement_economics.perspective_order_id",
    "Sera settlement economics do not belong to the submitted order",
  );
  const debits = aggregateTokenAmounts(economics.balance_debits, "order.settlement_economics.balance_debits");
  const credits = aggregateTokenAmounts(economics.balance_credits, "order.settlement_economics.balance_credits");
  const feeTotals = aggregateTokenAmounts(economics.fees_paid, "order.settlement_economics.fees_paid");

  const expectedInput = identity.inputTokenAddress;
  const expectedOutput = identity.outputTokenAddress;
  if (debits.size === 0) {
    sfail("MISSING_INPUT_DEBIT", "Sera settlement has no payer debit", { field: "order.settlement_economics.balance_debits", expected: expectedInput });
  }
  const unexpectedDebitTokens = [...debits.keys()].filter((address) => address !== expectedInput);
  if (unexpectedDebitTokens.length > 0) {
    sfail("DEBIT_TOKEN_MISMATCH", "Sera payer debit contains a token other than the expected input token", {
      field: "order.settlement_economics.balance_debits",
      expected: expectedInput,
      actual: unexpectedDebitTokens.join(","),
    });
  }
  const actualPay = debits.get(expectedInput);
  if (!actualPay) {
    sfail("MISSING_INPUT_DEBIT", "Sera settlement has no debit in the expected input token", { field: "order.settlement_economics.balance_debits", expected: expectedInput });
  }
  const actualReceive = credits.get(expectedOutput);
  if (!actualReceive) {
    sfail("MISSING_OUTPUT_CREDIT", "Sera settlement has no credit in the expected output token", { field: "order.settlement_economics.balance_credits", expected: expectedOutput });
  }
  if (targetOutput !== null && actualReceive < targetOutput) {
    sfail("OUTPUT_UNDERPAID", "Sera settlement output is below the quoted minimum", {
      field: "order.settlement_economics.balance_credits",
      expected: targetOutput.toString(),
      actual: actualReceive.toString(),
    });
  }

  const fees: TokenAmount[] = [...feeTotals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([token, amountRaw]) => ({ token, amountRaw: amountRaw.toString() }));

  return {
    tradeId: identity.tradeId,
    status: "settled",
    payerAddress: identity.payerAddress,
    inputTokenAddress: expectedInput,
    outputTokenAddress: expectedOutput,
    actualPayRaw: actualPay.toString(),
    actualReceiveRaw: actualReceive.toString(),
    fees,
    txHash,
  };
}
