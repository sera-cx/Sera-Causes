/**
 * @sera-causes/sera-settlement
 *
 * Protected settlement layer: the only way a Sera Causes deployment reaches
 * Sera Protocol (Sera.cx). Server-side only; API keys never leave the server.
 * See README.md and ARCHITECTURE.md section 8.
 */
import { TtlCache } from "./cache.js";
import { createSeraClient, SeraApiError, type FetchLike } from "./client.js";
import { loadSettlementConfig, type Env, type SeraNetwork, type SettlementConfig } from "./config.js";
import {
  buildSigningRequest,
  clampTtl,
  normaliseMarket,
  normaliseToken,
  normaliseTrackedOrder,
  resolveCurrency,
  toGiftQuote,
  type Currencies,
  type Deployment,
  type FxRate,
  type GiftQuote,
  type GiftSettlement,
  type QuoteGiftInput,
  type SettlementAdapter,
  type SubmitGiftInput,
  type SubmitGiftResult,
} from "./gift.js";
import { createKytClient, kytOptionsFromEnv, type KytClientOptions } from "./kyt.js";
import {
  fxRateSchema,
  healthSchema,
  marketsResponseSchema,
  parseResponse,
  swapExecuteRequestSchema,
  swapExecuteResponseSchema,
  swapQuoteResponseSchema,
  systemTimeSchema,
  tokensResponseSchema,
  trackedOrderSchema,
} from "./types.js";
import {
  assertMinimumInput,
  mapQuoteProviderError,
  SeraQuoteValidationError,
  validateDeploymentConfig,
  validateSwapQuote,
  validateSwapQuoteRequest,
  type SettlementExpectation,
} from "./validate.js";

export * from "./config.js";
export * from "./client.js";
export * from "./types.js";
export * from "./validate.js";
export * from "./gift.js";
export * from "./kyt.js";
export { TtlCache } from "./cache.js";
export * from "./mock.js";

// Cache TTLs (ARCHITECTURE.md section 8 and sera-mcp client.ts).
export const TTL_DEPLOYMENT_MS = 60 * 60_000;
export const TTL_CURRENCIES_MS = 10 * 60_000;
export const TTL_SYSTEM_TIME_MS = 5_000;
export const TTL_FX_MS = 60_000;
/** sera-pay `SERA_SWAP_SUBMIT_TIMEOUT_MS`. */
export const SWAP_SUBMIT_TIMEOUT_MS = 25_000;

export interface SettlementOptions {
  /** Defaults to SERA_NETWORK (mainnet when unset). */
  network?: SeraNetwork;
  /** Explicit base URL (tests / staging). Otherwise resolved from network + env gates. */
  baseUrl?: string;
  /** Default SERA_API_KEY / SERA_API_SECRET. Needed for `getSettlement` only. */
  apiKey?: string;
  apiSecret?: string;
  /** Environment to read; defaults to process.env. */
  env?: Env;
  fetch?: FetchLike;
  /** Millisecond clock, for cache tests. */
  now?: () => number;
  timeoutMs?: number;
  swapTimeoutMs?: number;
  /** Retry back-off; injected by tests. */
  sleep?: (ms: number) => Promise<void>;
  /** KYT overrides; defaults from KYT_* env vars (mode defaults to "stub"). */
  kyt?: Partial<KytClientOptions>;
  onWarn?: (message: string, detail?: Record<string, unknown>) => void;
}

/** Thrown by `submitGift` when Sera answered 2xx but did not accept the swap. */
export class SeraSubmitError extends SeraApiError {
  override readonly name = "SeraSubmitError";
  constructor(
    /** "rejected": Sera said success=false (safe to re-quote). "indeterminate": response unusable; do NOT resubmit, reconcile by Intent hash. */
    readonly outcome: "rejected" | "indeterminate",
    code: string | null,
    message: string,
    body: unknown,
  ) {
    super(200, code, message, body);
  }
}

export function createSettlement(options: SettlementOptions = {}): SettlementAdapter {
  const env = options.env ?? (process.env as Env);
  const config: SettlementConfig = loadSettlementConfig({
    env,
    network: options.network,
    baseUrl: options.baseUrl,
    apiKey: options.apiKey,
    apiSecret: options.apiSecret,
    onWarn: options.onWarn,
  });
  const now = options.now ?? Date.now;
  const client = createSeraClient({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
    fetch: options.fetch,
    timeoutMs: options.timeoutMs,
    sleep: options.sleep,
  });
  const kyt = createKytClient({
    ...kytOptionsFromEnv(env),
    fetch: options.fetch,
    now,
    ...options.kyt,
  });

  const deploymentCache = new TtlCache<Deployment>(TTL_DEPLOYMENT_MS, now);
  const currenciesCache = new TtlCache<Currencies>(TTL_CURRENCIES_MS, now);
  const timeCache = new TtlCache<{ timestamp: number; fetchedAt: number }>(TTL_SYSTEM_TIME_MS, now);
  const fxCache = new TtlCache<FxRate>(TTL_FX_MS, now);

  async function getDeployment(opts: { fresh?: boolean } = {}): Promise<Deployment> {
    return deploymentCache.get(
      "_",
      async () => {
        // Settled, not all-or-nothing: /config stays up during partial startup
        // while /health may 503. A health outage must not discard good contract
        // addresses (sera-pay getSeraSystemSnapshot).
        const [configResult, healthResult] = await Promise.allSettled([client.get("/config"), client.get("/health")]);
        if (configResult.status === "rejected") throw configResult.reason;
        const deployment = validateDeploymentConfig(configResult.value, config.chainId);
        let health: Deployment["health"] = { healthy: false, status: null, executorId: null, signatureReady: null };
        if (healthResult.status === "fulfilled") {
          const parsed = healthSchema.safeParse(healthResult.value);
          if (parsed.success) {
            health = {
              healthy: parsed.data.status === "healthy",
              status: parsed.data.status,
              executorId: parsed.data.executor_id ?? null,
              signatureReady: parsed.data.signature_ready ?? null,
            };
          }
        }
        return { ...deployment, network: config.network, health, fetchedAt: now() };
      },
      opts,
    );
  }

  async function listCurrencies(opts: { fresh?: boolean } = {}): Promise<Currencies> {
    return currenciesCache.get(
      "_",
      async () => {
        const [tokensRaw, marketsRaw] = await Promise.all([client.get("/tokens"), client.get("/markets")]);
        const tokens = parseResponse(tokensResponseSchema, "GET /tokens", tokensRaw).tokens.map(normaliseToken);
        const markets = parseResponse(marketsResponseSchema, "GET /markets", marketsRaw)
          .markets.map(normaliseMarket)
          .filter((m): m is NonNullable<typeof m> => m !== null);
        return { chainId: config.chainId, tokens, markets, fetchedAt: now() };
      },
      opts,
    );
  }

  /** Sera server time in seconds; the cached stamp is advanced by local elapsed time. */
  async function serverTime(): Promise<number> {
    const entry = await timeCache.get("_", async () => {
      const raw = await client.get("/system/time");
      const { timestamp } = parseResponse(systemTimeSchema, "GET /system/time", raw);
      return { timestamp, fetchedAt: now() };
    });
    return entry.timestamp + Math.floor((now() - entry.fetchedAt) / 1000);
  }

  async function quoteGift(input: QuoteGiftInput): Promise<GiftQuote> {
    const [deployment, currencies] = await Promise.all([getDeployment(), listCurrencies()]);
    const from = resolveCurrency(currencies.tokens, input.fromToken);
    const to = resolveCurrency(currencies.tokens, input.toToken);
    if (from.address === to.address) {
      throw new SeraQuoteValidationError("invalid_request", "A gift swap needs different input and output tokens", { field: "toToken" });
    }
    const fromAmountRaw = typeof input.fromAmountRaw === "bigint" ? input.fromAmountRaw.toString() : String(input.fromAmountRaw).trim();
    assertMinimumInput(fromAmountRaw, from.minTradeAmountRaw, { symbol: from.symbol });

    const gasMode = input.gasMode ?? "receive_less";
    // Sera requires deadlines to be based on GET /system/time (phone clocks drift).
    const time = await serverTime();
    const ttl = clampTtl(input.ttlSeconds);
    const request = validateSwapQuoteRequest(
      {
        from_token: from.address,
        to_token: to.address,
        from_amount: fromAmountRaw,
        owner_address: input.giver,
        recipient: input.recipient,
        expiration: time + ttl,
        gas_mode: gasMode,
      },
      { serverTime: time, expectedGasMode: gasMode },
    );

    let raw: unknown;
    try {
      // A quote that is minted upstream but lost in transit is harmless (it
      // simply expires), so transient failures may be retried here.
      raw = await client.post("/swap/quote", request, { retry: true });
    } catch (error) {
      throw mapQuoteProviderError(error) ?? error;
    }
    parseResponse(swapQuoteResponseSchema, "POST /swap/quote", raw);
    const validated = validateSwapQuote(raw, { request, config: deployment, serverTime: time });
    return toGiftQuote({ network: config.network, deployment, validated, from, to, fromAmountRaw, gasMode, serverTime: time });
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
    const body = parsed.data;
    // Never retried: the client refuses retries on POST /swap regardless of options.
    const raw = await client.post("/swap", body, { retry: false, timeoutMs: options.swapTimeoutMs ?? SWAP_SUBMIT_TIMEOUT_MS });
    const result = swapExecuteResponseSchema.safeParse(raw);
    if (!result.success) {
      throw new SeraSubmitError("indeterminate", "INDETERMINATE_SUBMISSION", "Sera returned an unreadable swap submission response; reconcile before resubmitting", raw);
    }
    const r = result.data;
    const tradeId = typeof r.trade_id === "string" && r.trade_id.trim() ? r.trade_id.trim() : null;
    if (r.success === false) {
      const code = r.error_code ? r.error_code.toUpperCase() : "SWAP_REJECTED";
      const message = r.error ?? r.message ?? "Sera declined the swap";
      throw new SeraSubmitError("rejected", code, message, raw);
    }
    if (r.success !== true || !tradeId) {
      // A 2xx that does not satisfy the documented success shape cannot prove
      // rejection; the caller must reconcile by Intent hash, not resubmit.
      throw new SeraSubmitError("indeterminate", "INDETERMINATE_SUBMISSION", "Sera returned an indeterminate swap submission response", raw);
    }
    return {
      tradeId,
      status: (r.status ?? "pending").toLowerCase(),
      feeBreakdown: r.fee_breakdown
        ? { gasCostUsd: r.fee_breakdown.gas_cost_usd ?? null, gasCostFromToken: r.fee_breakdown.gas_cost_from_token ?? null }
        : null,
      raw,
    };
  }

  async function getSettlement(tradeId: string, expectation: Omit<SettlementExpectation, "tradeId"> = {}): Promise<GiftSettlement> {
    const raw = await client.get(`/orders/${encodeURIComponent(tradeId)}`, { auth: true });
    parseResponse(trackedOrderSchema, "GET /orders/{trade_id}", raw);
    return normaliseTrackedOrder(raw, { ...expectation, tradeId });
  }

  async function fxRate(from: string, to: string): Promise<FxRate> {
    const base = from.trim().toUpperCase();
    const quote = to.trim().toUpperCase();
    if (!/^[A-Z]{3,8}$/.test(base) || !/^[A-Z]{3,8}$/.test(quote)) {
      throw new SeraQuoteValidationError("invalid_request", "fxRate expects ISO currency codes", { field: "pair" });
    }
    const pair = `${base}/${quote}`;
    if (base === quote) {
      return { pair, base, quote, rate: "1", asOf: null, rate24hAgo: "1", changePct: "0", fetchedAt: now() };
    }
    return fxCache.get(pair, async () => {
      const raw = await client.get("/fx/rate", { query: { base, quote } });
      const r = parseResponse(fxRateSchema, "GET /fx/rate", raw);
      const rate = Number(r.rate);
      if (!Number.isFinite(rate) || rate <= 0) {
        throw new SeraQuoteValidationError("invalid_quote", `Sera /fx/rate returned a non-positive rate for ${pair}`, { field: "rate" });
      }
      return {
        pair: r.pair ?? pair,
        base,
        quote,
        rate: r.rate,
        asOf: r.as_of ?? null,
        rate24hAgo: r.rate_24h_ago ?? null,
        changePct: r.change_pct ?? r.change_24h ?? null,
        fetchedAt: now(),
      };
    });
  }

  return {
    network: config.network,
    chainId: config.chainId,
    baseUrl: config.baseUrl,
    getDeployment,
    listCurrencies,
    quoteGift,
    buildSigningRequest,
    submitGift,
    getSettlement,
    screenAddress: (address, checkType) => kyt.screen({ address, checkType }),
    fxRate,
  };
}
