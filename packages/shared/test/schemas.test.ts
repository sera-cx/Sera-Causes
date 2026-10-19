import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CHALLENGE_STAKE } from '../src/constants.js';
import { contentHash, textHash } from '../src/eip712.js';
import {
  causeProfileSchema,
  challengeSubmitSchema,
  evidenceMetadataSchema,
  giftQuoteSchema,
  giftSubmitSchema,
  helpConfirmSubmitSchema,
  helpRequestSchema,
  homepageToggleSubmitSchema,
  pathBodySchema,
  pathSubmitSchema,
  prepareCauseSchema,
  stewardHideSchema,
  urgentAppealSchema,
  voteSubmitSchema,
} from '../src/schemas.js';
import type { CauseProfile } from '../src/types.js';

const seedDir = join(import.meta.dirname, '..', '..', '..', 'seed', 'causes');
const addr = '0x1111111111111111111111111111111111111111';
const hash32 = `0x${'ab'.repeat(32)}`;
const sig = `0x${'cd'.repeat(65)}`;

const pathBody = {
  source: 'Registrar of Societies public search',
  steps: ['Opened the ROS public search.', 'Searched the registration number.', 'Opened the result.'],
  exactQuery: 'PPM-001-11-10062011',
  findings: 'Name: Persatuan Pemuliharaan Tuntung, Kura-Kura dan Penyu Malaysia. Status: active.',
  matches: true,
  screenshotHash: hash32,
  checkedAt: '2026-10-19T14:05:00+08:00',
  result: 'verified',
  caveats: 'The register does not show office-bearers publicly',
  conflictOfInterest: 'None. I have no relationship with this organisation',
};

describe('causeProfileSchema (csd.cause/1)', () => {
  const files = readdirSync(seedDir).filter((f) => f.endsWith('.json'));

  it('accepts all 44 seeded profiles', () => {
    expect(files.length).toBe(44);
    for (const f of files) {
      const raw = JSON.parse(readFileSync(join(seedDir, f), 'utf8'));
      const parsed = causeProfileSchema.safeParse(raw);
      expect(parsed.success, `${f}: ${parsed.success ? '' : JSON.stringify(parsed.error.issues)}`).toBe(true);
      const profile: CauseProfile = parsed.data as CauseProfile;
      expect(profile.schema).toBe('csd.cause/1');
    }
  });

  it('rejects an unknown schema, category or date', () => {
    const raw = JSON.parse(readFileSync(join(seedDir, 'bsbcc.json'), 'utf8'));
    expect(causeProfileSchema.safeParse({ ...raw, schema: 'csd.cause/2' }).success).toBe(false);
    expect(causeProfileSchema.safeParse({ ...raw, category: 'Bears' }).success).toBe(false);
    expect(causeProfileSchema.safeParse({ ...raw, profileCheckedOn: '17/10/2026' }).success).toBe(false);
    expect(causeProfileSchema.safeParse({ ...raw, location: { ...raw.location, country: 'MYS' } }).success).toBe(false);
  });
});

describe('prepareCauseSchema', () => {
  const body = {
    name: 'Kasih Turtle Conservation Project',
    category: 'turtles',
    town: 'Kemaman',
    state: 'Terengganu',
    summary: 'RM15 buys one hatchery basket.',
    website: 'https://example.org',
    relationship: 'runs',
  };

  it('accepts the add-a-cause form and defaults needsCareLicence', () => {
    const r = prepareCauseSchema.parse(body);
    expect(r.needsCareLicence).toBe(false);
  });

  it('needs the photo permission tick when photos are given', () => {
    expect(prepareCauseSchema.safeParse({ ...body, photos: [{ url: 'https://example.org/a.jpg' }] }).success).toBe(false);
    expect(
      prepareCauseSchema.safeParse({ ...body, photos: [{ url: 'https://example.org/a.jpg' }], photoPermission: true })
        .success,
    ).toBe(true);
  });

  it('limits the summary to 280 characters and lowercases the payout', () => {
    expect(prepareCauseSchema.safeParse({ ...body, summary: 'x'.repeat(281) }).success).toBe(false);
    expect(prepareCauseSchema.parse({ ...body, payout: addr.toUpperCase().replace('0X', '0x') }).payout).toBe(addr);
  });
});

describe('evidenceMetadataSchema', () => {
  it('requires the redaction confirmation and a link for link evidence', () => {
    const base = { causeId: 7, claimType: 'C1', kind: 'document', title: 'ROS certificate', redactionConfirmed: true };
    expect(evidenceMetadataSchema.safeParse(base).success).toBe(true);
    expect(evidenceMetadataSchema.safeParse({ ...base, redactionConfirmed: false }).success).toBe(false);
    expect(evidenceMetadataSchema.safeParse({ ...base, kind: 'link' }).success).toBe(false);
    expect(evidenceMetadataSchema.safeParse({ ...base, kind: 'link', link: 'https://example.org' }).success).toBe(true);
  });
});

describe('signed message bodies', () => {
  it('path: body must carry source, steps and a screenshot', () => {
    expect(pathBodySchema.safeParse(pathBody).success).toBe(true);
    expect(pathBodySchema.safeParse({ ...pathBody, steps: [] }).success).toBe(false);
    expect(pathBodySchema.safeParse({ ...pathBody, screenshotHash: '0x12' }).success).toBe(false);
    const { source: _s, ...noSource } = pathBody;
    expect(pathBodySchema.safeParse(noSource).success).toBe(false);
  });

  it('path submit parses uint256 fields to bigint', () => {
    const r = pathSubmitSchema.parse({
      wallet: addr,
      message: { causeId: '7', claimType: 0, epoch: 0, contentHash: contentHash(pathBody), result: 1, checkedAt: 1792000000 },
      body: pathBody,
      signature: sig,
    });
    expect(r.message.causeId).toBe(7n);
    expect(r.message.checkedAt).toBe(1792000000n);
    expect(r.body.result).toBe('verified');
  });

  it('vote submit needs a reason and a choice of 1 to 3', () => {
    const message = { causeId: 7, claimType: 0, epoch: 0, choice: 1, reasonHash: textHash('ok'), signedAt: 1792000000 };
    expect(voteSubmitSchema.safeParse({ wallet: addr, message, reason: 'ok', signature: sig }).success).toBe(true);
    expect(voteSubmitSchema.safeParse({ wallet: addr, message, reason: '', signature: sig }).success).toBe(false);
    expect(
      voteSubmitSchema.safeParse({ wallet: addr, message: { ...message, choice: 4 }, reason: 'ok', signature: sig }).success,
    ).toBe(false);
  });

  it('homepage toggle carries a boolean and is owner-signed', () => {
    const r = homepageToggleSubmitSchema.parse({
      wallet: addr,
      message: { causeId: 7, shown: true, signedAt: '1792000000' },
      signature: sig,
    });
    expect(r.message.shown).toBe(true);
    expect(r.message.signedAt).toBe(1792000000n);
    expect(
      homepageToggleSubmitSchema.safeParse({ wallet: addr, message: { causeId: 7, shown: 'yes', signedAt: 1 }, signature: sig })
        .success,
    ).toBe(false);
  });

  it('challenge stake must be exactly the constant', () => {
    const message = { causeId: 7, claimType: 0, epoch: 0, stake: CHALLENGE_STAKE, contentHash: hash32, signedAt: 1792000000 };
    const body = { statement: 'The register shows this society was struck off.', evidenceIds: ['ev_1'], path: pathBody };
    expect(challengeSubmitSchema.safeParse({ wallet: addr, message, body, signature: sig }).success).toBe(true);
    expect(
      challengeSubmitSchema.safeParse({ wallet: addr, message: { ...message, stake: CHALLENGE_STAKE - 1 }, body, signature: sig })
        .success,
    ).toBe(false);
  });

  it('help confirm lowercases the helper address', () => {
    const r = helpConfirmSubmitSchema.parse({
      wallet: addr,
      message: { needId: 3, helper: '0x2222222222222222222222222222222222222222'.toUpperCase().replace('0X', '0x'), signedAt: 1 },
      signature: sig,
    });
    expect(r.message.helper).toBe('0x2222222222222222222222222222222222222222');
  });

  it('rejects short signatures', () => {
    expect(
      homepageToggleSubmitSchema.safeParse({ wallet: addr, message: { causeId: 7, shown: true, signedAt: 1 }, signature: '0x1234' })
        .success,
    ).toBe(false);
  });
});

describe('steward actions', () => {
  it('urgent appeal needs a public reason and a future end', () => {
    expect(urgentAppealSchema.safeParse({ causeId: 7, reason: 'Floods in Kelantan, shelters need supplies' }).success).toBe(true);
    expect(urgentAppealSchema.safeParse({ causeId: 7, reason: '' }).success).toBe(false);
    expect(urgentAppealSchema.safeParse({ causeId: 7, reason: 'x', endsAt: '2020-01-01T00:00:00Z' }).success).toBe(false);
    expect(urgentAppealSchema.parse({ causeId: 7, reason: 'Taking it down', clear: true }).clear).toBe(true);
  });

  it('hide needs a public reason and defaults to hidden', () => {
    const r = stewardHideSchema.parse({ causeId: 7, reason: 'Reported for fraud, under review' });
    expect(r.hidden).toBe(true);
    expect(stewardHideSchema.safeParse({ causeId: 7 }).success).toBe(false);
  });
});

describe('gifts and help requests', () => {
  it('gift quote takes raw units as a positive integer string', () => {
    expect(giftQuoteSchema.safeParse({ causeId: 7, fromToken: addr, amountRaw: '50000000' }).success).toBe(true);
    expect(giftQuoteSchema.safeParse({ causeId: 7, fromToken: addr, amountRaw: '0' }).success).toBe(false);
    expect(giftQuoteSchema.safeParse({ causeId: 7, fromToken: addr, amountRaw: '1.5' }).success).toBe(false);
  });

  it('gift submit accepts an optional permit', () => {
    expect(giftSubmitSchema.safeParse({ quoteId: 'q_1', signature: sig }).success).toBe(true);
    const r = giftSubmitSchema.parse({ quoteId: 'q_1', signature: sig, permitSignature: sig, permitDeadline: 1792000000 });
    expect(r.permitDeadline).toBe(1792000000n);
  });

  it('help request payload matches docs/CAUSE-METADATA.md', () => {
    expect(helpRequestSchema.safeParse({ kind: 'visit', title: 'Visit the hatchery', detail: 'Any weekend in November.' }).success).toBe(true);
    expect(helpRequestSchema.safeParse({ kind: 'money', title: 'x', detail: 'y' }).success).toBe(false);
  });
});
