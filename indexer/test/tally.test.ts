import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { textHash } from '@sera-causes/shared';
import { createApp } from '../src/api/app.js';
import { db } from '../src/db.js';
import { buildInputs, openChallengeWindow, publishInputs } from '../src/finaliser/core.js';
import { settleClaim, resolveChallenge } from '../src/ledger/rewards.js';
import { getGsera } from '../src/services/gsera.js';
import { accounts, addr, jsonMessage, makeCause, now, reset, setClaim, sign } from './helpers.js';

const app = createApp();

async function vote(account: typeof accounts.helper, choice: number, reason = 'checked') {
  const message = { causeId: 1n, claimType: 0, epoch: 0, choice, reasonHash: textHash(reason), signedAt: BigInt(now()) };
  const signature = await sign(account, 'Vote', message);
  const r = await request(app).post('/api/v1/votes').set('X-Dev-Wallet', account.address.toLowerCase()).send({ wallet: account.address, message: jsonMessage(message), reason, signature });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body;
}

describe('advisory mode tally and finaliser', () => {
  beforeEach(async () => {
    await reset();
    await makeCause(1);
    await setClaim(1, 'C1', { state: 'voting', votingStart: new Date(), votingEnd: new Date(Date.now() + 5 * 86400e3) });
    // Make every voter eligible through a reputation-free contribution and enough weight for quorum.
    for (const k of ['helper', 'helper2', 'giver', 'owner', 'steward'] as const) {
      await db().path.create({ data: { causeId: 1, claimType: 'C1', epoch: 0, author: addr(k), body: {}, contentHash: `0x${'1'.repeat(64)}`, result: k === 'steward' ? 'not_verified' : 'verified', checkedAt: new Date(), signature: '0x' } });
      await db().reputation.upsert({ where: { wallet: addr(k) }, create: { wallet: addr(k), score: 3 }, update: { score: 3 } });
    }
  });

  it('stores and tallies votes but never changes the claim state in advisory mode', async () => {
    for (const k of ['helper', 'helper2', 'giver', 'owner'] as const) await vote(accounts[k], 1);
    const last = await vote(accounts.steward, 2);
    expect(last.tally.quorumMet).toBe(true);
    expect(last.tally.passed).toBe(true);
    expect(last.tally.outcome).toBe('verified');
    const cs = await db().claimState.findUniqueOrThrow({ where: { causeId_claimType: { causeId: 1, claimType: 'C1' } } });
    expect(cs.state).toBe('voting');
    expect(cs.outcome).toBe('open');
    const claim = await request(app).get('/api/v1/claims/1/C1');
    expect(claim.body.decidedBy).toBe('stewards');
    expect(claim.body.tally.voters).toBe(5);
  });

  it('finaliser builds recomputable inputs, opens the window, then settlement pays agreeing helpers', async () => {
    for (const k of ['helper', 'helper2', 'giver', 'owner'] as const) await vote(accounts[k], 1);
    await vote(accounts.steward, 2);
    const inputs = await buildInputs(1, 'C1', 'verified');
    expect(inputs.votes).toHaveLength(5);
    expect(inputs.paths).toHaveLength(5);
    expect(inputs.resultRoot).toMatch(/^0x[0-9a-f]{64}$/);
    expect(inputs.leaves).toHaveLength(10);
    const file = await publishInputs(inputs);
    expect(file).toMatch(/results\/1-C1-0\.json$/);
    await openChallengeWindow(inputs);
    let cs = await db().claimState.findUniqueOrThrow({ where: { causeId_claimType: { causeId: 1, claimType: 'C1' } } });
    expect(cs.state).toBe('challenge_window');
    expect(cs.outcome).toBe('verified');
    expect(cs.resultRoot).toBe(inputs.resultRoot);

    // Window still open: nothing settles.
    expect(await settleClaim(cs, new Date())).toBeNull();
    const later = new Date(Date.now() + 73 * 3600e3);
    await db().claimState.update({ where: { causeId_claimType: { causeId: 1, claimType: 'C1' } }, data: { challengeWindowEnd: new Date(Date.now() - 1000) } });
    cs = await db().claimState.findUniqueOrThrow({ where: { causeId_claimType: { causeId: 1, claimType: 'C1' } } });
    const paid = await settleClaim(cs, later);
    expect(paid).toEqual({ paths: 4, votes: 4 });
    cs = await db().claimState.findUniqueOrThrow({ where: { causeId_claimType: { causeId: 1, claimType: 'C1' } } });
    expect(cs.state).toBe('final');
    expect((await db().ledgerEntry.findMany({ where: { reason: 'path' } })).every((e) => e.amount === 1000 && e.state === 'credited')).toBe(true);
    expect((await db().ledgerEntry.findMany({ where: { reason: 'vote' } })).every((e) => e.amount === 100)).toBe(true);
    expect((await db().reputation.findUniqueOrThrow({ where: { wallet: addr('helper') } })).score).toBe(5);
    expect((await db().reputation.findUniqueOrThrow({ where: { wallet: addr('steward') } })).score).toBe(3);
    expect((await db().path.findFirstOrThrow({ where: { author: addr('steward') } })).outcomeAgreed).toBe(false);
    expect((await getGsera().getWallet(addr('helper'))).spendable).toBe(1100);
  });

  it('upheld challenge returns the stake plus 2,000, reopens the epoch and costs overturned helpers 3 reputation', async () => {
    await vote(accounts.helper, 1);
    await setClaim(1, 'C1', { state: 'challenge_window', outcome: 'verified', challengeWindowEnd: new Date(Date.now() + 3600e3) });
    const gsera = getGsera() as unknown as { seed: (w: string, n: number) => Promise<unknown> };
    await gsera.seed(addr('giver'), 6000);
    const { stakeChallenge } = await import('../src/ledger/rewards.js');
    const ch = await db().challenge.create({ data: { causeId: 1, claimType: 'C1', epoch: 0, challenger: addr('giver'), stake: 5000, contentHash: `0x${'2'.repeat(64)}`, body: {}, signature: '0x' } });
    await stakeChallenge(addr('giver'), ch.id);
    expect((await getGsera().getWallet(addr('giver'))).spendable).toBe(1000);
    await resolveChallenge(ch.id, 'upheld');
    expect((await getGsera().getWallet(addr('giver'))).spendable).toBe(8000);
    const cs = await db().claimState.findUniqueOrThrow({ where: { causeId_claimType: { causeId: 1, claimType: 'C1' } } });
    expect(cs.epoch).toBe(1);
    expect(cs.state).toBe('open');
    // The helper's agreeing path and agreeing vote were both overturned: 3 - 3 - 3.
    expect((await db().reputation.findUniqueOrThrow({ where: { wallet: addr('helper') } })).score).toBe(-3);
    expect(await db().reputationEntry.count({ where: { wallet: addr('helper'), reason: { in: ['path_overturned', 'vote_overturned'] } } })).toBe(2);
  });
});
