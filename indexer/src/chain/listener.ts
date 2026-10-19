/**
 * Chain listener: reads CauseRegistry logs from the cursor in chunks and folds
 * every event into the mirrored tables and RecordEvent (a port of
 * contracts/scripts/snapshot.mjs), then scans ERC-20 Transfer logs of the listed
 * stablecoins for gifts to cause deposit addresses: valued in USD, KYT-screened
 * and credited to gSera at once (docs/PLAN.md section 6).
 */
import { decodeEventLog, hexToString, zeroAddress, type Hex, type Log } from 'viem';
import { CLAIMS, VOTING, claimCodeOf, claimOutcomeName } from '@sera-causes/shared';
import { db } from '../db.js';
import type { Prisma } from '@prisma/client';

const asJson = (v: Record<string, unknown> | null): Prisma.InputJsonValue | undefined => (v ? (v as Prisma.InputJsonValue) : undefined);
import { config } from '../config.js';
import { logger } from '../log.js';
import { registryAbi, transferEvent, STATUS_NAMES } from './abi.js';
import { getPublicClient } from './client.js';
import { fetchProfile, parseJsonUri, slugify } from './profile.js';
import { getSettlement, getKyt } from '../services/settlement.js';
import { recordGiftLedger } from '../ledger/gifts.js';
import { listStablecoins, type Stablecoin } from './stablecoins.js';
import { refreshCauseTotals } from '../api/causes.js';
import { rewardHelp, xpForCharityClaim, xpForListing, xpForListingVerified } from '../ledger/rewards.js';
import { notifyGivers } from '../notify.js';

export interface DecodedLog {
  eventName: string;
  args: Record<string, unknown>;
  blockNumber: bigint;
  transactionHash: Hex;
  logIndex: number;
  at: Date;
}

export type TokenInfo = Stablecoin;

export interface ListenerContext {
  chainId: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export function bytes32ToString(b: Hex): string {
  try {
    return hexToString(b, { size: 32 }).replace(/\0+$/, '');
  } catch {
    return b;
  }
}

const lower = (a: unknown): string => String(a).toLowerCase();
const num = (v: unknown): number => Number(v);

/** USD value of a raw token amount using the settlement adapter's FX rate (1 for USD stables). */
export async function valueInUsd(amountRaw: bigint, token: TokenInfo): Promise<number> {
  const units = Number(amountRaw) / 10 ** token.decimals;
  if (token.currency === 'USD') return round2(units);
  try {
    const fx = await getSettlement().fxRate(token.currency, 'USD');
    return round2(units * Number(fx.rate));
  } catch (err) {
    logger.warn({ err, currency: token.currency }, 'fxRate failed; valuing at 1:1');
    return round2(units);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** KYT state for a wallet, re-screened at most once a day. */
export async function screenWallet(address: string, checkType: 'giver' | 'payout' | 'voter' | 'lister' = 'giver'): Promise<'unknown' | 'clear' | 'flagged'> {
  const a = address.toLowerCase();
  const existing = await db().wallet.findUnique({ where: { address: a } });
  const fresh = existing?.kytCheckedAt && Date.now() - existing.kytCheckedAt.getTime() < 24 * 3600 * 1000;
  if (existing && fresh && existing.kytState !== 'unknown') return existing.kytState as 'clear' | 'flagged';
  try {
    const r = await getKyt().screen({ address: a, checkType });
    const state = r.state === 'unavailable' ? 'unknown' : r.state;
    await db().wallet.upsert({
      where: { address: a },
      create: { address: a, kytState: state, kytCheckedAt: new Date(), kytReasons: r.reasons },
      update: { kytState: state, kytCheckedAt: new Date(), kytReasons: r.reasons },
    });
    return state;
  } catch (err) {
    logger.warn({ err, address: a }, 'KYT screen failed');
    await db().wallet.upsert({ where: { address: a }, create: { address: a }, update: {} });
    return existing?.kytState === 'flagged' ? 'flagged' : 'unknown';
  }
}

async function ensureClaimStates(causeId: number): Promise<void> {
  await db().claimState.createMany({ data: CLAIMS.map((c) => ({ causeId, claimType: c })), skipDuplicates: true });
}

/** Applies one decoded log. Idempotent: a log already in RecordEvent is skipped. */
export async function applyLog(log: DecodedLog, ctx: ListenerContext): Promise<boolean> {
  const seen = await db().recordEvent.findUnique({ where: { txHash_logIndex: { txHash: log.transactionHash, logIndex: log.logIndex } } });
  if (seen) return false;
  const a = log.args;
  const at = log.at;
  const now = ctx.now?.() ?? new Date();
  let causeId: number | null = a.causeId !== undefined ? num(a.causeId) : null;
  const data: Record<string, unknown> = {};

  switch (log.eventName) {
    case 'CauseListed': {
      const id = num(a.causeId);
      const uri = String(a.uri);
      const owner = lower(a.owner);
      const { profile, photoUrl, slug } = await fetchProfile(uri, { fetchImpl: ctx.fetchImpl });
      const name = profile?.name;
      await db().cause.upsert({
        where: { id },
        create: {
          id,
          chainId: ctx.chainId,
          slug: slug ?? (name ? slugify(name) : `cause-${id}`),
          owner,
          payout: lower(a.payout),
          lister: owner,
          category: bytes32ToString(a.category as Hex),
          uri,
          status: 'listed',
          listedAt: at,
          waitingSince: at,
          listedVia: bytes32ToString(a.frontend as Hex),
          profile: profile ? (profile as object) : undefined,
          photoUrl,
        },
        update: { owner, payout: lower(a.payout), uri, profile: profile ? (profile as object) : undefined, photoUrl },
      });
      await ensureClaimStates(id);
      // The duplicate check runs on POST /causes/prepare, before the listing is sent, so it has passed by now.
      await xpForListing(id, owner);
      Object.assign(data, { by: owner, frontend: bytes32ToString(a.frontend as Hex), uri });
      break;
    }
    case 'CauseUpdated': {
      const uri = String(a.uri);
      const { profile, photoUrl } = await fetchProfile(uri, { fetchImpl: ctx.fetchImpl });
      await db().cause.update({
        where: { id: causeId! },
        data: { uri, ...(profile ? { profile: profile as object, photoUrl } : {}) },
      });
      data.uri = uri;
      break;
    }
    case 'PayoutChanged': {
      const payout = lower(a.payout);
      await db().cause.update({ where: { id: causeId! }, data: { payout } });
      const cs = await db().claimState.findUnique({ where: { causeId_claimType: { causeId: causeId!, claimType: 'C3' } } });
      await db().claimState.upsert({
        where: { causeId_claimType: { causeId: causeId!, claimType: 'C3' } },
        create: { causeId: causeId!, claimType: 'C3' },
        update: {
          outcome: 'open',
          epoch: (cs?.epoch ?? 0) + 1,
          state: 'open',
          votingStart: null,
          votingEnd: null,
          challengeWindowEnd: null,
          resultRoot: null,
          finalisedAt: null,
          settledAt: null,
        },
      });
      Object.assign(data, { payout, reopened: 'C3' });
      break;
    }
    case 'OwnerChanged': {
      const owner = lower(a.owner);
      await db().cause.update({ where: { id: causeId! }, data: { owner } });
      // The charity has taken over a cause a helper listed: 500 XP to the lister.
      await xpForCharityClaim(causeId!, owner);
      data.owner = owner;
      break;
    }
    case 'StatusChanged': {
      const status = STATUS_NAMES[num(a.status)] ?? 'listed';
      const cause = await db().cause.findUniqueOrThrow({ where: { id: causeId! } });
      const prev = cause.status;
      await db().cause.update({
        where: { id: causeId! },
        data: {
          status,
          ...(status === 'verified' ? { verifiedAt: at } : {}),
          ...(prev === 'verified' || status === 'listed' ? { waitingSince: at } : {}),
        },
      });
      Object.assign(data, { status, by: lower(a.by), note: String(a.note) });
      if (status === 'verified') {
        await xpForListingVerified(causeId!);
        await notifyGivers(causeId!, {
          kind: 'cause_verified',
          title: `${cause.slug} is now Verified`,
          body: 'A cause you gave to passed every required check. The charity can now claim your gift.',
          email: true,
        });
      } else if (status === 'suspended') {
        await notifyGivers(causeId!, {
          kind: 'cause_paused',
          title: `${cause.slug} is paused: refunds open`,
          body: `Reason: ${String(a.note)}. You can take your gift back from the cause page.`,
          email: true,
          data: { refund: true },
        });
      } else if (status === 'closed') {
        await notifyGivers(causeId!, {
          kind: 'refunds_open',
          title: `${cause.slug} closed: refunds open`,
          body: 'The cause closed. Any gift still in escrow can be refunded from the cause page.',
          email: true,
          data: { refund: true },
        });
      }
      break;
    }
    case 'ClaimFinalised': {
      const claim = claimCodeOf(num(a.claim));
      const outcome = claimOutcomeName(num(a.outcome));
      const resultRoot = String(a.resultRoot);
      await ensureClaimStates(causeId!);
      const cs = await db().claimState.findUniqueOrThrow({ where: { causeId_claimType: { causeId: causeId!, claimType: claim } } });
      const reopens = outcome === 'open' || outcome === 'needs_more';
      const windowStillOpen = cs.state === 'challenge_window' && cs.challengeWindowEnd && cs.challengeWindowEnd > now;
      await db().claimState.update({
        where: { causeId_claimType: { causeId: causeId!, claimType: claim } },
        data: reopens
          ? { outcome, resultRoot: outcome === 'open' ? null : resultRoot, finalisedAt: at, epoch: cs.epoch + 1, state: 'open', votingStart: null, votingEnd: null, challengeWindowEnd: null, settledAt: null }
          : {
              outcome,
              resultRoot,
              finalisedAt: at,
              state: windowStillOpen ? cs.state : cs.settledAt ? 'final' : 'challenge_window',
              challengeWindowEnd: windowStillOpen ? cs.challengeWindowEnd : cs.settledAt ? cs.challengeWindowEnd : new Date(at.getTime() + VOTING.challengeWindowHours * 3600 * 1000),
            },
      });
      Object.assign(data, { claim, outcome, resultRoot, by: lower(a.by) });
      break;
    }
    case 'RequiresCareLicenceSet': {
      await db().cause.update({ where: { id: causeId! }, data: { requiresCareLicence: Boolean(a.on) } });
      data.on = Boolean(a.on);
      break;
    }
    case 'Attested': {
      const uri = String(a.uri);
      const kind = bytes32ToString(a.kind as Hex);
      await db().attestation.upsert({
        where: { txHash_logIndex: { txHash: log.transactionHash, logIndex: log.logIndex } },
        create: { causeId: causeId!, attester: lower(a.attester), kind, uri, body: asJson(parseJsonUri(uri)), at, txHash: log.transactionHash, logIndex: log.logIndex },
        update: {},
      });
      Object.assign(data, { attester: lower(a.attester), kind, uri, body: parseJsonUri(uri) });
      break;
    }
    case 'ProgressPosted': {
      const uri = String(a.uri);
      const kind = bytes32ToString(a.kind as Hex);
      await db().progress.upsert({
        where: { txHash_logIndex: { txHash: log.transactionHash, logIndex: log.logIndex } },
        create: { causeId: causeId!, kind, uri, body: asJson(parseJsonUri(uri)), at, txHash: log.transactionHash, logIndex: log.logIndex },
        update: {},
      });
      Object.assign(data, { kind, uri, body: parseJsonUri(uri) });
      break;
    }
    case 'NeedPosted': {
      const id = num(a.needId);
      const uri = String(a.uri);
      const body = parseJsonUri(uri) ?? {};
      await db().need.upsert({
        where: { id },
        create: {
          id,
          causeId: causeId!,
          uri,
          kind: typeof body.kind === 'string' ? body.kind : 'other',
          title: typeof body.title === 'string' ? body.title : '',
          detail: typeof body.detail === 'string' ? body.detail : '',
          postedAt: at,
        },
        update: {},
      });
      Object.assign(data, { needId: id, uri, ...body });
      break;
    }
    case 'Pledged': {
      const needId = num(a.needId);
      const need = await db().need.findUnique({ where: { id: needId } });
      causeId = need?.causeId ?? null;
      const uri = String(a.uri);
      const body = parseJsonUri(uri);
      if (need) {
        await db().pledge.upsert({
          where: { txHash_logIndex: { txHash: log.transactionHash, logIndex: log.logIndex } },
          create: { needId, helper: lower(a.helper), uri, note: typeof body?.note === 'string' ? body.note : typeof body?.text === 'string' ? body.text : '', at, txHash: log.transactionHash, logIndex: log.logIndex },
          update: {},
        });
      }
      Object.assign(data, { needId, helper: lower(a.helper), uri });
      break;
    }
    case 'NeedClosed': {
      const needId = num(a.needId);
      const helper = lower(a.helper) === zeroAddress ? null : lower(a.helper);
      const need = await db().need.findUnique({ where: { id: needId } });
      causeId = need?.causeId ?? null;
      if (need) {
        await db().need.update({ where: { id: needId }, data: { open: false, helper, closedAt: at } });
        if (helper) await rewardHelp(needId, helper, now);
      }
      Object.assign(data, { needId, helper });
      break;
    }
    case 'FinaliserSet':
    case 'StewardSet': {
      const role = log.eventName === 'FinaliserSet' ? 'finaliser' : 'steward';
      const address = lower(a.who);
      await db().chainRole.upsert({ where: { address_role: { address, role } }, create: { address, role, on: Boolean(a.on) }, update: { on: Boolean(a.on) } });
      Object.assign(data, { who: address, on: Boolean(a.on), role });
      break;
    }
    case 'CouncilChanged': {
      data.council = lower(a.council);
      break;
    }
    default:
      logger.debug({ event: log.eventName }, 'unhandled event');
  }

  // Role events carry no cause and are kept for the record only.
  await db().recordEvent.create({
    data: {
      causeId: causeId !== null && (await db().cause.findUnique({ where: { id: causeId }, select: { id: true } })) ? causeId : null,
      type: log.eventName,
      block: log.blockNumber,
      txHash: log.transactionHash,
      logIndex: log.logIndex,
      at,
      data: JSON.parse(JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))),
    },
  });
  return true;
}


// ---------------------------------------------------------------------------
// Gifts: ERC-20 Transfer logs to cause deposit addresses
// ---------------------------------------------------------------------------

export interface TransferLog {
  token: string;
  from: string;
  to: string;
  value: bigint;
  blockNumber: bigint;
  transactionHash: Hex;
  logIndex: number;
  at: Date;
}

/** Deposit addresses (CauseWallet.address, else Cause.payout) mapped to cause ids. */
export async function depositAddressMap(): Promise<Map<string, number>> {
  const [causes, wallets] = await Promise.all([
    db().cause.findMany({ select: { id: true, payout: true } }),
    db().causeWallet.findMany({ select: { causeId: true, address: true } }),
  ]);
  const map = new Map<string, number>();
  for (const c of causes) map.set(c.payout.toLowerCase(), c.id);
  for (const w of wallets) map.set(w.address.toLowerCase(), w.causeId);
  return map;
}

let seraAddresses: Set<string> | undefined;
async function seraSystemAddresses(): Promise<Set<string>> {
  if (seraAddresses) return seraAddresses;
  try {
    const d = await getSettlement().getDeployment();
    seraAddresses = new Set([d.seraAddress, d.vaultAddress, d.sorAddress].map((a) => a.toLowerCase()));
  } catch {
    seraAddresses = new Set();
  }
  return seraAddresses;
}

export type GiftSource = 'site' | 'direct' | 'sera_swap';

/** Classifies a transfer: output of a Sera.cx swap, a transfer the give page prepared, or a direct send. */
export async function classifyTransfer(t: TransferLog, causeId: number): Promise<{ source: GiftSource; tradeId: string | null }> {
  const byTx = await db().giftTrade.findFirst({ where: { txHash: t.transactionHash } });
  if (byTx) return { source: 'sera_swap', tradeId: byTx.tradeId };
  if ((await seraSystemAddresses()).has(t.from.toLowerCase())) {
    const settled = await db().giftTrade.findFirst({ where: { causeId, state: 'settled', txHash: null }, orderBy: { settledAt: 'desc' } });
    if (settled) {
      await db().giftTrade.update({ where: { id: settled.id }, data: { txHash: t.transactionHash, state: 'donated' } });
      return { source: 'sera_swap', tradeId: settled.tradeId };
    }
    return { source: 'sera_swap', tradeId: null };
  }
  const plan = await db().giftTrade.findFirst({
    where: { causeId, giver: t.from.toLowerCase(), state: 'planned', createdAt: { gte: new Date(t.at.getTime() - 6 * 3600 * 1000) } },
    orderBy: { createdAt: 'desc' },
  });
  if (plan) {
    await db().giftTrade.update({ where: { id: plan.id }, data: { txHash: t.transactionHash, state: 'donated' } });
    return { source: 'site', tradeId: null };
  }
  return { source: 'direct', tradeId: null };
}

/**
 * Records one stablecoin transfer to a cause deposit address as a Gift, unless it is
 * the output of one of the cause's own conversions. Idempotent on (txHash, logIndex).
 */
export async function applyTransfer(t: TransferLog, causeId: number, token: TokenInfo): Promise<{ giftId: string | null; note: string }> {
  const existing = await db().gift.findUnique({ where: { txHash_logIndex: { txHash: t.transactionHash, logIndex: t.logIndex } } });
  if (existing) return { giftId: existing.id, note: 'exists' };
  if (t.value === 0n) return { giftId: null, note: 'zero' };

  // A conversion landing back in the cause wallet is not a gift.
  const conversion = await db().conversion.findFirst({ where: { causeId, OR: [{ txHash: t.transactionHash }, { state: { in: ['pending', 'submitted'] }, toToken: token.address }] } });
  if (conversion && ((await seraSystemAddresses()).has(t.from.toLowerCase()) || conversion.txHash === t.transactionHash)) {
    await db().conversion.update({ where: { id: conversion.id }, data: { txHash: t.transactionHash, amountOut: t.value.toString(), state: 'settled', settledAt: t.at } });
    await db().recordEvent.create({
      data: { causeId, type: 'ConversionSettled', block: t.blockNumber, txHash: t.transactionHash, logIndex: t.logIndex, at: t.at, data: { conversionId: conversion.id, token: token.address, symbol: token.symbol, amount: t.value.toString() } },
    });
    return { giftId: null, note: 'conversion' };
  }

  const sender = t.from.toLowerCase();
  const usd = await valueInUsd(t.value, token);
  const kytState = await screenWallet(sender, 'giver');
  const { source, tradeId } = await classifyTransfer(t, causeId);
  const gift = await db().gift.create({
    data: {
      causeId,
      sender,
      token: token.address,
      amount: t.value.toString(),
      usd,
      source,
      txHash: t.transactionHash,
      logIndex: t.logIndex,
      block: t.blockNumber,
      tradeId,
      kytState,
      createdAt: t.at,
    },
  });
  await refreshCauseTotals(causeId);
  const ledger = await recordGiftLedger(gift.id);
  await db().recordEvent.upsert({
    where: { txHash_logIndex: { txHash: t.transactionHash, logIndex: t.logIndex } },
    create: {
      causeId,
      type: 'GiftReceived',
      block: t.blockNumber,
      txHash: t.transactionHash,
      logIndex: t.logIndex,
      at: t.at,
      data: { giftId: gift.id, sender, token: token.address, symbol: token.symbol, amount: t.value.toString(), usd, source, gsera: ledger.entry?.amount ?? 0, ledgerNote: ledger.note },
    },
    update: {},
  });
  return { giftId: gift.id, note: ledger.note };
}

/** Re-runs the ledger for gifts held on a pending KYT answer. */
export async function retryPendingKyt(limit = 100): Promise<number> {
  const held = await db().gift.findMany({ where: { ledgerNote: 'kyt_pending' }, take: limit, orderBy: { createdAt: 'asc' } });
  let n = 0;
  for (const g of held) {
    const state = await screenWallet(g.sender, 'giver');
    if (state === 'unknown') continue;
    await db().gift.update({ where: { id: g.id }, data: { kytState: state } });
    const r = await recordGiftLedger(g.id);
    if (r.note === 'ok') n += 1;
  }
  return n;
}

/** Scans Transfer logs of every listed stablecoin to every deposit address in [from, to]. */
export async function scanTransfers(from: bigint, to: bigint, blockTime: (n: bigint) => Promise<Date>): Promise<number> {
  const c = config();
  const tokens = await listStablecoins();
  const deposits = await depositAddressMap();
  if (tokens.length === 0 || deposits.size === 0) return 0;
  const client = getPublicClient();
  const toList = [...deposits.keys()] as `0x${string}`[];
  const logs = await client.getLogs({
    address: tokens.map((t) => t.address as `0x${string}`),
    event: transferEvent,
    args: { to: toList },
    fromBlock: from,
    toBlock: to,
  });
  logs.sort((x, y) => (x.blockNumber === y.blockNumber ? (x.logIndex ?? 0) - (y.logIndex ?? 0) : Number((x.blockNumber ?? 0n) - (y.blockNumber ?? 0n))));
  let applied = 0;
  for (const log of logs) {
    const toAddr = String(log.args.to).toLowerCase();
    const causeId = deposits.get(toAddr);
    const token = tokens.find((t) => t.address === log.address.toLowerCase());
    if (!causeId || !token || log.args.from === undefined || log.args.value === undefined) continue;
    const t: TransferLog = {
      token: token.address,
      from: String(log.args.from).toLowerCase(),
      to: toAddr,
      value: log.args.value,
      blockNumber: log.blockNumber ?? 0n,
      transactionHash: log.transactionHash ?? '0x',
      logIndex: log.logIndex ?? 0,
      at: await blockTime(log.blockNumber ?? 0n),
    };
    const r = await applyTransfer(t, causeId, token);
    if (r.giftId && r.note !== 'exists') applied += 1;
  }
  if (applied) logger.info({ from: from.toString(), to: to.toString(), applied, chainId: c.CHAIN_ID }, 'gifts recorded');
  return applied;
}

export function decodeRegistryLog(log: Log): Omit<DecodedLog, 'at'> | null {
  try {
    const d = decodeEventLog({ abi: registryAbi, data: log.data, topics: log.topics, strict: false });
    return {
      eventName: d.eventName,
      args: (d.args ?? {}) as Record<string, unknown>,
      blockNumber: log.blockNumber ?? 0n,
      transactionHash: log.transactionHash ?? '0x',
      logIndex: log.logIndex ?? 0,
    };
  } catch {
    return null;
  }
}

export interface ListenerRun {
  fromBlock: bigint;
  toBlock: bigint;
  applied: number;
}

/** One pass: from the cursor to the latest block in LISTENER_CHUNK-sized getLogs calls. */
export async function runListenerOnce(opts: { toBlock?: bigint } = {}): Promise<ListenerRun | null> {
  const c = config();
  if (!c.hasChain) {
    logger.debug('listener idle: RPC_URL or REGISTRY_ADDRESS not set');
    return null;
  }
  const client = getPublicClient();
  const cursorId = `${c.CHAIN_ID}:${c.REGISTRY_ADDRESS}`;
  const cursor = await db().indexerCursor.findUnique({ where: { id: cursorId } });
  const start = cursor ? cursor.lastBlock + 1n : BigInt(c.REGISTRY_FROM_BLOCK);
  const latest = opts.toBlock ?? (await client.getBlockNumber());
  if (start > latest) return { fromBlock: start, toBlock: latest, applied: 0 };

  const times = new Map<bigint, Date>();
  const blockTime = async (n: bigint): Promise<Date> => {
    let t = times.get(n);
    if (!t) {
      const b = await client.getBlock({ blockNumber: n });
      t = new Date(Number(b.timestamp) * 1000);
      times.set(n, t);
    }
    return t;
  };
  const ctx: ListenerContext = { chainId: c.CHAIN_ID };
  const chunk = BigInt(c.LISTENER_CHUNK);
  let applied = 0;
  for (let from = start; from <= latest; from += chunk) {
    const to = from + chunk - 1n < latest ? from + chunk - 1n : latest;
    const logs = await client.getLogs({ address: c.REGISTRY_ADDRESS, fromBlock: from, toBlock: to });
    logs.sort((x, y) => (x.blockNumber === y.blockNumber ? (x.logIndex ?? 0) - (y.logIndex ?? 0) : Number((x.blockNumber ?? 0n) - (y.blockNumber ?? 0n))));
    for (const raw of logs) {
      const d = decodeRegistryLog(raw);
      if (!d) continue;
      const at = await blockTime(d.blockNumber);
      if (await applyLog({ ...d, at }, ctx)) applied += 1;
    }
    applied += await scanTransfers(from, to, blockTime);
    await db().indexerCursor.upsert({
      where: { id: cursorId },
      create: { id: cursorId, chainId: c.CHAIN_ID, lastBlock: to },
      update: { lastBlock: to },
    });
  }
  await retryPendingKyt();
  if (applied) logger.info({ fromBlock: start.toString(), toBlock: latest.toString(), applied }, 'listener applied logs');
  return { fromBlock: start, toBlock: latest, applied };
}
