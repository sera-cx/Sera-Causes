/**
 * Privy authentication, end to end through a write route, with the JWKS and
 * the Privy user API both stubbed. Nothing here talks to Privy.
 *
 * What is being pinned down: a valid token authenticates; the wallet that
 * signed the EIP-712 payload has to be a wallet Privy says the account owns,
 * and asking for someone else's wallet is refused before the signature is
 * looked at; the `X-Dev-Wallet` bypass is dead in production; and a production
 * server with no Privy app answers 503 on writes while reads keep working.
 */
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PATH_RESULT, contentHash } from '@sera-causes/shared';
import { createApp } from '../src/api/app.js';
import { SIGN_IN_UNCONFIGURED, clearPrivyUserCache, setPrivyFetchForTests, setPrivyJwksForTests } from '../src/api/auth.js';
import { config, loadConfig, setConfigForTests, type Config } from '../src/config.js';
import { accounts, addr, jsonMessage, makeCause, reset, sign } from './helpers.js';

const APP_ID = 'test-privy-app';
const DID = 'did:privy:helper';

let signingKey: KeyLike;
let baseConfig: Config;

/** did -> the Ethereum wallets Privy reports for it. */
const linked = new Map<string, string[]>();
/** How many times the stubbed Privy user API was called, to prove the cache works. */
let userLookups = 0;

function configWith(env: Record<string, string | undefined>): Config {
  return loadConfig({ ...process.env, ...env } as NodeJS.ProcessEnv);
}

async function token(opts: { sub?: string; aud?: string; iss?: string; expired?: boolean } = {}): Promise<string> {
  const jwt = new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
    .setIssuer(opts.iss ?? 'privy.io')
    .setAudience(opts.aud ?? APP_ID)
    .setSubject(opts.sub ?? DID)
    .setIssuedAt();
  return jwt.setExpirationTime(opts.expired ? '-1m' : '10m').sign(signingKey);
}

function pathBody() {
  return {
    source: 'Registrar of Societies public search',
    steps: ['Opened the ROS search', 'Searched PPM-1', 'Opened the result'],
    exactQuery: 'PPM-1',
    findings: 'Name and number match',
    matches: true,
    screenshotHash: `0x${'ab'.repeat(32)}`,
    checkedAt: '2026-10-19T06:05:00.000Z',
    result: 'verified' as const,
    caveats: '',
    conflictOfInterest: 'None',
  };
}

async function pathPayload(account: typeof accounts.helper, causeId = 1) {
  const body = pathBody();
  const message = {
    causeId: BigInt(causeId),
    claimType: 0,
    epoch: 0,
    contentHash: contentHash(body),
    result: PATH_RESULT.verified,
    checkedAt: BigInt(Math.floor(Date.parse(body.checkedAt) / 1000)),
  };
  return { wallet: account.address, message: jsonMessage(message), body, signature: await sign(account, 'Path', message) };
}

beforeAll(async () => {
  baseConfig = config();

  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  signingKey = privateKey;
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'ES256', use: 'sig' };
  setPrivyJwksForTests(createLocalJWKSet({ keys: [jwk] }));

  setPrivyFetchForTests(async (input) => {
    userLookups += 1;
    const did = decodeURIComponent(String(input).split('/').pop() ?? '');
    const wallets = linked.get(did);
    if (!wallets) return new Response('not found', { status: 404 });
    return new Response(
      JSON.stringify({
        id: did,
        linked_accounts: [{ type: 'email', address: 'helper@example.org' }, ...wallets.map((address) => ({ type: 'wallet', chain_type: 'ethereum', address }))],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });

  await reset();
});

afterAll(() => {
  setPrivyJwksForTests(undefined);
  setPrivyFetchForTests(undefined);
  setConfigForTests(baseConfig);
});

beforeEach(async () => {
  setConfigForTests(configWith({ PRIVY_APP_ID: APP_ID, PRIVY_APP_SECRET: 'test-privy-secret' }));
  clearPrivyUserCache();
  linked.clear();
  userLookups = 0;
  await reset();
  await makeCause(1);
});

describe('a valid Privy token', () => {
  it('authenticates a signed write, attributed to the account’s linked wallet', async () => {
    linked.set(DID, [addr('helper')]);
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/paths')
      .set('Authorization', `Bearer ${await token()}`)
      .send(await pathPayload(accounts.helper));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.path.author).toBe(addr('helper'));
  });

  it('records the Privy user id against the wallet, and asks Privy once per account', async () => {
    linked.set(DID, [addr('helper')]);
    const app = createApp();
    const bearer = `Bearer ${await token()}`;
    const me = await request(app).get('/api/v1/me').set('Authorization', bearer);
    expect(me.status, JSON.stringify(me.body)).toBe(200);
    expect(me.body.wallet).toBe(addr('helper'));
    await request(app).get('/api/v1/me').set('Authorization', bearer);
    expect(userLookups).toBe(1);
  });

  it('lets X-Wallet pick between linked wallets', async () => {
    linked.set(DID, [addr('helper'), addr('helper2')]);
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/paths')
      .set('Authorization', `Bearer ${await token()}`)
      .set('X-Wallet', addr('helper2'))
      .send(await pathPayload(accounts.helper2));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.path.author).toBe(addr('helper2'));
  });

  it('is refused when the audience or the signature is not this app’s', async () => {
    linked.set(DID, [addr('helper')]);
    const app = createApp();
    for (const bad of [await token({ aud: 'some-other-app' }), await token({ iss: 'evil.example' }), await token({ expired: true }), 'not-a-jwt']) {
      const res = await request(app)
        .post('/api/v1/paths')
        .set('Authorization', `Bearer ${bad}`)
        .send(await pathPayload(accounts.helper));
      expect(res.status, JSON.stringify(res.body)).toBe(401);
    }
  });
});

describe('a token whose linked wallet differs from the signing wallet', () => {
  it('is rejected, with no path written', async () => {
    linked.set(DID, [addr('helper')]);
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/paths')
      .set('Authorization', `Bearer ${await token()}`)
      .send(await pathPayload(accounts.helper2));
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body.error).toMatch(/does not match the signed-in wallet/);
  });

  it('is rejected when the browser asks for a wallet Privy does not link, before any signature is checked', async () => {
    linked.set(DID, [addr('helper')]);
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/paths')
      .set('Authorization', `Bearer ${await token()}`)
      .set('X-Wallet', addr('helper2'))
      .send(await pathPayload(accounts.helper2));
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body.error).toMatch(/not linked to this account/);
  });

  it('is rejected when the account has no Ethereum wallet at all', async () => {
    linked.set(DID, []);
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/paths')
      .set('Authorization', `Bearer ${await token()}`)
      .send(await pathPayload(accounts.helper));
    expect(res.status, JSON.stringify(res.body)).toBe(401);
    expect(res.body.error).toMatch(/no Ethereum wallet linked/);
  });
});

describe('the dev bypass', () => {
  it('works outside production, which is what the other suites rely on', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/paths').set('X-Dev-Wallet', addr('helper')).send(await pathPayload(accounts.helper));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  });

  it('is ignored when NODE_ENV is production', async () => {
    setConfigForTests(configWith({ NODE_ENV: 'production', PRIVY_APP_ID: APP_ID, PRIVY_APP_SECRET: 'test-privy-secret' }));
    const app = createApp();
    const res = await request(app).post('/api/v1/paths').set('X-Dev-Wallet', addr('helper')).send(await pathPayload(accounts.helper));
    expect(res.status, JSON.stringify(res.body)).toBe(401);
    expect(res.body.error).toMatch(/not accepted in production/);
  });
});

describe('production without a Privy app', () => {
  beforeEach(() => {
    setConfigForTests(configWith({ NODE_ENV: 'production', PRIVY_APP_ID: '', PRIVY_APP_SECRET: '' }));
  });

  it('answers 503 with a plain message on a write, not a confusing 401', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/paths').send(await pathPayload(accounts.helper));
    expect(res.status, JSON.stringify(res.body)).toBe(503);
    expect(res.body.error).toBe(SIGN_IN_UNCONFIGURED);
  });

  it('leaves reads working', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/causes/1');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.id).toBe(1);
  });
});

describe('Privy configured without the app secret', () => {
  it('cannot verify wallet ownership, so writes answer 503', async () => {
    setConfigForTests(configWith({ PRIVY_APP_ID: APP_ID, PRIVY_APP_SECRET: '' }));
    linked.set(DID, [addr('helper')]);
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/paths')
      .set('Authorization', `Bearer ${await token()}`)
      .send(await pathPayload(accounts.helper));
    expect(res.status, JSON.stringify(res.body)).toBe(503);
    expect(res.body.error).toMatch(/cannot verify which wallet an account owns/);
    expect(userLookups).toBe(0);
  });
});
