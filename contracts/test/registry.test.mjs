// Run: pnpm test  (compiles first, then runs on an in-process chain; no network needed)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import ganache from "ganache";
import { ethers } from "ethers";
import { readFileSync } from "node:fs";

const art = n => JSON.parse(readFileSync(new URL(`../build/${n}.json`, import.meta.url)));
const b32 = s => ethers.encodeBytes32String(s);
const DAY = 86400;

// Mirrors the Solidity enums.
const Status = { None: 0n, Listed: 1n, Verified: 2n, Suspended: 3n, Closed: 4n };
const C = { C1: 0, C2: 1, C3: 2, C4: 3, C5: 4, C6: 5, C7: 6 };
const O = { Open: 0n, Verified: 1n, NotVerified: 2n, NeedsMore: 3n };
const REQUIRED = [C.C1, C.C2, C.C3, C.C4];
const ROOT = ethers.keccak256(ethers.toUtf8Bytes("published inputs"));

// Ganache's exact gas estimate is sometimes a few gas short on calls that end with a refund,
// which makes a tx run out of gas at the limit. Pad every estimate so the suite is deterministic.
class PaddedProvider extends ethers.BrowserProvider {
  async estimateGas(tx) { return (await super.estimateGas(tx)) * 12n / 10n; }
}

let raw, provider, council, finaliser, steward, owner, payout, donor, donor2, stranger;
let reg, usdc, usdt;

async function deploy(name, signer, ...args) {
  const a = art(name);
  const c = await new ethers.ContractFactory(a.abi, a.bytecode, signer).deploy(...args);
  await c.waitForDeployment();
  return c;
}
async function warp(seconds) {
  await provider.send("evm_increaseTime", [seconds]);
  await provider.send("evm_mine", []);
}
async function rejects(p, errName) {
  await assert.rejects(p, e => {
    const s = JSON.stringify(e) + String(e?.message);
    const err = reg.interface.getError(errName);
    return err ? s.includes(err.selector) || s.includes(errName) : true;
  }, `expected ${errName}`);
}
async function eventsOf(tx, name) {
  const r = await tx.wait();
  return r.logs.map(l => { try { return reg.interface.parseLog(l); } catch { return null; } }).filter(e => e && e.name === name);
}
async function freshCause({ by = owner, to = payout.address, careLicence = false, category = "turtles" } = {}) {
  const tx = await reg.connect(by).listCause("ipfs://cause", to, b32(category), b32("causes.sera.cx"), careLicence);
  const [ev] = await eventsOf(tx, "CauseListed");
  return ev.args.causeId;
}
async function finalise(id, claims, outcome = O.Verified) {
  let last;
  for (const c of claims) last = await (await reg.connect(finaliser).finaliseClaim(id, c, outcome, ROOT)).wait();
  return last;
}
async function status(id) { return (await reg.getCause(id)).status; }
async function count(id) { return Array.from(await reg.verifiedRequiredCount(id), Number); }
async function give(id, who, token, amount, fe = "causes.sera.cx") {
  await (await token.connect(who).mint(who.address, amount)).wait();
  await (await token.connect(who).approve(await reg.getAddress(), amount)).wait();
  return reg.connect(who).donate(id, await token.getAddress(), amount, b32(fe));
}

before(async () => {
  raw = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 8 }, chain: { hardfork: "merge" } });
  provider = new PaddedProvider(raw, undefined, { pollingInterval: 20, cacheTimeout: -1 });
  [council, finaliser, steward, owner, payout, donor, donor2, stranger] =
    await Promise.all([0, 1, 2, 3, 4, 5, 6, 7].map(i => provider.getSigner(i)));
  reg = await deploy("CauseRegistry", council, council.address);
  usdc = await deploy("MockStable", council, "USD Coin", "USDC");
  usdt = await deploy("MockUSDT", council);
  await (await reg.setFinaliser(finaliser.address, true)).wait();
  await (await reg.setSteward(steward.address, true)).wait();
  await (await reg.setToken(await usdc.getAddress(), true)).wait();
  await (await reg.setToken(await usdt.getAddress(), true)).wait();
});

after(async () => {
  await raw.disconnect();
  // Ganache can keep the event loop alive after disconnect; do not let the runner hang.
  setTimeout(() => process.exit(process.exitCode ?? 0), 500).unref();
});

// ---------------------------------------------------------------- ported from v0.1

test("anyone can list a cause and every front end sees the same event", async () => {
  const tx = await reg.connect(stranger).listCause("ipfs://kasih-v1", payout.address, b32("turtles"), b32("youapp.ai"), false);
  const [ev] = await eventsOf(tx, "CauseListed");
  assert.equal(ev.args.owner, stranger.address);
  assert.equal(ethers.decodeBytes32String(ev.args.frontend), "youapp.ai");
  const c = await reg.getCause(ev.args.causeId);
  assert.equal(c.status, Status.Listed);
  assert.equal(c.uri, "ipfs://kasih-v1");
  assert.equal(await reg.requiresCareLicence(ev.args.causeId), false);
  assert.equal((await eventsOf(tx, "RequiresCareLicenceSet")).length, 0);
});

test("gifts to a listed cause are held; it cannot claim until verified", async () => {
  const id = await freshCause();
  await (await give(id, donor, usdc, 50_000000n)).wait();
  assert.equal(await reg.held(id, await usdc.getAddress()), 50_000000n);
  await rejects(reg.connect(owner).claim(id, await usdc.getAddress()), "WrongStatus");
});

test("only a finaliser can finalise claims; once verified, the payout address receives the claim", async () => {
  const id = await freshCause();
  await (await give(id, donor, usdc, 120_000000n)).wait();
  await rejects(reg.connect(stranger).finaliseClaim(id, C.C1, O.Verified, ROOT), "NotFinaliser");
  await finalise(id, REQUIRED);
  assert.equal(await status(id), Status.Verified);
  const before = await usdc.balanceOf(payout.address);
  await (await reg.connect(owner).claim(id, await usdc.getAddress())).wait();
  assert.equal(await usdc.balanceOf(payout.address) - before, 120_000000n);
  assert.equal(await reg.held(id, await usdc.getAddress()), 0n);
});

test("USDT (no return value) works for donate and claim", async () => {
  const id = await freshCause();
  await (await give(id, donor, usdt, 7_000000n)).wait();
  await finalise(id, REQUIRED);
  await (await reg.connect(payout).claim(id, await usdt.getAddress())).wait();
  assert.equal(await usdt.balanceOf(payout.address), 7_000000n);
});

test("tokens the council has not accepted are refused", async () => {
  const id = await freshCause();
  const meme = await deploy("MockStable", council, "Pepe", "PEPE");
  await (await meme.mint(donor.address, 1000n)).wait();
  await (await meme.connect(donor).approve(await reg.getAddress(), 1000n)).wait();
  await rejects(reg.connect(donor).donate(id, await meme.getAddress(), 1000n, b32("causes.sera.cx")), "TokenNotAccepted");
});

test("givers can take gifts back after 90 days without verification, not before", async () => {
  const id = await freshCause();
  await (await give(id, donor2, usdc, 30_000000n)).wait();
  await rejects(reg.connect(donor2).refund(id, await usdc.getAddress()), "NotRefundable");
  await warp(90 * DAY);
  const before = await usdc.balanceOf(donor2.address);
  await (await reg.connect(donor2).refund(id, await usdc.getAddress())).wait();
  assert.equal(await usdc.balanceOf(donor2.address) - before, 30_000000n);
  await rejects(reg.connect(donor2).refund(id, await usdc.getAddress()), "NothingToMove");
});

test("changing the payout address drops verification so a stolen key cannot redirect funds", async () => {
  const id = await freshCause();
  await finalise(id, REQUIRED);
  await (await give(id, donor, usdc, 10_000000n)).wait();
  const tx = await reg.connect(owner).setPayout(id, stranger.address);
  const [ev] = await eventsOf(tx, "StatusChanged");
  assert.equal(ev.args.status, Status.Listed);
  assert.equal(await status(id), Status.Listed);
  await rejects(reg.connect(stranger).claim(id, await usdc.getAddress()), "WrongStatus");
  assert.equal(await reg.refundable(id), false); // fresh 90-day clock, not instantly refundable
});

test("a steward suspending opens refunds right away, capped at what is still in escrow", async () => {
  const id = await freshCause();
  await (await give(id, donor, usdc, 40_000000n)).wait();
  await (await give(id, donor2, usdc, 60_000000n)).wait();
  await finalise(id, REQUIRED);
  await (await reg.connect(owner).claim(id, await usdc.getAddress())).wait(); // all 100 claimed
  await (await give(id, donor, usdc, 5_000000n)).wait();                      // 5 more arrives
  await (await reg.connect(steward).suspend(id, "documents lapsed")).wait();
  assert.equal(await status(id), Status.Suspended);
  const before = await usdc.balanceOf(donor.address);
  await (await reg.connect(donor).refund(id, await usdc.getAddress())).wait();
  assert.equal(await usdc.balanceOf(donor.address) - before, 5_000000n);      // capped at escrow
  await rejects(reg.connect(donor).donate(id, await usdc.getAddress(), 1n, b32("x")), "WrongStatus");
});

test("anyone can attest; only the owner posts progress and needs; anyone can pledge", async () => {
  const id = await freshCause();
  const t1 = await reg.connect(stranger).attest(id, b32("site-visit"), "ipfs://visit-photos");
  assert.equal((await eventsOf(t1, "Attested")).length, 1);
  await rejects(reg.connect(stranger).postProgress(id, b32("report"), "ipfs://r"), "NotOwner");
  const t2 = await reg.connect(owner).postProgress(id, b32("stream"), "https://youtube.com/live/abc");
  assert.equal(ethers.decodeBytes32String((await eventsOf(t2, "ProgressPosted"))[0].args.kind), "stream");
  const t3 = await reg.connect(owner).postNeed(id, "ipfs://need-volunteers-release-night");
  const needId = (await eventsOf(t3, "NeedPosted"))[0].args.needId;
  await (await reg.connect(donor).pledge(needId, "ipfs://i-can-film")).wait();
  await rejects(reg.connect(donor).closeNeed(needId, donor.address), "NotOwner");
  await (await reg.connect(owner).closeNeed(needId, donor.address)).wait();
  await rejects(reg.connect(donor2).pledge(needId, "ipfs://late"), "BadInput");
});

test("only the council manages finalisers, stewards, tokens and itself", async () => {
  await rejects(reg.connect(stranger).setFinaliser(stranger.address, true), "NotCouncil");
  await rejects(reg.connect(stranger).setSteward(stranger.address, true), "NotCouncil");
  await rejects(reg.connect(stranger).setToken(stranger.address, true), "NotCouncil");
  await rejects(reg.connect(stranger).setCouncil(stranger.address), "NotCouncil");
  await rejects(reg.connect(finaliser).setSteward(stranger.address, true), "NotCouncil");
  await rejects(reg.connect(steward).setFinaliser(stranger.address, true), "NotCouncil");
  const t = await reg.connect(council).setFinaliser(donor.address, true);
  assert.equal((await eventsOf(t, "FinaliserSet"))[0].args.on, true);
  await (await reg.connect(council).setFinaliser(donor.address, false)).wait();
  assert.equal(await reg.isFinaliser(donor.address), false);
});

// ---------------------------------------------------------------- v1.1: per-claim verification

test("per-claim finalisation flips status automatically once every required claim is verified", async () => {
  const id = await freshCause();
  let done, total;
  for (const [i, c] of REQUIRED.entries()) {
    const r = await finalise(id, [c]);
    const ev = r.logs.map(l => { try { return reg.interface.parseLog(l); } catch { return null; } }).filter(Boolean);
    assert.equal(ev.find(e => e.name === "ClaimFinalised").args.by, finaliser.address);
    [done, total] = await count(id);
    assert.equal(done, i + 1);
    assert.equal(total, 4);
    if (i < 3) {
      assert.equal(await status(id), Status.Listed);
      assert.equal(await reg.requiredClaimsMet(id), false);
      assert.equal(ev.some(e => e.name === "StatusChanged"), false);
    } else {
      const sc = ev.find(e => e.name === "StatusChanged");
      assert.equal(sc.args.status, Status.Verified);
      assert.equal(sc.args.note, "all required claims verified");
      assert.equal(await reg.requiredClaimsMet(id), true);
    }
  }
  const c = await reg.getCause(id);
  assert.equal(c.status, Status.Verified);
  assert.ok(c.verifiedAt > 0n);
  assert.equal(await reg.claimOutcome(id, C.C1), O.Verified);
});

test("overturning a required claim on a verified cause suspends it and opens refunds", async () => {
  const id = await freshCause();
  await (await give(id, donor, usdc, 25_000000n)).wait();
  await finalise(id, REQUIRED);
  assert.equal(await reg.refundable(id), false);
  const r = await finalise(id, [C.C2], O.NotVerified);
  const sc = r.logs.map(l => reg.interface.parseLog(l)).find(e => e?.name === "StatusChanged");
  assert.equal(sc.args.status, Status.Suspended);
  assert.equal(sc.args.note, "required claim overturned");
  assert.equal(await reg.refundable(id), true);
  const before = await usdc.balanceOf(donor.address);
  await (await reg.connect(donor).refund(id, await usdc.getAddress())).wait();
  assert.equal(await usdc.balanceOf(donor.address) - before, 25_000000n);
  await rejects(reg.connect(owner).claim(id, await usdc.getAddress()), "WrongStatus");
});

test("a payout change reopens C3 only; verifying C3 again restores Verified", async () => {
  const id = await freshCause();
  await finalise(id, REQUIRED);
  await (await reg.connect(owner).setPayout(id, donor2.address)).wait();
  assert.equal(await reg.claimOutcome(id, C.C3), O.Open);
  assert.equal(await reg.claimOutcome(id, C.C1), O.Verified);
  assert.equal(await reg.claimOutcome(id, C.C4), O.Verified);
  const [done, total] = await count(id);
  assert.equal(done, 3); assert.equal(total, 4);
  assert.equal(await status(id), Status.Listed);
  await finalise(id, [C.C3]);
  assert.equal(await status(id), Status.Verified);
  assert.equal((await reg.getCause(id)).payout, donor2.address);
});

test("reinstate re-verifies when claims still hold, and only re-lists when they do not", async () => {
  // Claims still hold: steward paused for an unrelated report, then lifts it.
  const a = await freshCause();
  await finalise(a, REQUIRED);
  await (await reg.connect(steward).suspend(a, "report under review")).wait();
  const r = await reg.connect(steward).reinstate(a);
  const evs = await eventsOf(r, "StatusChanged");
  assert.deepEqual(evs.map(e => e.args.status), [Status.Listed, Status.Verified]);
  assert.equal(await status(a), Status.Verified);
  await rejects(reg.connect(steward).reinstate(a), "WrongStatus"); // not suspended any more

  // Claims do not hold: overturned, so reinstate only goes back to Listed with a fresh clock.
  const b = await freshCause();
  await finalise(b, REQUIRED);
  await finalise(b, [C.C4], O.NotVerified);
  assert.equal(await status(b), Status.Suspended);
  await warp(100 * DAY);
  await (await reg.connect(steward).reinstate(b)).wait();
  assert.equal(await status(b), Status.Listed);
  assert.equal(await reg.refundable(b), false); // fresh waitingSince
  await finalise(b, [C.C4]);
  assert.equal(await status(b), Status.Verified);
});

test("only a finaliser finalises; only a steward pauses, reinstates, closes and flags", async () => {
  const id = await freshCause();
  for (const who of [stranger, steward, council, owner]) {
    await rejects(reg.connect(who).finaliseClaim(id, C.C1, O.Verified, ROOT), "NotFinaliser");
  }
  for (const who of [stranger, finaliser, council, owner]) {
    await rejects(reg.connect(who).suspend(id, "x"), "NotSteward");
    await rejects(reg.connect(who).reinstate(id), "NotSteward");
    await rejects(reg.connect(who).closeBySteward(id, "x"), "NotSteward");
    await rejects(reg.connect(who).setRequiresCareLicence(id, true), "NotSteward");
  }
});

test("C6 (care licence) is required only when the cause is flagged", async () => {
  // Flagged at listing: a children's home needs five claims.
  const home = await freshCause({ careLicence: true, category: "children" });
  assert.equal(await reg.requiresCareLicence(home), true);
  assert.equal(await reg.isRequired(home, C.C6), true);
  await finalise(home, REQUIRED);
  assert.equal(await status(home), Status.Listed);
  let [done, total] = await count(home);
  assert.equal(done, 4); assert.equal(total, 5);
  await finalise(home, [C.C6]);
  assert.equal(await status(home), Status.Verified);

  // Not flagged: C6 is ignored, four claims are enough.
  const society = await freshCause();
  assert.equal(await reg.isRequired(society, C.C6), false);
  for (const c of REQUIRED) assert.equal(await reg.isRequired(society, c), true);
  assert.equal(await reg.isRequired(society, C.C5), false);
  assert.equal(await reg.isRequired(society, C.C7), false);
  await finalise(society, [C.C6], O.NotVerified); // irrelevant claim, no effect
  await finalise(society, REQUIRED);
  assert.equal(await status(society), Status.Verified);
  [done, total] = await count(society);
  assert.equal(done, 4); assert.equal(total, 4);
});

test("a steward can flag or unflag a care licence and the status follows", async () => {
  const id = await freshCause();
  await finalise(id, REQUIRED);
  assert.equal(await status(id), Status.Verified);
  const t = await reg.connect(steward).setRequiresCareLicence(id, true);
  assert.equal((await eventsOf(t, "RequiresCareLicenceSet"))[0].args.on, true);
  assert.equal(await status(id), Status.Listed);          // C6 now required and not verified
  assert.equal(await reg.refundable(id), false);          // fresh clock, as on any drop from Verified
  await (await reg.connect(steward).setRequiresCareLicence(id, false)).wait();
  assert.equal(await status(id), Status.Verified);        // claims met again
});

test("badge claims C5 and C7 never change status, in either direction", async () => {
  const id = await freshCause();
  await finalise(id, [C.C5, C.C7]);
  assert.equal(await status(id), Status.Listed);
  await finalise(id, REQUIRED);
  await finalise(id, [C.C5, C.C7], O.NotVerified);
  assert.equal(await status(id), Status.Verified);
  assert.equal(await reg.claimOutcome(id, C.C5), O.NotVerified);
});

test("reopening a required claim (NeedsMore) on a verified cause drops it to Listed without suspending", async () => {
  const id = await freshCause();
  await finalise(id, REQUIRED);
  const r = await finalise(id, [C.C4], O.NeedsMore);
  const sc = r.logs.map(l => reg.interface.parseLog(l)).find(e => e?.name === "StatusChanged");
  assert.equal(sc.args.status, Status.Listed);
  assert.equal(sc.args.note, "required claim reopened");
  assert.equal(await reg.refundable(id), false);
  await (await give(id, donor, usdc, 1_000000n)).wait(); // still accepts gifts
  await finalise(id, [C.C4]);
  assert.equal(await status(id), Status.Verified);
});

test("closing by owner or steward opens refunds; closed causes take no more results", async () => {
  const a = await freshCause();
  await (await give(a, donor, usdc, 3_000000n)).wait();
  await (await reg.connect(owner).closeCause(a)).wait();
  assert.equal(await status(a), Status.Closed);
  assert.equal(await reg.refundable(a), true);
  await rejects(reg.connect(owner).closeCause(a), "WrongStatus");
  await rejects(reg.connect(finaliser).finaliseClaim(a, C.C1, O.Verified, ROOT), "WrongStatus");
  await rejects(reg.connect(steward).suspend(a, "x"), "WrongStatus");

  const b = await freshCause();
  await finalise(b, REQUIRED);
  const t = await reg.connect(steward).closeBySteward(b, "legal notice");
  const [ev] = await eventsOf(t, "StatusChanged");
  assert.equal(ev.args.note, "legal notice");
  assert.equal(ev.args.by, steward.address);
  assert.equal(await status(b), Status.Closed);
  await rejects(reg.connect(steward).closeBySteward(b, "again"), "WrongStatus");
  await rejects(reg.connect(owner).claim(b, await usdc.getAddress()), "WrongStatus");
});

test("ownership transfer hands over the owner powers and nothing else", async () => {
  const id = await freshCause();
  await (await reg.connect(owner).transferCauseOwnership(id, donor2.address)).wait();
  await rejects(reg.connect(owner).updateCause(id, "ipfs://v2"), "NotOwner");
  await (await reg.connect(donor2).updateCause(id, "ipfs://v2")).wait();
  assert.equal((await reg.getCause(id)).uri, "ipfs://v2");
  assert.equal((await reg.getCause(id)).owner, donor2.address);
  await rejects(reg.connect(donor2).finaliseClaim(id, C.C1, O.Verified, ROOT), "NotFinaliser");
});
