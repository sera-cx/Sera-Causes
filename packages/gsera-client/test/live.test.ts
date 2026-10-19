import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createGseraClient, GseraError, InsufficientSpendable, type FetchLike } from '../src/index.js';

const KEY = 'causes-hmac-key';
const BASE = 'https://g.sera.cx';
const WALLET = '0xAbCdEf0123456789abcdef0123456789ABCDEF01';
const LOWER = WALLET.toLowerCase();

interface Captured {
  url: string;
  init: RequestInit;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function fetchStub(handler: (c: Captured, n: number) => Response | Promise<Response>) {
  const calls: Captured[] = [];
  const fetch: FetchLike = async (url, init) => {
    const c = { url, init };
    calls.push(c);
    return handler(c, calls.length);
  };
  return { fetch, calls };
}

function header(init: RequestInit, name: string): string | undefined {
  const h = init.headers as Record<string, string>;
  const k = Object.keys(h).find((x) => x.toLowerCase() === name.toLowerCase());
  return k ? h[k] : undefined;
}

describe('live client', () => {
  it('signs the exact raw body it sends on credit', async () => {
    const { fetch, calls } = fetchStub(() =>
      jsonResponse(200, { data: { status: 'granted', grant_id: 'grt_1', wallet: LOWER, amount_gsera: '9900.0000', spendable_after: '9900.0000' } }),
    );
    const client = createGseraClient({ mode: 'live', baseUrl: BASE, hmacKey: KEY, fetch });

    const r = await client.credit({ wallet: WALLET, amountGsera: 9900, grantType: 'causes_gift', referenceId: 'gift_1', reason: 'gift vested' });

    expect(r).toEqual({ status: 'granted', grantId: 'grt_1', wallet: LOWER, amountGsera: 9900, spendableAfter: 9900 });
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toBe(`${BASE}/v1/causes/credit`);
    expect(init.method).toBe('POST');
    const raw = init.body as string;
    expect(JSON.parse(raw)).toEqual({ wallet: LOWER, amount_gsera: 9900, grant_type: 'causes_gift', reference_id: 'gift_1', reason: 'gift vested' });
    expect(header(init, 'x-sera-signature')).toBe(`sha256=${createHmac('sha256', KEY).update(raw).digest('hex')}`);
    expect(header(init, 'content-type')).toBe('application/json');
  });

  it('signs GET wallet reads over {} and maps the multipliers', async () => {
    const { fetch, calls } = fetchStub(() =>
      jsonResponse(200, {
        data: {
          wallet: LOWER,
          earned: 12000,
          spent: 2100,
          spendable: 9900,
          multipliers: { heat_index: 2.5, volume_tier: 1.2, streak: 1.1, power_hour: 1.0, compound: 3.3 },
        },
      }),
    );
    const client = createGseraClient({ mode: 'live', baseUrl: `${BASE}/`, hmacKey: KEY, fetch });

    const w = await client.getWallet(WALLET);

    expect(w).toEqual({ wallet: LOWER, earned: 12000, spent: 2100, spendable: 9900, multipliers: { heat: 2.5, volumeTier: 1.2, streak: 1.1, powerHour: 1.0, compound: 3.3 } });
    const { url, init } = calls[0]!;
    expect(url).toBe(`${BASE}/v1/causes/wallet/${LOWER}`);
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(header(init, 'x-sera-signature')).toBe(`sha256=${createHmac('sha256', KEY).update('{}').digest('hex')}`);
  });

  it('omits heat when gSera returns null for it', async () => {
    const { fetch } = fetchStub(() =>
      jsonResponse(200, { data: { wallet: LOWER, earned: 0, spent: 0, spendable: 0, multipliers: { heat_index: null, volume_tier: 1, streak: 1, power_hour: 1, compound: 1 } } }),
    );
    const client = createGseraClient({ mode: 'live', baseUrl: BASE, hmacKey: KEY, fetch });
    const w = await client.getWallet(WALLET);
    expect('heat' in w.multipliers).toBe(false);
  });

  it('maps a 402 on spend to InsufficientSpendable', async () => {
    const { fetch, calls } = fetchStub(() =>
      jsonResponse(402, { error: { code: 'INSUFFICIENT_GSERA', message: 'insufficient_gsera', detail: { spendable: 500, required: 888, wallet: LOWER } } }),
    );
    const client = createGseraClient({ mode: 'live', baseUrl: BASE, hmacKey: KEY, fetch });

    const p = client.spend({ wallet: WALLET, amountGsera: 888, reason: 'cause_boost', referenceId: 'boost_1' });
    await expect(p).rejects.toBeInstanceOf(InsufficientSpendable);
    const err = (await p.catch((e: unknown) => e)) as InsufficientSpendable;
    expect(err.status).toBe(402);
    expect(err.code).toBe('INSUFFICIENT_GSERA');
    expect(err.spendable).toBe(500);
    expect(err.required).toBe(888);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${BASE}/v1/causes/spend`);
  });

  it('retries credit on 503 and network errors, then succeeds', async () => {
    const { fetch, calls } = fetchStub((_c, n) => {
      if (n === 1) return jsonResponse(503, { error: { code: 'NOT_CONFIGURED', message: 'Partner integration not enabled' } });
      if (n === 2) throw new TypeError('fetch failed');
      return jsonResponse(200, { data: { status: 'already_granted', grant_id: 'grt_1', wallet: LOWER, amount_gsera: 100, spendable_after: 100 } });
    });
    const client = createGseraClient({ mode: 'live', baseUrl: BASE, hmacKey: KEY, fetch, retryBackoffMs: 0 });

    const r = await client.credit({ wallet: WALLET, amountGsera: 100, grantType: 'causes_vote', referenceId: 'vote_1', reason: 'vote agreed' });

    expect(r.status).toBe('already_granted');
    expect(calls).toHaveLength(3);
  });

  it('gives up on credit after the configured retries', async () => {
    const { fetch, calls } = fetchStub(() => jsonResponse(502, { error: { code: 'BAD_GATEWAY', message: 'upstream' } }));
    const client = createGseraClient({ mode: 'live', baseUrl: BASE, hmacKey: KEY, fetch, retryBackoffMs: 0, creditRetries: 1 });

    await expect(client.credit({ wallet: WALLET, amountGsera: 1, grantType: 'causes_help', referenceId: 'h1', reason: 'r' })).rejects.toMatchObject({ status: 502 });
    expect(calls).toHaveLength(2);
  });

  it('does not retry spend', async () => {
    const { fetch, calls } = fetchStub(() => {
      throw new TypeError('fetch failed');
    });
    const client = createGseraClient({ mode: 'live', baseUrl: BASE, hmacKey: KEY, fetch, retryBackoffMs: 0 });

    const p = client.spend({ wallet: WALLET, amountGsera: 1, reason: 'cause_boost', referenceId: 'b1' });
    await expect(p).rejects.toMatchObject({ code: 'NETWORK' });
    expect(calls).toHaveLength(1);
  });

  it('does not retry credit on 4xx', async () => {
    const { fetch, calls } = fetchStub(() => jsonResponse(401, { error: { code: 'BAD_SIGNATURE', message: 'Invalid or missing X-Sera-Signature' } }));
    const client = createGseraClient({ mode: 'live', baseUrl: BASE, hmacKey: KEY, fetch, retryBackoffMs: 0 });

    const p = client.credit({ wallet: WALLET, amountGsera: 1, grantType: 'causes_help', referenceId: 'h1', reason: 'r' });
    await expect(p).rejects.toMatchObject({ status: 401, code: 'BAD_SIGNATURE' });
    expect(calls).toHaveLength(1);
  });

  it('times out and reports TIMEOUT', async () => {
    const fetch: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    const client = createGseraClient({ mode: 'live', baseUrl: BASE, hmacKey: KEY, fetch, timeoutMs: 20 });

    const p = client.getWallet(WALLET);
    await expect(p).rejects.toBeInstanceOf(GseraError);
    await expect(p).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('posts reverseCredit with the idempotency triple', async () => {
    const { fetch, calls } = fetchStub(() => jsonResponse(200, { data: { status: 'reversed', grant_id: 'grt_9', wallet: LOWER, amount_gsera: '2500' } }));
    const client = createGseraClient({ mode: 'live', baseUrl: BASE, hmacKey: KEY, fetch });

    const r = await client.reverseCredit('cause_42', 'causes_listing', WALLET, 'linked wallet');

    expect(r).toEqual({ status: 'reversed', grantId: 'grt_9', wallet: LOWER, amountGsera: 2500 });
    expect(calls[0]!.url).toBe(`${BASE}/v1/causes/credit/reverse`);
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ wallet: LOWER, grant_type: 'causes_listing', reference_id: 'cause_42', reason: 'linked wallet' });
  });

  it('rejects invalid input before touching the network', async () => {
    const spy = vi.fn<FetchLike>();
    const client = createGseraClient({ mode: 'live', baseUrl: BASE, hmacKey: KEY, fetch: spy });

    await expect(client.credit({ wallet: 'nope', amountGsera: 1, grantType: 'causes_gift', referenceId: 'x', reason: 'r' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(client.spend({ wallet: WALLET, amountGsera: 0, reason: 'cause_boost', referenceId: 'x' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    // @ts-expect-error wrong grant type on purpose
    await expect(client.credit({ wallet: WALLET, amountGsera: 1, grantType: 'referral_referee', referenceId: 'x', reason: 'r' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('refuses to construct without a key or base URL', () => {
    expect(() => createGseraClient({ mode: 'live', baseUrl: '', hmacKey: KEY })).toThrow(/baseUrl/);
    expect(() => createGseraClient({ mode: 'live', baseUrl: BASE, hmacKey: '' })).toThrow(/hmacKey/);
  });
});
