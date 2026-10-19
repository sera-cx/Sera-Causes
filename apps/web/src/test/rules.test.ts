import { describe, expect, it } from "vitest";
import { GSERA, VOTING } from "@/lib/constants";
import { giftGsera, tallyClaim, voteWeight } from "@/lib/rules";

const A = "0x8c1d9f3b7a2e4c6d8e0f1a3b5c7d9e1f2a4b6c8d";
const B = "0x3f9a71bc2d4e6f8a9b0c1d2e3f4a5b6c7d8e9f0a";
const C = "0xa7b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0";

describe("giftGsera", () => {
  it("matches the brief example: US$50 x 100 x 2.5 x 1.2 x 1.1", () => {
    expect(giftGsera(50, { heat: GSERA.heat.urgent, volumeTier: 1.2, streak: 1.1 })).toBe(16_500);
  });
  it("caps the compound multiplier", () => {
    expect(giftGsera(10, { heat: 4, volumeTier: 1.6, streak: 1.3 })).toBe(10 * 100 * Math.min(10, 4 * 1.6 * 1.3));
    expect(giftGsera(1, { heat: 100 })).toBe(100 * GSERA.compoundCap);
  });
  it("returns 0 for nothing, without throwing like the shared rule does", () => {
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

describe("tallyClaim (shared rule, weighted by reputation)", () => {
  it("needs quorum and threshold", () => {
    const t = tallyClaim(
      [
        { voter: A, choice: "verified" },
        { voter: B, choice: "verified" },
        { voter: C, choice: "needs_more" },
      ],
      { [A]: 3, [B]: 3, [C]: 0 },
    );
    expect(t.total).toBe(7);
    expect(t.quorumMet).toBe(true);
    expect(Math.round(t.verifiedShare * 100)).toBe(86);
    expect(t.passed).toBe(true);
    expect(t.outcome).toBe("verified");
  });
  it("fails below the threshold even with quorum", () => {
    const t = tallyClaim(
      [
        { voter: A, choice: "verified" },
        { voter: B, choice: "not_verified" },
      ],
      { [A]: 7, [B]: 7 },
    );
    expect(t.quorumMet).toBe(true);
    expect(t.passed).toBe(false);
    expect(VOTING.thresholdPct).toBe(75);
  });
});
