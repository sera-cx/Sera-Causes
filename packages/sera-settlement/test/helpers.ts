import { privateKeyToAccount } from "viem/accounts";
import type { FetchLike } from "../src/client.js";
import { PERMIT_TYPES } from "../src/gift.js";

export interface RecordedCall {
  method: string;
  url: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  headers: Record<string, string>;
}

export interface Reply {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  /** Simulate a transport failure instead of answering. */
  throw?: Error;
  /** Never resolve until the request is aborted (timeout tests). */
  hang?: boolean;
}

export type Router = (call: RecordedCall, index: number) => Reply | undefined;

/** Fetch stub that records every call and answers from a router function. */
export function fakeFetch(router: Router): { fetchImpl: FetchLike; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    const url = new URL(input);
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init.headers ?? {}) as Record<string, string>)) headers[k.toLowerCase()] = v;
    const call: RecordedCall = {
      method: init.method ?? "GET",
      url: input,
      path: url.pathname,
      query: url.searchParams,
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      headers,
    };
    calls.push(call);
    const reply = router(call, calls.length - 1) ?? { status: 404, body: { detail: `no route for ${call.method} ${call.path}` } };
    if (reply.hang) {
      await new Promise<never>((_, reject) => {
        init.signal?.addEventListener("abort", () => {
          const err = new Error("This operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    }
    if (reply.throw) throw reply.throw;
    const status = reply.status ?? 200;
    const text = reply.body === undefined ? "" : typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body);
    return new Response(text, { status, headers: { "content-type": "application/json", ...(reply.headers ?? {}) } });
  };
  return { fetchImpl, calls };
}

// ---- fixtures ---------------------------------------------------------------

export const CHAIN_ID = 11_155_111;
export const BASE_URL = "https://api.testnet.sera.cx/api/v1";
export const SERA = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa01";
export const VAULT = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa02";
export const SOR = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa03";
export const USDC = "0x1111111111111111111111111111111111111111";
export const XSGD = "0x2222222222222222222222222222222222222222";
export const RECIPIENT = "0x8888888888888888888888888888888888888888";
export const SERVER_TIME = 1_800_000_000;
export const QUOTE_UUID = "6d0ad60d-c5d5-4b71-b0ca-9e8d2ae1bca4";

export const giverAccount = privateKeyToAccount(`0x${"01".repeat(32)}`);
export const GIVER = giverAccount.address.toLowerCase() as `0x${string}`;

export const configBody = () => ({
  chain_id: CHAIN_ID,
  sera_address: SERA,
  vault_address: VAULT,
  sor_address: SOR,
  domain_separator: `0x${"ab".repeat(32)}`,
  eip712_domain: { name: "Sera", version: "1", chainId: CHAIN_ID, verifyingContract: SERA },
  limits: { vl_batch: { min: 2, max: 50 } },
});

export const healthBody = () => ({ status: "healthy", version: "v1", executor_id: 0, relayer_executor_id: 0, signature_ready: true });

export const tokensBody = () => ({
  tokens: [
    { currency: "USD", symbol: "USDC", address: USDC, decimals: 6, min_trade_amount_raw: "100000", min_trade_amount: "0.100000" },
    { currency: "SGD", symbol: "XSGD", address: XSGD, decimals: 6, min_trade_amount_raw: "100000", min_trade_amount: "0.100000" },
  ],
});

export const marketsBody = () => ({
  markets: [
    {
      symbol: "USDC/XSGD",
      base_symbol: "USDC",
      quote_symbol: "XSGD",
      base_address: USDC,
      quote_address: XSGD,
      tick_precision: 6,
      quantity_precision: 6,
      base_decimals: 6,
      quote_decimals: 6,
      min_ask_amount_raw: "100000",
      min_bid_quote_amount_raw: "100000",
    },
  ],
});

export function quoteBody(overrides: { route?: Record<string, unknown>; permit?: Record<string, unknown> | null; expiration?: number; top?: Record<string, unknown> } = {}) {
  const expiration = overrides.expiration ?? SERVER_TIME + 120;
  const permitDomain = { name: "USD Coin", version: "2", chainId: CHAIN_ID, verifyingContract: USDC };
  const basePermit = {
    permit_supported: true,
    permit_required: true,
    token: USDC,
    spender: SOR,
    owner: GIVER,
    value_raw: "1000000",
    current_allowance_raw: "0",
    nonce: 4,
    suggested_deadline: expiration,
    domain: permitDomain,
    eip712: {
      domain: permitDomain,
      primaryType: "Permit",
      types: { Permit: PERMIT_TYPES.Permit.map((f) => ({ ...f })) },
      message: { owner: GIVER, spender: SOR, value: "1000000", nonce: 4, deadline: expiration },
    },
  };
  const permit = overrides.permit === null ? null : deepMerge(basePermit, overrides.permit ?? {});
  return {
    uuid: QUOTE_UUID,
    route_params: {
      taker: GIVER,
      inputToken: USDC,
      outputToken: XSGD,
      maxInputAmount: "1000000",
      minOutputAmount: "1330000",
      recipient: RECIPIENT,
      initialDepositAmount: "1000000",
      uuid: "6431994229952211760403847975151123456789012345678901234567",
      deadline: expiration,
      ...(overrides.route ?? {}),
    },
    fee_breakdown: { gas_cost_usd: "0.12", gas_cost_from_token: "0.120000" },
    expires_at: SERVER_TIME + 30,
    permit,
    ...(overrides.top ?? {}),
  };
}

function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    const current = out[k];
    if (v && typeof v === "object" && !Array.isArray(v) && current && typeof current === "object" && !Array.isArray(current)) {
      out[k] = deepMerge(current as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Default router serving the public Sera endpoints from fixtures. */
export function seraRouter(extra: Router = () => undefined, quote: () => unknown = () => quoteBody()): Router {
  return (call, index) => {
    const handled = extra(call, index);
    if (handled) return handled;
    if (call.method === "GET" && call.path.endsWith("/config")) return { body: configBody() };
    if (call.method === "GET" && call.path.endsWith("/health")) return { body: healthBody() };
    if (call.method === "GET" && call.path.endsWith("/tokens")) return { body: tokensBody() };
    if (call.method === "GET" && call.path.endsWith("/markets")) return { body: marketsBody() };
    if (call.method === "GET" && call.path.endsWith("/system/time")) return { body: { timestamp: SERVER_TIME } };
    if (call.method === "POST" && call.path.endsWith("/swap/quote")) return { body: quote() };
    return undefined;
  };
}

export const TRADE_ID = "85c92fcb-21b9-43ba-bb36-01d7b21eaa8d";
export const TX_HASH = `0x${"cd".repeat(32)}`;

export function orderBody(overrides: Record<string, unknown> = {}) {
  return {
    trade_id: TRADE_ID,
    owner_address: GIVER,
    status: "settled",
    order_type: "swap",
    from_token: USDC,
    to_token: XSGD,
    from_amount: "1000000",
    to_amount: "1330000",
    error: null,
    error_code: null,
    settlement_summary: { status: "settled", total_fill_count: 1, latest_tx_hash: TX_HASH },
    settlement_economics: {
      perspective_order_id: TRADE_ID,
      gross_debits: [{ token: "USDC", token_address: USDC, amount: "1.0", amount_raw: "1000000" }],
      gross_credits: [{ token: "XSGD", token_address: XSGD, amount: "1.34", amount_raw: "1340000" }],
      balance_debits: [{ token: "USDC", token_address: USDC, amount: "1.0", amount_raw: "1000000" }],
      balance_credits: [{ token: "XSGD", token_address: XSGD, amount: "1.33", amount_raw: "1330000" }],
      fees_paid: [{ type: "gas", token: "XSGD", token_address: XSGD, amount: "0.01", amount_raw: "10000" }],
    },
    ...overrides,
  };
}
