/**
 * Helper rewards (brief 6.3) and challenge stakes (brief 6.5, 7.8).
 *
 * - Listing reaches Verified: 2,500 to the lister.
 * - Path agreeing with the final outcome: 1,000. Vote agreeing: 100. Both +1 reputation.
 * - Help confirmed by the charity: 500.
 * - Challenge upheld: stake back plus 2,000; overturned paths and votes lose 3 reputation.
 * - Challenge rejected: the stake stays burned.
 *
 * Reward entries are credited to g.sera.cx at once (docs/PLAN.md section 6).
 */
import { CHALLENGE_STAKE, GSERA, VOTING, type ClaimOutcomeName } from '@sera-causes/shared';
import { InsufficientSpendable } from '@sera-causes/gsera-client';
import type { ClaimState } from '@prisma/client';
import { db } from '../db.js';
import { getGsera } from '../services/gsera.js';
import { adjustReputation } from './reputation.js';
import { creditEntry } from './credit.js';
import { notify, notifyClaimParticipants } from '../notify.js';
import { logger } from '../log.js';

export class StakeError extends Error {
  constructor(message: string, readonly spendable?: number, readonly required?: number) {
    super(message);
    this.name = 'StakeError';
  }
}

async function rewardOnce(
  wallet: string,
  amount: number,
  reason: 'path' | 'vote' | 'help' | 'listing' | 'challenge_win',
  sourceRef: string,
  causeId: number | null,
  _now: Date,
): Promise<boolean> {
  const w = wallet.toLowerCase();
  const existing = await db().ledgerEntry.findUnique({ where: { reason_sourceRef_wallet: { reason, sourceRef, wallet: w } } });
  if (existing && existing.state !== 'queued') return false;
  await creditEntry({ wallet: w, amount, reason, sourceRef, causeId });
  return true;
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

/** 2,500 gSera to the wallet that listed a cause, once, when it reaches Verified. */
export async function rewardListing(causeId: number, now: Date = new Date()): Promise<boolean> {
  const cause = await db().cause.findUnique({ where: { id: causeId } });
  if (!cause || cause.listingRewarded) return false;
  const created = await rewardOnce(cause.lister, GSERA.helper.listingVerified, 'listing', `cause:${causeId}`, causeId, now);
  await db().cause.update({ where: { id: causeId }, data: { listingRewarded: true } });
  return created;
}

/** 500 gSera to a helper once the charity confirms a help request. */
export async function rewardHelp(needId: number, helper: string, now: Date = new Date()): Promise<boolean> {
  const need = await db().need.findUnique({ where: { id: needId } });
  const created = await rewardOnce(helper, GSERA.helper.helpFulfilled, 'help', `need:${needId}`, need?.causeId ?? null, now);
  if (created) {
    await notify({
      wallet: helper,
      kind: 'help_confirmed',
      title: 'Your help was confirmed',
      body: `The charity confirmed help request #${needId}. ${GSERA.helper.helpFulfilled} gSera is on its way.`,
      causeId: need?.causeId ?? null,
    });
  }
  return created;
}

/**
 * Settles one claim whose challenge window has closed: marks it final, pays
 * agreeing paths and votes, and updates reputation. Idempotent via settledAt.
 */
export async function settleClaim(cs: ClaimState, now: Date = new Date()): Promise<{ paths: number; votes: number } | null> {
  if (cs.settledAt) return null;
  if (cs.state !== 'challenge_window' || !cs.challengeWindowEnd || cs.challengeWindowEnd > now) return null;
  const openChallenge = await db().challenge.findFirst({ where: { causeId: cs.causeId, claimType: cs.claimType, epoch: cs.epoch, state: 'open' } });
  if (openChallenge) return null;
  const outcome = cs.outcome as ClaimOutcomeName;
  if (outcome === 'open') return null;

  const [paths, votes] = await Promise.all([
    db().path.findMany({ where: { causeId: cs.causeId, claimType: cs.claimType, epoch: cs.epoch } }),
    db().vote.findMany({ where: { causeId: cs.causeId, claimType: cs.claimType, epoch: cs.epoch } }),
  ]);
  let pathsPaid = 0;
  let votesPaid = 0;
  for (const p of paths) {
    const agreed = pathAgrees(p.result, outcome);
    await db().path.update({ where: { id: p.id }, data: { outcomeAgreed: agreed } });
    if (agreed) {
      if (await rewardOnce(p.author, GSERA.helper.pathAgrees, 'path', p.id, cs.causeId, now)) pathsPaid += 1;
      await adjustReputation(p.author, 1, 'path_agrees', p.id);
    }
  }
  for (const v of votes) {
    const agreed = voteAgrees(v.choice, outcome);
    await db().vote.update({ where: { id: v.id }, data: { outcomeAgreed: agreed } });
    if (agreed) {
      if (await rewardOnce(v.voter, GSERA.helper.voteAgrees, 'vote', v.id, cs.causeId, now)) votesPaid += 1;
      await adjustReputation(v.voter, 1, 'vote_agrees', v.id);
    }
  }
  await db().claimState.update({
    where: { causeId_claimType: { causeId: cs.causeId, claimType: cs.claimType } },
    data: { state: 'final', settledAt: now },
  });
  await notifyClaimParticipants(cs.causeId, cs.claimType, cs.epoch, {
    kind: 'claim_finalised',
    title: `Claim ${cs.claimType} is final: ${outcome.replace('_', ' ')}`,
    body: 'The challenge window closed. Rewards and reputation for agreeing paths and votes have been settled.',
    data: { claimType: cs.claimType, epoch: cs.epoch, outcome },
  });
  return { paths: pathsPaid, votes: votesPaid };
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
 * Resolves a challenge. Upheld: stake back plus 2,000, overturned paths and votes
 * lose 3 reputation, the claim reopens for a new epoch (the finaliser then records
 * the flipped outcome on-chain). Rejected: stake stays burned, claim returns to its window.
 */
export async function resolveChallenge(id: string, outcome: 'upheld' | 'rejected', now: Date = new Date()): Promise<void> {
  const ch = await db().challenge.findUniqueOrThrow({ where: { id } });
  if (ch.state !== 'open') throw new Error(`challenge ${id} is already ${ch.state}`);
  const cs = await db().claimState.findUniqueOrThrow({ where: { causeId_claimType: { causeId: ch.causeId, claimType: ch.claimType } } });

  await db().challenge.update({ where: { id }, data: { state: outcome, resolvedAt: now } });

  if (outcome === 'upheld') {
    await rewardOnce(ch.challenger, ch.stake + GSERA.helper.challengeWin, 'challenge_win', ch.id, ch.causeId, now);
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
        ? `Claim ${ch.claimType} on cause ${ch.causeId} reopens. Your stake comes back with ${GSERA.helper.challengeWin} gSera.`
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
