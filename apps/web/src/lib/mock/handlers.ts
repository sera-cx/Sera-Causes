/**
 * Mock implementations of the API in ARCHITECTURE.md section 6. State lives
 * in memory for the session. Every write mutates the world and returns the
 * same shapes the real API will.
 */
import { CATEGORIES, CHALLENGE_STAKE, CLAIM_INFO, CLAIMS, GSERA, STABLECOINS, VERIFICATION_MODE, VOTING, type ClaimCode } from "../constants";
import { giftGsera, requiredClaimsFor, slugify, tallyClaim, voteWeight } from "../rules";
import type {
  Cause,
  CauseCardData,
  CauseFilters,
  CauseSocials,
  CauseUpdate,
  Claim,
  ConvertQuote,
  MediaItem,
  ClaimRow,
  ClaimTab,
  Dashboard,
  Evidence,
  Gift,
  GiftQuote,
  GiftReceipt,
  HomeData,
  LeaderboardBoard,
  LeaderboardPeriod,
  Leaderboards,
  Me,
  NewCauseInput,
  NewChallengeInput,
  NewEvidenceInput,
  NewPathInput,
  NewVoteInput,
  PreparedCause,
  RecordEvent,
  Stats,
  VerificationPath,
} from "../types";
import { photoUrl } from "./seed";
import { DEMO_WALLET, HELPERS, NOW, ago, ahead, buildWorld, claimKey, fakeHash, fakeTx, type MockWorld } from "./state";

let world: MockWorld | null = null;
export function getWorld(): MockWorld {
  if (!world) world = buildWorld();
  return world;
}
export function resetWorld() {
  world = null;
}

const delay = (ms = 120) => new Promise<void>((r) => setTimeout(r, ms));

function toCard(c: Cause): CauseCardData {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    stage: c.stage,
    category: c.profile.category,
    town: c.profile.location.town,
    state: c.profile.location.state,
    summary: c.profile.summary,
    image: c.profile.image ? { ...c.profile.image, src: photoUrl(c.profile.image.src) } : undefined,
    checksDone: c.checksDone,
    checksTotal: c.checksTotal,
    givenUsd: c.givenUsd,
    giversCount: c.giversCount,
    urgent: c.urgent ? { reason: c.urgent.reason } : undefined,
    listedAt: c.listedAt,
    lastActivityAt: c.lastActivityAt,
    homepage: c.homepage,
  };
}

function withPhoto(c: Cause): Cause {
  return c.profile.image ? { ...c, profile: { ...c.profile, image: { ...c.profile.image, src: photoUrl(c.profile.image.src) } } } : c;
}

function recomputeCause(c: Cause) {
  const required = requiredClaimsFor(c.requiresCareLicence);
  c.checksDone = required.filter((k) => c.claims[k].outcome === "verified" && c.claims[k].state === "final").length;
  c.checksTotal = required.length;
  const w = getWorld();
  const anyEvidence = w.evidence.some((e) => e.causeId === c.id);
  if (c.stage === "paused" || c.stage === "closed") return;
  if (c.checksDone === required.length) c.stage = "verified";
  else if (c.checksDone > 0) c.stage = "partly_verified";
  else if (anyEvidence) c.stage = "evidence_in";
  else c.stage = "new";
}

function statsOf(w: MockWorld): Stats {
  const monthAgo = ago(24 * 30);
  const helpers = new Set(w.paths.filter((p) => p.checkedAt > monthAgo).map((p) => p.author));
  return {
    causes: w.causes.length,
    verified: w.causes.filter((c) => c.stage === "verified").length,
    givenUsd: w.causes.reduce((s, c) => s + c.givenUsd, 0),
    helpersThisMonth: helpers.size,
    giversCount: w.causes.reduce((s, c) => s + c.giversCount, 0),
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getStats(): Promise<Stats> {
  await delay(60);
  return statsOf(getWorld());
}

export async function getHome(): Promise<HomeData> {
  await delay();
  const w = getWorld();
  const urgentCause = w.causes.find((c) => c.urgent && c.stage !== "paused" && c.stage !== "closed");
  const feed = w.causes
    .filter((c) => c.homepage && c.stage !== "paused" && c.stage !== "closed")
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt) || b.listedAt.localeCompare(a.listedAt))
    .map(toCard);
  const newest = [...w.causes].sort((a, b) => b.listedAt.localeCompare(a.listedAt)).slice(0, 6).map(toCard);
  const categories = CATEGORIES.map((cat) => ({ slug: cat.slug, label: cat.label, count: w.causes.filter((c) => c.profile.category === cat.profileName).length }));
  return {
    urgent: urgentCause ? { cause: toCard(urgentCause), reason: urgentCause.urgent!.reason } : undefined,
    feed,
    newest,
    categories,
    stats: statsOf(w),
  };
}

export async function listCauses(f: CauseFilters = {}): Promise<CauseCardData[]> {
  await delay();
  const w = getWorld();
  let list = w.causes.slice();
  if (f.cat) {
    const cat = CATEGORIES.find((c) => c.slug === f.cat);
    if (cat) list = list.filter((c) => c.profile.category === cat.profileName);
  }
  if (f.state) list = list.filter((c) => c.profile.location.state === f.state || (f.state !== "Nationwide" && c.profile.location.state.includes(f.state!)));
  if (f.status) list = list.filter((c) => c.stage === f.status);
  if (f.q) {
    const q = f.q.toLowerCase();
    list = list.filter((c) => [c.name, c.profile.legalName, c.profile.summary, c.profile.location.town, c.profile.location.state, c.profile.organisation.registration].join(" ").toLowerCase().includes(q));
  }
  const sort = f.sort ?? "activity";
  list.sort((a, b) => {
    switch (sort) {
      case "newest":
        return b.listedAt.localeCompare(a.listedAt);
      case "given":
        return b.givenUsd - a.givenUsd;
      case "checks":
        return b.checksDone / b.checksTotal - a.checksDone / a.checksTotal || b.givenUsd - a.givenUsd;
      case "name":
        return a.name.localeCompare(b.name);
      default:
        return b.lastActivityAt.localeCompare(a.lastActivityAt);
    }
  });
  return list.map(toCard);
}

export async function getCause(id: number): Promise<Cause | null> {
  await delay();
  const c = getWorld().causes.find((x) => x.id === id);
  return c ? withPhoto(c) : null;
}

export async function getRecord(id: number): Promise<RecordEvent[]> {
  await delay(80);
  return getWorld()
    .events.filter((e) => e.causeId === id)
    .sort((a, b) => b.at.localeCompare(a.at));
}

export async function getLatestEvents(limit = 12): Promise<(RecordEvent & { causeName: string; causeSlug: string })[]> {
  await delay(80);
  const w = getWorld();
  return [...w.events]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit)
    .map((e) => {
      const c = w.causes.find((x) => x.id === e.causeId)!;
      return { ...e, causeName: c.name, causeSlug: c.slug };
    });
}

function tabOf(c: Cause, code: ClaimCode): ClaimTab | null {
  const s = c.claims[code];
  if (c.stage === "paused" || c.stage === "closed") return null;
  if (s.challenged) return "challenged";
  if (s.state === "voting") return "open_for_votes";
  if (s.outcome === "verified" && s.state === "final") return "recently_verified";
  if (s.evidenceCount === 0) return "needs_evidence";
  if (s.pathCount < VOTING.minPaths) return "needs_checking";
  return "needs_checking";
}

function gseraOnOffer(tab: ClaimTab): number {
  switch (tab) {
    case "needs_evidence":
      return GSERA.helper.pathAgrees;
    case "needs_checking":
      return GSERA.helper.pathAgrees;
    case "open_for_votes":
      return GSERA.helper.voteAgrees;
    case "challenged":
      return GSERA.helper.voteAgrees;
    default:
      return 0;
  }
}

export async function listClaims(tab: ClaimTab): Promise<ClaimRow[]> {
  await delay();
  const w = getWorld();
  const rows: ClaimRow[] = [];
  for (const c of w.causes) {
    for (const code of CLAIMS) {
      const s = c.claims[code];
      // Badge claims only appear once someone has started on them.
      if (!s.required && s.evidenceCount === 0 && s.pathCount === 0 && tab === "needs_evidence") continue;
      const t = tabOf(c, code);
      if (t !== tab) continue;
      const missing =
        t === "needs_evidence"
          ? "No evidence yet"
          : t === "needs_checking"
            ? `${VOTING.minPaths - s.pathCount} more independent ${VOTING.minPaths - s.pathCount === 1 ? "path" : "paths"}`
            : t === "open_for_votes"
              ? "Votes"
              : t === "challenged"
                ? "Challenged. Votes"
                : "Done";
      const history = w.claimHistory.get(claimKey(c.id, code)) ?? [];
      const openedAt = t === "recently_verified" ? (s.finalisedAt ?? c.listedAt) : (history.at(-1)?.at ?? c.listedAt);
      rows.push({
        causeId: c.id,
        causeName: c.name,
        causeSlug: c.slug,
        category: c.profile.category,
        state: c.profile.location.state,
        claim: code,
        missing,
        gseraOnOffer: gseraOnOffer(t),
        openedAt,
        tab: t,
        pathCount: s.pathCount,
        evidenceCount: s.evidenceCount,
      });
    }
  }
  if (tab === "recently_verified") rows.sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  else rows.sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  return rows;
}

export async function getClaim(causeId: number, code: ClaimCode): Promise<Claim | null> {
  await delay();
  const w = getWorld();
  const c = w.causes.find((x) => x.id === causeId);
  if (!c || !CLAIMS.includes(code)) return null;
  const s = c.claims[code];
  const key = claimKey(causeId, code);
  const votes = (w.votes.get(key) ?? []).slice().sort((a, b) => b.signedAt.localeCompare(a.signedAt));
  const tab = tabOf(c, code);
  return {
    ...s,
    causeId,
    causeName: c.name,
    causeSlug: c.slug,
    causeStage: c.stage,
    registration: c.profile.organisation.registration,
    legalName: c.profile.legalName,
    gseraOnOffer: tab ? gseraOnOffer(tab) : 0,
    openedAt: w.claimHistory.get(key)?.[0]?.at ?? c.listedAt,
    evidence: w.evidence.filter((e) => e.causeId === causeId && e.claim === code).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    paths: w.paths.filter((p) => p.causeId === causeId && p.claim === code).sort((a, b) => b.checkedAt.localeCompare(a.checkedAt)),
    votes,
    tally: tallyClaim(votes),
    challenge: w.challenges.find((ch) => ch.causeId === causeId && ch.claim === code && ch.state === "open"),
    history: (w.claimHistory.get(key) ?? []).slice().sort((a, b) => b.at.localeCompare(a.at)),
    mode: VERIFICATION_MODE,
  };
}

export async function getMe(): Promise<Me> {
  await delay(80);
  const w = getWorld();
  return { ...w.me, gifts: w.me.gifts.slice() };
}

export async function getLeaderboards(board: LeaderboardBoard, period: LeaderboardPeriod): Promise<Leaderboards> {
  await delay();
  const w = getWorld();
  const since = period === "month" ? ago(24 * 30) : "";
  let rows: Leaderboards["rows"] = [];
  if (board === "givers") {
    const map = new Map<string, Set<number>>();
    for (const g of w.gifts) {
      if (!g.giver || g.at < since) continue;
      const set = map.get(g.giver) ?? new Set();
      set.add(g.causeId);
      map.set(g.giver, set);
    }
    rows = [...map.entries()]
      .map(([wallet, set]) => ({ wallet, count: set.size }))
      .sort((a, b) => b.count - a.count || a.wallet.localeCompare(b.wallet))
      .slice(0, 20)
      .map((r, i) => ({ rank: i + 1, label: short(r.wallet), wallet: r.wallet, value: r.count, unit: r.count === 1 ? "cause" : "causes" }));
  } else if (board === "helpers") {
    rows = HELPERS.map((h) => ({ wallet: h.wallet, value: period === "month" ? h.recentPaths + Math.min(1, h.helpFulfilled) : h.acceptedPaths + h.helpFulfilled, paths: period === "month" ? h.recentPaths : h.acceptedPaths, help: period === "month" ? Math.min(1, h.helpFulfilled) : h.helpFulfilled }))
      .concat([{ wallet: DEMO_WALLET, value: 3, paths: 3, help: 0 }])
      .sort((a, b) => b.value - a.value || a.wallet.localeCompare(b.wallet))
      .slice(0, 20)
      .map((r, i) => ({ rank: i + 1, label: short(r.wallet), wallet: r.wallet, value: r.value, unit: "accepted", secondary: `${r.paths} paths, ${r.help} help` }));
  } else {
    rows = w.causes
      .filter((c) => c.giversCount > 0)
      .map((c) => ({ c, givers: period === "month" ? Math.max(1, Math.round(c.giversCount * 0.4)) : c.giversCount }))
      .sort((a, b) => b.givers - a.givers || a.c.name.localeCompare(b.c.name))
      .slice(0, 20)
      .map((r, i) => ({ rank: i + 1, label: r.c.name, causeId: r.c.id, causeSlug: r.c.slug, value: r.givers, unit: r.givers === 1 ? "giver" : "givers", secondary: `US$${r.c.givenUsd.toLocaleString("en-GB")} given` }));
  }
  return { board, period, rows };
}

function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export async function getDashboard(): Promise<Dashboard> {
  await delay();
  const w = getWorld();
  const causes = w.causes
    .filter((c) => c.owner === DEMO_WALLET)
    .map((c) => {
      const gifts = w.gifts.filter((g) => g.causeId === c.id).sort((a, b) => b.at.localeCompare(a.at));
      const shares = Object.entries(w.shares.get(c.id) ?? {}).map(([channel, count]) => ({ channel, count }));
      return {
        cause: withPhoto(c),
        gifts,
        treasuryUsd: Math.round(c.treasury.balances.reduce((s, b) => s + b.usd, 0) * 100) / 100,
        shares,
        inviteLink: `https://causes.sera.cx/c/${c.id}-${c.slug}?claim=${fakeHash(c.id * 77).slice(2, 14)}`,
      };
    });
  return { wallet: DEMO_WALLET, causes };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function prepareCause(input: NewCauseInput): Promise<PreparedCause> {
  await delay(200);
  const w = getWorld();
  const name = input.name.trim().toLowerCase();
  const reg = input.registration.trim().toLowerCase().replace(/\s+/g, "");
  const tokens = name.split(/[^a-z0-9]+/).filter((t) => t.length > 3 && !["society", "malaysia", "foundation", "project", "the", "and"].includes(t));
  const duplicates = w.causes
    .map((c) => {
      const cname = `${c.name} ${c.profile.legalName}`.toLowerCase();
      const creg = c.profile.organisation.registration.toLowerCase().replace(/\s+/g, "");
      if (reg && creg && (creg.includes(reg) || reg.includes(creg))) return { c, reason: "Same registration number" };
      if (name && cname.includes(name)) return { c, reason: "Same name" };
      const hits = tokens.filter((t) => cname.includes(t)).length;
      if (tokens.length > 0 && hits >= Math.max(1, Math.ceil(tokens.length * 0.6))) return { c, reason: "Similar name" };
      return null;
    })
    .filter((x): x is { c: Cause; reason: string } => x !== null)
    .slice(0, 4)
    .map(({ c, reason }) => ({ id: c.id, slug: c.slug, name: c.name, registration: c.profile.organisation.registration, reason }));
  return { uri: `https://causes.sera.cx/api/v1/profiles/${fakeHash(w.nextId).slice(2, 18)}.json`, duplicates };
}

export async function submitCause(input: NewCauseInput): Promise<Cause> {
  await delay(400);
  const w = getWorld();
  const id = Math.max(...w.causes.map((c) => c.id)) + 1;
  const slug = slugify(input.name) || `cause-${id}`;
  const category = CATEGORIES.find((c) => c.slug === input.category)?.profileName ?? "Children";
  const requiresCareLicence = false;
  const claims = Object.fromEntries(
    CLAIMS.map((code) => [
      code,
      { code, required: requiredClaimsFor(requiresCareLicence).includes(code), outcome: "open", state: "open", epoch: 0, evidenceCount: 0, pathCount: 0, independentChecks: 0, challenged: false },
    ]),
  ) as Cause["claims"];
  const now = new Date(NOW).toISOString();
  const cause: Cause = {
    id,
    slug,
    name: input.name.trim(),
    stage: "new",
    owner: DEMO_WALLET,
    payout: input.payout.trim() || null,
    depositAddress: `0x${fakeHash(id * 7).slice(2, 42)}`,
    media: [],
    treasury: { depositAddress: `0x${fakeHash(id * 7).slice(2, 42)}`, balances: [], policy: "hold", autoToken: "USDT", conversions: [], withdrawals: [] },
    listedAt: now,
    lastActivityAt: now,
    givenUsd: 0,
    giversCount: 0,
    homepage: input.homepage,
    requiresCareLicence,
    acceptedTokens: ["USDT", "USDC"],
    claims,
    checksDone: 0,
    checksTotal: 4,
    badges: { taxExempt: false, accountsPublished: false },
    concerns: [],
    helpRequests: [],
    updates: [],
    profile: {
      schema: "csd.cause/1",
      slug,
      name: input.name.trim(),
      legalName: "",
      category,
      location: { town: input.town.trim(), state: input.state, country: "MY" },
      summary: input.summary.trim(),
      programmes: [],
      impact: [],
      beneficiaries: "",
      organisation: { entityType: "", registration: input.registration.trim(), registrationSource: input.link.trim(), founded: "", founders: "", leadership: "", taxExemption: { statement: "Not stated", source: "" }, accounts: "Not public" },
      contact: { website: input.link.trim() },
      sources: input.link ? [input.link.trim()] : [],
      profileCheckedOn: now.slice(0, 10),
      image: { src: "photos/hero.jpg", alt: "Green turtle hatchling in a coconut shell", credit: "Kasih Turtle Conservation Project, Pantai Chendor", licence: "Supplied", illustrative: true },
    },
  };
  w.causes.push(cause);
  w.me.causesOwned.push(id);
  w.events.push({ id: w.nextId++, causeId: id, type: "listed", at: now, txHash: fakeTx(id), summary: "Listed by you", by: DEMO_WALLET });
  if (input.homepage) w.events.push({ id: w.nextId++, causeId: id, type: "homepage", at: now, summary: "Creator switched Show on homepage on", by: DEMO_WALLET });
  w.me.contributions.unshift({ id: w.nextId++, kind: "listing", causeId: id, causeName: cause.name, at: now, outcome: "open", gsera: GSERA.helper.listingVerified });
  // Documents uploaded at listing time become evidence against the matching claim.
  if (input.documents.length > 0 && !input.redactionConfirmed) throw new Error("Confirm that personal data has been redacted from the documents");
  for (const doc of input.documents) {
    const ev: Evidence = { id: w.nextId++, causeId: id, claim: doc.claim, kind: "document", title: doc.title || doc.fileName, note: `Uploaded with the listing: ${doc.fileName}`, uploader: DEMO_WALLET, hash: fakeHash(w.nextId * 3), createdAt: now };
    w.evidence.push(ev);
    cause.claims[doc.claim].evidenceCount += 1;
    w.events.push({ id: w.nextId++, causeId: id, type: "evidence", at: now, txHash: fakeTx(ev.id), summary: `Evidence for ${doc.claim}: ${ev.title}`, by: DEMO_WALLET });
    const key = claimKey(id, doc.claim);
    w.claimHistory.set(key, [...(w.claimHistory.get(key) ?? []), { id: w.nextId++, type: "evidence", at: now, summary: `Evidence uploaded: ${ev.title}`, by: DEMO_WALLET }]);
  }
  if (input.orgKind === "licensed") cause.requiresCareLicence = true;
  recomputeCause(cause);
  return withPhoto(cause);
}

export async function postEvidence(input: NewEvidenceInput): Promise<Evidence> {
  await delay(300);
  const w = getWorld();
  const c = w.causes.find((x) => x.id === input.causeId);
  if (!c) throw new Error("Cause not found");
  if (!input.redactionConfirmed) throw new Error("Confirm that personal data has been redacted");
  const now = new Date(NOW + (w.nextId % 1000)).toISOString();
  const ev: Evidence = { id: w.nextId++, causeId: c.id, claim: input.claim, kind: input.kind, title: input.title.trim(), note: input.note.trim(), uploader: DEMO_WALLET, hash: fakeHash(w.nextId * 3), url: input.url?.trim() || undefined, createdAt: now };
  w.evidence.push(ev);
  c.claims[input.claim].evidenceCount += 1;
  c.lastActivityAt = now;
  w.events.push({ id: w.nextId++, causeId: c.id, type: "evidence", at: now, txHash: fakeTx(ev.id), summary: `Evidence for ${input.claim}: ${ev.title}`, by: DEMO_WALLET });
  const key = claimKey(c.id, input.claim);
  w.claimHistory.set(key, [...(w.claimHistory.get(key) ?? []), { id: w.nextId++, type: "evidence", at: now, summary: `Evidence uploaded: ${ev.title}`, by: DEMO_WALLET }]);
  recomputeCause(c);
  return ev;
}

export async function postPath(input: NewPathInput): Promise<VerificationPath> {
  await delay(300);
  const w = getWorld();
  const c = w.causes.find((x) => x.id === input.causeId);
  if (!c) throw new Error("Cause not found");
  if (!input.source.trim() || input.steps.filter((s) => s.trim()).length === 0 || !input.screenshotName.trim() || !input.checkedAt) {
    throw new Error("A path needs a source, steps and a dated screenshot");
  }
  const s = c.claims[input.claim];
  const now = new Date(NOW + (w.nextId % 1000)).toISOString();
  const path: VerificationPath = {
    id: w.nextId++,
    causeId: c.id,
    claim: input.claim,
    epoch: s.epoch,
    author: DEMO_WALLET,
    authorReputation: w.me.reputation,
    source: input.source.trim(),
    steps: input.steps.map((x) => x.trim()).filter(Boolean),
    exactSearch: input.exactSearch.trim(),
    found: input.found.trim(),
    matches: input.matches.trim(),
    screenshotHash: fakeHash(w.nextId * 5),
    checkedAt: input.checkedAt,
    result: input.result,
    caveats: input.caveats.trim(),
    conflict: input.conflict.trim() || "None",
  };
  w.paths.push(path);
  s.pathCount += 1;
  s.independentChecks = new Set(w.paths.filter((p) => p.causeId === c.id && p.claim === input.claim && p.result === "verified").map((p) => p.author)).size;
  const key = claimKey(c.id, input.claim);
  const hist = w.claimHistory.get(key) ?? [];
  hist.push({ id: w.nextId++, type: "path", at: now, summary: `Path added, result: ${input.result.replace("_", " ")}`, by: DEMO_WALLET });
  const distinctAuthors = new Set(w.paths.filter((p) => p.causeId === c.id && p.claim === input.claim && p.epoch === s.epoch).map((p) => p.author)).size;
  if (s.state === "open" && distinctAuthors >= VOTING.minPaths) {
    s.state = "voting";
    s.votingEnd = ahead(24 * VOTING.periodDays);
    hist.push({ id: w.nextId++, type: "voting_opened", at: now, summary: "Voting opened: two independent paths" });
    w.events.push({ id: w.nextId++, causeId: c.id, type: "voting_opened", at: now, summary: `Voting opened on ${input.claim}` });
  }
  w.claimHistory.set(key, hist);
  w.events.push({ id: w.nextId++, causeId: c.id, type: "path", at: now, summary: `Verification path for ${input.claim} (${input.result.replace("_", " ")})`, by: DEMO_WALLET });
  c.lastActivityAt = now;
  w.me.contributions.unshift({ id: w.nextId++, kind: "path", causeId: c.id, causeName: c.name, claim: input.claim, at: now, outcome: "pending", gsera: GSERA.helper.pathAgrees });
  return path;
}

export async function markPathsOpened(causeId: number, claim: ClaimCode): Promise<void> {
  getWorld().pathsOpened.add(claimKey(causeId, claim));
}

export async function postVote(input: NewVoteInput): Promise<void> {
  await delay(250);
  const w = getWorld();
  const c = w.causes.find((x) => x.id === input.causeId);
  if (!c) throw new Error("Cause not found");
  const key = claimKey(c.id, input.claim);
  if (!w.pathsOpened.has(key)) throw new Error("Read the paths before voting");
  if (!input.reason.trim()) throw new Error("Give a one-line reason");
  const list = w.votes.get(key) ?? [];
  if (list.some((v) => v.voter === DEMO_WALLET)) throw new Error("You have already voted on this claim");
  const now = new Date(NOW + (w.nextId % 1000)).toISOString();
  list.push({ id: w.nextId++, voter: DEMO_WALLET, choice: input.choice, reason: input.reason.trim(), weight: voteWeight(w.me.reputation), signedAt: now });
  w.votes.set(key, list);
  w.claimHistory.set(key, [...(w.claimHistory.get(key) ?? []), { id: w.nextId++, type: "vote", at: now, summary: `Vote: ${input.choice.replace("_", " ")}`, by: DEMO_WALLET }]);
  w.me.contributions.unshift({ id: w.nextId++, kind: "vote", causeId: c.id, causeName: c.name, claim: input.claim, at: now, outcome: "pending", gsera: GSERA.helper.voteAgrees });
  w.me.ledger.unshift({ id: w.nextId++, amount: GSERA.helper.voteAgrees, reason: "vote", sourceTag: "charity", note: `Vote on ${c.name} ${input.claim}, credited when the claim is final`, state: "held", createdAt: now, causeId: c.id });
}

export async function postChallenge(input: NewChallengeInput): Promise<void> {
  await delay(350);
  const w = getWorld();
  const c = w.causes.find((x) => x.id === input.causeId);
  if (!c) throw new Error("Cause not found");
  if (w.me.gsera.spendable < CHALLENGE_STAKE) throw new Error(`You need ${CHALLENGE_STAKE.toLocaleString("en-GB")} spendable gSera to stake`);
  if (!input.summary.trim() || !input.counterEvidence.trim()) throw new Error("A challenge needs a summary and counter-evidence");
  const s = c.claims[input.claim];
  const now = new Date(NOW + (w.nextId % 1000)).toISOString();
  w.challenges.push({ id: w.nextId++, causeId: c.id, claim: input.claim, challenger: DEMO_WALLET, stake: CHALLENGE_STAKE, summary: input.summary.trim(), counterEvidence: input.counterEvidence.trim(), state: "open", createdAt: now, votingEnd: ahead(24 * VOTING.periodDays) });
  s.challenged = true;
  s.state = "challenge_window";
  s.epoch += 1;
  s.challengeWindowEnd = ahead(24 * VOTING.periodDays);
  if (s.required) recomputeCause(c);
  w.me.gsera.spendable -= CHALLENGE_STAKE;
  w.me.ledger.unshift({ id: w.nextId++, amount: -CHALLENGE_STAKE, reason: "challenge_stake", sourceTag: "charity", note: `Stake on the challenge of ${c.name} ${input.claim}. Returned if upheld, burned if not`, state: "spent", createdAt: now, causeId: c.id });
  const key = claimKey(c.id, input.claim);
  w.claimHistory.set(key, [...(w.claimHistory.get(key) ?? []), { id: w.nextId++, type: "challenge", at: now, summary: `Challenge opened with ${CHALLENGE_STAKE.toLocaleString("en-GB")} gSera staked. Voting reopened`, by: DEMO_WALLET }]);
  w.events.push({ id: w.nextId++, causeId: c.id, type: "challenge", at: now, summary: `${input.claim} challenged: ${input.summary.trim()}`, by: DEMO_WALLET });
  c.concerns.unshift({ kind: "challenge", text: `A challenge is open on ${input.claim} (${CLAIM_INFO[input.claim].label}). ${input.summary.trim()}`, link: `/verify/${c.id}/${input.claim}`, at: now });
  c.lastActivityAt = now;
  w.me.contributions.unshift({ id: w.nextId++, kind: "challenge", causeId: c.id, causeName: c.name, claim: input.claim, at: now, outcome: "open", gsera: GSERA.helper.challengeWin });
}

export async function setHomepageFlag(causeId: number, shown: boolean): Promise<void> {
  await delay(150);
  const w = getWorld();
  const c = w.causes.find((x) => x.id === causeId);
  if (!c) throw new Error("Cause not found");
  if (c.owner !== DEMO_WALLET) throw new Error("Only the creator can change this");
  c.homepage = shown;
  const now = new Date(NOW + (w.nextId % 1000)).toISOString();
  w.events.push({ id: w.nextId++, causeId, type: "homepage", at: now, summary: `Creator switched Show on homepage ${shown ? "on" : "off"}`, by: DEMO_WALLET });
}

export async function quoteGift(causeId: number, fromToken: string, amount: number): Promise<GiftQuote> {
  await delay(200);
  const w = getWorld();
  const c = w.causes.find((x) => x.id === causeId);
  if (!c) throw new Error("Cause not found");
  const token = STABLECOINS.find((t) => t.symbol === fromToken);
  if (!token) throw new Error("Unknown stablecoin");
  if (!(amount > 0)) throw new Error("Enter an amount");
  const usd = Math.round(amount * token.usd * 100) / 100;
  const direct = c.acceptedTokens.includes(fromToken);
  let swap: GiftQuote["swap"];
  if (!direct) {
    const toSymbol = c.acceptedTokens[0]!;
    const to = STABLECOINS.find((t) => t.symbol === toSymbol)!;
    const rate = Math.round((token.usd / to.usd) * 0.9985 * 10_000) / 10_000;
    swap = { toToken: toSymbol, rate, receives: Math.round(amount * rate * 100) / 100, swapFeeUsd: Math.round(usd * 0.0015 * 100) / 100 };
  }
  const ownerLinked = c.owner === DEMO_WALLET || c.payout === DEMO_WALLET;
  const heat = c.urgent ? GSERA.heat.urgent : GSERA.heat.normal;
  const m = w.me.multipliers;
  const gsera = ownerLinked ? 0 : giftGsera(usd, { heat, volumeTier: m.volumeTier, streak: m.streak });
  return {
    quoteId: `q_${w.nextId}_${fromToken}_${amount}`,
    causeId,
    causeName: c.name,
    depositAddress: c.depositAddress,
    fromToken,
    amount,
    usd,
    networkFeeUsd: 0.42,
    swap,
    gsera: { amount: gsera, base: GSERA.perUsd, heat, volume: m.volumeTier, streak: m.streak, capped: heat * m.volumeTier * m.streak > GSERA.compoundCap, earns: !ownerLinked, whyNot: ownerLinked ? "Wallets linked to a cause's owner or payout wallet earn no gSera on that cause" : undefined },
    expiresAt: ahead(0.25),
  };
}

export async function submitGift(quote: GiftQuote): Promise<GiftReceipt> {
  await delay(900);
  const w = getWorld();
  const c = w.causes.find((x) => x.id === quote.causeId);
  if (!c) throw new Error("Cause not found");
  if (c.stage === "paused" || c.stage === "closed") throw new Error("This cause is not taking gifts");
  const now = new Date(NOW + (w.nextId % 1000)).toISOString();
  const route: Gift["route"] = quote.swap ? "swap" : "direct";
  const received = quote.swap ? { token: quote.swap.toToken, amount: quote.swap.receives } : { token: quote.fromToken, amount: quote.amount };
  const gift: Gift = {
    id: w.nextId++,
    causeId: c.id,
    causeName: c.name,
    causeSlug: c.slug,
    token: quote.fromToken,
    amount: quote.amount,
    usd: quote.usd,
    at: now,
    route,
    gsera: quote.gsera.amount,
    txHash: fakeTx(w.nextId * 9),
    giver: DEMO_WALLET,
  };
  w.gifts.push(gift);
  w.me.gifts.unshift(gift);
  c.givenUsd = Math.round((c.givenUsd + quote.usd) * 100) / 100;
  if (!w.gifts.some((g) => g.giver === DEMO_WALLET && g.causeId === c.id && g.id !== gift.id)) c.giversCount += 1;
  c.lastActivityAt = now;
  // The treasury receives the delivered token (auto-convert applies on arrival).
  const landToken = c.treasury.policy === "auto" ? c.treasury.autoToken : received.token;
  const landInfo = STABLECOINS.find((t) => t.symbol === landToken)!;
  const landAmount = c.treasury.policy === "auto" && landToken !== received.token ? Math.round((quote.usd / landInfo.usd) * 0.9985 * 100) / 100 : received.amount;
  let bal = c.treasury.balances.find((b) => b.token === landToken);
  if (!bal) {
    bal = { token: landToken, amount: 0, usd: 0 };
    c.treasury.balances.push(bal);
  }
  bal.amount = Math.round((bal.amount + landAmount) * 100) / 100;
  bal.usd = Math.round(bal.amount * landInfo.usd * 100) / 100;
  w.events.push({ id: w.nextId++, causeId: c.id, type: "gift", at: now, txHash: gift.txHash, summary: `Gift of ${quote.amount.toLocaleString("en-GB")} ${quote.fromToken} (US$${quote.usd.toLocaleString("en-GB")}) arrived${route === "swap" ? ` through a Sera.cx swap as ${received.amount.toLocaleString("en-GB")} ${received.token}` : ""}`, by: DEMO_WALLET });
  if (c.treasury.policy === "auto" && landToken !== received.token) {
    const tx = fakeTx(w.nextId * 17);
    c.treasury.conversions.unshift({ id: w.nextId++, fromToken: received.token, toToken: landToken, amountIn: received.amount, amountOut: landAmount, rate: Math.round((landAmount / received.amount) * 10_000) / 10_000, at: now, txHash: tx, reason: "auto" });
    w.events.push({ id: w.nextId++, causeId: c.id, type: "conversion", at: now, txHash: tx, summary: `Auto-converted ${received.amount.toLocaleString("en-GB")} ${received.token} to ${landAmount.toLocaleString("en-GB")} ${landToken} on arrival through Sera.cx`, by: c.owner });
  }
  if (quote.gsera.amount > 0) {
    w.me.ledger.unshift({ id: w.nextId++, amount: quote.gsera.amount, reason: "gift", sourceTag: "charity", note: `Gift of US$${quote.usd.toLocaleString("en-GB")} to ${c.name}${c.urgent ? " (urgent appeal 2.5x)" : ""}${route === "swap" ? ", settled through a Sera.cx swap (earns once)" : ""}`, state: "credited", multipliers: { heat: quote.gsera.heat, volume: quote.gsera.volume, streak: quote.gsera.streak }, createdAt: now, causeId: c.id });
    w.me.gsera.spendable += quote.gsera.amount;
    w.me.gsera.charityTagged += quote.gsera.amount;
    w.me.gsera.lifetime += quote.gsera.amount;
  }
  return { id: gift.id, causeId: c.id, causeName: c.name, causeSlug: c.slug, token: gift.token, amount: gift.amount, usd: gift.usd, txHash: gift.txHash, gsera: gift.gsera, route, received, at: now };
}

export async function getGift(id: number): Promise<Gift | null> {
  await delay(80);
  return getWorld().gifts.find((g) => g.id === id) ?? null;
}

export async function recordShare(causeId: number, channel: string): Promise<void> {
  const w = getWorld();
  const s = w.shares.get(causeId) ?? {};
  s[channel] = (s[channel] ?? 0) + 1;
  w.shares.set(causeId, s);
}

export async function postUpdate(causeId: number, input: { kind: CauseUpdate["kind"]; title: string; body: string; link?: string }): Promise<CauseUpdate> {
  await delay(250);
  const w = getWorld();
  const c = w.causes.find((x) => x.id === causeId);
  if (!c || c.owner !== DEMO_WALLET) throw new Error("Only the creator can post updates");
  const now = new Date(NOW + (w.nextId % 1000)).toISOString();
  const u: CauseUpdate = { id: w.nextId++, causeId, kind: input.kind, title: input.title.trim(), body: input.body.trim(), at: now, link: input.link?.trim() || undefined };
  c.updates.unshift(u);
  if (input.kind === "stream" && u.link) c.liveUrl = u.link;
  c.lastActivityAt = now;
  w.events.push({ id: w.nextId++, causeId, type: "update", at: now, txHash: fakeTx(u.id), summary: `Update: ${u.title}`, by: DEMO_WALLET });
  return u;
}

export async function setLiveLink(causeId: number, url: string): Promise<void> {
  await delay(150);
  const c = getWorld().causes.find((x) => x.id === causeId);
  if (!c || c.owner !== DEMO_WALLET) throw new Error("Only the creator can set the live link");
  c.liveUrl = url.trim() || undefined;
}

export async function pledgeHelp(needId: number): Promise<void> {
  await delay(200);
  const w = getWorld();
  for (const c of w.causes) {
    const h = c.helpRequests.find((x) => x.id === needId);
    if (h) {
      if (h.state !== "open") throw new Error("Someone has already taken this");
      h.state = "pledged";
      h.pledgedBy = DEMO_WALLET;
      w.me.contributions.unshift({ id: w.nextId++, kind: "help", causeId: c.id, causeName: c.name, at: new Date(NOW).toISOString(), outcome: "open", gsera: h.rewardGsera });
      return;
    }
  }
  throw new Error("Help request not found");
}

export async function confirmHelp(needId: number): Promise<void> {
  await delay(200);
  const w = getWorld();
  for (const c of w.causes) {
    const h = c.helpRequests.find((x) => x.id === needId);
    if (h) {
      if (c.owner !== DEMO_WALLET) throw new Error("Only the cause owner can confirm");
      h.state = "fulfilled";
      return;
    }
  }
  throw new Error("Help request not found");
}

export async function setPayout(causeId: number, payout: string): Promise<void> {
  await delay(300);
  const w = getWorld();
  const c = w.causes.find((x) => x.id === causeId);
  if (!c || c.owner !== DEMO_WALLET) throw new Error("Only the creator can change the payout wallet");
  c.payout = payout.trim() || null;
  // Changing the payout wallet removes Verified; C3 must be checked again.
  const s = c.claims.C3;
  if (s.outcome === "verified") {
    s.outcome = "open";
    s.state = "open";
    s.epoch += 1;
    s.pathCount = 0;
    s.independentChecks = 0;
    s.finalisedAt = undefined;
    const now = new Date(NOW).toISOString();
    w.claimHistory.set(claimKey(causeId, "C3"), [...(w.claimHistory.get(claimKey(causeId, "C3")) ?? []), { id: w.nextId++, type: "reopened", at: now, summary: "Payout wallet changed. Claim reopened", by: DEMO_WALLET }]);
    w.events.push({ id: w.nextId++, causeId, type: "steward", at: now, txHash: fakeTx(w.nextId), summary: "Payout wallet changed. Verified removed until C3 is checked again", by: DEMO_WALLET });
    recomputeCause(c);
  }
}

// ---------------------------------------------------------------------------
// Media, socials, treasury
// ---------------------------------------------------------------------------

function ownedCause(causeId: number): Cause {
  const c = getWorld().causes.find((x) => x.id === causeId);
  if (!c) throw new Error("Cause not found");
  if (c.owner !== DEMO_WALLET) throw new Error("Only the creator can do this");
  return c;
}

export function providerOf(url: string): MediaItem["provider"] {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (/youtube\.com$|youtu\.be$/.test(host)) return "youtube";
    if (/tiktok\.com$/.test(host)) return "tiktok";
    if (/instagram\.com$/.test(host)) return "instagram";
    if (/^(x|twitter)\.com$/.test(host)) return "x";
    return "other";
  } catch {
    return "other";
  }
}

export async function addMedia(causeId: number, input: { kind: MediaItem["kind"]; url: string; title: string; alt?: string; credit?: string }): Promise<MediaItem> {
  await delay(250);
  const w = getWorld();
  const c = ownedCause(causeId);
  const now = new Date(NOW + (w.nextId % 1000)).toISOString();
  const item: MediaItem = { id: w.nextId++, kind: input.kind, url: input.url.trim(), title: input.title.trim() || (input.kind === "photo" ? "Photo" : "Video"), provider: input.kind === "video" ? providerOf(input.url) : undefined, alt: input.alt?.trim(), credit: input.credit?.trim(), addedAt: now };
  c.media.unshift(item);
  c.lastActivityAt = now;
  w.events.push({ id: w.nextId++, causeId, type: "media", at: now, summary: `${item.kind === "photo" ? "Photo" : "Video"} added: ${item.title}`, by: DEMO_WALLET });
  return item;
}

export async function removeMedia(causeId: number, mediaId: number): Promise<void> {
  await delay(150);
  const c = ownedCause(causeId);
  c.media = c.media.filter((m) => m.id !== mediaId);
}

export async function updateSocials(causeId: number, socials: CauseSocials & { x?: string; website?: string }): Promise<void> {
  await delay(250);
  const w = getWorld();
  const c = ownedCause(causeId);
  const { website, ...rest } = socials;
  c.profile.contact = { ...c.profile.contact, website: website?.trim() || c.profile.contact.website, socials: Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v?.trim() || undefined])) };
  const now = new Date(NOW + (w.nextId % 1000)).toISOString();
  w.events.push({ id: w.nextId++, causeId, type: "profile", at: now, summary: "Creator updated the organisation's links", by: DEMO_WALLET });
}

export async function setTreasuryPolicy(causeId: number, policy: "auto" | "hold", autoToken: string): Promise<void> {
  await delay(200);
  const w = getWorld();
  const c = ownedCause(causeId);
  c.treasury.policy = policy;
  c.treasury.autoToken = autoToken;
  const now = new Date(NOW + (w.nextId % 1000)).toISOString();
  w.events.push({ id: w.nextId++, causeId, type: "profile", at: now, summary: policy === "auto" ? `Treasury set to keep everything in ${autoToken}, converted on arrival through Sera.cx` : "Treasury set to hold what arrives", by: DEMO_WALLET });
}

export async function quoteConvert(causeId: number, fromToken: string, toToken: string, amountIn: number): Promise<ConvertQuote> {
  await delay(250);
  const w = getWorld();
  const c = ownedCause(causeId);
  const from = STABLECOINS.find((t) => t.symbol === fromToken);
  const to = STABLECOINS.find((t) => t.symbol === toToken);
  if (!from || !to) throw new Error("Unknown stablecoin");
  if (fromToken === toToken) throw new Error("Pick two different stablecoins");
  const bal = c.treasury.balances.find((b) => b.token === fromToken);
  if (!bal || bal.amount < amountIn) throw new Error(`Not enough ${fromToken} in the treasury`);
  const rate = Math.round((from.usd / to.usd) * 0.9985 * 10_000) / 10_000;
  return { quoteId: `cq_${w.nextId}`, fromToken, toToken, amountIn, amountOut: Math.round(amountIn * rate * 100) / 100, rate, feeUsd: Math.round(amountIn * from.usd * 0.0015 * 100) / 100, expiresAt: ahead(0.25) };
}

export async function convert(causeId: number, quote: ConvertQuote): Promise<void> {
  await delay(700);
  const w = getWorld();
  const c = ownedCause(causeId);
  const from = c.treasury.balances.find((b) => b.token === quote.fromToken);
  if (!from || from.amount < quote.amountIn) throw new Error(`Not enough ${quote.fromToken} in the treasury`);
  const toInfo = STABLECOINS.find((t) => t.symbol === quote.toToken)!;
  const fromInfo = STABLECOINS.find((t) => t.symbol === quote.fromToken)!;
  from.amount = Math.round((from.amount - quote.amountIn) * 100) / 100;
  from.usd = Math.round(from.amount * fromInfo.usd * 100) / 100;
  let to = c.treasury.balances.find((b) => b.token === quote.toToken);
  if (!to) {
    to = { token: quote.toToken, amount: 0, usd: 0 };
    c.treasury.balances.push(to);
  }
  to.amount = Math.round((to.amount + quote.amountOut) * 100) / 100;
  to.usd = Math.round(to.amount * toInfo.usd * 100) / 100;
  const now = new Date(NOW + (w.nextId % 1000)).toISOString();
  const tx = fakeTx(w.nextId * 13);
  c.treasury.conversions.unshift({ id: w.nextId++, fromToken: quote.fromToken, toToken: quote.toToken, amountIn: quote.amountIn, amountOut: quote.amountOut, rate: quote.rate, at: now, txHash: tx, reason: "manual" });
  c.lastActivityAt = now;
  w.events.push({ id: w.nextId++, causeId, type: "conversion", at: now, txHash: tx, summary: `Converted ${quote.amountIn.toLocaleString("en-GB")} ${quote.fromToken} to ${quote.amountOut.toLocaleString("en-GB")} ${quote.toToken} on Sera.cx`, by: DEMO_WALLET });
}

export async function withdraw(causeId: number, token: string, amount: number, to: string): Promise<void> {
  await delay(600);
  const w = getWorld();
  const c = ownedCause(causeId);
  const bal = c.treasury.balances.find((b) => b.token === token);
  if (!bal || bal.amount < amount) throw new Error(`Not enough ${token} in the treasury`);
  if (!/^0x[0-9a-fA-F]{40}$/.test(to.trim())) throw new Error("Enter a valid Ethereum address");
  const info = STABLECOINS.find((t) => t.symbol === token);
  bal.amount = Math.round((bal.amount - amount) * 100) / 100;
  bal.usd = Math.round(bal.amount * (info?.usd ?? 1) * 100) / 100;
  const now = new Date(NOW + (w.nextId % 1000)).toISOString();
  const tx = fakeTx(w.nextId * 19);
  c.treasury.withdrawals.unshift({ id: w.nextId++, token, amount, to: to.trim(), at: now, txHash: tx });
  w.events.push({ id: w.nextId++, causeId, type: "withdrawal", at: now, txHash: tx, summary: `Withdrew ${amount.toLocaleString("en-GB")} ${token} to ${to.trim().slice(0, 6)}\u2026${to.trim().slice(-4)}`, by: DEMO_WALLET });
}
