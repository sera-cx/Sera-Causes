/**
 * Turns record entries (GET /causes/:id/record, GET /record) into one line
 * each. The API stores chain events and signed messages with their raw
 * data; the summary lives here so the API stays a plain store.
 */
import { CLAIM_INFO, type ClaimCode } from "@sera-causes/shared";
import type { RecordEntry } from "./types";

export interface RecordLine {
  key: string;
  at: string;
  /** Short tag shown in mono: "gift", "evidence", "path", ... */
  tag: string;
  summary: string;
  by?: string;
  txHash?: string;
  /** Claim this line is about, when any. */
  claim?: ClaimCode;
}

const str = (v: unknown): string => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);

/** Raw token units to a plain number string; stablecoins use 6 decimals unless told otherwise. */
export function fmtRaw(amountRaw: unknown, decimals = 6): string {
  const s = str(amountRaw).replace(/[^0-9]/g, "");
  if (!s) return "0";
  const padded = s.padStart(decimals + 1, "0");
  const whole = padded.slice(0, padded.length - decimals);
  const frac = padded.slice(padded.length - decimals).replace(/0+$/, "");
  const n = Number(`${whole}.${frac || "0"}`);
  return n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
}

const CLAIM_LABEL = (code: unknown) => {
  const c = str(code) as ClaimCode;
  return CLAIM_INFO[c] ? `${c}: ${CLAIM_INFO[c].label}` : c;
};

const outcomeWord = (o: unknown) => str(o).replace(/_/g, " ");

export function describeRecord(e: RecordEntry, index = 0): RecordLine {
  const d = e.data ?? {};
  const txHash = typeof d.txHash === "string" && d.txHash.startsWith("0x") && d.txHash.length > 10 ? d.txHash : undefined;
  const base = { key: `${e.type}-${e.at}-${index}`, at: e.at, txHash };
  switch (e.type) {
    case "CauseListed":
      return { ...base, tag: "listed", summary: `Listed through ${str(d.frontend) || "the registry"}`, by: str(d.by) || undefined };
    case "CauseUpdated":
      return { ...base, tag: "profile", summary: "Profile updated" };
    case "PayoutChanged":
      return { ...base, tag: "payout", summary: "Payout wallet changed. Verified removed until C3 is checked again", claim: "C3" };
    case "OwnerChanged":
      return { ...base, tag: "owner", summary: `Listing claimed by ${str(d.owner).slice(0, 6)}…${str(d.owner).slice(-4)}`, by: str(d.owner) || undefined };
    case "StatusChanged":
      return { ...base, tag: "status", summary: `Status set to ${str(d.status)}${d.note ? `. ${str(d.note)}` : ""}`, by: str(d.by) || undefined };
    case "ClaimFinalised":
      return { ...base, tag: "result", summary: `${CLAIM_LABEL(d.claim)}: ${outcomeWord(d.outcome)}`, by: str(d.by) || undefined, claim: str(d.claim) as ClaimCode };
    case "RequiresCareLicenceSet":
      return { ...base, tag: "care licence", summary: d.on ? "Care licence (C6) marked as required" : "Care licence (C6) marked as not required", by: str(d.by) || undefined, claim: "C6" };
    case "Attested": {
      const body = (d.body ?? {}) as Record<string, unknown>;
      const text = str(body.text) || str(body.note) || "";
      return { ...base, tag: "attested", summary: `${str(d.kind).replace("-", " ")}${text ? `: ${text}` : ""}`, by: str(d.attester) || undefined };
    }
    case "ProgressPosted": {
      const body = (d.body ?? {}) as Record<string, unknown>;
      return { ...base, tag: "update", summary: `Update (${str(d.kind)})${body.title ? `: ${str(body.title)}` : ""}` };
    }
    case "NeedPosted":
      return { ...base, tag: "need", summary: `Help request: ${str(d.title) || str(d.kind)}` };
    case "Pledged":
      return { ...base, tag: "pledge", summary: "A helper pledged on a help request", by: str(d.helper) || undefined };
    case "NeedClosed":
      return { ...base, tag: "need", summary: d.helper ? "Help request fulfilled" : "Help request closed", by: str(d.helper) || undefined };
    case "FinaliserSet":
    case "StewardSet":
    case "CouncilChanged":
      return { ...base, tag: "role", summary: `${str(d.role) || "council"} ${d.on === false ? "removed" : "set"}`, by: str(d.who) || undefined };
    case "GiftReceived": {
      const usd = Number(d.usd);
      const amount = fmtRaw(d.amount);
      const symbol = str(d.symbol) || "tokens";
      const via = str(d.source) === "sera_swap" ? " through a Sera.cx swap" : "";
      const gsera = num(d.gsera);
      return { ...base, tag: "gift", summary: `Gift of ${amount} ${symbol}${Number.isFinite(usd) ? ` (US$${usd.toLocaleString("en-GB")})` : ""} arrived${via}${gsera > 0 ? `, ${gsera.toLocaleString("en-GB")} gSera credited` : ""}`, by: str(d.sender) || undefined };
    }
    case "ConversionSettled":
      return { ...base, tag: "conversion", summary: `Conversion settled: ${fmtRaw(d.amount)} ${str(d.symbol)} received on Sera.cx` };
    case "EvidenceAdded":
      return { ...base, tag: "evidence", summary: `Evidence for ${str(d.claimType)}: ${str(d.title)}`, by: str(d.uploader) || undefined, claim: str(d.claimType) as ClaimCode };
    case "PathSigned":
      return { ...base, tag: "path", summary: `Verification path for ${str(d.claimType)} (${outcomeWord(d.result)})`, by: str(d.author) || undefined, claim: str(d.claimType) as ClaimCode };
    case "VoteSigned":
      return { ...base, tag: "vote", summary: `Vote on ${str(d.claimType)}: ${outcomeWord(d.choice)} (weight ${num(d.weight)})`, by: str(d.voter) || undefined, claim: str(d.claimType) as ClaimCode };
    case "ChallengeOpened": {
      const body = (d.body ?? {}) as Record<string, unknown>;
      return { ...base, tag: "challenge", summary: `${str(d.claimType)} challenged with ${num(d.stake).toLocaleString("en-GB")} gSera staked${body.statement ? `: ${str(body.statement)}` : ""}`, by: str(d.challenger) || undefined, claim: str(d.claimType) as ClaimCode };
    }
    case "ChallengeResolved":
      return { ...base, tag: "challenge", summary: `Challenge ${str(d.state)}` };
    case "UrgentAppealSet":
      return { ...base, tag: "urgent", summary: `${str(d.label) || "Urgent appeal"}: ${str(d.reason)}`, by: str(d.setBy) || undefined };
    case "UrgentAppealCleared":
      return { ...base, tag: "urgent", summary: "Urgent appeal taken down", by: str(d.by) || undefined };
    case "StewardHidden":
      return { ...base, tag: "steward", summary: `Taken off the homepage by a steward: ${str(d.reason)}`, by: str(d.by) || undefined };
    case "HomepageToggle":
      return { ...base, tag: "homepage", summary: `Creator switched Show on homepage ${d.shown ? "on" : "off"}`, by: str(d.by) || undefined };
    default:
      return { ...base, tag: e.type.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase(), summary: e.type };
  }
}

/** Newest first. */
export function recordLines(entries: readonly RecordEntry[]): RecordLine[] {
  return entries.map((e, i) => describeRecord(e, i)).sort((a, b) => b.at.localeCompare(a.at));
}
