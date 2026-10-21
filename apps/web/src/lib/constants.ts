/**
 * Product constants come from @sera-causes/shared, the one source the API,
 * the contracts tooling and this app share. Only web-specific presentation
 * values live here: links, the site origin, short claim names, the stage
 * pill table in the shape the components use, and the stablecoin display
 * list for the give sheet.
 */
import { CATEGORIES, CLAIMS, MALAYSIAN_STATES, NATIONWIDE, STATUS, type Category, type CauseStage, type ClaimCode, type StatusTone } from "@sera-causes/shared";

export {
  BADGE_CLAIMS,
  CARE_LICENCE_CLAIM,
  CATEGORIES,
  CHALLENGE_STAKE,
  CLAIMS,
  CLAIM_INFO,
  DEFAULT_VERIFICATION_MODE,
  DOCUMENT_CLAIMS,
  EVIDENCE_MAX_BYTES,
  EVIDENCE_MIME_TYPES,
  GIFT_PRESETS_USD,
  COMMUNITY_SITE,
  GSERA,
  HELPER_BADGES,
  HELPER_BADGE_SLUGS,
  HELPER_BADGE_THRESHOLDS,
  HOME_NEW_RAIL,
  LAUNCH_STABLECOINS,
  MALAYSIAN_STATES,
  NATIONWIDE,
  REPUTATION,
  REQUIRED_CLAIMS,
  SIGNED_AT_TOLERANCE_SECONDS,
  STATUS,
  TREASURY_MODES,
  URGENT_APPEAL_LABEL,
  VERIFICATION_MODES,
  VOTE_WEIGHT,
  VOTING,
  XP,
  XP_EVENT_TYPES,
  claimCodeOf,
  claimTypeIndex,
  findCategory,
  helpBadgeFor,
  xpFor,
} from "@sera-causes/shared";
export type { Category, CauseStage, ClaimCode, ClaimInfo, ClaimRequirement, HelperBadge, HelperBadgeInfo, HelperBadgeSlug, StatusTone, VerificationMode, XpEventType, XpReward } from "@sera-causes/shared";

/** Short claim names for tight spaces (select options, chips). */
export const CLAIM_SHORT: Readonly<Record<ClaimCode, string>> = {
  C1: "Registered",
  C2: "Current",
  C3: "Payout wallet",
  C4: "Work is real",
  C5: "Tax-exempt",
  C6: "Care licence",
  C7: "Accounts",
};

/** The stage pill table keyed the way the components read it. */
export const STAGE_INFO: Readonly<Record<CauseStage, { label: string; tone: StatusTone; blurb: string }>> = Object.fromEntries(
  (Object.keys(STATUS) as CauseStage[]).map((s) => [s, { label: STATUS[s].label, tone: STATUS[s].tone, blurb: STATUS[s].hint }]),
) as Record<CauseStage, { label: string; tone: StatusTone; blurb: string }>;

export function categoryBySlug(slug: string): Category | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}
export function categoryByProfileName(name: string): Category | undefined {
  return CATEGORIES.find((c) => c.profileName === name);
}
/** Label for a category slug or profile name, or the input when unknown. */
export function categoryLabel(value: string): string {
  return categoryBySlug(value)?.label ?? categoryByProfileName(value)?.label ?? value;
}

/** State names for filters: Nationwide first, then the 13 states and 3 territories. */
export const STATE_NAMES: readonly string[] = [NATIONWIDE, ...MALAYSIAN_STATES.map((s) => s.name)];

/** Launch stablecoins with a display name and an indicative US$ value for previews before a quote. */
export const STABLECOINS: readonly { symbol: string; name: string; usd: number }[] = [
  { symbol: "USDT", name: "Tether USD", usd: 1 },
  { symbol: "USDC", name: "USD Coin", usd: 1 },
  { symbol: "XSGD", name: "Singapore dollar", usd: 0.74 },
  { symbol: "MYRT", name: "Malaysian ringgit", usd: 0.235 },
];

export function stablecoinUsd(symbol: string): number {
  return STABLECOINS.find((t) => t.symbol === symbol)?.usd ?? 1;
}

export const LINKS = {
  github: "https://github.com/sera-cx/sera-causes",
  gsera: "https://g.sera.cx",
  community: "https://community.sera.cx",
  sera: "https://sera.cx",
  brand: "https://sera.cx/brand",
  terms: "https://sera.cx/terms",
  privacy: "https://sera.cx/privacy",
  lhdn: "https://www.hasil.gov.my/institusi-organisasi-tabung/semakan-kelulusan-derma/",
} as const;

export const SITE_ORIGIN = "https://causes.sera.cx";

/**
 * What the first run covers. A deliberate scope, written once here and shown
 * in the footer, on the home page, by the stablecoin picker and in full on
 * /rules, so a giver always knows which currencies work and where the causes
 * are. Keep these plain: short sentences, no apology.
 */
export const TRIAL = {
  /** One line, for the footer. */
  footer: "First run: Malaysian causes, giving in MYRT, XSGD and US dollar stablecoins. More countries in 2027.",
  /** One sentence, for anywhere that needs the whole scope in a line. */
  home: "This is the first run. Every cause on the list is in Malaysia, and you can give in MYRT, XSGD or a US dollar stablecoin. We open more countries in 2027.",
  /**
   * The home hero says the same thing in two parts, so the YouApp mark can sit
   * beside MYRT where it means something. Split here rather than in the page,
   * so the scope is still stated once.
   */
  heroWhy: "This is our first run, so the list is small and every cause is in Malaysia, where we can check a charity against a public register ourselves. More countries follow in 2027.",
  heroCurrenciesAfterMyrt: "for ringgit, XSGD for Singapore dollars, or a US dollar stablecoin.",
  /** For the give sheet, next to the stablecoin picker. */
  give: "These are the currencies the first run covers: MYRT for ringgit, XSGD for Singapore dollars, and USDT or USDC for US dollars.",
  /** The fuller note for /rules. */
  rules:
    "Care Share Donate starts small on purpose. Giving works in four stablecoins at launch: MYRT, XSGD, USDT and USDC. Every cause on the list is in Malaysia, because that is where we can check a charity against a public register ourselves. Other countries follow in 2027, one at a time, each with its own registers written into the paths library first.",
} as const;

/** Sanity check that the shared claim list is the one this app was written against. */
export const CLAIM_COUNT = CLAIMS.length;
