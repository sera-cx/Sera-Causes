import { describe, expect, it } from "vitest";
import { CLAIMS } from "@/lib/constants";
import * as api from "@/lib/mock/handlers";
import { DEMO_WALLET } from "@/lib/mock/state";

describe("mock world built from the seed", () => {
  it("has 44 causes with ids 1 to 44 in seed order", async () => {
    const all = await api.listCauses({ sort: "name" });
    expect(all).toHaveLength(44);
    const kasih = await api.getCause(1);
    expect(kasih?.slug).toBe("kasih-turtle-conservation-project");
    expect(kasih?.owner).toBe(DEMO_WALLET);
    const freeTree = await api.getCause(14);
    expect(freeTree?.slug).toBe("free-tree-society");
    expect(freeTree?.owner).toBe(DEMO_WALLET);
  });

  it("verifies free-tree-society and make-a-wish-malaysia with C1 to C4 and the C5 badge", async () => {
    for (const id of [14, 25]) {
      const c = (await api.getCause(id))!;
      expect(c.stage).toBe("verified");
      expect(c.checksDone).toBe(c.checksTotal);
      for (const code of ["C1", "C2", "C3", "C4"] as const) expect(c.claims[code].outcome).toBe("verified");
      expect(c.badges.taxExempt).toBe(true);
    }
  });

  it("pauses perhentian-turtle-project with its concern", async () => {
    const c = (await api.getCause(4))!;
    expect(c.stage).toBe("paused");
    expect(c.pausedReason).toMatch(/Fuze Ecoteer/);
  });

  it("has the expected mix of stages, one urgent appeal and about 25 homepage causes", async () => {
    const all = await api.listCauses({});
    const by = (s: string) => all.filter((c) => c.stage === s).length;
    expect(by("verified")).toBe(2);
    expect(by("partly_verified")).toBe(8);
    expect(by("evidence_in")).toBe(10);
    expect(by("paused")).toBe(1);
    expect(by("new")).toBe(23);
    const home = await api.getHome();
    expect(home.urgent?.cause.slug).toBe("mercy-malaysia");
    expect(home.urgent?.reason).toBe("Flood relief, Kelantan");
    expect(home.feed).toHaveLength(25);
    expect(home.newest).toHaveLength(6);
  });

  it("builds claim workspaces with evidence, paths, tallies and one open challenge", async () => {
    const claim = (await api.getClaim(33, "C3"))!;
    expect(claim.state).toBe("voting");
    expect(claim.paths.length).toBeGreaterThanOrEqual(2);
    expect(claim.tally.quorumMet).toBe(true);
    expect(claim.tally.passed).toBe(true);
    expect(claim.mode).toBe("advisory");
    const challenged = await api.listClaims("challenged");
    expect(challenged).toHaveLength(1);
    expect(challenged[0]?.causeSlug).toBe("teach-for-malaysia");
    for (const tab of ["needs_evidence", "needs_checking", "open_for_votes", "recently_verified"] as const) {
      expect((await api.listClaims(tab)).length).toBeGreaterThan(0);
    }
    expect(CLAIMS).toHaveLength(7);
  });

  it("signs in the demo wallet with gSera, reputation 3, two gifts and three accepted paths", async () => {
    const me = await api.getMe();
    expect(me.wallet).toBe(DEMO_WALLET);
    expect(me.reputation).toBe(3);
    expect(me.voteWeight).toBe(3);
    expect(me.gifts).toHaveLength(2);
    expect(me.contributions.filter((c) => c.kind === "path" && c.outcome === "agreed")).toHaveLength(3);
    expect(me.gsera.spendable).toBeGreaterThan(0);
    expect(me.gsera.charityTagged).toBeLessThanOrEqual(me.gsera.spendable);
  });

  it("locks the vote until the paths were opened, then records it", async () => {
    await expect(api.postVote({ causeId: 13, claim: "C4", choice: "verified", reason: "Checked" })).rejects.toThrow(/paths/);
    await api.markPathsOpened(13, "C4");
    await api.postVote({ causeId: 13, claim: "C4", choice: "verified", reason: "Checked" });
    const claim = (await api.getClaim(13, "C4"))!;
    expect(claim.votes.some((v) => v.voter === DEMO_WALLET)).toBe(true);
  });

  it("quotes a swap when the cause keeps a different stablecoin and credits gSera on arrival", async () => {
    const quote = await api.quoteGift(2, "USDT", 25);
    expect(quote.swap?.toToken).toBe("MYRT");
    expect(quote.gsera.earns).toBe(true);
    const before = (await api.getMe()).gsera.spendable;
    const r = await api.submitGift(quote);
    expect(r.route).toBe("swap");
    const after = (await api.getMe()).gsera.spendable;
    expect(after - before).toBe(quote.gsera.amount);
    const record = await api.getRecord(2);
    expect(record[0]?.type).toBe("gift");
  });
});
