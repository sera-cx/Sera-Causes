/**
 * Sera KYT/KYA client (kyt.sera.cx): sanctions and risk screening of wallet
 * addresses before a gift, payout change, vote or listing.
 *
 * Two modes:
 *   - "live": calls kyt.sera.cx. **The wire format below is PROVISIONAL** –
 *     the kyt.sera.cx repo is not public yet. Everything that touches the wire
 *     (path, request body, auth header, response shape) is confined to the
 *     `WIRE` block so it can be corrected in minutes without touching callers.
 *   - "stub": no network. Every address is "clear" except those listed in
 *     `flagged`; `simulateOutage` makes every screen "unavailable".
 *
 * Fail-open / fail-closed: an outage (transport error, timeout, non-2xx,
 * unreadable body) is "unavailable" with reason "kyt_unavailable". With
 * `failClosed: true` (env `KYT_FAIL_CLOSED=true`) that outcome is reported as
 * "flagged" so callers who only branch on `state` refuse the action; the
 * "kyt_unavailable" reason is kept so logs can tell it apart from a real hit.
 */
import { z } from "zod";
import type { FetchLike } from "./client.js";
import { envBool, type Env } from "./config.js";

export type KytMode = "live" | "stub";
export type KytCheckType = "giver" | "payout" | "voter" | "lister";
export type KytState = "clear" | "flagged" | "unavailable";

export interface KytResult {
  state: KytState;
  /** Provider reasons for a flag, or ["kyt_unavailable"] (plus the cause) on an outage. Empty when clear. */
  reasons: string[];
  /** Unix milliseconds. */
  checkedAt: number;
}

export interface KytScreenInput {
  address: string;
  checkType: KytCheckType;
}

export interface KytClientOptions {
  mode: KytMode;
  /** Default https://kyt.sera.cx */
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
  /** Report outages as "flagged" instead of "unavailable". Default false (fail-open). */
  failClosed?: boolean;
  /** Stub only: addresses that screen as flagged (case-insensitive). */
  flagged?: string[];
  /** Stub only: every screen returns the outage outcome. */
  simulateOutage?: boolean;
  fetch?: FetchLike;
  now?: () => number;
}

export interface KytClient {
  readonly mode: KytMode;
  screen(input: KytScreenInput): Promise<KytResult>;
}

export const KYT_DEFAULT_BASE_URL = "https://kyt.sera.cx";
export const KYT_UNAVAILABLE_REASON = "kyt_unavailable";
const DEFAULT_TIMEOUT_MS = 8_000;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

// ---------------------------------------------------------------------------
// PROVISIONAL wire format for kyt.sera.cx. Confirm against the service once
// its repo is public and fix HERE ONLY.
//   POST {baseUrl}/api/v1/screen
//   Authorization: Bearer <apiKey>        (omitted when no key is configured)
//   body:     { "address": "0x…", "check_type": "giver" | "payout" | "voter" | "lister" }
//   response: { "data": { "state": "clear" | "flagged" | "unavailable", "reasons": ["…"] } }
// ---------------------------------------------------------------------------
const WIRE = {
  path: "/api/v1/screen",
  request: (input: KytScreenInput): unknown => ({ address: input.address, check_type: input.checkType }),
  responseSchema: z.object({
    data: z.object({
      state: z.enum(["clear", "flagged", "unavailable"]),
      reasons: z.array(z.string()).optional().default([]),
    }),
  }),
} as const;

/** Reads KYT_MODE, KYT_BASE_URL, KYT_API_KEY, KYT_FAIL_CLOSED. Mode defaults to "stub". */
export function kytOptionsFromEnv(env: Env): Pick<KytClientOptions, "mode" | "baseUrl" | "apiKey" | "failClosed"> {
  const modeRaw = (env.KYT_MODE ?? "stub").toLowerCase();
  if (modeRaw !== "stub" && modeRaw !== "live") throw new Error(`KYT_MODE must be 'stub' or 'live' (got '${env.KYT_MODE}')`);
  return {
    mode: modeRaw,
    baseUrl: env.KYT_BASE_URL || undefined,
    apiKey: env.KYT_API_KEY || undefined,
    failClosed: envBool(env, "KYT_FAIL_CLOSED", false),
  };
}

export function createKytClient(options: KytClientOptions): KytClient {
  const now = options.now ?? Date.now;
  const failClosed = options.failClosed ?? false;
  const baseUrl = (options.baseUrl ?? KYT_DEFAULT_BASE_URL).replace(/\/+$/, "");
  const fetchImpl: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const flagged = new Set((options.flagged ?? []).map((a) => a.toLowerCase()));

  const unavailable = (cause: string): KytResult => ({
    state: failClosed ? "flagged" : "unavailable",
    reasons: [KYT_UNAVAILABLE_REASON, cause],
    checkedAt: now(),
  });

  async function screenStub(input: KytScreenInput): Promise<KytResult> {
    if (options.simulateOutage) return unavailable("simulated_outage");
    const hit = flagged.has(input.address.toLowerCase());
    return { state: hit ? "flagged" : "clear", reasons: hit ? ["stub_flagged_list"] : [], checkedAt: now() };
  }

  async function screenLive(input: KytScreenInput): Promise<KytResult> {
    const headers: Record<string, string> = { accept: "application/json", "content-type": "application/json" };
    if (options.apiKey) headers.authorization = `Bearer ${options.apiKey}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}${WIRE.path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(WIRE.request(input)),
        signal: controller.signal,
        redirect: "manual",
      });
      const text = await response.text();
      if (!response.ok) return unavailable(`http_${response.status}`);
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return unavailable("invalid_json");
      }
      const result = WIRE.responseSchema.safeParse(parsed);
      if (!result.success) return unavailable("unexpected_shape");
      const { state, reasons } = result.data.data;
      if (state === "unavailable") return unavailable(reasons[0] ?? "provider_unavailable");
      return { state, reasons: state === "flagged" ? reasons : [], checkedAt: now() };
    } catch (error) {
      const aborted = controller.signal.aborted || (error instanceof Error && error.name === "AbortError");
      return unavailable(aborted ? "timeout" : "network_error");
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    mode: options.mode,
    async screen(input) {
      if (!ADDRESS_RE.test(input.address)) {
        return { state: "flagged", reasons: ["invalid_address"], checkedAt: now() };
      }
      return options.mode === "live" ? screenLive(input) : screenStub(input);
    },
  };
}
