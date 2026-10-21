/**
 * Shared types for the gSera client. Both the live (HTTP) client and the
 * mock (in-memory or store-backed) client implement `GseraClient`.
 *
 * Amounts are plain numbers of gSera (gSera has four decimal places on the
 * g.sera.cx side; the client never rounds). Wallets are lowercased 0x
 * addresses.
 */
import { z } from 'zod';

/**
 * What Care Share Donate can credit. There is deliberately no help type:
 * help a cause confirms is rewarded with a badge, because an owner's say-so
 * is not checkable and the pair could trade credits between themselves.
 */
export const GRANT_TYPES = [
  'causes_gift',
  'causes_path',
  'causes_vote',
  'causes_listing',
  'causes_challenge',
] as const;
export type GrantType = (typeof GRANT_TYPES)[number];

export const SPEND_REASONS = ['cause_boost', 'cause_challenge_stake'] as const;
export type SpendReason = (typeof SPEND_REASONS)[number];

/** Production base URL of the gSera API. */
export const GSERA_PRODUCTION_URL = 'https://g.sera.cx';

export const walletSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'wallet must be a 0x address')
  .transform((w) => w.toLowerCase());

const positiveAmount = z
  .number()
  .finite()
  .positive('amountGsera must be greater than zero');

/** Matches GSeraGrant.reference_id VarChar(100) on the gSera side. */
const grantReferenceId = z.string().min(1).max(100);
/** Matches GSeraSpend.reference_id VarChar(80) on the gSera side. */
const spendReferenceId = z.string().min(1).max(80);

export const creditInputSchema = z.object({
  wallet: walletSchema,
  amountGsera: positiveAmount,
  grantType: z.enum(GRANT_TYPES),
  referenceId: grantReferenceId,
  reason: z.string().min(1).max(500),
});
export type CreditInput = z.input<typeof creditInputSchema>;

export const spendInputSchema = z.object({
  wallet: walletSchema,
  amountGsera: positiveAmount,
  reason: z.enum(SPEND_REASONS),
  referenceId: spendReferenceId,
});
export type SpendInput = z.input<typeof spendInputSchema>;

export const reverseInputSchema = z.object({
  wallet: walletSchema,
  grantType: z.enum(GRANT_TYPES),
  referenceId: grantReferenceId,
  reason: z.string().min(1).max(500),
});

export interface Multipliers {
  /** Pair heat of the wallet's last trade on g.sera.cx. Informational only;
   *  CSD applies cause heat on its own side. Absent when gSera has no trade. */
  heat?: number;
  /** 1.0 to 1.6, from cumulative season volume. */
  volumeTier: number;
  /** 1.0 to 1.3, weekly streak. */
  streak: number;
  /** 1.0 or 1.2. Not applied to gifts. */
  powerHour: number;
  /** gSera's own compound of the four above, capped at 10. */
  compound: number;
}

export interface WalletInfo {
  wallet: string;
  spendable: number;
  earned: number;
  spent: number;
  multipliers: Multipliers;
}

export interface CreditResult {
  /** `already_granted` when the (grantType, referenceId, wallet) key already existed. */
  status: 'granted' | 'already_granted';
  grantId: string;
  wallet: string;
  amountGsera: number;
  spendableAfter: number;
}

export interface SpendResult {
  /** `already_spent` when the (reason, referenceId, wallet) key already existed. */
  status: 'spent' | 'already_spent';
  spendId: string;
  wallet: string;
  amountGsera: number;
  spendableAfter: number;
}

export interface ReverseResult {
  status: 'reversed' | 'already_reversed';
  grantId: string;
  wallet: string;
  amountGsera: number;
}

export interface GseraClient {
  readonly mode: 'live' | 'mock';
  /** Credit vested gSera. Idempotent on (grantType, referenceId, wallet). */
  credit(input: CreditInput): Promise<CreditResult>;
  /** Burn spendable gSera. Throws `InsufficientSpendable` when short. Idempotent on (reason, referenceId, wallet). */
  spend(input: SpendInput): Promise<SpendResult>;
  /** Spendable, earned, spent and current multipliers for a wallet. */
  getWallet(address: string): Promise<WalletInfo>;
  /** Claw back a credit. Idempotent; a second call reports `already_reversed`. */
  reverseCredit(referenceId: string, grantType: GrantType, wallet: string, reason?: string): Promise<ReverseResult>;
}
