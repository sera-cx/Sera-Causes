/**
 * Domain types shared by the live adapter and the mock, plus the pure
 * transformations between Sera.cx wire shapes and the Sera Causes gift model:
 *   - currency / market normalisation,
 *   - validated quote -> GiftQuote,
 *   - GiftQuote -> EIP-712 typed data (`buildSigningRequest`),
 *   - tracked order -> normalised GiftSettlement.
 */
import type { SeraNetwork } from "./config.js";
import type { KytCheckType, KytResult } from "./kyt.js";
import type { Address, GasMode, Hex, SeraMarket, SeraToken } from "./types.js";
import {
  validateOrderIdentity,
  validateSettledOrder,
  SeraSettlementValidationError,
  SeraQuoteValidationError,
  type AuthorizationKind,
  type DeploymentConfig,
  type Eip712Domain,
  type FeeBreakdown,
  type PermitMetadata,
  type SettlementExpectation,
  type TokenAmount,
  type ValidatedRouteParams,
  type ValidatedSwapQuote,
} from "./validate.js";

// ---- EIP-712 types --------------------------------------------------------

/** Sera SOR Intent struct, signed under domain { name: "Sera", version: "1", chainId, verifyingContract: sera_address }. */
export const INTENT_TYPES = {
  Intent: [
    { name: "taker", type: "address" },
    { name: "inputToken", type: "address" },
    { name: "outputToken", type: "address" },
    { name: "maxInputAmount", type: "uint256" },
    { name: "minOutputAmount", type: "uint256" },
    { name: "recipient", type: "address" },
    { name: "initialDepositAmount", type: "uint256" },
    { name: "uuid", type: "uint256" },
    { name: "deadline", type: "uint48" },
  ],
} as const;

/** EIP-2612 Permit struct, signed under the input token's own domain. */
export const PERMIT_TYPES = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export interface IntentMessage {
  taker: Address;
  inputToken: Address;
  outputToken: Address;
  maxInputAmount: bigint;
  minOutputAmount: bigint;
  recipient: Address;
  initialDepositAmount: bigint;
  uuid: bigint;
  deadline: number;
}

export interface PermitMessage {
  owner: Address;
  spender: Address;
  value: bigint;
  nonce: bigint;
  deadline: bigint;
}

/** Ready for viem `signTypedData` / `verifyTypedData`. */
export interface IntentTypedData {
  domain: Eip712Domain;
  types: typeof INTENT_TYPES;
  primaryType: "Intent";
  message: IntentMessage;
}

export interface PermitTypedData {
  domain: Eip712Domain;
  types: typeof PERMIT_TYPES;
  primaryType: "Permit";
  message: PermitMessage;
}

export interface SigningRequest {
  intent: IntentTypedData;
  /** Present only when the quote requires an EIP-2612 permit (`quote.authorization === "permit"`). */
  permit?: PermitTypedData;
}

// ---- public model ---------------------------------------------------------

export interface Deployment extends DeploymentConfig {
  network: SeraNetwork;
  health: {
    healthy: boolean;
    /** Raw `/health.status` ("healthy" | "degraded" | ...), null when /health failed. */
    status: string | null;
    executorId: number | string | null;
    signatureReady: boolean | null;
  };
  fetchedAt: number;
}

export interface Currency {
  symbol: string;
  address: Address;
  decimals: number;
  /** ISO fiat code the stablecoin tracks (USD, SGD, MYR...), null when Sera does not tag it. */
  currency: string | null;
  name: string | null;
  /** On-chain minimum input in raw units; "0" means no floor. */
  minTradeAmountRaw: string;
}

export interface Market {
  symbol: string;
  baseSymbol: string;
  quoteSymbol: string;
  baseAddress: Address;
  quoteAddress: Address;
}

export interface Currencies {
  chainId: number;
  tokens: Currency[];
  markets: Market[];
  fetchedAt: number;
}

export interface QuoteGiftInput {
  /** Symbol (case-insensitive) or ERC-20 address from `listCurrencies`. */
  fromToken: string;
  toToken: string;
  /** Raw units of `fromToken`. */
  fromAmountRaw: string | bigint;
  /** Wallet that signs and funds the swap. */
  giver: Address;
  /** The cause's receiving address; locked into the signed Intent. */
  recipient: Address;
  /** Signing window, clamped to [30, 600]; default 120. */
  ttlSeconds?: number;
  /** Default "receive_less": the giver spends exactly `fromAmountRaw`; gas comes out of the output. */
  gasMode?: GasMode;
}

export interface GiftQuote {
  /** Quote record UUID for `submitGift`. */
  quoteId: string;
  network: SeraNetwork;
  chainId: number;
  gasMode: GasMode;
  giver: Address;
  recipient: Address;
  from: Currency;
  to: Currency;
  /** What was requested. */
  fromAmountRaw: string;
  /** What the Intent authorises (equals fromAmountRaw under receive_less). */
  maxInputRaw: string;
  /** Protected minimum the cause receives. */
  minOutputRaw: string;
  /** Portion pulled from the giver's wallet (vs. Sera vault equity). */
  initialDepositRaw: string;
  routeParams: ValidatedRouteParams;
  feeBreakdown: FeeBreakdown;
  /** Sera server time the quote was anchored to. */
  serverTime: number;
  /** Quote record expiry (roughly 30 s). Submit before this. */
  expiresAt: number;
  /** Signed Intent deadline (= serverTime + ttl). */
  deadline: number;
  /** "permit": sign `SigningRequest.permit`; "approval": approve `permit.spender` on-chain first; "none": nothing extra. */
  authorization: AuthorizationKind;
  permit: PermitMetadata | null;
  /** Sera Intent domain pinned to the live deployment. */
  eip712Domain: Eip712Domain;
}

export interface SubmitGiftInput {
  uuid: string;
  signature: Hex;
  permitSignature?: Hex;
  /** Must be `quote.permit.typedData.message.deadline`, as a number. */
  permitDeadline?: number;
}

export interface SubmitGiftResult {
  tradeId: string;
  /** Sera's initial status, normally "pending". */
  status: string;
  feeBreakdown: { gasCostUsd: string | null; gasCostFromToken: string | null } | null;
  raw: unknown;
}

export type SettlementState = "pending" | "settled" | "failed";

export interface GiftSettlement {
  tradeId: string;
  state: SettlementState;
  /** Raw Sera status: pending | matched | settled | failed | cancelled. */
  status: string;
  txHash?: Hex;
  /** Giver debit in the input token; present once settled. */
  paid: TokenAmount | null;
  /** Credit in the output token; present once settled. */
  received: TokenAmount | null;
  feesPaid: TokenAmount[];
  errorCode: string | null;
  error: string | null;
  raw: unknown;
}

export interface FxRate {
  pair: string;
  base: string;
  quote: string;
  /** Decimal string, quote units per 1 base unit. */
  rate: string;
  asOf: number | null;
  rate24hAgo: string | null;
  changePct: string | null;
  fetchedAt: number;
}

export interface SettlementAdapter {
  readonly network: SeraNetwork;
  readonly chainId: number;
  readonly baseUrl: string;
  getDeployment(options?: { fresh?: boolean }): Promise<Deployment>;
  listCurrencies(options?: { fresh?: boolean }): Promise<Currencies>;
  quoteGift(input: QuoteGiftInput): Promise<GiftQuote>;
  buildSigningRequest(quote: GiftQuote): SigningRequest;
  submitGift(input: SubmitGiftInput): Promise<SubmitGiftResult>;
  getSettlement(tradeId: string, expectation?: Omit<SettlementExpectation, "tradeId">): Promise<GiftSettlement>;
  screenAddress(address: string, checkType: KytCheckType): Promise<KytResult>;
  fxRate(from: string, to: string): Promise<FxRate>;
}

// ---- normalisers ----------------------------------------------------------

export const DEFAULT_TTL_SECONDS = 120;
export const MIN_TTL_SECONDS = 30;
export const MAX_TTL_SECONDS = 600;

export function clampTtl(ttl: number | undefined): number {
  const requested = ttl ?? DEFAULT_TTL_SECONDS;
  if (!Number.isFinite(requested)) throw new SeraQuoteValidationError("invalid_request", "ttlSeconds must be a number", { field: "ttlSeconds" });
  return Math.min(Math.max(MIN_TTL_SECONDS, Math.floor(requested)), MAX_TTL_SECONDS);
}

export function normaliseToken(token: SeraToken): Currency {
  const fiat = token.currency ?? token.fiat_currency ?? null;
  return {
    symbol: token.symbol,
    address: token.address.toLowerCase() as Address,
    decimals: token.decimals,
    currency: fiat ? fiat.toUpperCase() : null,
    name: token.name ?? null,
    minTradeAmountRaw: token.min_trade_amount_raw ?? "0",
  };
}

export function normaliseMarket(market: SeraMarket): Market | null {
  const baseAddress = market.base_address ?? market.base_token;
  const quoteAddress = market.quote_address ?? market.quote_token;
  if (!baseAddress || !quoteAddress) return null;
  return {
    symbol: market.symbol ?? market.display_pair ?? `${market.base_symbol}/${market.quote_symbol}`,
    baseSymbol: market.base_symbol,
    quoteSymbol: market.quote_symbol,
    baseAddress: baseAddress.toLowerCase() as Address,
    quoteAddress: quoteAddress.toLowerCase() as Address,
  };
}

/** Resolve a symbol or address to a registered currency. */
export function resolveCurrency(tokens: Currency[], ref: string): Currency {
  const trimmed = ref.trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    const lower = trimmed.toLowerCase();
    const hit = tokens.find((t) => t.address === lower);
    if (hit) return hit;
    throw new SeraQuoteValidationError("unsupported_token", `Token address ${trimmed} is not in Sera's /tokens registry`, { field: "token" });
  }
  const upper = trimmed.toUpperCase();
  const bySymbol = tokens.find((t) => t.symbol.toUpperCase() === upper);
  if (bySymbol) return bySymbol;
  throw new SeraQuoteValidationError("unsupported_token", `"${ref}" is not a Sera token symbol or address`, { field: "token" });
}

export function toGiftQuote(args: {
  network: SeraNetwork;
  deployment: DeploymentConfig;
  validated: ValidatedSwapQuote;
  from: Currency;
  to: Currency;
  fromAmountRaw: string;
  gasMode: GasMode;
  serverTime: number;
}): GiftQuote {
  const { validated } = args;
  return {
    quoteId: validated.uuid,
    network: args.network,
    chainId: args.deployment.chainId,
    gasMode: args.gasMode,
    giver: validated.routeParams.taker,
    recipient: validated.routeParams.recipient,
    from: args.from,
    to: args.to,
    fromAmountRaw: args.fromAmountRaw,
    maxInputRaw: validated.routeParams.maxInputAmount,
    minOutputRaw: validated.routeParams.minOutputAmount,
    initialDepositRaw: validated.routeParams.initialDepositAmount,
    routeParams: validated.routeParams,
    feeBreakdown: validated.feeBreakdown,
    serverTime: args.serverTime,
    expiresAt: validated.expiresAt,
    deadline: Number(validated.routeParams.deadline),
    authorization: validated.permit?.authorizationKind ?? "none",
    permit: validated.permit,
    eip712Domain: args.deployment.eip712Domain,
  };
}

/**
 * Pure. Turns a validated quote into the typed data the giver's wallet signs.
 * `route_params` are passed through unchanged (addresses lowercased, which
 * does not alter the EIP-712 hash); nothing is regenerated client-side.
 */
export function buildSigningRequest(quote: GiftQuote): SigningRequest {
  const rp = quote.routeParams;
  const intent: IntentTypedData = {
    domain: {
      name: quote.eip712Domain.name,
      version: quote.eip712Domain.version,
      chainId: quote.eip712Domain.chainId,
      verifyingContract: quote.eip712Domain.verifyingContract,
    },
    types: INTENT_TYPES,
    primaryType: "Intent",
    message: {
      taker: rp.taker,
      inputToken: rp.inputToken,
      outputToken: rp.outputToken,
      maxInputAmount: BigInt(rp.maxInputAmount),
      minOutputAmount: BigInt(rp.minOutputAmount),
      recipient: rp.recipient,
      initialDepositAmount: BigInt(rp.initialDepositAmount),
      uuid: BigInt(rp.uuid),
      deadline: Number(rp.deadline),
    },
  };
  const permitData = quote.permit?.typedData;
  if (quote.authorization !== "permit" || !permitData) return { intent };
  const permit: PermitTypedData = {
    domain: { ...permitData.domain },
    types: PERMIT_TYPES,
    primaryType: "Permit",
    message: {
      owner: permitData.message.owner,
      spender: permitData.message.spender,
      value: BigInt(permitData.message.value),
      nonce: BigInt(permitData.message.nonce),
      deadline: BigInt(permitData.message.deadline),
    },
  };
  return { intent, permit };
}

const TERMINAL_FAILURE = new Set(["failed", "cancelled", "canceled"]);
const IN_FLIGHT = new Set(["pending", "matched"]);

/**
 * Normalise a `GET /orders/{trade_id}` body. Identity is always checked
 * against `expectation`; settled orders go through the strict economics
 * validator. Unknown statuses are rejected rather than guessed.
 */
export function normaliseTrackedOrder(order: unknown, expectation: SettlementExpectation): GiftSettlement {
  const identity = validateOrderIdentity(order, expectation);
  const record = order as Record<string, unknown>;
  const errorCode = typeof record.error_code === "string" && record.error_code ? record.error_code.toUpperCase() : null;
  const error = typeof record.error === "string" && record.error ? record.error : null;

  if (IN_FLIGHT.has(identity.status)) {
    return { tradeId: identity.tradeId, state: "pending", status: identity.status, paid: null, received: null, feesPaid: [], errorCode, error, raw: order };
  }
  if (identity.status === "settled") {
    const settled = validateSettledOrder(order, expectation);
    return {
      tradeId: settled.tradeId,
      state: "settled",
      status: "settled",
      txHash: settled.txHash,
      paid: { token: settled.inputTokenAddress, amountRaw: settled.actualPayRaw },
      received: { token: settled.outputTokenAddress, amountRaw: settled.actualReceiveRaw },
      feesPaid: settled.fees,
      errorCode,
      error,
      raw: order,
    };
  }
  if (TERMINAL_FAILURE.has(identity.status)) {
    const summary = record.settlement_summary;
    const reason =
      error ??
      (summary && typeof summary === "object" && typeof (summary as Record<string, unknown>).latest_failed_fill_failure_reason === "string"
        ? ((summary as Record<string, unknown>).latest_failed_fill_failure_reason as string)
        : null);
    return { tradeId: identity.tradeId, state: "failed", status: identity.status, paid: null, received: null, feesPaid: [], errorCode, error: reason, raw: order };
  }
  throw new SeraSettlementValidationError("MALFORMED_ORDER", `Sera order status "${identity.status}" is not a documented external status`, {
    field: "order.status",
    actual: identity.status,
  });
}
