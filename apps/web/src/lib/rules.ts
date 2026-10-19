// mirror of @sera-causes/shared, swap when that package lands
import { GSERA, VOTE_WEIGHT, VOTING, REQUIRED_CLAIMS, CARE_LICENCE_CLAIM, type ClaimCode } from "./constants";
import type { Tally, Vote } from "./types";

export interface GiftMultiplierInput {
  heat?: number;
  volumeTier?: number;
  streak?: number;
}

/** Compound multiplier for a gift, capped (brief 6.2). */
export function giftMultiplier({ heat = 1, volumeTier = 1, streak = 1 }: GiftMultiplierInput = {}): number {
  return Math.min(GSERA.compoundCap, heat * volumeTier * streak);
}

/** gSera per gift = gift_usd x 100 x heat x volume x streak, floored. */
export function giftGsera(usd: number, input: GiftMultiplierInput = {}): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return Math.floor(usd * GSERA.perUsd * giftMultiplier(input));
}

/** weight = 1 + min(4, log2(1 + reputation)), so between 1 and 5 (brief 7.6). */
export function voteWeight(reputation: number): number {
  const rep = Math.max(0, reputation);
  const w = VOTE_WEIGHT.min + Math.min(VOTE_WEIGHT.max - VOTE_WEIGHT.min, Math.log2(1 + rep));
  return Math.round(w * 100) / 100;
}

export function tallyClaim(votes: readonly Pick<Vote, "choice" | "weight">[]): Tally {
  let verified = 0;
  let not = 0;
  let more = 0;
  for (const v of votes) {
    if (v.choice === "verified") verified += v.weight;
    else if (v.choice === "not_verified") not += v.weight;
    else more += v.weight;
  }
  const total = verified + not + more;
  const quorumMet = total >= VOTING.quorumWeight;
  const verifiedPct = total > 0 ? (verified / total) * 100 : 0;
  const passed = quorumMet && verifiedPct >= VOTING.thresholdPct;
  return {
    verified: round1(verified),
    not: round1(not),
    more: round1(more),
    total: round1(total),
    quorumMet,
    passed,
    verifiedPct: Math.round(verifiedPct),
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export function requiredClaimsFor(requiresCareLicence: boolean): ClaimCode[] {
  return requiresCareLicence ? [...REQUIRED_CLAIMS, CARE_LICENCE_CLAIM] : [...REQUIRED_CLAIMS];
}

/** Short wallet, 0x5e7a...c0de. */
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
