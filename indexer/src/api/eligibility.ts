/**
 * Voter eligibility (brief 7.5): KYT clear, plus one credited gift or one
 * signed verification path.
 *
 * Both of those cost something a farmer cannot fake cheaply. A gift costs
 * money, and a path is written down and checked against the claim's final
 * outcome, so a bad one costs reputation. A help request the cause owner
 * confirmed is neither: it rests on the owner's word alone, and it used to be
 * enough to vote, which meant a cause and a friend could buy themselves a say
 * in verification. It no longer counts here. It earns a helper badge, and a
 * badge gates nothing.
 */
import { db } from '../db.js';
import { screenWallet } from '../chain/listener.js';

export interface Eligibility {
  canVote: boolean;
  kytState: string;
  vestedGifts: number;
  /** Signed verification paths. Confirmed help requests are not counted. */
  contributions: number;
  reasons: string[];
}

export async function voterEligibility(wallet: string): Promise<Eligibility> {
  const w = wallet.toLowerCase();
  const kytState = await screenWallet(w, 'voter');
  const [vestedGifts, paths] = await Promise.all([
    db().ledgerEntry.count({ where: { wallet: w, reason: 'gift', state: 'credited' } }),
    db().path.count({ where: { author: w } }),
  ]);
  const contributions = paths;
  const reasons: string[] = [];
  if (kytState !== 'clear') reasons.push(kytState === 'flagged' ? 'wallet flagged by KYT' : 'KYT check pending');
  if (vestedGifts === 0 && contributions === 0)
    reasons.push('needs one gift with credited gSera, or one verification path you have written and signed; a help request a cause confirmed does not count');
  return { canVote: reasons.length === 0, kytState, vestedGifts, contributions, reasons };
}
