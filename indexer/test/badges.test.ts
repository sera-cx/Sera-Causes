/**
 * Helper badges, and the hole they were built to close.
 *
 * `care_help_fulfilled` and `care_translation` paid 250 XP each on nothing but
 * a cause owner's signed word, and a confirmed help request also counted as an
 * accepted contribution, which was enough to vote. A charity and a friend could
 * farm both between themselves forever. Help now earns a badge, and a badge
 * gates nothing.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { HELPER_BADGES, HELPER_BADGE_THRESHOLDS } from '@sera-causes/shared';
import { db } from '../src/db.js';
import { awardBadge, badgesFor } from '../src/ledger/badges.js';
import { rewardHelp, settleClaim } from '../src/ledger/rewards.js';
import { voterEligibility } from '../src/api/eligibility.js';
import { addr, makeCause, reset, setClaim } from './helpers.js';

const closed = { state: 'challenge_window', outcome: 'verified', challengeWindowEnd: new Date(Date.now() - 1000) };

async function need(id: number, kind: string) {
  return db().need.create({ data: { id, causeId: 1, uri: 'data:,', kind, title: `Need ${id}`, postedAt: new Date() } });
}

async function path(causeId: number, claimType: string, author: string, body: object = {}) {
  return db().path.create({
    data: { causeId, claimType, epoch: 0, author, body, contentHash: `0x${'1'.repeat(64)}`, result: 'verified', checkedAt: new Date(), signature: '0x' },
  });
}

async function settle(causeId: number, claimType: string) {
  await setClaim(causeId, claimType, closed);
  const cs = await db().claimState.findUniqueOrThrow({ where: { causeId_claimType: { causeId, claimType } } });
  return settleClaim(cs, new Date());
}

describe('a cause owner confirming help', () => {
  beforeEach(async () => {
    await reset();
    await makeCause(1, { owner: addr('owner') });
  });

  it('awards a badge and no XP at all', async () => {
    await need(1, 'visit');
    expect(await rewardHelp(1, addr('helper'))).toBe(true);
    const badges = await badgesFor(addr('helper'));
    expect(badges.map((b) => b.slug)).toEqual(['helper']);
    expect(badges[0]).toMatchObject({ causeId: 1, sourceRef: 'need:1' });
    expect(await db().xpEvent.count()).toBe(0);
  });

  it('tells a translation apart from any other help request', async () => {
    await need(1, 'translate');
    await need(2, 'visit');
    await rewardHelp(1, addr('helper'));
    await rewardHelp(2, addr('helper'));
    expect((await badgesFor(addr('helper'))).map((b) => b.slug).sort()).toEqual(['helper', 'translator']);
    expect(await db().xpEvent.count()).toBe(0);
  });

  it('tells the helper what they earned, and says help carries no XP', async () => {
    await need(1, 'translate');
    await rewardHelp(1, addr('helper'));
    const n = await db().notification.findFirstOrThrow({ where: { wallet: addr('helper'), kind: 'help_confirmed' } });
    expect(n.body).toContain(HELPER_BADGES.translator.label);
    expect(n.body).toContain('no XP');
  });
});

describe('a badge is earned once', () => {
  beforeEach(async () => {
    await reset();
    await makeCause(1, { owner: addr('owner') });
  });

  it('keeps the first award and ignores every one after it', async () => {
    await need(1, 'visit');
    await need(2, 'other');
    expect(await rewardHelp(1, addr('helper'))).toBe(true);
    // A second confirmed request, and the same request confirmed twice, both
    // add nothing: the (wallet, slug) index is the whole guard.
    expect(await rewardHelp(2, addr('helper'))).toBe(false);
    expect(await rewardHelp(1, addr('helper'))).toBe(false);
    const badges = await badgesFor(addr('helper'));
    expect(badges).toHaveLength(1);
    expect(badges[0]?.sourceRef).toBe('need:1');
    expect(await db().helperBadge.count()).toBe(1);
    expect(await db().notification.count({ where: { kind: 'help_confirmed' } })).toBe(1);
  });

  it('awards the same slug to a different wallet', async () => {
    expect(await awardBadge({ wallet: addr('helper'), slug: 'first_gift' })).not.toBeNull();
    expect(await awardBadge({ wallet: addr('helper'), slug: 'first_gift' })).toBeNull();
    expect(await awardBadge({ wallet: addr('helper2'), slug: 'first_gift' })).not.toBeNull();
    expect(await db().helperBadge.count({ where: { slug: 'first_gift' } })).toBe(2);
  });

  it('stores the wallet lowercase, however it arrives', async () => {
    await awardBadge({ wallet: addr('helper').toUpperCase(), slug: 'witness' });
    expect(await badgesFor(addr('helper'))).toHaveLength(1);
    expect(await awardBadge({ wallet: addr('helper'), slug: 'witness' })).toBeNull();
  });
});

describe('badges settled with a claim', () => {
  beforeEach(async () => {
    await reset();
    await makeCause(1, { owner: addr('owner') });
  });

  it('gives Witness to a C4 site visit with a dated photo', async () => {
    await db().evidence.create({
      data: { causeId: 1, claimType: 'C4', uploader: addr('helper'), kind: 'photo', fileUrl: '/uploads/1', fileHash: `0x${'2'.repeat(64)}`, title: 'Dated photo' },
    });
    await path(1, 'C4', addr('helper'));
    await path(1, 'C1', addr('helper2'));
    await settle(1, 'C4');
    await settle(1, 'C1');
    expect((await badgesFor(addr('helper'))).map((b) => b.slug)).toContain('witness');
    expect((await badgesFor(addr('helper2'))).map((b) => b.slug)).not.toContain('witness');
  });

  it('gives Path finder at ten agreeing paths and not before', async () => {
    const author = addr('helper');
    const under = HELPER_BADGE_THRESHOLDS.path_finder - 1;
    await db().path.createMany({
      data: Array.from({ length: under }, (_, i) => ({
        causeId: 1, claimType: 'C2', epoch: i, author,
        body: {}, contentHash: `0x${'3'.repeat(64)}`, result: 'verified', checkedAt: new Date(), signature: '0x', outcomeAgreed: true,
      })),
    });
    await path(1, 'C1', author);
    expect((await badgesFor(author)).map((b) => b.slug)).not.toContain('path_finder');
    await settle(1, 'C1');
    expect(await db().path.count({ where: { author, outcomeAgreed: true } })).toBe(HELPER_BADGE_THRESHOLDS.path_finder);
    expect((await badgesFor(author)).map((b) => b.slug)).toContain('path_finder');
  });

  it('gives Steady hand at twenty-five agreeing votes and not before', async () => {
    const voter = addr('helper');
    const under = HELPER_BADGE_THRESHOLDS.steady_hand - 1;
    await db().vote.createMany({
      data: Array.from({ length: under }, (_, i) => ({
        causeId: 1, claimType: 'C2', epoch: i, voter, choice: 'verified', reason: 'r', weight: 1,
        signature: '0x', signedAt: new Date(), outcomeAgreed: true,
      })),
    });
    await db().vote.create({
      data: { causeId: 1, claimType: 'C1', epoch: 0, voter, choice: 'verified', reason: 'r', weight: 1, signature: '0x', signedAt: new Date() },
    });
    expect((await badgesFor(voter)).map((b) => b.slug)).not.toContain('steady_hand');
    await settle(1, 'C1');
    expect(await db().vote.count({ where: { voter, outcomeAgreed: true } })).toBe(HELPER_BADGE_THRESHOLDS.steady_hand);
    expect((await badgesFor(voter)).map((b) => b.slug)).toContain('steady_hand');
  });
});

describe('voter eligibility', () => {
  beforeEach(async () => {
    await reset();
    await makeCause(1, { owner: addr('owner') });
  });

  /* The whole point of the change: a confirmed help request is the cause
     owner's word, so it must not buy a say in verification. */
  it('does not let a wallet vote on confirmed help alone', async () => {
    await need(1, 'visit');
    await db().need.update({ where: { id: 1 }, data: { confirmedHelper: addr('helper'), confirmedAt: new Date(), open: false } });
    await rewardHelp(1, addr('helper'));
    const e = await voterEligibility(addr('helper'));
    expect(e.canVote).toBe(false);
    expect(e.contributions).toBe(0);
    expect(e.reasons.join(' ')).toContain('does not count');
    expect((await badgesFor(addr('helper')))).toHaveLength(1);
  });

  it('lets a wallet vote on one signed path', async () => {
    await path(1, 'C1', addr('helper'));
    const e = await voterEligibility(addr('helper'));
    expect(e).toMatchObject({ canVote: true, contributions: 1, vestedGifts: 0, reasons: [] });
  });

  it('lets a wallet vote on one credited gift', async () => {
    await db().ledgerEntry.create({
      data: { wallet: addr('giver'), amount: 500, reason: 'gift', sourceTag: 'charity', sourceRef: 'gift:1', causeId: 1, state: 'credited' },
    });
    const e = await voterEligibility(addr('giver'));
    expect(e).toMatchObject({ canVote: true, vestedGifts: 1, reasons: [] });
  });

  it('says what actually qualifies when a wallet has nothing', async () => {
    const e = await voterEligibility(addr('helper2'));
    expect(e.canVote).toBe(false);
    expect(e.reasons[0]).toContain('one gift with credited gSera');
    expect(e.reasons[0]).toContain('verification path');
  });
});
