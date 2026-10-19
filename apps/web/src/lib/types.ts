/**
 * Shapes the web app reads from the API.
 *
 * The records are the @sera-causes/shared types. The API adds derived
 * fields on top (stage, checks, claim summaries, homepage and urgent state,
 * share URLs) in indexer/src/api/serializers.ts and the read routes; those
 * views are typed here. The mock layer in ./mock builds the same shapes.
 */
import type {
  Address,
  Cause,
  CauseProfile,
  CauseStage,
  Challenge,
  ClaimCode,
  ClaimDecider,
  ClaimInfo,
  ClaimState,
  ClaimTally,
  Conversion,
  Evidence,
  Gift,
  HelpKind,
  HelpState,
  Hex,
  KytState,
  LedgerEntry,
  Media,
  Path,
  PathBody,
  StatusTone,
  TreasuryMode,
  VerificationMode,
  Vote,
  VoteChoice,
  Withdrawal,
} from "@sera-causes/shared";

export type {
  Address,
  AttestationKind,
  Cause,
  CauseContact,
  CauseImage,
  CauseLocation,
  CauseOrganisation,
  CauseProfile,
  CauseSocials,
  CauseStage,
  CauseStatus,
  Challenge,
  ChallengeBody,
  ChallengeState,
  ClaimCode,
  ClaimDecider,
  ClaimInfo,
  ClaimOutcomeName,
  ClaimState,
  ClaimStateKind,
  ClaimTally,
  Conversion,
  Evidence,
  EvidenceKind,
  Gift,
  GiftMultipliers,
  GiftSource,
  HelpKind,
  HelpState,
  Hex,
  KytState,
  LedgerEntry,
  LedgerReason,
  LedgerState,
  Media,
  MediaKind,
  OrgType,
  Path,
  PathBody,
  PathResult,
  SettlementState,
  StatusTone,
  TreasuryMode,
  VerificationMode,
  Vote,
  VoteChoice,
  Withdrawal,
} from "@sera-causes/shared";

// ---------------------------------------------------------------------------
// Cause views (serializeCause, GET /causes, GET /causes/:id)
// ---------------------------------------------------------------------------

/** A claim with the counts the pages show (serializeClaim). */
export interface ClaimSummary extends ClaimState {
  required: boolean;
  evidenceCount: number;
  pathCount: number;
  /** Agreeing paths from different helpers in the current epoch. */
  independentChecks: number;
  challenged: boolean;
}

export interface UrgentAppealView {
  id: string;
  reason: string;
  setBy: Address;
  since: string;
  endsAt: string | null;
}

export interface CauseBadges {
  taxExempt: boolean;
  accountsPublished: boolean;
}

/** One cause as every list and the homepage return it. */
export interface CauseView extends Omit<Cause, "claims" | "evidenceCount" | "showOnHomepage" | "homepageHiddenReason"> {
  name: string;
  lister: Address;
  stage: CauseStage;
  stageLabel: string;
  stageTone: StatusTone;
  checksDone: number;
  checksTotal: number;
  /** The cause's own deposit address: its embedded wallet, or the payout address until one exists. */
  depositAddress: Address;
  treasuryMode: TreasuryMode;
  mediaCount: number;
  claims: ClaimSummary[];
  badges: CauseBadges;
  evidenceCount: number;
  showOnHomepage: boolean;
  homepageHiddenReason: string | null;
  urgent: UrgentAppealView | null;
  lastActivityAt: string | null;
  shareUrl: string;
  ogImageUrl: string;
  posterUrl: string;
  embedUrl: string;
}

export interface Stablecoin {
  address: Address;
  symbol: string;
  decimals: number;
  currency: string;
}

/** A help request as serializeNeed returns it. */
export interface HelpRequestView {
  id: number;
  causeId: number;
  kind: HelpKind;
  title: string;
  detail: string;
  state: HelpState;
  open: boolean;
  postedAt: string;
  /** Helper pledged on-chain, if any. */
  helper: Address | null;
  confirmedHelper: Address | null;
  confirmedAt: string | null;
  closedAt: string | null;
  pledges: { helper: Address; note: string; at: string }[];
}

/** A progress post from the chain (ProgressPosted). */
export interface CauseUpdate {
  id: string;
  kind: string;
  uri: string;
  body: { title?: string; text?: string; body?: string; link?: string; url?: string } | null;
  at: string;
  txHash: Hex | null;
}

export interface Attestation {
  id: string;
  attester: Address;
  kind: string;
  uri: string;
  body: Record<string, unknown> | null;
  at: string;
  txHash: Hex | null;
}

export interface Concern {
  kind: string;
  text: string;
  at: string;
  by: Address;
}

export interface WalletView {
  address: Address;
  delegated: boolean;
  treasuryMode: TreasuryMode;
  targetToken: Address | null;
  privyWalletId: string | null;
}

export interface GiftView extends Gift {
  block: string;
  ledgerNote: string | null;
}

export interface ConversionView extends Conversion {
  settledAt: string | null;
}

export interface WithdrawalView extends Omit<Withdrawal, "txHash"> {
  txHash: Hex | null;
  note: string;
}

export interface MediaView extends Media {
  id: string;
  causeId: number;
  createdAt: string;
}

/** GET /causes/:id */
export interface CauseDetail extends CauseView {
  acceptedTokens: Stablecoin[];
  helpRequests: HelpRequestView[];
  updates: CauseUpdate[];
  attestations: Attestation[];
  concerns: Concern[];
  pausedReason: string | null;
  homepageHiddenBy: Address | null;
  wallet: WalletView;
  media: MediaView[];
  /** Senders are shortened by the API. */
  recentGifts: (Omit<GiftView, "sender"> & { sender: string })[];
  conversions: ConversionView[];
  withdrawals: WithdrawalView[];
}

export interface CauseList {
  total: number;
  causes: CauseView[];
}

export interface CauseFilters {
  cat?: string;
  /** Malaysian state name; filtered on the client. */
  state?: string;
  status?: CauseStage | "";
  q?: string;
  sort?: "activity" | "newest" | "given" | "checks" | "name";
}

// ---------------------------------------------------------------------------
// The record (GET /causes/:id/record, GET /record)
// ---------------------------------------------------------------------------

export interface RecordEntry {
  at: string;
  source: "chain" | "api";
  type: string;
  data: Record<string, unknown>;
}

export interface CauseRecord {
  causeId: number;
  record: RecordEntry[];
}

export interface LatestRecordEntry extends RecordEntry {
  causeId: number;
  causeName: string;
  causeSlug: string;
}

// ---------------------------------------------------------------------------
// Verification hub and claim workspace
// ---------------------------------------------------------------------------

export type ClaimTab = "needs_evidence" | "needs_checking" | "open_for_votes" | "challenged" | "recently_verified";

export interface ClaimListItem {
  cause: {
    id: number;
    slug: string;
    name: string;
    photoUrl: string | null;
    stage: CauseStage;
    /** Category slug. */
    category: string;
    location: { town: string; state: string } | null;
    listedAt: string;
  };
  claim: ClaimSummary;
  label: string;
}

export interface ClaimList {
  tab: ClaimTab;
  total: number;
  items: ClaimListItem[];
}

export interface EvidenceView extends Evidence {
  mime: string | null;
  size: number | null;
}

export type PathView = Path;

/** A vote as the claim workspace lists it: no signature, weight set at submission. */
export interface VoteView extends Omit<Vote, "signature" | "id" | "weight"> {
  id: string;
  weight: number;
  createdAt: string;
  outcomeAgreed: boolean | null;
}

export interface Eligibility {
  canVote: boolean;
  kytState: KytState | string;
  vestedGifts: number;
  contributions: number;
  reasons: string[];
}

/** GET /claims/:causeId/:claimType */
export interface ClaimWorkspace {
  cause: {
    id: number;
    slug: string;
    name: string;
    photoUrl: string | null;
    stage: CauseStage;
    status: Cause["status"];
    registration: string;
    legalName: string;
  };
  claim: ClaimSummary;
  info: ClaimInfo;
  evidence: EvidenceView[];
  paths: PathView[];
  votes: VoteView[];
  tally: ClaimTally;
  votingCanOpen: boolean;
  challenges: Challenge[];
  decidedBy: ClaimDecider;
  /** Present when signed in. */
  eligibility: Eligibility | null;
}

// ---------------------------------------------------------------------------
// Home, stats, leaderboards
// ---------------------------------------------------------------------------

export interface Stats {
  causes: number;
  verified: number;
  /** Decimal string. */
  givenUsd: string;
  gifts: number;
  givers: number;
  /** Distinct path authors. */
  helpers: number;
  gseraCredited: number;
  gseraQueued: number;
  helpRequestsOpen: number;
}

export interface StatsResponse extends Stats {
  verificationMode: VerificationMode;
}

export interface HomeUrgent {
  label: string;
  reason: string;
  setBy: Address;
  since: string;
  endsAt: string | null;
  cause: CauseView;
}

export interface HomeData {
  urgent: HomeUrgent | null;
  feed: CauseView[];
  new: CauseView[];
  categories: { slug: string; label: string; count: number }[];
  stats: Stats;
  helpRequests: HelpRequestView[];
}

export type LeaderboardBoard = "givers" | "helpers" | "causes";
export type LeaderboardPeriod = "7d" | "30d" | "season" | "all";

export interface GiverEntry {
  wallet: Address;
  usd: string;
  gifts: number;
}
export interface HelperEntry {
  wallet: Address;
  gsera: number;
  reputation: number;
}
export interface CauseEntry {
  cause: CauseView;
  usd: string;
  gifts: number;
}

export type Leaderboards =
  | { board: "givers"; period: LeaderboardPeriod; entries: GiverEntry[] }
  | { board: "helpers"; period: LeaderboardPeriod; entries: HelperEntry[] }
  | { board: "causes"; period: LeaderboardPeriod; entries: CauseEntry[] };

// ---------------------------------------------------------------------------
// Me and the dashboard (signed in)
// ---------------------------------------------------------------------------

export interface GseraWallet {
  spendable: number;
  earned: number;
  spent: number;
  multipliers: { heat?: number; volumeTier: number; streak: number; powerHour?: number } | null;
}

export interface LedgerView extends LedgerEntry {
  causeId: number | null;
}

export interface NotificationView {
  id: string;
  wallet: Address;
  kind: string;
  title: string;
  body: string;
  causeId: number | null;
  data: unknown;
  readAt: string | null;
  createdAt: string;
}

export interface CauseRef {
  id: number;
  slug: string;
  name: string;
}

/** GET /me */
export interface Me {
  wallet: Address;
  email: string | null;
  leaderboardOptOut: boolean;
  kytState: KytState;
  gsera: GseraWallet | null;
  ledger: { credited: number; queued: number; cancelled: number; staked: number; entries: LedgerView[] };
  reputation: number;
  gifts: GiftView[];
  paths: PathView[];
  votes: (VoteView & { signature?: Hex })[];
  helped: HelpRequestView[];
  notifications: NotificationView[];
  eligibility: Eligibility;
  /** Every cause referenced by the gifts, paths, votes, help and ledger above. */
  causes: CauseRef[];
  /** The listed stablecoins, to name the token on each gift. */
  tokens: Stablecoin[];
}

export interface DashboardCause extends CauseView {
  wallet: WalletView;
  address: { address: Address; chainId: number; qr: string };
  receivedByToken: { token: Address; symbol: string | null; amountRaw: string }[];
  gifts: GiftView[];
  media: MediaView[];
  helpRequests: HelpRequestView[];
  conversions: ConversionView[];
  withdrawals: WithdrawalView[];
  shares: Record<string, number>;
  share: { url: string; og: string; poster: string; embed: string };
}

/** GET /dashboard */
export interface Dashboard {
  wallet: Address;
  totals: { givenUsd: string; givers: number; causes: number };
  causes: DashboardCause[];
  tokens: Stablecoin[];
}

// ---------------------------------------------------------------------------
// Gifts
// ---------------------------------------------------------------------------

/** POST /gifts/quote, same currency: the browser sends this transfer itself. */
export interface GiftTransferPlan {
  kind: "transfer";
  planId: string;
  causeId: number;
  chainId: number;
  to: Address;
  token: Stablecoin;
  amountRaw: string;
  eip681: string;
}

/** POST /gifts/quote, different currency: a Sera.cx swap with the cause as recipient. */
export interface GiftSwapQuote {
  kind: "swap";
  quoteId: string;
  causeId: number;
  chainId: number;
  recipient: Address;
  from: { address: Address; symbol: string; decimals: number };
  to: { address: Address; symbol: string; decimals: number };
  fromAmountRaw: string;
  minOutputRaw: string;
  authorization: string;
  expiresAt: string;
  feeBreakdown: unknown;
  signing: { intent: TypedDataLike; permit?: TypedDataLike };
}

export type GiftQuote = GiftTransferPlan | GiftSwapQuote;

export interface GiftSubmitResult {
  tradeId: string;
  status: string;
}

export interface GiftLookup {
  kind: "gift" | "trade";
  gift?: GiftView;
  ledger?: LedgerView | null;
  trade?: { id: string; tradeId: string | null; causeId: number; giver: string; state: string; txHash: string | null; createdAt: string };
}

/** The shape viem's signTypedData takes, as the API sends it (bigints as strings). */
export interface TypedDataLike {
  domain: Record<string, unknown>;
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Owner writes
// ---------------------------------------------------------------------------

export interface ConvertQuote {
  conversion: ConversionView;
  quote: { quoteId: string; from: { symbol: string; decimals: number }; to: { symbol: string; decimals: number }; fromAmountRaw: string; minOutputRaw: string; expiresAt: string };
  signing: { intent: TypedDataLike; permit?: TypedDataLike };
}

export interface WithdrawResult {
  withdrawal: WithdrawalView;
  plan: { kind: "transfer"; chainId: number; from: Address; token: Address; to: Address; amountRaw: string; symbol: string | null; decimals: number | null; eip681: string };
}

export interface PreparedCause {
  uri: string;
  hash: string;
  duplicates: { id: number; slug: string; name: string; reason: string }[];
  profile: CauseProfile;
  payout: Address | null;
  needsCareLicence: boolean;
  relationship: string;
}

// ---------------------------------------------------------------------------
// Form inputs
// ---------------------------------------------------------------------------

export type OrgKind = "licensed" | "registered" | "informal";

export interface NewCauseDocument {
  /** Which claim the document is evidence for. */
  claim: "C1" | "C5" | "C6";
  file: File | null;
  fileName: string;
  title: string;
}

export interface NewCauseInput {
  name: string;
  /** Category slug. */
  category: string;
  town: string;
  state: string;
  summary: string;
  /** Official website or social link. */
  link: string;
  registration: string;
  payout: string;
  photoPermission: boolean;
  relationship: "runs" | "volunteers" | "supports" | "other";
  homepage: boolean;
  orgKind: OrgKind;
  documents: NewCauseDocument[];
  redactionConfirmed: boolean;
}

export interface NewPathInput {
  causeId: number;
  claim: ClaimCode;
  epoch: number;
  body: Omit<PathBody, "screenshotHash" | "screenshotEvidenceId">;
  /** The dated screenshot. Hashed in the browser; uploaded as evidence when the API is live. */
  screenshot: File | null;
  redactionConfirmed: boolean;
}

export interface NewEvidenceInput {
  causeId: number;
  claim: ClaimCode;
  kind: Evidence["kind"];
  title: string;
  note: string;
  link?: string;
  file?: File | null;
  redactionConfirmed: boolean;
}

export interface NewVoteInput {
  causeId: number;
  claim: ClaimCode;
  epoch: number;
  choice: VoteChoice;
  reason: string;
}

export interface NewChallengeInput {
  causeId: number;
  claim: ClaimCode;
  epoch: number;
  statement: string;
  /** How the challenger checked. */
  path: Omit<PathBody, "screenshotHash" | "screenshotEvidenceId">;
  counterEvidence: File | null;
}

export interface NewMediaInput {
  kind: Media["kind"];
  url?: string;
  file?: File | null;
  caption: string;
  credit?: string;
}

