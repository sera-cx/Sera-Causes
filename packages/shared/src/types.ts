/**
 * Shared data model for Care Share Donate.
 *
 * Shapes follow docs/PRODUCT-BRIEF.md section 11.4 and ARCHITECTURE.md
 * section 5. Addresses are lowercase hex strings. Timestamps are ISO 8601
 * strings unless the field name ends in `At` and is documented as seconds.
 */
import type { Address, Hex } from 'viem';

import type { CauseStage, ClaimCode, FeedEventType } from './constants.js';

export type { Address, Hex };
export type { CauseStage, ClaimCode, FeedEventType, StatusTone, VerificationMode } from './constants.js';

// ---------------------------------------------------------------------------
// Enums mirrored from CauseRegistry.sol
// ---------------------------------------------------------------------------

/** Solidity `enum ClaimType`. Index matches `CLAIMS`. */
export const ClaimType = {
  C1_Registered: 0,
  C2_Current: 1,
  C3_Payout: 2,
  C4_WorkReal: 3,
  C5_TaxExempt: 4,
  C6_CareLicence: 5,
  C7_Accounts: 6,
} as const;
export type ClaimTypeValue = (typeof ClaimType)[keyof typeof ClaimType];

/** Solidity `enum ClaimOutcome`. */
export const ClaimOutcome = {
  Open: 0,
  Verified: 1,
  NotVerified: 2,
  NeedsMore: 3,
} as const;
export type ClaimOutcomeValue = (typeof ClaimOutcome)[keyof typeof ClaimOutcome];

/** String form of `ClaimOutcome`, used in the database and API. */
export type ClaimOutcomeName = 'open' | 'verified' | 'not_verified' | 'needs_more';

export const CLAIM_OUTCOME_NAMES: readonly ClaimOutcomeName[] = [
  'open',
  'verified',
  'not_verified',
  'needs_more',
];

export function claimOutcomeName(value: number): ClaimOutcomeName {
  const name = CLAIM_OUTCOME_NAMES[value];
  if (!name) throw new RangeError(`unknown claim outcome ${value}`);
  return name;
}

export function claimOutcomeValue(name: ClaimOutcomeName): ClaimOutcomeValue {
  return CLAIM_OUTCOME_NAMES.indexOf(name) as ClaimOutcomeValue;
}

/** Path result. Numeric values are the EIP-712 `result` field. */
export type PathResult = 'verified' | 'not_verified' | 'could_not_check';
export const PATH_RESULT: Readonly<Record<PathResult, 1 | 2 | 3>> = {
  verified: 1,
  not_verified: 2,
  could_not_check: 3,
};

/** Vote choice. Numeric values are the EIP-712 `choice` field. */
export type VoteChoice = 'verified' | 'not_verified' | 'needs_more';
export const VOTE_CHOICE: Readonly<Record<VoteChoice, 1 | 2 | 3>> = {
  verified: 1,
  not_verified: 2,
  needs_more: 3,
};

export function pathResultName(value: number): PathResult {
  const entry = (Object.entries(PATH_RESULT) as [PathResult, number][]).find(([, v]) => v === value);
  if (!entry) throw new RangeError(`unknown path result ${value}`);
  return entry[0];
}

export function voteChoiceName(value: number): VoteChoice {
  const entry = (Object.entries(VOTE_CHOICE) as [VoteChoice, number][]).find(([, v]) => v === value);
  if (!entry) throw new RangeError(`unknown vote choice ${value}`);
  return entry[0];
}

// ---------------------------------------------------------------------------
// String unions
// ---------------------------------------------------------------------------

/** On-chain cause status. */
export type CauseStatus = 'listed' | 'verified' | 'suspended' | 'closed';

/** Where a claim is in its life. */
export type ClaimStateKind = 'open' | 'voting' | 'challenge_window' | 'final';

export type EvidenceKind = 'document' | 'link' | 'photo' | 'video' | 'signature';

export type ChallengeState = 'open' | 'upheld' | 'rejected';

export type LedgerReason =
  | 'gift'
  | 'path'
  | 'vote'
  | 'help'
  | 'listing'
  | 'challenge_win'
  | 'challenge_stake';

export type LedgerState = 'pending' | 'vested' | 'cancelled' | 'spent' | 'burned';

export type LedgerSourceTag = 'charity' | 'trading';

export type SettlementState = 'direct' | 'pending' | 'settled' | 'failed' | 'expired';

export type KytState = 'unknown' | 'clear' | 'flagged';

export type HelpKind = 'intro' | 'visit' | 'translate' | 'items' | 'skills' | 'other';

export type HelpState = 'open' | 'pledged' | 'fulfilled' | 'closed';

export type AttestationKind =
  | 'profile-check'
  | 'document-check'
  | 'site-visit'
  | 'news'
  | 'concern'
  | 'note'
  | 'open-question';

export type ListerRelationship = 'runs' | 'volunteers' | 'supports' | 'other';

// ---------------------------------------------------------------------------
// Cause metadata (`csd.cause/1`, docs/CAUSE-METADATA.md)
// ---------------------------------------------------------------------------

export interface CauseLocation {
  town: string;
  /** A Malaysian state or territory, or `Nationwide`. */
  state: string;
  /** ISO 3166 alpha-2. */
  country: string;
}

export interface CauseOrganisation {
  entityType: string;
  registration: string;
  registrationSource: string;
  founded: string;
  founders: string;
  leadership: string;
  taxExemption: { statement: string; source: string };
  accounts: string;
}

export interface CauseSocials {
  instagram?: string;
  facebook?: string;
  youtube?: string;
  tiktok?: string;
}

export interface CauseContact {
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  socials?: CauseSocials;
}

export interface CauseImage {
  src: string;
  alt: string;
  credit?: string;
  licence?: string;
  sourceUrl?: string;
  /** True when the photo is not the charity's own. */
  illustrative?: boolean;
}

export interface CauseProfile {
  schema: 'csd.cause/1';
  slug: string;
  name: string;
  legalName: string;
  /** One of `CATEGORY_PROFILE_NAMES`. */
  category: string;
  location: CauseLocation;
  summary: string;
  programmes: string[];
  /** Impact lines carry their year. */
  impact: string[];
  beneficiaries: string;
  organisation: CauseOrganisation;
  /** Organisation contacts only. */
  contact: CauseContact;
  live?: { note: string };
  donationsToday?: string;
  image?: CauseImage;
  background?: string;
  /** Every page the profile was built from. */
  sources: string[];
  /** `YYYY-MM-DD`. */
  profileCheckedOn: string;
}

// ---------------------------------------------------------------------------
// Core records
// ---------------------------------------------------------------------------

export interface Cause {
  /** Chain cause id. */
  id: number;
  chainId: number;
  slug: string;
  owner: Address;
  payout: Address;
  /** Category slug. */
  category: string;
  uri: string;
  status: CauseStatus;
  listedAt: string;
  waitingSince: string;
  verifiedAt: string | null;
  requiresCareLicence: boolean;
  listedVia: string;
  profile: CauseProfile | null;
  photoUrl: string | null;
  /** US$ given so far, as a decimal string. */
  givenUsd: string;
  giversCount: number;
  /** Claim codes needed for Verified on this cause. */
  requiredClaims: ClaimCode[];
  claims?: ClaimState[];
  evidenceCount?: number;
  /** Creator preference, signed by the owner wallet (HomepageToggle). */
  showOnHomepage?: boolean;
  /** Set when a steward took the cause off the homepage. Public. */
  homepageHiddenReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HomepageFlag {
  causeId: number;
  shown: boolean;
  setBy: Address;
  signature: Hex;
  updatedAt: string;
  stewardHiddenReason: string | null;
}

export interface UrgentAppeal {
  id: string;
  causeId: number;
  /** Shown next to "Urgent appeal, chosen by Sera.cx". */
  reason: string;
  setBy: Address;
  startsAt: string;
  endsAt: string | null;
}

/** An activity event that moves a cause up the homepage feed. */
export interface FeedEvent {
  causeId: number;
  type: FeedEventType;
  /** ISO string, unix ms or Date. */
  at: string | number | Date;
}

/** What `feedOrder` needs to know about a cause. */
export interface FeedCause {
  id: number;
  status: CauseStatus;
  /** ISO string, unix ms or Date. */
  listedAt: string | number | Date;
  showOnHomepage: boolean;
  homepageHiddenReason?: string | null;
}

export interface ClaimState {
  causeId: number;
  claimType: ClaimCode;
  outcome: ClaimOutcomeName;
  /** Starts at 0 and increments whenever voting reopens. */
  epoch: number;
  state: ClaimStateKind;
  votingStart: string | null;
  votingEnd: string | null;
  challengeWindowEnd: string | null;
  resultRoot: Hex | null;
  finalisedAt: string | null;
  evidenceIds?: string[];
  pathIds?: string[];
  tally?: { verified: number; not: number; more: number };
}

export interface Evidence {
  id: string;
  causeId: number;
  claimType: ClaimCode;
  uploader: Address;
  kind: EvidenceKind;
  fileUrl: string;
  fileHash: Hex;
  title: string;
  note: string | null;
  redactionConfirmed: boolean;
  createdAt: string;
  removedAt: string | null;
  removedReason: string | null;
}

/** The verification path template (brief 7.4). This is the JSON the `contentHash` commits to. */
export interface PathBody {
  /** Name of the official tool or page used. */
  source: string;
  /** Numbered steps anyone can repeat. */
  steps: string[];
  /** The exact search string used. */
  exactQuery: string;
  /** What the helper found, as shown. */
  findings: string;
  /** Does what was found match the profile? */
  matches: boolean;
  /** Hash of the uploaded screenshot evidence. */
  screenshotHash: Hex;
  /** Evidence id of the screenshot, when uploaded through the API. */
  screenshotEvidenceId?: string;
  /** ISO 8601 with offset, for example `2026-10-19T14:05:00+08:00`. */
  checkedAt: string;
  result: PathResult;
  caveats: string;
  /** "None" or a plain statement of the relationship. */
  conflictOfInterest: string;
}

export interface Path {
  id: string;
  causeId: number;
  claimType: ClaimCode;
  epoch: number;
  author: Address;
  body: PathBody;
  contentHash: Hex;
  result: PathResult;
  checkedAt: string;
  signature: Hex;
  createdAt: string;
  /** Set when the claim is final: did the outcome agree with this path? */
  outcomeAgreed: boolean | null;
}

export interface Vote {
  id?: string;
  causeId: number;
  claimType: ClaimCode;
  epoch: number;
  voter: Address;
  choice: VoteChoice;
  reason: string;
  /** Computed from reputation at tally time. */
  weight?: number;
  signature: Hex;
  /** Unix seconds. */
  signedAt: number;
}

export interface ChallengeBody {
  /** Why the current result is wrong, in plain words. */
  statement: string;
  evidenceIds: string[];
  /** The challenger's own verification path. */
  path: PathBody;
}

export interface Challenge {
  id: string;
  causeId: number;
  claimType: ClaimCode;
  epoch: number;
  challenger: Address;
  stake: number;
  contentHash: Hex;
  body: ChallengeBody;
  signature: Hex;
  state: ChallengeState;
  createdAt: string;
  resolvedAt: string | null;
}

export interface Gift {
  id: string;
  causeId: number;
  giver: Address;
  token: Address;
  /** Raw token units as a decimal string. */
  amount: string;
  /** US$ value as a decimal string. */
  usd: string;
  frontend: string;
  txHash: Hex;
  logIndex: number;
  tradeId: string | null;
  settlementState: SettlementState;
  kytState: KytState;
  createdAt: string;
  refundedAt: string | null;
  claimedAt: string | null;
}

export interface GiftMultipliers {
  heat: number;
  volumeTier: number;
  streak: number;
  /** The capped compound multiplier actually applied. */
  compound: number;
}

export interface LedgerEntry {
  id: string;
  wallet: Address;
  /** Positive for credits, negative for spends. */
  amount: number;
  reason: LedgerReason;
  sourceTag: LedgerSourceTag;
  /** Gift id, path id, vote id, need id, cause id or challenge id. */
  sourceRef: string;
  multipliers: GiftMultipliers | null;
  state: LedgerState;
  vestsAt: string | null;
  /** Remote id on g.sera.cx once pushed. */
  gseraRef: string | null;
  createdAt: string;
}

export interface Reputation {
  wallet: Address;
  score: number;
}

export interface ReputationEntry {
  id: string;
  wallet: Address;
  delta: number;
  reason: 'vote_agrees' | 'path_agrees' | 'vote_overturned' | 'path_overturned';
  sourceRef: string;
  createdAt: string;
}

export interface HelpRequest {
  /** Chain need id. */
  id: number;
  causeId: number;
  kind: HelpKind;
  title: string;
  detail: string;
  state: HelpState;
  postedBy: Address;
  postedAt: string;
  /** Wallet confirmed by the cause owner as having fulfilled it. */
  fulfilledBy: Address | null;
  fulfilledAt: string | null;
}

export interface Pledge {
  id: string;
  needId: number;
  wallet: Address;
  note: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Rule function shapes
// ---------------------------------------------------------------------------

/** Reputation by lowercase wallet address. */
export type ReputationLookup = Readonly<Record<string, number>> | ReadonlyMap<string, number>;

export interface ClaimTally {
  /** Weight for Verified. */
  verified: number;
  /** Weight for Not verified. */
  not: number;
  /** Weight for Needs more evidence. */
  more: number;
  /** Total weight cast. */
  total: number;
  /** Number of distinct voters counted. */
  voters: number;
  quorumMet: boolean;
  /** Quorum met and the Verified share is at or above the threshold. */
  passed: boolean;
  /** Share of weight that says Verified, 0 to 1. */
  verifiedShare: number;
  /** What the claim would be finalised as if voting closed now. */
  outcome: ClaimOutcomeName;
}

export interface StageResult {
  stage: CauseStage;
  label: string;
  tone: import('./constants.js').StatusTone;
  /** Required claims verified. */
  done: number;
  /** Required claims in total. */
  total: number;
}
