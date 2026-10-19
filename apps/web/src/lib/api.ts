/**
 * Typed API client matching ARCHITECTURE.md section 6.
 *
 * When VITE_API_URL is unset every call is served by the mock layer built
 * from the seed (src/lib/mock). When it is set, calls go to
 * `${VITE_API_URL}/api/v1/...` with the same shapes.
 */
import type { ClaimCode } from "./constants";
import * as mock from "./mock/handlers";
import type {
  Cause,
  CauseCardData,
  CauseFilters,
  CauseSocials,
  CauseUpdate,
  ConvertQuote,
  MediaItem,
  Claim,
  ClaimRow,
  ClaimTab,
  Dashboard,
  Evidence,
  Gift,
  GiftQuote,
  GiftReceipt,
  HomeData,
  LeaderboardBoard,
  LeaderboardPeriod,
  Leaderboards,
  Me,
  NewCauseInput,
  NewChallengeInput,
  NewEvidenceInput,
  NewPathInput,
  NewVoteInput,
  PreparedCause,
  RecordEvent,
  Stats,
  VerificationPath,
} from "./types";

export const API_URL: string | undefined = import.meta.env.VITE_API_URL?.replace(/\/$/, "");
export const USING_MOCK = !API_URL;

let devWallet: string | null = null;
/** The real API accepts X-Dev-Wallet outside production; Privy JWTs replace this later. */
export function setApiWallet(wallet: string | null) {
  devWallet = wallet;
}

async function http<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init?.json !== undefined) headers["Content-Type"] = "application/json";
  if (devWallet) headers["X-Dev-Wallet"] = devWallet;
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      message = body.error ?? body.message ?? message;
    } catch {
      /* keep the status text */
    }
    throw new Error(message);
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

// Reads
export const getStats = (): Promise<Stats> => (USING_MOCK ? mock.getStats() : http("/stats"));
export const getHome = (): Promise<HomeData> => (USING_MOCK ? mock.getHome() : http("/home"));
export const listCauses = (f: CauseFilters = {}): Promise<CauseCardData[]> => (USING_MOCK ? mock.listCauses(f) : http(`/causes${qs(f as Record<string, string | undefined>)}`));
export const getCause = (id: number): Promise<Cause | null> => (USING_MOCK ? mock.getCause(id) : http(`/causes/${id}`));
export const getRecord = (id: number): Promise<RecordEvent[]> => (USING_MOCK ? mock.getRecord(id) : http(`/causes/${id}/record`));
export const listClaims = (tab: ClaimTab): Promise<ClaimRow[]> => (USING_MOCK ? mock.listClaims(tab) : http(`/claims${qs({ tab })}`));
export const getClaim = (causeId: number, claim: ClaimCode): Promise<Claim | null> => (USING_MOCK ? mock.getClaim(causeId, claim) : http(`/claims/${causeId}/${claim}`));
export const getMe = (): Promise<Me> => (USING_MOCK ? mock.getMe() : http("/me"));
export const getLeaderboards = (board: LeaderboardBoard, period: LeaderboardPeriod): Promise<Leaderboards> =>
  USING_MOCK ? mock.getLeaderboards(board, period) : http(`/leaderboards${qs({ board, period })}`);
export const getDashboard = (): Promise<Dashboard> => (USING_MOCK ? mock.getDashboard() : http("/dashboard"));
export const getGift = (id: number): Promise<Gift | null> => (USING_MOCK ? mock.getGift(id) : http(`/gifts/${id}`));
export const getLatestEvents = (limit = 12): Promise<(RecordEvent & { causeName: string; causeSlug: string })[]> => (USING_MOCK ? mock.getLatestEvents(limit) : http(`/record${qs({ limit })}`));

// Writes
export const prepareCause = (input: NewCauseInput): Promise<PreparedCause> => (USING_MOCK ? mock.prepareCause(input) : http("/causes/prepare", { method: "POST", json: input }));
/** In production the browser calls `listCause` on the registry after prepare; the mock lists it directly. */
export const submitCause = (input: NewCauseInput): Promise<Cause> => (USING_MOCK ? mock.submitCause(input) : http("/causes", { method: "POST", json: input }));
export const postEvidence = (input: NewEvidenceInput): Promise<Evidence> => (USING_MOCK ? mock.postEvidence(input) : http("/evidence", { method: "POST", json: input }));
export const postPath = (input: NewPathInput): Promise<VerificationPath> => (USING_MOCK ? mock.postPath(input) : http("/paths", { method: "POST", json: input }));
export const markPathsOpened = (causeId: number, claim: ClaimCode): Promise<void> => (USING_MOCK ? mock.markPathsOpened(causeId, claim) : Promise.resolve());
export const postVote = (input: NewVoteInput): Promise<void> => (USING_MOCK ? mock.postVote(input) : http("/votes", { method: "POST", json: input }));
export const postChallenge = (input: NewChallengeInput): Promise<void> => (USING_MOCK ? mock.postChallenge(input) : http("/challenges", { method: "POST", json: input }));
export const setHomepageFlag = (causeId: number, shown: boolean): Promise<void> =>
  USING_MOCK ? mock.setHomepageFlag(causeId, shown) : http(`/causes/${causeId}/homepage`, { method: "POST", json: { shown } });
export const quoteGift = (causeId: number, fromToken: string, amount: number): Promise<GiftQuote> =>
  USING_MOCK ? mock.quoteGift(causeId, fromToken, amount) : http("/gifts/quote", { method: "POST", json: { causeId, fromToken, amount } });
export const submitGift = (quote: GiftQuote): Promise<GiftReceipt> => (USING_MOCK ? mock.submitGift(quote) : http("/gifts/submit", { method: "POST", json: { quoteId: quote.quoteId } }));
export const recordShare = (causeId: number, channel: string): Promise<void> => (USING_MOCK ? mock.recordShare(causeId, channel) : http(`/causes/${causeId}/share`, { method: "POST", json: { channel } }));
export const postUpdate = (causeId: number, input: { kind: CauseUpdate["kind"]; title: string; body: string; link?: string }): Promise<CauseUpdate> =>
  USING_MOCK ? mock.postUpdate(causeId, input) : http(`/causes/${causeId}/updates`, { method: "POST", json: input });
export const setLiveLink = (causeId: number, url: string): Promise<void> => (USING_MOCK ? mock.setLiveLink(causeId, url) : http(`/causes/${causeId}/live`, { method: "POST", json: { url } }));
export const pledgeHelp = (needId: number): Promise<void> => (USING_MOCK ? mock.pledgeHelp(needId) : http(`/needs/${needId}/pledge`, { method: "POST" }));
export const confirmHelp = (needId: number): Promise<void> => (USING_MOCK ? mock.confirmHelp(needId) : http(`/needs/${needId}/confirm`, { method: "POST" }));
export const setPayout = (causeId: number, payout: string): Promise<void> => (USING_MOCK ? mock.setPayout(causeId, payout) : http(`/causes/${causeId}/payout`, { method: "POST", json: { payout } }));
export const withdraw = (causeId: number, token: string, amount: number, to: string): Promise<void> =>
  USING_MOCK ? mock.withdraw(causeId, token, amount, to) : http(`/causes/${causeId}/treasury/withdraw`, { method: "POST", json: { token, amount, to } });

// Media, socials, treasury (creator only)
export const addMedia = (causeId: number, input: { kind: MediaItem["kind"]; url: string; title: string; alt?: string; credit?: string }): Promise<MediaItem> =>
  USING_MOCK ? mock.addMedia(causeId, input) : http(`/causes/${causeId}/media`, { method: "POST", json: input });
export const removeMedia = (causeId: number, mediaId: number): Promise<void> => (USING_MOCK ? mock.removeMedia(causeId, mediaId) : http(`/causes/${causeId}/media/${mediaId}`, { method: "DELETE" }));
export const updateSocials = (causeId: number, socials: CauseSocials & { x?: string; website?: string }): Promise<void> =>
  USING_MOCK ? mock.updateSocials(causeId, socials) : http(`/causes/${causeId}/socials`, { method: "POST", json: socials });
export const setTreasuryPolicy = (causeId: number, policy: "auto" | "hold", autoToken: string): Promise<void> =>
  USING_MOCK ? mock.setTreasuryPolicy(causeId, policy, autoToken) : http(`/causes/${causeId}/treasury/policy`, { method: "POST", json: { policy, autoToken } });
export const quoteConvert = (causeId: number, fromToken: string, toToken: string, amountIn: number): Promise<ConvertQuote> =>
  USING_MOCK ? mock.quoteConvert(causeId, fromToken, toToken, amountIn) : http(`/causes/${causeId}/treasury/quote`, { method: "POST", json: { fromToken, toToken, amountIn } });
export const convert = (causeId: number, quote: ConvertQuote): Promise<void> => (USING_MOCK ? mock.convert(causeId, quote) : http(`/causes/${causeId}/treasury/convert`, { method: "POST", json: { quoteId: quote.quoteId } }));
export const providerOf = mock.providerOf;
