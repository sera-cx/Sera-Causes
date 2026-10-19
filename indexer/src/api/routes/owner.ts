/**
 * Owner routes for the cause wallet (docs/PLAN.md section 6): deposit address,
 * treasury setting, manual conversion through Sera.cx, withdrawals and media.
 */
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { EVIDENCE_MAX_BYTES, addressSchema, convertRequestSchema, embedFor, mediaSubmitSchema, treasurySettingsSchema, withdrawRequestSchema } from '@sera-causes/shared';
import { db } from '../../db.js';
import { config } from '../../config.js';
import { requireAuth } from '../auth.js';
import { isSteward } from '../../chain/client.js';
import { badRequest, forbidden, notFound, parseBody, wrap } from '../errors.js';
import { getSettlement } from '../../services/settlement.js';
import { listStablecoins, stablecoinByRef } from '../../chain/stablecoins.js';
import { jsonSafe } from '../tally.js';
import { storeUpload } from './writes.js';
import { serializeConversion, serializeMedia, serializeWallet, serializeWithdrawal } from '../serializers.js';
import { isQuoteStaleError, SeraApiError, SeraQuoteValidationError } from '@sera-causes/sera-settlement';

export const owner: Router = Router();

const IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp'];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: EVIDENCE_MAX_BYTES, files: 1 } });

async function ownedCause(req: { params: Record<string, string | undefined>; wallet?: string }) {
  const id = Number(req.params.id);
  const cause = await db().cause.findUnique({ where: { id }, include: { wallet: true } });
  if (!cause) throw notFound('cause not found');
  if (cause.owner !== req.wallet) throw forbidden('only the cause owner can do this');
  return cause;
}

export function eip681(chainId: number, address: string, token?: { address: string; decimals: number }, amountRaw?: string): string {
  if (!token) return `ethereum:${address}@${chainId}`;
  return `ethereum:${token.address}@${chainId}/transfer?address=${address}${amountRaw ? `&uint256=${amountRaw}` : ''}`;
}

owner.get(
  '/causes/:id/address',
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const cause = await db().cause.findUnique({ where: { id }, include: { wallet: true } });
    if (!cause) throw notFound('cause not found');
    const address = cause.wallet?.address ?? cause.payout;
    const tokens = await listStablecoins();
    const c = config();
    res.json({
      causeId: id,
      address,
      chainId: c.CHAIN_ID,
      qr: eip681(c.CHAIN_ID, address),
      tokens: tokens.map((t) => ({ ...t, qr: eip681(c.CHAIN_ID, address, t) })),
      treasuryMode: cause.wallet?.treasuryMode ?? 'manual',
      targetToken: cause.wallet?.targetToken ?? null,
    });
  }),
);

/** Wallet fields the dashboard sends alongside the shared treasury settings. */
const walletExtrasSchema = z.object({
  address: addressSchema.optional(),
  privyWalletId: z.string().max(200).optional(),
  delegated: z.boolean().optional(),
});

owner.post(
  '/causes/:id/treasury',
  requireAuth,
  wrap(async (req, res) => {
    const cause = await ownedCause(req);
    const body = parseBody(treasurySettingsSchema, req.body);
    const extras = parseBody(walletExtrasSchema, req.body);
    let targetToken: string | undefined;
    if (body.targetToken !== undefined) {
      const t = await stablecoinByRef(body.targetToken);
      if (!t) throw badRequest('targetToken is not a listed stablecoin');
      targetToken = t.address;
    }
    const data = {
      treasuryMode: body.treasuryMode,
      ...(targetToken !== undefined ? { targetToken } : {}),
      ...(extras.address ? { address: extras.address } : {}),
      ...(extras.privyWalletId !== undefined ? { privyWalletId: extras.privyWalletId } : {}),
      ...(extras.delegated !== undefined ? { delegated: extras.delegated } : {}),
    };
    const wallet = await db().causeWallet.upsert({
      where: { causeId: cause.id },
      create: { causeId: cause.id, address: extras.address ?? cause.payout, ...data },
      update: data,
    });
    res.json(serializeWallet(wallet, cause.payout));
  }),
);


owner.post(
  '/causes/:id/convert',
  requireAuth,
  wrap(async (req, res) => {
    const cause = await ownedCause(req);
    const raw = { ...(req.body as Record<string, unknown>) };
    if (raw.toToken === undefined && cause.wallet?.targetToken) raw.toToken = cause.wallet.targetToken;
    const body = parseBody(convertRequestSchema, raw);
    const from = await stablecoinByRef(body.fromToken);
    const to = await stablecoinByRef(body.toToken);
    if (!from) throw badRequest('fromToken is not a listed stablecoin');
    if (!to) throw badRequest('toToken is not a listed stablecoin');
    const address = cause.wallet?.address ?? cause.payout;
    const sera = getSettlement();
    try {
      const quote = await sera.quoteGift({ fromToken: from.address, toToken: to.address, fromAmountRaw: body.amountRaw, giver: address as `0x${string}`, recipient: address as `0x${string}`, ttlSeconds: 120 });
      const signing = sera.buildSigningRequest(quote);
      const conversion = await db().conversion.create({
        data: { causeId: cause.id, fromToken: from.address, toToken: to.address, amountIn: body.amountRaw, quoteId: quote.quoteId, state: 'quoted', triggeredBy: 'owner' },
      });
      res.status(201).json({ conversion: serializeConversion(conversion), quote: jsonSafe({ quoteId: quote.quoteId, from: quote.from, to: quote.to, fromAmountRaw: quote.fromAmountRaw, minOutputRaw: quote.minOutputRaw, expiresAt: quote.expiresAt, authorization: quote.authorization }), signing: jsonSafe(signing) });
    } catch (err) {
      if (err instanceof SeraQuoteValidationError) throw badRequest(`quote failed: ${err.code}`, { field: err.field });
      if (err instanceof SeraApiError) throw badRequest(`Sera.cx refused the quote: ${err.code ?? err.status}`);
      throw err;
    }
  }),
);

const convertSubmitSchema = z.object({
  conversionId: z.string(),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
  permitSignature: z.string().regex(/^0x[0-9a-fA-F]+$/).optional(),
  permitDeadline: z.coerce.number().int().optional(),
});

owner.post(
  '/causes/:id/convert/submit',
  requireAuth,
  wrap(async (req, res) => {
    const cause = await ownedCause(req);
    const body = parseBody(convertSubmitSchema, req.body);
    const conv = await db().conversion.findUnique({ where: { id: body.conversionId } });
    if (!conv || conv.causeId !== cause.id) throw notFound('conversion not found');
    if (conv.state !== 'quoted' || !conv.quoteId) throw badRequest(`conversion is ${conv.state}`);
    try {
      const r = await getSettlement().submitGift({ uuid: conv.quoteId, signature: body.signature as `0x${string}`, permitSignature: body.permitSignature as `0x${string}` | undefined, permitDeadline: body.permitDeadline });
      const updated = await db().conversion.update({ where: { id: conv.id }, data: { tradeId: r.tradeId, state: 'pending' } });
      res.json(serializeConversion(updated));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db().conversion.update({ where: { id: conv.id }, data: { state: isQuoteStaleError(err) ? 'expired' : 'failed', lastError: msg } });
      throw badRequest(isQuoteStaleError(err) ? 'quote expired, request a new one' : `submit failed: ${msg}`);
    }
  }),
);

const withdrawExtrasSchema = z.object({
  note: z.string().trim().max(280).optional(),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
});

owner.post(
  '/causes/:id/withdraw',
  requireAuth,
  wrap(async (req, res) => {
    const cause = await ownedCause(req);
    const body = parseBody(withdrawRequestSchema, req.body);
    const extras = parseBody(withdrawExtrasSchema, req.body);
    const token = await stablecoinByRef(body.token);
    const tokenAddress = body.token.toLowerCase();
    const from = cause.wallet?.address ?? cause.payout;
    const w = await db().withdrawal.create({ data: { causeId: cause.id, token: tokenAddress, amount: body.amountRaw, to: body.to, note: extras.note ?? '', txHash: extras.txHash ?? null } });
    res.status(201).json({
      withdrawal: serializeWithdrawal(w),
      plan: { kind: 'transfer', chainId: config().CHAIN_ID, from, token: tokenAddress, to: body.to, amountRaw: body.amountRaw, symbol: token?.symbol ?? null, decimals: token?.decimals ?? null, eip681: eip681(config().CHAIN_ID, body.to, { address: tokenAddress, decimals: token?.decimals ?? 18 }, body.amountRaw) },
    });
  }),
);

owner.post(
  '/withdrawals/:id/tx',
  requireAuth,
  wrap(async (req, res) => {
    const body = parseBody(z.object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }), req.body);
    const w = await db().withdrawal.findUnique({ where: { id: req.params.id! }, include: { cause: true } });
    if (!w) throw notFound('withdrawal not found');
    if (w.cause.owner !== req.wallet) throw forbidden('only the cause owner can do this');
    res.json(serializeWithdrawal(await db().withdrawal.update({ where: { id: w.id }, data: { txHash: body.txHash } })));
  }),
);

function isDirectImageUrl(input: string): boolean {
  try {
    const u = new URL(input);
    return u.protocol === 'https:' && /\.(jpe?g|png|webp)$/i.test(u.pathname);
  } catch {
    return false;
  }
}

owner.post(
  '/causes/:id/media',
  requireAuth,
  upload.single('file'),
  wrap(async (req, res) => {
    const cause = await ownedCause(req);
    const count = await db().media.count({ where: { causeId: cause.id, removedAt: null } });
    let data: { kind: string; url: string; embedUrl?: string; provider?: string; fileHash?: string; mime?: string; caption: string; credit: string; position: number };
    if (req.file) {
      if (!IMAGE_MIME.includes(req.file.mimetype)) throw badRequest('photos must be png, jpeg or webp');
      const stored = await storeUpload(req.file);
      const raw = (req.body ?? {}) as Record<string, unknown>;
      data = { kind: 'photo', url: stored.url, fileHash: stored.hash, mime: req.file.mimetype, caption: String(raw.caption ?? '').slice(0, 300), credit: String(raw.credit ?? '').slice(0, 200), position: count };
    } else {
      const raw: Record<string, unknown> = { kind: 'video', ...(req.body as Record<string, unknown>) };
      if (raw.kind === 'photo' || (typeof raw.url === 'string' && isDirectImageUrl(raw.url) && embedFor(raw.url) === null)) raw.kind = 'photo';
      const body = parseBody(mediaSubmitSchema, raw);
      if (body.kind === 'photo' && !isDirectImageUrl(body.url)) throw badRequest('photo links must be direct https jpeg, png or webp URLs');
      const parent = (() => {
        try {
          return new URL(config().PUBLIC_WEB_URL).hostname;
        } catch {
          return 'localhost';
        }
      })();
      const embed = body.kind === 'video' ? embedFor(body.url, { parent }) : null;
      data = { kind: body.kind, url: body.url, embedUrl: embed?.embedUrl, provider: embed?.provider, caption: body.caption, credit: body.credit, position: body.position ?? count };
    }
    const media = await db().media.create({ data: { causeId: cause.id, ...data } });
    res.status(201).json(serializeMedia(media));
  }),
);

owner.delete(
  '/media/:id',
  requireAuth,
  wrap(async (req, res) => {
    const m = await db().media.findUnique({ where: { id: req.params.id! }, include: { cause: true } });
    if (!m || m.removedAt) throw notFound('media not found');
    if (m.cause.owner !== req.wallet && !(await isSteward(req.wallet!))) throw forbidden('only the cause owner or a steward can remove media');
    await db().media.update({ where: { id: m.id }, data: { removedAt: new Date() } });
    res.json({ id: m.id, removed: true });
  }),
);

