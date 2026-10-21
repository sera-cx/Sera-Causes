/**
 * Helper XP (docs/PLAN.md section 7) and challenge stakes (brief 6.5, 7.8).
 *
 * Helpers earn Care XP on community.sera.cx, never gSera. gSera is left with
 * two jobs here: gifts (see ledger/gifts.ts) and the challenge stake, which is
 * spent to open a challenge and returned when the challenge is upheld.
 *
 * Every XP event is anchored to something a stranger can check. Work that only
 * the cause owner can confirm earns a helper badge instead, see ledger/badges.ts.
 *
 * - Cause listed: 100 XP to the lister, on listing.
 * - Listing reaches Verified: 1,500 XP to the lister.
 * - Evidence the final claim rests on: 100 XP to the uploader.
 * - Path agreeing with the final outcome: 400 XP, 800 XP for a C4 site visit
 *   with a dated photo. Vote agreeing: 25 XP. Both still +1 reputation.
 * - Help confirmed by the cause owner: the Helper badge, or Translator for a
 *   translation. No XP, because nobody outside the cause can check it.
 * - Milestones, settled with the claim: Witness for a C4 site visit, Path
 *   finder at ten agreeing paths, Steady hand at twenty-five agreeing votes.
 * - Challenge upheld: the gSera stake back plus 1,000 XP; overturned paths and
 *   votes lose 3 reputation.
 * - Challenge rejected: the stake stays burned.
 */
import { CHALLENGE_STAKE, HELPER_BADGES, HELPER_BADGE_THRESHOLDS, VOTING, XP, helpBadgeFor, requiredClaimsFor, type ClaimOutcomeName } from '@sera-causes/shared';
import { InsufficientSpendable } from '@sera-causes/gsera-client';
import type { ClaimState, Path } from '@prisma/client';
import { db } from '../db.js';
import { getGsera } from '../services/gsera.js';
import { adjustReputation } from './reputation.js';
import { creditEntry } from './credit.js';
import { awardBadge } from './badges.js';
import { awardXp } from './xp.js';
import { notify, notifyClaimParticipants } from '../notify.js';
import { logger } from '../log.js';

export class StakeError extends Error {
  constructor(message: string, readonly spendable?: number, readonly required?: number) {
    super(message);
    this.name = 'StakeError';
  }
}

export function pathAgrees(result: string, outcome: ClaimOutcomeName): boolean {
  if (outcome === 'verified') return result === 'verified';
  if (outcome === 'not_verified') return result === 'not_verified';
  if (outcome === 'needs_more') return result === 'could_not_check';
  return false;
}

export function voteAgrees(choice: string, outcome: ClaimOutcomeName): boolean {
  return choice === outcome;
}

/**
 * A C4 path counts as a site visit when it carries a dated photo: the path
 * body names an uploaded photo, or the author uploaded one against the same
 * claim. The date is the path's own `checkedAt`.
 */
export async function isSiteVisit(path: Pick<Path, 'causeId' | 'claimType' | 'author' | 'body'>): Promise<boolean> {
  if (path.claimType !== 'C4') return false;
  const body = (path.body ?? {}) as { screenshotEvidenceId?: unknown };
  const id = typeof body.screenshotEvidenceId === 'string' ? body.screenshotEvidenceId : null;
  if (id) {
    const named = await db().evidence.findFirst({ where: { id, kind: 'photo', removedAt: null } });
    if (named) return true;
  }
  const own = await db().evidence.findFirst({ where: { causeId: path.causeId, claimType: 'C4', uploader: path.author, kind: 'photo', removedAt: null } });
  return !!own;
}

/** 100 XP to the wallet that listed a cause, once the duplicate check has passed. */
export async function xpForListing(causeId: number, lister: string): Promise<boolean> {
  const row = await awardXp({ wallet: lister, eventType: 'care_cause_listed', sourceRef: `cause:${causeId}`, causeId });
  return !!row;
}

/** 1,500 XP to the wallet that listed a cause, once, when the last required claim is final. */
export async function xpForListingVerified(causeId: number): Promise<boolean> {
  const cause = await db().cause.findUnique({ where: { id: causeId } });
  if (!cause || cause.listingRewarded) return false;
  const row = await awardXp({ wallet: cause.lister, eventType: 'care_cause_verified', sourceRef: `cause:${causeId}`, causeId });
  await db().cause.update({ where: { id: causeId }, data: { listingRewarded: true } });
  if (row) {
    await notify({
      wallet: cause.lister,
      kind: 'xp_queued',
      title: 'A cause you added is Verified',
      body: `Every required check on ${cause.slug} has passed. ${XP.care_cause_verified.amount} XP is queued for community.sera.cx.`,
      causeId,
    });
  }
  return !!row;
}

/** 500 XP to the lister when the charity takes ownership of a cause they added. */
export async function xpForCharityClaim(causeId: number, newOwner: string): Promise<boolean> {
  const cause = await db().cause.findUnique({ where: { id: causeId } });
  if (!cause) return false;
  const owner = newOwner.toLowerCase();
  if (owner === cause.lister.toLowerCase()) return false;
  const row = await awardXp({ wallet: cause.lister, eventType: 'care_charity_claimed', sourceRef: `cause:${causeId}`, causeId });
  return !!row;
}

/**
 * A badge to a helper once the cause owner confirms a help request, and no XP.
 * A translation earns its own badge. There is nothing behind the confirmation
 * but the owner's word, so it pays nothing and it unlocks nothing: a confirmed
 * help request does not make a wallet eligible to vote (see api/eligibility.ts).
 */
export async function rewardHelp(needId: number, helper: string, _now: Date = new Date()): Promise<boolean> {
  const need = await db().need.findUnique({ where: { id: needId } });
  const slug = helpBadgeFor(need?.kind);
  const row = await awardBadge({ wallet: helper, slug, causeId: need?.causeId ?? null, sourceRef: `need:${needId}` });
  if (row) {
    await notify({
      wallet: helper,
      kind: 'help_confirmed',
      title: 'Your help was confirmed',
      body: `The cause owner confirmed help request #${needId}. You have earned the ${HELPER_BADGES[slug].label} badge, which shows on your /me page. Help requests are how a cause and a helper arrange work, so they carry no XP.`,
      causeId: need?.causeId ?? null,
    });
  }
  return !!row;
}

/** Path finder, once a wallet has ten paths the final outcome agreed with. */
async function badgeForAgreeingPaths(wallet: string, causeId: number, sourceRef: string): Promise<void> {
  const agreed = await db().path.count({ where: { author: wallet, outcomeAgreed: true } });
  if (agreed >= HELPER_BADGE_THRESHOLDS.path_finder) await awardBadge({ wallet, slug: 'path_finder', causeId, sourceRef });
}

/** Steady hand, once a wallet has twenty-five votes the final outcome agreed with. */
async function badgeForAgreeingVotes(wallet: string, causeId: number, sourceRef: string): Promise<void> {
  const agreed = await db().vote.count({ where: { voter: wallet, outcomeAgreed: true } });
  if (agreed >= HELPER_BADGE_THRESHOLDS.steady_hand) await awardBadge({ wallet, slug: 'steady_hand', causeId, sourceRef });
}

/**
 * Settles one claim whose challenge window has closed: marks it final, pays
 * agreeing paths and votes, awards the milestone badges, and updates
 * reputation. Idempotent via settledAt.
 */
export async function settleClaim(cs: ClaimState, now: Date = new Date()): Promise<{ paths: number; votes: number } | null> {
  if (cs.settledAt) return null;
  if (cs.state !== 'challenge_window' || !cs.challengeWindowEnd || cs.challengeWindowEnd > now) return null;
  const openChallenge = await db().challenge.findFirst({ where: { causeId: cs.causeId, claimType: cs.claimType, epoch: cs.epoch, state: 'open' } });
  if (openChallenge) return null;
  const outcome = cs.outcome as ClaimOutcomeName;
  if (outcome === 'open') return null;

  const [paths, votes, evidence] = await Promise.all([
    db().path.findMany({ where: { causeId: cs.causeId, claimType: cs.claimType, epoch: cs.epoch } }),
    db().vote.findMany({ where: { causeId: cs.causeId, claimType: cs.claimType, epoch: cs.epoch } }),
    db().evidence.findMany({ where: { causeId: cs.causeId, claimType: cs.claimType, removedAt: null } }),
  ]);
  let pathsPaid = 0;
  let votesPaid = 0;
  for (const p of paths) {
    const agreed = pathAgrees(p.result, outcome);
    await db().path.update({ where: { id: p.id }, data: { outcomeAgreed: agreed } });
    if (agreed) {
      if (await awardXp({ wallet: p.author, eventType: 'care_path_agreed', sourceRef: p.id, causeId: cs.causeId })) pathsPaid += 1;
      if (await isSiteVisit(p)) {
        await awardXp({ wallet: p.author, eventType: 'care_site_visit', sourceRef: p.id, causeId: cs.causeId });
        await awardBadge({ wallet: p.author, slug: 'witness', causeId: cs.causeId, sourceRef: p.id });
      }
      await adjustReputation(p.author, 1, 'path_agrees', p.id);
      await badgeForAgreeingPaths(p.author, cs.causeId, p.id);
    }
  }
  for (const v of votes) {
    const agreed = voteAgrees(v.choice, outcome);
    await db().vote.update({ where: { id: v.id }, data: { outcomeAgreed: agreed } });
    if (agreed) {
      if (await awardXp({ wallet: v.voter, eventType: 'care_vote_agreed', sourceRef: v.id, causeId: cs.causeId })) votesPaid += 1;
      await adjustReputation(v.voter, 1, 'vote_agrees', v.id);
      await badgeForAgreeingVotes(v.voter, cs.causeId, v.id);
    }
  }
  // The claim the evidence supports is final, whichever way it went.
  for (const e of evidence) {
    await awardXp({ wallet: e.uploader, eventType: 'care_evidence_accepted', sourceRef: e.id, causeId: cs.causeId });
  }
  await db().claimState.update({
    where: { causeId_claimType: { causeId: cs.causeId, claimType: cs.claimType } },
    data: { state: 'final', settledAt: now },
  });
  if (outcome === 'verified') await xpWhenAllRequiredClaimsFinal(cs.causeId);
  await notifyClaimParticipants(cs.causeId, cs.claimType, cs.epoch, {
    kind: 'claim_finalised',
    title: `Claim ${cs.claimType} is final: ${outcome.replace('_', ' ')}`,
    body: 'The challenge window closed. XP and reputation for agreeing paths and votes have been settled.',
    data: { claimType: cs.claimType, epoch: cs.epoch, outcome },
  });
  return { paths: pathsPaid, votes: votesPaid };
}

/** Pays the lister's 1,500 XP once every required claim on the cause is final and verified. */
export async function xpWhenAllRequiredClaimsFinal(causeId: number): Promise<boolean> {
  const cause = await db().cause.findUnique({ where: { id: causeId } });
  if (!cause || cause.listingRewarded) return false;
  const required = requiredClaimsFor({ requiresCareLicence: cause.requiresCareLicence });
  const claims = await db().claimState.findMany({ where: { causeId, claimType: { in: [...required] } } });
  const allFinal = required.every((code) => {
    const row = claims.find((k) => k.claimType === code);
    return row?.state === 'final' && row.outcome === 'verified';
  });
  if (!allFinal) return false;
  return xpForListingVerified(causeId);
}

/** Settles every claim whose 72-hour window has closed. */
export async function settleDueClaims(now: Date = new Date()): Promise<number> {
  const due = await db().claimState.findMany({ where: { state: 'challenge_window', challengeWindowEnd: { lte: now }, settledAt: null } });
  let n = 0;
  for (const cs of due) {
    try {
      if (await settleClaim(cs, now)) n += 1;
    } catch (err) {
      logger.warn({ err, causeId: cs.causeId, claimType: cs.claimType }, 'settleClaim failed');
    }
  }
  return n;
}

/** Spends the 5,000 gSera challenge stake on g.sera.cx and records it. */
export async function stakeChallenge(wallet: string, challengeId: string): Promise<void> {
  const w = wallet.toLowerCase();
  try {
    const res = await getGsera().spend({ wallet: w, amountGsera: CHALLENGE_STAKE, reason: 'cause_challenge_stake', referenceId: challengeId });
    await db().ledgerEntry.upsert({
      where: { reason_sourceRef_wallet: { reason: 'challenge_stake', sourceRef: challengeId, wallet: w } },
      create: { wallet: w, amount: CHALLENGE_STAKE, reason: 'challenge_stake', sourceTag: 'charity', sourceRef: challengeId, state: 'spent', gseraRef: res.spendId },
      update: { state: 'spent', gseraRef: res.spendId },
    });
  } catch (err) {
    if (err instanceof InsufficientSpendable) throw new StakeError('not enough spendable gSera for the stake', err.spendable, err.required);
    throw err;
  }
}

/**
 * Resolves a challenge. Upheld: the gSera stake comes back and the challenger
 * earns 1,000 XP, overturned paths and votes lose 3 reputation, the claim
 * reopens for a new epoch (the finaliser then records the flipped outcome
 * on-chain). Rejected: stake stays burned, claim returns to its window.
 */
export async function resolveChallenge(id: string, outcome: 'upheld' | 'rejected', now: Date = new Date()): Promise<void> {
  const ch = await db().challenge.findUniqueOrThrow({ where: { id } });
  if (ch.state !== 'open') throw new Error(`challenge ${id} is already ${ch.state}`);
  const cs = await db().claimState.findUniqueOrThrow({ where: { causeId_claimType: { causeId: ch.causeId, claimType: ch.claimType } } });

  await db().challenge.update({ where: { id }, data: { state: outcome, resolvedAt: now } });

  if (outcome === 'upheld') {
    // The stake is gSera, so it comes back as gSera. The reward for being right is XP.
    await creditEntry({ wallet: ch.challenger, amount: ch.stake, reason: 'challenge_stake_return', sourceRef: ch.id, causeId: ch.causeId });
    await awardXp({ wallet: ch.challenger, eventType: 'care_challenge_upheld', sourceRef: ch.id, causeId: ch.causeId });
    const prior = cs.outcome as ClaimOutcomeName;
    const [paths, votes] = await Promise.all([
      db().path.findMany({ where: { causeId: ch.causeId, claimType: ch.claimType, epoch: ch.epoch } }),
      db().vote.findMany({ where: { causeId: ch.causeId, claimType: ch.claimType, epoch: ch.epoch } }),
    ]);
    for (const p of paths) {
      if (pathAgrees(p.result, prior)) {
        await adjustReputation(p.author, -3, 'path_overturned', p.id);
        await db().path.update({ where: { id: p.id }, data: { outcomeAgreed: false } });
      }
    }
    for (const v of votes) {
      if (voteAgrees(v.choice, prior)) {
        await adjustReputation(v.voter, -3, 'vote_overturned', v.id);
        await db().vote.update({ where: { id: v.id }, data: { outcomeAgreed: false } });
      }
    }
    await db().claimState.update({
      where: { causeId_claimType: { causeId: ch.causeId, claimType: ch.claimType } },
      data: { epoch: cs.epoch + 1, state: 'open', votingStart: null, votingEnd: null, challengeWindowEnd: null, settledAt: null },
    });
  } else {
    const end = new Date(now.getTime() + VOTING.challengeWindowHours * 3600 * 1000);
    await db().claimState.update({
      where: { causeId_claimType: { causeId: ch.causeId, claimType: ch.claimType } },
      data: { state: cs.settledAt ? 'final' : 'challenge_window', challengeWindowEnd: cs.settledAt ? cs.challengeWindowEnd : end },
    });
  }
  await notify({
    wallet: ch.challenger,
    kind: 'challenge_resolved',
    title: outcome === 'upheld' ? 'Your challenge was upheld' : 'Your challenge was rejected',
    body:
      outcome === 'upheld'
        ? `Claim ${ch.claimType} on cause ${ch.causeId} reopens. Your stake comes back and ${XP.care_challenge_upheld.amount} XP is queued for community.sera.cx.`
        : `Claim ${ch.claimType} on cause ${ch.causeId} stands. The stake was burned.`,
    causeId: ch.causeId,
  });
  await notifyClaimParticipants(ch.causeId, ch.claimType, ch.epoch, {
    kind: 'claim_challenged',
    title: `Challenge on ${ch.claimType} ${outcome}`,
    body: outcome === 'upheld' ? 'The claim reopens for new paths and votes.' : 'The result stands.',
    data: { challengeId: ch.id, outcome },
  });
}
