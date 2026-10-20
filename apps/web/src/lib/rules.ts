/**
 * Rule functions come from @sera-causes/shared so the web, the API and the
 * recompute script cannot drift. This file re-exports them and adds the few
 * presentation helpers the pages use.
 */
import { giftGsera as sharedGiftGsera, voteWeight as sharedVoteWeight, type CauseProfile, type ClaimCode, type GiftMultiplierInput } from "@sera-causes/shared";

export { causeStage, feedOrder, giftMultiplier, isRequiredClaim, newestCauses, requiredClaimsFor, tallyClaim, votingCanOpen, challengeWindowEnd } from "@sera-causes/shared";
export type { GiftMultiplierInput, StageResult, TallyVote } from "@sera-causes/shared";

/** gSera for a gift. The shared rule throws on a negative amount; a form preview wants 0. */
export function giftGsera(usd: number, input: GiftMultiplierInput = {}): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return sharedGiftGsera(usd, input);
}

/** Vote weight rounded to two decimals for display. */
export function voteWeight(reputation: number): number {
  return Math.round(sharedVoteWeight(reputation) * 100) / 100;
}

/** Short wallet, 0x95ce...6ebc. */
export function shortAddress(address: string): string {
  if (!address) return "";
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function causeHref(id: number, slug: string): string {
  return `/c/${id}-${slug}`;
}

export function claimHref(causeId: number, claim: ClaimCode): string {
  return `/helpers/${causeId}/${claim}`;
}

/** The claim summary for a code on a cause view. */
export function claimOf<T extends { claimType: ClaimCode }>(c: { claims: T[] }, code: ClaimCode): T | undefined {
  return c.claims.find((k) => k.claimType === code);
}

/** A cause's profile, or an empty one when the metadata could not be fetched. */
export function profileOf(c: { profile: CauseProfile | null; name: string; slug: string; category: string }): CauseProfile {
  return (
    c.profile ?? {
      schema: "csd.cause/1",
      slug: c.slug,
      name: c.name,
      legalName: "",
      category: c.category,
      location: { town: "", state: "", country: "MY" },
      summary: "",
      programmes: [],
      impact: [],
      beneficiaries: "",
      organisation: { entityType: "", registration: "", registrationSource: "", founded: "", founders: "", leadership: "", taxExemption: { statement: "", source: "" }, accounts: "" },
      contact: {},
      sources: [],
      profileCheckedOn: "",
    }
  );
}

/** The helper a help request is pledged to, if any. */
export function pledgedBy(h: { helper: string | null; confirmedHelper: string | null; pledges: { helper: string }[] }): string | null {
  return h.confirmedHelper ?? h.helper ?? h.pledges[0]?.helper ?? null;
}

/** Raw token units to a display number. */
export function fromRaw(amountRaw: string, decimals = 6): number {
  const s = (amountRaw ?? "0").replace(/[^0-9]/g, "") || "0";
  return Number(BigInt(s)) / 10 ** decimals;
}

export function toRaw(units: number, decimals = 6): string {
  return BigInt(Math.round(units * 10 ** decimals)).toString();
}
