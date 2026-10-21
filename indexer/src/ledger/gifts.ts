/**
 * Gift gSera (brief 6.2, 6.7; docs/PLAN.md sections 2.1 and 6).
 *
 * A gift earns gift_usd x 100 x heat x volume x streak (capped at 10x), credited
 * to the sender on arrival once KYT is clear. Wallets equal to the cause owner
 * or deposit address earn nothing, flagged wallets earn nothing, and only the
 * first US$1,000 per wallet per cause per 30 days earns.
 */
import { GSERA, giftCapRemaining, giftGsera } from '@sera-causes/shared';
import type { LedgerEntry } from '@prisma/client';
import { db } from '../db.js';
import { getGsera } from '../services/gsera.js';
import { logger } from '../log.js';
import { creditEntry } from './credit.js';
import { awardBadge } from './badges.js';
import { notify } from '../notify.js';

export type GiftLedgerNote = 'ok' | 'owner_or_payout' | 'kyt_flagged' | 'kyt_pending' | 'cap_reached' | 'zero' | 'exists';

export interface GiftLedgerResult {
  entry: LedgerEntry | null;
  note: GiftLedgerNote;
  eligibleUsd: number;
}

export async function activeUrgentAppeal(causeId: number, at: Date = new Date()) {
  return db().urgentAppeal.findFirst({
    where: { causeId, clearedAt: null, startsAt: { lte: at }, OR: [{ endsAt: null }, { endsAt: { gt: at } }] },
    orderBy: { startsAt: 'desc' },
  });
}

export async function walletMultipliers(wallet: string): Promise<{ volumeTier: number; streak: number }> {
  try {
    const w = await getGsera().getWallet(wallet);
    return { volumeTier: w.multipliers.volumeTier || 1, streak: w.multipliers.streak || 1 };
  } catch (err) {
    logger.warn({ err, wallet }, 'gsera getWallet failed; using 1x multipliers');
    return { volumeTier: 1, streak: 1 };
  }
}

/** Creates and credits the ledger entry for a recorded gift. Idempotent per gift. */
export async function recordGiftLedger(giftId: string): Promise<GiftLedgerResult> {
  const gift = await db().gift.findUniqueOrThrow({ where: { id: giftId }, include: { cause: { include: { wallet: true } } } });
  const sender = gift.sender.toLowerCase();
  const usd = Number(gift.usd);

  const existing = await db().ledgerEntry.findUnique({ where: { reason_sourceRef_wallet: { reason: 'gift', sourceRef: gift.id, wallet: sender } } });
  if (existing && existing.state !== 'queued') return { entry: existing, note: 'exists', eligibleUsd: usd };

  const finish = async (note: GiftLedgerNote, eligibleUsd: number): Promise<GiftLedgerResult> => {
    await db().gift.update({ where: { id: gift.id }, data: { ledgerNote: note } });
    return { entry: null, note, eligibleUsd };
  };

  const excluded = new Set([gift.cause.owner, gift.cause.payout, gift.cause.wallet?.address].filter(Boolean).map((a) => a!.toLowerCase()));
  if (excluded.has(sender)) return finish('owner_or_payout', 0);
  if (gift.kytState === 'flagged') return finish('kyt_flagged', 0);
  if (gift.kytState !== 'clear') return finish('kyt_pending', 0);

  // The gift has arrived and passed screening, so it counts as a gift whether
  // or not it earns gSera. The badge marks the act, never the amount.
  await awardBadge({ wallet: sender, slug: 'first_gift', causeId: gift.causeId, sourceRef: gift.id });

  const prior = await db().gift.findMany({
    where: { causeId: gift.causeId, sender, id: { not: gift.id }, createdAt: { lte: gift.createdAt } },
    select: { createdAt: true, usd: true },
  });
  const remaining = giftCapRemaining(
    prior.map((p) => ({ at: p.createdAt, usd: Number(p.usd) })),
    gift.createdAt,
  );
  const eligibleUsd = Math.min(usd, remaining);
  if (eligibleUsd <= 0) return finish('cap_reached', 0);

  const appeal = await activeUrgentAppeal(gift.causeId, gift.createdAt);
  const heat = appeal ? GSERA.heat.urgent : GSERA.heat.normal;
  const { volumeTier, streak } = await walletMultipliers(sender);
  const amount = giftGsera(eligibleUsd, { heat, volumeTier, streak });
  if (amount <= 0) return finish('zero', eligibleUsd);

  const compound = Math.min(GSERA.compoundCap, heat * volumeTier * streak);
  const entry = await creditEntry({
    wallet: sender,
    amount,
    reason: 'gift',
    sourceRef: gift.id,
    causeId: gift.causeId,
    multipliers: { heat, volumeTier, streak, compound, eligibleUsd },
    note: `Gift of US$${usd.toFixed(2)} to cause ${gift.causeId}`,
  });
  await db().gift.update({ where: { id: gift.id }, data: { ledgerNote: 'ok' } });
  if (entry.state === 'credited') {
    await notify({
      wallet: sender,
      kind: 'gsera_credited',
      title: `${amount.toLocaleString('en-GB')} gSera credited`,
      body: `Your gift of US$${usd.toFixed(2)} to cause ${gift.causeId} earned gSera at ${compound.toFixed(2)}x.`,
      causeId: gift.causeId,
      data: { ledgerEntryId: entry.id, amount },
    });
  }
  return { entry, note: 'ok', eligibleUsd };
}

/** Steward clawback: reverses a credited gift entry on gSera and marks it cancelled. */
export async function cancelGiftEntry(giftId: string, reason: string): Promise<LedgerEntry | null> {
  const entry = await db().ledgerEntry.findFirst({ where: { reason: 'gift', sourceRef: giftId, state: { in: ['credited', 'queued'] } } });
  if (!entry) return null;
  if (entry.state === 'credited') {
    try {
      await getGsera().reverseCredit(entry.id, 'causes_gift', entry.wallet, reason);
    } catch (err) {
      logger.warn({ err, entryId: entry.id }, 'reverseCredit failed');
    }
  }
  return db().ledgerEntry.update({ where: { id: entry.id }, data: { state: 'cancelled', lastError: reason } });
}
