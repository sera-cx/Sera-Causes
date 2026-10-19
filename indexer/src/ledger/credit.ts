/**
 * Credit-at-once ledger (docs/PLAN.md section 6): there is no escrow and no refund,
 * so every earned entry is pushed to g.sera.cx the moment it is created.
 * grantType per reason, referenceId = LedgerEntry.id, idempotent on the gSera side.
 */
import { GSERA_GRANT_TYPES } from '@sera-causes/shared';
import type { GrantType } from '@sera-causes/gsera-client';
import type { LedgerEntry, Prisma } from '@prisma/client';
import { db } from '../db.js';
import { getGsera } from '../services/gsera.js';
import { logger } from '../log.js';

const GRANT_FOR_REASON: Record<string, GrantType> = {
  gift: GSERA_GRANT_TYPES.gift,
  path: GSERA_GRANT_TYPES.path,
  vote: GSERA_GRANT_TYPES.vote,
  help: GSERA_GRANT_TYPES.help,
  listing: GSERA_GRANT_TYPES.listing,
  challenge_win: GSERA_GRANT_TYPES.challenge_win,
};

export function grantTypeFor(reason: string): GrantType {
  const g = GRANT_FOR_REASON[reason];
  if (!g) throw new Error(`no grant type for ledger reason ${reason}`);
  return g;
}

export interface CreditInput {
  wallet: string;
  amount: number;
  reason: 'gift' | 'path' | 'vote' | 'help' | 'listing' | 'challenge_win';
  sourceRef: string;
  causeId?: number | null;
  multipliers?: Prisma.InputJsonValue;
  note?: string;
}

/**
 * Creates the ledger entry and credits it. Returns the existing entry when one
 * already exists for (reason, sourceRef, wallet). A failed remote call leaves the
 * row `queued` so `retryQueued` can push it again.
 */
export async function creditEntry(input: CreditInput): Promise<LedgerEntry> {
  const wallet = input.wallet.toLowerCase();
  const existing = await db().ledgerEntry.findUnique({ where: { reason_sourceRef_wallet: { reason: input.reason, sourceRef: input.sourceRef, wallet } } });
  if (existing && existing.state !== 'queued') return existing;
  const entry =
    existing ??
    (await db().ledgerEntry.create({
      data: {
        wallet,
        amount: input.amount,
        reason: input.reason,
        sourceTag: 'charity',
        sourceRef: input.sourceRef,
        causeId: input.causeId ?? null,
        multipliers: input.multipliers,
        state: 'queued',
      },
    }));
  return pushCredit(entry, input.note);
}

async function pushCredit(entry: LedgerEntry, note?: string): Promise<LedgerEntry> {
  try {
    const res = await getGsera().credit({
      wallet: entry.wallet,
      amountGsera: entry.amount,
      grantType: grantTypeFor(entry.reason),
      referenceId: entry.id,
      reason: note ?? `${entry.reason}${entry.causeId ? ` for cause ${entry.causeId}` : ''} (${entry.sourceRef})`,
    });
    return db().ledgerEntry.update({ where: { id: entry.id }, data: { state: 'credited', gseraRef: res.grantId, lastError: null } });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.warn({ err, entryId: entry.id }, 'gSera credit failed; left queued');
    return db().ledgerEntry.update({ where: { id: entry.id }, data: { lastError: error } });
  }
}

/** Re-pushes entries whose credit call failed earlier. */
export async function retryQueued(limit = 200): Promise<{ credited: number; failed: number }> {
  const queued = await db().ledgerEntry.findMany({ where: { state: 'queued' }, orderBy: { createdAt: 'asc' }, take: limit });
  let credited = 0;
  let failed = 0;
  for (const e of queued) {
    const r = await pushCredit(e);
    if (r.state === 'credited') credited += 1;
    else failed += 1;
  }
  return { credited, failed };
}
