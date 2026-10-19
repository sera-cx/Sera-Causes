import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/api/app.js';
import { db } from '../src/db.js';
import { addr, makeCause, reset } from './helpers.js';

const app = createApp();

describe('share tools and media', () => {
  beforeEach(async () => {
    await reset();
    await makeCause(1, { name: 'Free Tree Society', slug: 'free-tree-society' });
  });

  it('GET /og/cause/:id.png returns a 1200x630 PNG', async () => {
    const r = await request(app).get('/api/v1/og/cause/1.png').buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('image/png');
    const png = r.body as Buffer;
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    expect((await request(app).get('/api/v1/og/cause/999.png')).status).toBe(404);
  });

  it('renders without a photo too', async () => {
    await makeCause(2, { photo: null, name: 'A cause with a very long name that needs wrapping across several lines' });
    const r = await request(app).get('/api/v1/og/cause/2.png').buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(r.status).toBe(200);
  });

  it('GET /causes/:id/poster.pdf returns a PDF and GET /embed/give/:id an iframe-able page', async () => {
    const pdf = await request(app).get('/api/v1/causes/1/poster.pdf').buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    const embed = await request(app).get('/api/v1/embed/give/1');
    expect(embed.status).toBe(200);
    expect(embed.headers['x-frame-options']).toBeUndefined();
    expect(embed.headers['content-security-policy']).toBe('frame-ancestors *');
    expect(embed.text).toContain('Give');
    expect(embed.text).toContain('/give/1');
    expect((await request(app).get('/api/v1/stats')).headers['x-frame-options']).toBe('DENY');
  });

  it('owner adds allowlisted video links and removes them; arbitrary links are refused', async () => {
    const yt = await request(app).post('/api/v1/causes/1/media').set('X-Dev-Wallet', addr('owner')).send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', caption: 'Our work' });
    expect(yt.status, JSON.stringify(yt.body)).toBe(201);
    expect(yt.body.kind).toBe('video');
    expect(yt.body.provider).toBe('youtube');
    expect(yt.body.embedUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    const tiktok = await request(app).post('/api/v1/causes/1/media').set('X-Dev-Wallet', addr('owner')).send({ url: 'https://www.tiktok.com/@user/video/7234567890123456789' });
    expect(tiktok.body.provider).toBe('tiktok');
    const bad = await request(app).post('/api/v1/causes/1/media').set('X-Dev-Wallet', addr('owner')).send({ url: 'https://evil.example.com/embed/1' });
    expect(bad.status).toBe(400);
    const notOwner = await request(app).post('/api/v1/causes/1/media').set('X-Dev-Wallet', addr('helper')).send({ url: 'https://youtu.be/dQw4w9WgXcQ' });
    expect(notOwner.status).toBe(403);
    const cause = await request(app).get('/api/v1/causes/1');
    expect(cause.body.media).toHaveLength(2);
    const del = await request(app).delete(`/api/v1/media/${yt.body.id}`).set('X-Dev-Wallet', addr('owner'));
    expect(del.status).toBe(200);
    expect(await db().media.count({ where: { removedAt: null } })).toBe(1);
  });

  it('treasury, address, convert and withdraw routes work for the owner', async () => {
    const address = await request(app).get('/api/v1/causes/1/address');
    expect(address.status).toBe(200);
    expect(address.body.address).toBe(addr('owner'));
    expect(address.body.qr).toMatch(/^ethereum:0x/);
    const usdc = '0x1000000000000000000000000000000000000001';
    const usdt = '0x1000000000000000000000000000000000000002';
    const t = await request(app).post('/api/v1/causes/1/treasury').set('X-Dev-Wallet', addr('owner')).send({ treasuryMode: 'auto', targetToken: usdt, delegated: false });
    expect(t.status, JSON.stringify(t.body)).toBe(200);
    expect(t.body.treasuryMode).toBe('auto');
    const missing = await request(app).post('/api/v1/causes/1/treasury').set('X-Dev-Wallet', addr('owner')).send({ treasuryMode: 'auto' });
    expect(missing.status).toBe(400);
    const conv = await request(app).post('/api/v1/causes/1/convert').set('X-Dev-Wallet', addr('owner')).send({ fromToken: usdc, amountRaw: '25000000' });
    expect(conv.status, JSON.stringify(conv.body)).toBe(201);
    expect(conv.body.conversion.toToken).toBe(usdt);
    expect(conv.body.signing.intent.primaryType).toBe('Intent');
    const w = await request(app).post('/api/v1/causes/1/withdraw').set('X-Dev-Wallet', addr('owner')).send({ token: usdt, amountRaw: '1000000', to: addr('helper') });
    expect(w.status).toBe(201);
    expect(w.body.plan.kind).toBe('transfer');
    expect(w.body.plan.from).toBe(addr('owner'));
  });

  it('gift quote returns a transfer plan for a matching currency and a Sera.cx quote otherwise', async () => {
    const usdt = '0x1000000000000000000000000000000000000002';
    const xsgd = '0x1000000000000000000000000000000000000003';
    const plain = await request(app).post('/api/v1/gifts/quote').send({ causeId: 1, fromToken: usdt, amountRaw: '5000000' });
    expect(plain.status, JSON.stringify(plain.body)).toBe(200);
    expect(plain.body.kind).toBe('transfer');
    expect(plain.body.to).toBe(addr('owner'));
    expect(plain.body.eip681).toContain('/transfer?address=');
    await request(app).post('/api/v1/causes/1/treasury').set('X-Dev-Wallet', addr('owner')).send({ treasuryMode: 'manual', targetToken: usdt });
    const swap = await request(app).post('/api/v1/gifts/quote').set('X-Dev-Wallet', addr('giver')).send({ causeId: 1, fromToken: xsgd, amountRaw: '5000000' });
    expect(swap.status, JSON.stringify(swap.body)).toBe(200);
    expect(swap.body.kind).toBe('swap');
    expect(swap.body.recipient).toBe(addr('owner'));
    expect(swap.body.signing.intent.message.recipient.toLowerCase()).toBe(addr('owner'));
    const anon = await request(app).post('/api/v1/gifts/quote').send({ causeId: 1, fromToken: xsgd, amountRaw: '5000000' });
    expect(anon.status).toBe(400);
  });
});
