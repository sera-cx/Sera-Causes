/**
 * Database rows to API shapes (packages/shared types plus a few derived fields
 * the web app shows: stage, checks, claim summaries, homepage and urgent state).
 */
import type { Cause as CauseRow, ClaimState as ClaimRow, Gift as GiftRow, HelperBadge as BadgeRow, LedgerEntry as LedgerRow, XpEvent as XpEventRow, Media as MediaRow, CauseWallet as WalletRow, Conversion as ConversionRow, Withdrawal as WithdrawalRow, Evidence as EvidenceRow, Path as PathRow, Vote as VoteRow, Challenge as ChallengeRow, Need as NeedRow, UrgentAppeal as AppealRow, HomepageFlag as FlagRow } from '@prisma/client';
import { HELPER_BADGES, XP, causeStage, requiredClaimsFor, type CauseProfile, type ClaimCode, type ClaimOutcomeName, type CauseStatus, type HelperBadgeSlug, type XpEventType } from '@sera-causes/shared';
import { config } from '../config.js';

export const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export interface ClaimSummary {
  causeId: number;
  claimType: ClaimCode;
  required: boolean;
  outcome: ClaimOutcomeName;
  epoch: number;
  state: string;
  votingStart: string | null;
  votingEnd: string | null;
  challengeWindowEnd: string | null;
  resultRoot: string | null;
  finalisedAt: string | null;
  evidenceCount: number;
  pathCount: number;
  independentChecks: number;
  challenged: boolean;
}

export interface ClaimExtras {
  evidenceCount?: number;
  pathCount?: number;
  independentChecks?: number;
  challenged?: boolean;
}

export function serializeClaim(row: ClaimRow, requiresCareLicence: boolean, extras: ClaimExtras = {}): ClaimSummary {
  const code = row.claimType as ClaimCode;
  return {
    causeId: row.causeId,
    claimType: code,
    required: requiredClaimsFor({ requiresCareLicence }).includes(code),
    outcome: row.outcome as ClaimOutcomeName,
    epoch: row.epoch,
    state: row.state,
    votingStart: iso(row.votingStart),
    votingEnd: iso(row.votingEnd),
    challengeWindowEnd: iso(row.challengeWindowEnd),
    resultRoot: row.resultRoot,
    finalisedAt: iso(row.finalisedAt),
    evidenceCount: extras.evidenceCount ?? 0,
    pathCount: extras.pathCount ?? 0,
    independentChecks: extras.independentChecks ?? 0,
    challenged: extras.challenged ?? false,
  };
}

export interface CauseExtras {
  claims?: ClaimRow[];
  claimExtras?: Record<string, ClaimExtras>;
  evidenceCount?: number;
  flag?: FlagRow | null;
  appeal?: AppealRow | null;
  lastActivityAt?: Date | null;
  wallet?: WalletRow | null;
  mediaCount?: number;
}

export function causeName(row: Pick<CauseRow, 'profile' | 'slug'>): string {
  const p = row.profile as CauseProfile | null;
  return p?.name ?? row.slug;
}

export function shareUrl(row: Pick<CauseRow, 'id' | 'slug'>): string {
  return `${config().PUBLIC_WEB_URL}/c/${row.id}-${row.slug}`;
}

export function serializeCause(row: CauseRow, extras: CauseExtras = {}) {
  const c = config();
  const profile = (row.profile as CauseProfile | null) ?? null;
  const claims = extras.claims ?? [];
  const stage = causeStage(
    { status: row.status as CauseStatus, requiresCareLicence: row.requiresCareLicence, evidenceCount: extras.evidenceCount ?? 0 },
    claims.map((k) => ({ claimType: k.claimType as ClaimCode, outcome: k.outcome as ClaimOutcomeName })),
  );
  const outcome = (code: string) => claims.find((k) => k.claimType === code)?.outcome;
  const flag = extras.flag ?? null;
  const appeal = extras.appeal ?? null;
  return {
    id: row.id,
    chainId: row.chainId,
    slug: row.slug,
    name: causeName(row),
    owner: row.owner,
    payout: row.payout,
    lister: row.lister,
    category: row.category,
    uri: row.uri,
    status: row.status as CauseStatus,
    stage: stage.stage,
    stageLabel: stage.label,
    stageTone: stage.tone,
    checksDone: stage.done,
    checksTotal: stage.total,
    listedAt: row.listedAt.toISOString(),
    waitingSince: row.waitingSince.toISOString(),
    verifiedAt: iso(row.verifiedAt),
    requiresCareLicence: row.requiresCareLicence,
    listedVia: row.listedVia,
    profile,
    photoUrl: row.photoUrl,
    givenUsd: Number(row.givenUsd).toFixed(2),
    giversCount: row.giversCount,
    depositAddress: extras.wallet?.address ?? row.payout,
    treasuryMode: extras.wallet?.treasuryMode ?? 'manual',
    mediaCount: extras.mediaCount ?? 0,
    requiredClaims: requiredClaimsFor({ requiresCareLicence: row.requiresCareLicence }),
    claims: claims.map((k) => serializeClaim(k, row.requiresCareLicence, extras.claimExtras?.[k.claimType])),
    badges: { taxExempt: outcome('C5') === 'verified', accountsPublished: outcome('C7') === 'verified' },
    evidenceCount: extras.evidenceCount ?? 0,
    showOnHomepage: !!flag?.shown && !flag?.stewardHiddenReason,
    homepageHiddenReason: flag?.stewardHiddenReason ?? null,
    urgent: appeal ? { id: appeal.id, reason: appeal.reason, setBy: appeal.setBy, since: appeal.startsAt.toISOString(), endsAt: iso(appeal.endsAt) } : null,
    lastActivityAt: iso(extras.lastActivityAt ?? row.listedAt),
    shareUrl: shareUrl(row),
    ogImageUrl: `${c.PUBLIC_API_URL}/api/v1/og/cause/${row.id}.png`,
    posterUrl: `${c.PUBLIC_API_URL}/api/v1/causes/${row.id}/poster.pdf`,
    embedUrl: `${c.PUBLIC_API_URL}/api/v1/embed/give/${row.id}`,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type CauseView = ReturnType<typeof serializeCause>;

export function serializeGift(g: GiftRow) {
  return {
    id: g.id,
    causeId: g.causeId,
    sender: g.sender,
    token: g.token,
    amount: g.amount,
    usd: Number(g.usd).toFixed(2),
    source: g.source,
    txHash: g.txHash,
    logIndex: g.logIndex,
    block: g.block.toString(),
    tradeId: g.tradeId,
    kytState: g.kytState,
    ledgerNote: g.ledgerNote,
    createdAt: g.createdAt.toISOString(),
  };
}

export function serializeMedia(m: MediaRow) {
  return {
    id: m.id,
    causeId: m.causeId,
    kind: m.kind,
    url: m.url,
    embedUrl: m.embedUrl,
    provider: m.provider,
    caption: m.caption,
    credit: m.credit,
    position: m.position,
    createdAt: m.createdAt.toISOString(),
  };
}

export function serializeWallet(w: WalletRow | null, fallbackAddress: string) {
  return {
    address: w?.address ?? fallbackAddress,
    delegated: w?.delegated ?? false,
    treasuryMode: w?.treasuryMode ?? 'manual',
    targetToken: w?.targetToken ?? null,
    privyWalletId: w?.privyWalletId ?? null,
  };
}

export function serializeConversion(c: ConversionRow) {
  return {
    id: c.id,
    causeId: c.causeId,
    fromToken: c.fromToken,
    toToken: c.toToken,
    amountIn: c.amountIn,
    amountOut: c.amountOut,
    tradeId: c.tradeId,
    state: c.state,
    txHash: c.txHash,
    triggeredBy: c.triggeredBy,
    createdAt: c.createdAt.toISOString(),
    settledAt: iso(c.settledAt),
  };
}

export function serializeWithdrawal(w: WithdrawalRow) {
  return { id: w.id, causeId: w.causeId, token: w.token, amount: w.amount, to: w.to, txHash: w.txHash, note: w.note, createdAt: w.createdAt.toISOString() };
}

export function serializeLedger(e: LedgerRow) {
  return {
    id: e.id,
    wallet: e.wallet,
    amount: e.amount,
    reason: e.reason,
    sourceTag: e.sourceTag,
    sourceRef: e.sourceRef,
    causeId: e.causeId,
    multipliers: e.multipliers,
    state: e.state,
    gseraRef: e.gseraRef,
    createdAt: e.createdAt.toISOString(),
  };
}

/** One Care XP event, with the label the web app shows. */
/**
 * One earned badge. A badge carries no amount and no rank, so there is nothing
 * to serialise but what it is and how it was earned.
 */
export function serializeHelperBadge(b: BadgeRow) {
  const info = HELPER_BADGES[b.slug as HelperBadgeSlug];
  return {
    slug: b.slug,
    label: info?.label ?? b.slug,
    earnedBy: info?.earnedBy ?? '',
    causeId: b.causeId,
    awardedAt: b.awardedAt.toISOString(),
  };
}

export function serializeXpEvent(e: XpEventRow) {
  return {
    id: e.id,
    wallet: e.wallet,
    eventType: e.eventType,
    label: XP[e.eventType as XpEventType]?.label ?? e.eventType,
    xp: e.xp,
    sourceRef: e.sourceRef,
    causeId: e.causeId,
    proofUrl: e.proofUrl,
    state: e.state,
    createdAt: e.createdAt.toISOString(),
    sentAt: iso(e.sentAt),
  };
}

export function serializeEvidence(e: EvidenceRow) {
  return {
    id: e.id,
    causeId: e.causeId,
    claimType: e.claimType,
    uploader: e.uploader,
    kind: e.kind,
    fileUrl: e.fileUrl,
    fileHash: e.fileHash,
    mime: e.mime,
    size: e.size,
    title: e.title,
    note: e.note,
    redactionConfirmed: e.redactionConfirmed,
    createdAt: e.createdAt.toISOString(),
    removedAt: iso(e.removedAt),
    removedReason: e.removedReason,
  };
}

export function serializePath(p: PathRow) {
  return {
    id: p.id,
    causeId: p.causeId,
    claimType: p.claimType,
    epoch: p.epoch,
    author: p.author,
    body: p.body,
    contentHash: p.contentHash,
    result: p.result,
    checkedAt: p.checkedAt.toISOString(),
    signature: p.signature,
    createdAt: p.createdAt.toISOString(),
    outcomeAgreed: p.outcomeAgreed,
  };
}

export function serializeVote(v: VoteRow) {
  return {
    id: v.id,
    causeId: v.causeId,
    claimType: v.claimType,
    epoch: v.epoch,
    voter: v.voter,
    choice: v.choice,
    reason: v.reason,
    weight: v.weight,
    signature: v.signature,
    signedAt: Math.floor(v.signedAt.getTime() / 1000),
    createdAt: v.createdAt.toISOString(),
    outcomeAgreed: v.outcomeAgreed,
  };
}

export function serializeChallenge(c: ChallengeRow) {
  return {
    id: c.id,
    causeId: c.causeId,
    claimType: c.claimType,
    epoch: c.epoch,
    challenger: c.challenger,
    stake: c.stake,
    contentHash: c.contentHash,
    body: c.body,
    signature: c.signature,
    state: c.state,
    createdAt: c.createdAt.toISOString(),
    resolvedAt: iso(c.resolvedAt),
  };
}

export function serializeNeed(n: NeedRow & { pledges?: { helper: string; note: string; at: Date }[] }) {
  const state = n.confirmedAt ? 'fulfilled' : !n.open ? (n.helper ? 'fulfilled' : 'closed') : n.pledges?.length ? 'pledged' : 'open';
  return {
    id: n.id,
    causeId: n.causeId,
    kind: n.kind,
    title: n.title,
    detail: n.detail,
    state,
    open: n.open,
    postedAt: n.postedAt.toISOString(),
    helper: n.helper,
    confirmedHelper: n.confirmedHelper,
    confirmedAt: iso(n.confirmedAt),
    closedAt: iso(n.closedAt),
    pledges: (n.pledges ?? []).map((p) => ({ helper: p.helper, note: p.note, at: p.at.toISOString() })),
  };
}
