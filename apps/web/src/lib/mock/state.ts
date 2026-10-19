/**
 * Deterministic mock world built from the seed. Same input, same output,
 * except that timestamps are relative to the moment the module loads so
 * countdowns and "x days ago" read naturally.
 */
import { CHALLENGE_STAKE, CLAIMS, CLAIM_INFO, GSERA, VOTING, type ClaimCode } from "../constants";
import { giftGsera, requiredClaimsFor, voteWeight } from "../rules";
import type {
  Cause,
  CauseProfile,
  CauseStage,
  CauseUpdate,
  Challenge,
  ClaimEvent,
  ClaimState,
  ClaimSummary,
  Concern,
  Contribution,
  Evidence,
  Gift,
  HelpRequest,
  LedgerEntry,
  Me,
  MediaItem,
  RecordEvent,
  Treasury,
  VerificationPath,
  Vote,
} from "../types";
import { SEED_ATTEST, SEED_PROFILES } from "./seed";

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------

export const NOW = Date.now();
const HOUR = 3_600_000;
export const ago = (hours: number) => new Date(NOW - hours * HOUR).toISOString();
export const ahead = (hours: number) => new Date(NOW + hours * HOUR).toISOString();

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

export function fakeTx(seed: number): string {
  return `0x${hex(mulberry32(seed * 101 + 7), 64)}`;
}
export function fakeHash(seed: number): string {
  return `0x${hex(mulberry32(seed * 313 + 11), 64)}`;
}

// ---------------------------------------------------------------------------
// Wallets
// ---------------------------------------------------------------------------

export const DEMO_WALLET = "0x5e7a11c0de5e7a11c0de5e7a11c0de5e7a11c0de";
export const STEWARD_WALLET = "0x57e3a7d0000000000000000000000000000000a1";

export interface Helper {
  wallet: string;
  reputation: number;
  acceptedPaths: number;
  helpFulfilled: number;
  /** Paths accepted in the last 30 days. */
  recentPaths: number;
}

const HELPER_SEEDS: [string, number, number, number, number][] = [
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

export const HELPERS: Helper[] = HELPER_SEEDS.map(([wallet, reputation, acceptedPaths, helpFulfilled, recentPaths]) => ({
  wallet,
  reputation,
  acceptedPaths,
  helpFulfilled,
  recentPaths,
}));

const GIVER_WALLETS: string[] = Array.from({ length: 18 }, (_, i) => `0x${hex(mulberry32(5000 + i), 40)}`);

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

const CARE_LICENCE = new Set([
  "rumah-kids",
  "shelter-home-for-children",
  "ps-the-children",
  "orphancare-foundation",
  "peace-harmony-home-penang",
]);

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

const URGENT = { slug: "mercy-malaysia", reason: "Flood relief, Kelantan" };

const TOKENS: Record<string, string[]> = {
  "kasih-turtle-conservation-project": ["MYRT"],
  "juara-turtle-project": ["MYRT"],
  "kudat-turtle-conservation-society": ["MYRT"],
  "hope-jb": ["MYRT"],
  "furrykids-safehaven": ["MYRT", "USDT"],
  "peace-harmony-home-penang": ["MYRT"],
  "mercy-malaysia": ["USDT", "USDC", "MYRT"],
  "kechara-soup-kitchen": ["USDT", "MYRT"],
  "wwf-malaysia": ["USDT", "USDC", "XSGD"],
  "make-a-wish-malaysia": ["USDT", "USDC", "XSGD"],
  "teach-for-malaysia": ["USDT", "USDC", "XSGD"],
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

function pathText(profile: CauseProfile, claim: ClaimCode, result: VerificationPath["result"]) {
  const reg = profile.organisation.registration || profile.name;
  const legal = profile.legalName || profile.name;
  const site = profile.contact.website || profile.contact.socials?.instagram || "the organisation's own channels";
  const register = registerFor(profile);
  const news = profile.sources.find((s) => /nst|star|malay|bernama|free|sun|news|edge/i.test(s)) ?? profile.sources[0] ?? site;
  switch (claim) {
    case "C1":
      return {
        source: `${register.name} public search (${register.tool})`,
        steps: [`Opened the ${register.tool}.`, `Searched the registration number "${reg}".`, "Opened the result and compared it with the cause profile."],
        exactSearch: reg,
        found: result === "verified"
          ? `Name: ${legal}. Status: active. State: ${profile.location.state}.`
          : `No result for "${reg}". A name search returned entries that do not match the profile.`,
        matches: result === "verified" ? "Yes: legal name and number match the cause profile" : "No: could not match the profile to a register entry",
        caveats: "The register does not show office-bearers publicly.",
      };
    case "C2":
      return {
        source: `${register.name} annual return status`,
        steps: [`Opened the ${register.tool}.`, `Searched "${reg}".`, "Checked the latest annual return year and the status line."],
        exactSearch: reg,
        found: result === "verified" ? "Status: active. Latest annual return accepted for 2025." : "Status line shows the latest accepted return as 2023. Could not confirm 2024 or 2025.",
        matches: result === "verified" ? "Yes: active status shown" : "Not yet: status is older than 12 months",
        caveats: "Annual return acceptance can lag by a few months.",
      };
    case "C3":
      return {
        source: `Signature check on-chain and the organisation's website (${site})`,
        steps: ["Opened the payout wallet address on the registry.", `Found the signed message on ${site}.`, "Recovered the signer with an EIP-191 check and compared it with the payout wallet.", "Read the board resolution PDF for the same address."],
        exactSearch: "0x…payout address, pasted from the registry",
        found: result === "verified" ? "Signer matches the payout wallet. Resolution dated and signed by two office-bearers." : "The signed message is on the site but the recovered signer does not match the payout wallet.",
        matches: result === "verified" ? "Yes: signer and payout wallet match" : "No: signer differs",
        caveats: "A board resolution is not independently verifiable without the register.",
      };
    case "C4":
      return {
        source: `News archive and the organisation's own channels (${news})`,
        steps: ["Searched the organisation name in news from the last 12 months.", `Opened ${news}.`, "Cross-checked dates and places against the organisation's Instagram posts."],
        exactSearch: `"${profile.name}" 2026`,
        found: result === "verified" ? "Two independent dated sources from the last 12 months describe current programmes." : "Only one dated source from the last 12 months. A second independent source is still missing.",
        matches: result === "verified" ? "Yes: programmes match the profile" : "Partly: one source only",
        caveats: "Photos on social media carry no location data.",
      };
    case "C5":
      return {
        source: "LHDN Semakan Kelulusan Derma search",
        steps: ["Opened the LHDN search.", `Searched "${legal}".`, "Compared the approval reference and validity period with the profile."],
        exactSearch: legal,
        found: profile.organisation.taxExemption.statement || "No entry found",
        matches: result === "verified" ? "Yes: reference and period match" : "Could not match a reference",
        caveats: "LHDN shows the period of approval, not the date of the latest audit.",
      };
    case "C6":
      return {
        source: "JKM care centre register and the licence on site",
        steps: ["Asked JKM for the care centre registration by name.", "Compared the certificate number with the one on display at the home."],
        exactSearch: legal,
        found: "Certificate on display with a current date.",
        matches: result === "verified" ? "Yes" : "Could not check",
        caveats: "JKM does not publish an online register.",
      };
    case "C7":
    default:
      return {
        source: `The organisation's website (${site})`,
        steps: ["Opened the financial reports page.", "Downloaded the latest audited accounts.", "Checked the auditor's opinion and the financial year end."],
        exactSearch: "annual report 2025",
        found: profile.organisation.accounts || "Not public",
        matches: result === "verified" ? "Yes: audited accounts within 2 years" : "No: accounts not published",
        caveats: "A condensed statement in an annual report is weaker than a full audit.",
      };
  }
}

function evidenceFor(profile: CauseProfile, claim: ClaimCode): { kind: Evidence["kind"]; title: string; note: string; url?: string }[] {
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

const VOTE_REASONS: Record<Vote["choice"], string[]> = {
  verified: [
    "Both paths agree and the register entry matches the profile.",
    "I repeated the search myself and got the same result.",
    "Signer matches the payout wallet. Resolution is dated.",
    "Two dated sources, both independent. Good enough.",
  ],
  not_verified: ["The legal name on the register differs from the profile.", "The recovered signer does not match."],
  needs_more: ["One path only cites the organisation's own site. Need an independent source.", "The annual return date is older than a year. Ask for the 2025 receipt."],
};

const HELP_REWARD = GSERA.helper.helpFulfilled;

function helpFor(id: number, profile: CauseProfile): HelpRequest[] {
  const out: HelpRequest[] = [];
  const rand = mulberry32(id * 17);
  const needsIntro = !profile.organisation.registration || !profile.contact.website;
  if (needsIntro) {
    out.push({
      id: id * 10 + 1,
      causeId: id,
      kind: "intro",
      title: `Introduce us to whoever runs ${profile.name}`,
      detail: "We need a contact who can claim the listing and share the registration certificate.",
      state: "open",
      rewardGsera: HELP_REWARD,
    });
  }
  if (profile.location.town) {
    out.push({
      id: id * 10 + 2,
      causeId: id,
      kind: "visit",
      title: `Visit ${profile.location.town} and photograph the work`,
      detail: "Dated photos with a location. This is one of the two sources needed for the 'work is real' check.",
      state: rand() < 0.3 ? "pledged" : "open",
      rewardGsera: HELP_REWARD,
      pledgedBy: undefined,
    });
  }
  if (id % 3 === 0 || needsIntro) {
    out.push({
      id: id * 10 + 3,
      causeId: id,
      kind: "translate",
      title: "Translate the profile into Bahasa Malaysia",
      detail: "Summary, programmes and the organisation section. Keep names and numbers as they are.",
      state: "open",
      rewardGsera: HELP_REWARD,
    });
  }
  return out.slice(0, 3).map((h) => (h.state === "pledged" ? { ...h, pledgedBy: HELPERS[(id + 2) % HELPERS.length]!.wallet } : h));
}

function updatesFor(id: number, profile: CauseProfile, stage: CauseStage): CauseUpdate[] {
  const out: CauseUpdate[] = [];
  if (stage === "verified" || stage === "partly_verified") {
    out.push({
      id: id * 10 + 1,
      causeId: id,
      kind: "report",
      title: "What your gifts paid for this quarter",
      body: profile.impact[0] ? `${profile.impact[0]}. Full breakdown in the attached report.` : "A short report on the quarter, with receipts.",
      at: ago(24 * (3 + (id % 9))),
    });
  }
  if (profile.live?.note && /dusk|release|stream|live/i.test(profile.live.note)) {
    out.push({
      id: id * 10 + 2,
      causeId: id,
      kind: "stream",
      title: "Hatchling release this Saturday at dusk",
      body: "We will post the live link here an hour before. Gifts made during the stream show on screen.",
      at: ago(24 * (1 + (id % 4))),
    });
  }
  if (stage === "verified") {
    out.push({
      id: id * 10 + 3,
      causeId: id,
      kind: "receipt",
      title: "Receipts for the last claim",
      body: "Supplier invoices for the items bought with the last claimed gifts. Personal data redacted.",
      at: ago(24 * (12 + (id % 5))),
    });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

function mediaFor(id: number, profile: CauseProfile): MediaItem[] {
  const base = ago(24 * 6);
  if (profile.slug === "kasih-turtle-conservation-project") {
    return [
      { id: id * 100 + 1, kind: "photo", url: "/photos/kasih-turtle-conservation-project.jpg", title: "Hatchlings in a basket before release", alt: "Green turtle hatchlings in a basket before release", credit: "Kasih Turtle Conservation Project", addedAt: base },
      { id: id * 100 + 2, kind: "photo", url: "/photos/hero.jpg", title: "A hatchling in a coconut shell", alt: "Green turtle hatchling resting in a coconut shell", credit: "Kasih Turtle Conservation Project", addedAt: base },
      { id: id * 100 + 3, kind: "video", provider: "youtube", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Dusk release at Pantai Chendor", addedAt: ago(24 * 3) },
      { id: id * 100 + 4, kind: "video", provider: "instagram", url: "https://www.instagram.com/kasih.turtle/", title: "Nest relocation, Instagram", addedAt: ago(24 * 2) },
      { id: id * 100 + 5, kind: "video", provider: "tiktok", url: "https://www.tiktok.com/@kasih.turtle/video/7300000000000000000", title: "Counting the clutch, TikTok", addedAt: ago(24) },
    ];
  }
  if (profile.slug === "bsbcc") {
    return [
      { id: id * 100 + 1, kind: "photo", url: "/photos/bsbcc.jpg", title: "Sun bear in the forest enclosure", alt: profile.image?.alt ?? "Sun bear", credit: profile.image?.credit, addedAt: base },
      { id: id * 100 + 2, kind: "video", provider: "youtube", url: "https://www.youtube.com/watch?v=ysz5S6PUM-U", title: "Bear release, Sepilok", addedAt: ago(24 * 4) },
      { id: id * 100 + 3, kind: "video", provider: "x", url: "https://x.com/BSBCC_SunBear/status/1700000000000000000", title: "Feeding time, on X", addedAt: ago(24 * 2) },
    ];
  }
  return [];
}

function treasuryFor(id: number, givenUsd: number, heldUsd: number, rand: () => number): Treasury {
  const depositAddress = `0x${hex(mulberry32(7000 + id), 40)}`;
  const balances: Treasury["balances"] = [];
  if (heldUsd > 0) {
    const usdt = Math.round(heldUsd * (0.45 + rand() * 0.2));
    const usdc = Math.round(heldUsd * (0.15 + rand() * 0.15));
    const myrUsd = Math.max(0, heldUsd - usdt - usdc);
    balances.push({ token: "USDT", amount: usdt, usd: usdt });
    balances.push({ token: "USDC", amount: usdc, usd: usdc });
    balances.push({ token: "MYRT", amount: Math.round(myrUsd / 0.235), usd: myrUsd });
  }
  const conversions: Treasury["conversions"] = [];
  if (givenUsd > 5000) {
    const at = ago(24 * (8 + (id % 5)));
    conversions.push({ id: id * 100 + 9, fromToken: "USDC", toToken: "MYRT", amountIn: 400, amountOut: Math.round(400 / 0.235 * 0.9985), rate: Math.round((1 / 0.235) * 0.9985 * 10000) / 10000, at, txHash: fakeTx(id * 91), reason: "manual" });
  }
  const withdrawals: Treasury["withdrawals"] = [];
  if (givenUsd > 8000) {
    const at = ago(24 * (3 + (id % 4)));
    withdrawals.push({ id: id * 100 + 8, token: "USDT", amount: Math.round(givenUsd * 0.3), to: `0x${hex(mulberry32(8000 + id), 40)}`, at, txHash: fakeTx(id * 97) });
  }
  return { depositAddress, balances, policy: id % 3 === 0 ? "auto" : "hold", autoToken: "USDT", conversions, withdrawals };
}

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

export interface MockWorld {
  causes: Cause[];
  evidence: Evidence[];
  paths: VerificationPath[];
  votes: Map<string, Vote[]>;
  challenges: Challenge[];
  events: RecordEvent[];
  claimHistory: Map<string, ClaimEvent[]>;
  gifts: Gift[];
  me: Me;
  shares: Map<number, Record<string, number>>;
  nextId: number;
  pathsOpened: Set<string>;
}

export const claimKey = (causeId: number, claim: ClaimCode) => `${causeId}:${claim}`;

export function buildWorld(): MockWorld {
  const evidence: Evidence[] = [];
  const paths: VerificationPath[] = [];
  const votes = new Map<string, Vote[]>();
  const challenges: Challenge[] = [];
  const events: RecordEvent[] = [];
  const claimHistory = new Map<string, ClaimEvent[]>();
  const gifts: Gift[] = [];
  const shares = new Map<number, Record<string, number>>();
  let seq = 1000;
  const nextSeq = () => ++seq;

  const addEvent = (e: Omit<RecordEvent, "id">) => events.push({ id: nextSeq(), ...e });
  const addHistory = (key: string, e: Omit<ClaimEvent, "id">) => {
    const list = claimHistory.get(key) ?? [];
    list.push({ id: nextSeq(), ...e });
    claimHistory.set(key, list);
  };

  const causes: Cause[] = SEED_PROFILES.map((profile, i) => {
    const id = i + 1;
    const rand = mulberry32(id * 7919);
    const sc = SCENARIOS[profile.slug] ?? {};
    const requiresCareLicence = CARE_LICENCE.has(profile.slug);
    const required = requiredClaimsFor(requiresCareLicence);
    const listedDaysAgo = 12 + ((id * 37) % 75);
    const listedAt = ago(listedDaysAgo * 24);
    const owner = id === 1 || id === 14 ? DEMO_WALLET : `0x${hex(mulberry32(900 + id), 40)}`;
    const hasPayout = !!(sc.verified?.includes("C3") || sc.voting?.includes("C3") || sc.checking?.includes("C3") || rand() < 0.5);
    const payout = hasPayout ? `0x${hex(mulberry32(1900 + id), 40)}` : null;

    addEvent({ causeId: id, type: "listed", at: listedAt, txHash: fakeTx(id), summary: `Listed by ${owner === DEMO_WALLET ? "you" : "a lister"}`, by: owner });

    const verifiedSet = new Set(sc.verified ?? []);
    const votingSet = new Set(sc.voting ?? []);
    const checkingSet = new Set(sc.checking ?? []);
    const claims = {} as Record<ClaimCode, ClaimSummary>;
    let lastClaimActivity = listedAt;

    CLAIMS.forEach((code, ci) => {
      const key = claimKey(id, code);
      const isRequired = required.includes(code);
      let outcome: ClaimSummary["outcome"] = "open";
      let state: ClaimState = "open";
      let votingEnd: string | undefined;
      let challengeWindowEnd: string | undefined;
      let finalisedAt: string | undefined;
      let challenged = false;
      const openedAt = ago((listedDaysAgo - 1) * 24 - ci * 5);
      addHistory(key, { type: "opened", at: openedAt, summary: "Claim opened with the listing" });

      const pushEvidence = (count: number, startHoursAgo: number) => {
        const items = evidenceFor(profile, code).slice(0, count);
        items.forEach((it, k) => {
          const at = ago(startHoursAgo - k * 9);
          const uploader = k === 0 && (id === 1 || id === 14) ? DEMO_WALLET : HELPERS[(id + k) % HELPERS.length]!.wallet;
          const ev: Evidence = { id: nextSeq(), causeId: id, claim: code, kind: it.kind, title: it.title, note: it.note, uploader, hash: fakeHash(id * 100 + ci * 10 + k), url: it.url, createdAt: at };
          evidence.push(ev);
          addEvent({ causeId: id, type: "evidence", at, txHash: fakeTx(ev.id), summary: `Evidence for ${code}: ${it.title}`, by: uploader });
          addHistory(key, { type: "evidence", at, summary: `Evidence uploaded: ${it.title}`, by: uploader });
          if (at > lastClaimActivity) lastClaimActivity = at;
        });
      };

      const pushPaths = (count: number, startHoursAgo: number, result: VerificationPath["result"], agreed?: boolean) => {
        for (let k = 0; k < count; k++) {
          const helper = HELPERS[(id * 3 + ci + k) % HELPERS.length]!;
          const at = ago(startHoursAgo - k * 14);
          const t = pathText(profile, code, result);
          const author = (id === 25 && code === "C1" && k === 0) || (id === 41 && code === "C1" && k === 1) || (id === 33 && code === "C2" && k === 0) ? DEMO_WALLET : helper.wallet;
          const p: VerificationPath = {
            id: nextSeq(),
            causeId: id,
            claim: code,
            epoch: 0,
            author,
            authorReputation: author === DEMO_WALLET ? 3 : helper.reputation,
            ...t,
            screenshotHash: fakeHash(id * 1000 + ci * 50 + k),
            checkedAt: at,
            result,
            conflict: "None. I have no relationship with this organisation.",
            outcomeAgreed: agreed,
          };
          paths.push(p);
          addEvent({ causeId: id, type: "path", at, summary: `Verification path for ${code} (${result.replace("_", " ")})`, by: author });
          addHistory(key, { type: "path", at, summary: `Path added, result: ${result.replace("_", " ")}`, by: author });
          if (at > lastClaimActivity) lastClaimActivity = at;
        }
      };

      const pushVotes = (count: number, startHoursAgo: number, mix: Vote["choice"][]) => {
        const list: Vote[] = [];
        for (let k = 0; k < count; k++) {
          const helper = HELPERS[(id * 5 + k) % HELPERS.length]!;
          const choice = mix[k % mix.length]!;
          const reasons = VOTE_REASONS[choice];
          const at = ago(startHoursAgo - k * 6);
          list.push({ id: nextSeq(), voter: helper.wallet, choice, reason: reasons[k % reasons.length]!, weight: voteWeight(helper.reputation), signedAt: at });
          addHistory(key, { type: "vote", at, summary: `Vote: ${choice.replace("_", " ")}`, by: helper.wallet });
          if (at > lastClaimActivity) lastClaimActivity = at;
        }
        votes.set(key, list);
      };

      if (sc.paused) {
        // paused causes keep whatever was there: nothing yet
      } else if (verifiedSet.has(code)) {
        const base = (listedDaysAgo - 3) * 24;
        pushEvidence(2 + (ci % 2 === 0 ? 1 : 0), base);
        pushPaths(2 + (k2(id, ci) ? 1 : 0), base - 30, "verified", true);
        const voteCount = 4 + (id % 3);
        pushVotes(voteCount, base - 80, ["verified", "verified", "verified", "needs_more", "verified", "verified"]);
        const vEnd = ago(base - 80 - 48);
        addHistory(key, { type: "voting_opened", at: ago(base - 60), summary: "Voting opened: two independent paths" });
        addHistory(key, { type: "passed", at: vEnd, summary: "Voting passed. 72 hour challenge window opened" });
        finalisedAt = ago(Math.max(6, base - 80 - 48 - 72));
        addHistory(key, { type: "final", at: finalisedAt, summary: "Finalised by stewards (advisory mode). Result committed on-chain", by: STEWARD_WALLET });
        addEvent({ causeId: id, type: "result", at: finalisedAt, txHash: fakeTx(id * 7 + ci), summary: `${code} verified: ${CLAIM_INFO[code].label}`, by: STEWARD_WALLET });
        outcome = "verified";
        state = "final";
        if (finalisedAt > lastClaimActivity) lastClaimActivity = finalisedAt;
      } else if (votingSet.has(code)) {
        pushEvidence(2, 24 * 9);
        pushPaths(2 + (id % 2), 24 * 6, "verified");
        const strong = id === 33; // hospis: quorum met and passed
        pushVotes(strong ? 5 : 3, 24 * 2, strong ? ["verified", "verified", "needs_more", "verified", "verified"] : ["verified", "needs_more", "verified"]);
        votingEnd = ahead(24 * (VOTING.periodDays - 2) + 7);
        addHistory(key, { type: "voting_opened", at: ago(24 * 3), summary: "Voting opened: two independent paths" });
        state = "voting";
      } else if (sc.challenged === code) {
        pushEvidence(2, 24 * 20);
        pushPaths(2, 24 * 17, "verified");
        pushVotes(4, 24 * 12, ["verified", "verified", "verified", "verified"]);
        addHistory(key, { type: "voting_opened", at: ago(24 * 15), summary: "Voting opened" });
        addHistory(key, { type: "passed", at: ago(24 * 9), summary: "Voting passed. Challenge window opened" });
        const ch: Challenge = {
          id: nextSeq(),
          causeId: id,
          claim: code,
          challenger: HELPERS[8]!.wallet,
          stake: CHALLENGE_STAKE,
          summary: "The annual return shown is for 2023. The register lists the 2024 and 2025 returns as outstanding.",
          counterEvidence: "Screenshot of the SSM status page dated this week, hash recorded.",
          state: "open",
          createdAt: ago(30),
          votingEnd: ahead(24 * 4 + 18),
        };
        challenges.push(ch);
        const chPath = pathText(profile, code, "not_verified");
        paths.push({
          id: nextSeq(),
          causeId: id,
          claim: code,
          epoch: 1,
          author: ch.challenger,
          authorReputation: HELPERS[8]!.reputation,
          ...chPath,
          screenshotHash: fakeHash(id * 1000 + 999),
          checkedAt: ch.createdAt,
          result: "not_verified",
          conflict: "None. I have no relationship with this organisation.",
        });
        addHistory(key, { type: "challenge", at: ch.createdAt, summary: `Challenge opened with ${CHALLENGE_STAKE.toLocaleString("en-GB")} gSera staked. Voting reopened`, by: ch.challenger });
        addEvent({ causeId: id, type: "challenge", at: ch.createdAt, summary: `${code} challenged: ${ch.summary}`, by: ch.challenger });
        outcome = "verified";
        state = "challenge_window";
        challengeWindowEnd = ch.votingEnd;
        challenged = true;
        if (ch.createdAt > lastClaimActivity) lastClaimActivity = ch.createdAt;
      } else if (checkingSet.has(code)) {
        pushEvidence(1 + (id % 2), 24 * (2 + (id % 6)));
        if ((id + ci) % 3 === 0) pushPaths(1, 24 * (1 + (id % 3)), "verified");
      }

      const evCount = evidence.filter((e) => e.causeId === id && e.claim === code).length;
      const myPaths = paths.filter((p) => p.causeId === id && p.claim === code && p.epoch === 0);
      const agreeing = new Set(myPaths.filter((p) => p.result === "verified").map((p) => p.author)).size;
      claims[code] = {
        code,
        required: isRequired,
        outcome,
        state,
        epoch: challenged ? 1 : 0,
        evidenceCount: evCount,
        pathCount: myPaths.length,
        independentChecks: agreeing,
        votingEnd,
        challengeWindowEnd,
        finalisedAt,
        challenged,
      };
    });

    const checksDone = required.filter((c) => claims[c].outcome === "verified" && claims[c].state === "final").length;
    const anyEvidence = evidence.some((e) => e.causeId === id);
    let stage: CauseStage = "new";
    if (sc.paused) stage = "paused";
    else if (checksDone === required.length) stage = "verified";
    else if (checksDone > 0) stage = "partly_verified";
    else if (anyEvidence) stage = "evidence_in";

    // Money
    let givenUsd = 0;
    if (stage === "verified") givenUsd = 18_000 + Math.floor(rand() * 42_000);
    else if (stage === "partly_verified") givenUsd = 2_500 + Math.floor(rand() * 12_000);
    else if (stage === "evidence_in") givenUsd = 400 + Math.floor(rand() * 2_600);
    else if (stage === "paused") givenUsd = 1_240;
    else givenUsd = rand() < 0.35 ? 0 : Math.floor(rand() * 420);
    if (id === 1) givenUsd = 180;
    if (profile.slug === URGENT.slug) givenUsd += 9_600;
    givenUsd = Math.round(givenUsd / 5) * 5;
    const giversCount = givenUsd === 0 ? 0 : Math.max(1, Math.round(givenUsd / (28 + rand() * 30)));
    const withdrawnUsd = givenUsd > 8000 ? Math.round(givenUsd * 0.3) : 0;
    const heldUsd = givenUsd - withdrawnUsd;

    // Recent gifts for the record and the leaderboards
    const giftCount = Math.min(giversCount, 7);
    let lastGiftAt = listedAt;
    for (let k = 0; k < giftCount; k++) {
      const at = ago(6 + Math.floor(rand() * 24 * 20));
      const token = TOKENS[profile.slug]?.[0] ?? "USDT";
      const usd = [5, 10, 25, 50, 100][Math.floor(rand() * 5)]!;
      const giver = GIVER_WALLETS[(id * 3 + k * 5) % GIVER_WALLETS.length]!;
      const g: Gift = {
        id: nextSeq(),
        causeId: id,
        causeName: profile.name,
        causeSlug: profile.slug,
        token,
        amount: token === "MYRT" ? Math.round(usd / 0.235) : token === "XSGD" ? Math.round(usd / 0.74) : usd,
        usd,
        at,
        route: k % 3 === 0 ? "swap" : "direct",
        gsera: giftGsera(usd, { heat: profile.slug === URGENT.slug ? GSERA.heat.urgent : 1 }),
        txHash: fakeTx(seq),
        giver,
      };
      gifts.push(g);
      addEvent({ causeId: id, type: "gift", at, txHash: g.txHash, summary: `Gift of ${g.amount.toLocaleString("en-GB")} ${token} (US$${usd}) arrived${g.route === "swap" ? " through a Sera.cx swap" : ""}`, by: giver });
      if (at > lastGiftAt) lastGiftAt = at;
    }

    const treasury = treasuryFor(id, givenUsd, heldUsd, rand);
    treasury.conversions.forEach((cv) => addEvent({ causeId: id, type: "conversion", at: cv.at, txHash: cv.txHash, summary: `Converted ${cv.amountIn.toLocaleString("en-GB")} ${cv.fromToken} to ${cv.amountOut.toLocaleString("en-GB")} ${cv.toToken} on Sera.cx`, by: owner }));
    treasury.withdrawals.forEach((wd) => addEvent({ causeId: id, type: "withdrawal", at: wd.at, txHash: wd.txHash, summary: `Withdrew ${wd.amount.toLocaleString("en-GB")} ${wd.token} to ${wd.to.slice(0, 6)}\u2026${wd.to.slice(-4)}`, by: owner }));
    const media = mediaFor(id, profile);
    media.forEach((m) => addEvent({ causeId: id, type: "media", at: m.addedAt, summary: `${m.kind === "photo" ? "Photo" : "Video"} added: ${m.title}`, by: owner }));
    const updates = updatesFor(id, profile, stage);
    updates.forEach((u) => addEvent({ causeId: id, type: "update", at: u.at, summary: `Update: ${u.title}`, by: owner }));
    const helpRequests = helpFor(id, profile);
    helpRequests.forEach((h, k) => addEvent({ causeId: id, type: "need", at: ago(24 * (listedDaysAgo - 2) - k * 3), txHash: fakeTx(h.id), summary: `Help request: ${h.title}`, by: owner }));

    // Concerns
    const concerns: Concern[] = [];
    const attest = SEED_ATTEST[profile.slug];
    let pausedReason: string | undefined;
    if (attest && (attest.kind === "concern" || attest.kind === "open-question" || attest.kind === "note")) {
      concerns.push({ kind: attest.kind as Concern["kind"], text: attest.text, at: ago(24 * 2) });
    }
    if (sc.paused) {
      pausedReason = attest?.text ?? "Paused by a steward pending registration details.";
      const at = ago(24 * 5);
      concerns.unshift({ kind: "steward", text: `Paused by a steward: ${pausedReason}`, at });
      addEvent({ causeId: id, type: "steward", at, txHash: fakeTx(id * 53), summary: `Paused by a steward. Reason: ${pausedReason}`, by: STEWARD_WALLET });
    }
    const openChallenge = challenges.find((c) => c.causeId === id && c.state === "open");
    if (openChallenge) {
      concerns.unshift({
        kind: "challenge",
        text: `A challenge is open on ${openChallenge.claim} (${CLAIM_INFO[openChallenge.claim].label}). ${openChallenge.summary}`,
        link: `/verify/${id}/${openChallenge.claim}`,
        at: openChallenge.createdAt,
      });
    }

    if (HOMEPAGE_ON.has(profile.slug)) {
      addEvent({ causeId: id, type: "homepage", at: ago(24 * (listedDaysAgo - 1)), summary: "Creator switched Show on homepage on", by: owner });
    }

    shares.set(id, { whatsapp: Math.floor(rand() * 40), telegram: Math.floor(rand() * 12), x: Math.floor(rand() * 15), facebook: Math.floor(rand() * 20), copy: Math.floor(rand() * 30), embed: Math.floor(rand() * 4) });

    const lastActivityAt = [lastClaimActivity, lastGiftAt, updates[0]?.at ?? listedAt].sort().at(-1)!;

    return {
      id,
      slug: profile.slug,
      name: profile.name,
      stage,
      owner,
      payout,
      depositAddress: treasury.depositAddress,
      media,
      treasury,
      listedAt,
      verifiedAt: stage === "verified" ? claims.C4.finalisedAt : undefined,
      lastActivityAt,
      givenUsd,
      giversCount,
      homepage: HOMEPAGE_ON.has(profile.slug),
      urgent: profile.slug === URGENT.slug ? { reason: URGENT.reason, setBy: STEWARD_WALLET, since: ago(40) } : undefined,
      requiresCareLicence,
      acceptedTokens: TOKENS[profile.slug] ?? ["USDT", "USDC"],
      claims,
      checksDone,
      checksTotal: required.length,
      badges: { taxExempt: claims.C5.outcome === "verified", accountsPublished: claims.C7.outcome === "verified" },
      concerns,
      pausedReason,
      helpRequests,
      updates,
      liveUrl: undefined,
      profile,
    };
  });

  const me = buildMe(causes, gifts, paths);

  return {
    causes,
    evidence,
    paths,
    votes,
    challenges,
    events,
    claimHistory,
    gifts,
    me,
    shares,
    nextId: seq + 1,
    pathsOpened: new Set(),
  };
}

function k2(id: number, ci: number) {
  return (id + ci) % 2 === 0;
}

function buildMe(causes: Cause[], gifts: Gift[], paths: VerificationPath[]): Me {
  const mercy = causes.find((c) => c.slug === "mercy-malaysia")!;
  const hospis = causes.find((c) => c.slug === "hospis-malaysia")!;
  const multipliers = { volumeTier: 1.2, streak: 1.1, streakWeeks: 3 };
  const g1At = ago(24 * 12);
  const g2At = ago(24 * 40);
  const g1 = giftGsera(50, { heat: GSERA.heat.urgent, ...multipliers });
  const g2 = giftGsera(25, { heat: 1, ...multipliers });
  const myGifts: Gift[] = [
    { id: 1, causeId: mercy.id, causeName: mercy.name, causeSlug: mercy.slug, token: "USDT", amount: 50, usd: 50, at: g1At, route: "direct", gsera: g1, txHash: fakeTx(777), giver: DEMO_WALLET },
    { id: 2, causeId: hospis.id, causeName: hospis.name, causeSlug: hospis.slug, token: "XSGD", amount: 34, usd: 25, at: g2At, route: "swap", gsera: g2, txHash: fakeTx(778), giver: DEMO_WALLET },
  ];
  gifts.push(...myGifts);

  const myPaths = paths.filter((p) => p.author === DEMO_WALLET);
  const ledger: LedgerEntry[] = [
    { id: 1, amount: 8_800, reason: "gift", sourceTag: "trading", note: "Swaps on Sera.cx, Season 1 (same balance as g.sera.cx)", state: "credited", createdAt: ago(24 * 70) },
    ...myPaths.map((p, i) => ({
      id: 10 + i,
      amount: GSERA.helper.pathAgrees,
      reason: "path" as const,
      sourceTag: "charity" as const,
      note: `Path on ${causes[p.causeId - 1]!.name} ${p.claim} agreed with the final outcome`,
      state: "credited" as const,
      createdAt: p.checkedAt,
      causeId: p.causeId,
    })),
    { id: 20, amount: g1, reason: "gift", sourceTag: "charity", note: `Gift of US$50 to ${mercy.name} (urgent appeal 2.5x)`, state: "credited", multipliers: { heat: GSERA.heat.urgent, volume: multipliers.volumeTier, streak: multipliers.streak }, createdAt: g1At, causeId: mercy.id },
    { id: 21, amount: g2, reason: "gift", sourceTag: "charity", note: `Gift of US$25 to ${hospis.name}, settled through a Sera.cx swap (earns once)`, state: "credited", multipliers: { heat: 1, volume: multipliers.volumeTier, streak: multipliers.streak }, createdAt: g2At, causeId: hospis.id },
    { id: 22, amount: GSERA.helper.voteAgrees, reason: "vote", sourceTag: "charity", note: "Vote on WWF-Malaysia C4, credited when the claim is final", state: "held", createdAt: ago(24 * 2) },
  ];
  ledger.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const credited = ledger.filter((l) => l.state === "credited");
  const spendable = credited.reduce((s, l) => s + l.amount, 0);
  const charityTagged = credited.filter((l) => l.sourceTag === "charity").reduce((s, l) => s + l.amount, 0);

  const contributions: Contribution[] = [
    ...myPaths.map((p, i) => ({ id: 100 + i, kind: "path" as const, causeId: p.causeId, causeName: causes[p.causeId - 1]!.name, claim: p.claim, at: p.checkedAt, outcome: "agreed" as const, gsera: GSERA.helper.pathAgrees })),
    { id: 200, kind: "vote", causeId: 13, causeName: causes[12]!.name, claim: "C4", at: ago(24 * 2), outcome: "pending", gsera: GSERA.helper.voteAgrees },
    { id: 201, kind: "listing", causeId: 1, causeName: causes[0]!.name, at: causes[0]!.listedAt, outcome: "open", gsera: GSERA.helper.listingVerified },
    { id: 202, kind: "listing", causeId: 14, causeName: causes[13]!.name, at: causes[13]!.listedAt, outcome: "accepted", gsera: GSERA.helper.listingVerified },
  ];
  contributions.sort((a, b) => b.at.localeCompare(a.at));

  const reputation = 3;
  return {
    wallet: DEMO_WALLET,
    displayName: "Demo wallet",
    reputation,
    voteWeight: voteWeight(reputation),
    canVote: true,
    kytState: "clear",
    gsera: { spendable, charityTagged, lifetime: spendable },
    multipliers,
    ledger,
    gifts: myGifts,
    contributions,
    badges: [
      { id: "first-gift", label: "First gift", earned: true, hint: "Give once" },
      { id: "helper", label: "Helper", earned: true, hint: "One accepted path or fulfilled help request" },
      { id: "witness", label: "Witness", earned: false, hint: "A site visit that a claim relied on" },
      { id: "path-finder", label: "Path finder", earned: false, hint: "10 accepted paths" },
      { id: "steady-hand", label: "Steady hand", earned: false, hint: "25 votes with the outcome" },
    ],
    causesOwned: [1, 14],
    leaderboardOptOut: false,
  };
}
