import { Router } from 'express';
import { z } from 'zod';
import {
  CATEGORIES,
  CLAIMS,
  CLAIM_INFO,
  GSERA,
  HOME_NEW_RAIL,
  COMMUNITY_SITE,
  URGENT_APPEAL_LABEL,
  VOTING,
  XP,
  feedOrder,
  newestCauses,
  votingCanOpen,
  type ClaimCode,
} from '@sera-causes/shared';
import { db } from '../../db.js';
import { config } from '../../config.js';
import { activeAppeal, causeView, causeViews, feedEvents, findCause, stats } from '../causes.js';
import { notFound, parseQuery, wrap } from '../errors.js';
import { optionalAuth, requireAuth } from '../auth.js';
import { reputationMap } from '../../ledger/reputation.js';
import { xpTotals } from '../../ledger/xp.js';
import { badgesFor } from '../../ledger/badges.js';
import { tallyFor } from '../tally.js';
import { getGsera } from '../../services/gsera.js';
import { voterEligibility } from '../eligibility.js';
import { causeName, serializeChallenge, serializeConversion, serializeEvidence, serializeGift, serializeHelperBadge, serializeLedger, serializeMedia, serializeNeed, serializePath, serializeVote, serializeWallet, serializeWithdrawal, serializeXpEvent, iso } from '../serializers.js';
import { listStablecoins } from '../../chain/stablecoins.js';

export const reads: Router = Router();

reads.get(
  '/stats',
  wrap(async (_req, res) => {
    res.json({ ...(await stats()), verificationMode: config().verificationMode, rules: { voting: VOTING, gsera: GSERA, xp: XP } });
  }),
);

const listQuery = z.object({
  cat: z.string().optional(),
  state: z.enum(['new', 'evidence_in', 'partly_verified', 'verified', 'paused', 'closed']).optional(),
  status: z.enum(['listed', 'verified', 'suspended', 'closed']).optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(['activity', 'newest', 'given']).default('activity'),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

reads.get(
  '/causes',
  wrap(async (req, res) => {
    const q = parseQuery(listQuery, req.query);
    const rows = await db().cause.findMany({
      where: {
        ...(q.cat ? { category: q.cat } : {}),
        ...(q.status ? { status: q.status } : {}),
      },
      orderBy: { listedAt: 'desc' },
    });
    let views = await causeViews(rows);
    if (q.state) views = views.filter((v) => v.stage === q.state);
    if (q.q) {
      const needle = q.q.toLowerCase();
      views = views.filter((v) => {
        const p = v.profile;
        return [v.name, v.slug, p?.legalName, p?.summary, p?.location?.state, p?.location?.town].some((s) => s?.toLowerCase().includes(needle));
      });
    }
    if (q.sort === 'activity') views.sort((a, b) => Date.parse(b.lastActivityAt ?? b.listedAt) - Date.parse(a.lastActivityAt ?? a.listedAt));
    else if (q.sort === 'given') views.sort((a, b) => Number(b.givenUsd) - Number(a.givenUsd));
    const total = views.length;
    res.json({ total, causes: views.slice(q.offset, q.offset + q.limit) });
  }),
);

reads.get(
  '/causes/:id',
  wrap(async (req, res) => {
    const row = await findCause(req.params.id!);
    if (!row) throw notFound('cause not found');
    const [view, needs, progress, attestations, hiddenFlag, wallet, media, gifts, conversions, withdrawals] = await Promise.all([
      causeView(row),
      db().need.findMany({ where: { causeId: row.id }, include: { pledges: true }, orderBy: { id: 'asc' } }),
      db().progress.findMany({ where: { causeId: row.id }, orderBy: { at: 'desc' }, take: 50 }),
      db().attestation.findMany({ where: { causeId: row.id }, orderBy: { at: 'asc' } }),
      db().homepageFlag.findUnique({ where: { causeId: row.id } }),
      db().causeWallet.findUnique({ where: { causeId: row.id } }),
      db().media.findMany({ where: { causeId: row.id, removedAt: null }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] }),
      db().gift.findMany({ where: { causeId: row.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
      db().conversion.findMany({ where: { causeId: row.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
      db().withdrawal.findMany({ where: { causeId: row.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);
    const tokens = await listStablecoins();
    const pausedNote = row.status === 'suspended'
      ? (await db().recordEvent.findFirst({ where: { causeId: row.id, type: 'StatusChanged' }, orderBy: { at: 'desc' } }))?.data
      : null;
    res.json({
      ...view,
      acceptedTokens: tokens.map((t) => ({ address: t.address, symbol: t.symbol, decimals: t.decimals, currency: t.currency })),
      helpRequests: needs.map(serializeNeed),
      updates: progress.map((p) => ({ id: p.id, kind: p.kind, uri: p.uri, body: p.body, at: p.at.toISOString(), txHash: p.txHash })),
      attestations: attestations.map((a) => ({ id: a.id, attester: a.attester, kind: a.kind, uri: a.uri, body: a.body, at: a.at.toISOString(), txHash: a.txHash })),
      concerns: attestations
        .filter((a) => ['concern', 'note', 'open-question', 'steward-note'].includes(a.kind))
        .map((a) => ({ kind: a.kind, text: (a.body as { text?: string } | null)?.text ?? a.uri, at: a.at.toISOString(), by: a.attester })),
      pausedReason: (pausedNote as { note?: string } | null)?.note ?? null,
      homepageHiddenBy: hiddenFlag?.stewardHiddenBy ?? null,
      wallet: serializeWallet(wallet, row.payout),
      media: media.map(serializeMedia),
      recentGifts: gifts.map((g) => ({ ...serializeGift(g), sender: `${g.sender.slice(0, 6)}…${g.sender.slice(-4)}` })),
      conversions: conversions.map(serializeConversion),
      withdrawals: withdrawals.map(serializeWithdrawal),
    });
  }),
);

reads.get(
  '/causes/:id/record',
  wrap(async (req, res) => {
    const row = await findCause(req.params.id!);
    if (!row) throw notFound('cause not found');
    const [events, evidence, paths, votes, challenges, appeals, flag] = await Promise.all([
      db().recordEvent.findMany({ where: { causeId: row.id }, orderBy: [{ at: 'asc' }, { block: 'asc' }, { logIndex: 'asc' }] }),
      db().evidence.findMany({ where: { causeId: row.id } }),
      db().path.findMany({ where: { causeId: row.id } }),
      db().vote.findMany({ where: { causeId: row.id }, select: { id: true, claimType: true, epoch: true, voter: true, choice: true, weight: true, createdAt: true } }),
      db().challenge.findMany({ where: { causeId: row.id } }),
      db().urgentAppeal.findMany({ where: { causeId: row.id } }),
      db().homepageFlag.findUnique({ where: { causeId: row.id } }),
    ]);
    const record: { at: string; source: 'chain' | 'api'; type: string; data: unknown }[] = [];
    for (const e of events) record.push({ at: e.at.toISOString(), source: 'chain', type: e.type, data: { ...(e.data as object), block: e.block.toString(), txHash: e.txHash, logIndex: e.logIndex } });
    for (const e of evidence) record.push({ at: e.createdAt.toISOString(), source: 'api', type: 'EvidenceAdded', data: serializeEvidence(e) });
    for (const p of paths) record.push({ at: p.createdAt.toISOString(), source: 'api', type: 'PathSigned', data: serializePath(p) });
    for (const v of votes) record.push({ at: v.createdAt.toISOString(), source: 'api', type: 'VoteSigned', data: { ...v, createdAt: v.createdAt.toISOString() } });
    for (const c of challenges) record.push({ at: c.createdAt.toISOString(), source: 'api', type: 'ChallengeOpened', data: serializeChallenge(c) });
    for (const c of challenges) if (c.resolvedAt) record.push({ at: c.resolvedAt.toISOString(), source: 'api', type: 'ChallengeResolved', data: { id: c.id, state: c.state } });
    for (const a of appeals) {
      record.push({ at: a.startsAt.toISOString(), source: 'api', type: 'UrgentAppealSet', data: { id: a.id, reason: a.reason, setBy: a.setBy, endsAt: iso(a.endsAt), label: URGENT_APPEAL_LABEL } });
      if (a.clearedAt) record.push({ at: a.clearedAt.toISOString(), source: 'api', type: 'UrgentAppealCleared', data: { id: a.id, by: a.clearedBy } });
    }
    if (flag?.stewardHiddenReason) record.push({ at: (flag.stewardHiddenAt ?? flag.updatedAt).toISOString(), source: 'api', type: 'StewardHidden', data: { reason: flag.stewardHiddenReason, by: flag.stewardHiddenBy } });
    record.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    res.json({ causeId: row.id, record });
  }),
);

const latestQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(12) });

/** The latest chain and signed-message events across every cause, newest first (the Technology page). */
reads.get(
  '/record',
  wrap(async (req, res) => {
    const q = parseQuery(latestQuery, req.query);
    const [events, evidence, paths, votes, challenges] = await Promise.all([
      db().recordEvent.findMany({ where: { causeId: { not: null } }, orderBy: [{ at: 'desc' }, { block: 'desc' }, { logIndex: 'desc' }], take: q.limit }),
      db().evidence.findMany({ where: { removedAt: null }, orderBy: { createdAt: 'desc' }, take: q.limit }),
      db().path.findMany({ orderBy: { createdAt: 'desc' }, take: q.limit }),
      db().vote.findMany({ orderBy: { createdAt: 'desc' }, take: q.limit, select: { id: true, causeId: true, claimType: true, epoch: true, voter: true, choice: true, weight: true, createdAt: true } }),
      db().challenge.findMany({ orderBy: { createdAt: 'desc' }, take: q.limit }),
    ]);
    const record: { causeId: number; at: string; source: 'chain' | 'api'; type: string; data: unknown }[] = [];
    for (const e of events) record.push({ causeId: e.causeId!, at: e.at.toISOString(), source: 'chain', type: e.type, data: { ...(e.data as object), block: e.block.toString(), txHash: e.txHash, logIndex: e.logIndex } });
    for (const e of evidence) record.push({ causeId: e.causeId, at: e.createdAt.toISOString(), source: 'api', type: 'EvidenceAdded', data: serializeEvidence(e) });
    for (const p of paths) record.push({ causeId: p.causeId, at: p.createdAt.toISOString(), source: 'api', type: 'PathSigned', data: serializePath(p) });
    for (const v of votes) record.push({ causeId: v.causeId, at: v.createdAt.toISOString(), source: 'api', type: 'VoteSigned', data: { ...v, createdAt: v.createdAt.toISOString() } });
    for (const c of challenges) record.push({ causeId: c.causeId, at: c.createdAt.toISOString(), source: 'api', type: 'ChallengeOpened', data: serializeChallenge(c) });
    record.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    const latest = record.slice(0, q.limit);
    const causes = await db().cause.findMany({ where: { id: { in: [...new Set(latest.map((r) => r.causeId))] } }, select: { id: true, slug: true, profile: true } });
    const byId = new Map(causes.map((c) => [c.id, c]));
    res.json({
      record: latest.map((r) => {
        const c = byId.get(r.causeId);
        return { ...r, causeSlug: c?.slug ?? '', causeName: c ? causeName(c) : `Cause ${r.causeId}` };
      }),
    });
  }),
);

const claimsQuery = z.object({
  tab: z.enum(['needs_evidence', 'needs_checking', 'open_for_votes', 'challenged', 'recently_verified']).default('needs_evidence'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

reads.get(
  '/claims',
  wrap(async (req, res) => {
    const q = parseQuery(claimsQuery, req.query);
    const rows = await db().cause.findMany({ where: { status: { in: ['listed', 'verified'] } } });
    const views = await causeViews(rows);
    const items: {
      cause: { id: number; slug: string; name: string; photoUrl: string | null; stage: string; category: string; location: { town: string; state: string } | null; listedAt: string };
      claim: (typeof views)[number]['claims'][number];
      label: string;
    }[] = [];
    const since = Date.now() - 30 * 86400 * 1000;
    for (const v of views) {
      for (const k of v.claims) {
        const pick =
          q.tab === 'needs_evidence'
            ? k.state === 'open' && k.outcome !== 'verified' && k.evidenceCount === 0
            : q.tab === 'needs_checking'
              ? k.state === 'open' && k.outcome !== 'verified' && k.evidenceCount > 0 && k.pathCount < VOTING.minPaths
              : q.tab === 'open_for_votes'
                ? k.state === 'voting'
                : q.tab === 'challenged'
                  ? k.challenged
                  : k.outcome === 'verified' && !!k.finalisedAt && Date.parse(k.finalisedAt) >= since;
        if (pick) {
          const loc = v.profile?.location;
          items.push({
            cause: { id: v.id, slug: v.slug, name: v.name, photoUrl: v.photoUrl, stage: v.stage, category: v.category, location: loc ? { town: loc.town, state: loc.state } : null, listedAt: v.listedAt },
            claim: k,
            label: CLAIM_INFO[k.claimType].label,
          });
        }
      }
    }
    items.sort((a, b) => (b.claim.required ? 1 : 0) - (a.claim.required ? 1 : 0));
    res.json({ tab: q.tab, total: items.length, items: items.slice(0, q.limit) });
  }),
);

reads.get(
  '/claims/:causeId/:claimType',
  optionalAuth,
  wrap(async (req, res) => {
    const row = await findCause(req.params.causeId!);
    const claimType = req.params.claimType as ClaimCode;
    if (!row || !CLAIMS.includes(claimType)) throw notFound('claim not found');
    const view = await causeView(row);
    const claim = view.claims.find((k) => k.claimType === claimType);
    if (!claim) throw notFound('claim not found');
    const [evidence, paths, votes, challenges] = await Promise.all([
      db().evidence.findMany({ where: { causeId: row.id, claimType, removedAt: null }, orderBy: { createdAt: 'asc' } }),
      db().path.findMany({ where: { causeId: row.id, claimType, epoch: claim.epoch }, orderBy: { createdAt: 'asc' } }),
      db().vote.findMany({ where: { causeId: row.id, claimType, epoch: claim.epoch }, orderBy: { createdAt: 'asc' } }),
      db().challenge.findMany({ where: { causeId: row.id, claimType }, orderBy: { createdAt: 'desc' } }),
    ]);
    const { tally } = await tallyFor(row.id, claimType, claim.epoch);
    const eligibility = req.wallet ? await voterEligibility(req.wallet) : null;
    res.json({
      cause: {
        id: view.id,
        slug: view.slug,
        name: view.name,
        photoUrl: view.photoUrl,
        stage: view.stage,
        status: view.status,
        registration: view.profile?.organisation?.registration ?? '',
        legalName: view.profile?.legalName ?? '',
      },
      claim,
      info: CLAIM_INFO[claimType],
      evidence: evidence.map(serializeEvidence),
      paths: paths.map(serializePath),
      votes: votes.map((v) => ({ ...serializeVote(v), signature: undefined })),
      tally,
      votingCanOpen: votingCanOpen(paths.map((p) => p.author)),
      challenges: challenges.map(serializeChallenge),
      decidedBy: config().verificationMode === 'advisory' ? 'stewards' : 'votes',
      eligibility,
    });
  }),
);

reads.get(
  '/home',
  wrap(async (_req, res) => {
    const rows = await db().cause.findMany({ where: { status: { in: ['listed', 'verified'] } } });
    const views = await causeViews(rows);
    const events = await feedEvents();
    const feedInput = views.map((v) => ({ ...v, listedAt: v.listedAt }));
    const feed = feedOrder(feedInput, events);
    const appeal = await activeAppeal();
    const urgentCause = appeal ? views.find((v) => v.id === appeal.causeId) : null;
    const fresh = newestCauses(views, HOME_NEW_RAIL);
    const byCategory = new Map<string, number>();
    for (const v of views) byCategory.set(v.category, (byCategory.get(v.category) ?? 0) + 1);
    res.json({
      urgent: appeal && urgentCause ? { label: URGENT_APPEAL_LABEL, reason: appeal.reason, setBy: appeal.setBy, since: appeal.startsAt.toISOString(), endsAt: iso(appeal.endsAt), cause: urgentCause } : null,
      feed: feed.filter((v) => v.id !== appeal?.causeId),
      new: fresh,
      categories: CATEGORIES.map((c) => ({ slug: c.slug, label: c.label, count: byCategory.get(c.slug) ?? 0 })),
      stats: await stats(),
      helpRequests: (await db().need.findMany({ where: { open: true }, orderBy: { postedAt: 'desc' }, take: 6 })).map((n) => serializeNeed(n)),
    });
  }),
);

reads.get(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    const wallet = req.wallet!;
    const [walletRow, ledger, xpEvents, xp, badges, reputation, gifts, paths, votes, notifications, needsHelped] = await Promise.all([
      db().wallet.findUnique({ where: { address: wallet } }),
      db().ledgerEntry.findMany({ where: { wallet }, orderBy: { createdAt: 'desc' }, take: 200 }),
      db().xpEvent.findMany({ where: { wallet }, orderBy: { createdAt: 'desc' }, take: 100 }),
      xpTotals(wallet),
      badgesFor(wallet),
      db().reputation.findUnique({ where: { wallet } }),
      db().gift.findMany({ where: { sender: wallet }, orderBy: { createdAt: 'desc' }, take: 200 }),
      db().path.findMany({ where: { author: wallet }, orderBy: { createdAt: 'desc' }, take: 100 }),
      db().vote.findMany({ where: { voter: wallet }, orderBy: { createdAt: 'desc' }, take: 100 }),
      db().notification.findMany({ where: { wallet }, orderBy: { createdAt: 'desc' }, take: 50 }),
      db().need.findMany({ where: { OR: [{ helper: wallet }, { confirmedHelper: wallet }] } }),
    ]);
    let gsera: { spendable: number; earned: number; spent: number; multipliers: unknown } | null = null;
    try {
      const w = await getGsera().getWallet(wallet);
      gsera = { spendable: w.spendable, earned: w.earned, spent: w.spent, multipliers: w.multipliers };
    } catch {
      gsera = null;
    }
    const sum = (state: string) => ledger.filter((e) => e.state === state && e.reason !== 'challenge_stake').reduce((s, e) => s + e.amount, 0);
    const staked = ledger.filter((e) => e.reason === 'challenge_stake').reduce((s, e) => s + e.amount, 0);
    // Names and slugs of every cause this wallet touched, so /me can link to them without a second round trip.
    const causeIds = new Set<number>();
    for (const g of gifts) causeIds.add(g.causeId);
    for (const p of paths) causeIds.add(p.causeId);
    for (const v of votes) causeIds.add(v.causeId);
    for (const n of needsHelped) causeIds.add(n.causeId);
    for (const e of ledger) if (e.causeId !== null) causeIds.add(e.causeId);
    for (const e of xpEvents) if (e.causeId !== null) causeIds.add(e.causeId);
    const causeRows = causeIds.size ? await db().cause.findMany({ where: { id: { in: [...causeIds] } }, select: { id: true, slug: true, profile: true } }) : [];
    res.json({
      wallet,
      causes: causeRows.map((r) => ({ id: r.id, slug: r.slug, name: causeName(r) })),
      tokens: await listStablecoins(),
      email: walletRow?.email ?? null,
      leaderboardOptOut: walletRow?.leaderboardOptOut ?? false,
      kytState: walletRow?.kytState ?? 'unknown',
      gsera,
      ledger: { credited: sum('credited'), queued: sum('queued'), cancelled: sum('cancelled'), staked, entries: ledger.map(serializeLedger) },
      // Care XP lives on community.sera.cx. It is a standing, not a balance, and it is not spendable here.
      xp: { total: xp.total, queued: xp.queued, sent: xp.sent, unmatched: xp.unmatched, site: COMMUNITY_SITE, mode: config().COMMUNITY_MODE, events: xpEvents.map(serializeXpEvent) },
      // Badges are recognition, not a score. They are not ranked and they gate nothing.
      badges: badges.map(serializeHelperBadge),
      reputation: reputation?.score ?? 0,
      gifts: gifts.map(serializeGift),
      paths: paths.map(serializePath),
      votes: votes.map(serializeVote),
      helped: needsHelped.map((n) => serializeNeed(n)),
      notifications: notifications.map((n) => ({ ...n, createdAt: n.createdAt.toISOString(), readAt: iso(n.readAt) })),
      eligibility: await voterEligibility(wallet),
    });
  }),
);

const boardQuery = z.object({
  board: z.enum(['givers', 'helpers', 'causes']).default('givers'),
  period: z.enum(['7d', '30d', 'season', 'all']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

reads.get(
  '/leaderboards',
  wrap(async (req, res) => {
    const q = parseQuery(boardQuery, req.query);
    const since = q.period === '7d' ? new Date(Date.now() - 7 * 86400e3) : q.period === '30d' ? new Date(Date.now() - 30 * 86400e3) : undefined;
    const optOut = new Set((await db().wallet.findMany({ where: { leaderboardOptOut: true }, select: { address: true } })).map((w) => w.address));
    if (q.board === 'givers') {
      const rows = await db().gift.groupBy({ by: ['sender'], where: since ? { createdAt: { gte: since } } : {}, _sum: { usd: true }, _count: { _all: true } });
      const board = rows
        .filter((r) => !optOut.has(r.sender))
        .map((r) => ({ wallet: r.sender, usd: Number(r._sum.usd ?? 0).toFixed(2), gifts: r._count._all }))
        .sort((a, b) => Number(b.usd) - Number(a.usd))
        .slice(0, q.limit);
      res.json({ board: 'givers', period: q.period, entries: board });
      return;
    }
    if (q.board === 'helpers') {
      // Helpers rank by Care XP on community.sera.cx, not by gSera (docs/PLAN.md section 7).
      const rows = await db().xpEvent.groupBy({ by: ['wallet'], where: since ? { createdAt: { gte: since } } : {}, _sum: { xp: true }, _count: { _all: true } });
      const reps = await reputationMap(rows.map((r) => r.wallet));
      const board = rows
        .filter((r) => !optOut.has(r.wallet))
        .map((r) => ({ wallet: r.wallet, xp: r._sum.xp ?? 0, events: r._count._all, reputation: reps.get(r.wallet) ?? 0 }))
        .sort((a, b) => b.xp - a.xp)
        .slice(0, q.limit);
      res.json({ board: 'helpers', period: q.period, site: COMMUNITY_SITE, entries: board });
      return;
    }
    const rows = await db().gift.groupBy({ by: ['causeId'], where: since ? { createdAt: { gte: since } } : {}, _sum: { usd: true }, _count: { _all: true } });
    const causes = await db().cause.findMany({ where: { id: { in: rows.map((r) => r.causeId) } } });
    const views = await causeViews(causes);
    const board = rows
      .map((r) => ({ cause: views.find((v) => v.id === r.causeId), usd: Number(r._sum.usd ?? 0).toFixed(2), gifts: r._count._all }))
      .filter((r) => r.cause)
      .sort((a, b) => Number(b.usd) - Number(a.usd))
      .slice(0, q.limit);
    res.json({ board: 'causes', period: q.period, entries: board });
  }),
);

reads.get(
  '/profiles/:hash.json',
  wrap(async (req, res) => {
    const row = await db().storedProfile.findUnique({ where: { hash: req.params.hash! } });
    if (!row) throw notFound('profile not found');
    res.setHeader('cache-control', 'public, max-age=31536000, immutable');
    res.json(row.body);
  }),
);

reads.get(
  '/gifts/:id',
  wrap(async (req, res) => {
    const id = req.params.id!;
    const gift = await db().gift.findUnique({ where: { id } });
    if (gift) {
      const ledger = await db().ledgerEntry.findFirst({ where: { reason: 'gift', sourceRef: gift.id } });
      res.json({ kind: 'gift', gift: serializeGift(gift), ledger: ledger ? serializeLedger(ledger) : null });
      return;
    }
    const trade = await db().giftTrade.findFirst({ where: { OR: [{ id }, { tradeId: id }] } });
    if (!trade) throw notFound('gift not found');
    res.json({
      kind: 'trade',
      trade: { id: trade.id, tradeId: trade.tradeId, causeId: trade.causeId, giver: trade.giver, state: trade.state, txHash: trade.txHash, createdAt: trade.createdAt.toISOString(), expiresAt: trade.expiresAt.toISOString(), submittedAt: iso(trade.submittedAt), settledAt: iso(trade.settledAt), lastError: trade.lastError },
    });
  }),
);

reads.get(
  '/notifications',
  requireAuth,
  wrap(async (req, res) => {
    const rows = await db().notification.findMany({ where: { wallet: req.wallet! }, orderBy: { createdAt: 'desc' }, take: 100 });
    res.json({ notifications: rows.map((n) => ({ ...n, createdAt: n.createdAt.toISOString(), readAt: iso(n.readAt) })), unread: rows.filter((n) => !n.readAt).length });
  }),
);
