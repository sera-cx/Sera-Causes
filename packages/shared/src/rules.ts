/**
 * Pure rule functions. No I/O, no randomness, no clocks unless passed in.
 *
 * Every number comes from ./constants.ts so the rules page and the maths
 * cannot drift apart. Worked examples from the brief are in the tests.
 */
import { keccak256, concat, type Address, type Hex } from 'viem';

import {
  CARE_LICENCE_CLAIM,
  GSERA,
  REQUIRED_CLAIMS,
  STATUS,
  VOTE_WEIGHT,
  VOTING,
  claimTypeIndex,
  type ClaimCode,
} from './constants.js';
import { pathLeaf, textHash, voteLeaf, type PathMessage, type VoteMessage } from './eip712.js';
import {
  PATH_RESULT,
  VOTE_CHOICE,
  type CauseStatus,
  type ClaimOutcomeName,
  type ClaimTally,
  type FeedCause,
  type FeedEvent,
  type Path,
  type ReputationLookup,
  type StageResult,
  type Vote,
} from './types.js';

// ---------------------------------------------------------------------------
// gSera for gifts (brief 6.2, docs/PLAN.md 2.1 and 6). Credited on arrival once KYT is clear; no vesting.
// ---------------------------------------------------------------------------

export type HeatKey = keyof typeof GSERA.heat;

export interface GiftMultiplierInput {
  /** A heat key (`urgent`, `normal`) or a raw multiplier. */
  heat?: HeatKey | number;
  /** Season volume tier, 1.0 to 1.6. */
  volumeTier?: number;
  /** Weekly streak, 1.0 to 1.3. */
  streak?: number;
}

/** Rounds away floating-point noise before flooring (2.5 * 1.2 * 1.1 is 3.3000000000000003). */
function floorStable(x: number): number {
  return Math.floor(Math.round(x * 1e6) / 1e6);
}

function heatValue(heat: HeatKey | number | undefined): number {
  if (heat === undefined) return GSERA.heat.normal;
  if (typeof heat === 'number') return heat;
  return GSERA.heat[heat];
}

/** The compound multiplier for a gift, capped at `GSERA.compoundCap`. */
export function giftMultiplier(input: GiftMultiplierInput = {}): number {
  const heat = heatValue(input.heat);
  const volume = input.volumeTier ?? 1;
  const streak = input.streak ?? 1;
  if (heat < 0 || volume < 0 || streak < 0) throw new RangeError('multipliers must not be negative');
  return Math.min(GSERA.compoundCap, heat * volume * streak);
}

/**
 * gSera earned by a gift: usd * 100 * min(10, heat * volume * streak), floored.
 * Example: US$50 at 1.5 heat, 1.2 volume and 1.1 streak = 9,900.
 */
export function giftGsera(usd: number, input: GiftMultiplierInput = {}): number {
  if (!Number.isFinite(usd) || usd < 0) throw new RangeError('usd must be a non-negative number');
  return floorStable(usd * GSERA.perUsd * giftMultiplier(input));
}

export interface CappedGift {
  /** Unix ms, ISO string or Date. */
  at: string | number | Date;
  /** US$ value of the gift that earned gSera. */
  usd: number;
}

function toMs(value: string | number | Date): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new TypeError(`invalid date: ${value}`);
  return ms;
}

/**
 * How many US$ of a new gift to one cause can still earn gSera for this wallet,
 * given its earlier gifts to the same cause. Only gifts inside the rolling
 * window count. Anything above the cap is recorded but earns 0x.
 */
export function giftCapRemaining(
  priorGifts: readonly CappedGift[],
  now: string | number | Date = Date.now(),
): number {
  const nowMs = toMs(now);
  const windowMs = GSERA.giftCapWindowDays * 24 * 60 * 60 * 1000;
  const since = nowMs - windowMs;
  let used = 0;
  for (const g of priorGifts) {
    const at = toMs(g.at);
    if (at > since && at <= nowMs) used += g.usd;
  }
  return Math.max(0, GSERA.giftCapUsdPerWalletPerCausePer30d - used);
}

// ---------------------------------------------------------------------------
// Votes (brief 7.5, 7.6)
// ---------------------------------------------------------------------------

/** weight = 1 + min(4, log2(1 + reputation)), so between 1 and 5. Negative reputation counts as 0. */
export function voteWeight(reputation: number): number {
  const rep = Number.isFinite(reputation) ? Math.max(0, reputation) : 0;
  const bonus = Math.min(VOTE_WEIGHT.max - VOTE_WEIGHT.min, Math.log2(1 + rep));
  return VOTE_WEIGHT.min + bonus;
}

function lookupReputation(reputations: ReputationLookup | undefined, wallet: string): number {
  if (!reputations) return 0;
  const key = wallet.toLowerCase();
  if (reputations instanceof Map) return reputations.get(key) ?? 0;
  const rec = reputations as Readonly<Record<string, number>>;
  return rec[key] ?? rec[wallet] ?? 0;
}

export type TallyVote = Pick<Vote, 'voter' | 'choice'> & Partial<Pick<Vote, 'signedAt'>>;

/**
 * Weighted tally of one claim's votes. One vote per wallet: when the same
 * wallet appears twice the earliest `signedAt` wins (or the first seen when
 * `signedAt` is missing). Weight comes from reputation, never from gSera.
 *
 * `passed` means quorum is met and at least `thresholdPct` of cast weight says
 * Verified. `outcome` is what the claim would be finalised as right now:
 * Verified when passed; otherwise Not verified when "Not verified" carries
 * more weight than "Needs more evidence"; otherwise Needs more evidence, which
 * reopens the claim and is not a fail. Below quorum the outcome is always
 * Needs more evidence.
 */
export function tallyClaim(votes: readonly TallyVote[], reputations?: ReputationLookup): ClaimTally {
  const firstByVoter = new Map<string, TallyVote>();
  for (const v of votes) {
    const key = v.voter.toLowerCase();
    const seen = firstByVoter.get(key);
    if (!seen || (v.signedAt !== undefined && seen.signedAt !== undefined && v.signedAt < seen.signedAt)) {
      firstByVoter.set(key, v);
    }
  }

  let verified = 0;
  let not = 0;
  let more = 0;
  for (const [wallet, v] of firstByVoter) {
    const w = voteWeight(lookupReputation(reputations, wallet));
    if (v.choice === 'verified') verified += w;
    else if (v.choice === 'not_verified') not += w;
    else if (v.choice === 'needs_more') more += w;
    else throw new RangeError(`unknown vote choice ${String(v.choice)}`);
  }

  const total = verified + not + more;
  const quorumMet = total >= VOTING.quorumWeight;
  const verifiedShare = total > 0 ? verified / total : 0;
  const passed = quorumMet && verifiedShare * 100 >= VOTING.thresholdPct - 1e-9;

  let outcome: ClaimOutcomeName;
  if (passed) outcome = 'verified';
  else if (quorumMet && not > more) outcome = 'not_verified';
  else outcome = 'needs_more';

  return {
    verified,
    not,
    more,
    total,
    voters: firstByVoter.size,
    quorumMet,
    passed,
    verifiedShare,
    outcome,
  };
}

/**
 * Can voting close now? Yes after the full period, or earlier once quorum and
 * threshold are met and at least `minHours` have passed.
 */
export function votingCanClose(
  tally: Pick<ClaimTally, 'passed'>,
  votingStart: string | number | Date,
  now: string | number | Date = Date.now(),
): boolean {
  const elapsedHours = (toMs(now) - toMs(votingStart)) / (60 * 60 * 1000);
  if (elapsedHours >= VOTING.periodDays * 24) return true;
  return tally.passed && elapsedHours >= VOTING.minHours;
}

/** Voting on a claim opens once it has paths from at least `minPaths` distinct authors. */
export function votingCanOpen(pathAuthors: readonly string[]): boolean {
  return new Set(pathAuthors.map((a) => a.toLowerCase())).size >= VOTING.minPaths;
}

/** When the challenge window closes for a claim whose voting closed at `votingEnd`. */
export function challengeWindowEnd(votingEnd: string | number | Date): Date {
  return new Date(toMs(votingEnd) + VOTING.challengeWindowHours * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Homepage feed (docs/PLAN.md section 2.2)
// ---------------------------------------------------------------------------

/**
 * The homepage feed: every cause whose creator switched "Show on homepage" on
 * and that a steward has not hidden, ordered by its most recent activity
 * event (gift, evidence, update, claim finalised), newest first. Ties, and
 * causes with no activity yet, go newest listed first, then by higher cause
 * id so two indexers always agree. Suspended and closed causes drop off.
 */
export function feedOrder<T extends FeedCause>(causes: readonly T[], events: readonly FeedEvent[]): T[] {
  const latest = new Map<number, number>();
  for (const e of events) {
    const at = toMs(e.at);
    const seen = latest.get(e.causeId);
    if (seen === undefined || at > seen) latest.set(e.causeId, at);
  }

  const seenIds = new Set<number>();
  const shown = causes.filter((c) => {
    if (seenIds.has(c.id)) return false;
    seenIds.add(c.id);
    if (!c.showOnHomepage) return false;
    if (c.homepageHiddenReason) return false;
    return c.status === 'listed' || c.status === 'verified';
  });

  return shown.sort((a, b) => {
    const la = latest.get(a.id) ?? Number.NEGATIVE_INFINITY;
    const lb = latest.get(b.id) ?? Number.NEGATIVE_INFINITY;
    if (la !== lb) return lb - la;
    const ta = toMs(a.listedAt);
    const tb = toMs(b.listedAt);
    if (ta !== tb) return tb - ta;
    return b.id - a.id;
  });
}

/** The "New" rail: the latest causes added, on the feed or not. Paused and closed causes are left out. */
export function newestCauses<T extends FeedCause>(causes: readonly T[], limit: number): T[] {
  return causes
    .filter((c) => c.status === 'listed' || c.status === 'verified')
    .sort((a, b) => toMs(b.listedAt) - toMs(a.listedAt) || b.id - a.id)
    .slice(0, Math.max(0, limit));
}

// ---------------------------------------------------------------------------
// Merkle roots (brief 11.3)
// ---------------------------------------------------------------------------

function hashPair(a: Hex, b: Hex): Hex {
  const [lo, hi] = a.toLowerCase() <= b.toLowerCase() ? [a, b] : [b, a];
  return keccak256(concat([lo, hi]));
}

/** The root of an empty set. */
export const EMPTY_ROOT: Hex = `0x${'0'.repeat(64)}`;

/**
 * Merkle root over leaves with keccak256 and sorted pair hashing. Leaves are
 * sorted first so the root does not depend on input order. An odd leaf at any
 * level is paired with itself. Empty input gives `EMPTY_ROOT`.
 */
export function merkleRoot(leaves: readonly Hex[]): Hex {
  if (leaves.length === 0) return EMPTY_ROOT;
  let level = [...leaves].map((l) => l.toLowerCase() as Hex).sort();
  while (level.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i]!;
      const b = level[i + 1] ?? a;
      next.push(hashPair(a, b));
    }
    level = next;
  }
  return level[0]!;
}

export type LeafInput =
  | { kind: 'vote'; vote: Pick<Vote, 'voter' | 'causeId' | 'claimType' | 'epoch' | 'choice' | 'reason' | 'signedAt'> }
  | { kind: 'path'; path: Pick<Path, 'author' | 'causeId' | 'claimType' | 'epoch' | 'contentHash' | 'result' | 'checkedAt'> };

/** The Merkle leaf for a stored vote or path, from the same fields the wallet signed. */
export function merkleLeafFor(input: LeafInput): Hex {
  if (input.kind === 'vote') {
    const v = input.vote;
    const message: VoteMessage = {
      causeId: BigInt(v.causeId),
      claimType: claimTypeIndex(v.claimType),
      epoch: v.epoch,
      choice: VOTE_CHOICE[v.choice],
      reasonHash: textHash(v.reason),
      signedAt: BigInt(v.signedAt),
    };
    return voteLeaf(v.voter as Address, message);
  }
  const p = input.path;
  const message: PathMessage = {
    causeId: BigInt(p.causeId),
    claimType: claimTypeIndex(p.claimType),
    epoch: p.epoch,
    contentHash: p.contentHash,
    result: PATH_RESULT[p.result],
    checkedAt: BigInt(Math.floor(toMs(p.checkedAt) / 1000)),
  };
  return pathLeaf(p.author as Address, message);
}

// ---------------------------------------------------------------------------
// Claims and stages (brief 5, 7.2)
// ---------------------------------------------------------------------------

export type RequirementInput = { requiresCareLicence: boolean };

/** The claims this cause must pass to become Verified. */
export function requiredClaimsFor(cause: RequirementInput): ClaimCode[] {
  return cause.requiresCareLicence ? [...REQUIRED_CLAIMS, CARE_LICENCE_CLAIM] : [...REQUIRED_CLAIMS];
}

/** Is this claim required for Verified on this cause? */
export function isRequiredClaim(cause: RequirementInput, claim: ClaimCode): boolean {
  return requiredClaimsFor(cause).includes(claim);
}

export interface StageCauseInput {
  status: CauseStatus;
  requiresCareLicence: boolean;
  /** Pieces of evidence on the cause, any claim. */
  evidenceCount?: number;
}

export type StageClaimInput = { claimType: ClaimCode; outcome: ClaimOutcomeName };

/**
 * The status pill for a cause. Chain status wins: closed and suspended show as
 * Closed and Paused whatever the claims say, and Verified comes from the chain
 * too. A listed cause is Partly verified once any required claim is verified,
 * Evidence in once anything has been uploaded, otherwise New.
 */
export function causeStage(cause: StageCauseInput, claims: readonly StageClaimInput[]): StageResult {
  const required = requiredClaimsFor(cause);
  const done = claims.filter((c) => required.includes(c.claimType) && c.outcome === 'verified').length;
  const total = required.length;

  let stage: StageResult['stage'];
  if (cause.status === 'closed') stage = 'closed';
  else if (cause.status === 'suspended') stage = 'paused';
  else if (cause.status === 'verified') stage = 'verified';
  else if (done > 0) stage = 'partly_verified';
  else if ((cause.evidenceCount ?? 0) > 0) stage = 'evidence_in';
  else stage = 'new';

  const pill = STATUS[stage];
  return { stage, label: pill.label, tone: pill.tone, done, total };
}
