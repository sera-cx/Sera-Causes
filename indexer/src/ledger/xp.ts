/**
 * Care XP (docs/PLAN.md section 7): every helper action is recorded as an
 * `XpEvent` and queued for community.sera.cx. gSera is not involved.
 *
 * Idempotency is the `(eventType, sourceRef)` unique index, so the same
 * listing, path, vote, piece of evidence, help request or challenge can only
 * ever earn its XP once.
 */
import { XP, xpFor, type XpEventType } from '@sera-causes/shared';
import type { XpEvent } from '@prisma/client';
import { db } from '../db.js';
import { config } from '../config.js';
import { getCommunity } from '../community/client.js';
import { logger } from '../log.js';

export interface AwardXpInput {
  wallet: string;
  eventType: XpEventType;
  /** The row the event came from. Unique with `eventType`. */
  sourceRef: string;
  causeId?: number | null;
  /** Public link a reviewer on community.sera.cx can open. */
  proofUrl?: string | null;
}

/** A link on causes.sera.cx a community reviewer can open, when we can build one. */
function proofFor(input: AwardXpInput): string | null {
  if (input.proofUrl) return input.proofUrl;
  if (input.causeId == null) return null;
  return `${config().PUBLIC_WEB_URL}/c/${input.causeId}`;
}

/**
 * Records one Care XP event and hands it to the community client. Returns the
 * row, or null when this wallet already has that event.
 */
export async function awardXp(input: AwardXpInput): Promise<XpEvent | null> {
  const wallet = input.wallet.toLowerCase();
  const xp = xpFor(input.eventType);
  const existing = await db().xpEvent.findUnique({ where: { eventType_sourceRef: { eventType: input.eventType, sourceRef: input.sourceRef } } });
  if (existing) return null;
  let row: XpEvent;
  try {
    row = await db().xpEvent.create({
      data: {
        wallet,
        eventType: input.eventType,
        xp,
        sourceRef: input.sourceRef,
        causeId: input.causeId ?? null,
        proofUrl: proofFor({ ...input, wallet }),
        state: 'queued',
      },
    });
  } catch (err) {
    // Another worker got there first: the unique index did its job.
    logger.debug({ err, eventType: input.eventType, sourceRef: input.sourceRef }, 'XP event already recorded');
    return null;
  }
  try {
    const res = await getCommunity().awardXp({
      wallet: row.wallet,
      eventType: input.eventType,
      xp: row.xp,
      sourceRef: row.sourceRef,
      causeId: row.causeId,
      proofUrl: row.proofUrl,
      createdAt: row.createdAt.toISOString(),
    });
    if (res.state !== 'queued') {
      return db().xpEvent.update({ where: { id: row.id }, data: { state: res.state, sentAt: res.state === 'sent' ? new Date() : null, lastError: null } });
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.warn({ err, xpEventId: row.id }, 'community.sera.cx award failed; left queued');
    return db().xpEvent.update({ where: { id: row.id }, data: { lastError: error } });
  }
  return row;
}

/** Total XP a wallet has earned, by state. */
export async function xpTotals(wallet: string): Promise<{ total: number; queued: number; sent: number; unmatched: number }> {
  const rows = await db().xpEvent.groupBy({ by: ['state'], where: { wallet: wallet.toLowerCase() }, _sum: { xp: true } });
  const by = (state: string) => rows.find((r) => r.state === state)?._sum.xp ?? 0;
  return { total: rows.reduce((s, r) => s + (r._sum.xp ?? 0), 0), queued: by('queued'), sent: by('sent'), unmatched: by('unmatched') };
}

/** The label for an event type, for notification copy and the API. */
export function xpLabel(eventType: XpEventType): string {
  return XP[eventType].label;
}
