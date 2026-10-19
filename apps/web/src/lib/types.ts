/**
 * Shapes the web app reads from the API (ARCHITECTURE.md sections 5 and 6).
 * The mock layer in ./mock builds the same shapes from the seed.
 */
import type { CauseStage, ClaimCode, VerificationMode } from "./constants";

export type { CauseStage, ClaimCode };

// Cause metadata, csd.cause/1 (docs/CAUSE-METADATA.md)
export interface CauseLocation {
  town: string;
  state: string;
  country: string;
}
export interface CauseOrganisation {
  entityType: string;
  registration: string;
  registrationSource: string;
  founded: string;
  founders: string;
  leadership: string;
  taxExemption: { statement: string; source: string };
  accounts: string;
}
export interface CauseSocials {
  instagram?: string;
  facebook?: string;
  youtube?: string;
  tiktok?: string;
}
export interface CauseContact {
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  socials?: CauseSocials;
}
export interface CauseImage {
  src: string;
  alt: string;
  credit?: string;
  licence?: string;
  sourceUrl?: string;
  illustrative?: boolean;
}
export interface CauseProfile {
  schema: "csd.cause/1";
  slug: string;
  name: string;
  legalName: string;
  category: string;
  location: CauseLocation;
  summary: string;
  programmes: string[];
  impact: string[];
  beneficiaries: string;
  organisation: CauseOrganisation;
  contact: CauseContact;
  live?: { note: string };
  donationsToday?: string;
  image?: CauseImage;
  background?: string;
  sources: string[];
  profileCheckedOn: string;
}

export type ClaimOutcome = "open" | "verified" | "not_verified" | "needs_more";
export type ClaimState = "open" | "voting" | "challenge_window" | "final";
export type PathResult = "verified" | "not_verified" | "could_not_check";
export type VoteChoice = "verified" | "not_verified" | "needs_more";
export type EvidenceKind = "document" | "link" | "photo" | "video" | "signature";
export type HelpKind = "intro" | "visit" | "translate" | "items" | "skills" | "other";
export type HelpState = "open" | "pledged" | "fulfilled" | "closed";
export type ConcernKind = "concern" | "note" | "open-question" | "steward" | "challenge";

export interface ClaimSummary {
  code: ClaimCode;
  required: boolean;
  outcome: ClaimOutcome;
  state: ClaimState;
  epoch: number;
  evidenceCount: number;
  pathCount: number;
  /** Agreeing paths from different helpers. */
  independentChecks: number;
  votingEnd?: string;
  challengeWindowEnd?: string;
  finalisedAt?: string;
  challenged: boolean;
}

export interface Concern {
  kind: ConcernKind;
  text: string;
  link?: string;
  at?: string;
}

export interface HelpRequest {
  id: number;
  causeId: number;
  kind: HelpKind;
  title: string;
  detail: string;
  state: HelpState;
  rewardGsera: number;
  pledgedBy?: string;
}

export interface CauseUpdate {
  id: number;
  causeId: number;
  kind: "report" | "receipt" | "photo" | "stream" | "note";
  title: string;
  body: string;
  at: string;
  link?: string;
}

export interface MediaItem {
  id: number;
  kind: "photo" | "video";
  url: string;
  title: string;
  /** youtube, tiktok, instagram, x, or other for any oEmbed-style URL. */
  provider?: "youtube" | "tiktok" | "instagram" | "x" | "other";
  thumbnail?: string;
  alt?: string;
  credit?: string;
  addedAt: string;
}

export interface TreasuryBalance {
  token: string;
  amount: number;
  usd: number;
}

export interface Conversion {
  id: number;
  fromToken: string;
  toToken: string;
  amountIn: number;
  amountOut: number;
  rate: number;
  at: string;
  txHash: string;
  reason: "manual" | "auto";
}

export interface Treasury {
  /** The cause's own deposit address on Ethereum. */
  depositAddress: string;
  balances: TreasuryBalance[];
  policy: "auto" | "hold";
  /** Stablecoin everything is converted into when policy is auto. */
  autoToken: string;
  conversions: Conversion[];
  withdrawals: Withdrawal[];
}

export interface ConvertQuote {
  quoteId: string;
  fromToken: string;
  toToken: string;
  amountIn: number;
  amountOut: number;
  rate: number;
  feeUsd: number;
  expiresAt: string;
}

export interface Cause {
  id: number;
  slug: string;
  name: string;
  stage: CauseStage;
  owner: string;
  payout: string | null;
  /** Deposit address for direct sends; same as the treasury address. */
  depositAddress: string;
  media: MediaItem[];
  treasury: Treasury;
  listedAt: string;
  verifiedAt?: string;
  lastActivityAt: string;
  givenUsd: number;
  giversCount: number;
  homepage: boolean;
  urgent?: { reason: string; setBy: string; since: string };
  requiresCareLicence: boolean;
  acceptedTokens: string[];
  claims: Record<ClaimCode, ClaimSummary>;
  checksDone: number;
  checksTotal: number;
  badges: { taxExempt: boolean; accountsPublished: boolean };
  concerns: Concern[];
  pausedReason?: string;
  helpRequests: HelpRequest[];
  updates: CauseUpdate[];
  liveUrl?: string;
  profile: CauseProfile;
}

export interface CauseCardData {
  id: number;
  slug: string;
  name: string;
  stage: CauseStage;
  category: string;
  town: string;
  state: string;
  summary: string;
  image?: CauseImage;
  checksDone: number;
  checksTotal: number;
  givenUsd: number;
  giversCount: number;
  urgent?: { reason: string };
  listedAt: string;
  lastActivityAt: string;
  homepage: boolean;
}

export interface Evidence {
  id: number;
  causeId: number;
  claim: ClaimCode;
  kind: EvidenceKind;
  title: string;
  note: string;
  uploader: string;
  hash: string;
  url?: string;
  createdAt: string;
}

export interface VerificationPath {
  id: number;
  causeId: number;
  claim: ClaimCode;
  epoch: number;
  author: string;
  authorReputation: number;
  source: string;
  steps: string[];
  exactSearch: string;
  found: string;
  matches: string;
  screenshotHash: string;
  checkedAt: string;
  result: PathResult;
  caveats: string;
  conflict: string;
  outcomeAgreed?: boolean;
}

export interface Vote {
  id: number;
  voter: string;
  choice: VoteChoice;
  reason: string;
  weight: number;
  signedAt: string;
}

export interface Tally {
  verified: number;
  not: number;
  more: number;
  total: number;
  quorumMet: boolean;
  passed: boolean;
  verifiedPct: number;
}

export interface Challenge {
  id: number;
  causeId: number;
  claim: ClaimCode;
  challenger: string;
  stake: number;
  summary: string;
  counterEvidence: string;
  state: "open" | "upheld" | "rejected";
  createdAt: string;
  votingEnd: string;
}

export interface ClaimEvent {
  id: number;
  type: string;
  at: string;
  summary: string;
  by?: string;
}

export interface Claim extends ClaimSummary {
  causeId: number;
  causeName: string;
  causeSlug: string;
  causeStage: CauseStage;
  registration: string;
  legalName: string;
  gseraOnOffer: number;
  openedAt: string;
  evidence: Evidence[];
  paths: VerificationPath[];
  votes: Vote[];
  tally: Tally;
  challenge?: Challenge;
  history: ClaimEvent[];
  mode: VerificationMode;
}

export type ClaimTab = "needs_evidence" | "needs_checking" | "open_for_votes" | "challenged" | "recently_verified";

export interface ClaimRow {
  causeId: number;
  causeName: string;
  causeSlug: string;
  category: string;
  state: string;
  claim: ClaimCode;
  missing: string;
  gseraOnOffer: number;
  openedAt: string;
  tab: ClaimTab;
  pathCount: number;
  evidenceCount: number;
}

export interface RecordEvent {
  id: number;
  causeId: number;
  type:
    | "listed"
    | "evidence"
    | "path"
    | "vote"
    | "voting_opened"
    | "result"
    | "gift"
    | "claimed"
    | "update"
    | "need"
    | "challenge"
    | "steward"
    | "homepage"
    | "conversion"
    | "withdrawal"
    | "media"
    | "profile";
  at: string;
  txHash?: string;
  summary: string;
  by?: string;
}

export interface Stats {
  causes: number;
  verified: number;
  givenUsd: number;
  helpersThisMonth: number;
  giversCount: number;
}

export interface HomeData {
  urgent?: { cause: CauseCardData; reason: string };
  feed: CauseCardData[];
  newest: CauseCardData[];
  categories: { slug: string; label: string; count: number }[];
  stats: Stats;
}

export interface CauseFilters {
  cat?: string;
  state?: string;
  status?: CauseStage | "";
  q?: string;
  sort?: "activity" | "newest" | "given" | "checks" | "name";
}

export type LedgerReason = "gift" | "path" | "vote" | "help" | "listing" | "challenge_win" | "challenge_stake";
export type LedgerState = "credited" | "spent" | "burned" | "held";

export interface LedgerEntry {
  id: number;
  amount: number;
  reason: LedgerReason;
  sourceTag: "charity" | "trading";
  note: string;
  state: LedgerState;
  multipliers?: { heat: number; volume: number; streak: number };
  createdAt: string;
  causeId?: number;
}

export interface Gift {
  id: number;
  causeId: number;
  causeName: string;
  causeSlug: string;
  token: string;
  amount: number;
  usd: number;
  at: string;
  /** direct: a transfer in the cause's currency. swap: delivered through a Sera.cx swap. */
  route: "direct" | "swap";
  gsera: number;
  txHash: string;
  giver?: string;
}

export interface Contribution {
  id: number;
  kind: "path" | "vote" | "help" | "listing" | "challenge";
  causeId: number;
  causeName: string;
  claim?: ClaimCode;
  at: string;
  outcome: "accepted" | "pending" | "overturned" | "agreed" | "open";
  gsera: number;
}

export interface Me {
  wallet: string;
  displayName: string;
  reputation: number;
  voteWeight: number;
  canVote: boolean;
  kytState: "unknown" | "clear" | "flagged";
  gsera: {
    spendable: number;
    charityTagged: number;
    lifetime: number;
  };
  multipliers: { volumeTier: number; streak: number; streakWeeks: number };
  ledger: LedgerEntry[];
  gifts: Gift[];
  contributions: Contribution[];
  badges: { id: string; label: string; earned: boolean; hint: string }[];
  causesOwned: number[];
  leaderboardOptOut: boolean;
}

export interface LeaderboardRow {
  rank: number;
  label: string;
  wallet?: string;
  causeId?: number;
  causeSlug?: string;
  value: number;
  unit: string;
  secondary?: string;
}
export type LeaderboardBoard = "givers" | "helpers" | "causes";
export type LeaderboardPeriod = "month" | "all";
export interface Leaderboards {
  board: LeaderboardBoard;
  period: LeaderboardPeriod;
  rows: LeaderboardRow[];
}

export interface GiftQuote {
  quoteId: string;
  causeId: number;
  causeName: string;
  depositAddress: string;
  fromToken: string;
  amount: number;
  usd: number;
  networkFeeUsd: number;
  /** Present when the gift settles through a Sera.cx swap into the cause's currency. */
  swap?: { toToken: string; rate: number; receives: number; swapFeeUsd: number };
  gsera: { amount: number; base: number; heat: number; volume: number; streak: number; capped: boolean; earns: boolean; whyNot?: string };
  expiresAt: string;
}

export interface GiftReceipt {
  id: number;
  causeId: number;
  causeName: string;
  causeSlug: string;
  token: string;
  amount: number;
  usd: number;
  txHash: string;
  gsera: number;
  route: "direct" | "swap";
  received: { token: string; amount: number };
  at: string;
}

export interface DashboardCause {
  cause: Cause;
  gifts: Gift[];
  treasuryUsd: number;
  shares: { channel: string; count: number }[];
  inviteLink: string;
}

export interface Withdrawal {
  id: number;
  token: string;
  amount: number;
  to: string;
  at: string;
  txHash: string;
}

export interface Dashboard {
  wallet: string;
  causes: DashboardCause[];
}

export interface PreparedCause {
  uri: string;
  duplicates: { id: number; slug: string; name: string; registration: string; reason: string }[];
}

export type OrgKind = "licensed" | "registered" | "informal";

export interface NewCauseDocument {
  /** Which claim the document is evidence for. */
  claim: "C1" | "C5" | "C6";
  fileName: string;
  title: string;
}

export interface NewCauseInput {
  name: string;
  category: string;
  town: string;
  state: string;
  summary: string;
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
  source: string;
  steps: string[];
  exactSearch: string;
  found: string;
  matches: string;
  screenshotName: string;
  checkedAt: string;
  result: PathResult;
  caveats: string;
  conflict: string;
}

export interface NewEvidenceInput {
  causeId: number;
  claim: ClaimCode;
  kind: EvidenceKind;
  title: string;
  note: string;
  url?: string;
  redactionConfirmed: boolean;
}

export interface NewVoteInput {
  causeId: number;
  claim: ClaimCode;
  choice: VoteChoice;
  reason: string;
}

export interface NewChallengeInput {
  causeId: number;
  claim: ClaimCode;
  summary: string;
  counterEvidence: string;
}
