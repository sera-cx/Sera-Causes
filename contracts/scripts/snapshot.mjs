// Rebuilds the whole cause registry from on-chain events into one JSON snapshot.
// Anyone can run this, or read a public snapshot, or point at the same RPC. There is no
// other source of truth to sync: the contract's event log is the list.
//
// This is the v1.1 port of the v0.1 indexer: it understands per-claim outcomes
// (ClaimFinalised), the care licence flag and the finaliser and steward roles. The full indexer with Postgres lives in indexer/.
//
// CLI:  RPC_URL=... REGISTRY=0x... FROM_BLOCK=... node scripts/snapshot.mjs > snapshot.json
import { ethers } from "ethers";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ABI = JSON.parse(readFileSync(new URL("../build/CauseRegistry.json", import.meta.url))).abi;
const ERC20 = ["function symbol() view returns (string)", "function decimals() view returns (uint8)"];

export const STATUS = ["none", "listed", "verified", "suspended", "closed"];
export const CLAIMS = ["C1", "C2", "C3", "C4", "C5", "C6", "C7"];
export const OUTCOMES = ["open", "verified", "not_verified", "needs_more"];
export const REQUIRED_CLAIMS = ["C1", "C2", "C3", "C4"];
const s32 = b => { try { return ethers.decodeBytes32String(b); } catch { return b; } };
const ROLE_EVENTS = new Set(["FinaliserSet", "StewardSet", "TokenSet", "CouncilChanged"]);

/// Which claims count for Verified, and how many are done. Same rule as the contract.
export function requiredOf(cause) {
  const required = cause.requiresCareLicence ? [...REQUIRED_CLAIMS, "C6"] : REQUIRED_CLAIMS;
  const done = required.filter(c => cause.claims[c] === "verified").length;
  return { required, done, total: required.length };
}

/// The stage the site shows (product brief section 5), derived from status, claims and evidence.
export function stageOf(cause) {
  if (cause.status === "suspended") return "paused";
  if (cause.status === "closed") return "closed";
  if (cause.status === "verified") return "verified";
  const { done } = requiredOf(cause);
  if (done > 0) return "community_checked";
  if (cause.attestations.length > 0) return "evidence_in";
  return "listed";
}

export async function indexRegistry({ provider, address, fromBlock = 0, toBlock, chunk = 5000 }) {
  const reg = new ethers.Contract(address, ABI, provider);
  const latest = toBlock ?? await provider.getBlockNumber();
  const logs = [];
  for (let b = fromBlock; b <= latest; b += chunk) {
    logs.push(...await provider.getLogs({ address, fromBlock: b, toBlock: Math.min(b + chunk - 1, latest) }));
  }
  const times = new Map();
  const ts = async n => { if (!times.has(n)) times.set(n, (await provider.getBlock(n)).timestamp); return times.get(n); };

  const causes = new Map(), needs = new Map(), tokens = new Map(), finalisers = new Set(), stewards = new Set();
  let council = null;
  const feed = [];

  for (const log of logs) {
    let ev; try { ev = reg.interface.parseLog(log); } catch { continue; }
    const a = ev.args, at = await ts(log.blockNumber);
    const base = { type: ev.name, block: log.blockNumber, tx: log.transactionHash, logIndex: log.index, at };
    const cause = id => causes.get(Number(id));
    switch (ev.name) {
      case "CauseListed": {
        const c = { id: Number(a.causeId), owner: a.owner, payout: a.payout, category: s32(a.category), uri: a.uri,
          status: "listed", stage: "listed", listedAt: at, waitingSince: at, verifiedAt: null, listedVia: s32(a.frontend),
          requiresCareLicence: false, claims: Object.fromEntries(CLAIMS.map(k => [k, "open"])), claimRoots: {},
          requiredDone: 0, requiredTotal: 4,
          totals: {}, byFrontend: {}, donors: {}, attestations: [], progress: [], needs: [], timeline: [] };
        causes.set(c.id, c);
        c.timeline.push({ ...base, by: a.owner, frontend: c.listedVia });
        break;
      }
      case "CauseUpdated": { const c = cause(a.causeId); c.uri = a.uri; c.timeline.push({ ...base, uri: a.uri }); break; }
      case "PayoutChanged": {
        const c = cause(a.causeId); c.payout = a.payout;
        c.claims.C3 = "open"; delete c.claimRoots.C3;             // the contract resets C3 on a payout change
        c.timeline.push({ ...base, payout: a.payout, reopened: "C3" }); break;
      }
      case "OwnerChanged": { const c = cause(a.causeId); c.owner = a.owner; c.timeline.push({ ...base, owner: a.owner }); break; }
      case "StatusChanged": {
        const c = cause(a.causeId); const prev = c.status; c.status = STATUS[Number(a.status)];
        if (c.status === "verified") c.verifiedAt = at;
        else if (prev === "verified" || c.status === "listed") c.waitingSince = at;
        c.timeline.push({ ...base, status: c.status, by: a.by, note: a.note }); break;
      }
      case "ClaimFinalised": {
        const c = cause(a.causeId); const claim = CLAIMS[Number(a.claim)], outcome = OUTCOMES[Number(a.outcome)];
        c.claims[claim] = outcome;
        if (outcome === "open") delete c.claimRoots[claim]; else c.claimRoots[claim] = a.resultRoot;
        c.timeline.push({ ...base, claim, outcome, resultRoot: a.resultRoot, by: a.by }); break;
      }
      case "RequiresCareLicenceSet": {
        const c = cause(a.causeId); c.requiresCareLicence = a.on;
        c.timeline.push({ ...base, on: a.on }); break;
      }
      case "Attested": {
        const c = cause(a.causeId); const x = { ...base, attester: a.attester, kind: s32(a.kind), uri: a.uri };
        c.attestations.push(x); c.timeline.push(x); break;
      }
      case "Donated": {
        const c = cause(a.causeId), tok = a.token, fe = s32(a.frontend), amt = a.amount;
        c.totals[tok] = (BigInt(c.totals[tok] || 0) + amt).toString();
        c.byFrontend[fe] ??= {}; c.byFrontend[fe][tok] = (BigInt(c.byFrontend[fe][tok] || 0) + amt).toString();
        c.donors[a.donor] = true;
        c.timeline.push({ ...base, donor: a.donor, token: tok, amount: amt.toString(), frontend: fe }); break;
      }
      case "Claimed": { cause(a.causeId).timeline.push({ ...base, token: a.token, amount: a.amount.toString(), to: a.to }); break; }
      case "Refunded": { cause(a.causeId).timeline.push({ ...base, donor: a.donor, token: a.token, amount: a.amount.toString() }); break; }
      case "ProgressPosted": {
        const c = cause(a.causeId); const x = { ...base, kind: s32(a.kind), uri: a.uri };
        c.progress.push(x); c.timeline.push(x); break;
      }
      case "NeedPosted": {
        const n = { id: Number(a.needId), causeId: Number(a.causeId), uri: a.uri, open: true, postedAt: at, pledges: [], helper: null };
        needs.set(n.id, n); cause(a.causeId).needs.push(n.id); cause(a.causeId).timeline.push({ ...base, needId: n.id, uri: a.uri }); break;
      }
      case "Pledged": {
        const n = needs.get(Number(a.needId)); n.pledges.push({ helper: a.helper, uri: a.uri, at, tx: log.transactionHash });
        causes.get(n.causeId).timeline.push({ ...base, needId: n.id, helper: a.helper, uri: a.uri }); break;
      }
      case "NeedClosed": {
        const n = needs.get(Number(a.needId)); n.open = false; n.helper = a.helper === ethers.ZeroAddress ? null : a.helper;
        causes.get(n.causeId).timeline.push({ ...base, needId: n.id, helper: n.helper }); break;
      }
      case "FinaliserSet": a.on ? finalisers.add(a.who) : finalisers.delete(a.who); break;
      case "StewardSet": a.on ? stewards.add(a.who) : stewards.delete(a.who); break;
      case "TokenSet": if (a.on) tokens.set(a.token, null); else tokens.delete(a.token); break;
      case "CouncilChanged": council = a.council; break;
    }
    if (!ROLE_EVENTS.has(ev.name)) {
      const causeId = a.causeId !== undefined ? Number(a.causeId) : (a.needId !== undefined ? needs.get(Number(a.needId))?.causeId : null);
      feed.push({ ...base, causeId });
    }
  }

  for (const c of causes.values()) {
    const { done, total } = requiredOf(c);
    c.requiredDone = done; c.requiredTotal = total; c.stage = stageOf(c);
  }
  for (const t of tokens.keys()) {
    const c = new ethers.Contract(t, ERC20, provider);
    tokens.set(t, { symbol: await c.symbol().catch(() => "?"), decimals: Number(await c.decimals().catch(() => 18)) });
  }
  const chainId = Number((await provider.getNetwork()).chainId);
  return {
    schema: "sera-causes.snapshot/1", chainId, registry: address, block: latest, generatedAt: new Date().toISOString(),
    council, finalisers: [...finalisers], stewards: [...stewards], tokens: Object.fromEntries(tokens),
    causes: [...causes.values()].map(c => ({ ...c, donors: Object.keys(c.donors).length })),
    needs: [...needs.values()],
    feed: feed.slice(-200).reverse(),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { RPC_URL, REGISTRY, FROM_BLOCK = "0" } = process.env;
  if (!RPC_URL || !REGISTRY) { console.error("Set RPC_URL and REGISTRY"); process.exit(1); }
  const snap = await indexRegistry({ provider: new ethers.JsonRpcProvider(RPC_URL), address: REGISTRY, fromBlock: Number(FROM_BLOCK) });
  process.stdout.write(JSON.stringify(snap, null, 1));
}
