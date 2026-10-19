import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import type { Hex } from 'viem';
import { CLAIMS, typedData, type CausesMessages, type CausesPrimaryType } from '@sera-causes/shared';
import { config } from '../src/config.js';
import { db } from '../src/db.js';
import { resetDatabase } from '../src/seed/seed.js';
import { setGseraForTests } from '../src/services/gsera.js';
import { setSettlementForTests } from '../src/services/settlement.js';
import { clearStablecoinCache } from '../src/chain/stablecoins.js';

export const KEYS = {
  owner: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  giver: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  helper: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  helper2: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
  steward: '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
} as const;

export const accounts = Object.fromEntries(Object.entries(KEYS).map(([k, v]) => [k, privateKeyToAccount(v as Hex)])) as Record<keyof typeof KEYS, PrivateKeyAccount>;
export const addr = (k: keyof typeof KEYS): string => accounts[k].address.toLowerCase();

export const STEWARD = '0x22d491bde2303f2f43325b2108d26f1eaba1e32b';

export async function sign<K extends CausesPrimaryType>(account: PrivateKeyAccount, kind: K, message: CausesMessages[K]): Promise<Hex> {
  const c = config();
  const td = typedData(kind, c.CHAIN_ID, c.REGISTRY_ADDRESS, message);
  return account.signTypedData({ domain: td.domain, types: td.types, primaryType: kind, message: message as never } as never);
}

/** Message fields as JSON (bigint to number) for the API body. */
export function jsonMessage<T extends object>(m: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v]));
}

export const now = (): number => Math.floor(Date.now() / 1000);

export async function reset(): Promise<void> {
  await resetDatabase();
  setGseraForTests(undefined);
  setSettlementForTests(undefined);
  clearStablecoinCache();
}

export interface CauseOverrides {
  owner?: string;
  payout?: string;
  status?: string;
  slug?: string;
  name?: string;
  listedAt?: Date;
  shown?: boolean;
  requiresCareLicence?: boolean;
  photo?: string | null;
}

export async function makeCause(id: number, o: CauseOverrides = {}) {
  const owner = (o.owner ?? addr('owner')).toLowerCase();
  const name = o.name ?? `Cause ${id}`;
  const slug = o.slug ?? `cause-${id}`;
  const profile = {
    schema: 'csd.cause/1',
    slug,
    name,
    legalName: name,
    category: 'environment',
    location: { town: 'Kuala Lumpur', state: 'Kuala Lumpur', country: 'MY' },
    summary: 'A test cause',
    programmes: [],
    impact: [],
    beneficiaries: '',
    organisation: { entityType: '', registration: `PPM-${id}`, registrationSource: '', founded: '', founders: '', leadership: '', taxExemption: { statement: '', source: '' }, accounts: '' },
    contact: { website: `https://example.org/${slug}` },
    sources: [],
    profileCheckedOn: '2026-10-17',
  };
  const cause = await db().cause.create({
    data: {
      id,
      chainId: config().CHAIN_ID,
      slug,
      owner,
      payout: (o.payout ?? owner).toLowerCase(),
      lister: owner,
      category: 'environment',
      uri: `seed/causes/${slug}.json`,
      status: o.status ?? 'listed',
      listedAt: o.listedAt ?? new Date('2026-10-01T00:00:00Z'),
      waitingSince: o.listedAt ?? new Date('2026-10-01T00:00:00Z'),
      requiresCareLicence: o.requiresCareLicence ?? false,
      listedVia: 'causes.sera.cx',
      profile,
      photoUrl: o.photo === undefined ? `${config().PUBLIC_API_URL}/photos/free-tree-society.jpg` : o.photo,
    },
  });
  await db().claimState.createMany({ data: CLAIMS.map((k) => ({ causeId: id, claimType: k })) });
  if (o.shown !== undefined) {
    await db().homepageFlag.create({ data: { causeId: id, shown: o.shown, setBy: owner, signature: 'seed', signedAt: new Date() } });
  }
  return cause;
}

export async function setClaim(causeId: number, claimType: string, data: Record<string, unknown>) {
  return db().claimState.update({ where: { causeId_claimType: { causeId, claimType } }, data });
}
