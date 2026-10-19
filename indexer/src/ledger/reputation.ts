import { db } from '../db.js';

export type ReputationReason = 'vote_agrees' | 'path_agrees' | 'vote_overturned' | 'path_overturned';

/** Applies a reputation delta once per (reason, sourceRef, wallet). Returns false when already applied. */
export async function adjustReputation(wallet: string, delta: number, reason: ReputationReason, sourceRef: string): Promise<boolean> {
  const w = wallet.toLowerCase();
  const existing = await db().reputationEntry.findUnique({ where: { reason_sourceRef_wallet: { reason, sourceRef, wallet: w } } });
  if (existing) return false;
  await db().$transaction([
    db().reputationEntry.create({ data: { wallet: w, delta, reason, sourceRef } }),
    db().reputation.upsert({ where: { wallet: w }, create: { wallet: w, score: delta }, update: { score: { increment: delta } } }),
  ]);
  return true;
}

export async function reputationMap(wallets: readonly string[]): Promise<Map<string, number>> {
  const rows = await db().reputation.findMany({ where: { wallet: { in: wallets.map((w) => w.toLowerCase()) } } });
  return new Map(rows.map((r) => [r.wallet, Math.max(0, r.score)]));
}
