import { describe, expect, it } from "vitest";
import { CLAIMS } from "@/lib/constants";
import * as api from "@/lib/mock/handlers";
import { DEMO_WALLET, MOCK_STABLECOINS } from "@/lib/mock/state";
import { claimOf } from "@/lib/rules";

describe("mock world built from the seed, in the API's shapes", () => {
  it("has 44 causes with ids 1 to 44 in seed order, two owned by the demo wallet", async () => {
    const all = await api.listCauses({ sort: "name" });
    expect(all).toHaveLength(44);
    const kasih = await api.getCause(1);
    expect(kasih?.slug).toBe("kasih-turtle-conservation-project");
    expect(kasih?.owner).toBe(DEMO_WALLET);
    const freeTree = await api.getCause(14);
    expect(freeTree?.slug).toBe("free-tree-society");
    expect(freeTree?.owner).toBe(DEMO_WALLET);
    expect(DEMO_WALLET).toBe("0x95ced938f7991cd0dfcb48f0a06a40fa1af46ebc");
  });

  it("verifies free-tree-society and make-a-wish-malaysia with C1 to C4 and the C5 badge", async () => {
    for (const id of [14, 25]) {
      const c = (await api.getCause(id))!;
      expect(c.status).toBe("verified");
      expect(c.stage).toBe("verified");
      expect(c.checksDone).toBe(c.checksTotal);
      for (const code of ["C1", "C2", "C3", "C4"] as const) expect(claimOf(c, code)?.outcome).toBe("verified");
      expect(c.badges.taxExempt).toBe(true);
      expect(typeof c.givenUsd).toBe("string");
    }
  });

  it("pauses perhentian-turtle-project with its concern", async () => {
    const c = (await api.getCause(4))!;
    expect(c.status).toBe("suspended");
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
    expect(home.feed).toHaveLength(24);
    expect(home.feed.some((c) => c.id === home.urgent?.cause.id)).toBe(false);
    expect(home.new).toHaveLength(6);
    expect(home.stats.causes).toBe(43);
  });

  it("builds claim workspaces with evidence, paths, tallies and one open challenge", async () => {
    const ws = (await api.getClaim(33, "C3"))!;
    expect(ws.claim.state).toBe("voting");
    expect(ws.paths.length).toBeGreaterThanOrEqual(2);
    expect(ws.paths[0]?.body.steps.length).toBeGreaterThan(0);
    expect(ws.tally.quorumMet).toBe(true);
    expect(ws.tally.passed).toBe(true);
    expect(ws.decidedBy).toBe("stewards");
    const challenged = await api.listClaims("challenged");
    expect(challenged).toHaveLength(1);
    expect(challenged[0]?.cause.slug).toBe("teach-for-malaysia");
    expect(challenged[0]?.cause.category).toBe("children");
    for (const tab of ["needs_evidence", "needs_checking", "open_for_votes", "recently_verified"] as const) {
      expect((await api.listClaims(tab)).length).toBeGreaterThan(0);
    }
    expect(CLAIMS).toHaveLength(7);
  });

  it("signs in the demo wallet with gSera, reputation 3, two gifts and three agreed paths", async () => {
    const me = await api.getMe();
    expect(me.wallet).toBe(DEMO_WALLET);
    expect(me.reputation).toBe(3);
    expect(me.gifts).toHaveLength(2);
    expect(me.paths.filter((p) => p.outcomeAgreed)).toHaveLength(3);
    expect(me.gsera?.spendable).toBeGreaterThan(0);
    expect(me.ledger.credited).toBeGreaterThan(0);
    expect(me.eligibility.canVote).toBe(true);
    expect(me.causes.some((c) => c.slug === "mercy-malaysia")).toBe(true);
    // Helping shows as Care XP on community.sera.cx, not as gSera.
    expect(me.xp.site).toBe("community.sera.cx");
    expect(me.xp.mode).toBe("queue");
    expect(me.xp.total).toBe(me.xp.queued);
    expect(me.xp.total).toBeGreaterThan(0);
    expect(me.xp.events.every((e) => e.eventType.startsWith("care_"))).toBe(true);
    expect(me.ledger.entries.every((l) => ["gift", "challenge_stake", "challenge_stake_return"].includes(l.reason))).toBe(true);
    const helpers = await api.getLeaderboards("helpers", "all");
    if (helpers.board !== "helpers") throw new Error("expected the helpers board");
    expect(helpers.entries[0]!.xp).toBeGreaterThan(0);
  });

  it("locks the vote until the paths were opened, then records it", async () => {
    await expect(api.postVote({ causeId: 33, claim: "C3", epoch: 0, choice: "verified", reason: "Checked" })).rejects.toThrow(/paths/);
    await api.markPathsOpened(33, "C3");
    await api.postVote({ causeId: 33, claim: "C3", epoch: 0, choice: "verified", reason: "Checked" });
    const ws = (await api.getClaim(33, "C3"))!;
    expect(ws.votes.some((v) => v.voter === DEMO_WALLET)).toBe(true);
    await expect(api.postVote({ causeId: 33, claim: "C3", epoch: 0, choice: "verified", reason: "Again" })).rejects.toThrow(/already voted/);
  });

  it("quotes a swap when the cause keeps a different stablecoin and credits gSera on arrival", async () => {
    const usdt = MOCK_STABLECOINS.find((t) => t.symbol === "USDT")!;
    const quote = await api.quoteGift(2, usdt, "25000000");
    expect(quote.kind).toBe("swap");
    if (quote.kind !== "swap") throw new Error("expected a swap");
    expect(quote.to.symbol).toBe("MYRT");
    const before = (await api.getMe()).gsera!.spendable;
    const r = await api.submitGift(quote);
    expect(r.status).toBe("settled");
    const after = (await api.getMe()).gsera!.spendable;
    expect(after - before).toBeCloseTo(25 * 100 * 1.2 * 1.1, 6);
    const record = await api.getRecord(2);
    expect(record.at(-1)?.type).toBe("GiftReceived");
  });

  it("opens voting once two different wallets have signed paths, and the dashboard lists the owned causes", async () => {
    const before = (await api.getClaim(1, "C1"))!;
    expect(before.claim.state).toBe("open");
    const r = await api.postPath({
      causeId: 1,
      claim: "C1",
      epoch: 0,
      body: { source: "ROS", steps: ["Opened eROSES", "Searched"], exactQuery: "PPM-001", findings: "Found", matches: true, checkedAt: new Date().toISOString(), result: "verified", caveats: "", conflictOfInterest: "None" },
      screenshot: null,
      redactionConfirmed: true,
    });
    expect(r.path.author).toBe(DEMO_WALLET);
    const dash = await api.getDashboard();
    expect(dash.causes.map((c) => c.id).sort()).toEqual([1, 14]);
    expect(dash.tokens.length).toBe(4);
  });
});
