import { describe, expect, it } from "vitest";
import { createSeraClient, decodeErrorBody, parseRetryAfter, SeraApiError, SeraNetworkError } from "../src/client.js";
import { BASE_URL, fakeFetch } from "./helpers.js";

function makeClient(router: Parameters<typeof fakeFetch>[0], opts: { apiKey?: string; apiSecret?: string; timeoutMs?: number } = {}) {
  const sleeps: number[] = [];
  const { fetchImpl, calls } = fakeFetch(router);
  const client = createSeraClient({
    baseUrl: BASE_URL,
    fetch: fetchImpl,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    ...opts,
  });
  return { client, calls, sleeps };
}

describe("auth header", () => {
  it("sends Bearer <key>:<secret> only on auth requests", async () => {
    const { client, calls } = makeClient(() => ({ body: { ok: true } }), { apiKey: "sera_abc", apiSecret: "secret" });
    await client.get("/tokens");
    await client.get("/orders/x", { auth: true });
    expect(calls[0]!.headers.authorization).toBeUndefined();
    expect(calls[1]!.headers.authorization).toBe("Bearer sera_abc:secret");
    expect(calls[1]!.headers.accept).toBe("application/json");
  });

  it("refuses an auth request without credentials before touching the network", async () => {
    const { client, calls } = makeClient(() => ({ body: {} }));
    await expect(client.get("/orders/x", { auth: true })).rejects.toMatchObject({ status: 401, code: "MISSING_CREDENTIALS" });
    expect(calls).toHaveLength(0);
  });
});

describe("retries", () => {
  it("retries GET on 503 honouring Retry-After, then succeeds", async () => {
    const { client, calls, sleeps } = makeClient((_, i) =>
      i === 0 ? { status: 503, body: { detail: "Service temporarily unavailable; please retry" }, headers: { "retry-after": "2" } } : { body: { timestamp: 1 } },
    );
    await expect(client.get("/system/time")).resolves.toEqual({ timestamp: 1 });
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([2000]);
  });

  it("retries GET on a transport failure and gives up after maxRetries", async () => {
    const { client, calls } = makeClient(() => ({ throw: new TypeError("fetch failed") }));
    await expect(client.get("/tokens")).rejects.toBeInstanceOf(SeraNetworkError);
    expect(calls).toHaveLength(3);
  });

  it("does not retry GET on 4xx", async () => {
    const { client, calls } = makeClient(() => ({ status: 404, body: { detail: "Not found" } }));
    await expect(client.get("/orders/nope", { auth: false })).rejects.toMatchObject({ status: 404 });
    expect(calls).toHaveLength(1);
  });

  it("never retries POST /swap, even when asked to", async () => {
    const { client, calls } = makeClient(() => ({ status: 503, body: { detail: "down" }, headers: { "retry-after": "1" } }));
    await expect(client.post("/swap", { uuid: "x" }, { retry: true })).rejects.toMatchObject({ status: 503 });
    expect(calls).toHaveLength(1);
  });

  it("does not retry other POSTs by default but can opt in", async () => {
    const a = makeClient(() => ({ status: 503, body: { detail: "down" } }));
    await expect(a.client.post("/swap/quote", {})).rejects.toMatchObject({ status: 503 });
    expect(a.calls).toHaveLength(1);
    const b = makeClient((_, i) => (i === 0 ? { status: 503, body: { detail: "down" } } : { body: { uuid: "q" } }));
    await expect(b.client.post("/swap/quote", {}, { retry: true })).resolves.toEqual({ uuid: "q" });
    expect(b.calls).toHaveLength(2);
  });
});

describe("error decoding", () => {
  it("maps 410 to QUOTE_STALE", async () => {
    const { client } = makeClient(() => ({ status: 410, body: { detail: "Quote expired" } }));
    const error = await client.post("/swap", {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SeraApiError);
    expect((error as SeraApiError).code).toBe("QUOTE_STALE");
    expect((error as SeraApiError).isQuoteStale).toBe(true);
    expect((error as SeraApiError).message).toBe("Quote expired");
  });

  it("decodes the typed envelope and keeps the body", async () => {
    const body = { detail: { detail: "Swap execution failed", error_code: "NO_LIQUIDITY" } };
    const { client } = makeClient(() => ({ status: 400, body }));
    const error = (await client.post("/swap", {}).catch((e: unknown) => e)) as SeraApiError;
    expect(error).toMatchObject({ status: 400, code: "NO_LIQUIDITY", message: "Swap execution failed", body });
  });

  it("reads detail.code (AMOUNT_BELOW_MIN) and 409 QUOTE_STALE envelopes", () => {
    expect(decodeErrorBody(400, { detail: { code: "AMOUNT_BELOW_MIN", min_amount_raw: "100000" } }, "f").code).toBe("AMOUNT_BELOW_MIN");
    expect(decodeErrorBody(409, { detail: { detail: "stale", error_code: "quote_stale" } }, "f")).toEqual({ code: "QUOTE_STALE", message: "stale" });
    expect(decodeErrorBody(429, { detail: "slow down" }, "f")).toEqual({ code: "RATE_LIMITED", message: "slow down" });
    expect(decodeErrorBody(500, "<html>", "fallback")).toEqual({ code: null, message: "<html>" });
  });

  it("turns a timeout into SeraNetworkError(TIMEOUT)", async () => {
    const { client, calls } = makeClient(() => ({ hang: true }), { timeoutMs: 5 });
    const error = await client.post("/swap", {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SeraNetworkError);
    expect((error as SeraNetworkError).code).toBe("TIMEOUT");
    expect(calls).toHaveLength(1);
  });

  it("refuses redirects", async () => {
    const { client } = makeClient(() => ({ status: 302, body: "", headers: { location: "https://elsewhere.example" } }));
    await expect(client.get("/tokens")).rejects.toMatchObject({ status: 302, code: "REDIRECT_REFUSED" });
  });

  it("parses Retry-After in seconds and caps it", () => {
    expect(parseRetryAfter("1")).toBe(1000);
    expect(parseRetryAfter("60")).toBe(5000);
    expect(parseRetryAfter(undefined)).toBe(1000);
    expect(parseRetryAfter("garbage")).toBe(1000);
  });
});
