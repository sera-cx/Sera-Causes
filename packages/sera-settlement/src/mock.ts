/**
 * In-memory stand-in for Sera.cx with the same `SettlementAdapter` interface.
 *
 * Deterministic: a quote converts 1:1 minus 10 bps (adjusted for decimals),
 * quote ids derive from the request, and a submitted gift reports `pending`
 * for `settleAfterPolls` polls before settling. Mock responses are built in
 * Sera's wire shape and run through the same validators as live traffic, so
 * the mock cannot drift from what the live path accepts.
 */
import { keccak256, stringToHex } from "viem";
import { SeraApiError } from "./client.js";
import { SERA_CHAIN_IDS, type SeraNetwork } from "./config.js";
import {
  buildSigningRequest,
  clampTtl,
  normaliseTrackedOrder,
  PERMIT_TYPES,
  resolveCurrency,
  toGiftQuote,
  type Currencies,
  type Currency,
  type Deployment,
  type FxRate,
  type GiftQuote,
  type GiftSettlement,
  type Market,
  type QuoteGiftInput,
  type SettlementAdapter,
  type SubmitGiftInput,
  type SubmitGiftResult,
} from "./gift.js";
import { createKytClient } from "./kyt.js";
import { swapExecuteRequestSchema, type Address, type Hex } from "./types.js";
import {
  assertMinimumInput,
  SeraQuoteValidationError,
  validateDeploymentConfig,
  validateSwapQuote,
  validateSwapQuoteRequest,
  type SettlementExpectation,
} from "./validate.js";

export const MOCK_TOKENS: readonly Currency[] = Object.freeze([
  { symbol: "USDC", address: "0x1000000000000000000000000000000000000001", decimals: 6, currency: "USD", name: "USD Coin (mock)", minTradeAmountRaw: "100000" },
  { symbol: "USDT", address: "0x1000000000000000000000000000000000000002", decimals: 6, currency: "USD", name: "Tether USD (mock)", minTradeAmountRaw: "100000" },
  { symbol: "XSGD", address: "0x1000000000000000000000000000000000000003", decimals: 6, currency: "SGD", name: "XSGD (mock)", minTradeAmountRaw: "100000" },
  { symbol: "MYRT", address: "0x1000000000000000000000000000000000000004", decimals: 6, currency: "MYR", name: "MYRT (mock)", minTradeAmountRaw: "100000" },
  { symbol: "EURC", address: "0x1000000000000000000000000000000000000005", decimals: 6, currency: "EUR", name: "Euro Coin (mock)", minTradeAmountRaw: "100000" },
] satisfies Currency[]);

export const MOCK_ADDRESSES = Object.freeze({
  sera: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa01" as Address,
  vault: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa02" as Address,
  sor: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa03" as Address,
  /** Screens as sanctioned. */
  flagged: "0x0000000000000000000000000000000000000bad" as Address,
});

/** Units of each currency per 1 USD. */
export const MOCK_FX_PER_USD: Readonly<Record<string, string>> = Object.freeze({
  USD: "1",
  SGD: "1.34",
  MYR: "4.20",
  EUR: "0.92",
});

export const MOCK_SPREAD_BPS = 10n;

export interface MockSettlementOptions {
  network?: SeraNetwork;
  now?: () => number;
  tokens?: Currency[];
  /** Addresses that screen as "flagged". Default: MOCK_ADDRESSES.flagged. */
  flaggedAddresses?: string[];
  /** Number of `getSettlement` calls that report "pending" before settling. Default 1. */
  settleAfterPolls?: number;
  fxPerUsd?: Record<string, string>;
  /** Forwarded to the stub KYT client. */
  kytFailClosed?: boolean;
  kytSimulateOutage?: boolean;
}

function uuidFromHash(hash: Hex): string {
  const h = hash.slice(2);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function scale(amount: bigint, fromDecimals: number, toDecimals: number): bigint {
  if (toDecimals >= fromDecimals) return amount * 10n ** BigInt(toDecimals - fromDecimals);
  return amount / 10n ** BigInt(fromDecimals - toDecimals);
}

/** 1:1 minus MOCK_SPREAD_BPS, decimals adjusted. Exported so tests and the UI can show the formula. */
export function mockMinOutput(fromAmountRaw: bigint, from: Currency, to: Currency): bigint {
  return (scale(fromAmountRaw, from.decimals, to.decimals) * (10_000n - MOCK_SPREAD_BPS)) / 10_000n;
}

export function createMockSettlement(options: MockSettlementOptions = {}): SettlementAdapter {
  const network = options.network ?? "sepolia";
  const chainId = SERA_CHAIN_IDS[network];
  const now = options.now ?? Date.now;
  const tokens = (options.tokens ?? [...MOCK_TOKENS]).map((t) => ({ ...t, address: t.address.toLowerCase() as Address }));
  const flagged = new Set((options.flaggedAddresses ?? [MOCK_ADDRESSES.flagged]).map((a) => a.toLowerCase()));
  const settleAfterPolls = options.settleAfterPolls ?? 1;
  const fxPerUsd = options.fxPerUsd ?? MOCK_FX_PER_USD;

  const deployment = validateDeploymentConfig(
    {
      chain_id: chainId,
      sera_address: MOCK_ADDRESSES.sera,
      vault_address: MOCK_ADDRESSES.vault,
      sor_address: MOCK_ADDRESSES.sor,
      domain_separator: null,
      eip712_domain: { name: "Sera", version: "1", chainId, verifyingContract: MOCK_ADDRESSES.sera },
    },
    chainId,
  );

  const markets: Market[] = tokens
    .filter((t) => t.symbol !== "USDC")
    .map((t) => {
      const usdc = tokens.find((u) => u.symbol === "USDC") ?? tokens[0]!;
      const [base, quote] = t.address < usdc.address ? [t, usdc] : [usdc, t];
      return { symbol: `${base.symbol}/${quote.symbol}`, baseSymbol: base.symbol, quoteSymbol: quote.symbol, baseAddress: base.address, quoteAddress: quote.address };
    });

  const quotes = new Map<string, GiftQuote>();
  const orders = new Map<string, { quote: GiftQuote; polls: number }>();
  const seconds = () => Math.floor(now() / 1000);

  async function quoteGift(input: QuoteGiftInput): Promise<GiftQuote> {
    const from = resolveCurrency(tokens, input.fromToken);
    const to = resolveCurrency(tokens, input.toToken);
    if (from.address === to.address) {
      throw new SeraQuoteValidationError("invalid_request", "A gift swap needs different input and output tokens", { field: "toToken" });
    }
    const fromAmountRaw = typeof input.fromAmountRaw === "bigint" ? input.fromAmountRaw.toString() : String(input.fromAmountRaw).trim();
    assertMinimumInput(fromAmountRaw, from.minTradeAmountRaw, { symbol: from.symbol });
    const gasMode = input.gasMode ?? "receive_less";
    const serverTime = seconds();
    const expiration = serverTime + clampTtl(input.ttlSeconds);
    const request = validateSwapQuoteRequest(
      { from_token: from.address, to_token: to.address, from_amount: fromAmountRaw, owner_address: input.giver, recipient: input.recipient, expiration, gas_mode: gasMode },
      { serverTime, expectedGasMode: gasMode },
    );
    const amount = BigInt(request.from_amount);
    const minOutput = mockMinOutput(amount, from, to);
    const hash = keccak256(stringToHex(`${request.from_token}|${request.to_token}|${request.from_amount}|${request.owner_address}|${request.recipient}|${expiration}`));
    const uuid = uuidFromHash(hash);
    const routeUuid = (BigInt(`0x${hash.slice(34)}`) + 1n).toString();
    const permitDomain = { name: from.symbol, version: "1", chainId, verifyingContract: from.address };
    const raw = {
      uuid,
      route_params: {
        taker: request.owner_address,
        inputToken: request.from_token,
        outputToken: request.to_token,
        maxInputAmount: request.from_amount,
        minOutputAmount: minOutput.toString(),
        recipient: request.recipient,
        initialDepositAmount: request.from_amount,
        uuid: routeUuid,
        deadline: expiration,
      },
      fee_breakdown: { gas_cost_usd: "0.01", gas_cost_from_token: "0.010000" },
      expires_at: serverTime + 30,
      permit: {
        permit_supported: true,
        permit_required: true,
        token: request.from_token,
        spender: MOCK_ADDRESSES.sor,
        owner: request.owner_address,
        value_raw: request.from_amount,
        current_allowance_raw: "0",
        nonce: 0,
        suggested_deadline: expiration,
        domain: permitDomain,
        eip712: {
          domain: permitDomain,
          primaryType: "Permit",
          types: { Permit: PERMIT_TYPES.Permit.map((f) => ({ ...f })) },
          message: { owner: request.owner_address, spender: MOCK_ADDRESSES.sor, value: request.from_amount, nonce: 0, deadline: expiration },
        },
      },
    };
    const validated = validateSwapQuote(raw, { request, config: deployment, serverTime });
    const quote = toGiftQuote({ network, deployment, validated, from, to, fromAmountRaw, gasMode, serverTime });
    quotes.set(quote.quoteId, quote);
    return quote;
  }

  async function submitGift(input: SubmitGiftInput): Promise<SubmitGiftResult> {
    const parsed = swapExecuteRequestSchema.safeParse({
      uuid: input.uuid,
      signature: input.signature,
      permit_signature: input.permitSignature,
      permit_deadline: input.permitDeadline,
    });
    if (!parsed.success) {
      throw new SeraQuoteValidationError("invalid_request", parsed.error.issues.map((i) => i.message).join("; "), { field: "submit" });
    }
    const quote = quotes.get(parsed.data.uuid.toLowerCase());
    if (!quote || quote.expiresAt <= seconds()) {
      throw new SeraApiError(410, "QUOTE_STALE", "Quote expired, already consumed, or not found", { detail: "Quote expired, already consumed, or not found" });
    }
    if (quote.authorization === "permit" && parsed.data.permit_signature === undefined) {
      throw new SeraApiError(400, "INVALID_REQUEST", "Missing required permit fields", { detail: "Missing required permit fields" });
    }
    quotes.delete(quote.quoteId);
    const tradeId = `mock-${quote.quoteId}`;
    orders.set(tradeId, { quote, polls: 0 });
    const raw = { success: true, trade_id: tradeId, status: "pending", fee_breakdown: { gas_cost_usd: quote.feeBreakdown.gasCostUsd, gas_cost_from_token: quote.feeBreakdown.gasCostFromToken } };
    return { tradeId, status: "pending", feeBreakdown: { gasCostUsd: quote.feeBreakdown.gasCostUsd, gasCostFromToken: quote.feeBreakdown.gasCostFromToken }, raw };
  }

  async function getSettlement(tradeId: string, expectation: Omit<SettlementExpectation, "tradeId"> = {}): Promise<GiftSettlement> {
    const order = orders.get(tradeId);
    if (!order) throw new SeraApiError(404, "NOT_FOUND", "Order not found", { detail: "Order not found" });
    order.polls += 1;
    const settled = order.polls > settleAfterPolls;
    const q = order.quote;
    const feeRaw = BigInt(q.maxInputRaw) / 10_000n;
    const raw = {
      trade_id: tradeId,
      owner_address: q.giver,
      status: settled ? "settled" : "pending",
      order_type: "swap",
      from_token: q.from.address,
      to_token: q.to.address,
      from_amount: q.maxInputRaw,
      to_amount: q.minOutputRaw,
      error: null,
      error_code: null,
      settlement_summary: settled ? { status: "settled", latest_tx_hash: keccak256(stringToHex(tradeId)) } : null,
      settlement_economics: settled
        ? {
            perspective_order_id: tradeId,
            balance_debits: [{ token: q.from.symbol, token_address: q.from.address, amount_raw: q.maxInputRaw }],
            balance_credits: [{ token: q.to.symbol, token_address: q.to.address, amount_raw: q.minOutputRaw }],
            fees_paid: feeRaw > 0n ? [{ type: "gas", token: q.from.symbol, token_address: q.from.address, amount_raw: feeRaw.toString() }] : [],
          }
        : null,
    };
    return normaliseTrackedOrder(raw, { ...expectation, tradeId });
  }

  const kyt = createKytClient({
    mode: "stub",
    flagged: [...flagged],
    failClosed: options.kytFailClosed,
    simulateOutage: options.kytSimulateOutage,
    now,
  });

  async function fxRate(from: string, to: string): Promise<FxRate> {
    const base = from.trim().toUpperCase();
    const quote = to.trim().toUpperCase();
    const pair = `${base}/${quote}`;
    const fetchedAt = now();
    if (base === quote) return { pair, base, quote, rate: "1", asOf: null, rate24hAgo: "1", changePct: "0", fetchedAt };
    const basePerUsd = fxPerUsd[base];
    const quotePerUsd = fxPerUsd[quote];
    if (!basePerUsd || !quotePerUsd) {
      throw new SeraApiError(503, "NO_FX_DATA", `No provider data for ${pair}`, { detail: `No provider data for ${pair}` });
    }
    const rate = (Number(quotePerUsd) / Number(basePerUsd)).toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
    return { pair, base, quote, rate, asOf: Math.floor(fetchedAt / 1000), rate24hAgo: rate, changePct: "0", fetchedAt };
  }

  return {
    network,
    chainId,
    baseUrl: "mock://sera",
    getDeployment: async (): Promise<Deployment> => ({
      ...deployment,
      network,
      health: { healthy: true, status: "healthy", executorId: 0, signatureReady: true },
      fetchedAt: now(),
    }),
    listCurrencies: async (): Promise<Currencies> => ({ chainId, tokens: tokens.map((t) => ({ ...t })), markets: markets.map((m) => ({ ...m })), fetchedAt: now() }),
    quoteGift,
    buildSigningRequest,
    submitGift,
    getSettlement,
    screenAddress: (address, checkType) => kyt.screen({ address, checkType }),
    fxRate,
  };
}
