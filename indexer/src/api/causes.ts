/**
 * Query helpers shared by the read routes, the dashboard, the snapshot worker and the OG image.
 */
import type { Cause as CauseRow } from '@prisma/client';
import type { FeedEvent, FeedEventType } from '@sera-causes/shared';
import { db } from '../db.js';
import { serializeCause, type CauseView, type ClaimExtras } from './serializers.js';

const FEED_TYPE_BY_EVENT: Record<string, FeedEventType> = {
  GiftReceived: 'gift',
  Attested: 'evidence',
  ProgressPosted: 'update',
  ClaimFinalised: 'claim_finalised',
};

export async function findCause(idOrSlug: string): Promise<CauseRow | null> {
  if (/^\d+$/.test(idOrSlug)) return db().cause.findUnique({ where: { id: Number(idOrSlug) } });
  return db().cause.findFirst({ where: { slug: idOrSlug } });
}

/** Feed events for feedOrder: chain record events of the feed types plus evidence uploads. */
export async function feedEvents(causeIds?: number[]): Promise<FeedEvent[]> {
  const where = { type: { in: Object.keys(FEED_TYPE_BY_EVENT) }, causeId: causeIds ? { in: causeIds } : { not: null } };
  const [events, evidence] = await Promise.all([
    db().recordEvent.findMany({ where, select: { causeId: true, type: true, at: true } }),
    db().evidence.findMany({ where: { removedAt: null, ...(causeIds ? { causeId: { in: causeIds } } : {}) }, select: { causeId: true, createdAt: true } }),
  ]);
  const out: FeedEvent[] = [];
  for (const e of events) if (e.causeId !== null) out.push({ causeId: e.causeId, type: FEED_TYPE_BY_EVENT[e.type]!, at: e.at });
  for (const e of evidence) out.push({ causeId: e.causeId, type: 'evidence', at: e.createdAt });
  return out;
}

export async function activeAppeal(now: Date = new Date()) {
  return db().urgentAppeal.findFirst({
    where: { clearedAt: null, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    orderBy: { startsAt: 'desc' },
  });
}

/** Builds full cause views for a set of rows with one query per related table. */
export async function causeViews(rows: CauseRow[]): Promise<CauseView[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const now = new Date();
  const [claims, flags, appeals, evidence, paths, challenges, events, wallets, media] = await Promise.all([
    db().claimState.findMany({ where: { causeId: { in: ids } }, orderBy: { claimType: 'asc' } }),
    db().homepageFlag.findMany({ where: { causeId: { in: ids } } }),
    db().urgentAppeal.findMany({ where: { causeId: { in: ids }, clearedAt: null, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] } }),
    db().evidence.findMany({ where: { causeId: { in: ids }, removedAt: null }, select: { causeId: true, claimType: true, createdAt: true } }),
    db().path.findMany({ where: { causeId: { in: ids } }, select: { causeId: true, claimType: true, epoch: true, author: true, result: true } }),
    db().challenge.findMany({ where: { causeId: { in: ids }, state: 'open' }, select: { causeId: true, claimType: true } }),
    feedEvents(ids),
    db().causeWallet.findMany({ where: { causeId: { in: ids } } }),
    db().media.groupBy({ by: ['causeId'], where: { causeId: { in: ids }, removedAt: null }, _count: { _all: true } }),
  ]);

  const claimsBy = new Map<number, typeof claims>();
  for (const k of claims) claimsBy.set(k.causeId, [...(claimsBy.get(k.causeId) ?? []), k]);
  const flagBy = new Map(flags.map((f) => [f.causeId, f]));
  const appealBy = new Map(appeals.map((a) => [a.causeId, a]));
  const evidenceCount = new Map<number, number>();
  const claimExtras = new Map<number, Record<string, ClaimExtras>>();
  const extra = (causeId: number, claimType: string): ClaimExtras => {
    let m = claimExtras.get(causeId);
    if (!m) claimExtras.set(causeId, (m = {}));
    return (m[claimType] ??= { evidenceCount: 0, pathCount: 0, independentChecks: 0, challenged: false });
  };
  for (const e of evidence) {
    evidenceCount.set(e.causeId, (evidenceCount.get(e.causeId) ?? 0) + 1);
    extra(e.causeId, e.claimType).evidenceCount! += 1;
  }
  const pathAuthors = new Map<string, Map<string, Set<string>>>();
  for (const p of paths) {
    const cs = claimsBy.get(p.causeId)?.find((k) => k.claimType === p.claimType);
    if (cs && cs.epoch !== p.epoch) continue;
    const x = extra(p.causeId, p.claimType);
    x.pathCount! += 1;
    const key = `${p.causeId}:${p.claimType}`;
    let byResult = pathAuthors.get(key);
    if (!byResult) pathAuthors.set(key, (byResult = new Map()));
    let set = byResult.get(p.result);
    if (!set) byResult.set(p.result, (set = new Set()));
    set.add(p.author);
  }
  for (const [key, byResult] of pathAuthors) {
    const [causeId, claimType] = key.split(':');
    const best = Math.max(0, ...[...byResult.values()].map((s) => s.size));
    extra(Number(causeId), claimType!).independentChecks = best;
  }
  for (const ch of challenges) extra(ch.causeId, ch.claimType).challenged = true;
  const lastActivity = new Map<number, Date>();
  for (const e of events) {
    const at = e.at instanceof Date ? e.at : new Date(e.at);
    const prev = lastActivity.get(e.causeId);
    if (!prev || at > prev) lastActivity.set(e.causeId, at);
  }
  const walletBy = new Map(wallets.map((w) => [w.causeId, w]));
  const mediaBy = new Map(media.map((m) => [m.causeId, m._count._all]));

  return rows.map((row) =>
    serializeCause(row, {
      claims: claimsBy.get(row.id) ?? [],
      claimExtras: claimExtras.get(row.id),
      evidenceCount: evidenceCount.get(row.id) ?? 0,
      flag: flagBy.get(row.id) ?? null,
      appeal: appealBy.get(row.id) ?? null,
      lastActivityAt: lastActivity.get(row.id) ?? row.listedAt,
      wallet: walletBy.get(row.id) ?? null,
      mediaCount: mediaBy.get(row.id) ?? 0,
    }),
  );
}

export async function causeView(row: CauseRow): Promise<CauseView> {
  const [v] = await causeViews([row]);
  return v!;
}

/** Recomputes a cause's given total and distinct givers from Gift rows. */
export async function refreshCauseTotals(causeId: number): Promise<void> {
  const [sum, senders] = await Promise.all([
    db().gift.aggregate({ _sum: { usd: true }, where: { causeId } }),
    db().gift.findMany({ where: { causeId }, select: { sender: true }, distinct: ['sender'] }),
  ]);
  await db().cause.update({ where: { id: causeId }, data: { givenUsd: Number(sum._sum.usd ?? 0), giversCount: senders.length } });
}

/** Platform numbers for /stats and the homepage strip. */
export async function stats() {
  const [causes, verified, given, gifts, givers, helpers, vested, pending, xpPending, needsOpen] = await Promise.all([
    db().cause.count({ where: { status: { in: ['listed', 'verified'] } } }),
    db().cause.count({ where: { status: 'verified' } }),
    db().gift.aggregate({ _sum: { usd: true } }),
    db().gift.count(),
    db().gift.findMany({ select: { sender: true }, distinct: ['sender'] }),
    db().path.findMany({ select: { author: true }, distinct: ['author'] }),
    db().ledgerEntry.aggregate({ _sum: { amount: true }, where: { state: 'credited', reason: { not: 'challenge_stake' } } }),
    db().ledgerEntry.aggregate({ _sum: { amount: true }, where: { state: 'queued' } }),
    db().xpEvent.aggregate({ _sum: { xp: true }, where: { state: 'queued' } }),
    db().need.count({ where: { open: true } }),
  ]);
  return {
    causes,
    verified,
    givenUsd: Number(given._sum.usd ?? 0).toFixed(2),
    gifts,
    givers: givers.length,
    helpers: helpers.length,
    gseraCredited: vested._sum.amount ?? 0,
    gseraQueued: pending._sum.amount ?? 0,
    /** Care XP waiting to go to community.sera.cx. */
    xpQueued: xpPending._sum.xp ?? 0,
    helpRequestsOpen: needsOpen,
  };
}
