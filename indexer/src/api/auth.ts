/**
 * Auth: `Authorization: Bearer <Privy access token>`, verified with jose
 * against Privy's JWKS for PRIVY_APP_ID (cached), then the account's Ethereum
 * wallets resolved from the Privy user API with PRIVY_APP_SECRET (cached 5
 * minutes). `X-Wallet` names which of those wallets is acting and is only
 * honoured when Privy confirms the account owns it.
 *
 * Order matters, and it is the order sera-pay settled on: the token is
 * verified, then wallet ownership is asserted against Privy, and only then
 * does a route look at the EIP-712 signature (`assertSameWallet` and
 * `verifySignedMessage` in ./signed). A signature proves who holds a key, not
 * who the signed-in account is, so it must never be the first or only gate:
 * taking it first let a caller attribute a write to any wallet it could sign
 * for. Every write route therefore sits behind `requireAuth` and compares the
 * payload wallet to `req.wallet`, which is Privy-attested.
 *
 * Dev bypass: `X-Dev-Wallet` is accepted only when NODE_ENV !== 'production'.
 *
 * Production without PRIVY_APP_ID cannot authenticate anyone, so write routes
 * answer 503 with a plain message instead of a 401 that looks like a bad
 * sign-in. `warnIfSignInUnconfigured()` says so once at startup.
 *
 * Steward routes check `isSteward` on-chain (60 s cache) or STEWARD_WALLETS in dev.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { config } from '../config.js';
import { db } from '../db.js';
import { logger } from '../log.js';
import { isSteward } from '../chain/client.js';
import { HttpError, forbidden, unauthorized, unavailable, wrap } from './errors.js';

declare module 'express' {
  interface Request {
    wallet?: string;
    privyUserId?: string;
  }
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Shown to a client when this server has no Privy app and so no sign-in. */
export const SIGN_IN_UNCONFIGURED = 'sign-in is not configured on this server, so it is read-only';
/** Shown when Privy is configured but the app secret that proves wallet ownership is not. */
export const OWNERSHIP_UNVERIFIABLE = 'this server cannot verify which wallet an account owns, so writes are closed';

// ---------------------------------------------------------------------------
// JWKS
// ---------------------------------------------------------------------------

const jwksByApp = new Map<string, JWTVerifyGetKey>();
let jwksOverride: JWTVerifyGetKey | undefined;

function getJwks(appId: string): JWTVerifyGetKey {
  if (jwksOverride) return jwksOverride;
  let get = jwksByApp.get(appId);
  if (!get) {
    get = createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`));
    jwksByApp.set(appId, get);
  }
  return get;
}

/** Tests install a local key set so nothing reaches Privy. */
export function setPrivyJwksForTests(get: JWTVerifyGetKey | undefined): void {
  jwksOverride = get;
  jwksByApp.clear();
}

/** The Privy user id (DID) in a valid access token. Throws 401 otherwise. */
export async function verifyPrivyToken(token: string, appId: string): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, getJwks(appId), { issuer: 'privy.io', audience: appId });
    if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('no sub');
    return payload.sub;
  } catch {
    throw unauthorized('invalid or expired token');
  }
}

// ---------------------------------------------------------------------------
// Wallet ownership, from Privy
// ---------------------------------------------------------------------------

const userCache = new Map<string, { wallets: string[]; at: number }>();
const USER_TTL_MS = 5 * 60 * 1000;

let privyFetch: typeof fetch = (...args) => fetch(...args);

/** Tests point the Privy user API at a stub. */
export function setPrivyFetchForTests(f: typeof fetch | undefined): void {
  privyFetch = f ?? ((...args) => fetch(...args));
  userCache.clear();
}

interface PrivyLinkedAccount {
  type: string;
  address?: string;
  chain_type?: string;
}

/**
 * The account's linked Ethereum wallets, straight from Privy. Authoritative:
 * unlike anything the browser sends, these are attested by Privy for the DID
 * in the verified token. Throws 503 without PRIVY_APP_SECRET, because nothing
 * can be verified then, and 401 when Privy will not answer for this user.
 */
export async function privyWallets(did: string): Promise<string[]> {
  const hit = userCache.get(did);
  if (hit && Date.now() - hit.at < USER_TTL_MS) return hit.wallets;
  const c = config();
  if (!c.PRIVY_APP_ID || !c.PRIVY_APP_SECRET) throw unavailable(OWNERSHIP_UNVERIFIABLE);
  const res = await privyFetch(`https://auth.privy.io/api/v1/users/${encodeURIComponent(did)}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${c.PRIVY_APP_ID}:${c.PRIVY_APP_SECRET}`).toString('base64')}`,
      'privy-app-id': c.PRIVY_APP_ID,
    },
  });
  if (!res.ok) throw unauthorized('could not resolve the signed-in user');
  const body = (await res.json()) as { linked_accounts?: PrivyLinkedAccount[] };
  const wallets = (body.linked_accounts ?? [])
    .filter((a) => a.type === 'wallet' && (a.chain_type ?? 'ethereum') === 'ethereum' && a.address && ADDRESS.test(a.address))
    .map((a) => a.address!.toLowerCase());
  userCache.set(did, { wallets, at: Date.now() });
  return wallets;
}

export function clearPrivyUserCache(): void {
  userCache.clear();
}

export interface Identity {
  wallet: string;
  privyUserId?: string;
}

/**
 * Resolves the caller's wallet, or null when no credentials are present.
 * Throws 401 on bad credentials, 403 on a wallet the account does not own and
 * 503 when this server cannot authenticate at all.
 */
export async function resolveIdentity(req: Request): Promise<Identity | null> {
  const c = config();

  // Dev bypass, outside production only.
  const dev = req.header('x-dev-wallet');
  if (dev) {
    if (c.isProduction) throw unauthorized('X-Dev-Wallet is not accepted in production');
    if (!ADDRESS.test(dev)) throw unauthorized('X-Dev-Wallet is not an address');
    return { wallet: dev.toLowerCase() };
  }

  const auth = req.header('authorization');
  if (!auth || !/^bearer\s/i.test(auth)) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;
  if (!c.PRIVY_APP_ID) throw unavailable(SIGN_IN_UNCONFIGURED);

  const did = await verifyPrivyToken(token, c.PRIVY_APP_ID);
  const known = await db().wallet.findFirst({ where: { privyUserId: did }, orderBy: { updatedAt: 'desc' } });

  // Privy decides which wallets this account owns, before any signature is
  // looked at. A missing app secret is a server problem and fails closed; a
  // Privy outage falls back to the wallet already bound to this account,
  // which Privy attested on an earlier request.
  let linked: string[];
  try {
    linked = await privyWallets(did);
  } catch (err) {
    if (err instanceof HttpError && err.status === 503) throw err;
    if (!known) throw err;
    logger.warn({ err, did }, 'privy user lookup failed; using the wallet already bound to this account');
    linked = [known.address];
  }

  const requested = req.header('x-wallet')?.trim().toLowerCase();
  let wallet: string | undefined;
  if (requested) {
    if (!ADDRESS.test(requested)) throw unauthorized('X-Wallet is not an address');
    if (!linked.includes(requested)) throw forbidden('that wallet is not linked to this account');
    wallet = requested;
  } else if (known && linked.includes(known.address)) {
    wallet = known.address;
  } else {
    wallet = linked[0];
  }
  if (!wallet) throw unauthorized('no Ethereum wallet linked to this account');

  await db().wallet.upsert({ where: { address: wallet }, create: { address: wallet, privyUserId: did }, update: { privyUserId: did } });
  return { wallet, privyUserId: did };
}

/** 503 rather than a confusing 401 when this server has no way to sign anyone in. */
function assertSignInConfigured(): void {
  const c = config();
  if (c.isProduction && !c.PRIVY_APP_ID) throw unavailable(SIGN_IN_UNCONFIGURED);
}

/** Logged once at startup, so a misconfigured deploy is obvious before the first write. */
export function warnIfSignInUnconfigured(): void {
  const c = config();
  if (c.isProduction && !c.PRIVY_APP_ID) {
    logger.warn('PRIVY_APP_ID is not set and NODE_ENV is production: nobody can sign in, and every write route will answer 503. Set PRIVY_APP_ID and PRIVY_APP_SECRET from the Privy app, and add causes.sera.cx to its allowed origins.');
  } else if (c.PRIVY_APP_ID && !c.PRIVY_APP_SECRET) {
    logger.warn('PRIVY_APP_ID is set but PRIVY_APP_SECRET is not: wallet ownership cannot be verified, so every write route will answer 503.');
  }
}

export const optionalAuth: RequestHandler = wrap(async (req, _res, next) => {
  let id: Identity | null = null;
  try {
    id = await resolveIdentity(req);
  } catch (err) {
    // Reads stay readable on a server that cannot authenticate anyone.
    if (!(err instanceof HttpError && err.status === 503)) throw err;
  }
  if (id) {
    req.wallet = id.wallet;
    req.privyUserId = id.privyUserId;
  }
  next();
});

export const requireAuth: RequestHandler = wrap(async (req, _res, next) => {
  assertSignInConfigured();
  const id = await resolveIdentity(req);
  if (!id) throw unauthorized();
  req.wallet = id.wallet;
  req.privyUserId = id.privyUserId;
  next();
});

export const requireSteward: RequestHandler = wrap(async (req: Request, _res: Response, next: NextFunction) => {
  assertSignInConfigured();
  const id = await resolveIdentity(req);
  if (!id) throw unauthorized();
  if (!(await isSteward(id.wallet))) throw forbidden('steward wallet required');
  req.wallet = id.wallet;
  req.privyUserId = id.privyUserId;
  next();
});
