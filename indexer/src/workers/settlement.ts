/**
 * Settlement poll: pending Sera.cx trades (gift swaps and conversions) every 30 s.
 */
import { db } from '../db.js';
import { logger } from '../log.js';
import { getSettlement } from '../services/settlement.js';

export async function pollSettlementsOnce(): Promise<{ gifts: number; conversions: number }> {
  const sera = getSettlement();
  let gifts = 0;
  let conversions = 0;

  const trades = await db().giftTrade.findMany({ where: { state: 'pending', tradeId: { not: null } }, take: 100 });
  for (const t of trades) {
    try {
      const q = t.quote as { giver?: string; from?: { address?: string }; to?: { address?: string }; minOutputRaw?: string };
      const s = await sera.getSettlement(t.tradeId!, {
        payerAddress: (q.giver ?? t.giver) as `0x${string}`,
        inputTokenAddress: (q.from?.address ?? t.fromToken) as `0x${string}`,
        outputTokenAddress: (q.to?.address ?? t.toToken) as `0x${string}`,
        targetOutputAmountRaw: q.minOutputRaw ?? '0',
      });
      if (s.state === 'settled') {
        await db().giftTrade.update({ where: { id: t.id }, data: { state: 'settled', settledAt: new Date(), txHash: s.txHash ?? null } });
        gifts += 1;
      } else if (s.state === 'failed') {
        await db().giftTrade.update({ where: { id: t.id }, data: { state: 'failed', lastError: s.error ?? s.errorCode ?? 'failed' } });
      }
    } catch (err) {
      logger.warn({ err, tradeId: t.tradeId }, 'settlement poll failed for gift trade');
    }
  }

  const convs = await db().conversion.findMany({ where: { state: 'pending', tradeId: { not: null } }, include: { cause: { include: { wallet: true } } }, take: 100 });
  for (const c of convs) {
    try {
      const address = c.cause.wallet?.address ?? c.cause.payout;
      const s = await sera.getSettlement(c.tradeId!, {
        payerAddress: address as `0x${string}`,
        inputTokenAddress: c.fromToken as `0x${string}`,
        outputTokenAddress: c.toToken as `0x${string}`,
        targetOutputAmountRaw: '0',
      });
      if (s.state === 'settled') {
        await db().conversion.update({ where: { id: c.id }, data: { state: 'settled', settledAt: new Date(), txHash: s.txHash ?? null, amountOut: s.received?.amountRaw ?? c.amountOut } });
        conversions += 1;
      } else if (s.state === 'failed') {
        await db().conversion.update({ where: { id: c.id }, data: { state: 'failed', lastError: s.error ?? s.errorCode ?? 'failed' } });
      }
    } catch (err) {
      logger.warn({ err, tradeId: c.tradeId }, 'settlement poll failed for conversion');
    }
  }
  return { gifts, conversions };
}
