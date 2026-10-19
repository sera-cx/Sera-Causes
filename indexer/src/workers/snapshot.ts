/**
 * Public snapshot (brief 11.5): every 5 minutes, `public/snapshot.json` in the
 * `sera-causes.snapshot/1` shape from contracts/scripts/snapshot.mjs, plus gifts,
 * claims and homepage state. Anyone running their own indexer must get the same numbers.
 */
import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { db } from '../db.js';
import { config } from '../config.js';
import { causeViews, stats } from '../api/causes.js';
import { listStablecoins } from '../chain/stablecoins.js';

export async function buildSnapshot() {
  const c = config();
  const [rows, needs, events, roles, cursor, tokens] = await Promise.all([
    db().cause.findMany({ orderBy: { id: 'asc' } }),
    db().need.findMany({ include: { pledges: true }, orderBy: { id: 'asc' } }),
    db().recordEvent.findMany({ orderBy: [{ at: 'desc' }, { logIndex: 'desc' }], take: 200 }),
    db().chainRole.findMany({ where: { on: true } }),
    db().indexerCursor.findFirst({ where: { chainId: c.CHAIN_ID } }),
    listStablecoins(),
  ]);
  const views = await causeViews(rows);
  const gifts = await db().gift.groupBy({ by: ['causeId', 'token'], _sum: { usd: true }, _count: { _all: true } });
  return {
    schema: 'sera-causes.snapshot/1',
    chainId: c.CHAIN_ID,
    registry: c.REGISTRY_ADDRESS,
    block: cursor ? cursor.lastBlock.toString() : null,
    generatedAt: new Date().toISOString(),
    verificationMode: c.verificationMode,
    finalisers: roles.filter((r) => r.role === 'finaliser').map((r) => r.address),
    stewards: roles.filter((r) => r.role === 'steward').map((r) => r.address),
    tokens: Object.fromEntries(tokens.map((t) => [t.address, { symbol: t.symbol, decimals: t.decimals, currency: t.currency }])),
    stats: await stats(),
    causes: views.map((v) => ({
      ...v,
      totals: Object.fromEntries(gifts.filter((g) => g.causeId === v.id).map((g) => [g.token, { usd: Number(g._sum.usd ?? 0).toFixed(2), gifts: g._count._all }])),
    })),
    needs: needs.map((n) => ({ id: n.id, causeId: n.causeId, kind: n.kind, title: n.title, detail: n.detail, open: n.open, postedAt: n.postedAt.toISOString(), helper: n.helper, confirmedHelper: n.confirmedHelper, pledges: n.pledges.map((p) => ({ helper: p.helper, note: p.note, at: p.at.toISOString(), tx: p.txHash })) })),
    feed: events.map((e) => ({ type: e.type, causeId: e.causeId, block: e.block.toString(), tx: e.txHash, logIndex: e.logIndex, at: e.at.toISOString(), data: e.data })),
  };
}

export async function writeSnapshot(): Promise<string> {
  const c = config();
  const snap = await buildSnapshot();
  await mkdir(c.publicDir, { recursive: true });
  const file = path.join(c.publicDir, 'snapshot.json');
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(snap, null, 1));
  await rename(tmp, file);
  return file;
}
