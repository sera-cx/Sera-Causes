/**
 * Mock implementations of the API routes in indexer/README.md. State lives
 * in memory for the session. Every write mutates the world and returns the
 * same shapes the real API does (indexer/src/api/routes/*.ts).
 */
import { CATEGORIES, CHALLENGE_STAKE, CLAIMS, CLAIM_INFO, COMMUNITY_SITE, GSERA, VOTING, XP, contentHash, embedFor, giftGsera, tallyClaim, voteWeight, votingCanOpen, type ClaimCode, type PathBody } from "@sera-causes/shared";
import { slugify } from "../rules";
import type {
  CauseDetail,
  CauseFilters,
  CauseRef,
  CauseView,
  Challenge,
  ClaimListItem,
  ClaimTab,
  ClaimWorkspace,
  ConvertQuote,
  Dashboard,
  DashboardCause,
  Eligibility,
  EvidenceView,
  GiftLookup,
  GiftQuote,
  GiftSubmitResult,
  HomeData,
  LatestRecordEntry,
  LeaderboardBoard,
  LeaderboardPeriod,
  Leaderboards,
  Me,
  MediaView,
  NewCauseInput,
  NewChallengeInput,
  NewEvidenceInput,
  NewMediaInput,
  NewPathInput,
  NewVoteInput,
  PathView,
  PreparedCause,
  RecordEntry,
  Stablecoin,
  StatsResponse,
  VoteView,
  WalletView,
  WithdrawResult,
} from "../types";
import { API_ORIGIN, CHAIN_ID, DEMO_WALLET, HELPERS, MOCK_STABLECOINS, NOW, STEWARD_WALLET, ago, ahead, buildWorld, claimKey, claimOf, emptyClaim, fakeHash, fakeSig, fakeTx, makeMedia, recompute, secs, toRaw, tokenByAddress, tokenBySymbol, usdPerUnit, type MockWorld } from "./state";

let world: MockWorld | null = null;
export function getWorld(): MockWorld {
  if (!world) world = buildWorld();
  return world;
}
export function resetWorld() {
  world = null;
}

const delay = (ms = 120) => new Promise<void>((r) => setTimeout(r, ms));
const nowIso = (w: MockWorld) => new Date(NOW + (w.nextId % 1000)).toISOString();
const nextId = (w: MockWorld, prefix: string) => `${prefix}_${w.nextId++}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The list view: a cause without its detail arrays. */
function toView(c: CauseDetail): CauseView {
  const { acceptedTokens: _t, helpRequests: _h, updates: _u, attestations: _a, concerns: _c, pausedReason: _p, homepageHiddenBy: _b, wallet: _w, media: _m, recentGifts: _g, conversions: _cv, withdrawals: _wd, ...view } = c;
  return { ...view, claims: view.claims.map((k) => ({ ...k })) };
}

const tabOf = (c: CauseDetail, code: ClaimCode): ClaimTab[] => {
  const k = claimOf(c, code);
  const tabs: ClaimTab[] = [];
  if (c.status !== "listed" && c.status !== "verified") return tabs;
  if (k.state === "open" && k.outcome !== "verified" && k.evidenceCount === 0) tabs.push("needs_evidence");
  if (k.state === "open" && k.outcome !== "verified" && k.evidenceCount > 0 && k.pathCount < VOTING.minPaths) tabs.push("needs_checking");
  if (k.state === "voting") tabs.push("open_for_votes");
  if (k.challenged) tabs.push("challenged");
  if (k.outcome === "verified" && k.finalisedAt && Date.parse(k.finalisedAt) >= NOW - 30 * 86400 * 1000) tabs.push("recently_verified");
  return tabs;
};

function stats(w: MockWorld): StatsResponse {
  const credited = w.ledger.filter((l) => l.state === "credited" && l.reason !== "challenge_stake").reduce((s, l) => s + l.amount, 0);
  return {
    causes: w.causes.filter((c) => c.status === "listed" || c.status === "verified").length,
    verified: w.causes.filter((c) => c.status === "verified").length,
    givenUsd: w.causes.reduce((s, c) => s + Number(c.givenUsd), 0).toFixed(2),
    gifts: w.gifts.length,
    givers: new Set(w.gifts.map((g) => g.sender)).size,
    helpers: new Set(w.paths.map((p) => p.author)).size,
    gseraCredited: credited,
    gseraQueued: 0,
    xpQueued: w.xpEvents.filter((e) => e.state === "queued").reduce((s2, e) => s2 + e.xp, 0),
    helpRequestsOpen: w.causes.reduce((s, c) => s + c.helpRequests.filter((h) => h.open).length, 0),
    verificationMode: "advisory",
  };
}

function eligibilityOf(w: MockWorld, wallet: string): Eligibility {
  const vestedGifts = w.ledger.filter((l) => l.wallet === wallet && l.reason === "gift" && l.state === "credited").length;
  const contributions = w.paths.filter((p) => p.author === wallet).length + w.causes.reduce((s, c) => s + c.helpRequests.filter((h) => h.confirmedHelper === wallet).length, 0);
  const reasons: string[] = [];
  if (vestedGifts === 0 && contributions === 0) reasons.push("needs one gift with credited gSera or one accepted contribution");
  return { canVote: reasons.length === 0, kytState: "clear", vestedGifts, contributions, reasons };
}

function ownedCause(causeId: number): CauseDetail {
  const c = getWorld().causes.find((x) => x.id === causeId);
  if (!c) throw new Error("cause not found");
  if (c.owner !== DEMO_WALLET) throw new Error("only the cause owner can do this");
  return c;
}

function recordLine(w: MockWorld, causeId: number, type: string, data: Record<string, unknown>, source: RecordEntry["source"] = "api"): void {
  const at = nowIso(w);
  w.record.push({ causeId, at, source, type, data: source === "chain" ? { ...data, block: String(20000 + w.nextId), txHash: fakeTx(w.nextId), logIndex: 0 } : data });
  const c = w.causes.find((x) => x.id === causeId);
  if (c) c.lastActivityAt = at;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getStats(): Promise<StatsResponse> {
  await delay(60);
  return stats(getWorld());
}

export async function getHome(): Promise<HomeData> {
  await delay();
  const w = getWorld();
  const live = w.causes.filter((c) => c.status === "listed" || c.status === "verified");
  const urgentCause = live.find((c) => c.urgent);
  const feed = live
    .filter((c) => c.showOnHomepage && !c.homepageHiddenReason && c.id !== urgentCause?.id)
    .sort((a, b) => (b.lastActivityAt ?? b.listedAt).localeCompare(a.lastActivityAt ?? a.listedAt) || b.listedAt.localeCompare(a.listedAt))
    .map(toView);
  const fresh = [...live]
    .sort((a, b) => b.listedAt.localeCompare(a.listedAt) || b.id - a.id)
    .slice(0, 6)
    .map(toView);
  const categories = CATEGORIES.map((cat) => ({ slug: cat.slug, label: cat.label, count: live.filter((c) => c.category === cat.slug).length }));
  const helpRequests = live
    .flatMap((c) => c.helpRequests.filter((h) => h.open))
    .sort((a, b) => b.postedAt.localeCompare(a.postedAt))
    .slice(0, 6);
  return {
    urgent: urgentCause?.urgent ? { label: "Urgent appeal, chosen by Sera.cx", reason: urgentCause.urgent.reason, setBy: urgentCause.urgent.setBy, since: urgentCause.urgent.since, endsAt: urgentCause.urgent.endsAt, cause: toView(urgentCause) } : null,
    feed,
    new: fresh,
    categories,
    stats: stats(w),
    helpRequests,
  };
}

export async function listCauses(f: CauseFilters = {}): Promise<CauseView[]> {
  await delay();
  const w = getWorld();
  let list = w.causes.slice();
  if (f.cat) list = list.filter((c) => c.category === f.cat);
  if (f.state) list = list.filter((c) => c.profile?.location.state === f.state || (f.state !== "Nationwide" && !!c.profile?.location.state.includes(f.state!)));
  if (f.status) list = list.filter((c) => c.stage === f.status);
  if (f.q) {
    const q = f.q.toLowerCase();
    list = list.filter((c) => [c.name, c.slug, c.profile?.legalName, c.profile?.summary, c.profile?.location.town, c.profile?.location.state, c.profile?.organisation.registration].join(" ").toLowerCase().includes(q));
  }
  const sort = f.sort ?? "activity";
  list.sort((a, b) => {
    switch (sort) {
      case "newest":
        return b.listedAt.localeCompare(a.listedAt);
      case "given":
        return Number(b.givenUsd) - Number(a.givenUsd);
      case "checks":
        return b.checksDone / b.checksTotal - a.checksDone / a.checksTotal || Number(b.givenUsd) - Number(a.givenUsd);
      case "name":
        return a.name.localeCompare(b.name);
      default:
        return (b.lastActivityAt ?? b.listedAt).localeCompare(a.lastActivityAt ?? a.listedAt);
    }
  });
  return list.map(toView);
}

export async function getCause(id: number): Promise<CauseDetail | null> {
  await delay();
  const c = getWorld().causes.find((x) => x.id === id);
  return c ? { ...c, claims: c.claims.map((k) => ({ ...k })) } : null;
}

export async function getRecord(id: number): Promise<RecordEntry[]> {
  await delay(80);
  return getWorld()
    .record.filter((e) => e.causeId === id)
    .map(({ causeId: _c, ...e }) => e)
    .sort((a, b) => a.at.localeCompare(b.at));
}

export async function getLatestEvents(limit = 12): Promise<LatestRecordEntry[]> {
  await delay(80);
  const w = getWorld();
  return [...w.record]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit)
    .map((e) => {
      const c = w.causes.find((x) => x.id === e.causeId)!;
      return { ...e, causeName: c.name, causeSlug: c.slug };
    });
}

export async function listClaims(tab: ClaimTab): Promise<ClaimListItem[]> {
  await delay();
  const w = getWorld();
  const items: ClaimListItem[] = [];
  for (const c of w.causes) {
    for (const code of CLAIMS) {
      if (!tabOf(c, code).includes(tab)) continue;
      const k = claimOf(c, code);
      items.push({
        cause: { id: c.id, slug: c.slug, name: c.name, photoUrl: c.photoUrl, stage: c.stage, category: c.category, location: c.profile ? { town: c.profile.location.town, state: c.profile.location.state } : null, listedAt: c.listedAt },
        claim: { ...k },
        label: CLAIM_INFO[code].label,
      });
    }
  }
  items.sort((a, b) => (b.claim.required ? 1 : 0) - (a.claim.required ? 1 : 0));
  return items;
}

export async function getClaim(causeId: number, code: ClaimCode): Promise<ClaimWorkspace | null> {
  await delay();
  const w = getWorld();
  const c = w.causes.find((x) => x.id === causeId);
  if (!c || !CLAIMS.includes(code)) return null;
  const claim = claimOf(c, code);
  const votes = w.votes.filter((v) => v.causeId === causeId && v.claimType === code && v.epoch === claim.epoch).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const paths = w.paths.filter((p) => p.causeId === causeId && p.claimType === code && p.epoch === claim.epoch).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return {
    cause: { id: c.id, slug: c.slug, name: c.name, photoUrl: c.photoUrl, stage: c.stage, status: c.status, registration: c.profile?.organisation.registration ?? "", legalName: c.profile?.legalName ?? "" },
    claim: { ...claim },
    info: CLAIM_INFO[code],
    evidence: w.evidence.filter((e) => e.causeId === causeId && e.claimType === code && !e.removedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    paths,
    votes,
    tally: tallyClaim(votes, w.reputation),
    votingCanOpen: votingCanOpen(paths.map((p) => p.author)),
    challenges: w.challenges.filter((ch) => ch.causeId === causeId && ch.claimType === code).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    decidedBy: "stewards",
    eligibility: eligibilityOf(w, DEMO_WALLET),
  };
}

export async function getMe(): Promise<Me> {
  await delay(80);
  const w = getWorld();
  const wallet = DEMO_WALLET;
  const ledger = w.ledger.filter((l) => l.wallet === wallet);
  const xpEvents = w.xpEvents.filter((e) => e.wallet === wallet).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const xpSum = (state: string) => xpEvents.filter((e) => e.state === state).reduce((s, e) => s + e.xp, 0);
  const sum = (state: string) => ledger.filter((e) => e.state === state && e.reason !== "challenge_stake").reduce((s, e) => s + e.amount, 0);
  const staked = ledger.filter((e) => e.reason === "challenge_stake").reduce((s, e) => s + e.amount, 0);
  const gifts = w.gifts.filter((g) => g.sender === wallet).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const paths = w.paths.filter((p) => p.author === wallet).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const votes = w.votes.filter((v) => v.voter === wallet).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const helped = w.causes.flatMap((c) => c.helpRequests.filter((h) => h.helper === wallet || h.confirmedHelper === wallet));
  const ids = new Set<number>([...gifts.map((g) => g.causeId), ...paths.map((p) => p.causeId), ...votes.map((v) => v.causeId), ...helped.map((h) => h.causeId), ...ledger.map((l) => l.causeId).filter((x): x is number => x !== null)]);
  const causes: CauseRef[] = w.causes.filter((c) => ids.has(c.id)).map((c) => ({ id: c.id, slug: c.slug, name: c.name }));
  const credited = sum("credited");
  return {
    wallet,
    email: null,
    leaderboardOptOut: false,
    kytState: "clear",
    gsera: { spendable: credited + staked, earned: credited, spent: -staked, multipliers: { volumeTier: 1.2, streak: 1.1 } },
    ledger: { credited, queued: sum("queued"), cancelled: sum("cancelled"), staked, entries: ledger.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)) },
    xp: {
      total: xpEvents.reduce((s2, e) => s2 + e.xp, 0),
      queued: xpSum("queued"),
      sent: xpSum("sent"),
      unmatched: xpSum("unmatched"),
      site: COMMUNITY_SITE,
      mode: "queue",
      events: xpEvents,
    },
    reputation: w.reputation.get(wallet) ?? 0,
    gifts,
    paths,
    votes,
    helped,
    notifications: [],
    eligibility: eligibilityOf(w, wallet),
    causes,
    tokens: [...MOCK_STABLECOINS],
  };
}

export async function getLeaderboards(board: LeaderboardBoard, period: LeaderboardPeriod): Promise<Leaderboards> {
  await delay();
  const w = getWorld();
  const since = period === "7d" ? ago(24 * 7) : period === "30d" ? ago(24 * 30) : "";
  if (board === "givers") {
    const by = new Map<string, { usd: number; gifts: number }>();
    for (const g of w.gifts) {
      if (g.createdAt < since) continue;
      const e = by.get(g.sender) ?? { usd: 0, gifts: 0 };
      e.usd += Number(g.usd);
      e.gifts += 1;
      by.set(g.sender, e);
    }
    const entries = [...by.entries()]
      .map(([wallet, e]) => ({ wallet: wallet as `0x${string}`, usd: e.usd.toFixed(2), gifts: e.gifts }))
      .sort((a, b) => Number(b.usd) - Number(a.usd))
      .slice(0, 20);
    return { board, period, entries };
  }
  if (board === "helpers") {
    // Helpers rank by Care XP on community.sera.cx, not by gSera.
    const entries = HELPERS.map((h) => {
      const paths = period === "all" ? h.acceptedPaths : h.recentPaths;
      const helps = period === "all" ? h.helpFulfilled : Math.min(1, h.helpFulfilled);
      return { wallet: h.wallet, xp: paths * XP.care_path_agreed.amount + helps * XP.care_help_fulfilled.amount, events: paths + helps, reputation: h.reputation };
    })
      .concat([{ wallet: DEMO_WALLET, xp: w.xpEvents.filter((e) => e.wallet === DEMO_WALLET && e.createdAt >= since).reduce((s, e) => s + e.xp, 0), events: w.xpEvents.filter((e) => e.wallet === DEMO_WALLET && e.createdAt >= since).length, reputation: w.reputation.get(DEMO_WALLET) ?? 0 }])
      .filter((e) => e.xp > 0)
      .sort((a, b) => b.xp - a.xp)
      .slice(0, 20);
    return { board, period, site: COMMUNITY_SITE, entries };
  }
  const by = new Map<number, { usd: number; gifts: number }>();
  for (const g of w.gifts) {
    if (g.createdAt < since) continue;
    const e = by.get(g.causeId) ?? { usd: 0, gifts: 0 };
    e.usd += Number(g.usd);
    e.gifts += 1;
    by.set(g.causeId, e);
  }
  const entries = [...by.entries()]
    .map(([causeId, e]) => ({ cause: toView(w.causes.find((c) => c.id === causeId)!), usd: e.usd.toFixed(2), gifts: e.gifts }))
    .sort((a, b) => Number(b.usd) - Number(a.usd))
    .slice(0, 20);
  return { board, period, entries };
}

function dashboardCause(w: MockWorld, c: CauseDetail): DashboardCause {
  const gifts = w.gifts.filter((g) => g.causeId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const byToken = new Map<string, bigint>();
  for (const g of gifts) byToken.set(g.token, (byToken.get(g.token) ?? 0n) + BigInt(g.amount));
  for (const cv of c.conversions) {
    if (cv.state !== "settled" || !cv.amountOut) continue;
    byToken.set(cv.fromToken, (byToken.get(cv.fromToken) ?? 0n) - BigInt(cv.amountIn));
    byToken.set(cv.toToken, (byToken.get(cv.toToken) ?? 0n) + BigInt(cv.amountOut));
  }
  for (const wd of c.withdrawals) byToken.set(wd.token, (byToken.get(wd.token) ?? 0n) - BigInt(wd.amount));
  return {
    ...toView(c),
    wallet: c.wallet,
    address: { address: c.wallet.address, chainId: CHAIN_ID, qr: `ethereum:${c.wallet.address}@${CHAIN_ID}` },
    receivedByToken: [...byToken].filter(([, v]) => v > 0n).map(([token, amount]) => ({ token: token as `0x${string}`, symbol: tokenByAddress(token)?.symbol ?? null, amountRaw: amount.toString() })),
    gifts,
    media: c.media,
    helpRequests: c.helpRequests,
    conversions: c.conversions,
    withdrawals: c.withdrawals,
    shares: w.shares.get(c.id) ?? {},
    share: { url: c.shareUrl, og: c.ogImageUrl, poster: c.posterUrl, embed: `<div data-sera-give="${c.id}"></div>\n<script async src="${API_ORIGIN}/embed.js"></script>` },
  };
}

export async function getDashboard(): Promise<Dashboard> {
  await delay();
  const w = getWorld();
  const causes = w.causes
    .filter((c) => c.owner === DEMO_WALLET || c.lister === DEMO_WALLET)
    .sort((a, b) => b.listedAt.localeCompare(a.listedAt))
    .map((c) => dashboardCause(w, c));
  return {
    wallet: DEMO_WALLET,
    totals: { givenUsd: causes.reduce((s, c) => s + Number(c.givenUsd), 0).toFixed(2), givers: causes.reduce((s, c) => s + c.giversCount, 0), causes: causes.length },
    causes,
    tokens: [...MOCK_STABLECOINS],
  };
}

export async function getGift(id: string): Promise<GiftLookup | null> {
  await delay(80);
  const w = getWorld();
  const gift = w.gifts.find((g) => g.id === id);
  if (!gift) return null;
  return { kind: "gift", gift, ledger: w.ledger.find((l) => l.reason === "gift" && l.sourceRef === gift.id) ?? null };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function prepareCause(input: NewCauseInput): Promise<PreparedCause> {
  await delay(200);
  const w = getWorld();
  const name = input.name.trim().toLowerCase();
  const reg = input.registration.trim().toLowerCase().replace(/\s+/g, "");
  const host = (() => {
    try {
      return new URL(input.link).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      return "";
    }
  })();
  const duplicates = w.causes
    .map((c) => {
      const reasons: string[] = [];
      const creg = (c.profile?.organisation.registration ?? "").toLowerCase().replace(/\s+/g, "");
      if (reg && creg && creg === reg) reasons.push("same registration number");
      if (name && c.name.trim().toLowerCase() === name) reasons.push("same name");
      const site = c.profile?.contact.website;
      if (host && site) {
        try {
          if (new URL(site).hostname.replace(/^www\./, "").toLowerCase() === host) reasons.push("same website");
        } catch {
          /* ignore */
        }
      }
      return reasons.length ? { id: c.id, slug: c.slug, name: c.name, reason: reasons.join(", ") } : null;
    })
    .filter((x): x is { id: number; slug: string; name: string; reason: string } => x !== null)
    .slice(0, 4);
  const slug = slugify(input.name) || `cause-${w.nextId}`;
  const today = new Date(NOW).toISOString().slice(0, 10);
  const profile: PreparedCause["profile"] = {
    schema: "csd.cause/1",
    slug,
    name: input.name.trim(),
    legalName: input.name.trim(),
    category: CATEGORIES.find((c) => c.slug === input.category)?.profileName ?? input.category,
    location: { town: input.town.trim(), state: input.state, country: "MY" },
    summary: input.summary.trim(),
    programmes: [],
    impact: [],
    beneficiaries: "",
    organisation: { entityType: "", registration: input.registration.trim(), registrationSource: "", founded: "", founders: "", leadership: "", taxExemption: { statement: "", source: "" }, accounts: "" },
    contact: { website: input.link.trim() },
    sources: input.link ? [input.link.trim()] : [],
    profileCheckedOn: today,
  };
  const hash = contentHash(profile).slice(2);
  return { uri: `${API_ORIGIN}/api/v1/profiles/${hash}.json`, hash, duplicates, profile, payout: input.payout.trim() ? (input.payout.trim().toLowerCase() as `0x${string}`) : null, needsCareLicence: input.orgKind === "licensed", relationship: input.relationship };
}

/** In production the browser calls `listCause` on the registry after prepare; the mock lists it directly. */
export async function submitCause(input: NewCauseInput): Promise<CauseDetail> {
  await delay(400);
  const w = getWorld();
  const prepared = await prepareCause(input);
  const id = Math.max(...w.causes.map((c) => c.id)) + 1;
  const now = nowIso(w);
  const requiresCareLicence = input.orgKind === "licensed";
  const depositAddress = `0x${fakeHash(id * 7).slice(2, 42)}` as `0x${string}`;
  const wallet: WalletView = { address: depositAddress, delegated: false, treasuryMode: "manual", targetToken: null, privyWalletId: null };
  const cause: CauseDetail = {
    id,
    chainId: CHAIN_ID,
    slug: prepared.profile.slug,
    name: prepared.profile.name,
    owner: DEMO_WALLET,
    payout: prepared.payout ?? DEMO_WALLET,
    lister: DEMO_WALLET,
    category: input.category,
    uri: prepared.uri,
    status: "listed",
    stage: "new",
    stageLabel: "New",
    stageTone: "grey",
    checksDone: 0,
    checksTotal: 4,
    listedAt: now,
    waitingSince: now,
    verifiedAt: null,
    requiresCareLicence,
    listedVia: "causes.sera.cx",
    profile: { ...prepared.profile, image: { src: "photos/hero.jpg", alt: "Green turtle hatchling in a coconut shell", credit: "Kasih Turtle Conservation Project, Pantai Chendor", licence: "Supplied", illustrative: true } },
    photoUrl: "/photos/hero.jpg",
    givenUsd: "0.00",
    giversCount: 0,
    depositAddress,
    treasuryMode: "manual",
    mediaCount: 0,
    requiredClaims: [],
    claims: CLAIMS.map((code) => emptyClaim(id, code, false)),
    badges: { taxExempt: false, accountsPublished: false },
    evidenceCount: 0,
    showOnHomepage: input.homepage,
    homepageHiddenReason: null,
    urgent: null,
    lastActivityAt: now,
    shareUrl: `${API_ORIGIN}/c/${id}-${prepared.profile.slug}`,
    ogImageUrl: `${API_ORIGIN}/api/v1/og/cause/${id}.png`,
    posterUrl: `${API_ORIGIN}/api/v1/causes/${id}/poster.pdf`,
    embedUrl: `${API_ORIGIN}/api/v1/embed/give/${id}`,
    createdAt: now,
    updatedAt: now,
    acceptedTokens: [...MOCK_STABLECOINS],
    helpRequests: [],
    updates: [],
    attestations: [],
    concerns: [],
    pausedReason: null,
    homepageHiddenBy: null,
    wallet,
    media: [],
    recentGifts: [],
    conversions: [],
    withdrawals: [],
  };
  w.causes.push(cause);
  recordLine(w, id, "CauseListed", { by: DEMO_WALLET, frontend: "causes.sera.cx", uri: prepared.uri, category: input.category }, "chain");
  if (requiresCareLicence) recordLine(w, id, "RequiresCareLicenceSet", { on: true }, "chain");
  if (input.documents.length > 0 && !input.redactionConfirmed) throw new Error("Confirm that personal data has been redacted from the documents");
  for (const doc of input.documents) {
    await postEvidence({ causeId: id, claim: doc.claim, kind: "document", title: doc.title || doc.fileName, note: `Uploaded with the listing: ${doc.fileName}`, file: doc.file, redactionConfirmed: true });
  }
  recompute(cause, w.evidence);
  return cause;
}

export async function postEvidence(input: NewEvidenceInput): Promise<EvidenceView> {
  await delay(300);
  const w = getWorld();
  const c = w.causes.find((x) => x.id === input.causeId);
  if (!c) throw new Error("cause not found");
  if (!input.redactionConfirmed) throw new Error("Confirm that personal data has been redacted");
  if (input.kind === "link" && !input.link) throw new Error("link is required for link evidence");
  if (input.kind !== "link" && !input.file) throw new Error("file is required for this evidence kind");
  const now = nowIso(w);
  const hash = fakeHash(w.nextId * 3);
  const ev: EvidenceView = {
    id: nextId(w, "ev"),
    causeId: c.id,
    claimType: input.claim,
    uploader: DEMO_WALLET,
    kind: input.kind,
    fileUrl: input.kind === "link" ? input.link!.trim() : `${API_ORIGIN}/uploads/${hash.slice(2)}`,
    fileHash: hash,
    mime: input.file?.type || null,
    size: input.file?.size ?? null,
    title: input.title.trim(),
    note: input.note.trim() || null,
    redactionConfirmed: true,
    createdAt: now,
    removedAt: null,
    removedReason: null,
  };
  w.evidence.push(ev);
  recordLine(w, c.id, "EvidenceAdded", { ...ev });
  recompute(c, w.evidence);
  return ev;
}

export async function postPath(input: NewPathInput): Promise<{ path: PathView; claim: { state: string; epoch: number } }> {
  await delay(300);
  const w = getWorld();
  const c = w.causes.find((x) => x.id === input.causeId);
  if (!c) throw new Error("cause not found");
  const k = claimOf(c, input.claim);
  if (k.state !== "open" && k.state !== "voting") throw new Error(`claim is ${k.state}; paths are not accepted`);
  if (w.paths.some((p) => p.causeId === c.id && p.claimType === input.claim && p.epoch === k.epoch && p.author === DEMO_WALLET)) throw new Error("this wallet already signed a path for this claim epoch");
  const now = nowIso(w);
  const body: PathBody = { ...input.body, screenshotHash: fakeHash(w.nextId * 5), checkedAt: input.body.checkedAt };
  const path: PathView = { id: nextId(w, "path"), causeId: c.id, claimType: input.claim, epoch: k.epoch, author: DEMO_WALLET, body, contentHash: contentHash(body), result: body.result, checkedAt: body.checkedAt, signature: fakeSig(w.nextId), createdAt: now, outcomeAgreed: null };
  w.paths.push(path);
  const mine = w.paths.filter((p) => p.causeId === c.id && p.claimType === input.claim && p.epoch === k.epoch);
  k.pathCount = mine.length;
  k.independentChecks = Math.max(0, ...["verified", "not_verified", "could_not_check"].map((r) => new Set(mine.filter((p) => p.result === r).map((p) => p.author)).size));
  if (k.state === "open" && votingCanOpen(mine.map((p) => p.author))) {
    k.state = "voting";
    k.votingStart = now;
    k.votingEnd = ahead(24 * VOTING.periodDays);
  }
  recordLine(w, c.id, "PathSigned", { ...path });
  return { path, claim: { state: k.state, epoch: k.epoch } };
}

export async function markPathsOpened(causeId: number, claim: ClaimCode): Promise<void> {
  getWorld().pathsOpened.add(claimKey(causeId, claim));
}

export async function postVote(input: NewVoteInput): Promise<{ vote: VoteView }> {
  await delay(250);
  const w = getWorld();
  const c = w.causes.find((x) => x.id === input.causeId);
  if (!c) throw new Error("cause not found");
  const key = claimKey(c.id, input.claim);
  if (!w.pathsOpened.has(key)) throw new Error("Read the paths before voting");
  if (!input.reason.trim()) throw new Error("Give a one-line reason");
  const k = claimOf(c, input.claim);
  if (k.state !== "voting") throw new Error("voting is not open on this claim");
  if (w.votes.some((v) => v.causeId === c.id && v.claimType === input.claim && v.epoch === k.epoch && v.voter === DEMO_WALLET)) throw new Error("this wallet already voted on this claim epoch");
  const now = nowIso(w);
  const vote: VoteView = { id: nextId(w, "vote"), causeId: c.id, claimType: input.claim, epoch: k.epoch, voter: DEMO_WALLET, choice: input.choice, reason: input.reason.trim(), weight: voteWeight(w.reputation.get(DEMO_WALLET) ?? 0), signedAt: secs(now), createdAt: now, outcomeAgreed: null };
  w.votes.push(vote);
  recordLine(w, c.id, "VoteSigned", { id: vote.id, claimType: vote.claimType, epoch: vote.epoch, voter: vote.voter, choice: vote.choice, weight: vote.weight, createdAt: now });
  return { vote };
}

export async function postChallenge(input: NewChallengeInput): Promise<Challenge> {
  await delay(350);
  const w = getWorld();
  const c = w.causes.find((x) => x.id === input.causeId);
  if (!c) throw new Error("cause not found");
  const me = await getMe();
  if ((me.gsera?.spendable ?? 0) < CHALLENGE_STAKE) throw new Error(`You need ${CHALLENGE_STAKE.toLocaleString("en-GB")} spendable gSera to stake`);
  if (!input.statement.trim()) throw new Error("A challenge needs a statement");
  const k = claimOf(c, input.claim);
  if (!["challenge_window", "final"].includes(k.state) || k.outcome === "open") throw new Error("only a finalised or pending-final claim can be challenged");
  if (w.challenges.some((ch) => ch.causeId === c.id && ch.claimType === input.claim && ch.epoch === k.epoch && ch.challenger === DEMO_WALLET)) throw new Error("this wallet already challenged this claim epoch");
  const now = nowIso(w);
  const path: PathBody = { ...input.path, screenshotHash: fakeHash(w.nextId * 9), checkedAt: input.path.checkedAt };
  const body: Challenge["body"] = { statement: input.statement.trim(), evidenceIds: [], path };
  const ch: Challenge = { id: nextId(w, "ch"), causeId: c.id, claimType: input.claim, epoch: k.epoch, challenger: DEMO_WALLET, stake: CHALLENGE_STAKE, contentHash: contentHash(body), body, signature: fakeSig(w.nextId), state: "open", createdAt: now, resolvedAt: null };
  w.challenges.push(ch);
  w.paths.push({ id: nextId(w, "path"), causeId: c.id, claimType: input.claim, epoch: k.epoch, author: DEMO_WALLET, body: path, contentHash: contentHash(path), result: path.result, checkedAt: path.checkedAt, signature: ch.signature, createdAt: now, outcomeAgreed: null });
  k.challenged = true;
  k.state = "voting";
  k.votingStart = now;
  k.votingEnd = ahead(24 * VOTING.periodDays);
  k.pathCount += 1;
  w.ledger.unshift({ id: nextId(w, "led"), wallet: DEMO_WALLET, amount: -CHALLENGE_STAKE, reason: "challenge_stake", sourceTag: "charity", sourceRef: ch.id, causeId: c.id, multipliers: null, state: "spent", gseraRef: null, createdAt: now });
  recordLine(w, c.id, "ChallengeOpened", { ...ch });
  c.concerns.unshift({ kind: "challenge", text: `A challenge is open on ${input.claim} (${CLAIM_INFO[input.claim].label}). ${body.statement}`, at: now, by: DEMO_WALLET });
  return ch;
}

export async function setHomepageFlag(causeId: number, shown: boolean): Promise<{ causeId: number; shown: boolean; showOnHomepage: boolean }> {
  await delay(150);
  const w = getWorld();
  const c = ownedCause(causeId);
  c.showOnHomepage = shown && !c.homepageHiddenReason;
  recordLine(w, causeId, "HomepageToggle", { shown, by: DEMO_WALLET });
  return { causeId, shown, showOnHomepage: c.showOnHomepage };
}

export async function confirmHelp(needId: number, helper: string): Promise<void> {
  await delay(200);
  const w = getWorld();
  for (const c of w.causes) {
    const h = c.helpRequests.find((x) => x.id === needId);
    if (!h) continue;
    if (c.owner !== DEMO_WALLET) throw new Error("only the cause owner can confirm help");
    if (h.confirmedAt) throw new Error("this help request was already confirmed");
    const now = nowIso(w);
    h.state = "fulfilled";
    h.open = false;
    h.confirmedHelper = helper.toLowerCase() as `0x${string}`;
    h.confirmedAt = now;
    h.closedAt = now;
    recordLine(w, c.id, "NeedClosed", { needId, helper: h.confirmedHelper }, "chain");
    return;
  }
  throw new Error("help request not found");
}

// ---------------------------------------------------------------------------
// Gifts
// ---------------------------------------------------------------------------

const quotes = new Map<string, { causeId: number; from: Stablecoin; to: Stablecoin; amountRaw: string; usd: number }>();

export async function quoteGift(causeId: number, fromToken: Stablecoin, amountRaw: string): Promise<GiftQuote> {
  await delay(200);
  const w = getWorld();
  const c = w.causes.find((x) => x.id === causeId);
  if (!c) throw new Error("cause not found");
  if (c.status !== "listed" && c.status !== "verified") throw new Error(`cause is ${c.status} and cannot take gifts`);
  const from = tokenBySymbol(fromToken.symbol);
  if (!/^[1-9]\d*$/.test(amountRaw)) throw new Error("Enter an amount");
  const units = Number(amountRaw) / 10 ** from.decimals;
  const usd = Math.round(units * usdPerUnit(from.symbol) * 100) / 100;
  const target = c.wallet.targetToken ? tokenByAddress(c.wallet.targetToken) : undefined;
  if (!target || target.currency === from.currency) {
    const planId = `plan_${w.nextId++}`;
    quotes.set(planId, { causeId, from, to: from, amountRaw, usd });
    return { kind: "transfer", planId, causeId, chainId: CHAIN_ID, to: c.wallet.address, token: from, amountRaw, eip681: `ethereum:${from.address}@${CHAIN_ID}/transfer?address=${c.wallet.address}&uint256=${amountRaw}` };
  }
  const quoteId = `q_${w.nextId++}`;
  const rate = usdPerUnit(from.symbol) / usdPerUnit(target.symbol);
  const minOutputRaw = toRaw(units * rate * 0.999, target.decimals);
  quotes.set(quoteId, { causeId, from, to: target, amountRaw, usd });
  return {
    kind: "swap",
    quoteId,
    causeId,
    chainId: CHAIN_ID,
    recipient: c.wallet.address,
    from: { address: from.address, symbol: from.symbol, decimals: from.decimals },
    to: { address: target.address, symbol: target.symbol, decimals: target.decimals },
    fromAmountRaw: amountRaw,
    minOutputRaw,
    authorization: "approve",
    expiresAt: ahead(0.25),
    feeBreakdown: { gasCostUsd: "0.42" },
    signing: { intent: { domain: { name: "Sera.cx swap (mock)", version: "1", chainId: CHAIN_ID }, types: { Intent: [{ name: "uuid", type: "uint256" }] }, primaryType: "Intent", message: { uuid: "1" } } },
  };
}

/** The mock settles at once: the gift lands, totals update, gSera is credited. */
export async function submitGift(quote: GiftQuote): Promise<GiftSubmitResult> {
  await delay(900);
  const w = getWorld();
  const key = quote.kind === "transfer" ? quote.planId : quote.quoteId;
  const q = quotes.get(key);
  if (!q) throw new Error("quote not found");
  const c = w.causes.find((x) => x.id === q.causeId)!;
  quotes.delete(key);
  const now = nowIso(w);
  const ownerLinked = c.owner === DEMO_WALLET || c.payout === DEMO_WALLET || c.wallet.address === DEMO_WALLET;
  const heat = c.urgent ? GSERA.heat.urgent : GSERA.heat.normal;
  const gsera = ownerLinked ? 0 : giftGsera(q.usd, { heat, volumeTier: 1.2, streak: 1.1 });
  const landed = quote.kind === "swap" ? { token: q.to, amountRaw: quote.minOutputRaw } : { token: q.from, amountRaw: q.amountRaw };
  const gift = {
    id: nextId(w, "gift"),
    causeId: c.id,
    sender: DEMO_WALLET,
    token: landed.token.address,
    amount: landed.amountRaw,
    usd: q.usd.toFixed(2),
    source: quote.kind === "swap" ? ("sera_swap" as const) : ("site" as const),
    txHash: fakeTx(w.nextId * 9),
    logIndex: 0,
    block: String(20000 + w.nextId),
    tradeId: quote.kind === "swap" ? `mock-${key}` : null,
    kytState: "clear" as const,
    ledgerNote: ownerLinked ? "owner_linked" : null,
    createdAt: now,
  };
  w.gifts.push(gift);
  c.recentGifts.unshift({ ...gift, sender: short(DEMO_WALLET) });
  c.givenUsd = (Number(c.givenUsd) + q.usd).toFixed(2);
  if (!w.gifts.some((g) => g.sender === DEMO_WALLET && g.causeId === c.id && g.id !== gift.id)) c.giversCount += 1;
  if (gsera > 0) {
    w.ledger.unshift({ id: nextId(w, "led"), wallet: DEMO_WALLET, amount: gsera, reason: "gift", sourceTag: "charity", sourceRef: gift.id, causeId: c.id, multipliers: { heat, volumeTier: 1.2, streak: 1.1, compound: Math.min(GSERA.compoundCap, heat * 1.2 * 1.1) }, state: "credited", gseraRef: `grt_${w.nextId}`, createdAt: now });
  }
  recordLine(w, c.id, "GiftReceived", { giftId: gift.id, sender: DEMO_WALLET, token: landed.token.address, symbol: landed.token.symbol, amount: landed.amountRaw, usd: q.usd, source: gift.source, gsera, ledgerNote: gift.ledgerNote }, "chain");
  return { tradeId: gift.tradeId ?? gift.id, status: "settled" };
}

export async function recordShare(causeId: number, channel: string): Promise<void> {
  const w = getWorld();
  const s = w.shares.get(causeId) ?? {};
  s[channel] = (s[channel] ?? 0) + 1;
  w.shares.set(causeId, s);
}

// ---------------------------------------------------------------------------
// Owner: treasury, conversions, withdrawals, media
// ---------------------------------------------------------------------------

export async function setTreasury(causeId: number, treasuryMode: "auto" | "manual", targetToken?: string): Promise<WalletView> {
  await delay(200);
  const w = getWorld();
  const c = ownedCause(causeId);
  const token = targetToken ? (tokenByAddress(targetToken) ?? tokenBySymbol(targetToken)) : undefined;
  if (treasuryMode === "auto" && !token) throw new Error("targetToken is required in auto mode");
  c.wallet = { ...c.wallet, treasuryMode, targetToken: token?.address ?? c.wallet.targetToken };
  c.treasuryMode = treasuryMode;
  recordLine(w, causeId, "TreasurySet", { treasuryMode, targetToken: c.wallet.targetToken, by: DEMO_WALLET });
  return c.wallet;
}

export async function quoteConvert(causeId: number, fromToken: string, toToken: string, amountRaw: string): Promise<ConvertQuote> {
  await delay(250);
  const w = getWorld();
  const c = ownedCause(causeId);
  const from = tokenByAddress(fromToken) ?? tokenBySymbol(fromToken);
  const to = tokenByAddress(toToken) ?? tokenBySymbol(toToken);
  if (from.address === to.address) throw new Error("fromToken and toToken must differ");
  if (!/^[1-9]\d*$/.test(amountRaw)) throw new Error("expected a positive integer string");
  const units = Number(amountRaw) / 10 ** from.decimals;
  const minOutputRaw = toRaw((units * usdPerUnit(from.symbol)) / usdPerUnit(to.symbol) * 0.999, to.decimals);
  const conversion = { id: nextId(w, "conv"), causeId: c.id, fromToken: from.address, toToken: to.address, amountIn: amountRaw, amountOut: null, tradeId: "", state: "pending" as const, txHash: null, triggeredBy: "owner" as const, createdAt: nowIso(w), settledAt: null };
  c.conversions.unshift({ ...conversion, state: "pending" });
  return {
    conversion,
    quote: { quoteId: `cq_${w.nextId}`, from: { symbol: from.symbol, decimals: from.decimals }, to: { symbol: to.symbol, decimals: to.decimals }, fromAmountRaw: amountRaw, minOutputRaw, expiresAt: ahead(0.25) },
    signing: { intent: { domain: { name: "Sera.cx swap (mock)", version: "1", chainId: CHAIN_ID }, types: { Intent: [{ name: "uuid", type: "uint256" }] }, primaryType: "Intent", message: { uuid: "1" } } },
  };
}

export async function submitConvert(causeId: number, conversionId: string, minOutputRaw: string): Promise<ConvertQuote["conversion"]> {
  await delay(700);
  const w = getWorld();
  const c = ownedCause(causeId);
  const cv = c.conversions.find((x) => x.id === conversionId);
  if (!cv) throw new Error("conversion not found");
  const now = nowIso(w);
  cv.state = "settled";
  cv.amountOut = minOutputRaw;
  cv.tradeId = `mock-${conversionId}`;
  cv.txHash = fakeTx(w.nextId * 13);
  cv.settledAt = now;
  recordLine(w, causeId, "ConversionSettled", { conversionId, token: cv.toToken, symbol: tokenByAddress(cv.toToken)?.symbol, amount: minOutputRaw }, "chain");
  return cv;
}

export async function withdraw(causeId: number, token: string, amountRaw: string, to: string): Promise<WithdrawResult> {
  await delay(600);
  const w = getWorld();
  const c = ownedCause(causeId);
  const t = tokenByAddress(token) ?? tokenBySymbol(token);
  if (!/^0x[0-9a-fA-F]{40}$/.test(to.trim())) throw new Error("Enter a valid Ethereum address");
  if (!/^[1-9]\d*$/.test(amountRaw)) throw new Error("expected a positive integer string");
  const now = nowIso(w);
  const wd = { id: nextId(w, "wd"), causeId: c.id, token: t.address, amount: amountRaw, to: to.trim().toLowerCase() as `0x${string}`, txHash: fakeTx(w.nextId * 19), note: "", createdAt: now };
  c.withdrawals.unshift(wd);
  recordLine(w, causeId, "WithdrawalRecorded", { withdrawalId: wd.id, token: t.address, symbol: t.symbol, amount: amountRaw, to: wd.to });
  return { withdrawal: wd, plan: { kind: "transfer", chainId: CHAIN_ID, from: c.wallet.address, token: t.address, to: wd.to, amountRaw, symbol: t.symbol, decimals: t.decimals, eip681: `ethereum:${t.address}@${CHAIN_ID}/transfer?address=${wd.to}&uint256=${amountRaw}` } };
}

export async function addMedia(causeId: number, input: NewMediaInput): Promise<MediaView> {
  await delay(250);
  const w = getWorld();
  const c = ownedCause(causeId);
  const now = nowIso(w);
  let item: MediaView;
  if (input.file) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(input.file.type)) throw new Error("photos must be png, jpeg or webp");
    item = makeMedia(causeId, w.nextId++, "photo", URL.createObjectURL(input.file), input.caption, input.credit ?? "", c.media.length, now);
  } else {
    const url = (input.url ?? "").trim();
    const isImage = /^https:\/\/.+\.(jpe?g|png|webp)$/i.test(url);
    const kind = input.kind === "photo" || (isImage && !embedFor(url)) ? "photo" : "video";
    if (kind === "video" && !embedFor(url)) throw new Error("video links must be from YouTube, TikTok, Instagram, X, Vimeo or Twitch");
    if (kind === "photo" && !isImage) throw new Error("photo links must be direct https jpeg, png or webp URLs");
    item = makeMedia(causeId, w.nextId++, kind, url, input.caption, input.credit ?? "", c.media.length, now);
  }
  c.media.push(item);
  c.mediaCount = c.media.length;
  recordLine(w, causeId, "MediaAdded", { id: item.id, kind: item.kind, caption: item.caption, by: DEMO_WALLET });
  return item;
}

export async function removeMedia(mediaId: string): Promise<void> {
  await delay(150);
  const w = getWorld();
  for (const c of w.causes) {
    if (!c.media.some((m) => m.id === mediaId)) continue;
    if (c.owner !== DEMO_WALLET) throw new Error("only the cause owner or a steward can remove media");
    c.media = c.media.filter((m) => m.id !== mediaId);
    c.mediaCount = c.media.length;
    return;
  }
  throw new Error("media not found");
}

// ---------------------------------------------------------------------------
// Mock-only owner actions (on-chain in production: postProgress, setPayout, pledgeHelp)
// ---------------------------------------------------------------------------

export async function postUpdate(causeId: number, input: { kind: string; title: string; body: string; link?: string }): Promise<CauseDetail["updates"][number]> {
  await delay(250);
  const w = getWorld();
  const c = ownedCause(causeId);
  const now = nowIso(w);
  const body = { title: input.title.trim(), text: input.body.trim(), ...(input.link?.trim() ? { link: input.link.trim() } : {}) };
  const u = { id: nextId(w, "upd"), kind: input.kind, uri: `data:application/json,${encodeURIComponent(JSON.stringify(body))}`, body, at: now, txHash: fakeTx(w.nextId) };
  c.updates.unshift(u);
  recordLine(w, causeId, "ProgressPosted", { kind: u.kind, uri: u.uri, body }, "chain");
  return u;
}

export async function updateSocials(causeId: number, socials: { website?: string; instagram?: string; facebook?: string; youtube?: string; tiktok?: string }): Promise<void> {
  await delay(250);
  const w = getWorld();
  const c = ownedCause(causeId);
  if (!c.profile) return;
  const { website, ...rest } = socials;
  c.profile = { ...c.profile, contact: { ...c.profile.contact, website: website?.trim() || c.profile.contact.website, socials: Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v?.trim() || undefined])) } };
  recordLine(w, causeId, "CauseUpdated", { uri: c.uri }, "chain");
}

export async function setPayout(causeId: number, payout: string): Promise<void> {
  await delay(300);
  const w = getWorld();
  const c = ownedCause(causeId);
  if (!/^0x[0-9a-fA-F]{40}$/.test(payout.trim())) throw new Error("Enter a valid Ethereum address");
  c.payout = payout.trim().toLowerCase() as `0x${string}`;
  const k = claimOf(c, "C3");
  if (k.outcome === "verified") {
    Object.assign(k, { outcome: "open", state: "open", epoch: k.epoch + 1, pathCount: 0, independentChecks: 0, finalisedAt: null, resultRoot: null, votingStart: null, votingEnd: null, challengeWindowEnd: null });
    if (c.status === "verified") c.status = "listed";
    recompute(c, w.evidence);
  }
  recordLine(w, causeId, "PayoutChanged", { payout: c.payout, reopened: "C3" }, "chain");
}

export async function pledgeHelp(needId: number): Promise<void> {
  await delay(200);
  const w = getWorld();
  for (const c of w.causes) {
    const h = c.helpRequests.find((x) => x.id === needId);
    if (!h) continue;
    if (!h.open) throw new Error("Someone has already taken this");
    const now = nowIso(w);
    h.state = "pledged";
    h.helper = DEMO_WALLET;
    h.pledges = [...h.pledges, { helper: DEMO_WALLET, note: "", at: now }];
    recordLine(w, c.id, "Pledged", { needId, helper: DEMO_WALLET, uri: "" }, "chain");
    return;
  }
  throw new Error("help request not found");
}

/** Demo-only: who the steward is, for pages that label actions. */
export const MOCK_STEWARD = STEWARD_WALLET;
