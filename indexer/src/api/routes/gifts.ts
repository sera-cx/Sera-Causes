/**
 * Give flow (docs/PLAN.md section 6). Same currency as the cause's treasury target
 * (or no target): a plain transfer plan the browser sends itself. Different
 * currency: a Sera.cx quote with recipient = cause address and signing payloads.
 */
import { Router } from 'express';
import { giftQuoteSchema, giftSubmitSchema } from '@sera-causes/shared';
import { SeraApiError, SeraQuoteValidationError, isQuoteStaleError } from '@sera-causes/sera-settlement';
import { randomUUID } from 'node:crypto';
import { db } from '../../db.js';
import { config } from '../../config.js';
import { optionalAuth, requireAuth } from '../auth.js';
import { badRequest, forbidden, notFound, parseBody, wrap } from '../errors.js';
import { getSettlement } from '../../services/settlement.js';
import { stablecoinByRef } from '../../chain/stablecoins.js';
import { jsonSafe } from '../tally.js';
import { eip681 } from './owner.js';

export const gifts: Router = Router();

gifts.post(
  '/gifts/quote',
  optionalAuth,
  wrap(async (req, res) => {
    const body = parseBody(giftQuoteSchema, req.body);
    const cause = await db().cause.findUnique({ where: { id: body.causeId }, include: { wallet: true } });
    if (!cause) throw notFound('cause not found');
    if (cause.status !== 'listed' && cause.status !== 'verified') throw badRequest(`cause is ${cause.status} and cannot take gifts`);
    const from = await stablecoinByRef(body.fromToken);
    if (!from) throw badRequest('fromToken is not a listed stablecoin');
    const address = cause.wallet?.address ?? cause.payout;
    const giver = (body.sender ?? req.wallet ?? null) as `0x${string}` | null;
    const target = cause.wallet?.targetToken ? await stablecoinByRef(cause.wallet.targetToken) : undefined;
    const c = config();

    if (!target || target.currency === from.currency) {
      const planId = `plan_${randomUUID()}`;
      await db().giftTrade.create({
        data: { id: planId, causeId: cause.id, giver: giver ?? '0x', recipient: address, fromToken: from.address, toToken: from.address, amountRaw: body.amountRaw, quote: { kind: 'transfer' }, state: 'planned', expiresAt: new Date(Date.now() + 6 * 3600 * 1000) },
      });
      res.json({
        kind: 'transfer',
        planId,
        causeId: cause.id,
        chainId: c.CHAIN_ID,
        to: address,
        token: { address: from.address, symbol: from.symbol, decimals: from.decimals, currency: from.currency },
        amountRaw: body.amountRaw,
        eip681: eip681(c.CHAIN_ID, address, from, body.amountRaw),
      });
      return;
    }

    if (!giver) throw badRequest('sender is required for a cross-currency gift (sign in or pass sender)');
    const sera = getSettlement();
    try {
      const quote = await sera.quoteGift({ fromToken: from.address, toToken: target.address, fromAmountRaw: body.amountRaw, giver, recipient: address as `0x${string}`, ttlSeconds: 120 });
      const signing = sera.buildSigningRequest(quote);
      await db().giftTrade.create({
        data: { id: quote.quoteId, causeId: cause.id, giver: giver.toLowerCase(), recipient: address, fromToken: from.address, toToken: target.address, amountRaw: body.amountRaw, quote: jsonSafe(quote) as object, state: 'quoted', expiresAt: new Date(quote.expiresAt) },
      });
      res.json({
        kind: 'swap',
        quoteId: quote.quoteId,
        causeId: cause.id,
        chainId: quote.chainId,
        recipient: address,
        from: quote.from,
        to: quote.to,
        fromAmountRaw: quote.fromAmountRaw,
        minOutputRaw: quote.minOutputRaw,
        authorization: quote.authorization,
        expiresAt: quote.expiresAt,
        feeBreakdown: jsonSafe(quote.feeBreakdown),
        signing: jsonSafe(signing),
      });
    } catch (err) {
      if (err instanceof SeraQuoteValidationError) throw badRequest(`quote failed: ${err.code}`, { field: err.field });
      if (err instanceof SeraApiError) throw badRequest(`Sera.cx refused the quote: ${err.code ?? err.status}`);
      throw err;
    }
  }),
);

gifts.post(
  '/gifts/submit',
  requireAuth,
  wrap(async (req, res) => {
    const body = parseBody(giftSubmitSchema, req.body);
    const trade = await db().giftTrade.findUnique({ where: { id: body.quoteId } });
    if (!trade) throw notFound('quote not found');
    if (trade.giver !== req.wallet) throw forbidden('this quote belongs to another wallet');
    if (trade.state !== 'quoted') throw badRequest(`quote is ${trade.state}`);
    if (trade.expiresAt.getTime() < Date.now()) {
      await db().giftTrade.update({ where: { id: trade.id }, data: { state: 'expired' } });
      throw badRequest('quote expired, request a new one');
    }
    try {
      const r = await getSettlement().submitGift({ uuid: trade.id, signature: body.signature, permitSignature: body.permitSignature, permitDeadline: body.permitDeadline !== undefined ? Number(body.permitDeadline) : undefined });
      await db().giftTrade.update({ where: { id: trade.id }, data: { tradeId: r.tradeId, state: 'pending', submittedAt: new Date() } });
      res.status(202).json({ tradeId: r.tradeId, status: r.status });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db().giftTrade.update({ where: { id: trade.id }, data: { state: isQuoteStaleError(err) ? 'expired' : 'failed', lastError: msg } });
      throw badRequest(isQuoteStaleError(err) ? 'quote expired, request a new one' : `submit failed: ${msg}`);
    }
  }),
);
