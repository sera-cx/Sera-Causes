/**
 * Network selection and base-URL resolution for the Sera.cx REST API.
 *
 * Mirrors sera-mcp's `src/config.ts`: the canonical URL is chosen by
 * `SERA_NETWORK` and is NOT overridable by default. An override needs three
 * deliberately friction-heavy env vars:
 *
 *   SERA_BASE_URL_ALLOW_CUSTOM=true
 *   SERA_BASE_URL=https://your-host/api/v1
 *   SERA_BASE_URL_ALLOW_NON_SERA=true   (only if the host is not under sera.cx)
 *
 * The third gate stops a single env override from redirecting API keys, wallet
 * signatures and route_params to an attacker-controlled host.
 */

export type SeraNetwork = "mainnet" | "sepolia";

export type Env = Record<string, string | undefined>;

/**
 * Canonical base URLs by network.
 *
 * NOTE on the Sepolia host: the public repos disagree. sera-pay
 * (`server/sera-api.ts`, `DEFAULT_SERA_API_TESTNET_BASE_URL`) and
 * sera-cx/rotor use `https://api.testnet.sera.cx/api/v1`; only sera-mcp
 * (`src/config.ts`) uses `https://api-testnet.sera.cx/api/v1`. We follow
 * sera-pay/rotor. The testnet host MUST still be confirmed against a live
 * `GET /health` before go-live.
 */
export const SERA_NETWORK_URLS: Readonly<Record<SeraNetwork, string>> = Object.freeze({
  mainnet: "https://api.sera.cx/api/v1",
  sepolia: "https://api.testnet.sera.cx/api/v1",
});

/** Chain ids Sera supports. Sera runs only on Ethereum mainnet and Sepolia. */
export const SERA_CHAIN_IDS: Readonly<Record<SeraNetwork, number>> = Object.freeze({
  mainnet: 1,
  sepolia: 11_155_111,
});

export interface SettlementConfig {
  network: SeraNetwork;
  chainId: number;
  baseUrl: string;
  apiKey?: string;
  apiSecret?: string;
}

function envRaw(env: Env, name: string): string | undefined {
  const v = env[name];
  return v === undefined || v === "" ? undefined : v;
}

/** Strict boolean parse (fails closed on garbage), as in sera-mcp `util/env.ts`. */
export function envBool(env: Env, name: string, fallback = false): boolean {
  const v = envRaw(env, name);
  if (v === undefined) return fallback;
  const lower = v.toLowerCase();
  if (["true", "1", "yes", "on"].includes(lower)) return true;
  if (["false", "0", "no", "off"].includes(lower)) return false;
  throw new Error(`${name} must be a boolean (true/false), got "${v}"`);
}

export function parseNetwork(raw: string | undefined): SeraNetwork {
  const value = (raw ?? "mainnet").toLowerCase();
  if (value !== "mainnet" && value !== "sepolia") {
    throw new Error(`SERA_NETWORK must be 'mainnet' or 'sepolia' (got '${raw}')`);
  }
  return value;
}

/** Hostname allowlist for the override path: sera.cx and its subdomains only. */
export function isHostInSeraFamily(host: string): boolean {
  return host === "sera.cx" || host.endsWith(".sera.cx");
}

export interface ResolveBaseUrlOptions {
  env?: Env;
  /** Receives non-fatal warnings (ignored override, override enabled). */
  onWarn?: (message: string, detail?: Record<string, unknown>) => void;
}

export function resolveBaseUrl(network: SeraNetwork, options: ResolveBaseUrlOptions = {}): string {
  const env = options.env ?? (process.env as Env);
  const warn = options.onWarn ?? (() => undefined);
  const allowCustom = envBool(env, "SERA_BASE_URL_ALLOW_CUSTOM", false);
  const allowNonSera = envBool(env, "SERA_BASE_URL_ALLOW_NON_SERA", false);
  const customRaw = envRaw(env, "SERA_BASE_URL");
  const canonical = SERA_NETWORK_URLS[network];

  if (!customRaw) return canonical;

  if (!allowCustom) {
    warn("SERA_BASE_URL set but SERA_BASE_URL_ALLOW_CUSTOM is not 'true'. Ignoring it and using the canonical URL.", {
      ignored: customRaw,
      used: canonical,
    });
    return canonical;
  }

  let parsed: URL;
  try {
    parsed = new URL(customRaw);
  } catch {
    throw new Error(`SERA_BASE_URL is not a valid URL: ${customRaw}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`SERA_BASE_URL must use https:// (got ${parsed.protocol})`);
  }
  if (!isHostInSeraFamily(parsed.hostname) && !allowNonSera) {
    throw new Error(
      `SERA_BASE_URL host "${parsed.hostname}" is not under sera.cx. ` +
        "Set SERA_BASE_URL_ALLOW_NON_SERA=true to override (only safe if you control the host).",
    );
  }
  const normalized = customRaw.replace(/\/+$/, "");
  warn("SERA_BASE_URL override ENABLED. Every API key, wallet signature and route_params response will trust this host.", {
    base_url: normalized,
    non_sera_allowed: allowNonSera,
  });
  return normalized;
}

export interface LoadConfigOptions extends ResolveBaseUrlOptions {
  network?: SeraNetwork;
  /** Explicit base URL. Bypasses env resolution; must still be https. */
  baseUrl?: string;
  apiKey?: string;
  apiSecret?: string;
}

/**
 * Build the settlement config from env plus explicit overrides. Explicit
 * options win over env; `baseUrl` given explicitly skips the env override
 * gates (callers passing it are already code, not an install snippet).
 */
export function loadSettlementConfig(options: LoadConfigOptions = {}): SettlementConfig {
  const env = options.env ?? (process.env as Env);
  const network = options.network ?? parseNetwork(envRaw(env, "SERA_NETWORK"));
  let baseUrl: string;
  if (options.baseUrl) {
    const parsed = new URL(options.baseUrl);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      throw new Error(`baseUrl must use https:// (got ${parsed.protocol})`);
    }
    baseUrl = options.baseUrl.replace(/\/+$/, "");
  } else {
    baseUrl = resolveBaseUrl(network, { env, onWarn: options.onWarn });
  }
  const apiKey = options.apiKey ?? envRaw(env, "SERA_API_KEY");
  const apiSecret = options.apiSecret ?? envRaw(env, "SERA_API_SECRET");
  return { network, chainId: SERA_CHAIN_IDS[network], baseUrl, apiKey, apiSecret };
}
