// mirror of @sera-causes/shared, swap when that package lands
//
// Every tunable number lives here and is shown to people only on /rules.
// Values marked "proposed" come from the product brief and may change.

export const CLAIMS = ["C1", "C2", "C3", "C4", "C5", "C6", "C7"] as const;
export type ClaimCode = (typeof CLAIMS)[number];

export const REQUIRED_CLAIMS: readonly ClaimCode[] = ["C1", "C2", "C3", "C4"];
export const CARE_LICENCE_CLAIM: ClaimCode = "C6";
export const BADGE_CLAIMS: readonly ClaimCode[] = ["C5", "C7"];

export type ClaimRequirement = "always" | "when_flagged" | "badge";

export interface ClaimInfo {
  code: ClaimCode;
  /** Short name used in tight spaces. */
  short: string;
  /** Plain English statement of the fact being checked. */
  label: string;
  /** What counts as proof (brief 7.2). */
  proof: string;
  /** Where a helper can check it (the verification paths library). */
  whereToCheck: string;
  required: ClaimRequirement;
  badge?: string;
}

export const CLAIM_INFO: Readonly<Record<ClaimCode, ClaimInfo>> = {
  C1: {
    code: "C1",
    short: "Registered",
    label: "The organisation exists and is registered",
    proof: "Registration number and legal name match an official register.",
    whereToCheck:
      "Registrar of Societies (ROS) for societies (PPM numbers); SSM for companies limited by guarantee; Legal Affairs Division (BHEUU) for trusts (PPAB numbers); state registries for Sabah and Sarawak societies.",
    required: "always",
  },
  C2: {
    code: "C2",
    short: "Current",
    label: "Registration is current",
    proof: "The register shows active status, or the latest annual return has been accepted.",
    whereToCheck: "The same registers, plus the charity's latest annual return or AGM minutes.",
    required: "always",
  },
  C3: {
    code: "C3",
    short: "Payout wallet",
    label: "The payout wallet belongs to the organisation",
    proof:
      "A message signed by the payout wallet, published on the organisation's official website or verified social account, plus a matching board resolution.",
    whereToCheck: "The organisation's own site or account; on-chain signature check.",
    required: "always",
  },
  C4: {
    code: "C4",
    short: "Work is real",
    label: "The work is real and current",
    proof:
      "At least two independent dated sources from the last 12 months: a site visit, news, photos with location and date, or partner confirmation.",
    whereToCheck: "News archives, the organisation's own channels, a helper's site visit.",
    required: "always",
  },
  C5: {
    code: "C5",
    short: "Tax-exempt",
    label: "Tax-exempt approval under section 44(6)",
    proof: "An LHDN approval reference and validity period that match LHDN's own search.",
    whereToCheck:
      "LHDN Semakan Kelulusan Derma search: https://www.hasil.gov.my/institusi-organisasi-tabung/semakan-kelulusan-derma/",
    required: "badge",
    badge: "Tax-exempt",
  },
  C6: {
    code: "C6",
    short: "Care licence",
    label: "Care licence where the law needs one",
    proof: "Registration under the Care Centres Act 1993 with the Department of Social Welfare (JKM).",
    whereToCheck: "JKM, and the licence certificate on site.",
    required: "when_flagged",
  },
  C7: {
    code: "C7",
    short: "Accounts",
    label: "Accounts are published",
    proof: "Audited accounts or an annual report within the last 2 years.",
    whereToCheck: "The organisation's site, or the register.",
    required: "badge",
    badge: "Accounts published",
  },
};

export const VOTING = {
  minPaths: 2, // proposed
  periodDays: 5, // proposed
  minHours: 48, // proposed
  quorumWeight: 7, // proposed
  thresholdPct: 75, // proposed
  challengeWindowHours: 72, // proposed
} as const;

export const VOTE_WEIGHT = { min: 1, max: 5 } as const;
export const REPUTATION = { agrees: 1, overturned: -3 } as const;
export const CHALLENGE_STAKE = 5000; // proposed

export const VERIFICATION_MODES = ["advisory", "community"] as const;
export type VerificationMode = (typeof VERIFICATION_MODES)[number];
/** Launch mode (docs/PLAN.md section 5): votes are shown as tallies, stewards finalise. */
export const VERIFICATION_MODE: VerificationMode = "advisory";

export const GSERA = {
  perUsd: 100,
  compoundCap: 10,
  heat: { urgent: 2.5, normal: 1 }, // proposed
  volumeTier: { min: 1, max: 1.6 },
  streak: { min: 1, max: 1.3 },
  helper: {
    listingVerified: 2500, // proposed
    pathAgrees: 1000, // proposed
    voteAgrees: 100, // proposed
    helpFulfilled: 500, // proposed
    challengeWin: 2000, // proposed
  },
  giftCapUsdPerWalletPerCausePer30d: 1000, // proposed
  giftCapWindowDays: 30, // proposed
} as const;

export interface Category {
  slug: string;
  label: string;
  profileName: string;
}

export const CATEGORIES: readonly Category[] = [
  { slug: "turtles", label: "Turtles", profileName: "Turtles" },
  { slug: "marine", label: "Marine", profileName: "Marine" },
  { slug: "wildlife", label: "Wildlife", profileName: "Wildlife" },
  { slug: "environment", label: "Environment", profileName: "Environment" },
  { slug: "animals", label: "Animals", profileName: "Animals" },
  { slug: "children", label: "Children", profileName: "Children" },
  { slug: "health", label: "Health", profileName: "Health" },
  { slug: "food", label: "Food", profileName: "Food & poverty" },
  { slug: "relief", label: "Relief", profileName: "Relief" },
  { slug: "elderly", label: "Elderly", profileName: "Elderly" },
  { slug: "women", label: "Women", profileName: "Women" },
  { slug: "disability", label: "Disability", profileName: "Disability" },
];

export function categoryBySlug(slug: string): Category | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}
export function categoryByProfileName(name: string): Category | undefined {
  return CATEGORIES.find((c) => c.profileName === name);
}

export type CauseStage = "new" | "evidence_in" | "partly_verified" | "verified" | "paused" | "closed";
export type StatusTone = "grey" | "amber" | "green" | "red";

export const STAGE_INFO: Readonly<Record<CauseStage, { label: string; tone: StatusTone; blurb: string }>> = {
  new: { label: "New", tone: "grey", blurb: "Not checked yet" },
  evidence_in: { label: "Evidence in", tone: "amber", blurb: "Evidence uploaded, checks under way" },
  partly_verified: { label: "Partly verified", tone: "amber", blurb: "Some checks done" },
  verified: { label: "Verified", tone: "green", blurb: "All required checks done" },
  paused: { label: "Paused", tone: "red", blurb: "Paused by a steward or a successful challenge" },
  closed: { label: "Closed", tone: "grey", blurb: "No longer taking gifts" },
};

/** Stablecoins the registry accepts at launch, with a mock USD value for the demo. */
export const STABLECOINS: readonly { symbol: string; name: string; usd: number }[] = [
  { symbol: "USDT", name: "Tether USD", usd: 1 },
  { symbol: "USDC", name: "USD Coin", usd: 1 },
  { symbol: "XSGD", name: "Singapore dollar", usd: 0.74 },
  { symbol: "MYRT", name: "Malaysian ringgit", usd: 0.235 },
];

export const GIFT_PRESETS_USD = [5, 10, 25, 50, 100] as const;

export const MALAYSIAN_STATES = [
  "Nationwide",
  "Johor",
  "Kedah",
  "Kelantan",
  "Kuala Lumpur",
  "Melaka",
  "Negeri Sembilan",
  "Pahang",
  "Penang",
  "Perak",
  "Perlis",
  "Sabah",
  "Sarawak",
  "Selangor",
  "Terengganu",
] as const;

export const LINKS = {
  github: "https://github.com/sera-cx/sera-causes",
  gsera: "https://g.sera.cx",
  sera: "https://sera.cx",
  brand: "https://sera.cx/brand",
  terms: "https://sera.cx/terms",
  privacy: "https://sera.cx/privacy",
  lhdn: "https://www.hasil.gov.my/institusi-organisasi-tabung/semakan-kelulusan-derma/",
} as const;

export const SITE_ORIGIN = "https://causes.sera.cx";
