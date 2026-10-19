/**
 * Thin fetch wrapper for the Sera.cx REST API.
 *
 * Behaviour copied from sera-mcp `src/sera/client.ts` and sera-pay
 * `server/sera-api.ts`:
 *   - auth header `Authorization: Bearer <api_key>:<api_secret>` only on
 *     endpoints that ask for it (`auth: true`);
 *   - per-request timeout via AbortController (default 8 s);
 *   - retries only on 5xx or a transport failure, only for requests marked
 *     retryable (GETs by default). `POST /swap` is never retried: a transient
 *     failure mid-execute can still land server-side, and a retry could
 *     double-execute;
 *   - Retry-After honoured (fallback 1 s, capped at 5 s);
 *   - redirects refused (the base URL is allowlisted; a 30x would defeat it);
 *   - Sera error envelopes decoded into `SeraApiError { status, code, body }`;
 *   - HTTP 410 ("quote expired, already consumed, or not found") is surfaced
 *     with code `QUOTE_STALE`, the same code Sera uses in its 409 envelope.
 */

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export class SeraApiError extends Error {
  override readonly name: string = "SeraApiError";
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
    readonly body: unknown,
  ) {
    super(message);
  }

  /** True when the quote behind this request can no longer be submitted; re-quote. */
  get isQuoteStale(): boolean {
    return this.code === "QUOTE_STALE";
  }
}

export class SeraNetworkError extends Error {
  override readonly name = "SeraNetworkError";
  constructor(
    readonly code: "TIMEOUT" | "NETWORK",
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export function isQuoteStaleError(error: unknown): boolean {
  return error instanceof SeraApiError && error.isQuoteStale;
}

export interface SeraClientOptions {
  baseUrl: string;
  apiKey?: string;
  apiSecret?: string;
  fetch?: FetchLike;
  /** Default per-request timeout. */
  timeoutMs?: number;
  /** Extra attempts after the first for retryable requests. */
  maxRetries?: number;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  /** Send the API-key header. Throws `SeraApiError(401, MISSING_CREDENTIALS)` when none configured. */
  auth?: boolean;
  timeoutMs?: number;
  /** Retry on 5xx / transport failure. Defaults to true for GET, false otherwise. */
  retry?: boolean;
}

export interface SeraClient {
  readonly baseUrl: string;
  readonly hasCredentials: boolean;
  get<T = unknown>(path: string, options?: RequestOptions): Promise<T>;
  post<T = unknown>(path: string, body: unknown, options?: RequestOptions): Promise<T>;
}

const RETRY_AFTER_FALLBACK_MS = 1_000;
const RETRY_AFTER_CAP_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_RETRIES = 2;

/** Parse Retry-After (seconds or HTTP-date). Exported for tests. */
export function parseRetryAfter(header: string | null | undefined, now: number = Date.now()): number {
  if (!header) return RETRY_AFTER_FALLBACK_MS;
  const asInt = Number.parseInt(header, 10);
  if (Number.isFinite(asInt) && asInt >= 0) return Math.min(asInt * 1_000, RETRY_AFTER_CAP_MS);
  const asDate = Date.parse(header);
  if (Number.isFinite(asDate)) {
    const ms = asDate - now;
    if (ms > 0) return Math.min(ms, RETRY_AFTER_CAP_MS);
  }
  return RETRY_AFTER_FALLBACK_MS;
}

function buildQuery(query: RequestOptions["query"]): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

type Decoded = { code: string | null; message: string };

/**
 * Sera observed error shapes:
 *   { detail: "Invalid request" }
 *   { detail: { detail: "...", error_code: "QUOTE_STALE" } }     // typed envelope
 *   { detail: { code: "AMOUNT_BELOW_MIN", ... } }                 // /swap/quote floor
 *   { detail: { success: false, error: "no_liquidity" } }        // business errors
 */
export function decodeErrorBody(status: number, body: unknown, fallback: string): Decoded {
  const record = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  const detail = record ? record.detail : undefined;
  let code: string | null = null;
  let message: string | null = null;

  const pick = (source: Record<string, unknown>) => {
    for (const key of ["error_code", "code", "error"]) {
      const candidate = source[key];
      if (typeof candidate === "string" && candidate.trim() && !code) code = candidate.trim().toUpperCase();
    }
    for (const key of ["detail", "message", "error"]) {
      const candidate = source[key];
      if (typeof candidate === "string" && candidate.trim() && !message) message = candidate.trim();
    }
  };

  if (typeof detail === "string") {
    message = detail;
  } else if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    pick(detail as Record<string, unknown>);
  } else if (record) {
    pick(record);
  } else if (typeof body === "string" && body.trim()) {
    message = body.trim().slice(0, 500);
  }

  if (!code && status === 410) code = "QUOTE_STALE";
  if (!code && status === 429) code = "RATE_LIMITED";
  return { code, message: message ?? fallback };
}

export function createSeraClient(options: SeraClientOptions): SeraClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchImpl: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const timeoutDefault = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const hasCredentials = Boolean(options.apiKey && options.apiSecret);

  async function once<T>(method: "GET" | "POST", path: string, opts: RequestOptions): Promise<T> {
    const url = `${baseUrl}${path}${buildQuery(opts.query)}`;
    const headers: Record<string, string> = { accept: "application/json" };
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    if (opts.auth) headers.authorization = `Bearer ${options.apiKey}:${options.apiSecret}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? timeoutDefault);
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: controller.signal,
        redirect: "manual",
      });
    } catch (error) {
      const aborted = controller.signal.aborted || (error instanceof Error && error.name === "AbortError");
      throw new SeraNetworkError(
        aborted ? "TIMEOUT" : "NETWORK",
        aborted ? `Sera ${method} ${path} timed out` : `Sera ${method} ${path} failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    const body = parseJson(text);

    if (response.status >= 300 && response.status < 400) {
      throw new SeraApiError(response.status, "REDIRECT_REFUSED", `Sera ${method} ${path} answered with a redirect; refusing to follow`, body);
    }
    if (response.status >= 400) {
      const { code, message } = decodeErrorBody(response.status, body, `Sera ${response.status} ${method} ${path}`);
      const error = new SeraApiError(response.status, code, message, body);
      const retryAfter = response.headers.get("retry-after");
      if (retryAfter) (error as SeraApiError & { retryAfterMs?: number }).retryAfterMs = parseRetryAfter(retryAfter);
      throw error;
    }
    return body as T;
  }

  async function call<T>(method: "GET" | "POST", path: string, opts: RequestOptions): Promise<T> {
    if (opts.auth && !hasCredentials) {
      throw new SeraApiError(401, "MISSING_CREDENTIALS", `Sera ${method} ${path} requires SERA_API_KEY and SERA_API_SECRET`, undefined);
    }
    const isSwapSubmit = method === "POST" && path.replace(/\/+$/, "") === "/swap";
    const retryable = isSwapSubmit ? false : (opts.retry ?? method === "GET");
    const attempts = retryable ? 1 + maxRetries : 1;

    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await once<T>(method, path, opts);
      } catch (error) {
        lastError = error;
        const transient =
          error instanceof SeraNetworkError || (error instanceof SeraApiError && error.status >= 500);
        if (!transient || attempt === attempts) throw error;
        const wait =
          error instanceof SeraApiError
            ? ((error as SeraApiError & { retryAfterMs?: number }).retryAfterMs ?? RETRY_AFTER_FALLBACK_MS)
            : RETRY_AFTER_FALLBACK_MS;
        await sleep(wait);
      }
    }
    throw lastError;
  }

  return {
    baseUrl,
    hasCredentials,
    get: (path, opts = {}) => call("GET", path, opts),
    post: (path, body, opts = {}) => call("POST", path, { ...opts, body }),
  };
}
