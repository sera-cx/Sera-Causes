// Run: pnpm test  (compiles first, then runs on an in-process chain; no network needed)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import ganache from "ganache";
import { ethers } from "ethers";
import { readFileSync } from "node:fs";

const art = n => JSON.parse(readFileSync(new URL(`../build/${n}.json`, import.meta.url)));
const b32 = s => ethers.encodeBytes32String(s);

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

let raw, provider, council, finaliser, steward, owner, deposit, helper, stranger;
let reg;

async function deploy(name, signer, ...args) {
  const a = art(name);
  const c = await new ethers.ContractFactory(a.abi, a.bytecode, signer).deploy(...args);
  await c.waitForDeployment();
  return c;
}
async function rejects(p, errName) {
  await assert.rejects(p, e => {
    const s = JSON.stringify(e, (_, v) => typeof v === "bigint" ? v.toString() : v) + String(e?.message);
    const err = reg.interface.getError(errName);
    return err ? s.includes(err.selector) || s.includes(errName) : true;
  }, `expected ${errName}`);
}
const parsed = r => r.logs.map(l => { try { return reg.interface.parseLog(l); } catch { return null; } }).filter(Boolean);
async function eventsOf(tx, name) {
  return parsed(await tx.wait()).filter(e => e.name === name);
}
async function freshCause({ by = owner, to = deposit.address, careLicence = false, category = "turtles" } = {}) {
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

before(async () => {
  raw = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 8 }, chain: { hardfork: "merge" } });
  provider = new PaddedProvider(raw, undefined, { pollingInterval: 20, cacheTimeout: -1 });
  [council, finaliser, steward, owner, deposit, helper, stranger] =
    await Promise.all([0, 1, 2, 3, 4, 5, 6].map(i => provider.getSigner(i)));
  reg = await deploy("CauseRegistry", council, council.address);
  await (await reg.setFinaliser(finaliser.address, true)).wait();
  await (await reg.setSteward(steward.address, true)).wait();
});

after(async () => {
  await raw.disconnect();
  // Ganache can keep the event loop alive after disconnect; do not let the runner hang.
  setTimeout(() => process.exit(process.exitCode ?? 0), 500).unref();
});

// ---------------------------------------------------------------- listing and ownership

test("anyone can list a cause and every front end sees the same event", async () => {
  const tx = await reg.connect(stranger).listCause("ipfs://kasih-v1", deposit.address, b32("turtles"), b32("youapp.ai"), false);
  const [ev] = await eventsOf(tx, "CauseListed");
  assert.equal(ev.args.owner, stranger.address);
  assert.equal(ev.args.payout, deposit.address);
  assert.equal(ethers.decodeBytes32String(ev.args.frontend), "youapp.ai");
  const c = await reg.getCause(ev.args.causeId);
  assert.equal(c.status, Status.Listed);
  assert.equal(c.uri, "ipfs://kasih-v1");
  assert.equal(c.payout, deposit.address);
  assert.ok(c.listedAt > 0n);
  assert.equal(c.verifiedAt, 0n);
  assert.equal(await reg.requiresCareLicence(ev.args.causeId), false);
  assert.equal((await eventsOf(tx, "RequiresCareLicenceSet")).length, 0);
  await rejects(reg.connect(stranger).listCause("", deposit.address, b32("x"), b32("x"), false), "BadInput");
  await rejects(reg.connect(stranger).listCause("ipfs://x", ethers.ZeroAddress, b32("x"), b32("x"), false), "BadInput");
  await rejects(reg.getCause(999999), "NoSuchCause");
});

test("only the owner updates the profile; ownership transfer hands over the owner powers", async () => {
  const id = await freshCause();
  await rejects(reg.connect(stranger).updateCause(id, "ipfs://v2"), "NotOwner");
  await (await reg.connect(owner).updateCause(id, "ipfs://v2")).wait();
  assert.equal((await reg.getCause(id)).uri, "ipfs://v2");
  const t = await reg.connect(owner).transferCauseOwnership(id, helper.address);
  assert.equal((await eventsOf(t, "OwnerChanged"))[0].args.owner, helper.address);
  await rejects(reg.connect(owner).updateCause(id, "ipfs://v3"), "NotOwner");
  await (await reg.connect(helper).updateCause(id, "ipfs://v3")).wait();
  assert.equal((await reg.getCause(id)).owner, helper.address);
  await rejects(reg.connect(helper).finaliseClaim(id, C.C1, O.Verified, ROOT), "NotFinaliser");
});

test("changing the deposit address drops Verified and reopens C3 only", async () => {
  const id = await freshCause();
  await finalise(id, REQUIRED);
  assert.equal(await status(id), Status.Verified);
  await rejects(reg.connect(stranger).setPayout(id, stranger.address), "NotOwner");
  await rejects(reg.connect(owner).setPayout(id, ethers.ZeroAddress), "BadInput");
  const tx = await reg.connect(owner).setPayout(id, stranger.address);
  const r = parsed(await tx.wait());
  assert.equal(r.find(e => e.name === "PayoutChanged").args.payout, stranger.address);
  const sc = r.find(e => e.name === "StatusChanged");
  assert.equal(sc.args.status, Status.Listed);
  assert.equal(sc.args.note, "payout changed, needs re-verification");
  assert.equal((await reg.getCause(id)).payout, stranger.address);
  assert.equal(await reg.claimOutcome(id, C.C3), O.Open);
  assert.equal(await reg.claimOutcome(id, C.C1), O.Verified);
  assert.equal(await reg.claimOutcome(id, C.C4), O.Verified);
  assert.deepEqual(await count(id), [3, 4]);
  // verifying C3 again is all it takes
  await finalise(id, [C.C3]);
  assert.equal(await status(id), Status.Verified);
  // on a Listed cause it just resets C3, no status event
  const b = await freshCause();
  await finalise(b, [C.C3]);
  const t2 = await reg.connect(owner).setPayout(b, helper.address);
  assert.equal((await eventsOf(t2, "StatusChanged")).length, 0);
  assert.equal(await reg.claimOutcome(b, C.C3), O.Open);
});

// ---------------------------------------------------------------- claims and status

test("only a finaliser can finalise claims", async () => {
  const id = await freshCause();
  for (const who of [stranger, steward, council, owner]) {
    await rejects(reg.connect(who).finaliseClaim(id, C.C1, O.Verified, ROOT), "NotFinaliser");
  }
  await rejects(reg.connect(finaliser).finaliseClaim(999999, C.C1, O.Verified, ROOT), "NoSuchCause");
  const r = await finalise(id, [C.C1]);
  const ev = parsed(r).find(e => e.name === "ClaimFinalised");
  assert.equal(ev.args.causeId, id);
  assert.equal(ev.args.claim, BigInt(C.C1));
  assert.equal(ev.args.outcome, O.Verified);
  assert.equal(ev.args.resultRoot, ROOT);
  assert.equal(ev.args.by, finaliser.address);
});

test("per-claim finalisation flips status automatically once every required claim is verified", async () => {
  const id = await freshCause();
  for (const [i, c] of REQUIRED.entries()) {
    const ev = parsed(await finalise(id, [c]));
    assert.deepEqual(await count(id), [i + 1, 4]);
    if (i < 3) {
      assert.equal(await status(id), Status.Listed);
      assert.equal(await reg.requiredClaimsMet(id), false);
      assert.equal(ev.some(e => e.name === "StatusChanged"), false);
    } else {
      const sc = ev.find(e => e.name === "StatusChanged");
      assert.equal(sc.args.status, Status.Verified);
      assert.equal(sc.args.note, "all required claims verified");
      assert.equal(sc.args.by, finaliser.address);
      assert.equal(await reg.requiredClaimsMet(id), true);
    }
  }
  const c = await reg.getCause(id);
  assert.equal(c.status, Status.Verified);
  assert.ok(c.verifiedAt >= c.listedAt && c.verifiedAt > 0n);
  // re-finalising an already verified claim is a no-op for status
  const again = parsed(await finalise(id, [C.C2]));
  assert.equal(again.some(e => e.name === "StatusChanged"), false);
});

test("overturning a required claim on a verified cause suspends it", async () => {
  const id = await freshCause();
  await finalise(id, REQUIRED);
  const r = parsed(await finalise(id, [C.C2], O.NotVerified));
  const sc = r.find(e => e.name === "StatusChanged");
  assert.equal(sc.args.status, Status.Suspended);
  assert.equal(sc.args.note, "required claim overturned");
  assert.equal(await status(id), Status.Suspended);
  assert.deepEqual(await count(id), [3, 4]);
  // a suspended cause still records outcomes but does not change status on its own
  const r2 = parsed(await finalise(id, [C.C2]));
  assert.equal(r2.some(e => e.name === "StatusChanged"), false);
  assert.equal(await status(id), Status.Suspended);
  assert.equal(await reg.requiredClaimsMet(id), true);
  // overturning a claim on a Listed cause just records it
  const b = await freshCause();
  const r3 = parsed(await finalise(b, [C.C1], O.NotVerified));
  assert.equal(r3.some(e => e.name === "StatusChanged"), false);
  assert.equal(await status(b), Status.Listed);
});

test("reopening a required claim (NeedsMore or Open) on a verified cause drops it to Listed without suspending", async () => {
  const id = await freshCause();
  await finalise(id, REQUIRED);
  const sc = parsed(await finalise(id, [C.C4], O.NeedsMore)).find(e => e.name === "StatusChanged");
  assert.equal(sc.args.status, Status.Listed);
  assert.equal(sc.args.note, "required claim reopened");
  await finalise(id, [C.C4]);
  assert.equal(await status(id), Status.Verified);
  await finalise(id, [C.C1], O.Open);
  assert.equal(await status(id), Status.Listed);
  assert.deepEqual(await count(id), [3, 4]);
});

test("badge claims C5 and C7 never change status, in either direction", async () => {
  const id = await freshCause();
  await finalise(id, [C.C5, C.C7]);
  assert.equal(await status(id), Status.Listed);
  assert.deepEqual(await count(id), [0, 4]);
  await finalise(id, REQUIRED);
  const r = parsed(await finalise(id, [C.C5, C.C7], O.NotVerified));
  assert.equal(r.some(e => e.name === "StatusChanged"), false);
  assert.equal(await status(id), Status.Verified);
  assert.equal(await reg.claimOutcome(id, C.C5), O.NotVerified);
  assert.equal(await reg.claimOutcome(id, C.C7), O.NotVerified);
});

test("C6 (care licence) is required only when the cause is flagged", async () => {
  // Flagged at listing: a children's home needs five claims.
  const tx = await reg.connect(owner).listCause("ipfs://home", deposit.address, b32("children"), b32("causes.sera.cx"), true);
  const home = (await eventsOf(tx, "CauseListed"))[0].args.causeId;
  assert.equal((await eventsOf(tx, "RequiresCareLicenceSet"))[0].args.on, true);
  assert.equal(await reg.requiresCareLicence(home), true);
  assert.equal(await reg.isRequired(home, C.C6), true);
  await finalise(home, REQUIRED);
  assert.equal(await status(home), Status.Listed);
  assert.deepEqual(await count(home), [4, 5]);
  await finalise(home, [C.C6]);
  assert.equal(await status(home), Status.Verified);
  await finalise(home, [C.C6], O.NotVerified);
  assert.equal(await status(home), Status.Suspended);

  // Not flagged: C6 is ignored, four claims are enough.
  const society = await freshCause();
  assert.equal(await reg.isRequired(society, C.C6), false);
  for (const c of REQUIRED) assert.equal(await reg.isRequired(society, c), true);
  assert.equal(await reg.isRequired(society, C.C5), false);
  assert.equal(await reg.isRequired(society, C.C7), false);
  await finalise(society, [C.C6], O.NotVerified); // irrelevant claim, no effect
  await finalise(society, REQUIRED);
  assert.equal(await status(society), Status.Verified);
  assert.deepEqual(await count(society), [4, 4]);
});

test("a steward can flag or unflag a care licence and the status follows", async () => {
  const id = await freshCause();
  await finalise(id, REQUIRED);
  const t = await reg.connect(steward).setRequiresCareLicence(id, true);
  const r = parsed(await t.wait());
  assert.equal(r.find(e => e.name === "RequiresCareLicenceSet").args.on, true);
  assert.equal(r.find(e => e.name === "StatusChanged").args.note, "care licence now required");
  assert.equal(await status(id), Status.Listed);
  assert.deepEqual(await count(id), [4, 5]);
  await (await reg.connect(steward).setRequiresCareLicence(id, false)).wait();
  assert.equal(await status(id), Status.Verified);        // claims met again
  // toggling on a Listed cause with no claims changes nothing but the flag
  const b = await freshCause();
  const t2 = await reg.connect(steward).setRequiresCareLicence(b, true);
  assert.equal((await eventsOf(t2, "StatusChanged")).length, 0);
  assert.equal(await reg.requiresCareLicence(b), true);
});

// ---------------------------------------------------------------- stewards

test("only a steward pauses, reinstates, closes and flags", async () => {
  const id = await freshCause();
  for (const who of [stranger, finaliser, council, owner]) {
    await rejects(reg.connect(who).suspend(id, "x"), "NotSteward");
    await rejects(reg.connect(who).reinstate(id), "NotSteward");
    await rejects(reg.connect(who).closeBySteward(id, "x"), "NotSteward");
    await rejects(reg.connect(who).setRequiresCareLicence(id, true), "NotSteward");
  }
  await rejects(reg.connect(steward).suspend(999999, "x"), "NoSuchCause");
});

test("a steward can pause a cause with a written reason; a paused cause takes no further status changes", async () => {
  const id = await freshCause();
  await finalise(id, REQUIRED);
  const t = await reg.connect(steward).suspend(id, "credible fraud report");
  const [ev] = await eventsOf(t, "StatusChanged");
  assert.equal(ev.args.status, Status.Suspended);
  assert.equal(ev.args.note, "credible fraud report");
  assert.equal(ev.args.by, steward.address);
  await rejects(reg.connect(steward).suspend(id, "again"), "WrongStatus");
  // the owner cannot talk their way out of it; only reinstate or close move it on
  await (await reg.connect(owner).updateCause(id, "ipfs://v2")).wait(); // profile edits still allowed
  assert.equal(await status(id), Status.Suspended);
});

test("reinstate re-verifies when claims still hold, and only re-lists when they do not", async () => {
  // Claims still hold: steward paused for an unrelated report, then lifts it.
  const a = await freshCause();
  await finalise(a, REQUIRED);
  await (await reg.connect(steward).suspend(a, "report under review")).wait();
  const evs = await eventsOf(await reg.connect(steward).reinstate(a), "StatusChanged");
  assert.deepEqual(evs.map(e => e.args.status), [Status.Listed, Status.Verified]);
  assert.deepEqual(evs.map(e => e.args.note), ["reinstated by steward", "all required claims verified"]);
  assert.equal(await status(a), Status.Verified);
  await rejects(reg.connect(steward).reinstate(a), "WrongStatus"); // not suspended any more

  // Claims do not hold: overturned, so reinstate only goes back to Listed.
  const b = await freshCause();
  await finalise(b, REQUIRED);
  await finalise(b, [C.C4], O.NotVerified);
  assert.equal(await status(b), Status.Suspended);
  const evs2 = await eventsOf(await reg.connect(steward).reinstate(b), "StatusChanged");
  assert.deepEqual(evs2.map(e => e.args.status), [Status.Listed]);
  assert.equal(await status(b), Status.Listed);
  await finalise(b, [C.C4]);
  assert.equal(await status(b), Status.Verified);
});

test("closing by owner or steward is final; closed causes take no more results or status changes", async () => {
  const a = await freshCause();
  const t = await reg.connect(owner).closeCause(a);
  assert.equal((await eventsOf(t, "StatusChanged"))[0].args.note, "closed by owner");
  assert.equal(await status(a), Status.Closed);
  await rejects(reg.connect(owner).closeCause(a), "WrongStatus");
  await rejects(reg.connect(finaliser).finaliseClaim(a, C.C1, O.Verified, ROOT), "WrongStatus");
  await rejects(reg.connect(steward).suspend(a, "x"), "WrongStatus");
  await rejects(reg.connect(steward).reinstate(a), "WrongStatus");
  await rejects(reg.connect(steward).closeBySteward(a, "again"), "WrongStatus");
  await rejects(reg.connect(stranger).closeCause(a), "NotOwner");

  const b = await freshCause();
  await finalise(b, REQUIRED);
  const t2 = await reg.connect(steward).closeBySteward(b, "legal notice");
  const [ev] = await eventsOf(t2, "StatusChanged");
  assert.equal(ev.args.note, "legal notice");
  assert.equal(ev.args.by, steward.address);
  assert.equal(await status(b), Status.Closed);
  // a suspended cause can also be closed by a steward
  const c = await freshCause();
  await (await reg.connect(steward).suspend(c, "x")).wait();
  await (await reg.connect(steward).closeBySteward(c, "y")).wait();
  assert.equal(await status(c), Status.Closed);
});

// ---------------------------------------------------------------- record: attestations, progress, needs

test("anyone can attest; only the owner posts progress and needs; anyone can pledge", async () => {
  const id = await freshCause();
  const t1 = await reg.connect(stranger).attest(id, b32("site-visit"), "ipfs://visit-photos");
  const [at] = await eventsOf(t1, "Attested");
  assert.equal(at.args.attester, stranger.address);
  assert.equal(ethers.decodeBytes32String(at.args.kind), "site-visit");
  await rejects(reg.connect(stranger).attest(999999, b32("x"), "ipfs://x"), "NoSuchCause");
  await rejects(reg.connect(stranger).postProgress(id, b32("report"), "ipfs://r"), "NotOwner");
  await rejects(reg.connect(owner).postProgress(id, b32("report"), ""), "BadInput");
  const t2 = await reg.connect(owner).postProgress(id, b32("stream"), "https://youtube.com/live/abc");
  assert.equal(ethers.decodeBytes32String((await eventsOf(t2, "ProgressPosted"))[0].args.kind), "stream");
  await rejects(reg.connect(stranger).postNeed(id, "ipfs://need"), "NotOwner");
  const t3 = await reg.connect(owner).postNeed(id, "ipfs://need-volunteers-release-night");
  const needId = (await eventsOf(t3, "NeedPosted"))[0].args.needId;
  const n = await reg.needs(needId);
  assert.equal(n.causeId, id); assert.equal(n.open, true);
  const t4 = await reg.connect(helper).pledge(needId, "ipfs://i-can-film");
  assert.equal((await eventsOf(t4, "Pledged"))[0].args.helper, helper.address);
  await rejects(reg.connect(helper).pledge(999999, "ipfs://x"), "NoSuchNeed");
  await rejects(reg.connect(helper).closeNeed(needId, helper.address), "NotOwner");
  const t5 = await reg.connect(owner).closeNeed(needId, helper.address);
  assert.equal((await eventsOf(t5, "NeedClosed"))[0].args.helper, helper.address);
  assert.equal((await reg.needs(needId)).open, false);
  await rejects(reg.connect(stranger).pledge(needId, "ipfs://late"), "BadInput");
});

// ---------------------------------------------------------------- council

test("only the council manages finalisers, stewards and itself", async () => {
  await rejects(reg.connect(stranger).setFinaliser(stranger.address, true), "NotCouncil");
  await rejects(reg.connect(stranger).setSteward(stranger.address, true), "NotCouncil");
  await rejects(reg.connect(stranger).setCouncil(stranger.address), "NotCouncil");
  await rejects(reg.connect(finaliser).setSteward(stranger.address, true), "NotCouncil");
  await rejects(reg.connect(steward).setFinaliser(stranger.address, true), "NotCouncil");
  await rejects(reg.connect(council).setCouncil(ethers.ZeroAddress), "BadInput");
  const t = await reg.connect(council).setFinaliser(helper.address, true);
  assert.equal((await eventsOf(t, "FinaliserSet"))[0].args.on, true);
  assert.equal(await reg.isFinaliser(helper.address), true);
  await (await reg.connect(council).setFinaliser(helper.address, false)).wait();
  assert.equal(await reg.isFinaliser(helper.address), false);
  const t2 = await reg.connect(council).setSteward(helper.address, true);
  assert.equal((await eventsOf(t2, "StewardSet"))[0].args.who, helper.address);
  await (await reg.connect(council).setSteward(helper.address, false)).wait();
  // handing over the council
  await (await reg.connect(council).setCouncil(helper.address)).wait();
  assert.equal(await reg.council(), helper.address);
  await rejects(reg.connect(council).setFinaliser(stranger.address, true), "NotCouncil");
  await (await reg.connect(helper).setCouncil(council.address)).wait();
  assert.equal(await reg.council(), council.address);
});
