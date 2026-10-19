/**
 * Auth: `Authorization: Bearer <Privy access token>` verified with jose against
 * Privy's JWKS when PRIVY_APP_ID is set, resolving the user's Ethereum wallet
 * through the Privy user API (cached). Dev bypass `X-Dev-Wallet` only when
 * NODE_ENV !== 'production'. Steward routes check `isSteward` on-chain (60 s cache)
 * or STEWARD_WALLETS in dev.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { config } from '../config.js';
import { db } from '../db.js';
import { isSteward } from '../chain/client.js';
import { forbidden, unauthorized, wrap } from './errors.js';

declare module 'express' {
  interface Request {
    wallet?: string;
    privyUserId?: string;
  }
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

let jwks: JWTVerifyGetKey | undefined;
function getJwks(appId: string): JWTVerifyGetKey {
  if (!jwks) jwks = createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`));
  return jwks;
}

const userCache = new Map<string, { wallets: string[]; at: number }>();
const USER_TTL_MS = 5 * 60 * 1000;

interface PrivyLinkedAccount {
  type: string;
  address?: string;
  chain_type?: string;
}

/** Ethereum wallets linked to a Privy user. Needs PRIVY_APP_SECRET. */
export async function privyWallets(did: string, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  const hit = userCache.get(did);
  if (hit && Date.now() - hit.at < USER_TTL_MS) return hit.wallets;
  const c = config();
  if (!c.PRIVY_APP_ID || !c.PRIVY_APP_SECRET) return [];
  const res = await fetchImpl(`https://auth.privy.io/api/v1/users/${encodeURIComponent(did)}`, {
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

export interface Identity {
  wallet: string;
  privyUserId?: string;
}

/** Resolves the caller's wallet, or null when no credentials are present. Throws 401 on bad credentials. */
export async function resolveIdentity(req: Request): Promise<Identity | null> {
  const c = config();
  const dev = req.header('x-dev-wallet');
  if (dev && !c.isProduction) {
    if (!ADDRESS.test(dev)) throw unauthorized('X-Dev-Wallet is not an address');
    return { wallet: dev.toLowerCase() };
  }
  const auth = req.header('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  if (!c.PRIVY_APP_ID) throw unauthorized('PRIVY_APP_ID is not configured');
  let did: string;
  try {
    const { payload } = await jwtVerify(token, getJwks(c.PRIVY_APP_ID), { issuer: 'privy.io', audience: c.PRIVY_APP_ID });
    if (!payload.sub) throw new Error('no sub');
    did = payload.sub;
  } catch {
    throw unauthorized('invalid or expired token');
  }
  const known = await db().wallet.findFirst({ where: { privyUserId: did }, orderBy: { updatedAt: 'desc' } });
  const requested = req.header('x-wallet')?.toLowerCase();
  let wallets: string[] = [];
  try {
    wallets = await privyWallets(did);
  } catch (err) {
    if (!known) throw err;
  }
  let wallet: string | undefined;
  if (requested && wallets.includes(requested)) wallet = requested;
  else if (known && (wallets.length === 0 || wallets.includes(known.address))) wallet = known.address;
  else wallet = wallets[0];
  if (!wallet) throw unauthorized('no Ethereum wallet linked to this account');
  await db().wallet.upsert({ where: { address: wallet }, create: { address: wallet, privyUserId: did }, update: { privyUserId: did } });
  return { wallet, privyUserId: did };
}

export const optionalAuth: RequestHandler = wrap(async (req, _res, next) => {
  const id = await resolveIdentity(req);
  if (id) {
    req.wallet = id.wallet;
    req.privyUserId = id.privyUserId;
  }
  next();
});

export const requireAuth: RequestHandler = wrap(async (req, _res, next) => {
  const id = await resolveIdentity(req);
  if (!id) throw unauthorized();
  req.wallet = id.wallet;
  req.privyUserId = id.privyUserId;
  next();
});

export const requireSteward: RequestHandler = wrap(async (req: Request, _res: Response, next: NextFunction) => {
  const id = await resolveIdentity(req);
  if (!id) throw unauthorized();
  if (!(await isSteward(id.wallet))) throw forbidden('steward wallet required');
  req.wallet = id.wallet;
  req.privyUserId = id.privyUserId;
  next();
});
