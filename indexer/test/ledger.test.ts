import { beforeEach, describe, expect, it } from 'vitest';
import { createKytClient, createMockSettlement } from '@sera-causes/sera-settlement';
import { db } from '../src/db.js';
import { recordGiftLedger, cancelGiftEntry } from '../src/ledger/gifts.js';
import { getGsera } from '../src/services/gsera.js';
import { setSettlementForTests } from '../src/services/settlement.js';
import { applyTransfer, retryPendingKyt, type TransferLog } from '../src/chain/listener.js';
import { listStablecoins } from '../src/chain/stablecoins.js';
import { addr, makeCause, reset } from './helpers.js';

const TOKEN = { address: '0x1000000000000000000000000000000000000002', symbol: 'USDT', decimals: 6, currency: 'USD' };

async function gift(causeId: number, sender: string, usd: number, opts: { at?: Date; kytState?: string } = {}) {
  const n = await db().gift.count();
  return db().gift.create({
    data: {
      causeId,
      sender: sender.toLowerCase(),
      token: TOKEN.address,
      amount: String(BigInt(Math.round(usd * 1e6))),
      usd,
      source: 'direct',
      txHash: `0x${(n + 1).toString(16).padStart(64, '0')}`,
      logIndex: 0,
      block: BigInt(n + 1),
      kytState: opts.kytState ?? 'clear',
      createdAt: opts.at ?? new Date(),
    },
  });
}

describe('gift ledger maths', () => {
  beforeEach(async () => {
    await reset();
    await makeCause(1, { owner: addr('owner'), payout: addr('owner') });
  });

  it('credits usd x 100 x multipliers at once', async () => {
    const g = await gift(1, addr('giver'), 50);
    const r = await recordGiftLedger(g.id);
    expect(r.note).toBe('ok');
    expect(r.entry?.amount).toBe(5000);
    expect(r.entry?.state).toBe('credited');
    expect(r.entry?.gseraRef).toBeTruthy();
    const w = await getGsera().getWallet(addr('giver'));
    expect(w.spendable).toBe(5000);
    expect(await db().notification.count({ where: { wallet: addr('giver'), kind: 'gsera_credited' } })).toBe(1);
    // Idempotent.
    expect((await recordGiftLedger(g.id)).note).toBe('exists');
    expect((await getGsera().getWallet(addr('giver'))).spendable).toBe(5000);
  });

  it('applies the 2.5x urgent-appeal heat and the wallet multipliers from gSera, capped at 10x', async () => {
    await db().urgentAppeal.create({ data: { causeId: 1, reason: 'Floods', setBy: 'steward' } });
    const gsera = getGsera() as unknown as { setMultipliers: (w: string, m: Record<string, number>) => Promise<unknown> };
    await gsera.setMultipliers(addr('giver'), { volumeTier: 1.2, streak: 1.1 });
    const g = await gift(1, addr('giver'), 50);
    const r = await recordGiftLedger(g.id);
    expect(r.entry?.amount).toBe(Math.floor(50 * 100 * 2.5 * 1.2 * 1.1));
    expect((r.entry?.multipliers as { heat: number }).heat).toBe(2.5);
    await gsera.setMultipliers(addr('giver'), { volumeTier: 1.6, streak: 1.3 });
    const g2 = await gift(1, addr('giver'), 10);
    const r2 = await recordGiftLedger(g2.id);
    expect(r2.entry?.amount).toBe(10 * 100 * Math.min(10, 2.5 * 1.6 * 1.3));
  });

  it('keeps the US$1,000 per wallet per cause per 30 days cap', async () => {
    const t0 = new Date('2026-10-01T00:00:00Z');
    const a = await gift(1, addr('giver'), 800, { at: t0 });
    expect((await recordGiftLedger(a.id)).entry?.amount).toBe(80000);
    const b = await gift(1, addr('giver'), 500, { at: new Date(t0.getTime() + 86400e3) });
    const rb = await recordGiftLedger(b.id);
    expect(rb.eligibleUsd).toBe(200);
    expect(rb.entry?.amount).toBe(20000);
    const c = await gift(1, addr('giver'), 5, { at: new Date(t0.getTime() + 2 * 86400e3) });
    expect((await recordGiftLedger(c.id)).note).toBe('cap_reached');
    const d = await gift(1, addr('giver'), 100, { at: new Date(t0.getTime() + 31 * 86400e3) });
    expect((await recordGiftLedger(d.id)).entry?.amount).toBe(10000);
    // A different cause has its own cap.
    await makeCause(2);
    const e = await gift(2, addr('giver'), 100, { at: new Date(t0.getTime() + 2 * 86400e3) });
    expect((await recordGiftLedger(e.id)).entry?.amount).toBe(10000);
  });

  it('earns nothing for the owner, the deposit address or a flagged wallet', async () => {
    await makeCause(3, { owner: addr('owner'), payout: addr('helper') });
    expect((await recordGiftLedger((await gift(3, addr('owner'), 50)).id)).note).toBe('owner_or_payout');
    expect((await recordGiftLedger((await gift(3, addr('helper'), 50)).id)).note).toBe('owner_or_payout');
    expect((await recordGiftLedger((await gift(3, addr('giver'), 50, { kytState: 'flagged' })).id)).note).toBe('kyt_flagged');
    expect(await db().ledgerEntry.count()).toBe(0);
  });

  it('holds a gift while KYT is unknown and credits it once clear', async () => {
    const g = await gift(1, addr('giver'), 20, { kytState: 'unknown' });
    expect((await recordGiftLedger(g.id)).note).toBe('kyt_pending');
    await db().gift.update({ where: { id: g.id }, data: { kytState: 'clear' } });
    expect((await recordGiftLedger(g.id)).entry?.amount).toBe(2000);
  });

  it('retries a kyt_pending gift and credits it when the screen comes back clear', async () => {
    const g = await gift(1, addr('giver'), 20, { kytState: 'unknown' });
    await recordGiftLedger(g.id);
    expect(await retryPendingKyt()).toBe(1);
    expect((await db().gift.findUniqueOrThrow({ where: { id: g.id } })).ledgerNote).toBe('ok');
  });

  it('cancels a credited entry on steward clawback and reverses it on gSera', async () => {
    const g = await gift(1, addr('giver'), 50);
    await recordGiftLedger(g.id);
    const e = await cancelGiftEntry(g.id, 'linked to the owner');
    expect(e?.state).toBe('cancelled');
    expect((await getGsera().getWallet(addr('giver'))).spendable).toBe(0);
  });
});

describe('transfer scanning', () => {
  beforeEach(async () => {
    await reset();
    await makeCause(1, { owner: addr('owner'), payout: addr('owner') });
  });

  const transfer = (n: number, from: string, usd: number, to = addr('owner')): TransferLog => ({
    token: TOKEN.address,
    from,
    to,
    value: BigInt(usd) * 1_000_000n,
    blockNumber: BigInt(100 + n),
    transactionHash: `0x${(n + 1).toString(16).padStart(64, '0')}`,
    logIndex: 0,
    at: new Date('2026-10-19T02:00:00Z'),
  });

  it('records a stablecoin transfer to the deposit address as a gift, updates totals and credits gSera', async () => {
    const r = await applyTransfer(transfer(1, addr('giver'), 25), 1, TOKEN);
    expect(r.note).toBe('ok');
    const cause = await db().cause.findUniqueOrThrow({ where: { id: 1 } });
    expect(Number(cause.givenUsd)).toBe(25);
    expect(cause.giversCount).toBe(1);
    const g = await db().gift.findFirstOrThrow();
    expect(g.source).toBe('direct');
    expect(g.sender).toBe(addr('giver'));
    expect((await db().ledgerEntry.findFirstOrThrow()).amount).toBe(2500);
    expect(await db().recordEvent.count({ where: { type: 'GiftReceived', causeId: 1 } })).toBe(1);
    // Same log again is ignored.
    expect((await applyTransfer(transfer(1, addr('giver'), 25), 1, TOKEN)).note).toBe('exists');
    expect(await db().gift.count()).toBe(1);
  });

  it('values non-USD stablecoins through the settlement fx rate', async () => {
    setSettlementForTests(createMockSettlement({ network: 'sepolia' }), createKytClient({ mode: 'stub' }));
    const xsgd = { address: '0x1000000000000000000000000000000000000003', symbol: 'XSGD', decimals: 6, currency: 'SGD' };
    const r = await applyTransfer({ ...transfer(2, addr('giver'), 100), token: xsgd.address }, 1, xsgd);
    expect(r.giftId).toBeTruthy();
    const g = await db().gift.findFirstOrThrow();
    expect(Number(g.usd)).toBeGreaterThan(60);
    expect(Number(g.usd)).toBeLessThan(90);
  });

  it('treats a transfer from Sera.cx that matches a pending conversion as conversion output, not a gift', async () => {
    const tokens = await listStablecoins();
    expect(tokens.length).toBeGreaterThan(0);
    await db().conversion.create({ data: { causeId: 1, fromToken: tokens[0]!.address, toToken: TOKEN.address, amountIn: '1000000', state: 'pending', tradeId: 't1', triggeredBy: 'owner' } });
    const r = await applyTransfer(transfer(3, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa03', 1), 1, TOKEN);
    expect(r.note).toBe('conversion');
    expect(await db().gift.count()).toBe(0);
    expect((await db().conversion.findFirstOrThrow()).state).toBe('settled');
  });

  it('marks a transfer from a known Sera.cx trade as sera_swap and a planned site transfer as site', async () => {
    await db().giftTrade.create({ data: { id: 'q1', causeId: 1, giver: addr('giver'), recipient: addr('owner'), fromToken: TOKEN.address, toToken: TOKEN.address, amountRaw: '1', quote: {}, state: 'settled', tradeId: 'trade-1', txHash: `0x${'5'.padStart(64, '0')}`, expiresAt: new Date() } });
    await applyTransfer(transfer(4, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa03', 10), 1, TOKEN);
    expect((await db().gift.findFirstOrThrow()).source).toBe('sera_swap');
    await db().giftTrade.create({ data: { id: 'plan_1', causeId: 1, giver: addr('helper'), recipient: addr('owner'), fromToken: TOKEN.address, toToken: TOKEN.address, amountRaw: '1', quote: { kind: 'transfer' }, state: 'planned', expiresAt: new Date(Date.now() + 3600e3) } });
    await applyTransfer(transfer(6, addr('helper'), 10), 1, TOKEN);
    expect((await db().gift.findFirst({ where: { sender: addr('helper') } }))?.source).toBe('site');
  });
});
