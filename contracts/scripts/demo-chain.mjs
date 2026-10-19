// Runs the real contract on an in-process chain, seeds the 44 researched causes, finalises the
// required claims for two of them so they are Verified, then indexes the events and writes build/demo-snapshot.json. What you see in that file is exactly
// what a front end would read from a live deployment.
//
//   pnpm demo
import ganache from "ganache";
import { ethers } from "ethers";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { seedRegistry } from "./seed.mjs";
import { indexRegistry } from "./snapshot.mjs";

const art = n => JSON.parse(readFileSync(new URL(`../build/${n}.json`, import.meta.url)));
const raw = ganache.provider({
  logging: { quiet: true },
  wallet: { totalAccounts: 6, deterministic: true },
  chain: { hardfork: "merge", chainId: 1337, time: new Date("2026-10-19T01:00:00Z") },
});
const provider = new ethers.BrowserProvider(raw, undefined, { pollingInterval: 10, cacheTimeout: -1 });
const [council, finaliser, steward, lister, research] = await Promise.all([0, 1, 2, 3, 4].map(i => provider.getSigner(i)));

async function deploy(name, ...args) {
  const a = art(name);
  const c = await new ethers.ContractFactory(a.abi, a.bytecode, council).deploy(...args);
  await c.waitForDeployment();
  return c;
}

// Registry, roles and two accepted stables (USDT returns nothing from transfer, like the real one).
const reg = await deploy("CauseRegistry", council.address);
await (await reg.setFinaliser(finaliser.address, true)).wait();
await (await reg.setSteward(steward.address, true)).wait();
const usdt = await deploy("MockUSDT");
const usdc = await deploy("MockStable", "USD Coin", "USDC");
await (await reg.setToken(await usdt.getAddress(), true)).wait();
await (await reg.setToken(await usdc.getAddress(), true)).wait();

// Seed the 44 causes. Children and Elderly causes are listed with needsCareLicence = true.
let n = 0;
const ids = await seedRegistry({ reg, lister, research, onEach: () => { if (++n % 10 === 0) console.error(`listed ${n}`); } });

// Finalise C1 to C4 for two causes so the demo has Verified causes. The resultRoot is the
// Merkle root of the published inputs; here it is a stand-in hash per claim.
const Claim = { C1: 0, C2: 1, C3: 2, C4: 3, C5: 4, C6: 5, C7: 6 };
const Outcome = { Open: 0, Verified: 1, NotVerified: 2, NeedsMore: 3 };
const root = (slug, claim) => ethers.keccak256(ethers.toUtf8Bytes(`demo inputs ${slug} ${claim}`));
const f = reg.connect(finaliser);

// Make-A-Wish Malaysia is in the Children category so the lister flagged a care licence, but it
// grants wishes and does not run a care centre, so the steward unflags it with a written reason.
await (await reg.connect(steward).setRequiresCareLicence(ids["make-a-wish-malaysia"], false)).wait();
await (await reg.connect(steward).attest(ids["make-a-wish-malaysia"], ethers.encodeBytes32String("steward-note"),
  "data:application/json," + encodeURIComponent(JSON.stringify({ by: "Steward (demo)", text: "Care licence not required: wish granting, not a care centre under the Care Centres Act 1993." })))).wait();

for (const slug of ["free-tree-society", "make-a-wish-malaysia"]) {
  for (const claim of ["C1", "C2", "C3", "C4"]) {
    await (await f.finaliseClaim(ids[slug], Claim[claim], Outcome.Verified, root(slug, claim))).wait();
  }
  const c = await reg.getCause(ids[slug]);
  console.error(`${slug}: status ${c.status === 2n ? "Verified" : c.status}`);
}
// Make-A-Wish also publishes audited accounts and holds LHDN approval: two badges.
await (await f.finaliseClaim(ids["make-a-wish-malaysia"], Claim.C5, Outcome.Verified, root("make-a-wish-malaysia", "C5"))).wait();
await (await f.finaliseClaim(ids["make-a-wish-malaysia"], Claim.C7, Outcome.Verified, root("make-a-wish-malaysia", "C7"))).wait();
// Partly checked: the organisation exists, nothing else yet.
for (const slug of ["hospis-malaysia", "mercy-malaysia", "turtle-conservation-society-malaysia"]) {
  await (await f.finaliseClaim(ids[slug], Claim.C1, Outcome.Verified, root(slug, "C1"))).wait();
}

const snap = await indexRegistry({ provider, address: await reg.getAddress() });
for (const v of Object.values(snap.tokens)) if (v.symbol === "?") v.symbol = "USDT"; // MockUSDT has no symbol()
snap.labels = {
  [council.address]: "Sera Causes council (demo)",
  [finaliser.address]: "Finaliser (demo)",
  [steward.address]: "Steward (demo)",
  [lister.address]: "Sera onboarding",
  [research.address]: "Sera research",
};
snap.slugs = ids;
snap.demo = true;

const out = new URL("../build/demo-snapshot.json", import.meta.url);
mkdirSync(new URL("../build/", import.meta.url), { recursive: true });
writeFileSync(out, JSON.stringify(snap, null, 1));
const verified = snap.causes.filter(c => c.status === "verified").length;
console.error(`snapshot: ${snap.causes.length} causes (${verified} verified), ${snap.needs.length} needs, block ${snap.block}`);
console.error(`written to ${out.pathname.replace(/%20/g, " ")}`);
await raw.disconnect();
