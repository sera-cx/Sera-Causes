import { describe, expect, it } from "vitest";
import { createKytClient, createSettlement, KYT_UNAVAILABLE_REASON, kytOptionsFromEnv } from "../src/index.js";
import { BASE_URL, GIVER, fakeFetch, type Reply } from "./helpers.js";

const NOW = 1_800_000_000_000;

describe("createKytClient (stub)", () => {
  it("clears every address except the flagged list, case-insensitively", async () => {
    const kyt = createKytClient({ mode: "stub", flagged: [GIVER.toUpperCase().replace("0X", "0x")], now: () => NOW });
    expect(await kyt.screen({ address: GIVER, checkType: "giver" })).toEqual({ state: "flagged", reasons: ["stub_flagged_list"], checkedAt: NOW });
    expect(await kyt.screen({ address: "0x9999999999999999999999999999999999999999", checkType: "voter" })).toEqual({ state: "clear", reasons: [], checkedAt: NOW });
  });

  it("fails open on a simulated outage by default", async () => {
    const kyt = createKytClient({ mode: "stub", simulateOutage: true, now: () => NOW });
    const result = await kyt.screen({ address: GIVER, checkType: "lister" });
    expect(result.state).toBe("unavailable");
    expect(result.reasons).toContain(KYT_UNAVAILABLE_REASON);
  });

  it("fails closed on a simulated outage when failClosed is set", async () => {
    const kyt = createKytClient({ mode: "stub", simulateOutage: true, failClosed: true, now: () => NOW });
    const result = await kyt.screen({ address: GIVER, checkType: "payout" });
    expect(result.state).toBe("flagged");
    expect(result.reasons).toEqual([KYT_UNAVAILABLE_REASON, "simulated_outage"]);
  });

  it("flags a malformed address without calling anything", async () => {
    const kyt = createKytClient({ mode: "stub" });
    expect((await kyt.screen({ address: "not-an-address", checkType: "giver" })).state).toBe("flagged");
  });
});

function live(reply: Reply | undefined, opts: { apiKey?: string; failClosed?: boolean; baseUrl?: string; timeoutMs?: number } = {}) {
  const { fetchImpl, calls } = fakeFetch(() => reply);
  const kyt = createKytClient({ mode: "live", apiKey: "apiKey" in opts ? opts.apiKey : "kyt-key", fetch: fetchImpl, now: () => NOW, ...opts });
  return { kyt, calls };
}

describe("createKytClient (live, provisional wire format)", () => {
  it("POSTs { address, check_type } to /api/v1/screen with a bearer token and maps { data: { state, reasons } }", async () => {
    const { kyt, calls } = live({ body: { data: { state: "flagged", reasons: ["sanctions_list"] } } });
    const result = await kyt.screen({ address: GIVER, checkType: "giver" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url).toBe("https://kyt.sera.cx/api/v1/screen");
    expect(calls[0]!.headers.authorization).toBe("Bearer kyt-key");
    expect(calls[0]!.body).toEqual({ address: GIVER, check_type: "giver" });
    expect(result).toEqual({ state: "flagged", reasons: ["sanctions_list"], checkedAt: NOW });
  });

  it("returns clear with no reasons and honours a custom base URL without a key", async () => {
    const { kyt, calls } = live({ body: { data: { state: "clear", reasons: ["ignored"] } } }, { apiKey: undefined, baseUrl: "https://kyt.staging.sera.cx/" });
    expect(await kyt.screen({ address: GIVER, checkType: "voter" })).toEqual({ state: "clear", reasons: [], checkedAt: NOW });
    expect(calls[0]!.url).toBe("https://kyt.staging.sera.cx/api/v1/screen");
    expect(calls[0]!.headers.authorization).toBeUndefined();
  });

  it("treats non-2xx, invalid JSON, unexpected shapes and provider 'unavailable' as unavailable", async () => {
    for (const reply of [
      { status: 503, body: { error: "down" } },
      { body: "<html>" },
      { body: { data: { verdict: "ok" } } },
      { body: { data: { state: "unavailable", reasons: ["provider_timeout"] } } },
    ] as Reply[]) {
      const result = await live(reply).kyt.screen({ address: GIVER, checkType: "giver" });
      expect(result.state).toBe("unavailable");
      expect(result.reasons[0]).toBe(KYT_UNAVAILABLE_REASON);
    }
  });

  it("fails closed on outages when configured, keeping the kyt_unavailable reason", async () => {
    const http = await live({ status: 500, body: {} }, { failClosed: true }).kyt.screen({ address: GIVER, checkType: "giver" });
    expect(http).toMatchObject({ state: "flagged", reasons: [KYT_UNAVAILABLE_REASON, "http_500"] });
    const net = await live({ throw: new TypeError("fetch failed") }, { failClosed: true }).kyt.screen({ address: GIVER, checkType: "giver" });
    expect(net).toMatchObject({ state: "flagged", reasons: [KYT_UNAVAILABLE_REASON, "network_error"] });
    const open = await live({ throw: new TypeError("fetch failed") }, { failClosed: false }).kyt.screen({ address: GIVER, checkType: "giver" });
    expect(open.state).toBe("unavailable");
  });

  it("times out into unavailable", async () => {
    const result = await live({ hang: true }, { timeoutMs: 5 }).kyt.screen({ address: GIVER, checkType: "giver" });
    expect(result).toMatchObject({ state: "unavailable", reasons: [KYT_UNAVAILABLE_REASON, "timeout"] });
  });
});

describe("env wiring", () => {
  it("reads KYT_* with stub as the default mode", () => {
    expect(kytOptionsFromEnv({})).toEqual({ mode: "stub", baseUrl: undefined, apiKey: undefined, failClosed: false });
    expect(kytOptionsFromEnv({ KYT_MODE: "live", KYT_BASE_URL: "https://kyt.sera.cx", KYT_API_KEY: "k", KYT_FAIL_CLOSED: "true" })).toEqual({
      mode: "live",
      baseUrl: "https://kyt.sera.cx",
      apiKey: "k",
      failClosed: true,
    });
    expect(() => kytOptionsFromEnv({ KYT_MODE: "off" })).toThrow(/KYT_MODE/);
  });

  it("createSettlement builds the KYT client from env and exposes it as screenAddress", async () => {
    const { fetchImpl, calls } = fakeFetch((c) => (c.url.startsWith("https://kyt.sera.cx/") ? { status: 502, body: {} } : undefined));
    const settlement = createSettlement({
      network: "sepolia",
      baseUrl: BASE_URL,
      env: { KYT_MODE: "live", KYT_API_KEY: "k", KYT_FAIL_CLOSED: "true" },
      fetch: fetchImpl,
    });
    expect(await settlement.screenAddress(GIVER, "giver")).toMatchObject({ state: "flagged", reasons: [KYT_UNAVAILABLE_REASON, "http_502"] });
    expect(calls[0]!.url).toBe("https://kyt.sera.cx/api/v1/screen");

    const stubbed = createSettlement({ network: "sepolia", baseUrl: BASE_URL, env: {}, fetch: fetchImpl, kyt: { flagged: [GIVER] } });
    expect((await stubbed.screenAddress(GIVER, "payout")).state).toBe("flagged");
    expect(calls).toHaveLength(1);
  });
});
