import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { feedOrder } from '@sera-causes/shared';
import { createApp } from '../src/api/app.js';
import { db } from '../src/db.js';
import { addr, makeCause, reset } from './helpers.js';

const app = createApp();

describe('GET /home', () => {
  beforeEach(async () => {
    await reset();
    await makeCause(1, { shown: true, listedAt: new Date('2026-10-01T00:00:00Z') });
    await makeCause(2, { shown: true, listedAt: new Date('2026-10-02T00:00:00Z') });
    await makeCause(3, { shown: true, listedAt: new Date('2026-10-03T00:00:00Z') });
    await makeCause(4, { shown: false, listedAt: new Date('2026-10-04T00:00:00Z') });
    await makeCause(5, { shown: true, listedAt: new Date('2026-10-05T00:00:00Z'), status: 'suspended' });
    await makeCause(6, { listedAt: new Date('2026-10-06T00:00:00Z') });
    // Cause 3 is steward-hidden.
    await db().homepageFlag.update({ where: { causeId: 3 }, data: { stewardHiddenReason: 'duplicate listing', stewardHiddenBy: addr('steward') } });
    // Cause 1 has the most recent activity (a gift), cause 2 only listing.
    await db().recordEvent.create({ data: { causeId: 1, type: 'GiftReceived', block: 1n, txHash: `0x${'1'.padStart(64, '0')}`, logIndex: 0, at: new Date('2026-10-18T00:00:00Z'), data: {} } });
  });

  it('orders the feed by feedOrder, excludes hidden, unshown and suspended causes, and fills the new rail', async () => {
    const r = await request(app).get('/api/v1/home');
    expect(r.status).toBe(200);
    expect(r.body.feed.map((c: { id: number }) => c.id)).toEqual([1, 2]);
    const rows = await db().cause.findMany();
    const flags = await db().homepageFlag.findMany();
    const expected = feedOrder(
      rows.map((c) => ({ id: c.id, status: c.status as 'listed', listedAt: c.listedAt, showOnHomepage: !!flags.find((f) => f.causeId === c.id)?.shown, homepageHiddenReason: flags.find((f) => f.causeId === c.id)?.stewardHiddenReason ?? null })),
      [{ causeId: 1, type: 'gift', at: '2026-10-18T00:00:00Z' }],
    ).map((c) => c.id);
    expect(r.body.feed.map((c: { id: number }) => c.id)).toEqual(expected);
    expect(r.body.new.map((c: { id: number }) => c.id)).toEqual([6, 4, 3, 2, 1]);
    expect(r.body.urgent).toBeNull();
    expect(r.body.stats.causes).toBe(5);
  });

  it('pins the urgent appeal and keeps it out of the feed', async () => {
    await db().urgentAppeal.create({ data: { causeId: 2, reason: 'Flood relief this week', setBy: addr('steward') } });
    const r = await request(app).get('/api/v1/home');
    expect(r.body.urgent.cause.id).toBe(2);
    expect(r.body.urgent.label).toMatch(/Urgent appeal/);
    expect(r.body.feed.map((c: { id: number }) => c.id)).toEqual([1]);
    const one = await request(app).get('/api/v1/causes/2');
    expect(one.body.urgent.reason).toBe('Flood relief this week');
  });

  it('steward hide and urgent-appeal routes require a steward wallet', async () => {
    const denied = await request(app).post('/api/v1/stewards/hide').set('X-Dev-Wallet', addr('helper')).send({ causeId: 1, reason: 'spam' });
    expect(denied.status).toBe(403);
    const ok = await request(app).post('/api/v1/stewards/hide').set('X-Dev-Wallet', '0x22d491bde2303f2f43325b2108d26f1eaba1e32b').send({ causeId: 1, reason: 'spam' });
    expect(ok.status).toBe(200);
    expect(ok.body.hidden).toBe(true);
    const home = await request(app).get('/api/v1/home');
    expect(home.body.feed.map((c: { id: number }) => c.id)).toEqual([2]);
    const appeal = await request(app).post('/api/v1/stewards/urgent-appeal').set('X-Dev-Wallet', '0x22d491bde2303f2f43325b2108d26f1eaba1e32b').send({ causeId: 2, reason: 'Flooding in the east coast' });
    expect(appeal.status).toBe(201);
    const record = await request(app).get('/api/v1/causes/2/record');
    expect(record.body.record.some((e: { type: string }) => e.type === 'UrgentAppealSet')).toBe(true);
  });
});
