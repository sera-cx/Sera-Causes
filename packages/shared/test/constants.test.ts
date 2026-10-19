import { describe, expect, it } from 'vitest';

import {
  CATEGORIES,
  CLAIMS,
  CLAIM_INFO,
  GSERA,
  MALAYSIAN_STATES,
  REQUIRED_CLAIMS,
  STATUS,
  VERIFICATION_MODES,
  VOTING,
  XP,
  XP_EVENT_TYPES,
  claimCodeOf,
  claimDecidedBy,
  claimTypeIndex,
  findCategory,
  parseVerificationMode,
  xpFor,
} from '../src/constants.js';
import { ClaimOutcome, ClaimType, claimOutcomeName, claimOutcomeValue } from '../src/types.js';

describe('claims', () => {
  it('index mirrors the Solidity enums', () => {
    expect(claimTypeIndex('C1')).toBe(ClaimType.C1_Registered);
    expect(claimTypeIndex('C7')).toBe(ClaimType.C7_Accounts);
    expect(claimCodeOf(5)).toBe('C6');
    expect(() => claimCodeOf(7)).toThrow(RangeError);
    expect(ClaimOutcome).toEqual({ Open: 0, Verified: 1, NotVerified: 2, NeedsMore: 3 });
    expect(claimOutcomeName(3)).toBe('needs_more');
    expect(claimOutcomeValue('not_verified')).toBe(2);
  });

  it('required claims are C1 to C4, badges are C5 and C7, C6 when flagged', () => {
    expect(REQUIRED_CLAIMS).toEqual(['C1', 'C2', 'C3', 'C4']);
    expect(CLAIM_INFO.C5.required).toBe('badge');
    expect(CLAIM_INFO.C6.required).toBe('when_flagged');
    expect(CLAIM_INFO.C7.required).toBe('badge');
  });

  it('copy mentions no escrow or refunds and uses no em dashes', () => {
    const text = [
      ...CLAIMS.flatMap((c) => [CLAIM_INFO[c].label, CLAIM_INFO[c].proof, CLAIM_INFO[c].whereToCheck]),
      ...Object.values(STATUS).flatMap((s) => [s.label, s.hint]),
      ...Object.values(XP).flatMap((x) => [x.label, x.when]),
    ].join('\n');
    expect(text).not.toMatch(/—/);
    expect(text).not.toMatch(/escrow|refund|vest/i);
  });
});

describe('numbers from the brief', () => {
  it('voting and gSera values', () => {
    expect(VOTING).toMatchObject({ minPaths: 2, periodDays: 5, minHours: 48, quorumWeight: 7, thresholdPct: 75, challengeWindowHours: 72 });
    expect(GSERA.perUsd).toBe(100);
    expect(GSERA.compoundCap).toBe(10);
    expect(GSERA.heat).toEqual({ urgent: 2.5, normal: 1 });
    expect(GSERA.giftCapUsdPerWalletPerCausePer30d).toBe(1000);
    expect(GSERA).not.toHaveProperty('vestDays');
  });

  it('gSera has no helper table: helpers earn XP instead', () => {
    expect(GSERA).not.toHaveProperty('helper');
  });
});

describe('Care XP (docs/PLAN.md section 7)', () => {
  it('has the agreed amounts for every Care event', () => {
    expect(Object.fromEntries(XP_EVENT_TYPES.map((t) => [t, xpFor(t)]))).toEqual({
      care_cause_listed: 100,
      care_cause_verified: 1500,
      care_evidence_accepted: 100,
      care_path_agreed: 400,
      care_site_visit: 400,
      care_vote_agreed: 25,
      care_help_fulfilled: 250,
      care_translation: 250,
      care_charity_claimed: 500,
      care_challenge_upheld: 1000,
      community_referral: 500,
    });
  });

  it('keys itself by event type and labels every event', () => {
    for (const t of XP_EVENT_TYPES) {
      expect(XP[t].type).toBe(t);
      expect(XP[t].label.length).toBeGreaterThan(2);
      expect(XP[t].when.length).toBeGreaterThan(2);
    }
    expect(() => xpFor('care_nothing' as never)).toThrow(RangeError);
  });

  it('never describes XP as spendable or as money', () => {
    const text = Object.values(XP).flatMap((x) => [x.label, x.when]).join('\n');
    expect(text).not.toMatch(/spend|cash|balance|worth|gSera per/i);
  });
});

describe('categories, states and pills', () => {
  it('has the twelve categories with slugs and profile names', () => {
    expect(CATEGORIES.map((c) => c.label)).toEqual([
      'Turtles', 'Marine', 'Wildlife', 'Environment', 'Animals', 'Children', 'Health', 'Food', 'Relief', 'Elderly', 'Women', 'Disability',
    ]);
    expect(findCategory('Food & poverty')?.slug).toBe('food');
    expect(findCategory('TURTLES')?.profileName).toBe('Turtles');
    expect(findCategory('bears')).toBeUndefined();
  });

  it('lists 13 states and 3 federal territories', () => {
    expect(MALAYSIAN_STATES.filter((s) => s.kind === 'state')).toHaveLength(13);
    expect(MALAYSIAN_STATES.filter((s) => s.kind === 'territory')).toHaveLength(3);
  });

  it('pills always have a word and a tone', () => {
    expect(Object.keys(STATUS)).toEqual(['new', 'evidence_in', 'partly_verified', 'verified', 'paused', 'closed']);
    expect(STATUS.partly_verified.showCount).toBe(true);
    expect(STATUS.verified.tone).toBe('green');
    expect(STATUS.paused.tone).toBe('red');
  });
});

describe('verification mode', () => {
  it('advisory means stewards decide, community means votes decide', () => {
    expect(VERIFICATION_MODES).toEqual(['advisory', 'community']);
    expect(claimDecidedBy('advisory')).toBe('stewards');
    expect(claimDecidedBy('community')).toBe('votes');
    expect(parseVerificationMode(undefined)).toBe('advisory');
    expect(parseVerificationMode('community')).toBe('community');
    expect(parseVerificationMode('something')).toBe('advisory');
  });
});
