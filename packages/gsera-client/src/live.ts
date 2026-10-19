/**
 * Live client: talks to g.sera.cx over HTTPS with the partner HMAC.
 *
 *   POST /v1/causes/credit             credit vested gSera (idempotent, retried)
 *   POST /v1/causes/spend              burn spendable gSera (402 when short)
 *   POST /v1/causes/credit/reverse     claw back a credit (idempotent)
 *   GET  /v1/causes/wallet/:address    spendable, earned, spent, multipliers
 *
 * Retries: only `credit` is retried on network errors, timeouts and 502/503/504.
 * That is safe because gSera's GSeraGrant has a unique (grant_type,
 * reference_id, wallet) key, so a retry of a request that actually landed is
 * answered with `already_granted` rather than a second grant. Spend is not
 * retried automatically: it is idempotent on the gSera side too, but a
 * timeout on a spend should surface to the caller so the boost or stake
 * stays in a retryable state in CSD's own ledger.
 */
import { GseraError, GseraConfigError, InsufficientSpendable } from './errors.js';
import { EMPTY_BODY, SIGNATURE_HEADER, signBody } from './signature.js';
import { parse } from './validate.js';
import {
  creditInputSchema,
  reverseInputSchema,
  spendInputSchema,
  walletSchema,
  type CreditInput,
  type CreditResult,
  type GrantType,
  type GseraClient,
  type Multipliers,
  type ReverseResult,
  type SpendInput,
  type SpendResult,
  type WalletInfo,
} from './types.js';

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface LiveClientOptions {
  /** Base URL of the gSera API, e.g. https://g.sera.cx (no trailing slash needed). */
  baseUrl: string;
  /** CAUSES_HMAC_KEY on the gSera side. */
  hmacKey: string;
  /** Per-request timeout. Default 10 000 ms. */
  timeoutMs?: number;
  /** Extra attempts for `credit` after the first. Default 2 (three attempts in all). */
  creditRetries?: number;
  /** Base backoff between credit attempts, doubled each time. Default 250 ms. */
  retryBackoffMs?: number;
  /** Injectable fetch, for tests. Defaults to the global fetch. */
  fetch?: FetchLike;
}

const RETRYABLE_STATUSES = new Set([502, 503, 504]);

interface Envelope<T> {
  data?: T;
  error?: { code?: string; message?: string; detail?: Record<string, unknown> };
}

interface CreditData {
  status: 'granted' | 'already_granted';
  grant_id: string;
  wallet: string;
  amount_gsera: number | string;
  spendable_after: number | string;
}

interface SpendData {
  status: 'spent' | 'already_spent';
  spend_id: string;
  wallet: string;
  amount_gsera: number | string;
  spendable_after: number | string;
}

interface ReverseData {
  status: 'reversed' | 'already_reversed';
  grant_id: string;
  wallet: string;
  amount_gsera: number | string;
}

interface WalletData {
  wallet: string;
  earned: number | string;
  spent: number | string;
  spendable: number | string;
  multipliers: {
    heat_index?: number | null;
    volume_tier: number;
    streak: number;
    power_hour: number;
    compound: number;
  };
}

function num(v: number | string | null | undefined, field: string): number {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new GseraError(`gSera returned a non-numeric ${field}`, { code: 'BAD_RESPONSE', detail: { field, value: v } });
  }
  return n;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class LiveGseraClient implements GseraClient {
  readonly mode = 'live' as const;
  private readonly baseUrl: string;
  private readonly hmacKey: string;
  private readonly timeoutMs: number;
  private readonly creditRetries: number;
  private readonly retryBackoffMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(opts: LiveClientOptions) {
    if (!opts.baseUrl) throw new GseraConfigError('gsera-client live mode needs baseUrl');
    if (!opts.hmacKey) throw new GseraConfigError('gsera-client live mode needs hmacKey');
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.hmacKey = opts.hmacKey;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.creditRetries = opts.creditRetries ?? 2;
    this.retryBackoffMs = opts.retryBackoffMs ?? 250;
    const f: FetchLike | undefined = opts.fetch ?? (globalThis.fetch as FetchLike | undefined);
    if (!f) throw new GseraConfigError('global fetch is not available; pass options.fetch');
    this.fetchImpl = f;
  }

  async credit(input: CreditInput): Promise<CreditResult> {
    const parsed = parse(creditInputSchema, input);
    const body = {
      wallet: parsed.wallet,
      amount_gsera: parsed.amountGsera,
      grant_type: parsed.grantType,
      reference_id: parsed.referenceId,
      reason: parsed.reason,
    };
    const data = await this.withRetry(() => this.request<CreditData>('POST', '/v1/causes/credit', body));
    return {
      status: data.status,
      grantId: data.grant_id,
      wallet: data.wallet,
      amountGsera: num(data.amount_gsera, 'amount_gsera'),
      spendableAfter: num(data.spendable_after, 'spendable_after'),
    };
  }

  async spend(input: SpendInput): Promise<SpendResult> {
    const parsed = parse(spendInputSchema, input);
    const body = {
      wallet: parsed.wallet,
      amount_gsera: parsed.amountGsera,
      reason: parsed.reason,
      reference_id: parsed.referenceId,
    };
    const data = await this.request<SpendData>('POST', '/v1/causes/spend', body);
    return {
      status: data.status,
      spendId: data.spend_id,
      wallet: data.wallet,
      amountGsera: num(data.amount_gsera, 'amount_gsera'),
      spendableAfter: num(data.spendable_after, 'spendable_after'),
    };
  }

  async getWallet(address: string): Promise<WalletInfo> {
    const wallet = parse(walletSchema, address);
    const data = await this.request<WalletData>('GET', `/v1/causes/wallet/${wallet}`);
    const m = data.multipliers ?? ({} as WalletData['multipliers']);
    const multipliers: Multipliers = {
      volumeTier: num(m.volume_tier ?? 1, 'multipliers.volume_tier'),
      streak: num(m.streak ?? 1, 'multipliers.streak'),
      powerHour: num(m.power_hour ?? 1, 'multipliers.power_hour'),
      compound: num(m.compound ?? 1, 'multipliers.compound'),
    };
    if (typeof m.heat_index === 'number') multipliers.heat = m.heat_index;
    return {
      wallet: data.wallet ?? wallet,
      spendable: num(data.spendable, 'spendable'),
      earned: num(data.earned, 'earned'),
      spent: num(data.spent, 'spent'),
      multipliers,
    };
  }

  async reverseCredit(referenceId: string, grantType: GrantType, wallet: string, reason = 'causes_reversal'): Promise<ReverseResult> {
    const parsed = parse(reverseInputSchema, { referenceId, grantType, wallet, reason });
    const body = {
      wallet: parsed.wallet,
      grant_type: parsed.grantType,
      reference_id: parsed.referenceId,
      reason: parsed.reason,
    };
    const data = await this.request<ReverseData>('POST', '/v1/causes/credit/reverse', body);
    return {
      status: data.status,
      grantId: data.grant_id,
      wallet: data.wallet,
      amountGsera: num(data.amount_gsera, 'amount_gsera'),
    };
  }

  // ---- internals ----

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    for (;;) {
      try {
        return await fn();
      } catch (e) {
        const retryable = e instanceof GseraError && (e.code === 'NETWORK' || e.code === 'TIMEOUT' || (e.status !== null && RETRYABLE_STATUSES.has(e.status)));
        if (!retryable || attempt >= this.creditRetries) throw e;
        await sleep(this.retryBackoffMs * 2 ** attempt);
        attempt += 1;
      }
    }
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    // Sign the exact bytes that go on the wire. Never re-serialise after this.
    const raw = body === undefined ? EMPTY_BODY : JSON.stringify(body);
    const headers: Record<string, string> = {
      accept: 'application/json',
      [SIGNATURE_HEADER]: signBody(this.hmacKey, raw),
    };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = raw;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    init.signal = controller.signal;

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    } catch (e) {
      clearTimeout(timer);
      if (controller.signal.aborted) {
        throw new GseraError(`gSera request timed out after ${this.timeoutMs} ms: ${method} ${path}`, { code: 'TIMEOUT', cause: e });
      }
      throw new GseraError(`gSera request failed: ${method} ${path}`, { code: 'NETWORK', cause: e });
    }
    clearTimeout(timer);

    let envelope: Envelope<T> | null = null;
    const text = await res.text();
    if (text.length > 0) {
      try {
        envelope = JSON.parse(text) as Envelope<T>;
      } catch {
        envelope = null;
      }
    }

    if (!res.ok) {
      const code = envelope?.error?.code ?? `HTTP_${res.status}`;
      const message = envelope?.error?.message ?? `gSera responded ${res.status} to ${method} ${path}`;
      const detail = envelope?.error?.detail;
      if (res.status === 402) {
        const spendable = Number(detail?.spendable ?? NaN);
        const required = Number(detail?.required ?? detail?.cost ?? NaN);
        throw new InsufficientSpendable(spendable, required, typeof detail?.wallet === 'string' ? detail.wallet : undefined);
      }
      throw new GseraError(message, { status: res.status, code, detail });
    }

    if (!envelope || envelope.data === undefined) {
      throw new GseraError(`gSera returned no data envelope for ${method} ${path}`, { status: res.status, code: 'BAD_RESPONSE' });
    }
    return envelope.data;
  }
}
