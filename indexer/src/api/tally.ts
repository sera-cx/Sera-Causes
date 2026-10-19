import type { Address } from 'viem';
import type { Vote } from '@prisma/client';
import { tallyClaim, type ClaimTally, type VoteChoice } from '@sera-causes/shared';
import { db } from '../db.js';
import { reputationMap } from '../ledger/reputation.js';

/** Tally of the stored votes for a claim epoch, weighted by current reputation. */
export async function tallyFor(causeId: number, claimType: string, epoch: number): Promise<{ tally: ClaimTally; votes: Vote[]; reputations: Map<string, number> }> {
  const votes = await db().vote.findMany({ where: { causeId, claimType, epoch }, orderBy: { createdAt: 'asc' } });
  const reputations = await reputationMap(votes.map((v) => v.voter));
  const tally = tallyClaim(
    votes.map((v) => ({ voter: v.voter as Address, choice: v.choice as VoteChoice, signedAt: Math.floor(v.signedAt.getTime() / 1000) })),
    reputations,
  );
  return { tally, votes, reputations };
}

export function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))) as T;
}
