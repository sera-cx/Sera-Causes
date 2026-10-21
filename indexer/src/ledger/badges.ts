/**
 * Helper badges (docs/PLAN.md section 7).
 *
 * A badge is recognition and nothing else. It carries no amount, it is not
 * ranked, it cannot be spent and it gates nothing: not voting, not vote
 * weight, not XP. Read `HELPER_BADGES` in packages/shared for the table.
 *
 * `helper` and `translator` take the place of the XP that owner-confirmed help
 * used to pay. That work rests on the cause owner's word alone, so a cause and
 * a friend could have traded XP between themselves forever. A badge is worth
 * nothing to trade.
 *
 * Idempotency is the `(wallet, slug)` unique index, so a badge is earned once.
 */
import { HELPER_BADGES, type HelperBadgeSlug } from '@sera-causes/shared';
import type { HelperBadge } from '@prisma/client';
import { db } from '../db.js';
import { logger } from '../log.js';

export interface AwardBadgeInput {
  wallet: string;
  slug: HelperBadgeSlug;
  causeId?: number | null;
  /** The row it came from, for provenance: a need, gift, path or vote id. */
  sourceRef?: string | null;
}

/**
 * Records one badge. Returns the row, or null when this wallet already has it.
 */
export async function awardBadge(input: AwardBadgeInput): Promise<HelperBadge | null> {
  const wallet = input.wallet.toLowerCase();
  const existing = await db().helperBadge.findUnique({ where: { wallet_slug: { wallet, slug: input.slug } } });
  if (existing) return null;
  try {
    return await db().helperBadge.create({
      data: { wallet, slug: input.slug, causeId: input.causeId ?? null, sourceRef: input.sourceRef ?? null },
    });
  } catch (err) {
    // Another worker got there first: the unique index did its job.
    logger.debug({ err, wallet, slug: input.slug }, 'helper badge already awarded');
    return null;
  }
}

/** Every badge a wallet has earned, oldest first. */
export async function badgesFor(wallet: string): Promise<HelperBadge[]> {
  return db().helperBadge.findMany({ where: { wallet: wallet.toLowerCase() }, orderBy: { awardedAt: 'asc' } });
}

/** The label for a badge slug, for notification copy and the API. */
export function badgeLabel(slug: string): string {
  return HELPER_BADGES[slug as HelperBadgeSlug]?.label ?? slug;
}
