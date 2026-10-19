import { describe, expect, it, vi } from "vitest";
import { envBool, loadSettlementConfig, resolveBaseUrl, SERA_CHAIN_IDS, SERA_NETWORK_URLS } from "../src/config.js";

describe("resolveBaseUrl", () => {
  it("returns the canonical URL per network when no override is set", () => {
    expect(resolveBaseUrl("mainnet", { env: {} })).toBe("https://api.sera.cx/api/v1");
    expect(resolveBaseUrl("sepolia", { env: {} })).toBe("https://api.testnet.sera.cx/api/v1");
    expect(SERA_NETWORK_URLS.sepolia).toBe("https://api.testnet.sera.cx/api/v1");
  });

  it("ignores SERA_BASE_URL unless SERA_BASE_URL_ALLOW_CUSTOM=true", () => {
    const onWarn = vi.fn();
    const url = resolveBaseUrl("mainnet", { env: { SERA_BASE_URL: "https://evil.example/api/v1" }, onWarn });
    expect(url).toBe("https://api.sera.cx/api/v1");
    expect(onWarn).toHaveBeenCalledTimes(1);
  });

  it("honours an override under sera.cx when ALLOW_CUSTOM is set", () => {
    const url = resolveBaseUrl("mainnet", {
      env: { SERA_BASE_URL: "https://api.staging.sera.cx/api/v1/", SERA_BASE_URL_ALLOW_CUSTOM: "true" },
    });
    expect(url).toBe("https://api.staging.sera.cx/api/v1");
  });

  it("rejects a non-sera.cx host unless ALLOW_NON_SERA is also set", () => {
    const env = { SERA_BASE_URL: "https://evil.example/api/v1", SERA_BASE_URL_ALLOW_CUSTOM: "true" };
    expect(() => resolveBaseUrl("mainnet", { env })).toThrow(/not under sera\.cx/);
    expect(resolveBaseUrl("mainnet", { env: { ...env, SERA_BASE_URL_ALLOW_NON_SERA: "true" } })).toBe("https://evil.example/api/v1");
  });

  it("rejects non-https overrides and look-alike hosts", () => {
    expect(() => resolveBaseUrl("mainnet", { env: { SERA_BASE_URL: "http://api.sera.cx/api/v1", SERA_BASE_URL_ALLOW_CUSTOM: "true" } })).toThrow(/https/);
    expect(() => resolveBaseUrl("mainnet", { env: { SERA_BASE_URL: "https://sera.cx.evil.example/api/v1", SERA_BASE_URL_ALLOW_CUSTOM: "true" } })).toThrow(/not under sera\.cx/);
  });
});

describe("env parsing", () => {
  it("fails closed on garbage booleans", () => {
    expect(envBool({ X: "yes" }, "X")).toBe(true);
    expect(envBool({ X: "0" }, "X", true)).toBe(false);
    expect(() => envBool({ X: "maybe" }, "X")).toThrow(/boolean/);
  });

  it("loads network, chain id and credentials from env", () => {
    const cfg = loadSettlementConfig({ env: { SERA_NETWORK: "sepolia", SERA_API_KEY: "k", SERA_API_SECRET: "s" } });
    expect(cfg).toMatchObject({ network: "sepolia", chainId: SERA_CHAIN_IDS.sepolia, apiKey: "k", apiSecret: "s" });
    expect(() => loadSettlementConfig({ env: { SERA_NETWORK: "goerli" } })).toThrow(/SERA_NETWORK/);
  });
});
