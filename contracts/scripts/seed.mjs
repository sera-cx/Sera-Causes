// Lists the researched Malaysian causes on a registry, adds Sera research's profile checks and
// concerns as attestations, and posts the help each listing needs before it can be verified.
//
// The lister (a Sera onboarding multisig) owns each listing until the charity claims it:
// ownership moves to the charity, the charity sets its own payout, then the community verifies
// each claim and a finaliser records the outcomes.
//
// Causes in the Children or Elderly categories are listed with needsCareLicence = true, so
// claim C6 (care licence) is required for them. A steward can unflag a cause that turns out
// not to run a care centre.
//
// CLI:  RPC_URL=... REGISTRY=0x... LISTER_KEY=... RESEARCH_KEY=... URI_BASE=ipfs://<cid>/ node scripts/seed.mjs
import { ethers } from "ethers";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ABI = JSON.parse(readFileSync(new URL("../build/CauseRegistry.json", import.meta.url))).abi;
const root = new URL("../../seed/", import.meta.url);
const b32 = s => ethers.encodeBytes32String(s.slice(0, 31));
const dataUri = obj => "data:application/json," + encodeURIComponent(JSON.stringify(obj));
export const catKey = c => c.toLowerCase().replace(/[^a-z]+/g, "-").replace(/-+$/, "");

/// Categories where the law needs a care licence (Care Centres Act 1993, JKM).
export const CARE_LICENCE_CATEGORIES = new Set(["children", "elderly"]);
export const needsCareLicence = m => CARE_LICENCE_CATEGORIES.has(catKey(m.category));

export function needsFor(m) {
  const where = m.location.town || m.location.state;
  if (m.slug.startsWith("kasih")) return [
    { kind: "intro", title: "Confirm who runs Kasih", detail: "Know the team at the Chendor hatchery? Connect us so they can claim this listing and send their registration certificate." },
    { kind: "visit", title: "Film a release night", detail: "Visit Pantai Chendor at dusk during a hatchling release and post a dated video or photos." },
    { kind: "translate", title: "Translate this profile", detail: "Bahasa Malaysia, Chinese or Tamil." },
  ];
  return [
    { kind: "intro", title: `Introduce us to ${m.name}`, detail: `Know someone there? Connect us so they can claim this listing and send their documents.` },
    { kind: "visit", title: `Visit and confirm in ${where}`, detail: `Post a dated photo or note showing the work is active. It becomes a public attestation.` },
  ];
}

export function readSeed() {
  const index = JSON.parse(readFileSync(new URL("index.json", root)));
  const causes = index.causes.map(slug => JSON.parse(readFileSync(new URL(`causes/${slug}.json`, root))));
  return { index, causes };
}

export async function seedRegistry({ reg, lister, research, uriBase = "seed/causes/", frontend = "causes.sera.cx", onEach }) {
  const { index, causes } = readSeed();
  const r = reg.connect(lister), q = reg.connect(research);
  const ids = {};
  const listerAddr = await lister.getAddress();
  for (const m of causes) {
    const slug = m.slug;
    const tx = await r.listCause(`${uriBase}${slug}.json`, listerAddr, b32(catKey(m.category)), b32(frontend), needsCareLicence(m));
    const rc = await tx.wait();
    const id = Number(rc.logs.map(l => { try { return reg.interface.parseLog(l); } catch { return null; } }).find(e => e?.name === "CauseListed").args.causeId);
    ids[slug] = id;
    await (await q.attest(id, b32("profile-check"), dataUri({ by: "Sera research", checked: m.profileCheckedOn, sources: m.sources?.length ?? 0,
      note: "Profile compiled from the sources in the cause metadata. Documents not yet received from the charity." }))).wait();
    const a = index.attest?.[slug];
    if (a) await (await q.attest(id, b32(a.kind), dataUri({ by: "Sera research", text: a.text }))).wait();
    for (const n of needsFor(m)) await (await r.postNeed(id, dataUri(n))).wait();
    onEach?.(slug, id);
  }
  return ids;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { RPC_URL, REGISTRY, LISTER_KEY, RESEARCH_KEY, URI_BASE, FRONTEND_TAG } = process.env;
  if (!RPC_URL || !REGISTRY || !LISTER_KEY || !RESEARCH_KEY || !URI_BASE) {
    console.error("Set RPC_URL, REGISTRY, LISTER_KEY, RESEARCH_KEY and URI_BASE (pin seed/causes to IPFS first)");
    process.exit(1);
  }
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const reg = new ethers.Contract(REGISTRY, ABI, provider);
  const ids = await seedRegistry({
    reg,
    lister: new ethers.Wallet(LISTER_KEY, provider),
    research: new ethers.Wallet(RESEARCH_KEY, provider),
    uriBase: URI_BASE,
    frontend: FRONTEND_TAG || "causes.sera.cx",
    onEach: (s, id) => console.log(id, s),
  });
  console.log(JSON.stringify(ids));
}
