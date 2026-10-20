/**
 * Typed API client for the routes in indexer/README.md.
 *
 * When VITE_API_URL is unset every call is served by the mock layer built
 * from the seed (src/lib/mock). When it is set, calls go to
 * `${VITE_API_URL}/api/v1/...`. Signed writes (paths, votes, the homepage
 * toggle, challenges, help confirmations) build the EIP-712 message with
 * @sera-causes/shared and sign it through the signer the auth layer sets.
 */
import { keccak256 } from "viem";
import { CHALLENGE_STAKE, PATH_RESULT, VOTE_CHOICE, claimTypeIndex, contentHash, textHash, typedData, type Address, type CausesMessages, type CausesPrimaryType, type ClaimCode, type Hex, type PathBody } from "@sera-causes/shared";
import { API_URL, CHAIN_ID, REGISTRY_ADDRESS, USING_MOCK } from "./env";
import * as mock from "./mock/handlers";
import type {
  CauseDetail,
  CauseFilters,
  CauseList,
  CauseRecord,
  CauseView,
  Challenge,
  ClaimList,
  ClaimListItem,
  ClaimTab,
  ClaimWorkspace,
  ConvertQuote,
  ConversionView,
  Dashboard,
  EvidenceView,
  GiftLookup,
  GiftQuote,
  GiftSubmitResult,
  HomeData,
  LatestRecordEntry,
  LeaderboardBoard,
  LeaderboardPeriod,
  Leaderboards,
  Me,
  MediaView,
  NewCauseInput,
  NewChallengeInput,
  NewEvidenceInput,
  NewMediaInput,
  NewPathInput,
  NewVoteInput,
  PathView,
  PreparedCause,
  RecordEntry,
  Stablecoin,
  StatsResponse,
  TypedDataLike,
  VoteView,
  WalletView,
  WithdrawResult,
} from "./types";

export { API_URL, USING_MOCK } from "./env";

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Thrown for actions that only exist on-chain or behind a real wallet and have no API route yet. */
export class NotAvailableError extends Error {
  constructor(what: string) {
    super(`${what} is not available against the API yet: it goes through the registry contract from the charity's wallet.`);
    this.name = "NotAvailableError";
  }
}

/**
 * What the auth layer hands the client once someone is signed in: the wallet
 * every signed write is attributed to, the wallet's EIP-712 signer, and the
 * credential the API authenticates the request with.
 */
export interface Signer {
  wallet: Address;
  signTypedData(data: TypedDataLike): Promise<Hex>;
  /** Privy access token, sent as `Authorization: Bearer`. Absent in mock mode. */
  getAccessToken?: () => Promise<string | null>;
  /** Dev only: send `X-Dev-Wallet` instead, which the API accepts outside production. */
  devWallet?: boolean;
}

let signer: Signer | null = null;

/** Called by the auth layer on sign in, sign out and wallet change. */
export function setApiSigner(s: Signer | null) {
  signer = s;
}

function detailMessage(body: { error?: string; message?: string; detail?: unknown }): string {
  const base = body.error ?? body.message ?? "";
  const d = body.detail;
  if (Array.isArray(d)) {
    const issues = d.map((i) => (i && typeof i === "object" && "message" in i ? `${"path" in i && i.path ? `${String(i.path)}: ` : ""}${String((i as { message: unknown }).message)}` : String(i)));
    return `${base}${issues.length ? `: ${issues.join("; ")}` : ""}`;
  }
  if (d && typeof d === "object" && "reasons" in d && Array.isArray((d as { reasons: unknown }).reasons)) return `${base}: ${((d as { reasons: string[] }).reasons).join("; ")}`;
  return base;
}

/**
 * How long a single API call may take before we give up. Without this a stuck
 * or unreachable API leaves every list on its loading state for ever, which is
 * exactly what a reader sees when the API is down. On a timeout we throw, the
 * query goes to its error state, and the page offers a retry.
 */
export const API_TIMEOUT_MS = 12_000;

/** True when the call failed because the API could not be reached or did not answer in time. */
export function isOfflineError(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 0 || e.status === 408 || e.status >= 500);
}

async function http<T>(path: string, init?: RequestInit & { json?: unknown; form?: FormData }): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init?.json !== undefined) headers["Content-Type"] = "application/json";
  if (signer) {
    // X-Wallet names which of the account's linked wallets is acting; the API
    // only honours it when Privy confirms the wallet belongs to the caller.
    headers["X-Wallet"] = signer.wallet;
    const token = signer.getAccessToken ? await signer.getAccessToken().catch(() => null) : null;
    if (token) headers.Authorization = `Bearer ${token}`;
    // Dev bypass, matched by `!isProduction` on the API. Never in a production build.
    if (import.meta.env.DEV && signer.devWallet) headers["X-Dev-Wallet"] = signer.wallet;
  }
  let res: Response;
  const timeout = AbortSignal.timeout ? AbortSignal.timeout(API_TIMEOUT_MS) : undefined;
  try {
    res = await fetch(`${API_URL}/api/v1${path}`, {
      method: init?.method ?? (init?.json !== undefined || init?.form ? "POST" : "GET"),
      headers,
      body: init?.json !== undefined ? JSON.stringify(init.json) : (init?.form ?? init?.body),
      signal: timeout,
    });
  } catch (e) {
    // A network failure, a blocked request or our own timeout. Either way the
    // API did not answer, so give the caller something it can show.
    const timedOut = e instanceof DOMException && e.name === "TimeoutError";
    throw new ApiError(timedOut ? 408 : 0, timedOut ? "The server took too long to answer." : "Could not reach the server.", e);
  }
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    let detail: unknown;
    try {
      const body = (await res.json()) as { error?: string; message?: string; detail?: unknown };
      message = detailMessage(body) || message;
      detail = body.detail;
    } catch {
      /* keep the status text */
    }
    throw new ApiError(res.status, message, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const qs = (params: Record<string, string | number | boolean | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "" && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

const nullOn404 = async <T,>(p: Promise<T>): Promise<T | null> => {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
};

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

function requireSigner(): Signer {
  if (!signer) throw new ApiError(401, "Sign in to continue");
  return signer;
}

/** bigint fields to decimal strings so the message survives JSON. */
function jsonMessage(message: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(message).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v]));
}

async function signMessage<K extends CausesPrimaryType>(kind: K, message: CausesMessages[K]): Promise<{ wallet: Address; message: Record<string, unknown>; signature: Hex }> {
  const s = requireSigner();
  const td = typedData(kind, CHAIN_ID, REGISTRY_ADDRESS, message);
  const signature = await s.signTypedData(td as unknown as TypedDataLike);
  return { wallet: s.wallet, message: jsonMessage(message as unknown as Record<string, unknown>), signature };
}

const nowSeconds = () => BigInt(Math.floor(Date.now() / 1000));

/** Trim every string the API will trim before hashing, so contentHash matches on both sides. */
function cleanPathBody(body: Omit<PathBody, "screenshotHash" | "screenshotEvidenceId">, screenshotHash: Hex, screenshotEvidenceId?: string): PathBody {
  return {
    source: body.source.trim(),
    steps: body.steps.map((s) => s.trim()).filter(Boolean),
    exactQuery: body.exactQuery.trim(),
    findings: body.findings.trim(),
    matches: body.matches,
    screenshotHash,
    ...(screenshotEvidenceId ? { screenshotEvidenceId } : {}),
    checkedAt: new Date(body.checkedAt).toISOString(),
    result: body.result,
    caveats: body.caveats.trim(),
    conflictOfInterest: body.conflictOfInterest.trim(),
  };
}

async function hashFile(file: File): Promise<Hex> {
  return keccak256(new Uint8Array(await file.arrayBuffer()));
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getStats = (): Promise<StatsResponse> => (USING_MOCK ? mock.getStats() : http("/stats"));
export const getHome = (): Promise<HomeData> => (USING_MOCK ? mock.getHome() : http("/home"));

/** The API filters by category, stage, text and sorts by activity, newest or given; state, several categories and the other sorts are applied here. */
export async function listCauses(f: CauseFilters = {}): Promise<CauseView[]> {
  if (USING_MOCK) return mock.listCauses(f);
  const apiSort = f.sort === "activity" || f.sort === "newest" || f.sort === "given" ? f.sort : "activity";
  const cats = f.cat ?? [];
  // GET /api/v1/causes takes a single `cat`, so one chosen category is
  // filtered by the API. A union of several is fetched unfiltered and
  // narrowed here, which is safe at this size because the route is capped at
  // 200 causes anyway.
  // TODO: teach GET /api/v1/causes (indexer, the /causes read route) to take
  // a list of categories, repeated or comma separated, and drop the client
  // side pass below.
  const { causes } = await http<CauseList>(`/causes${qs({ cat: cats.length === 1 ? cats[0] : undefined, state: f.status || undefined, q: f.q, sort: apiSort, limit: 200 })}`);
  let list = causes;
  if (cats.length > 1) list = list.filter((c) => cats.includes(c.category));
  if (f.state) list = list.filter((c) => c.profile?.location.state === f.state || (f.state !== "Nationwide" && !!c.profile?.location.state.includes(f.state!)));
  if (f.sort === "checks") list = [...list].sort((a, b) => b.checksDone / Math.max(1, b.checksTotal) - a.checksDone / Math.max(1, a.checksTotal) || Number(b.givenUsd) - Number(a.givenUsd));
  if (f.sort === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

export const getCause = (id: number): Promise<CauseDetail | null> => (USING_MOCK ? mock.getCause(id) : nullOn404(http<CauseDetail>(`/causes/${id}`)));
export const getRecord = async (id: number): Promise<RecordEntry[]> => (USING_MOCK ? mock.getRecord(id) : (await http<CauseRecord>(`/causes/${id}/record`)).record);
export const getLatestEvents = async (limit = 12): Promise<LatestRecordEntry[]> => (USING_MOCK ? mock.getLatestEvents(limit) : (await http<{ record: LatestRecordEntry[] }>(`/record${qs({ limit })}`)).record);
export const listClaims = async (tab: ClaimTab): Promise<ClaimListItem[]> => (USING_MOCK ? mock.listClaims(tab) : (await http<ClaimList>(`/claims${qs({ tab, limit: 200 })}`)).items);
export const getClaim = (causeId: number, claim: ClaimCode): Promise<ClaimWorkspace | null> => (USING_MOCK ? mock.getClaim(causeId, claim) : nullOn404(http<ClaimWorkspace>(`/claims/${causeId}/${claim}`)));
export const getMe = (): Promise<Me> => (USING_MOCK ? mock.getMe() : http("/me"));
export const getLeaderboards = (board: LeaderboardBoard, period: LeaderboardPeriod): Promise<Leaderboards> => (USING_MOCK ? mock.getLeaderboards(board, period) : http(`/leaderboards${qs({ board, period })}`));
export const getDashboard = (): Promise<Dashboard> => (USING_MOCK ? mock.getDashboard() : http("/dashboard"));
export const getGift = (id: string): Promise<GiftLookup | null> => (USING_MOCK ? mock.getGift(id) : nullOn404(http<GiftLookup>(`/gifts/${encodeURIComponent(id)}`)));

// ---------------------------------------------------------------------------
// Add a cause
// ---------------------------------------------------------------------------

export function prepareCause(input: NewCauseInput): Promise<PreparedCause> {
  if (USING_MOCK) return mock.prepareCause(input);
  return http("/causes/prepare", {
    json: {
      name: input.name.trim(),
      category: input.category,
      town: input.town.trim(),
      state: input.state,
      summary: input.summary.trim(),
      website: input.link.trim(),
      ...(input.registration.trim() ? { registration: input.registration.trim() } : {}),
      ...(input.payout.trim() ? { payout: input.payout.trim() } : {}),
      photoPermission: input.photoPermission,
      relationship: input.relationship,
      needsCareLicence: input.orgKind === "licensed",
    },
  });
}

/** Listing is a registry transaction (`listCause`) from the lister's wallet; the mock lists directly. */
export function submitCause(input: NewCauseInput): Promise<CauseDetail> {
  if (USING_MOCK) return mock.submitCause(input);
  return Promise.reject(new NotAvailableError("Listing a cause"));
}

// ---------------------------------------------------------------------------
// Evidence, paths, votes, challenges (signed)
// ---------------------------------------------------------------------------

export function postEvidence(input: NewEvidenceInput): Promise<EvidenceView> {
  if (USING_MOCK) return mock.postEvidence(input);
  const form = new FormData();
  form.set("causeId", String(input.causeId));
  form.set("claimType", input.claim);
  form.set("kind", input.kind);
  form.set("title", input.title.trim());
  if (input.note.trim()) form.set("note", input.note.trim());
  if (input.kind === "link") form.set("link", (input.link ?? "").trim());
  else if (input.file) form.set("file", input.file, input.file.name);
  form.set("redactionConfirmed", input.redactionConfirmed ? "true" : "false");
  return http("/evidence", { form });
}

export async function postPath(input: NewPathInput): Promise<{ path: PathView; claim: { state: string; epoch: number } }> {
  if (USING_MOCK) return mock.postPath(input);
  if (!input.screenshot) throw new ApiError(400, "A path needs a dated screenshot");
  // The screenshot goes up as evidence on the same claim; its recorded hash is what the path commits to.
  const kind = input.screenshot.type === "application/pdf" ? "document" : "photo";
  const shot = await postEvidence({ causeId: input.causeId, claim: input.claim, kind, title: `Screenshot: ${input.body.source.trim().slice(0, 120)}`, note: `Dated screenshot for a verification path, checked ${new Date(input.body.checkedAt).toISOString()}.`, file: input.screenshot, redactionConfirmed: input.redactionConfirmed });
  const body = cleanPathBody(input.body, shot.fileHash, shot.id);
  const signed = await signMessage("Path", {
    causeId: BigInt(input.causeId),
    claimType: claimTypeIndex(input.claim),
    epoch: input.epoch,
    contentHash: contentHash(body),
    result: PATH_RESULT[body.result],
    checkedAt: BigInt(Math.floor(Date.parse(body.checkedAt) / 1000)),
  });
  return http("/paths", { json: { ...signed, body } });
}

export const markPathsOpened = (causeId: number, claim: ClaimCode): Promise<void> => (USING_MOCK ? mock.markPathsOpened(causeId, claim) : Promise.resolve());

export async function postVote(input: NewVoteInput): Promise<{ vote: VoteView }> {
  if (USING_MOCK) return mock.postVote(input);
  const reason = input.reason.trim();
  const signed = await signMessage("Vote", {
    causeId: BigInt(input.causeId),
    claimType: claimTypeIndex(input.claim),
    epoch: input.epoch,
    choice: VOTE_CHOICE[input.choice],
    reasonHash: textHash(reason),
    signedAt: nowSeconds(),
  });
  return http("/votes", { json: { ...signed, reason } });
}

export async function postChallenge(input: NewChallengeInput): Promise<Challenge> {
  if (USING_MOCK) return mock.postChallenge(input);
  const evidenceIds: string[] = [];
  let screenshotHash: Hex = textHash(input.statement.trim());
  if (input.counterEvidence) {
    const kind = input.counterEvidence.type === "application/pdf" ? "document" : "photo";
    const ev = await postEvidence({ causeId: input.causeId, claim: input.claim, kind, title: `Counter-evidence: ${input.statement.trim().slice(0, 100)}`, note: "Uploaded with a challenge.", file: input.counterEvidence, redactionConfirmed: true });
    evidenceIds.push(ev.id);
    screenshotHash = ev.fileHash;
  } else {
    screenshotHash = await hashFile(new File([input.statement.trim()], "statement.txt"));
  }
  const body = { statement: input.statement.trim(), evidenceIds, path: cleanPathBody(input.path, screenshotHash, evidenceIds[0]) };
  const signed = await signMessage("Challenge", {
    causeId: BigInt(input.causeId),
    claimType: claimTypeIndex(input.claim),
    epoch: input.epoch,
    stake: BigInt(CHALLENGE_STAKE),
    contentHash: contentHash(body),
    signedAt: nowSeconds(),
  });
  return http("/challenges", { json: { ...signed, body } });
}

export async function setHomepageFlag(causeId: number, shown: boolean): Promise<{ causeId: number; shown: boolean; showOnHomepage: boolean }> {
  if (USING_MOCK) return mock.setHomepageFlag(causeId, shown);
  const signed = await signMessage("HomepageToggle", { causeId: BigInt(causeId), shown, signedAt: nowSeconds() });
  return http(`/causes/${causeId}/homepage`, { json: signed });
}

export async function confirmHelp(needId: number, helper: string): Promise<void> {
  if (USING_MOCK) return mock.confirmHelp(needId, helper);
  const signed = await signMessage("HelpConfirm", { needId: BigInt(needId), helper: helper.toLowerCase() as Address, signedAt: nowSeconds() });
  await http(`/needs/${needId}/confirm`, { json: signed });
}

// ---------------------------------------------------------------------------
// Gifts
// ---------------------------------------------------------------------------

export function quoteGift(causeId: number, fromToken: Stablecoin, amountRaw: string): Promise<GiftQuote> {
  if (USING_MOCK) return mock.quoteGift(causeId, fromToken, amountRaw);
  return http("/gifts/quote", { json: { causeId, fromToken: fromToken.address, amountRaw } });
}

/** Numeric strings in a typed-data message back to bigints for signing. */
function hydrate(td: TypedDataLike): TypedDataLike {
  const fields = td.types[td.primaryType] ?? [];
  const message = { ...td.message };
  for (const f of fields) {
    const v = message[f.name];
    if (/^u?int/.test(f.type) && typeof v === "string" && /^\d+$/.test(v)) message[f.name] = BigInt(v);
  }
  return { ...td, message };
}

/** A swap quote is signed and submitted to Sera.cx; a same-currency plan is a plain transfer the browser's wallet sends itself. */
export async function submitGift(quote: GiftQuote): Promise<GiftSubmitResult> {
  if (USING_MOCK) return mock.submitGift(quote);
  if (quote.kind !== "swap") throw new NotAvailableError("Sending the transfer from this page");
  const s = requireSigner();
  const signature = await s.signTypedData(hydrate(quote.signing.intent));
  const permitSignature = quote.signing.permit ? await s.signTypedData(hydrate(quote.signing.permit)) : undefined;
  const permitDeadline = quote.signing.permit ? String(quote.signing.permit.message.deadline ?? "") : undefined;
  return http("/gifts/submit", { json: { quoteId: quote.quoteId, signature, ...(permitSignature ? { permitSignature, permitDeadline } : {}) } });
}

export const recordShare = (causeId: number, channel: string): Promise<void> => (USING_MOCK ? mock.recordShare(causeId, channel) : http(`/causes/${causeId}/share`, { json: { channel } }).then(() => undefined));

// ---------------------------------------------------------------------------
// Owner: treasury, conversions, withdrawals, media
// ---------------------------------------------------------------------------

export function setTreasury(causeId: number, treasuryMode: "auto" | "manual", targetToken?: string): Promise<WalletView> {
  if (USING_MOCK) return mock.setTreasury(causeId, treasuryMode, targetToken);
  return http(`/causes/${causeId}/treasury`, { json: { treasuryMode, ...(targetToken ? { targetToken } : {}) } });
}

export function quoteConvert(causeId: number, fromToken: string, toToken: string, amountRaw: string): Promise<ConvertQuote> {
  if (USING_MOCK) return mock.quoteConvert(causeId, fromToken, toToken, amountRaw);
  return http(`/causes/${causeId}/convert`, { json: { fromToken, toToken, amountRaw } });
}

export async function submitConvert(causeId: number, quote: ConvertQuote): Promise<ConversionView> {
  if (USING_MOCK) return mock.submitConvert(causeId, quote.conversion.id, quote.quote.minOutputRaw);
  const s = requireSigner();
  const signature = await s.signTypedData(hydrate(quote.signing.intent));
  const permitSignature = quote.signing.permit ? await s.signTypedData(hydrate(quote.signing.permit)) : undefined;
  const permitDeadline = quote.signing.permit ? Number(quote.signing.permit.message.deadline ?? 0) : undefined;
  return http(`/causes/${causeId}/convert/submit`, { json: { conversionId: quote.conversion.id, signature, ...(permitSignature ? { permitSignature, permitDeadline } : {}) } });
}

export function withdraw(causeId: number, token: string, amountRaw: string, to: string): Promise<WithdrawResult> {
  if (USING_MOCK) return mock.withdraw(causeId, token, amountRaw, to);
  return http(`/causes/${causeId}/withdraw`, { json: { token, amountRaw, to: to.trim() } });
}

export function addMedia(causeId: number, input: NewMediaInput): Promise<MediaView> {
  if (USING_MOCK) return mock.addMedia(causeId, input);
  if (input.file) {
    const form = new FormData();
    form.set("file", input.file, input.file.name);
    form.set("caption", input.caption.trim());
    form.set("credit", (input.credit ?? "").trim());
    return http(`/causes/${causeId}/media`, { form });
  }
  return http(`/causes/${causeId}/media`, { json: { kind: input.kind, url: (input.url ?? "").trim(), caption: input.caption.trim(), credit: (input.credit ?? "").trim() } });
}

export const removeMedia = (mediaId: string): Promise<void> => (USING_MOCK ? mock.removeMedia(mediaId) : http(`/media/${encodeURIComponent(mediaId)}`, { method: "DELETE" }).then(() => undefined));

// ---------------------------------------------------------------------------
// On-chain owner actions. The mock performs them; the API has no route because
// they are registry transactions (postProgress, setPayout, pledgeHelp, setURI).
// ---------------------------------------------------------------------------

export const ONCHAIN_ONLY = !USING_MOCK;

export function postUpdate(causeId: number, input: { kind: string; title: string; body: string; link?: string }): Promise<CauseDetail["updates"][number]> {
  if (USING_MOCK) return mock.postUpdate(causeId, input);
  return Promise.reject(new NotAvailableError("Posting an update"));
}
export function updateSocials(causeId: number, socials: { website?: string; instagram?: string; facebook?: string; youtube?: string; tiktok?: string }): Promise<void> {
  if (USING_MOCK) return mock.updateSocials(causeId, socials);
  return Promise.reject(new NotAvailableError("Changing the profile"));
}
export function setPayout(causeId: number, payout: string): Promise<void> {
  if (USING_MOCK) return mock.setPayout(causeId, payout);
  return Promise.reject(new NotAvailableError("Changing the payout wallet"));
}
export function pledgeHelp(needId: number): Promise<void> {
  if (USING_MOCK) return mock.pledgeHelp(needId);
  return Promise.reject(new NotAvailableError("Pledging on a help request"));
}
