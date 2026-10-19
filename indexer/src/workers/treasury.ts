/**
 * Treasury worker: for causes in auto mode with delegated signing, quotes and
 * records a Conversion of newly arrived balances that are not in the target
 * token. Signing goes through TreasurySigner; with the stub the conversion stays
 * `quoted` for the owner to finish from the dashboard.
 */
import { db } from '../db.js';
import { logger } from '../log.js';
import { getSettlement } from '../services/settlement.js';
import { getTreasurySigner, TreasurySignerUnavailable } from '../services/treasury-signer.js';
import { listStablecoins } from '../chain/stablecoins.js';
import { jsonSafe } from '../api/tally.js';

export interface TreasuryRun {
  quoted: number;
  submitted: number;
  skipped: number;
}

/** Balance that arrived per token and is not yet covered by a conversion or withdrawal. */
export async function unconvertedBalances(causeId: number): Promise<Map<string, bigint>> {
  const [gifts, conversions, withdrawals] = await Promise.all([
    db().gift.findMany({ where: { causeId }, select: { token: true, amount: true } }),
    db().conversion.findMany({ where: { causeId, state: { in: ['quoted', 'pending', 'submitted', 'settled'] } }, select: { fromToken: true, amountIn: true, toToken: true, amountOut: true, state: true } }),
    db().withdrawal.findMany({ where: { causeId }, select: { token: true, amount: true } }),
  ]);
  const bal = new Map<string, bigint>();
  const add = (t: string, v: bigint) => bal.set(t, (bal.get(t) ?? 0n) + v);
  for (const g of gifts) add(g.token, BigInt(g.amount));
  for (const c of conversions) {
    add(c.fromToken, -BigInt(c.amountIn));
    if (c.state === 'settled' && c.amountOut) add(c.toToken, BigInt(c.amountOut));
  }
  for (const w of withdrawals) add(w.token, -BigInt(w.amount));
  return bal;
}

export async function runTreasuryOnce(): Promise<TreasuryRun> {
  const run: TreasuryRun = { quoted: 0, submitted: 0, skipped: 0 };
  const wallets = await db().causeWallet.findMany({ where: { treasuryMode: 'auto', delegated: true, targetToken: { not: null } } });
  if (wallets.length === 0) return run;
  const tokens = await listStablecoins();
  const sera = getSettlement();
  const signer = getTreasurySigner();
  for (const w of wallets) {
    const target = tokens.find((t) => t.address === w.targetToken);
    if (!target) {
      run.skipped += 1;
      continue;
    }
    const balances = await unconvertedBalances(w.causeId);
    for (const [token, amount] of balances) {
      if (token === target.address || amount <= 0n) continue;
      const from = tokens.find((t) => t.address === token);
      if (!from) continue;
      try {
        const quote = await sera.quoteGift({ fromToken: from.address, toToken: target.address, fromAmountRaw: amount, giver: w.address as `0x${string}`, recipient: w.address as `0x${string}`, ttlSeconds: 120 });
        const conv = await db().conversion.create({
          data: { causeId: w.causeId, fromToken: from.address, toToken: target.address, amountIn: amount.toString(), quoteId: quote.quoteId, state: 'quoted', triggeredBy: 'auto' },
        });
        run.quoted += 1;
        if (!(await signer.canSign(w))) {
          logger.info({ causeId: w.causeId, conversionId: conv.id, signer: signer.mode }, 'auto conversion quoted; delegated signing unavailable, left for the dashboard');
          continue;
        }
        const signing = sera.buildSigningRequest(quote);
        const sig = await signer.sign(w, signing);
        const r = await sera.submitGift({ uuid: quote.quoteId, signature: sig.signature, permitSignature: sig.permitSignature, permitDeadline: sig.permitDeadline });
        await db().conversion.update({ where: { id: conv.id }, data: { tradeId: r.tradeId, state: 'pending' } });
        run.submitted += 1;
      } catch (err) {
        if (err instanceof TreasurySignerUnavailable) {
          run.skipped += 1;
          continue;
        }
        logger.warn({ err: jsonSafe({ message: err instanceof Error ? err.message : String(err) }), causeId: w.causeId, token }, 'auto conversion failed');
        run.skipped += 1;
      }
    }
  }
  return run;
}
