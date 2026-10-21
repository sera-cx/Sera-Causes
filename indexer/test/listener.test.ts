import { beforeEach, describe, expect, it } from 'vitest';
import { stringToHex, keccak256, toBytes } from 'viem';
import { db } from '../src/db.js';
import { applyLog, type DecodedLog } from '../src/chain/listener.js';
import { addr, makeCause, reset } from './helpers.js';

const ctx = { chainId: 1337 };
const b32 = (s: string) => stringToHex(s, { size: 32 });
let n = 0;
const log = (eventName: string, args: Record<string, unknown>, at = new Date('2026-10-19T01:00:00Z')): DecodedLog => ({
  eventName,
  args,
  blockNumber: BigInt(++n),
  transactionHash: keccak256(toBytes(`tx:${n}`)),
  logIndex: 0,
  at,
});

const profile = {
  schema: 'csd.cause/1', slug: 'test-cause', name: 'Test Cause', legalName: 'Test Cause', category: 'environment',
  location: { town: '', state: 'Penang', country: 'MY' }, summary: 's', programmes: [], impact: [], beneficiaries: '',
  organisation: { entityType: '', registration: '', registrationSource: '', founded: '', founders: '', leadership: '', taxExemption: { statement: '', source: '' }, accounts: '' },
  contact: {}, sources: [], profileCheckedOn: '2026-10-17',
};

describe('registry event folding', () => {
  beforeEach(async () => {
    await reset();
  });

  it('lists a cause from a data: uri profile, creates claim states and the record event', async () => {
    const uri = `data:application/json,${encodeURIComponent(JSON.stringify(profile))}`;
    const l = log('CauseListed', { causeId: 7n, owner: addr('owner'), category: b32('environment'), payout: addr('owner'), uri, frontend: b32('causes.sera.cx') });
    expect(await applyLog(l, ctx)).toBe(true);
    expect(await applyLog(l, ctx)).toBe(false);
    const cause = await db().cause.findUniqueOrThrow({ where: { id: 7 } });
    expect(cause.slug).toBe('test-cause');
    expect((cause.profile as { name: string }).name).toBe('Test Cause');
    expect(cause.category).toBe('environment');
    expect(cause.lister).toBe(addr('owner'));
    expect(await db().claimState.count({ where: { causeId: 7 } })).toBe(7);
    expect(await db().recordEvent.count({ where: { causeId: 7, type: 'CauseListed' } })).toBe(1);
    // Listing earns 100 XP on community.sera.cx, once.
    const listed = await db().xpEvent.findMany({ where: { eventType: 'care_cause_listed', causeId: 7 } });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ wallet: addr('owner'), xp: 100, state: 'queued', sourceRef: 'cause:7' });
  });

  it('queues 500 XP for the lister when the charity claims the cause', async () => {
    await makeCause(3, { owner: addr('owner') });
    await applyLog(log('OwnerChanged', { causeId: 3n, owner: addr('helper') }), ctx);
    expect((await db().cause.findUniqueOrThrow({ where: { id: 3 } })).owner).toBe(addr('helper'));
    const claimed = await db().xpEvent.findFirstOrThrow({ where: { eventType: 'care_charity_claimed', causeId: 3 } });
    expect(claimed).toMatchObject({ wallet: addr('owner'), xp: 500, state: 'queued' });
  });

  it('reads a seed profile by relative uri and stores the photo url', async () => {
    const l = log('CauseListed', { causeId: 8n, owner: addr('owner'), category: b32('environment'), payout: addr('owner'), uri: 'seed/causes/free-tree-society.json', frontend: b32('causes.sera.cx') });
    await applyLog(l, ctx);
    const cause = await db().cause.findUniqueOrThrow({ where: { id: 8 } });
    expect(cause.slug).toBe('free-tree-society');
    expect(cause.photoUrl).toBe('http://localhost:3001/photos/free-tree-society.jpg');
  });

  it('records claim outcomes, opens a challenge window, and reopens the epoch on needs_more or payout change', async () => {
    await makeCause(1);
    const root = keccak256(toBytes('inputs'));
    await applyLog(log('ClaimFinalised', { causeId: 1n, claim: 0, outcome: 1, resultRoot: root, by: addr('steward') }), ctx);
    let cs = await db().claimState.findUniqueOrThrow({ where: { causeId_claimType: { causeId: 1, claimType: 'C1' } } });
    expect(cs.outcome).toBe('verified');
    expect(cs.state).toBe('challenge_window');
    expect(cs.resultRoot).toBe(root);
    await applyLog(log('ClaimFinalised', { causeId: 1n, claim: 1, outcome: 3, resultRoot: root, by: addr('steward') }), ctx);
    cs = await db().claimState.findUniqueOrThrow({ where: { causeId_claimType: { causeId: 1, claimType: 'C2' } } });
    expect(cs.outcome).toBe('needs_more');
    expect(cs.epoch).toBe(1);
    expect(cs.state).toBe('open');
    await applyLog(log('ClaimFinalised', { causeId: 1n, claim: 2, outcome: 1, resultRoot: root, by: addr('steward') }), ctx);
    await applyLog(log('PayoutChanged', { causeId: 1n, payout: addr('helper') }), ctx);
    cs = await db().claimState.findUniqueOrThrow({ where: { causeId_claimType: { causeId: 1, claimType: 'C3' } } });
    expect(cs.outcome).toBe('open');
    expect(cs.epoch).toBe(1);
    expect((await db().cause.findUniqueOrThrow({ where: { id: 1 } })).payout).toBe(addr('helper'));
  });

  it('queues the listing XP and notifies givers when a cause becomes Verified', async () => {
    await makeCause(1, { owner: addr('owner') });
    await db().gift.create({ data: { causeId: 1, sender: addr('giver'), token: '0x1000000000000000000000000000000000000002', amount: '1000000', usd: 1, source: 'direct', txHash: `0x${'1'.padStart(64, '0')}`, logIndex: 0, block: 1n, kytState: 'clear', createdAt: new Date() } });
    await db().wallet.create({ data: { address: addr('giver'), email: 'giver@example.org' } });
    await applyLog(log('StatusChanged', { causeId: 1n, status: 2, by: addr('steward'), note: 'all required claims verified' }), ctx);
    const cause = await db().cause.findUniqueOrThrow({ where: { id: 1 } });
    expect(cause.status).toBe('verified');
    expect(cause.verifiedAt).toBeTruthy();
    const reward = await db().xpEvent.findFirstOrThrow({ where: { eventType: 'care_cause_verified' } });
    expect(reward.wallet).toBe(addr('owner'));
    expect(reward.xp).toBe(1500);
    expect(reward.state).toBe('queued');
    // Helper actions never credit gSera.
    expect(await db().ledgerEntry.count()).toBe(0);
    expect(await db().notification.count({ where: { wallet: addr('giver'), kind: 'cause_verified' } })).toBe(1);
    expect(await db().emailOutbox.count({ where: { to: 'giver@example.org' } })).toBe(1);
    // Listing XP is queued once.
    await applyLog(log('StatusChanged', { causeId: 1n, status: 2, by: addr('steward'), note: 'again' }), ctx);
    expect(await db().xpEvent.count({ where: { eventType: 'care_cause_verified' } })).toBe(1);
  });

  it('mirrors needs, pledges and a closed need with the helper badge', async () => {
    await makeCause(1);
    const need = { kind: 'visit', title: 'Visit', detail: 'Go there' };
    await applyLog(log('NeedPosted', { needId: 1n, causeId: 1n, uri: `data:application/json,${encodeURIComponent(JSON.stringify(need))}` }), ctx);
    await applyLog(log('Pledged', { needId: 1n, helper: addr('helper'), uri: `data:application/json,${encodeURIComponent(JSON.stringify({ note: 'I can go' }))}` }), ctx);
    await applyLog(log('NeedClosed', { needId: 1n, helper: addr('helper') }), ctx);
    const row = await db().need.findUniqueOrThrow({ where: { id: 1 }, include: { pledges: true } });
    expect(row.title).toBe('Visit');
    expect(row.open).toBe(false);
    expect(row.pledges[0]?.note).toBe('I can go');
    // A cause owner's word is not checkable, so a confirmed need pays a badge and no XP.
    const badge = await db().helperBadge.findFirstOrThrow({ where: { slug: 'helper' } });
    expect(badge.wallet).toBe(addr('helper'));
    expect(badge.sourceRef).toBe('need:1');
    expect(await db().xpEvent.count()).toBe(0);
  });
});
