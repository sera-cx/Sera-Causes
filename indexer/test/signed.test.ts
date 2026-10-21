import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { contentHash, textHash, PATH_RESULT, SIGNED_AT_TOLERANCE_SECONDS } from '@sera-causes/shared';
import { createApp } from '../src/api/app.js';
import { db } from '../src/db.js';
import { accounts, addr, jsonMessage, makeCause, now, reset, setClaim, sign } from './helpers.js';

const app = createApp();

function pathBody(result: 'verified' | 'not_verified' | 'could_not_check' = 'verified') {
  return {
    source: 'Registrar of Societies public search',
    steps: ['Opened the ROS search', 'Searched PPM-1', 'Opened the result'],
    exactQuery: 'PPM-1',
    findings: 'Name and number match',
    matches: result === 'verified',
    screenshotHash: `0x${'ab'.repeat(32)}`,
    checkedAt: '2026-10-19T06:05:00.000Z',
    result,
    caveats: '',
    conflictOfInterest: 'None',
  };
}

async function pathPayload(account: typeof accounts.helper, causeId: number, claimType = 0, epoch = 0, result: 'verified' | 'not_verified' | 'could_not_check' = 'verified') {
  const body = pathBody(result);
  const message = { causeId: BigInt(causeId), claimType, epoch, contentHash: contentHash(body), result: PATH_RESULT[result], checkedAt: BigInt(Math.floor(Date.parse(body.checkedAt) / 1000)) };
  const signature = await sign(account, 'Path', message);
  return { wallet: account.address, message: jsonMessage(message), body, signature };
}

async function votePayload(account: typeof accounts.helper, causeId: number, opts: { choice?: number; signedAt?: number; epoch?: number } = {}) {
  const reason = 'Register and profile match';
  const signedAt = BigInt(opts.signedAt ?? now());
  const message = { causeId: BigInt(causeId), claimType: 0, epoch: opts.epoch ?? 0, choice: opts.choice ?? 1, reasonHash: textHash(reason), signedAt };
  const signature = await sign(account, 'Vote', message);
  return { wallet: account.address, message: jsonMessage(message), reason, signature };
}

describe('signed writes', () => {
  beforeAll(async () => {
    await reset();
  });
  beforeEach(async () => {
    await reset();
    await makeCause(1);
  });

  describe('POST /paths', () => {
    it('accepts a valid signed path and opens voting after two independent paths', async () => {
      const r1 = await request(app).post('/api/v1/paths').set('X-Dev-Wallet', addr('helper')).send(await pathPayload(accounts.helper, 1));
      expect(r1.status, JSON.stringify(r1.body)).toBe(201);
      expect(r1.body.claim.state).toBe('open');
      const r2 = await request(app).post('/api/v1/paths').set('X-Dev-Wallet', addr('helper2')).send(await pathPayload(accounts.helper2, 1));
      expect(r2.status).toBe(201);
      expect(r2.body.claim.state).toBe('voting');
      expect(await db().path.count()).toBe(2);
    });

    it('rejects a replay of the same path', async () => {
      const p = await pathPayload(accounts.helper, 1);
      expect((await request(app).post('/api/v1/paths').set('X-Dev-Wallet', addr('helper')).send(p)).status).toBe(201);
      const again = await request(app).post('/api/v1/paths').set('X-Dev-Wallet', addr('helper')).send(p);
      expect(again.status).toBe(409);
    });

    it('rejects a signature from a different wallet and a tampered body', async () => {
      const p = await pathPayload(accounts.helper, 1);
      const wrongWallet = await request(app).post('/api/v1/paths').set('X-Dev-Wallet', addr('helper2')).send({ ...p, wallet: addr('helper2') });
      expect(wrongWallet.status).toBe(401);
      const mismatch = await request(app).post('/api/v1/paths').set('X-Dev-Wallet', addr('helper2')).send(p);
      expect(mismatch.status).toBe(403);
      const tampered = await request(app).post('/api/v1/paths').set('X-Dev-Wallet', addr('helper')).send({ ...p, body: { ...p.body, findings: 'edited' } });
      expect(tampered.status).toBe(400);
    });
  });

  describe('POST /votes', () => {
    beforeEach(async () => {
      await setClaim(1, 'C1', { state: 'voting', votingStart: new Date(), votingEnd: new Date(Date.now() + 5 * 86400e3) });
      // Eligibility: one signed verification path from the voter. A confirmed help request would not do.
      await request(app).post('/api/v1/paths').set('X-Dev-Wallet', addr('helper')).send(await pathPayload(accounts.helper, 1));
    });

    it('stores a valid vote and returns the tally', async () => {
      const r = await request(app).post('/api/v1/votes').set('X-Dev-Wallet', addr('helper')).send(await votePayload(accounts.helper, 1));
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body.vote.choice).toBe('verified');
      expect(r.body.vote.weight).toBe(1);
      expect(r.body.tally.verified).toBe(1);
      expect(r.body.decidedBy).toBe('stewards');
    });

    it('rejects a replay, a wrong signer and a stale signedAt', async () => {
      const v = await votePayload(accounts.helper, 1);
      expect((await request(app).post('/api/v1/votes').set('X-Dev-Wallet', addr('helper')).send(v)).status).toBe(201);
      expect((await request(app).post('/api/v1/votes').set('X-Dev-Wallet', addr('helper')).send(v)).status).toBe(409);
      const fresh = await votePayload(accounts.helper, 1, { signedAt: now() + 1 });
      const forged = { ...fresh, signature: (await votePayload(accounts.helper2, 1)).signature };
      const bad = await request(app).post('/api/v1/votes').set('X-Dev-Wallet', addr('helper')).send(forged);
      expect(bad.status).toBe(401);
      const stale = await request(app).post('/api/v1/votes').set('X-Dev-Wallet', addr('helper')).send(await votePayload(accounts.helper, 1, { signedAt: now() - SIGNED_AT_TOLERANCE_SECONDS - 60 }));
      expect(stale.status).toBe(400);
      expect(await db().vote.count()).toBe(1);
    });

    it('refuses an ineligible wallet', async () => {
      const r = await request(app).post('/api/v1/votes').set('X-Dev-Wallet', addr('giver')).send(await votePayload(accounts.giver, 1));
      expect(r.status).toBe(403);
      expect(r.body.detail.reasons[0]).toMatch(/credited gSera|contribution/);
    });

    it('refuses votes when voting is not open', async () => {
      await setClaim(1, 'C1', { state: 'open' });
      const r = await request(app).post('/api/v1/votes').set('X-Dev-Wallet', addr('helper')).send(await votePayload(accounts.helper, 1));
      expect(r.status).toBe(400);
    });
  });

  describe('POST /causes/:id/homepage', () => {
    it('applies an owner toggle once and rejects replays, older toggles and non-owners', async () => {
      const t = now();
      const message = { causeId: 1n, shown: true, signedAt: BigInt(t) };
      const payload = { wallet: accounts.owner.address, message: jsonMessage(message), signature: await sign(accounts.owner, 'HomepageToggle', message) };
      const ok = await request(app).post('/api/v1/causes/1/homepage').set('X-Dev-Wallet', addr('owner')).send(payload);
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      expect(ok.body.showOnHomepage).toBe(true);
      expect((await request(app).post('/api/v1/causes/1/homepage').set('X-Dev-Wallet', addr('owner')).send(payload)).status).toBe(409);
      const older = { causeId: 1n, shown: false, signedAt: BigInt(t - 1) };
      const olderPayload = { wallet: accounts.owner.address, message: jsonMessage(older), signature: await sign(accounts.owner, 'HomepageToggle', older) };
      expect((await request(app).post('/api/v1/causes/1/homepage').set('X-Dev-Wallet', addr('owner')).send(olderPayload)).status).toBe(409);
      const newer = { causeId: 1n, shown: false, signedAt: BigInt(t + 1) };
      const newerPayload = { wallet: accounts.owner.address, message: jsonMessage(newer), signature: await sign(accounts.owner, 'HomepageToggle', newer) };
      const off = await request(app).post('/api/v1/causes/1/homepage').set('X-Dev-Wallet', addr('owner')).send(newerPayload);
      expect(off.status).toBe(200);
      expect(off.body.shown).toBe(false);
      const intruder = { causeId: 1n, shown: true, signedAt: BigInt(t + 2) };
      const intruderPayload = { wallet: accounts.helper.address, message: jsonMessage(intruder), signature: await sign(accounts.helper, 'HomepageToggle', intruder) };
      expect((await request(app).post('/api/v1/causes/1/homepage').set('X-Dev-Wallet', addr('helper')).send(intruderPayload)).status).toBe(403);
    });
  });

  describe('auth', () => {
    it('requires credentials on writes and resolves X-Dev-Wallet outside production', async () => {
      expect((await request(app).post('/api/v1/paths').send({})).status).toBe(401);
      const me = await request(app).get('/api/v1/me').set('X-Dev-Wallet', addr('helper'));
      expect(me.status).toBe(200);
      expect(me.body.wallet).toBe(addr('helper'));
    });
  });
});
