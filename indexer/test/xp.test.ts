import { beforeEach, describe, expect, it } from 'vitest';
import { xpFor } from '@sera-causes/shared';
import { db } from '../src/db.js';
import { createQueueCommunityClient } from '../src/community/client.js';
import { awardXp, xpTotals } from '../src/ledger/xp.js';
import { isSiteVisit, settleClaim } from '../src/ledger/rewards.js';
import { addr, makeCause, reset, setClaim } from './helpers.js';

const closed = { state: 'challenge_window', outcome: 'verified', challengeWindowEnd: new Date(Date.now() - 1000) };

async function evidence(causeId: number, claimType: string, uploader: string, kind = 'document') {
  const n = await db().evidence.count();
  return db().evidence.create({
    data: { causeId, claimType, uploader, kind, fileUrl: `/uploads/${n}`, fileHash: `0x${(n + 1).toString(16).padStart(64, '0')}`, title: `Evidence ${n}` },
  });
}

async function path(causeId: number, claimType: string, author: string, body: object = {}) {
  return db().path.create({
    data: { causeId, claimType, epoch: 0, author, body, contentHash: `0x${'1'.repeat(64)}`, result: 'verified', checkedAt: new Date(), signature: '0x' },
  });
}

describe('Care XP events', () => {
  beforeEach(async () => {
    await reset();
    await makeCause(1, { owner: addr('owner') });
  });

  it('records one event per (eventType, sourceRef) and leaves it queued', async () => {
    const first = await awardXp({ wallet: addr('helper').toUpperCase(), eventType: 'care_cause_listed', sourceRef: 'cause:1', causeId: 1 });
    expect(first).toMatchObject({ wallet: addr('helper'), xp: 100, state: 'queued' });
    expect(first?.proofUrl).toBe('http://localhost:3000/c/1');
    expect(await awardXp({ wallet: addr('helper'), eventType: 'care_cause_listed', sourceRef: 'cause:1', causeId: 1 })).toBeNull();
    expect(await db().xpEvent.count()).toBe(1);
  });

  it('totals XP by state for a wallet', async () => {
    await awardXp({ wallet: addr('helper'), eventType: 'care_cause_listed', sourceRef: 'cause:1', causeId: 1 });
    await awardXp({ wallet: addr('helper'), eventType: 'care_evidence_accepted', sourceRef: 'ev:1', causeId: 1 });
    expect(await xpTotals(addr('helper'))).toEqual({ total: 200, queued: 200, sent: 0, unmatched: 0 });
  });

  it('pays evidence 100 XP when the claim it supports is final, whichever way it went', async () => {
    const e = await evidence(1, 'C1', addr('helper'));
    await setClaim(1, 'C1', { ...closed, outcome: 'not_verified' });
    const cs = await db().claimState.findUniqueOrThrow({ where: { causeId_claimType: { causeId: 1, claimType: 'C1' } } });
    await settleClaim(cs, new Date());
    const row = await db().xpEvent.findFirstOrThrow({ where: { eventType: 'care_evidence_accepted' } });
    expect(row).toMatchObject({ wallet: addr('helper'), xp: 100, sourceRef: e.id });
  });

  it('adds a site visit on top of a C4 path with a dated photo, and never on another claim', async () => {
    const photo = await evidence(1, 'C4', addr('helper'), 'photo');
    const visit = await path(1, 'C4', addr('helper'), { screenshotEvidenceId: photo.id });
    const desk = await path(1, 'C1', addr('helper2'));
    expect(await isSiteVisit(visit)).toBe(true);
    expect(await isSiteVisit(desk)).toBe(false);
    for (const claim of ['C4', 'C1']) {
      await setClaim(1, claim, closed);
      const cs = await db().claimState.findUniqueOrThrow({ where: { causeId_claimType: { causeId: 1, claimType: claim } } });
      await settleClaim(cs, new Date());
    }
    expect(await db().xpEvent.findMany({ where: { eventType: 'care_site_visit' } })).toHaveLength(1);
    expect(await xpTotals(addr('helper'))).toMatchObject({ total: xpFor('care_path_agreed') + xpFor('care_site_visit') + xpFor('care_evidence_accepted') });
    expect(await xpTotals(addr('helper2'))).toMatchObject({ total: xpFor('care_path_agreed') });
  });


  it('queue mode sends nothing and knows no members', async () => {
    const client = createQueueCommunityClient();
    expect(client.mode).toBe('queue');
    expect(await client.awardXp({ wallet: addr('helper'), eventType: 'care_vote_agreed', xp: 25, sourceRef: 'v1', createdAt: new Date().toISOString() })).toEqual({ state: 'queued' });
    expect(await client.getMember(addr('helper'))).toEqual({ wallet: addr('helper'), handle: null, careXp: null, linked: false });
  });
});
