/**
 * Seeds Postgres with the 44 researched causes in the same deterministic state the
 * contracts demo chain produces (contracts/scripts/demo-chain.mjs), without a chain:
 * Sera research attestations, help requests, Free Tree Society and Make-A-Wish
 * Verified, badges on Make-A-Wish, C1 verified on three more, care licence flags
 * for Children and Elderly causes (Make-A-Wish unflagged by the steward).
 *
 *   pnpm db:seed            refuses when causes already exist
 *   pnpm db:seed --reset    wipes every table first
 *   pnpm db:seed --with-gifts   adds a dozen demo gifts (not part of the chain demo)
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { keccak256, toBytes } from 'viem';
import type { Prisma } from '@prisma/client';
import { CLAIMS, findCategory, type CauseProfile } from '@sera-causes/shared';
import { awardXp } from '../ledger/xp.js';
import { config } from '../config.js';
import { db, disconnectDb } from '../db.js';
import { listStablecoins } from '../chain/stablecoins.js';
import { applyTransfer, type TransferLog } from '../chain/listener.js';
import { rewardHelp, xpForListingVerified } from '../ledger/rewards.js';

/**
 * Ganache's deterministic accounts, as used by the demo chain.
 *
 * `giver` is also the web app's demo wallet (apps/web/src/lib/devWallet.ts
 * derives it from Ganache account 5's private key): it owns cause 1 and
 * cause 14 and, with `--with-gifts`, sends a few of the demo gifts, so the
 * dashboard, /me and voting eligibility have something to show in dev.
 */
export const DEMO = {
  council: '0x90f8bf6a479f320ead074411a4b0e7944ea8c9c1',
  finaliser: '0xffcf8fdee72ac11b5c542428b35eef5769c409f0',
  steward: '0x22d491bde2303f2f43325b2108d26f1eaba1e32b',
  lister: '0xe11ba2b4d45eaed5996cd0823791e0c93114882d',
  research: '0xd03ea8624c8c5987235048901fb614fdca89b117',
  giver: '0x95ced938f7991cd0dfcb48f0a06a40fa1af46ebc',
} as const;

/** Causes the web demo wallet owns (kasih-turtle-conservation-project and free-tree-society). */
export const DEMO_OWNED_CAUSE_IDS: readonly number[] = [1, 14];

export const DEMO_LABELS: Record<string, string> = {
  [DEMO.council]: 'Sera Causes council (demo)',
  [DEMO.finaliser]: 'Finaliser (demo)',
  [DEMO.steward]: 'Steward (demo)',
  [DEMO.lister]: 'Sera onboarding',
  [DEMO.research]: 'Sera research',
  [DEMO.giver]: 'Demo wallet',
};

const T0 = new Date('2026-10-19T01:00:00Z');
const CARE_LICENCE_CATEGORIES = new Set(['children', 'elderly']);
/** The shared category slug for a profile category (`Food & poverty` is `food`), falling back to a slugified name. */
export const catKey = (c: string) => findCategory(c)?.slug ?? c.toLowerCase().replace(/[^a-z]+/g, '-').replace(/-+$/, '');
const dataUri = (obj: unknown) => `data:application/json,${encodeURIComponent(JSON.stringify(obj))}`;
const tx = (s: string) => keccak256(toBytes(`seed:${s}`));

export function needsFor(m: CauseProfile): { kind: string; title: string; detail: string }[] {
  const where = m.location.town || m.location.state;
  if (m.slug.startsWith('kasih')) {
    return [
      { kind: 'intro', title: 'Confirm who runs Kasih', detail: 'Know the team at the Chendor hatchery? Connect us so they can claim this listing and send their registration certificate.' },
      { kind: 'visit', title: 'Film a release night', detail: 'Visit Pantai Chendor at dusk during a hatchling release and post a dated video or photos.' },
      { kind: 'translate', title: 'Translate this profile', detail: 'Bahasa Malaysia, Chinese or Tamil.' },
    ];
  }
  return [
    { kind: 'intro', title: `Introduce us to ${m.name}`, detail: 'Know someone there? Connect us so they can claim this listing and send their documents.' },
    { kind: 'visit', title: `Visit and confirm in ${where}`, detail: 'Post a dated photo or note showing the work is active. It becomes a public attestation.' },
  ];
}

interface SeedIndex {
  causes: string[];
  attest?: Record<string, { kind: string; text: string }>;
}

export async function readSeed(seedDir: string): Promise<{ index: SeedIndex; causes: CauseProfile[] }> {
  const index = JSON.parse(await readFile(path.join(seedDir, 'index.json'), 'utf8')) as SeedIndex;
  const causes: CauseProfile[] = [];
  for (const slug of index.causes) causes.push(JSON.parse(await readFile(path.join(seedDir, 'causes', `${slug}.json`), 'utf8')) as CauseProfile);
  return { index, causes };
}

export async function resetDatabase(): Promise<void> {
  const tables = [
    'EmailOutbox', 'Notification', 'MockGseraWallet', 'StoredProfile', 'ChainRole', 'Token', 'RecordEvent', 'Attestation', 'Progress', 'Pledge', 'Need',
    'Wallet', 'ReputationEntry', 'Reputation', 'XpEvent', 'LedgerEntry', 'GiftTrade', 'Media', 'Withdrawal', 'Conversion', 'CauseWallet', 'Gift', 'ShareEvent',
    'UrgentAppeal', 'HomepageFlag', 'Challenge', 'Vote', 'Path', 'Evidence', 'ClaimState', 'Cause', 'IndexerCursor',
  ];
  await db().$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

export interface SeedResult {
  causes: number;
  verified: number;
  needs: number;
  gifts: number;
}

export async function seedDatabase(opts: { withGifts?: boolean; log?: (s: string) => void } = {}): Promise<SeedResult> {
  const c = config();
  const log = opts.log ?? (() => {});
  const { index, causes } = await readSeed(c.seedDir);
  let block = 8;
  let needId = 0;
  const ids: Record<string, number> = {};

  const record = async (causeId: number | null, type: string, data: Record<string, unknown>, at: Date, key: string, logIndex = 0) => {
    await db().recordEvent.create({ data: { causeId, type, block: BigInt(block), txHash: tx(key), logIndex, at, data: data as Prisma.InputJsonValue } });
  };

  await db().chainRole.createMany({ data: [{ address: DEMO.finaliser, role: 'finaliser' }, { address: DEMO.steward, role: 'steward' }], skipDuplicates: true });
  await record(null, 'FinaliserSet', { who: DEMO.finaliser, on: true, role: 'finaliser' }, T0, 'finaliser');
  block += 1;
  await record(null, 'StewardSet', { who: DEMO.steward, on: true, role: 'steward' }, T0, 'steward');
  block += 1;
  await listStablecoins({ fresh: true });

  for (const [i, m] of causes.entries()) {
    const id = i + 1;
    ids[m.slug] = id;
    const category = catKey(m.category);
    const requiresCareLicence = CARE_LICENCE_CATEGORIES.has(category);
    const uri = `seed/causes/${m.slug}.json`;
    const photo = m.image?.src ? path.basename(m.image.src) : null;
    const owner = DEMO_OWNED_CAUSE_IDS.includes(id) ? DEMO.giver : DEMO.lister;
    await db().cause.create({
      data: {
        id,
        chainId: c.CHAIN_ID,
        slug: m.slug,
        owner,
        payout: owner,
        lister: DEMO.lister,
        category,
        uri,
        status: 'listed',
        listedAt: T0,
        waitingSince: T0,
        requiresCareLicence,
        listedVia: 'causes.sera.cx',
        profile: m as object,
        photoUrl: photo ? `${c.PUBLIC_API_URL}/photos/${photo}` : null,
      },
    });
    await db().claimState.createMany({ data: CLAIMS.map((k) => ({ causeId: id, claimType: k })) });
    await record(id, 'CauseListed', { by: DEMO.lister, frontend: 'causes.sera.cx', uri, category }, T0, `list:${id}`);
    block += 1;
    if (requiresCareLicence) {
      await record(id, 'RequiresCareLicenceSet', { on: true }, T0, `care:${id}`, 1);
    }
    const attest = async (kind: string, body: Record<string, unknown>, key: string) => {
      const u = dataUri(body);
      await db().attestation.create({ data: { causeId: id, attester: DEMO.research, kind, uri: u, body: body as Prisma.InputJsonValue, at: T0, txHash: tx(key), logIndex: 0 } });
      await record(id, 'Attested', { attester: DEMO.research, kind, uri: u, body }, T0, key);
      block += 1;
    };
    await attest('profile-check', { by: 'Sera research', checked: m.profileCheckedOn, sources: m.sources?.length ?? 0, note: 'Profile compiled from the sources in the cause metadata. Documents not yet received from the charity.' }, `attest:${id}:profile`);
    const extra = index.attest?.[m.slug];
    if (extra) await attest(extra.kind, { by: 'Sera research', text: extra.text }, `attest:${id}:${extra.kind}`);
    for (const n of needsFor(m)) {
      needId += 1;
      const u = dataUri(n);
      await db().need.create({ data: { id: needId, causeId: id, uri: u, kind: n.kind, title: n.title, detail: n.detail, postedAt: T0 } });
      await record(id, 'NeedPosted', { needId, uri: u, ...n }, T0, `need:${needId}`);
      block += 1;
    }
    await db().homepageFlag.create({ data: { causeId: id, shown: true, setBy: owner, signature: 'seed', signedAt: T0 } });
    // Listing a cause earns Care XP on community.sera.cx, not gSera (docs/PLAN.md section 7).
    await awardXp({ wallet: DEMO.lister, eventType: 'care_cause_listed', sourceRef: `cause:${id}`, causeId: id });
    if ((i + 1) % 10 === 0) log(`listed ${i + 1}`);
  }

  // Make-A-Wish is in Children, so the lister flagged a care licence; the steward unflags it with a written reason.
  const maw = ids['make-a-wish-malaysia']!;
  const T1 = new Date(T0.getTime() + 5000);
  await db().cause.update({ where: { id: maw }, data: { requiresCareLicence: false } });
  await record(maw, 'RequiresCareLicenceSet', { on: false, by: DEMO.steward }, T1, `care-off:${maw}`);
  block += 1;
  {
    const body = { by: 'Steward (demo)', text: 'Care licence not required: wish granting, not a care centre under the Care Centres Act 1993.' };
    const u = dataUri(body);
    await db().attestation.create({ data: { causeId: maw, attester: DEMO.steward, kind: 'steward-note', uri: u, body, at: T1, txHash: tx(`attest:${maw}:steward`), logIndex: 0 } });
    await record(maw, 'Attested', { attester: DEMO.steward, kind: 'steward-note', uri: u, body }, T1, `attest:${maw}:steward`);
    block += 1;
  }

  const finalise = async (slug: string, claim: string) => {
    const causeId = ids[slug]!;
    const resultRoot = keccak256(toBytes(`demo inputs ${slug} ${claim}`));
    await db().claimState.update({
      where: { causeId_claimType: { causeId, claimType: claim } },
      data: { outcome: 'verified', resultRoot, finalisedAt: T1, state: 'final', challengeWindowEnd: new Date(T1.getTime() + 72 * 3600 * 1000), settledAt: new Date(T1.getTime() + 72 * 3600 * 1000) },
    });
    await record(causeId, 'ClaimFinalised', { claim, outcome: 'verified', resultRoot, by: DEMO.finaliser }, T1, `final:${causeId}:${claim}`);
    block += 1;
  };
  let verified = 0;
  for (const slug of ['free-tree-society', 'make-a-wish-malaysia']) {
    for (const claim of ['C1', 'C2', 'C3', 'C4']) await finalise(slug, claim);
    await db().cause.update({ where: { id: ids[slug]! }, data: { status: 'verified', verifiedAt: T1 } });
    await xpForListingVerified(ids[slug]!);
    await record(ids[slug]!, 'StatusChanged', { status: 'verified', by: DEMO.finaliser, note: 'all required claims verified' }, T1, `status:${slug}`, 1);
    verified += 1;
  }
  await finalise('make-a-wish-malaysia', 'C5');
  await finalise('make-a-wish-malaysia', 'C7');
  for (const slug of ['hospis-malaysia', 'mercy-malaysia', 'turtle-conservation-society-malaysia']) await finalise(slug, 'C1');

  // One help request the owner has confirmed, so the demo wallet has Care XP on /me.
  const helped = await db().need.findFirst({ where: { causeId: ids['make-a-wish-malaysia']!, kind: 'intro' } });
  if (helped) {
    await db().need.update({
      where: { id: helped.id },
      data: { open: false, helper: DEMO.giver, closedAt: T1, confirmedHelper: DEMO.giver, confirmedAt: T1, confirmSignature: 'seed' },
    });
    await rewardHelp(helped.id, DEMO.giver, T1);
  }

  let gifts = 0;
  if (opts.withGifts) {
    const tokens = await listStablecoins();
    const usdt = tokens.find((t) => t.symbol === 'USDT') ?? tokens[0]!;
    const plan: [string, number, number][] = [
      ['free-tree-society', 50, 1], ['free-tree-society', 25, 2], ['make-a-wish-malaysia', 100, 1], ['hospis-malaysia', 20, 3],
      ['mercy-malaysia', 75, 2], ['kechara-soup-kitchen', 10, 1], ['free-tree-society', 5, 3], ['the-lost-food-project', 40, 2],
      ['spca-selangor', 15, 1], ['make-a-wish-malaysia', 30, 3], ['teach-for-malaysia', 60, 2], ['reef-check-malaysia', 12, 1],
    ];
    for (const [j, [slug, usd, g]] of plan.entries()) {
      const causeId = ids[slug]!;
      // Giver 1 is the web demo wallet; the others are synthetic neighbours of it.
      const sender = g === 1 ? DEMO.giver : `0x${(0x95ced938f7991cd0dfcb48f0a06a40fa1af46eb0n + BigInt(g)).toString(16).padStart(40, '0')}`;
      const to = DEMO_OWNED_CAUSE_IDS.includes(causeId) ? DEMO.giver : DEMO.lister;
      const t: TransferLog = {
        token: usdt.address,
        from: sender,
        to,
        value: BigInt(usd) * 10n ** BigInt(usdt.decimals),
        blockNumber: BigInt(block + j),
        transactionHash: tx(`gift:${j}`),
        logIndex: 0,
        at: new Date(T1.getTime() + (j + 1) * 3600 * 1000),
      };
      await applyTransfer(t, causeId, usdt);
      gifts += 1;
    }
    block += plan.length;
  }
  return { causes: causes.length, verified, needs: needId, gifts };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]).includes(path.join('seed', 'seed'));
if (isMain) {
  const reset = process.argv.includes('--reset');
  const withGifts = process.argv.includes('--with-gifts');
  const say = (s: string) => process.stderr.write(`${s}\n`);
  (async () => {
    const existing = await db().cause.count();
    if (existing > 0 && !reset) {
      say(`database already has ${existing} causes; run with --reset to wipe and reseed`);
      process.exit(2);
    }
    if (reset) await resetDatabase();
    const r = await seedDatabase({ withGifts, log: say });
    say(`seeded ${r.causes} causes (${r.verified} verified), ${r.needs} help requests, ${r.gifts} gifts into ${config().DATABASE_URL.replace(/\/\/.*@/, '//')}`);
    await disconnectDb();
  })().catch(async (err) => {
    say(`seed failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    await disconnectDb();
    process.exit(1);
  });
}
