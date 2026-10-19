/**
 * Deterministic mock world built from the seed, in the shapes the API
 * returns (indexer/src/api/serializers.ts and the read routes). Same input,
 * same output, except that timestamps are relative to the moment the module
 * loads so countdowns and "x days ago" read naturally.
 */
import { CHALLENGE_STAKE, CLAIMS, GSERA, VOTING, XP, causeStage, embedFor, giftGsera, requiredClaimsFor, voteWeight, type Address, type CauseProfile, type CauseStatus, type ClaimCode, type Hex, type PathBody, type PathResult, type VoteChoice, type XpEventType } from "@sera-causes/shared";
import type {
  CauseDetail,
  Challenge,
  ClaimSummary,
  Concern,
  ConversionView,
  EvidenceView,
  GiftView,
  HelpRequestView,
  LedgerView,
  MediaView,
  PathView,
  RecordEntry,
  Stablecoin,
  VoteView,
  WalletView,
  WithdrawalView,
  XpEventView,
} from "../types";
import { SEED_ATTEST, SEED_PROFILES } from "./seed";

/**
 * The demo wallet the mock world is built around: owner of cause 1 and cause
 * 14, and the `giver` in the indexer seed. Written out here rather than
 * imported from ../devWallet so the mock layer, which every build includes,
 * never pulls the dev private key into the bundle. src/test/devWallet.test.ts
 * checks the two still agree.
 */
export const DEMO_WALLET: Address = "0x95ced938f7991cd0dfcb48f0a06a40fa1af46ebc";

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------

export const NOW = Date.now();
const HOUR = 3_600_000;
export const ago = (hours: number) => new Date(NOW - hours * HOUR).toISOString();
export const ahead = (hours: number) => new Date(NOW + hours * HOUR).toISOString();
export const secs = (iso: string) => Math.floor(Date.parse(iso) / 1000);

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hex(rand: () => number, n: number) {
  let s = "";
  for (let i = 0; i < n; i++) s += Math.floor(rand() * 16).toString(16);
  return s;
}

export function fakeTx(seed: number): Hex {
  return `0x${hex(mulberry32(seed * 101 + 7), 64)}`;
}
export function fakeHash(seed: number): Hex {
  return `0x${hex(mulberry32(seed * 313 + 11), 64)}`;
}
export function fakeSig(seed: number): Hex {
  return `0x${hex(mulberry32(seed * 977 + 3), 130)}`;
}
function fakeAddress(seed: number): Address {
  return `0x${hex(mulberry32(seed), 40)}`;
}

export const CHAIN_ID = 11155111;
export const API_ORIGIN = "https://causes.sera.cx";

/** The same mock stablecoins the API's mock settlement lists. */
export const MOCK_STABLECOINS: readonly Stablecoin[] = [
  { address: "0x1000000000000000000000000000000000000002", symbol: "USDT", decimals: 6, currency: "USD" },
  { address: "0x1000000000000000000000000000000000000001", symbol: "USDC", decimals: 6, currency: "USD" },
  { address: "0x1000000000000000000000000000000000000003", symbol: "XSGD", decimals: 6, currency: "SGD" },
  { address: "0x1000000000000000000000000000000000000004", symbol: "MYRT", decimals: 6, currency: "MYR" },
];
export const tokenBySymbol = (symbol: string): Stablecoin => MOCK_STABLECOINS.find((t) => t.symbol === symbol) ?? MOCK_STABLECOINS[0]!;
export const tokenByAddress = (address: string): Stablecoin | undefined => MOCK_STABLECOINS.find((t) => t.address === address.toLowerCase());
/** Indicative US$ per unit, for mock valuations. */
const USD_PER_UNIT: Record<string, number> = { USDT: 1, USDC: 1, XSGD: 0.74, MYRT: 0.235 };
export const usdPerUnit = (symbol: string) => USD_PER_UNIT[symbol] ?? 1;
export const toRaw = (units: number, decimals = 6) => BigInt(Math.round(units * 10 ** decimals)).toString();

// ---------------------------------------------------------------------------
// Wallets
// ---------------------------------------------------------------------------

export const STEWARD_WALLET: Address = "0x22d491bde2303f2f43325b2108d26f1eaba1e32b";
export const RESEARCH_WALLET: Address = "0xd03ea8624c8c5987235048901fb614fdca89b117";
export const LISTER_WALLET: Address = "0xe11ba2b4d45eaed5996cd0823791e0c93114882d";

export interface Helper {
  wallet: Address;
  reputation: number;
  acceptedPaths: number;
  helpFulfilled: number;
  /** Paths accepted in the last 30 days. */
  recentPaths: number;
}

const HELPER_SEEDS: [Address, number, number, number, number][] = [
  ["0x8c1d9f3b7a2e4c6d8e0f1a3b5c7d9e1f2a4b6c8d", 14, 18, 3, 6],
  ["0x3f9a71bc2d4e6f8a9b0c1d2e3f4a5b6c7d8e9f0a", 9, 11, 1, 4],
  ["0xa7b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0", 6, 7, 2, 3],
  ["0x1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f", 4, 5, 0, 2],
  ["0x9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e", 3, 3, 4, 1],
  ["0x6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c", 2, 2, 1, 2],
  ["0xc4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3", 1, 1, 0, 1],
  ["0xe2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1", 0, 0, 1, 0],
  ["0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b", 7, 8, 0, 2],
  ["0x2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c", 5, 6, 2, 3],
];

export const HELPERS: Helper[] = HELPER_SEEDS.map(([wallet, reputation, acceptedPaths, helpFulfilled, recentPaths]) => ({ wallet, reputation, acceptedPaths, helpFulfilled, recentPaths }));

const GIVER_WALLETS: Address[] = Array.from({ length: 18 }, (_, i) => fakeAddress(5000 + i));

// ---------------------------------------------------------------------------
// Scenario per cause
// ---------------------------------------------------------------------------

interface Scenario {
  verified?: ClaimCode[];
  voting?: ClaimCode[];
  /** Evidence plus 0 or 1 path. */
  checking?: ClaimCode[];
  challenged?: ClaimCode;
  paused?: boolean;
}

const SCENARIOS: Record<string, Scenario> = {
  "free-tree-society": { verified: ["C1", "C2", "C3", "C4", "C5"] },
  "make-a-wish-malaysia": { verified: ["C1", "C2", "C3", "C4", "C5", "C7"] },
  "mercy-malaysia": { verified: ["C1", "C2", "C4"], voting: ["C3"], checking: ["C5", "C7"] },
  "wwf-malaysia": { verified: ["C1", "C2"], voting: ["C4"], checking: ["C3"] },
  "hospis-malaysia": { verified: ["C1", "C2", "C4"], voting: ["C3"], checking: ["C5"] },
  "spca-selangor": { verified: ["C1"], checking: ["C2", "C4"] },
  "teach-for-malaysia": { verified: ["C1"], challenged: "C2", checking: ["C4"] },
  "kechara-soup-kitchen": { verified: ["C1", "C4"], voting: ["C2"], checking: ["C5"] },
  "turtle-conservation-society-malaysia": { verified: ["C1"], voting: ["C2"], checking: ["C4"] },
  "dignity-for-children": { verified: ["C1", "C2"], checking: ["C3", "C4"] },
  "reef-check-malaysia": { checking: ["C1"] },
  bsbcc: { checking: ["C1", "C4"] },
  mycat: { checking: ["C1"] },
  "womens-aid-organisation": { checking: ["C1"] },
  "food-aid-foundation": { checking: ["C1", "C4"] },
  "the-lost-food-project": { checking: ["C1"] },
  "yayasan-chow-kit": { checking: ["C1", "C6"] },
  "nkf-malaysia": { checking: ["C1", "C5"] },
  "malaysian-nature-society": { checking: ["C1"] },
  "paws-pj": { checking: ["C4"] },
  "perhentian-turtle-project": { paused: true },
};

const CARE_LICENCE = new Set(["rumah-kids", "shelter-home-for-children", "ps-the-children", "orphancare-foundation", "peace-harmony-home-penang"]);

const HOMEPAGE_ON = new Set([
  "free-tree-society",
  "make-a-wish-malaysia",
  "mercy-malaysia",
  "wwf-malaysia",
  "hospis-malaysia",
  "spca-selangor",
  "teach-for-malaysia",
  "kechara-soup-kitchen",
  "turtle-conservation-society-malaysia",
  "dignity-for-children",
  "reef-check-malaysia",
  "bsbcc",
  "mycat",
  "womens-aid-organisation",
  "food-aid-foundation",
  "the-lost-food-project",
  "yayasan-chow-kit",
  "nkf-malaysia",
  "malaysian-nature-society",
  "paws-pj",
  "kasih-turtle-conservation-project",
  "juara-turtle-project",
  "furrykids-safehaven",
  "hope-jb",
  "sarawak-childrens-cancer-society",
]);

export const URGENT = { slug: "mercy-malaysia", reason: "Flood relief, Kelantan" };

/** Stablecoin a cause keeps (its treasury target). Others hold whatever arrives. */
const KEEPS: Record<string, string> = {
  "kasih-turtle-conservation-project": "MYRT",
  "juara-turtle-project": "MYRT",
  "kudat-turtle-conservation-society": "MYRT",
  "hope-jb": "MYRT",
  "furrykids-safehaven": "MYRT",
  "peace-harmony-home-penang": "MYRT",
  "mercy-malaysia": "USDT",
  "kechara-soup-kitchen": "USDT",
  "wwf-malaysia": "USDT",
  "make-a-wish-malaysia": "USDT",
  "teach-for-malaysia": "USDT",
};

// ---------------------------------------------------------------------------
// Text generators
// ---------------------------------------------------------------------------

function registerFor(profile: CauseProfile): { name: string; tool: string } {
  const t = profile.organisation.entityType;
  if (t.startsWith("Society")) return { name: "Registrar of Societies (ROS)", tool: "eROSES public search" };
  if (t.startsWith("Company")) return { name: "SSM", tool: "SSM e-Info company search" };
  if (t.startsWith("Trust")) return { name: "Legal Affairs Division (BHEUU)", tool: "BHEUU trust register" };
  if (t.startsWith("Foundation")) return { name: "SSM", tool: "SSM e-Info company search" };
  return { name: "Registrar of Societies (ROS)", tool: "eROSES public search" };
}

export function pathText(profile: CauseProfile, claim: ClaimCode, result: PathResult): Omit<PathBody, "screenshotHash" | "checkedAt" | "result" | "conflictOfInterest"> {
  const reg = profile.organisation.registration || profile.name;
  const legal = profile.legalName || profile.name;
  const site = profile.contact.website || profile.contact.socials?.instagram || "the organisation's own channels";
  const register = registerFor(profile);
  const news = profile.sources.find((s) => /nst|star|malay|bernama|free|sun|news|edge/i.test(s)) ?? profile.sources[0] ?? site;
  const ok = result === "verified";
  switch (claim) {
    case "C1":
      return {
        source: `${register.name} public search (${register.tool})`,
        steps: [`Opened the ${register.tool}.`, `Searched the registration number "${reg}".`, "Opened the result and compared it with the cause profile."],
        exactQuery: reg,
        findings: ok ? `Name: ${legal}. Status: active. State: ${profile.location.state}.` : `No result for "${reg}". A name search returned entries that do not match the profile.`,
        matches: ok,
        caveats: "The register does not show office-bearers publicly.",
      };
    case "C2":
      return {
        source: `${register.name} annual return status`,
        steps: [`Opened the ${register.tool}.`, `Searched "${reg}".`, "Checked the latest annual return year and the status line."],
        exactQuery: reg,
        findings: ok ? "Status: active. Latest annual return accepted for 2025." : "Status line shows the latest accepted return as 2023. Could not confirm 2024 or 2025.",
        matches: ok,
        caveats: "Annual return acceptance can lag by a few months.",
      };
    case "C3":
      return {
        source: `Signature check on-chain and the organisation's website (${site})`,
        steps: ["Opened the payout wallet address on the registry.", `Found the signed message on ${site}.`, "Recovered the signer with an EIP-191 check and compared it with the payout wallet.", "Read the board resolution PDF for the same address."],
        exactQuery: "0x…payout address, pasted from the registry",
        findings: ok ? "Signer matches the payout wallet. Resolution dated and signed by two office-bearers." : "The signed message is on the site but the recovered signer does not match the payout wallet.",
        matches: ok,
        caveats: "A board resolution is not independently verifiable without the register.",
      };
    case "C4":
      return {
        source: `News archive and the organisation's own channels (${news})`,
        steps: ["Searched the organisation name in news from the last 12 months.", `Opened ${news}.`, "Cross-checked dates and places against the organisation's Instagram posts."],
        exactQuery: `"${profile.name}" 2026`,
        findings: ok ? "Two independent dated sources from the last 12 months describe current programmes." : "Only one dated source from the last 12 months. A second independent source is still missing.",
        matches: ok,
        caveats: "Photos on social media carry no location data.",
      };
    case "C5":
      return {
        source: "LHDN Semakan Kelulusan Derma search",
        steps: ["Opened the LHDN search.", `Searched "${legal}".`, "Compared the approval reference and validity period with the profile."],
        exactQuery: legal,
        findings: profile.organisation.taxExemption.statement || "No entry found",
        matches: ok,
        caveats: "LHDN shows the period of approval, not the date of the latest audit.",
      };
    case "C6":
      return {
        source: "JKM care centre register and the licence on site",
        steps: ["Asked JKM for the care centre registration by name.", "Compared the certificate number with the one on display at the home."],
        exactQuery: legal,
        findings: "Certificate on display with a current date.",
        matches: ok,
        caveats: "JKM does not publish an online register.",
      };
    case "C7":
    default:
      return {
        source: `The organisation's website (${site})`,
        steps: ["Opened the financial reports page.", "Downloaded the latest audited accounts.", "Checked the auditor's opinion and the financial year end."],
        exactQuery: "annual report 2025",
        findings: profile.organisation.accounts || "Not public",
        matches: ok,
        caveats: "A condensed statement in an annual report is weaker than a full audit.",
      };
  }
}

function evidenceFor(profile: CauseProfile, claim: ClaimCode): { kind: EvidenceView["kind"]; title: string; note: string; url?: string }[] {
  const reg = profile.organisation.registration;
  const site = profile.contact.website;
  switch (claim) {
    case "C1":
      return [
        { kind: "document", title: "Registration certificate (personal data redacted)", note: reg ? `Shows registration number ${reg}.` : "Certificate supplied by the organisation." },
        { kind: "photo", title: "Register search result, screenshot", note: "Dated screenshot of the public register entry." },
      ];
    case "C2":
      return [{ kind: "document", title: "Annual return acknowledgement 2025", note: "Receipt from the register for the latest annual return." }];
    case "C3":
      return [
        { kind: "signature", title: "Signed wallet message", note: "Message signed by the payout wallet, published on the organisation's site.", url: site || undefined },
        { kind: "document", title: "Board resolution naming the payout wallet", note: "Signatures redacted." },
      ];
    case "C4":
      return [
        { kind: "link", title: "News coverage, last 12 months", note: "Independent report of current work.", url: profile.sources[1] ?? profile.sources[0] },
        { kind: "photo", title: "Site visit photos, dated", note: `${profile.location.town || profile.location.state}, with location and date.` },
      ];
    case "C5":
      return [{ kind: "document", title: "LHDN section 44(6) approval letter", note: profile.organisation.taxExemption.statement }];
    case "C6":
      return [{ kind: "photo", title: "Care centre licence on display", note: "Photo of the JKM certificate at the home." }];
    case "C7":
    default:
      return [{ kind: "link", title: "Audited accounts", note: profile.organisation.accounts, url: profile.organisation.accounts.match(/https?:\/\/\S+/)?.[0] }];
  }
}

const VOTE_REASONS: Record<VoteChoice, string[]> = {
  verified: [
    "Both paths agree and the register entry matches the profile.",
    "I repeated the search myself and got the same result.",
    "Signer matches the payout wallet. Resolution is dated.",
    "Two dated sources, both independent. Good enough.",
  ],
  not_verified: ["The legal name on the register differs from the profile.", "The recovered signer does not match."],
  needs_more: ["One path only cites the organisation's own site. Need an independent source.", "The annual return date is older than a year. Ask for the 2025 receipt."],
};

function needsFor(id: number, profile: CauseProfile, listedAt: string): HelpRequestView[] {
  const out: HelpRequestView[] = [];
  const rand = mulberry32(id * 17);
  const needsIntro = !profile.organisation.registration || !profile.contact.website;
  const base = (kind: HelpRequestView["kind"], n: number, title: string, detail: string): HelpRequestView => ({
    id: id * 10 + n,
    causeId: id,
    kind,
    title,
    detail,
    state: "open",
    open: true,
    postedAt: listedAt,
    helper: null,
    confirmedHelper: null,
    confirmedAt: null,
    closedAt: null,
    pledges: [],
  });
  if (needsIntro) out.push(base("intro", 1, `Introduce us to whoever runs ${profile.name}`, "We need a contact who can claim the listing and share the registration certificate."));
  if (profile.location.town) {
    const h = base("visit", 2, `Visit ${profile.location.town} and photograph the work`, "Dated photos with a location. This is one of the two sources needed for the 'work is real' check.");
    if (rand() < 0.3) {
      const helper = HELPERS[(id + 2) % HELPERS.length]!.wallet;
      h.state = "pledged";
      h.helper = helper;
      h.pledges = [{ helper, note: "I can visit this month.", at: ago(24 * 3) }];
    }
    out.push(h);
  }
  if (id % 3 === 0 || needsIntro) out.push(base("translate", 3, "Translate the profile into Bahasa Malaysia", "Summary, programmes and the organisation section. Keep names and numbers as they are."));
  return out.slice(0, 3);
}

function updatesFor(id: number, profile: CauseProfile, verifiedish: boolean, verified: boolean): CauseDetail["updates"] {
  const out: CauseDetail["updates"] = [];
  const mk = (n: number, kind: string, title: string, text: string, at: string, link?: string): CauseDetail["updates"][number] => ({
    id: `upd_${id}_${n}`,
    kind,
    uri: `data:application/json,${encodeURIComponent(JSON.stringify({ title, text }))}`,
    body: { title, text, ...(link ? { link } : {}) },
    at,
    txHash: fakeTx(id * 1000 + n),
  });
  if (verifiedish) out.push(mk(1, "report", "What your gifts paid for this quarter", profile.impact[0] ? `${profile.impact[0]}. Full breakdown in the attached report.` : "A short report on the quarter, with receipts.", ago(24 * (3 + (id % 9)))));
  if (profile.live?.note && /dusk|release|stream|live/i.test(profile.live.note)) out.push(mk(2, "stream", "Hatchling release this Saturday at dusk", "We will post the live link here an hour before. Gifts made during the stream show on screen.", ago(24 * (1 + (id % 4)))));
  if (verified) out.push(mk(3, "receipt", "Receipts for the last claim", "Supplier invoices for the items bought with the last claimed gifts. Personal data redacted.", ago(24 * (12 + (id % 5)))));
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

export function makeMedia(id: number, n: number, kind: MediaView["kind"], url: string, caption: string, credit: string, position: number, createdAt: string): MediaView {
  const embed = kind === "video" ? embedFor(url, { parent: "localhost" }) : null;
  return { id: `med_${id}_${n}`, causeId: id, kind, url, embedUrl: embed?.embedUrl, provider: embed?.provider, caption, credit, position, createdAt };
}

function mediaFor(id: number, profile: CauseProfile): MediaView[] {
  const base = ago(24 * 6);
  if (profile.slug === "kasih-turtle-conservation-project") {
    return [
      makeMedia(id, 1, "photo", "/photos/kasih-turtle-conservation-project.jpg", "Hatchlings in a basket before release", "Kasih Turtle Conservation Project", 0, base),
      makeMedia(id, 2, "photo", "/photos/hero.jpg", "A hatchling in a coconut shell", "Kasih Turtle Conservation Project", 1, base),
      makeMedia(id, 3, "video", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "Dusk release at Pantai Chendor", "", 2, ago(24 * 3)),
      makeMedia(id, 4, "video", "https://www.instagram.com/p/C1abcDEfGhi/", "Nest relocation, Instagram", "", 3, ago(24 * 2)),
      makeMedia(id, 5, "video", "https://www.tiktok.com/@kasih.turtle/video/7300000000000000000", "Counting the clutch, TikTok", "", 4, ago(24)),
    ];
  }
  if (profile.slug === "bsbcc") {
    return [
      makeMedia(id, 1, "photo", "/photos/bsbcc.jpg", "Sun bear in the forest enclosure", profile.image?.credit ?? "", 0, base),
      makeMedia(id, 2, "video", "https://www.youtube.com/watch?v=ysz5S6PUM-U", "Bear release, Sepilok", "", 1, ago(24 * 4)),
      makeMedia(id, 3, "video", "https://x.com/BSBCC_SunBear/status/1700000000000000000", "Feeding time, on X", "", 2, ago(24 * 2)),
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

export type MockRecord = RecordEntry & { causeId: number };

export interface MockWorld {
  causes: CauseDetail[];
  evidence: EvidenceView[];
  paths: PathView[];
  votes: VoteView[];
  challenges: Challenge[];
  record: MockRecord[];
  gifts: GiftView[];
  ledger: LedgerView[];
  /** Care XP events, queued for community.sera.cx. */
  xpEvents: XpEventView[];
  reputation: Map<string, number>;
  shares: Map<number, Record<string, number>>;
  /** Wallets the demo wallet's `pathsOpened` gate tracks per claim key. */
  pathsOpened: Set<string>;
  nextId: number;
}

export const claimKey = (causeId: number, claim: ClaimCode) => `${causeId}:${claim}`;
export const claimOf = (c: { claims: ClaimSummary[] }, code: ClaimCode): ClaimSummary => c.claims.find((k) => k.claimType === code)!;

/** Recomputes stage, checks, badges and evidence count from the claims and evidence. */
export function recompute(c: CauseDetail, evidence: readonly EvidenceView[]): void {
  const mine = evidence.filter((e) => e.causeId === c.id && !e.removedAt);
  c.evidenceCount = mine.length;
  for (const k of c.claims) k.evidenceCount = mine.filter((e) => e.claimType === k.claimType).length;
  const required = requiredClaimsFor({ requiresCareLicence: c.requiresCareLicence });
  for (const k of c.claims) k.required = required.includes(k.claimType);
  if (c.status === "listed" && required.every((code) => claimOf(c, code).outcome === "verified")) {
    c.status = "verified";
    c.verifiedAt = c.verifiedAt ?? new Date(NOW).toISOString();
  }
  const stage = causeStage({ status: c.status, requiresCareLicence: c.requiresCareLicence, evidenceCount: c.evidenceCount }, c.claims.map((k) => ({ claimType: k.claimType, outcome: k.outcome })));
  c.stage = stage.stage;
  c.stageLabel = stage.label;
  c.stageTone = stage.tone;
  c.checksDone = stage.done;
  c.checksTotal = stage.total;
  c.requiredClaims = required;
  c.badges = { taxExempt: claimOf(c, "C5").outcome === "verified", accountsPublished: claimOf(c, "C7").outcome === "verified" };
}

export function emptyClaim(causeId: number, claimType: ClaimCode, required: boolean): ClaimSummary {
  return { causeId, claimType, outcome: "open", epoch: 0, state: "open", votingStart: null, votingEnd: null, challengeWindowEnd: null, resultRoot: null, finalisedAt: null, required, evidenceCount: 0, pathCount: 0, independentChecks: 0, challenged: false };
}

export function buildWorld(): MockWorld {
  const evidence: EvidenceView[] = [];
  const paths: PathView[] = [];
  const votes: VoteView[] = [];
  const challenges: Challenge[] = [];
  const record: MockRecord[] = [];
  const gifts: GiftView[] = [];
  const ledger: LedgerView[] = [];
  const xpEvents: XpEventView[] = [];
  const reputation = new Map<string, number>();
  const shares = new Map<number, Record<string, number>>();
  let seq = 1000;
  const nextSeq = () => ++seq;
  const id = (prefix: string) => `${prefix}_${nextSeq()}`;
  for (const h of HELPERS) reputation.set(h.wallet, h.reputation);
  reputation.set(DEMO_WALLET, 3);

  const chain = (causeId: number, type: string, at: string, data: Record<string, unknown>, txSeed: number): void => {
    record.push({ causeId, at, source: "chain", type, data: { ...data, block: String(8 + (txSeed % 5000)), txHash: fakeTx(txSeed), logIndex: 0 } });
  };
  const api = (causeId: number, type: string, at: string, data: Record<string, unknown>): void => {
    record.push({ causeId, at, source: "api", type, data });
  };

  const causes: CauseDetail[] = SEED_PROFILES.map((profile, i) => {
    const causeId = i + 1;
    const rand = mulberry32(causeId * 7919);
    const sc = SCENARIOS[profile.slug] ?? {};
    const requiresCareLicence = CARE_LICENCE.has(profile.slug);
    const required = requiredClaimsFor({ requiresCareLicence });
    const listedDaysAgo = 12 + ((causeId * 37) % 75);
    const listedAt = ago(listedDaysAgo * 24);
    const owner: Address = causeId === 1 || causeId === 14 ? DEMO_WALLET : fakeAddress(900 + causeId);
    const payout: Address = owner;
    const depositAddress: Address = fakeAddress(7000 + causeId);

    chain(causeId, "CauseListed", listedAt, { by: owner, frontend: "causes.sera.cx", uri: `seed/causes/${profile.slug}.json`, category: profile.category.toLowerCase().replace(/[^a-z]+/g, "-").replace(/-+$/, "") }, causeId);
    if (requiresCareLicence) chain(causeId, "RequiresCareLicenceSet", listedAt, { on: true }, causeId * 11);
    chain(causeId, "Attested", listedAt, { attester: RESEARCH_WALLET, kind: "profile-check", uri: "data:application/json,...", body: { by: "Sera.cx research", checked: profile.profileCheckedOn, sources: profile.sources.length, note: "Profile compiled from the sources in the cause metadata. Documents not yet received from the charity." } }, causeId * 13);

    const verifiedSet = new Set(sc.verified ?? []);
    const votingSet = new Set(sc.voting ?? []);
    const checkingSet = new Set(sc.checking ?? []);
    let lastActivity = listedAt;

    const claims: ClaimSummary[] = CLAIMS.map((code, ci) => {
      const claim = emptyClaim(causeId, code, required.includes(code));

      const pushEvidence = (count: number, startHoursAgo: number) => {
        evidenceFor(profile, code)
          .slice(0, count)
          .forEach((it, k) => {
            const at = ago(startHoursAgo - k * 9);
            const uploader = k === 0 && (causeId === 1 || causeId === 14) ? DEMO_WALLET : HELPERS[(causeId + k) % HELPERS.length]!.wallet;
            const hash = fakeHash(causeId * 100 + ci * 10 + k);
            const ev: EvidenceView = {
              id: id("ev"),
              causeId,
              claimType: code,
              uploader,
              kind: it.kind,
              fileUrl: it.url ?? `${API_ORIGIN}/uploads/${hash.slice(2)}`,
              fileHash: hash,
              mime: it.kind === "document" ? "application/pdf" : it.kind === "photo" ? "image/jpeg" : null,
              size: it.kind === "link" ? null : 120_000 + k * 7_000,
              title: it.title,
              note: it.note,
              redactionConfirmed: true,
              createdAt: at,
              removedAt: null,
              removedReason: null,
            };
            evidence.push(ev);
            api(causeId, "EvidenceAdded", at, { ...ev });
            if (at > lastActivity) lastActivity = at;
          });
      };

      const pushPaths = (count: number, startHoursAgo: number, result: PathResult, epoch: number, agreed: boolean | null) => {
        for (let k = 0; k < count; k++) {
          const helper = HELPERS[(causeId * 3 + ci + k) % HELPERS.length]!;
          const at = ago(startHoursAgo - k * 14);
          const author = (causeId === 25 && code === "C1" && k === 0) || (causeId === 41 && code === "C1" && k === 1) || (causeId === 33 && code === "C2" && k === 0) ? DEMO_WALLET : helper.wallet;
          const body: PathBody = { ...pathText(profile, code, result), screenshotHash: fakeHash(causeId * 1000 + ci * 50 + k), checkedAt: at, result, conflictOfInterest: "None. I have no relationship with this organisation." };
          const p: PathView = { id: id("path"), causeId, claimType: code, epoch, author, body, contentHash: fakeHash(causeId * 3000 + ci * 70 + k), result, checkedAt: at, signature: fakeSig(causeId * 100 + ci * 10 + k), createdAt: at, outcomeAgreed: agreed };
          paths.push(p);
          api(causeId, "PathSigned", at, { ...p });
          if (at > lastActivity) lastActivity = at;
        }
      };

      const pushVotes = (count: number, startHoursAgo: number, mix: VoteChoice[], epoch: number, agreed: boolean | null) => {
        for (let k = 0; k < count; k++) {
          const helper = HELPERS[(causeId * 5 + k) % HELPERS.length]!;
          const choice = mix[k % mix.length]!;
          const reasons = VOTE_REASONS[choice];
          const at = ago(startHoursAgo - k * 6);
          const v: VoteView = { id: id("vote"), causeId, claimType: code, epoch, voter: helper.wallet, choice, reason: reasons[k % reasons.length]!, weight: voteWeight(helper.reputation), signedAt: secs(at), createdAt: at, outcomeAgreed: agreed };
          votes.push(v);
          api(causeId, "VoteSigned", at, { id: v.id, claimType: code, epoch, voter: v.voter, choice, weight: v.weight, createdAt: at });
          if (at > lastActivity) lastActivity = at;
        }
      };

      if (sc.paused) {
        // paused causes keep whatever was there: nothing yet
      } else if (verifiedSet.has(code)) {
        const base = (listedDaysAgo - 3) * 24;
        pushEvidence(2 + (ci % 2 === 0 ? 1 : 0), base);
        pushPaths(2 + ((causeId + ci) % 2 === 0 ? 1 : 0), base - 30, "verified", 0, true);
        pushVotes(4 + (causeId % 3), base - 80, ["verified", "verified", "verified", "needs_more", "verified", "verified"], 0, true);
        const votingStart = ago(base - 60);
        const votingEnd = ago(base - 80 - 48);
        const finalisedAt = ago(Math.max(6, base - 80 - 48 - 72));
        claim.outcome = "verified";
        claim.state = "final";
        claim.votingStart = votingStart;
        claim.votingEnd = votingEnd;
        claim.challengeWindowEnd = new Date(Date.parse(finalisedAt) + 72 * HOUR).toISOString();
        claim.resultRoot = fakeHash(causeId * 50 + ci);
        claim.finalisedAt = finalisedAt;
        chain(causeId, "ClaimFinalised", finalisedAt, { claim: code, outcome: "verified", resultRoot: claim.resultRoot, by: STEWARD_WALLET }, causeId * 7 + ci);
        if (finalisedAt > lastActivity) lastActivity = finalisedAt;
      } else if (votingSet.has(code)) {
        pushEvidence(2, 24 * 9);
        pushPaths(2 + (causeId % 2), 24 * 6, "verified", 0, null);
        const strong = causeId === 33; // hospis: quorum met and passed
        pushVotes(strong ? 5 : 3, 24 * 2, strong ? ["verified", "verified", "needs_more", "verified", "verified"] : ["verified", "needs_more", "verified"], 0, null);
        claim.state = "voting";
        claim.votingStart = ago(24 * 3);
        claim.votingEnd = ahead(24 * (VOTING.periodDays - 2) + 7);
      } else if (sc.challenged === code) {
        pushEvidence(2, 24 * 20);
        pushPaths(2, 24 * 17, "verified", 0, null);
        pushVotes(4, 24 * 12, ["verified", "verified", "verified", "verified"], 0, null);
        const challenger = HELPERS[8]!.wallet;
        const createdAt = ago(30);
        const chPath: PathBody = { ...pathText(profile, code, "not_verified"), screenshotHash: fakeHash(causeId * 1000 + 999), checkedAt: createdAt, result: "not_verified", conflictOfInterest: "None. I have no relationship with this organisation." };
        const ch: Challenge = {
          id: id("ch"),
          causeId,
          claimType: code,
          epoch: 0,
          challenger,
          stake: CHALLENGE_STAKE,
          contentHash: fakeHash(causeId * 4000 + 1),
          body: { statement: "The annual return shown is for 2023. The register lists the 2024 and 2025 returns as outstanding.", evidenceIds: [], path: chPath },
          signature: fakeSig(causeId * 400 + 1),
          state: "open",
          createdAt,
          resolvedAt: null,
        };
        challenges.push(ch);
        paths.push({ id: id("path"), causeId, claimType: code, epoch: 0, author: challenger, body: chPath, contentHash: fakeHash(causeId * 3000 + 999), result: "not_verified", checkedAt: createdAt, signature: fakeSig(causeId * 100 + 99), createdAt, outcomeAgreed: null });
        api(causeId, "ChallengeOpened", createdAt, { ...ch });
        claim.outcome = "verified";
        claim.state = "voting";
        claim.votingStart = createdAt;
        claim.votingEnd = ahead(24 * 4 + 18);
        claim.challengeWindowEnd = ahead(24 * 4 + 18);
        claim.challenged = true;
        if (createdAt > lastActivity) lastActivity = createdAt;
      } else if (checkingSet.has(code)) {
        pushEvidence(1 + (causeId % 2), 24 * (2 + (causeId % 6)));
        if ((causeId + ci) % 3 === 0) pushPaths(1, 24 * (1 + (causeId % 3)), "verified", 0, null);
      }

      const mine = paths.filter((p) => p.causeId === causeId && p.claimType === code && p.epoch === claim.epoch);
      claim.pathCount = mine.length;
      const byResult = new Map<string, Set<string>>();
      for (const p of mine) byResult.set(p.result, (byResult.get(p.result) ?? new Set()).add(p.author));
      claim.independentChecks = Math.max(0, ...[...byResult.values()].map((s) => s.size));
      claim.evidenceCount = evidence.filter((e) => e.causeId === causeId && e.claimType === code).length;
      return claim;
    });

    let status: CauseStatus = "listed";
    if (sc.paused) status = "suspended";
    else if (required.every((code) => claims.find((k) => k.claimType === code)!.outcome === "verified")) status = "verified";
    const verifiedAt = status === "verified" ? claims.find((k) => k.claimType === "C4")!.finalisedAt : null;
    if (status === "verified") chain(causeId, "StatusChanged", verifiedAt!, { status: "verified", by: STEWARD_WALLET, note: "all required claims verified" }, causeId * 17);

    const evidenceCount = evidence.filter((e) => e.causeId === causeId).length;
    const stage = causeStage({ status, requiresCareLicence, evidenceCount }, claims.map((k) => ({ claimType: k.claimType, outcome: k.outcome })));

    // Money
    let givenUsd = 0;
    if (stage.stage === "verified") givenUsd = 18_000 + Math.floor(rand() * 42_000);
    else if (stage.stage === "partly_verified") givenUsd = 2_500 + Math.floor(rand() * 12_000);
    else if (stage.stage === "evidence_in") givenUsd = 400 + Math.floor(rand() * 2_600);
    else if (stage.stage === "paused") givenUsd = 1_240;
    else givenUsd = rand() < 0.35 ? 0 : Math.floor(rand() * 420);
    if (causeId === 1) givenUsd = 180;
    if (profile.slug === URGENT.slug) givenUsd += 9_600;
    givenUsd = Math.round(givenUsd / 5) * 5;
    const giversCount = givenUsd === 0 ? 0 : Math.max(1, Math.round(givenUsd / (28 + rand() * 30)));

    const keeps = KEEPS[profile.slug];
    const wallet: WalletView = { address: depositAddress, delegated: false, treasuryMode: keeps ? "auto" : "manual", targetToken: keeps ? tokenBySymbol(keeps).address : null, privyWalletId: null };

    // Recent gifts for the record and the leaderboards
    const giftCount = Math.min(giversCount, 7);
    let lastGiftAt = listedAt;
    for (let k = 0; k < giftCount; k++) {
      const at = ago(6 + Math.floor(rand() * 24 * 20));
      const symbol = keeps ?? "USDT";
      const token = tokenBySymbol(symbol);
      const usd = [5, 10, 25, 50, 100][Math.floor(rand() * 5)]!;
      const sender = GIVER_WALLETS[(causeId * 3 + k * 5) % GIVER_WALLETS.length]!;
      const source = k % 3 === 0 ? "sera_swap" : "direct";
      const gsera = giftGsera(usd, { heat: profile.slug === URGENT.slug ? GSERA.heat.urgent : 1 });
      const g: GiftView = { id: id("gift"), causeId, sender, token: token.address, amount: toRaw(usd / usdPerUnit(symbol)), usd: usd.toFixed(2), source, txHash: fakeTx(seq), logIndex: 0, block: String(9000 + seq), tradeId: source === "sera_swap" ? `mock-${seq}` : null, kytState: "clear", ledgerNote: null, createdAt: at };
      gifts.push(g);
      chain(causeId, "GiftReceived", at, { giftId: g.id, sender, token: token.address, symbol, amount: g.amount, usd, source, gsera, ledgerNote: null }, seq);
      if (at > lastGiftAt) lastGiftAt = at;
    }

    const conversions: ConversionView[] = [];
    if (givenUsd > 5000 && keeps) {
      const at = ago(24 * (8 + (causeId % 5)));
      const from = tokenBySymbol("USDC");
      const to = tokenBySymbol(keeps);
      conversions.push({ id: id("conv"), causeId, fromToken: from.address, toToken: to.address, amountIn: toRaw(400), amountOut: toRaw((400 / usdPerUnit(keeps)) * 0.999), tradeId: `mock-conv-${causeId}`, state: "settled", txHash: fakeTx(causeId * 91), triggeredBy: "auto", createdAt: at, settledAt: at });
      chain(causeId, "ConversionSettled", at, { conversionId: conversions[0]!.id, token: to.address, symbol: keeps, amount: conversions[0]!.amountOut }, causeId * 91);
    }
    const withdrawals: WithdrawalView[] = [];
    if (givenUsd > 8000) {
      const at = ago(24 * (3 + (causeId % 4)));
      withdrawals.push({ id: id("wd"), causeId, token: tokenBySymbol("USDT").address, amount: toRaw(Math.round(givenUsd * 0.3)), to: fakeAddress(8000 + causeId), txHash: fakeTx(causeId * 97), note: "Quarterly programme spend", createdAt: at });
    }

    const media = mediaFor(causeId, profile);
    const updates = updatesFor(causeId, profile, stage.stage === "verified" || stage.stage === "partly_verified", stage.stage === "verified");
    for (const u of updates) chain(causeId, "ProgressPosted", u.at, { kind: u.kind, uri: u.uri, body: u.body }, seq + Number(u.id.split("_").at(-1)));
    const helpRequests = needsFor(causeId, profile, listedAt);
    helpRequests.forEach((h, k) => chain(causeId, "NeedPosted", ago(24 * (listedDaysAgo - 2) - k * 3), { needId: h.id, uri: "data:application/json,...", kind: h.kind, title: h.title, detail: h.detail }, h.id));

    // Concerns and attestations
    const attestations: CauseDetail["attestations"] = [
      { id: id("att"), attester: RESEARCH_WALLET, kind: "profile-check", uri: "data:application/json,...", body: { by: "Sera.cx research", checked: profile.profileCheckedOn, sources: profile.sources.length }, at: listedAt, txHash: fakeTx(causeId * 13) },
    ];
    const concerns: Concern[] = [];
    const attest = SEED_ATTEST[profile.slug];
    let pausedReason: string | null = null;
    if (attest) {
      const at = ago(24 * 2);
      attestations.push({ id: id("att"), attester: RESEARCH_WALLET, kind: attest.kind, uri: "data:application/json,...", body: { by: "Sera.cx research", text: attest.text }, at, txHash: fakeTx(causeId * 19) });
      chain(causeId, "Attested", at, { attester: RESEARCH_WALLET, kind: attest.kind, uri: "data:application/json,...", body: { by: "Sera.cx research", text: attest.text } }, causeId * 19);
      if (["concern", "note", "open-question"].includes(attest.kind)) concerns.push({ kind: attest.kind, text: attest.text, at, by: RESEARCH_WALLET });
    }
    if (sc.paused) {
      pausedReason = attest?.text ?? "Paused by a steward pending registration details.";
      const at = ago(24 * 5);
      concerns.unshift({ kind: "steward-note", text: `Paused by a steward: ${pausedReason}`, at, by: STEWARD_WALLET });
      chain(causeId, "StatusChanged", at, { status: "suspended", by: STEWARD_WALLET, note: pausedReason }, causeId * 53);
    }

    const showOnHomepage = HOMEPAGE_ON.has(profile.slug);
    shares.set(causeId, { whatsapp: Math.floor(rand() * 40), telegram: Math.floor(rand() * 12), x: Math.floor(rand() * 15), facebook: Math.floor(rand() * 20), copy: Math.floor(rand() * 30), embed: Math.floor(rand() * 4) });

    const lastActivityAt = [lastActivity, lastGiftAt, updates[0]?.at ?? listedAt].sort().at(-1)!;
    const photoFile = profile.image?.src ? profile.image.src.split("/").pop()! : null;

    const cause: CauseDetail = {
      id: causeId,
      chainId: CHAIN_ID,
      slug: profile.slug,
      name: profile.name,
      owner,
      payout,
      lister: owner,
      category: profile.category.toLowerCase().replace(/[^a-z]+/g, "-").replace(/-+$/, ""),
      uri: `seed/causes/${profile.slug}.json`,
      status,
      stage: stage.stage,
      stageLabel: stage.label,
      stageTone: stage.tone,
      checksDone: stage.done,
      checksTotal: stage.total,
      listedAt,
      waitingSince: listedAt,
      verifiedAt,
      requiresCareLicence,
      listedVia: "causes.sera.cx",
      profile,
      photoUrl: photoFile ? `/photos/${photoFile}` : null,
      givenUsd: givenUsd.toFixed(2),
      giversCount,
      depositAddress,
      treasuryMode: wallet.treasuryMode,
      mediaCount: media.length,
      requiredClaims: required,
      claims,
      badges: { taxExempt: claims.find((k) => k.claimType === "C5")!.outcome === "verified", accountsPublished: claims.find((k) => k.claimType === "C7")!.outcome === "verified" },
      evidenceCount,
      showOnHomepage,
      homepageHiddenReason: null,
      urgent: profile.slug === URGENT.slug ? { id: "appeal_1", reason: URGENT.reason, setBy: STEWARD_WALLET, since: ago(40), endsAt: null } : null,
      lastActivityAt,
      shareUrl: `${API_ORIGIN}/c/${causeId}-${profile.slug}`,
      ogImageUrl: `${API_ORIGIN}/api/v1/og/cause/${causeId}.png`,
      posterUrl: `${API_ORIGIN}/api/v1/causes/${causeId}/poster.pdf`,
      embedUrl: `${API_ORIGIN}/api/v1/embed/give/${causeId}`,
      createdAt: listedAt,
      updatedAt: lastActivityAt,
      acceptedTokens: [...MOCK_STABLECOINS],
      helpRequests,
      updates,
      attestations,
      concerns,
      pausedReason,
      homepageHiddenBy: null,
      wallet,
      media,
      recentGifts: [],
      conversions,
      withdrawals,
    };
    cause.recentGifts = gifts.filter((g) => g.causeId === causeId).map((g) => ({ ...g, sender: `${g.sender.slice(0, 6)}…${g.sender.slice(-4)}` }));
    if (cause.urgent) api(causeId, "UrgentAppealSet", cause.urgent.since, { id: cause.urgent.id, reason: cause.urgent.reason, setBy: STEWARD_WALLET, endsAt: null, label: "Urgent appeal, chosen by Sera.cx" });
    return cause;
  });

  seedDemoWallet(causes, gifts, ledger, xpEvents, paths, votes, nextSeq);

  return { causes, evidence, paths, votes, challenges, record, gifts, ledger, xpEvents, reputation, shares, pathsOpened: new Set(), nextId: seq + 1 };
}

/** The demo wallet's own history: two gifts, a swap, a held vote, three agreed paths. */
function seedDemoWallet(causes: CauseDetail[], gifts: GiftView[], ledger: LedgerView[], xpEvents: XpEventView[], paths: PathView[], votes: VoteView[], nextSeq: () => number): void {
  const mercy = causes.find((c) => c.slug === "mercy-malaysia")!;
  const hospis = causes.find((c) => c.slug === "hospis-malaysia")!;
  const wwf = causes.find((c) => c.slug === "wwf-malaysia")!;
  const multipliers = { volumeTier: 1.2, streak: 1.1 };
  const g1At = ago(24 * 12);
  const g2At = ago(24 * 40);
  const g1 = giftGsera(50, { heat: GSERA.heat.urgent, ...multipliers });
  const g2 = giftGsera(25, { heat: 1, ...multipliers });
  const usdt = tokenBySymbol("USDT");
  const xsgd = tokenBySymbol("XSGD");
  const gift1: GiftView = { id: `gift_${nextSeq()}`, causeId: mercy.id, sender: DEMO_WALLET, token: usdt.address, amount: toRaw(50), usd: "50.00", source: "site", txHash: fakeTx(777), logIndex: 0, block: "9777", tradeId: null, kytState: "clear", ledgerNote: null, createdAt: g1At };
  const gift2: GiftView = { id: `gift_${nextSeq()}`, causeId: hospis.id, sender: DEMO_WALLET, token: xsgd.address, amount: toRaw(34), usd: "25.00", source: "sera_swap", txHash: fakeTx(778), logIndex: 0, block: "9778", tradeId: "mock-778", kytState: "clear", ledgerNote: null, createdAt: g2At };
  gifts.push(gift1, gift2);
  mercy.recentGifts.unshift({ ...gift1, sender: `${DEMO_WALLET.slice(0, 6)}…${DEMO_WALLET.slice(-4)}` });
  hospis.recentGifts.unshift({ ...gift2, sender: `${DEMO_WALLET.slice(0, 6)}…${DEMO_WALLET.slice(-4)}` });

  const entry = (amount: number, reason: LedgerView["reason"], sourceTag: LedgerView["sourceTag"], sourceRef: string, causeId: number | null, state: LedgerView["state"], createdAt: string, m?: LedgerView["multipliers"]): LedgerView => ({
    id: `led_${nextSeq()}`,
    wallet: DEMO_WALLET,
    amount,
    reason,
    sourceTag,
    sourceRef,
    causeId,
    multipliers: m ?? null,
    state,
    gseraRef: state === "credited" ? `grt_${nextSeq()}` : null,
    createdAt,
  });
  ledger.push(entry(8_800, "gift", "trading", "season-1-swaps", null, "credited", ago(24 * 70)));
  // Helping earns Care XP on community.sera.cx, never gSera (docs/PLAN.md section 7).
  const xpEvent = (eventType: XpEventType, sourceRef: string, causeId: number | null, createdAt: string): XpEventView => ({
    id: `xp_${nextSeq()}`,
    wallet: DEMO_WALLET,
    eventType,
    label: XP[eventType].label,
    xp: XP[eventType].amount,
    sourceRef,
    causeId,
    proofUrl: causeId === null ? null : `/c/${causeId}`,
    state: "queued",
    createdAt,
    sentAt: null,
  });
  for (const p of paths.filter((p) => p.author === DEMO_WALLET)) xpEvents.push(xpEvent("care_path_agreed", p.id, p.causeId, p.createdAt));
  ledger.push(entry(g1, "gift", "charity", gift1.id, mercy.id, "credited", g1At, { heat: GSERA.heat.urgent, volumeTier: multipliers.volumeTier, streak: multipliers.streak, compound: GSERA.heat.urgent * multipliers.volumeTier * multipliers.streak }));
  ledger.push(entry(g2, "gift", "charity", gift2.id, hospis.id, "credited", g2At, { heat: 1, volumeTier: multipliers.volumeTier, streak: multipliers.streak, compound: multipliers.volumeTier * multipliers.streak }));

  // A vote on WWF C4 (open for votes), reward held until the claim is final.
  const vAt = ago(24 * 2);
  const vote: VoteView = { id: `vote_${nextSeq()}`, causeId: wwf.id, claimType: "C4", epoch: 0, voter: DEMO_WALLET, choice: "verified", reason: "I repeated the search myself and got the same result.", weight: voteWeight(3), signedAt: secs(vAt), createdAt: vAt, outcomeAgreed: null };
  votes.push(vote);
  ledger.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
