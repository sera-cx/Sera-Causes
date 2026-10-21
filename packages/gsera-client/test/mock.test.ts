import { describe, expect, it } from 'vitest';
import { createGseraClient, createMemoryStore, GseraError, InsufficientSpendable, type MockStore, type MockWalletState } from '../src/index.js';

const WALLET = '0x2222222222222222222222222222222222222222';

describe('mock client', () => {
  it('starts every wallet at zero with volumeTier 1.0 and streak 1.0', async () => {
    const client = createGseraClient({ mode: 'mock' });
    const w = await client.getWallet(WALLET);
    expect(w).toEqual({ wallet: WALLET, earned: 0, spent: 0, spendable: 0, multipliers: { volumeTier: 1.0, streak: 1.0, powerHour: 1.0, compound: 1.0 } });
  });

  it('seed sets the spendable balance', async () => {
    const client = createGseraClient({ mode: 'mock' });
    await client.seed(WALLET, 1000, { volumeTier: 1.2, streak: 1.1 });
    const w = await client.getWallet(WALLET);
    expect(w.spendable).toBe(1000);
    expect(w.earned).toBe(1000);
    expect(w.multipliers).toEqual({ volumeTier: 1.2, streak: 1.1, powerHour: 1.0, compound: 1.0 });
  });

  it('spend fails with InsufficientSpendable when short and leaves the balance untouched', async () => {
    const client = createGseraClient({ mode: 'mock' });
    await client.seed(WALLET, 500);

    const p = client.spend({ wallet: WALLET, amountGsera: 888, reason: 'cause_boost', referenceId: 'boost_1' });
    await expect(p).rejects.toBeInstanceOf(InsufficientSpendable);
    const err = (await p.catch((e: unknown) => e)) as InsufficientSpendable;
    expect(err.spendable).toBe(500);
    expect(err.required).toBe(888);

    const w = await client.getWallet(WALLET);
    expect(w.spendable).toBe(500);
    expect(w.spent).toBe(0);
  });

  it('spend burns spendable but never lifetime earned', async () => {
    const client = createGseraClient({ mode: 'mock' });
    await client.seed(WALLET, 1000);

    const r = await client.spend({ wallet: WALLET, amountGsera: 300, reason: 'cause_challenge_stake', referenceId: 'chal_1' });
    expect(r.status).toBe('spent');
    expect(r.spendableAfter).toBe(700);

    const w = await client.getWallet(WALLET);
    expect(w).toMatchObject({ earned: 1000, spent: 300, spendable: 700 });
  });

  it('spend is idempotent on (reason, referenceId)', async () => {
    const client = createGseraClient({ mode: 'mock' });
    await client.seed(WALLET, 1000);
    const a = await client.spend({ wallet: WALLET, amountGsera: 300, reason: 'cause_boost', referenceId: 'boost_1' });
    const b = await client.spend({ wallet: WALLET, amountGsera: 300, reason: 'cause_boost', referenceId: 'boost_1' });
    expect(b.status).toBe('already_spent');
    expect(b.spendId).toBe(a.spendId);
    expect((await client.getWallet(WALLET)).spent).toBe(300);
  });

  it('credit is idempotent on (grantType, referenceId, wallet)', async () => {
    const client = createGseraClient({ mode: 'mock' });

    const a = await client.credit({ wallet: WALLET, amountGsera: 9900, grantType: 'causes_gift', referenceId: 'gift_1', reason: 'vested' });
    const b = await client.credit({ wallet: WALLET, amountGsera: 9900, grantType: 'causes_gift', referenceId: 'gift_1', reason: 'vested again' });
    // Same referenceId under a different grant type is a different key.
    const c = await client.credit({ wallet: WALLET, amountGsera: 100, grantType: 'causes_vote', referenceId: 'gift_1', reason: 'vote' });

    expect(a.status).toBe('granted');
    expect(b.status).toBe('already_granted');
    expect(b.grantId).toBe(a.grantId);
    expect(c.status).toBe('granted');
    expect((await client.getWallet(WALLET)).spendable).toBe(10000);
  });

  it('credit to another wallet with the same referenceId is a separate grant', async () => {
    const client = createGseraClient({ mode: 'mock' });
    const other = '0x3333333333333333333333333333333333333333';
    await client.credit({ wallet: WALLET, amountGsera: 100, grantType: 'causes_vote', referenceId: 'claim_1', reason: 'vote' });
    await client.credit({ wallet: other, amountGsera: 100, grantType: 'causes_vote', referenceId: 'claim_1', reason: 'vote' });
    expect((await client.getWallet(WALLET)).spendable).toBe(100);
    expect((await client.getWallet(other)).spendable).toBe(100);
  });

  it('lowercases wallets so mixed-case input hits the same balance', async () => {
    const client = createGseraClient({ mode: 'mock' });
    const mixed = '0xAbCd000000000000000000000000000000000001';
    await client.credit({ wallet: mixed, amountGsera: 10, grantType: 'causes_path', referenceId: 'h1', reason: 'r' });
    expect((await client.getWallet(mixed.toLowerCase())).spendable).toBe(10);
  });

  it('reverseCredit removes the grant from earned and is idempotent', async () => {
    const client = createGseraClient({ mode: 'mock' });
    await client.credit({ wallet: WALLET, amountGsera: 2500, grantType: 'causes_listing', referenceId: 'cause_7', reason: 'verified' });
    await client.spend({ wallet: WALLET, amountGsera: 2000, reason: 'cause_boost', referenceId: 'b1' });

    const a = await client.reverseCredit('cause_7', 'causes_listing', WALLET, 'linked wallet');
    const b = await client.reverseCredit('cause_7', 'causes_listing', WALLET);
    expect(a.status).toBe('reversed');
    expect(b.status).toBe('already_reversed');

    const w = await client.getWallet(WALLET);
    expect(w.earned).toBe(0);
    expect(w.spent).toBe(2000);
    expect(w.spendable).toBe(0);
  });

  it('reverseCredit of an unknown grant throws NOT_FOUND', async () => {
    const client = createGseraClient({ mode: 'mock' });
    const p = client.reverseCredit('nope', 'causes_gift', WALLET);
    await expect(p).rejects.toBeInstanceOf(GseraError);
    await expect(p).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('works through a custom async store', async () => {
    const rows = new Map<string, string>();
    const store: MockStore = {
      async get(wallet) {
        const raw = rows.get(wallet);
        return raw ? (JSON.parse(raw) as MockWalletState) : undefined;
      },
      async set(wallet, state) {
        rows.set(wallet, JSON.stringify(state));
      },
    };
    const client = createGseraClient({ mode: 'mock', store });

    await client.seed(WALLET, 100);
    await client.credit({ wallet: WALLET, amountGsera: 50, grantType: 'causes_path', referenceId: 'p1', reason: 'r' });
    await client.spend({ wallet: WALLET, amountGsera: 120, reason: 'cause_boost', referenceId: 'b1' });

    // Another client on the same store sees the same balance.
    const again = createGseraClient({ mode: 'mock', store });
    expect(await again.getWallet(WALLET)).toMatchObject({ earned: 150, spent: 120, spendable: 30 });
    expect(rows.size).toBe(1);
  });

  it('memory store can be inspected', async () => {
    const store = createMemoryStore();
    const client = createGseraClient({ mode: 'mock', store });
    await client.seed(WALLET, 5);
    expect(store.dump()[WALLET]?.earned).toBe(5);
  });
});
