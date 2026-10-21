/**
 * Product constants for Care Share Donate.
 *
 * Every tunable number lives here and is shown to people only on /rules.
 * Values marked `proposed, see /rules` are proposals from the product brief
 * (docs/PRODUCT-BRIEF.md section 17) and may change before phase 1.
 */

// ---------------------------------------------------------------------------
// Claims (brief 7.2)
// ---------------------------------------------------------------------------

/** Claim codes. The array index is the Solidity `ClaimType` enum value. */
export const CLAIMS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'] as const;
export type ClaimCode = (typeof CLAIMS)[number];

/** Claims every cause must pass to become Verified. C6 is added when the cause is flagged. */
export const REQUIRED_CLAIMS: readonly ClaimCode[] = ['C1', 'C2', 'C3', 'C4'];

/** The claim that becomes required when `requiresCareLicence` is set. */
export const CARE_LICENCE_CLAIM: ClaimCode = 'C6';

/** Claims that show as separate badges rather than counting towards Verified. */
export const BADGE_CLAIMS: readonly ClaimCode[] = ['C5', 'C7'];

export type ClaimRequirement = 'always' | 'when_flagged' | 'badge';

export interface ClaimInfo {
  /** Short code, C1 to C7. */
  code: ClaimCode;
  /** Plain English statement of the fact being checked. */
  label: string;
  /** What counts as proof. */
  proof: string;
  /** Where a helper can check it (the verification paths library). */
  whereToCheck: string;
  /** Whether the claim is needed for Verified. */
  required: ClaimRequirement;
  /** Badge name for claims that are not required. */
  badge?: string;
}

export const CLAIM_INFO: Readonly<Record<ClaimCode, ClaimInfo>> = {
  C1: {
    code: 'C1',
    label: 'The organisation exists and is registered',
    proof: 'Registration number and legal name match an official register.',
    whereToCheck:
      'Registrar of Societies (ROS) for societies (PPM numbers); SSM for companies limited by guarantee; Legal Affairs Division (BHEUU) for trusts (PPAB numbers); state registries for Sabah and Sarawak societies.',
    required: 'always',
  },
  C2: {
    code: 'C2',
    label: 'Registration is current',
    proof: 'The register shows active status, or the latest annual return has been accepted.',
    whereToCheck: "The same registers, plus the charity's latest annual return or AGM minutes.",
    required: 'always',
  },
  C3: {
    code: 'C3',
    label: 'The payout wallet belongs to the organisation',
    proof:
      "A message signed by the payout wallet, published on the organisation's official website or verified social account, plus a matching board resolution.",
    whereToCheck: "The organisation's own site or account; on-chain signature check.",
    required: 'always',
  },
  C4: {
    code: 'C4',
    label: 'The work is real and current',
    proof:
      'At least two independent dated sources from the last 12 months: a site visit, news, photos with location and date, or partner confirmation.',
    whereToCheck: "News archives, the organisation's own channels, a helper's site visit.",
    required: 'always',
  },
  C5: {
    code: 'C5',
    label: 'Tax-exempt approval under section 44(6)',
    proof: "An LHDN approval reference and validity period that match LHDN's own search.",
    whereToCheck:
      'LHDN "Semakan Kelulusan Derma" search: https://www.hasil.gov.my/institusi-organisasi-tabung/semakan-kelulusan-derma/',
    required: 'badge',
    badge: 'Tax-exempt',
  },
  C6: {
    code: 'C6',
    label: 'Care licence where the law needs one',
    proof: 'Registration under the Care Centres Act 1993 with the Department of Social Welfare (JKM).',
    whereToCheck: 'JKM, and the licence certificate on site.',
    required: 'when_flagged',
  },
  C7: {
    code: 'C7',
    label: 'Accounts are published',
    proof: 'Audited accounts or an annual report within the last 2 years.',
    whereToCheck: "The organisation's site, or the register.",
    required: 'badge',
    badge: 'Accounts published',
  },
};

/** Solidity `ClaimType` index for a claim code (C1 = 0 ... C7 = 6). */
export function claimTypeIndex(code: ClaimCode): number {
  return CLAIMS.indexOf(code);
}

/** Claim code for a Solidity `ClaimType` index. Throws on an unknown index. */
export function claimCodeOf(index: number): ClaimCode {
  const code = CLAIMS[index];
  if (!code) throw new RangeError(`unknown claim type index ${index}`);
  return code;
}

// ---------------------------------------------------------------------------
// Voting and challenges (brief 7.5 to 7.8)
// ---------------------------------------------------------------------------

export const VOTING = {
  /** Independent paths needed before voting opens. */
  minPaths: 2, // proposed, see /rules
  /** Voting period in days. */
  periodDays: 5, // proposed, see /rules
  /** Earliest close, in hours, once quorum and threshold are met. */
  minHours: 48, // proposed, see /rules
  /** Total vote weight needed for a result. */
  quorumWeight: 7, // proposed, see /rules
  /** Share of vote weight that must say Verified, in percent. */
  thresholdPct: 75, // proposed, see /rules
  /** Challenge window after voting passes, in hours. */
  challengeWindowHours: 72, // proposed, see /rules
} as const;

/** Vote weight range from `voteWeight` (brief 7.6). */
export const VOTE_WEIGHT = {
  min: 1,
  max: 5, // proposed, see /rules
} as const;

/** Reputation deltas (brief 7.6). */
export const REPUTATION = {
  /** Per vote or path that matches a final, unchallenged outcome. */
  agrees: 1, // proposed, see /rules
  /** Per vote or path that a successful challenge overturns. */
  overturned: -3, // proposed, see /rules
} as const;

/** gSera staked to open a challenge. Returned if the challenge is upheld, burned if not. */
export const CHALLENGE_STAKE = 5000; // proposed, see /rules

// ---------------------------------------------------------------------------
// Verification mode (docs/PLAN.md section 5)
// ---------------------------------------------------------------------------

/**
 * `advisory`: votes and tallies are shown, stewards finalise every claim with
 * the finaliser CLI (brief phase 0). `community`: votes decide, stewards act
 * only on disputes and legal issues (phase 1). Set by `VERIFICATION_MODE`.
 */
export const VERIFICATION_MODES = ['advisory', 'community'] as const;
export type VerificationMode = (typeof VERIFICATION_MODES)[number];
export const DEFAULT_VERIFICATION_MODE: VerificationMode = 'advisory';

export type ClaimDecider = 'stewards' | 'votes';

/** Who decides a claim's final outcome in this mode. */
export function claimDecidedBy(mode: VerificationMode): ClaimDecider {
  switch (mode) {
    case 'advisory':
      return 'stewards';
    case 'community':
      return 'votes';
    default:
      throw new RangeError(`unknown verification mode ${String(mode)}`);
  }
}

/** Parse the `VERIFICATION_MODE` setting, falling back to the default. */
export function parseVerificationMode(value: string | undefined | null): VerificationMode {
  return (VERIFICATION_MODES as readonly string[]).includes(value ?? '')
    ? (value as VerificationMode)
    : DEFAULT_VERIFICATION_MODE;
}

// ---------------------------------------------------------------------------
// gSera for giving (brief 6, narrowed by docs/PLAN.md section 7)
// ---------------------------------------------------------------------------

export const GSERA = {
  /** Base rate: gSera per US$1 given, measured at the value the cause receives. Same as takers on g.sera.cx. */
  perUsd: 100,
  /** Compound multiplier cap, same as takers. */
  compoundCap: 10,
  /** Cause heat replaces pair heat for gifts: an urgent appeal chosen by a steward, or any other cause. */
  heat: {
    urgent: 2.5, // proposed, see /rules
    normal: 1,
  },
  /** Same season volume ladder as takers. */
  volumeTier: { min: 1, max: 1.6 },
  /** Same weekly streak as takers. */
  streak: { min: 1, max: 1.3 },
  /** gSera-earning gifts are capped per wallet per cause over a rolling window. Gifts above it earn 0x. */
  giftCapUsdPerWalletPerCausePer30d: 1000, // proposed, see /rules
  /** Window for the gift cap, in days. */
  giftCapWindowDays: 30, // proposed, see /rules
} as const;

/**
 * Ledger reason to gSera `grant_type` (ARCHITECTURE.md section 7).
 *
 * Only two reasons remain: a gift, and the stake returned when a challenge is
 * upheld. Helper actions earn XP on community.sera.cx instead, see `XP` below.
 */
export const GSERA_GRANT_TYPES = {
  gift: 'causes_gift',
  challenge_stake_return: 'causes_challenge',
} as const;

// ---------------------------------------------------------------------------
// Care XP on community.sera.cx (docs/PLAN.md section 7)
// ---------------------------------------------------------------------------

/**
 * Every helper action earns XP on community.sera.cx, not gSera. XP is a
 * standing in the community programme. It is not a balance, it cannot be
 * spent and it has no cash value.
 */
export const XP_EVENT_TYPES = [
  'care_cause_listed',
  'care_cause_verified',
  'care_evidence_accepted',
  'care_path_agreed',
  'care_site_visit',
  'care_vote_agreed',
  'care_help_fulfilled',
  'care_translation',
  'care_charity_claimed',
  'care_challenge_upheld',
  'community_referral',
] as const;

/** Event key sent to community.sera.cx. */
export type XpEventType = (typeof XP_EVENT_TYPES)[number];

export interface XpReward {
  /** Event key sent to community.sera.cx. */
  type: XpEventType;
  /** XP awarded for one event. */
  amount: number;
  /** Short label for the rules table and the claim workspace. */
  label: string;
  /** When the XP is credited. */
  when: string;
}

/**
 * The Care XP table, pending the community team's assessment. Amounts and the
 * partner route are both proposals until they reply, see /rules.
 */
export const XP: Readonly<Record<XpEventType, XpReward>> = {
  care_cause_listed: {
    type: 'care_cause_listed',
    amount: 100,
    label: 'Add a cause',
    when: 'On listing, once the duplicate check passes',
  },
  care_cause_verified: {
    type: 'care_cause_verified',
    amount: 1500,
    label: 'A cause you added reaches Verified',
    when: 'When the last required claim is final, to the person who listed it',
  },
  care_evidence_accepted: {
    type: 'care_evidence_accepted',
    amount: 100,
    label: 'Evidence accepted',
    when: 'When the claim the evidence supports is final',
  },
  care_path_agreed: {
    type: 'care_path_agreed',
    amount: 400,
    label: 'A verification path the final outcome agrees with',
    when: 'When the claim is final and the challenge window has closed',
  },
  care_site_visit: {
    type: 'care_site_visit',
    amount: 400,
    label: 'Site visit with a dated photo',
    when: 'Added to a C4 path that carries a dated photo',
  },
  care_vote_agreed: {
    type: 'care_vote_agreed',
    amount: 25,
    label: 'A vote in line with the final outcome',
    when: 'When the claim is final and the challenge window has closed',
  },
  care_help_fulfilled: {
    type: 'care_help_fulfilled',
    amount: 250,
    label: 'Help request fulfilled',
    when: "On the cause owner's signed confirmation",
  },
  care_translation: {
    type: 'care_translation',
    amount: 250,
    label: 'Translation',
    when: "On the cause owner's confirmation",
  },
  care_charity_claimed: {
    type: 'care_charity_claimed',
    amount: 500,
    label: 'The charity claims a cause you added',
    when: 'When ownership of the cause transfers to the charity',
  },
  care_challenge_upheld: {
    type: 'care_challenge_upheld',
    amount: 1000,
    label: 'Challenge upheld',
    when: 'When the challenge resolves upheld, with the gSera stake returned',
  },
  community_referral: {
    type: 'community_referral',
    amount: 500,
    label: 'Referral',
    when: "On a referred member's first credited Care event",
  },
};

/** XP for one event of this type. */
export function xpFor(eventType: XpEventType): number {
  const reward = XP[eventType];
  if (!reward) throw new RangeError(`unknown XP event type ${String(eventType)}`);
  return reward.amount;
}

/** Where a queued XP event has got to. `unmatched`: community.sera.cx has no member for that wallet. */
export const XP_EVENT_STATES = ['queued', 'sent', 'unmatched'] as const;
export type XpEventState = (typeof XP_EVENT_STATES)[number];

/** One Care XP event, recorded here and pushed to community.sera.cx. */
export interface XpEvent {
  id: string;
  /** Wallet that earned it, lowercase. */
  wallet: string;
  eventType: XpEventType;
  xp: number;
  /** The row this event came from, unique with `eventType`: a cause, claim, path, vote, evidence, need or challenge id. */
  sourceRef: string;
  causeId?: number;
  /** Public link a reviewer on community.sera.cx can open. */
  proofUrl?: string;
  state: XpEventState;
  createdAt: string;
  sentAt?: string;
}

/** Where Care XP lives. Nothing about XP is spendable on Sera.cx. */
export const COMMUNITY_SITE = 'community.sera.cx';

// ---------------------------------------------------------------------------
// Categories and places
// ---------------------------------------------------------------------------

export interface Category {
  /** URL slug, used in `/causes?cat=`. */
  slug: string;
  /** Short label shown on chips. */
  label: string;
  /** The `category` string used in `csd.cause/1` metadata. */
  profileName: string;
}

export const CATEGORIES: readonly Category[] = [
  { slug: 'turtles', label: 'Turtles', profileName: 'Turtles' },
  { slug: 'marine', label: 'Marine', profileName: 'Marine' },
  { slug: 'wildlife', label: 'Wildlife', profileName: 'Wildlife' },
  { slug: 'environment', label: 'Environment', profileName: 'Environment' },
  { slug: 'animals', label: 'Animals', profileName: 'Animals' },
  { slug: 'children', label: 'Children', profileName: 'Children' },
  { slug: 'education', label: 'Education', profileName: 'Education' },
  { slug: 'health', label: 'Health', profileName: 'Health' },
  { slug: 'food', label: 'Food', profileName: 'Food & poverty' },
  { slug: 'relief', label: 'Relief', profileName: 'Relief' },
  { slug: 'elderly', label: 'Elderly', profileName: 'Elderly' },
  { slug: 'women', label: 'Women', profileName: 'Women' },
  { slug: 'disability', label: 'Disability', profileName: 'Disability' },
];

export type CategorySlug = (typeof CATEGORIES)[number]['slug'];

export const CATEGORY_SLUGS: readonly string[] = CATEGORIES.map((c) => c.slug);
export const CATEGORY_PROFILE_NAMES: readonly string[] = CATEGORIES.map((c) => c.profileName);

/** Find a category by slug, label or profile name (case-insensitive). */
export function findCategory(value: string): Category | undefined {
  const v = value.trim().toLowerCase();
  return CATEGORIES.find(
    (c) => c.slug === v || c.label.toLowerCase() === v || c.profileName.toLowerCase() === v,
  );
}

export interface MalaysianState {
  slug: string;
  name: string;
  /** `state` for the 13 states, `territory` for the three federal territories. */
  kind: 'state' | 'territory';
}

export const MALAYSIAN_STATES: readonly MalaysianState[] = [
  { slug: 'johor', name: 'Johor', kind: 'state' },
  { slug: 'kedah', name: 'Kedah', kind: 'state' },
  { slug: 'kelantan', name: 'Kelantan', kind: 'state' },
  { slug: 'melaka', name: 'Melaka', kind: 'state' },
  { slug: 'negeri-sembilan', name: 'Negeri Sembilan', kind: 'state' },
  { slug: 'pahang', name: 'Pahang', kind: 'state' },
  { slug: 'penang', name: 'Penang', kind: 'state' },
  { slug: 'perak', name: 'Perak', kind: 'state' },
  { slug: 'perlis', name: 'Perlis', kind: 'state' },
  { slug: 'sabah', name: 'Sabah', kind: 'state' },
  { slug: 'sarawak', name: 'Sarawak', kind: 'state' },
  { slug: 'selangor', name: 'Selangor', kind: 'state' },
  { slug: 'terengganu', name: 'Terengganu', kind: 'state' },
  { slug: 'kuala-lumpur', name: 'Kuala Lumpur', kind: 'territory' },
  { slug: 'labuan', name: 'Labuan', kind: 'territory' },
  { slug: 'putrajaya', name: 'Putrajaya', kind: 'territory' },
];

/** Profiles for organisations that work across the country use this instead of a state. */
export const NATIONWIDE = 'Nationwide';

// ---------------------------------------------------------------------------
// Status pills (brief 5 and 10.2)
// ---------------------------------------------------------------------------

export type StatusTone = 'grey' | 'amber' | 'green' | 'red';

export type CauseStage =
  | 'new'
  | 'evidence_in'
  | 'partly_verified'
  | 'verified'
  | 'paused'
  | 'closed';

export interface StatusPill {
  stage: CauseStage;
  /** The word on the pill. Always shown with an icon and a colour, never colour alone. */
  label: string;
  tone: StatusTone;
  /** Icon name hint for the front end. */
  icon: 'circle' | 'file' | 'half' | 'check' | 'pause' | 'lock';
  /** One line under the pill. */
  hint: string;
  /** Show "x of n" next to the label. */
  showCount: boolean;
}

export const STATUS: Readonly<Record<CauseStage, StatusPill>> = {
  new: {
    stage: 'new',
    label: 'New',
    tone: 'grey',
    icon: 'circle',
    hint: 'Not checked yet',
    showCount: false,
  },
  evidence_in: {
    stage: 'evidence_in',
    label: 'Evidence in',
    tone: 'amber',
    icon: 'file',
    hint: 'Evidence uploaded, waiting for checks',
    showCount: false,
  },
  partly_verified: {
    stage: 'partly_verified',
    label: 'Partly verified',
    tone: 'amber',
    icon: 'half',
    hint: 'Some required checks have passed',
    showCount: true,
  },
  verified: {
    stage: 'verified',
    label: 'Verified',
    tone: 'green',
    icon: 'check',
    hint: 'All required checks have passed',
    showCount: false,
  },
  paused: {
    stage: 'paused',
    label: 'Paused',
    tone: 'red',
    icon: 'pause',
    hint: 'A challenge succeeded or a steward paused it',
    showCount: false,
  },
  closed: {
    stage: 'closed',
    label: 'Closed',
    tone: 'grey',
    icon: 'lock',
    hint: 'Closed by the owner or a steward',
    showCount: false,
  },
};

// ---------------------------------------------------------------------------
// Homepage (docs/PLAN.md section 2.2)
// ---------------------------------------------------------------------------

/** Activity that moves a cause up the homepage feed. */
export const FEED_EVENT_TYPES = ['gift', 'evidence', 'update', 'claim_finalised'] as const;
export type FeedEventType = (typeof FEED_EVENT_TYPES)[number];

/** Cards on the "New" rail. */
export const HOME_NEW_RAIL = 6; // proposed, see /rules

/** Label for the steward-pinned cause at the top of the homepage. */
export const URGENT_APPEAL_LABEL = 'Urgent appeal, chosen by Sera.cx';

// ---------------------------------------------------------------------------
// Signatures, uploads and money (docs/PLAN.md section 6)
// ---------------------------------------------------------------------------

/** Stablecoins a cause address accepts at launch, by symbol. Other ERC-20s show as held balances. */
export const LAUNCH_STABLECOINS = ['USDT', 'USDC', 'XSGD', 'MYRT'] as const;

/** How a cause treats arriving funds: convert into one target token on arrival, or hold and convert by hand. */
export const TREASURY_MODES = ['auto', 'manual'] as const;

/** Organisation type picked on add-a-cause when uploading documents. */
export const ORG_TYPES = ['licensed', 'registered', 'informal'] as const;

/** Claims a document uploaded on add-a-cause can support. */
export const DOCUMENT_CLAIMS: readonly ClaimCode[] = ['C1', 'C5', 'C6'];

/** Signed messages older or newer than this are rejected by the API (ARCHITECTURE.md section 4). */
export const SIGNED_AT_TOLERANCE_SECONDS = 10 * 60;

/** Largest evidence upload in bytes. */
export const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

/** Accepted evidence file types. */
export const EVIDENCE_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'video/mp4',
] as const;

/** Preset gift amounts on the give sheet, in US$. */
export const GIFT_PRESETS_USD = [5, 10, 25, 50, 100] as const;
