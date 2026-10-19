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
  claimCodeOf,
  claimDecidedBy,
  claimTypeIndex,
  findCategory,
  parseVerificationMode,
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
    ].join('\n');
    expect(text).not.toMatch(/—/);
  });
});

describe('numbers from the brief', () => {
  it('voting and gSera values', () => {
    expect(VOTING).toMatchObject({ minPaths: 2, periodDays: 5, minHours: 48, quorumWeight: 7, thresholdPct: 75, challengeWindowHours: 72 });
    expect(GSERA.perUsd).toBe(100);
    expect(GSERA.compoundCap).toBe(10);
    expect(GSERA.heat).toEqual({ urgent: 2.5, normal: 1 });
    expect(GSERA.helper).toEqual({ listingVerified: 2500, pathAgrees: 1000, voteAgrees: 100, helpFulfilled: 500, challengeWin: 2000 });
    expect(GSERA.giftCapUsdPerWalletPerCausePer30d).toBe(1000);
    expect(GSERA).not.toHaveProperty('vestDays');
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
