/**
 * Voter eligibility (brief 7.5): KYT clear, plus one credited gift or one accepted
 * contribution (a signed path, or a help request the charity confirmed).
 */
import { db } from '../db.js';
import { screenWallet } from '../chain/listener.js';

export interface Eligibility {
  canVote: boolean;
  kytState: string;
  vestedGifts: number;
  contributions: number;
  reasons: string[];
}

export async function voterEligibility(wallet: string): Promise<Eligibility> {
  const w = wallet.toLowerCase();
  const kytState = await screenWallet(w, 'voter');
  const [vestedGifts, paths, helps] = await Promise.all([
    db().ledgerEntry.count({ where: { wallet: w, reason: 'gift', state: 'credited' } }),
    db().path.count({ where: { author: w } }),
    db().need.count({ where: { OR: [{ confirmedHelper: w }, { helper: w, open: false }] } }),
  ]);
  const contributions = paths + helps;
  const reasons: string[] = [];
  if (kytState !== 'clear') reasons.push(kytState === 'flagged' ? 'wallet flagged by KYT' : 'KYT check pending');
  if (vestedGifts === 0 && contributions === 0) reasons.push('needs one gift with credited gSera or one accepted contribution');
  return { canVote: reasons.length === 0, kytState, vestedGifts, contributions, reasons };
}
