/**
 * Share tools and the creator dashboard: OG image, QR poster, embed page, dashboard.
 */
import { Router } from 'express';
import { db } from '../../db.js';
import { config } from '../../config.js';
import { requireAuth } from '../auth.js';
import { forbidden, notFound, wrap } from '../errors.js';
import { causeView, causeViews, findCause } from '../causes.js';
import { renderOgPng } from '../media/og.js';
import { writePoster } from '../media/poster.js';
import { embedHtml, embedSnippet } from '../media/embed.js';
import { serializeConversion, serializeGift, serializeMedia, serializeNeed, serializeWallet, serializeWithdrawal } from '../serializers.js';
import { listStablecoins } from '../../chain/stablecoins.js';
import { eip681 } from './owner.js';

export const media: Router = Router();

media.get(
  '/og/cause/:id.png',
  wrap(async (req, res) => {
    const row = await findCause(req.params.id!);
    if (!row) throw notFound('cause not found');
    const view = await causeView(row);
    const png = await renderOgPng(view);
    res.setHeader('content-type', 'image/png');
    res.setHeader('cache-control', 'public, max-age=300');
    res.send(png);
  }),
);

media.get(
  '/causes/:id/poster.pdf',
  wrap(async (req, res) => {
    const row = await findCause(req.params.id!);
    if (!row) throw notFound('cause not found');
    const view = await causeView(row);
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `inline; filename="${view.slug}-poster.pdf"`);
    await writePoster(view, view.depositAddress, res);
  }),
);

media.get(
  '/embed/give/:id',
  wrap(async (req, res) => {
    const row = await findCause(req.params.id!);
    if (!row) throw notFound('cause not found');
    const view = await causeView(row);
    res.removeHeader('X-Frame-Options');
    res.setHeader('content-security-policy', 'frame-ancestors *');
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('cache-control', 'public, max-age=300');
    res.send(embedHtml(view));
  }),
);

async function dashboardCause(view: Awaited<ReturnType<typeof causeView>>, row: { id: number; payout: string }) {
  const [gifts, wallet, mediaRows, needs, conversions, withdrawals, shares] = await Promise.all([
    db().gift.findMany({ where: { causeId: row.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
    db().causeWallet.findUnique({ where: { causeId: row.id } }),
    db().media.findMany({ where: { causeId: row.id, removedAt: null }, orderBy: { position: 'asc' } }),
    db().need.findMany({ where: { causeId: row.id }, include: { pledges: true }, orderBy: { id: 'asc' } }),
    db().conversion.findMany({ where: { causeId: row.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
    db().withdrawal.findMany({ where: { causeId: row.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
    db().shareEvent.groupBy({ by: ['channel'], where: { causeId: row.id }, _count: { _all: true } }),
  ]);
  const byToken = new Map<string, bigint>();
  for (const g of gifts) byToken.set(g.token, (byToken.get(g.token) ?? 0n) + BigInt(g.amount));
  const tokens = await listStablecoins();
  const c = config();
  const address = wallet?.address ?? row.payout;
  return {
    ...view,
    wallet: serializeWallet(wallet, row.payout),
    address: { address, chainId: c.CHAIN_ID, qr: eip681(c.CHAIN_ID, address) },
    receivedByToken: [...byToken].map(([token, amount]) => ({ token, symbol: tokens.find((t) => t.address === token)?.symbol ?? null, amountRaw: amount.toString() })),
    gifts: gifts.map(serializeGift),
    media: mediaRows.map(serializeMedia),
    helpRequests: needs.map(serializeNeed),
    conversions: conversions.map(serializeConversion),
    withdrawals: withdrawals.map(serializeWithdrawal),
    shares: Object.fromEntries(shares.map((s) => [s.channel, s._count._all])),
    share: { url: view.shareUrl, og: view.ogImageUrl, poster: view.posterUrl, embed: embedSnippet(row.id) },
  };
}

media.get(
  '/dashboard',
  requireAuth,
  wrap(async (req, res) => {
    const rows = await db().cause.findMany({ where: { OR: [{ owner: req.wallet! }, { lister: req.wallet! }] }, orderBy: { listedAt: 'desc' } });
    const views = await causeViews(rows);
    const causes = await Promise.all(views.map((v, i) => dashboardCause(v, rows[i]!)));
    const totals = {
      givenUsd: causes.reduce((s, c) => s + Number(c.givenUsd), 0).toFixed(2),
      givers: causes.reduce((s, c) => s + c.giversCount, 0),
      causes: causes.length,
    };
    res.json({ wallet: req.wallet, totals, causes });
  }),
);

media.get(
  '/dashboard/causes/:id',
  requireAuth,
  wrap(async (req, res) => {
    const row = await findCause(req.params.id!);
    if (!row) throw notFound('cause not found');
    if (row.owner !== req.wallet && row.lister !== req.wallet) throw forbidden('not your cause');
    const view = await causeView(row);
    res.json(await dashboardCause(view, row));
  }),
);
