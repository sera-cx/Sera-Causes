import { describe, expect, it } from "vitest";
import { GSERA, VOTING } from "@/lib/constants";
import { giftGsera, tallyClaim, voteWeight } from "@/lib/rules";

describe("giftGsera", () => {
  it("matches the brief example: US$50 x 100 x 2.5 x 1.2 x 1.1", () => {
    expect(giftGsera(50, { heat: GSERA.heat.urgent, volumeTier: 1.2, streak: 1.1 })).toBe(16_500);
  });
  it("caps the compound multiplier", () => {
    expect(giftGsera(10, { heat: 4, volumeTier: 1.6, streak: 1.3, ...{} })).toBe(10 * 100 * Math.min(10, 4 * 1.6 * 1.3));
    expect(giftGsera(1, { heat: 100 })).toBe(100 * GSERA.compoundCap);
  });
  it("returns 0 for nothing", () => {
    expect(giftGsera(0)).toBe(0);
    expect(giftGsera(-5)).toBe(0);
  });
});

describe("voteWeight", () => {
  it("is 1 for new voters and never above 5", () => {
    expect(voteWeight(0)).toBe(1);
    expect(voteWeight(1)).toBe(2);
    expect(voteWeight(3)).toBe(3);
    expect(voteWeight(15)).toBe(5);
    expect(voteWeight(1000)).toBe(5);
  });
});

describe("tallyClaim", () => {
  it("needs quorum and threshold", () => {
    const t = tallyClaim([
      { choice: "verified", weight: 3 },
      { choice: "verified", weight: 3 },
      { choice: "needs_more", weight: 1 },
    ]);
    expect(t.total).toBe(7);
    expect(t.quorumMet).toBe(true);
    expect(t.verifiedPct).toBe(86);
    expect(t.passed).toBe(true);
  });
  it("fails below the threshold even with quorum", () => {
    const t = tallyClaim([
      { choice: "verified", weight: 4 },
      { choice: "not_verified", weight: 4 },
    ]);
    expect(t.quorumMet).toBe(true);
    expect(t.passed).toBe(false);
    expect(VOTING.thresholdPct).toBe(75);
  });
});
