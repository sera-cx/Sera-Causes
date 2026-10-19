import { describe, expect, it } from 'vitest';

import { GSERA, VOTING } from '../src/constants.js';
import { textHash } from '../src/eip712.js';
import {
  EMPTY_ROOT,
  causeStage,
  challengeWindowEnd,
  feedOrder,
  giftCapRemaining,
  giftGsera,
  giftMultiplier,
  isRequiredClaim,
  merkleLeafFor,
  merkleRoot,
  newestCauses,
  requiredClaimsFor,
  tallyClaim,
  voteWeight,
  votingCanClose,
  votingCanOpen,
} from '../src/rules.js';
import type { FeedCause, FeedEvent, Hex, Vote } from '../src/types.js';

const wallet = (n: number) => `0x${n.toString(16).padStart(40, '0')}` as `0x${string}`;

describe('giftGsera (brief 6.2)', () => {
  it('US$50 at 1.5 heat, 1.2 volume and 1.1 streak earns 9,900 gSera (the brief example)', () => {
    expect(giftGsera(50, { heat: 1.5, volumeTier: 1.2, streak: 1.1 })).toBe(9900);
  });

  it('US$50 to an urgent appeal at 1.2 volume and 1.1 streak earns 16,500', () => {
    expect(giftGsera(50, { heat: 'urgent', volumeTier: 1.2, streak: 1.1 })).toBe(16500);
  });

  it('base rate is 100 per US$1 with no multipliers', () => {
    expect(giftGsera(1)).toBe(100);
    expect(giftGsera(25, { heat: 'normal' })).toBe(2500);
  });

  it('caps the compound multiplier at 10x', () => {
    expect(giftMultiplier({ heat: 20, volumeTier: 1.6, streak: 1.3 })).toBe(GSERA.compoundCap);
    expect(giftGsera(10, { heat: 20 })).toBe(10000);
  });

  it('floors fractional gSera and refuses bad input', () => {
    expect(giftGsera(0.333)).toBe(33);
    expect(() => giftGsera(-1)).toThrow(RangeError);
    expect(() => giftGsera(1, { streak: -1 })).toThrow(RangeError);
  });

  it('heat has only urgent and normal tiers', () => {
    expect(Object.keys(GSERA.heat).sort()).toEqual(['normal', 'urgent']);
  });
});

describe('giftCapRemaining (brief 6.7, docs/PLAN.md 6)', () => {
  const now = Date.parse('2026-10-19T00:00:00Z');
  const day = 24 * 60 * 60 * 1000;

  it('counts only gifts inside the rolling 30-day window', () => {
    const prior = [
      { at: now - 2 * day, usd: 400 },
      { at: now - 29 * day, usd: 300 },
      { at: now - 31 * day, usd: 900 },
    ];
    expect(giftCapRemaining(prior, now)).toBe(300);
  });

  it('never goes below zero', () => {
    expect(giftCapRemaining([{ at: now - day, usd: 5000 }], now)).toBe(0);
    expect(giftCapRemaining([], now)).toBe(GSERA.giftCapUsdPerWalletPerCausePer30d);
  });
});

describe('voteWeight (brief 7.6)', () => {
  it('is 1 for a new voter and 5 at most', () => {
    expect(voteWeight(0)).toBe(1);
    expect(voteWeight(1)).toBe(2);
    expect(voteWeight(3)).toBe(3);
    expect(voteWeight(7)).toBe(4);
    expect(voteWeight(15)).toBe(5);
    expect(voteWeight(1000)).toBe(5);
  });

  it('treats negative or missing reputation as 0', () => {
    expect(voteWeight(-4)).toBe(1);
    expect(voteWeight(Number.NaN)).toBe(1);
  });
});

describe('tallyClaim (brief 7.5)', () => {
  const vote = (n: number, choice: Vote['choice'], signedAt = n): Pick<Vote, 'voter' | 'choice' | 'signedAt'> => ({
    voter: wallet(n),
    choice,
    signedAt,
  });

  it('needs total weight of at least 7 for quorum', () => {
    const six = [1, 2, 3, 4, 5, 6].map((n) => vote(n, 'verified'));
    const t6 = tallyClaim(six, {});
    expect(t6.total).toBe(6);
    expect(t6.quorumMet).toBe(false);
    expect(t6.passed).toBe(false);
    expect(t6.outcome).toBe('needs_more');

    const seven = [...six, vote(7, 'verified')];
    const t7 = tallyClaim(seven, {});
    expect(t7.total).toBe(VOTING.quorumWeight);
    expect(t7.quorumMet).toBe(true);
    expect(t7.passed).toBe(true);
    expect(t7.outcome).toBe('verified');
  });

  it('passes at exactly 75% of weight and fails just under', () => {
    const six = [1, 2, 3, 4, 5, 6].map((n) => vote(n, 'verified'));
    const exact = tallyClaim([...six, vote(7, 'not_verified'), vote(8, 'not_verified')], {});
    expect(exact.total).toBe(8);
    expect(exact.verifiedShare).toBe(0.75);
    expect(exact.passed).toBe(true);

    const under = tallyClaim([...six, vote(7, 'not_verified'), vote(8, 'not_verified'), vote(9, 'needs_more')], {});
    expect(under.quorumMet).toBe(true);
    expect(under.passed).toBe(false);
  });

  it('weights votes by reputation, not by count', () => {
    const reps = { [wallet(1)]: 15, [wallet(2)]: 15 };
    const t = tallyClaim([vote(1, 'verified'), vote(2, 'not_verified'), vote(3, 'not_verified')], reps);
    expect(t.verified).toBe(5);
    expect(t.not).toBe(6);
    expect(t.total).toBe(11);
    expect(t.quorumMet).toBe(true);
    expect(t.passed).toBe(false);
    expect(t.outcome).toBe('not_verified');
  });

  it('accepts a Map of reputations and matches addresses case-insensitively', () => {
    const reps = new Map([[wallet(1), 15]]);
    const upper = wallet(1).toUpperCase().replace('0X', '0x') as `0x${string}`;
    const t = tallyClaim([{ voter: upper, choice: 'verified' }], reps);
    expect(t.verified).toBe(5);
  });

  it('counts one vote per wallet, keeping the earliest', () => {
    const t = tallyClaim([vote(1, 'not_verified', 10), vote(1, 'verified', 5)], {});
    expect(t.voters).toBe(1);
    expect(t.verified).toBe(1);
    expect(t.not).toBe(0);
  });

  it('falls back to Needs more evidence when it is at least as heavy as Not verified', () => {
    const votes = [
      ...[1, 2, 3, 4].map((n) => vote(n, 'verified')),
      vote(5, 'needs_more'),
      vote(6, 'needs_more'),
      vote(7, 'not_verified'),
    ];
    const t = tallyClaim(votes, {});
    expect(t.quorumMet).toBe(true);
    expect(t.passed).toBe(false);
    expect(t.outcome).toBe('needs_more');
  });

  it('is empty-safe', () => {
    const t = tallyClaim([], {});
    expect(t).toMatchObject({ verified: 0, not: 0, more: 0, total: 0, quorumMet: false, passed: false });
  });
});

describe('voting windows (brief 7.4, 7.5, 7.7)', () => {
  const start = Date.parse('2026-10-19T00:00:00Z');
  const hour = 60 * 60 * 1000;

  it('opens with two independent paths, case-insensitive on authors', () => {
    expect(votingCanOpen([wallet(1)])).toBe(false);
    expect(votingCanOpen([wallet(1), wallet(1).toUpperCase().replace('0X', '0x')])).toBe(false);
    expect(votingCanOpen([wallet(1), wallet(2)])).toBe(true);
  });

  it('closes early only after 48 hours when passed, otherwise after 5 days', () => {
    expect(votingCanClose({ passed: true }, start, start + 47 * hour)).toBe(false);
    expect(votingCanClose({ passed: true }, start, start + 48 * hour)).toBe(true);
    expect(votingCanClose({ passed: false }, start, start + 119 * hour)).toBe(false);
    expect(votingCanClose({ passed: false }, start, start + 120 * hour)).toBe(true);
  });

  it('challenge window is 72 hours after voting ends', () => {
    expect(challengeWindowEnd(start).getTime()).toBe(start + 72 * hour);
  });
});

describe('merkleRoot', () => {
  const leaf = (s: string): Hex => textHash(s);

  it('is deterministic and order independent', () => {
    const leaves = ['a', 'b', 'c', 'd', 'e'].map(leaf);
    const root = merkleRoot(leaves);
    expect(root).toMatch(/^0x[0-9a-f]{64}$/);
    expect(merkleRoot([...leaves].reverse())).toBe(root);
    expect(merkleRoot([leaves[3]!, leaves[0]!, leaves[4]!, leaves[1]!, leaves[2]!])).toBe(root);
  });

  it('changes when any leaf changes', () => {
    const leaves = ['a', 'b', 'c'].map(leaf);
    expect(merkleRoot(leaves)).not.toBe(merkleRoot(['a', 'b', 'x'].map(leaf)));
  });

  it('single leaf is its own root, empty set is the zero root', () => {
    expect(merkleRoot([leaf('only')])).toBe(leaf('only'));
    expect(merkleRoot([])).toBe(EMPTY_ROOT);
  });

  it('vote leaves differ by any signed field and are distinct from path leaves', () => {
    const vote: Vote = {
      causeId: 7,
      claimType: 'C1',
      epoch: 0,
      voter: wallet(1),
      choice: 'verified',
      reason: 'matches',
      signature: '0x',
      signedAt: 1792000000,
    };
    const a = merkleLeafFor({ kind: 'vote', vote });
    expect(merkleLeafFor({ kind: 'vote', vote: { ...vote } })).toBe(a);
    expect(merkleLeafFor({ kind: 'vote', vote: { ...vote, choice: 'not_verified' } })).not.toBe(a);
    expect(merkleLeafFor({ kind: 'vote', vote: { ...vote, reason: 'matches!' } })).not.toBe(a);
    expect(merkleLeafFor({ kind: 'vote', vote: { ...vote, epoch: 1 } })).not.toBe(a);
    const p = merkleLeafFor({
      kind: 'path',
      path: {
        author: wallet(1),
        causeId: 7,
        claimType: 'C1',
        epoch: 0,
        contentHash: textHash('body'),
        result: 'verified',
        checkedAt: '2026-10-19T06:05:00Z',
      },
    });
    expect(p).toMatch(/^0x[0-9a-f]{64}$/);
    expect(p).not.toBe(a);
  });
});

describe('required claims and stages (brief 5, 7.2)', () => {
  it('C6 is required only when flagged', () => {
    expect(requiredClaimsFor({ requiresCareLicence: false })).toEqual(['C1', 'C2', 'C3', 'C4']);
    expect(requiredClaimsFor({ requiresCareLicence: true })).toEqual(['C1', 'C2', 'C3', 'C4', 'C6']);
    expect(isRequiredClaim({ requiresCareLicence: false }, 'C6')).toBe(false);
    expect(isRequiredClaim({ requiresCareLicence: true }, 'C6')).toBe(true);
    expect(isRequiredClaim({ requiresCareLicence: true }, 'C5')).toBe(false);
  });

  it('maps a cause to its pill', () => {
    const listed = { status: 'listed' as const, requiresCareLicence: false };
    expect(causeStage(listed, [])).toMatchObject({ stage: 'new', label: 'New', tone: 'grey', done: 0, total: 4 });
    expect(causeStage({ ...listed, evidenceCount: 1 }, [])).toMatchObject({ stage: 'evidence_in', tone: 'amber' });
    expect(
      causeStage({ ...listed, evidenceCount: 3 }, [
        { claimType: 'C1', outcome: 'verified' },
        { claimType: 'C2', outcome: 'verified' },
        { claimType: 'C5', outcome: 'verified' },
      ]),
    ).toMatchObject({ stage: 'partly_verified', label: 'Partly verified', done: 2, total: 4 });
    expect(causeStage({ ...listed, status: 'verified' }, [])).toMatchObject({ stage: 'verified', tone: 'green' });
    expect(causeStage({ ...listed, status: 'suspended' }, [{ claimType: 'C1', outcome: 'verified' }])).toMatchObject({
      stage: 'paused',
      label: 'Paused',
      tone: 'red',
      done: 1,
    });
    expect(causeStage({ ...listed, status: 'closed' }, [])).toMatchObject({ stage: 'closed' });
  });

  it('counts C6 in the total for flagged causes', () => {
    const r = causeStage({ status: 'listed', requiresCareLicence: true }, [{ claimType: 'C6', outcome: 'verified' }]);
    expect(r).toMatchObject({ stage: 'partly_verified', done: 1, total: 5 });
  });
});

describe('feedOrder (docs/PLAN.md 2.2)', () => {
  const t = (iso: string) => Date.parse(iso);
  const cause = (id: number, over: Partial<FeedCause> = {}): FeedCause => ({
    id,
    status: 'listed',
    listedAt: t(`2026-10-${String(id).padStart(2, '0')}T00:00:00Z`),
    showOnHomepage: true,
    ...over,
  });

  it('orders by the most recent activity event per cause', () => {
    const causes = [cause(1), cause(2), cause(3)];
    const events: FeedEvent[] = [
      { causeId: 1, type: 'gift', at: '2026-10-15T00:00:00Z' },
      { causeId: 1, type: 'evidence', at: '2026-10-10T00:00:00Z' },
      { causeId: 2, type: 'claim_finalised', at: '2026-10-18T00:00:00Z' },
      { causeId: 3, type: 'update', at: '2026-10-12T00:00:00Z' },
    ];
    expect(feedOrder(causes, events).map((c) => c.id)).toEqual([2, 1, 3]);
  });

  it('breaks ties and places causes with no activity newest listed first', () => {
    const causes = [cause(1), cause(2), cause(3), cause(4)];
    const events: FeedEvent[] = [
      { causeId: 1, type: 'gift', at: '2026-10-15T00:00:00Z' },
      { causeId: 2, type: 'gift', at: '2026-10-15T00:00:00Z' },
    ];
    expect(feedOrder(causes, events).map((c) => c.id)).toEqual([2, 1, 4, 3]);
  });

  it('excludes causes without the homepage flag, steward-hidden, suspended and closed causes', () => {
    const causes = [
      cause(1, { showOnHomepage: false }),
      cause(2, { homepageHiddenReason: 'Reported, under review' }),
      cause(3, { status: 'suspended' }),
      cause(4, { status: 'closed' }),
      cause(5, { status: 'verified' }),
      cause(6),
    ];
    expect(feedOrder(causes, []).map((c) => c.id)).toEqual([6, 5]);
  });

  it('does not mutate its input and ignores duplicate ids', () => {
    const causes = [cause(1), cause(2), cause(1)];
    const copy = [...causes];
    const out = feedOrder(causes, []);
    expect(causes).toEqual(copy);
    expect(out.map((c) => c.id)).toEqual([2, 1]);
  });

  it('newestCauses lists the latest listed, feed flag or not', () => {
    const causes = [cause(1, { showOnHomepage: false }), cause(2), cause(3, { status: 'closed' }), cause(4)];
    expect(newestCauses(causes, 2).map((c) => c.id)).toEqual([4, 2]);
  });
});
