/**
 * zod schemas for every API write body and for `csd.cause/1` metadata.
 *
 * Signed writes share one shape: `{ wallet, message, signature }` plus any
 * off-chain body the message's hash commits to. The API verifies `signature`
 * against `wallet` with viem `verifyTypedData` after parsing.
 */
import { z } from 'zod';

import {
  CATEGORY_PROFILE_NAMES,
  CATEGORY_SLUGS,
  CHALLENGE_STAKE,
  CLAIMS,
} from './constants.js';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'expected a 20-byte hex address')
  .transform((s) => s.toLowerCase() as `0x${string}`);

export const bytes32Schema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'expected a 32-byte hex value')
  .transform((s) => s.toLowerCase() as `0x${string}`);

/** Any even-length hex string with at least one byte. Covers 65-byte EOA signatures and longer smart-wallet ones. */
export const signatureSchema = z
  .string()
  .regex(/^0x(?:[0-9a-fA-F]{2}){65,}$/, 'expected a hex signature of at least 65 bytes')
  .transform((s) => s as `0x${string}`);

/** uint256 as a JSON number or decimal string; parsed to bigint. */
export const uint256Schema = z
  .union([z.number().int().nonnegative(), z.string().regex(/^\d+$/, 'expected a decimal integer string')])
  .transform((v) => BigInt(v));

/** uint64 as a JSON number or decimal string; parsed to bigint. */
export const uint64Schema = uint256Schema.refine((v) => v <= (1n << 64n) - 1n, 'exceeds uint64');

export const uint32Schema = z.number().int().min(0).max(0xffffffff);
export const uint8Schema = z.number().int().min(0).max(255);

/** Chain cause id as a plain JSON number. */
export const causeIdSchema = z.number().int().nonnegative();

export const claimCodeSchema = z.enum(CLAIMS);

/** Solidity `ClaimType` index, 0 to 6. */
export const claimTypeIndexSchema = z.number().int().min(0).max(CLAIMS.length - 1);

export const pathResultSchema = z.enum(['verified', 'not_verified', 'could_not_check']);
export const voteChoiceSchema = z.enum(['verified', 'not_verified', 'needs_more']);
export const evidenceKindSchema = z.enum(['document', 'link', 'photo', 'video', 'signature']);
export const helpKindSchema = z.enum(['intro', 'visit', 'translate', 'items', 'skills', 'other']);

const isoDateTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'expected an ISO 8601 date-time');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
const httpUrl = z
  .string()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), 'expected an http(s) URL');
const shortText = (max: number) => z.string().trim().min(1).max(max);

// ---------------------------------------------------------------------------
// Cause metadata (`csd.cause/1`)
// ---------------------------------------------------------------------------

export const causeLocationSchema = z.object({
  town: z.string().trim().max(120),
  state: shortText(80),
  country: z.string().regex(/^[A-Z]{2}$/, 'expected ISO 3166 alpha-2'),
});

export const causeOrganisationSchema = z.object({
  entityType: z.string().max(200),
  registration: z.string().max(300),
  registrationSource: z.string().max(1000),
  founded: z.string().max(500),
  founders: z.string().max(2000),
  leadership: z.string().max(2000),
  taxExemption: z.object({
    statement: z.string().max(2000),
    source: z.string().max(1000),
  }),
  accounts: z.string().max(2000),
});

export const causeSocialsSchema = z
  .object({
    instagram: z.string().max(300).optional(),
    facebook: z.string().max(300).optional(),
    youtube: z.string().max(300).optional(),
    tiktok: z.string().max(300).optional(),
  })
  .strict();

export const causeContactSchema = z.object({
  address: z.string().max(500).optional(),
  phone: z.string().max(80).optional(),
  email: z.string().max(200).optional(),
  website: z.string().max(300).optional(),
  socials: causeSocialsSchema.optional(),
});

export const causeImageSchema = z.object({
  src: shortText(500),
  alt: z.string().max(500),
  credit: z.string().max(300).optional(),
  licence: z.string().max(120).optional(),
  sourceUrl: z.string().max(500).optional(),
  illustrative: z.boolean().optional(),
});

export const causeProfileSchema = z.object({
  schema: z.literal('csd.cause/1'),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'expected a lowercase slug'),
  name: shortText(200),
  legalName: z.string().max(300),
  category: z.enum(CATEGORY_PROFILE_NAMES as [string, ...string[]]),
  location: causeLocationSchema,
  summary: shortText(1000),
  programmes: z.array(z.string().max(500)),
  impact: z.array(z.string().max(500)),
  beneficiaries: z.string().max(1000),
  organisation: causeOrganisationSchema,
  contact: causeContactSchema,
  live: z.object({ note: z.string().max(1000) }).optional(),
  donationsToday: z.string().max(1000).optional(),
  image: causeImageSchema.optional(),
  background: z.string().max(5000).optional(),
  sources: z.array(z.string().max(500)),
  profileCheckedOn: isoDate,
});

export type CauseProfileInput = z.input<typeof causeProfileSchema>;

// ---------------------------------------------------------------------------
// POST /causes/prepare
// ---------------------------------------------------------------------------

/**
 * The Add a cause form (brief 10.5). The API builds the `csd.cause/1` profile
 * from it, or takes a full `profile` when a charity supplies one.
 */
export const prepareCauseSchema = z
  .object({
    name: shortText(200),
    category: z.enum(CATEGORY_SLUGS as [string, ...string[]]),
    town: z.string().trim().max(120),
    state: shortText(80),
    /** What the money pays for. */
    summary: shortText(280),
    website: httpUrl,
    registration: z.string().trim().max(120).optional(),
    payout: addressSchema.optional(),
    photos: z
      .array(
        z.object({
          url: httpUrl,
          alt: z.string().max(500).optional(),
        }),
      )
      .max(10)
      .optional(),
    /** "I took these or have permission to use them." */
    photoPermission: z.boolean().optional(),
    relationship: z.enum(['runs', 'volunteers', 'supports', 'other']),
    /** Children's homes and elderly care centres. */
    needsCareLicence: z.boolean().default(false),
    profile: causeProfileSchema.optional(),
  })
  .refine((v) => !v.photos || v.photos.length === 0 || v.photoPermission === true, {
    message: 'photoPermission must be ticked when photos are supplied',
    path: ['photoPermission'],
  });

// ---------------------------------------------------------------------------
// POST /evidence (the metadata part of the multipart body)
// ---------------------------------------------------------------------------

export const evidenceMetadataSchema = z
  .object({
    causeId: causeIdSchema,
    claimType: claimCodeSchema,
    kind: evidenceKindSchema,
    title: shortText(160),
    note: z.string().trim().max(2000).optional(),
    /** Required when `kind` is `link`. */
    link: httpUrl.optional(),
    /** keccak256 of the uploaded file, as computed by the browser. The API recomputes it. */
    fileHash: bytes32Schema.optional(),
    /** Personal data has been redacted. Must be true. */
    redactionConfirmed: z.literal(true),
  })
  .refine((v) => v.kind !== 'link' || !!v.link, { message: 'link is required for link evidence', path: ['link'] });

// ---------------------------------------------------------------------------
// Signed messages
// ---------------------------------------------------------------------------

export const pathMessageSchema = z.object({
  causeId: uint256Schema,
  claimType: claimTypeIndexSchema,
  epoch: uint32Schema,
  contentHash: bytes32Schema,
  /** 1 verified, 2 not_verified, 3 could_not_check. */
  result: z.number().int().min(1).max(3),
  checkedAt: uint64Schema,
});

export const voteMessageSchema = z.object({
  causeId: uint256Schema,
  claimType: claimTypeIndexSchema,
  epoch: uint32Schema,
  /** 1 verified, 2 not_verified, 3 needs_more. */
  choice: z.number().int().min(1).max(3),
  reasonHash: bytes32Schema,
  signedAt: uint64Schema,
});

export const homepageToggleMessageSchema = z.object({
  causeId: uint256Schema,
  shown: z.boolean(),
  signedAt: uint64Schema,
});

export const challengeMessageSchema = z.object({
  causeId: uint256Schema,
  claimType: claimTypeIndexSchema,
  epoch: uint32Schema,
  stake: uint256Schema.refine((v) => v === BigInt(CHALLENGE_STAKE), `stake must be exactly ${CHALLENGE_STAKE} gSera`),
  contentHash: bytes32Schema,
  signedAt: uint64Schema,
});

export const helpConfirmMessageSchema = z.object({
  needId: uint256Schema,
  helper: addressSchema,
  signedAt: uint64Schema,
});

/** The verification path template (brief 7.4). */
export const pathBodySchema = z.object({
  source: shortText(300),
  steps: z.array(shortText(1000)).min(1).max(30),
  exactQuery: shortText(500),
  findings: shortText(4000),
  matches: z.boolean(),
  screenshotHash: bytes32Schema,
  screenshotEvidenceId: z.string().max(100).optional(),
  checkedAt: isoDateTime,
  result: pathResultSchema,
  caveats: z.string().trim().max(2000).default(''),
  conflictOfInterest: shortText(1000),
});

export const pathSubmitSchema = z.object({
  wallet: addressSchema,
  message: pathMessageSchema,
  body: pathBodySchema,
  signature: signatureSchema,
});

export const voteSubmitSchema = z.object({
  wallet: addressSchema,
  message: voteMessageSchema,
  /** The one-line reason the vote panel asks for. Its keccak256 must equal `message.reasonHash`. */
  reason: shortText(280),
  signature: signatureSchema,
});

/** POST /causes/:id/homepage, signed by the cause owner. */
export const homepageToggleSubmitSchema = z.object({
  wallet: addressSchema,
  message: homepageToggleMessageSchema,
  signature: signatureSchema,
});

export const challengeBodySchema = z.object({
  statement: shortText(4000),
  evidenceIds: z.array(z.string().max(100)).max(50),
  path: pathBodySchema,
});

export const challengeSubmitSchema = z.object({
  wallet: addressSchema,
  message: challengeMessageSchema,
  body: challengeBodySchema,
  signature: signatureSchema,
});

export const helpConfirmSubmitSchema = z.object({
  wallet: addressSchema,
  message: helpConfirmMessageSchema,
  signature: signatureSchema,
});

// ---------------------------------------------------------------------------
// Gifts
// ---------------------------------------------------------------------------

export const giftQuoteSchema = z.object({
  causeId: causeIdSchema,
  /** Token contract address the giver holds. */
  fromToken: addressSchema,
  /** Raw token units as a decimal string. */
  amountRaw: z.string().regex(/^[1-9]\d*$/, 'expected a positive integer string'),
  /** Wallet that will sign; defaults to the authenticated wallet. */
  giver: addressSchema.optional(),
});

export const giftSubmitSchema = z.object({
  quoteId: shortText(200),
  signature: signatureSchema,
  permitSignature: signatureSchema.optional(),
  permitDeadline: uint64Schema.optional(),
});

// ---------------------------------------------------------------------------
// Steward actions (docs/PLAN.md section 2.2). Auth is the steward's session; the reason is public.
// ---------------------------------------------------------------------------

/** POST /stewards/urgent-appeal. Pins one cause to the top of the homepage with a written reason. */
export const urgentAppealSchema = z
  .object({
    causeId: causeIdSchema,
    /** Shown under "Urgent appeal, chosen by Sera.cx". */
    reason: shortText(500),
    /** When the appeal comes down. Open-ended when omitted. */
    endsAt: isoDateTime.optional(),
    /** Set to true to take the current appeal down instead of pinning one. */
    clear: z.boolean().default(false),
  })
  .refine((v) => !v.endsAt || Date.parse(v.endsAt) > Date.now(), {
    message: 'endsAt must be in the future',
    path: ['endsAt'],
  });

/** POST /stewards/hide. Takes a cause off the homepage with a public reason, or puts it back. */
export const stewardHideSchema = z.object({
  causeId: causeIdSchema,
  reason: shortText(500),
  /** false restores the creator's own homepage setting. */
  hidden: z.boolean().default(true),
});

// ---------------------------------------------------------------------------
// Help requests (postNeed payload)
// ---------------------------------------------------------------------------

export const helpRequestSchema = z.object({
  kind: helpKindSchema,
  title: shortText(120),
  detail: shortText(2000),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type PrepareCauseBody = z.infer<typeof prepareCauseSchema>;
export type EvidenceMetadataBody = z.infer<typeof evidenceMetadataSchema>;
export type PathSubmitBody = z.infer<typeof pathSubmitSchema>;
export type VoteSubmitBody = z.infer<typeof voteSubmitSchema>;
export type HomepageToggleSubmitBody = z.infer<typeof homepageToggleSubmitSchema>;
export type UrgentAppealBody = z.infer<typeof urgentAppealSchema>;
export type StewardHideBody = z.infer<typeof stewardHideSchema>;
export type ChallengeSubmitBody = z.infer<typeof challengeSubmitSchema>;
export type HelpConfirmSubmitBody = z.infer<typeof helpConfirmSubmitSchema>;
export type GiftQuoteBody = z.infer<typeof giftQuoteSchema>;
export type GiftSubmitBody = z.infer<typeof giftSubmitSchema>;
export type HelpRequestBody = z.infer<typeof helpRequestSchema>;
