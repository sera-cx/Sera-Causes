/**
 * Signed writes (ARCHITECTURE.md section 4 and 6): paths, votes, homepage toggle,
 * challenges, help confirmations, plus evidence upload, cause preparation,
 * steward actions, share counts and profile settings.
 */
import { Router } from 'express';
import multer from 'multer';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  CLAIMS,
  EVIDENCE_MAX_BYTES,
  EVIDENCE_MIME_TYPES,
  PATH_RESULT,
  VOTING,
  challengeSubmitSchema,
  claimCodeOf,
  contentHash,
  evidenceMetadataSchema,
  helpConfirmSubmitSchema,
  homepageToggleSubmitSchema,
  pathSubmitSchema,
  prepareCauseSchema,
  stewardHideSchema,
  textHash,
  urgentAppealSchema,
  voteChoiceName,
  voteSubmitSchema,
  voteWeight,
  votingCanOpen,
  type CauseProfile,
  type ClaimOutcomeName,
} from '@sera-causes/shared';
import { db } from '../../db.js';
import { config } from '../../config.js';
import { requireAuth, requireSteward } from '../auth.js';
import { badRequest, conflict, forbidden, notFound, parseBody, wrap, HttpError } from '../errors.js';
import { assertSameWallet, checkSignedAt, verifySignedMessage } from '../signed.js';
import { voterEligibility } from '../eligibility.js';
import { tallyFor } from '../tally.js';
import { rewardHelp, stakeChallenge, StakeError } from '../../ledger/rewards.js';
import { notifyClaimParticipants } from '../../notify.js';
import { slugify } from '../../chain/profile.js';
import { serializeChallenge, serializeEvidence, serializeNeed, serializePath, serializeVote } from '../serializers.js';

export const writes: Router = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: EVIDENCE_MAX_BYTES, files: 1 } });

const EXT: Record<string, string> = { 'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'video/mp4': '.mp4' };

export async function storeUpload(file: { buffer: Buffer; mimetype: string }): Promise<{ hash: string; url: string; size: number }> {
  const c = config();
  const hash = createHash('sha256').update(file.buffer).digest('hex');
  await mkdir(c.uploadDir, { recursive: true });
  await writeFile(path.join(c.uploadDir, hash), file.buffer);
  return { hash, url: `${c.PUBLIC_API_URL}/uploads/${hash}`, size: file.buffer.length };
}

async function currentClaim(causeId: number, claimIndex: number) {
  const cause = await db().cause.findUnique({ where: { id: causeId } });
  if (!cause) throw notFound('cause not found');
  if (cause.status === 'closed') throw badRequest('cause is closed');
  const claimType = claimCodeOf(claimIndex);
  const cs = await db().claimState.findUnique({ where: { causeId_claimType: { causeId, claimType } } });
  if (!cs) throw notFound('claim not found');
  return { cause, claimType, cs };
}

// ---------------------------------------------------------------------------
// POST /causes/prepare
// ---------------------------------------------------------------------------

writes.post(
  '/causes/prepare',
  requireAuth,
  wrap(async (req, res) => {
    const body = parseBody(prepareCauseSchema, req.body);
    const c = config();
    const today = new Date().toISOString().slice(0, 10);
    const profile: CauseProfile = body.profile ?? {
      schema: 'csd.cause/1',
      slug: slugify(body.name),
      name: body.name,
      legalName: body.name,
      category: body.category,
      location: { town: body.town, state: body.state, country: 'MY' },
      summary: body.summary,
      programmes: [],
      impact: [],
      beneficiaries: '',
      organisation: {
        entityType: '',
        registration: body.registration ?? '',
        registrationSource: '',
        founded: '',
        founders: '',
        leadership: '',
        taxExemption: { statement: '', source: '' },
        accounts: '',
      },
      contact: { website: body.website },
      ...(body.photos?.[0] ? { image: { src: body.photos[0].url, alt: body.photos[0].alt ?? body.name } } : {}),
      sources: [body.website],
      profileCheckedOn: today,
    };
    const hash = contentHash(profile).slice(2);
    await db().storedProfile.upsert({ where: { hash }, create: { hash, body: profile as object, createdBy: req.wallet! }, update: {} });
    const uri = `${c.PUBLIC_API_URL}/api/v1/profiles/${hash}.json`;

    const reg = (body.registration ?? profile.organisation.registration ?? '').trim().toLowerCase();
    const host = (() => {
      try {
        return new URL(body.website).hostname.replace(/^www\./, '').toLowerCase();
      } catch {
        return '';
      }
    })();
    const existing = await db().cause.findMany({ where: { status: { in: ['listed', 'verified', 'suspended'] } }, select: { id: true, slug: true, profile: true } });
    const duplicates: { id: number; slug: string; name: string; reason: string }[] = [];
    for (const e of existing) {
      const p = e.profile as CauseProfile | null;
      if (!p) continue;
      const reasons: string[] = [];
      if (reg && p.organisation?.registration?.trim().toLowerCase() === reg) reasons.push('same registration number');
      if (p.name?.trim().toLowerCase() === body.name.trim().toLowerCase()) reasons.push('same name');
      const site = p.contact?.website;
      if (host && site) {
        try {
          if (new URL(site).hostname.replace(/^www\./, '').toLowerCase() === host) reasons.push('same website');
        } catch {
          /* ignore */
        }
      }
      if (reasons.length) duplicates.push({ id: e.id, slug: e.slug, name: p.name, reason: reasons.join(', ') });
    }
    res.status(201).json({ uri, hash, duplicates, profile, payout: body.payout ?? null, needsCareLicence: body.needsCareLicence, relationship: body.relationship });
  }),
);

// ---------------------------------------------------------------------------
// POST /evidence (multipart)
// ---------------------------------------------------------------------------

writes.post(
  '/evidence',
  requireAuth,
  upload.single('file'),
  wrap(async (req, res) => {
    const raw = { ...req.body } as Record<string, unknown>;
    if (typeof raw.causeId === 'string') raw.causeId = Number(raw.causeId);
    if (typeof raw.redactionConfirmed === 'string') raw.redactionConfirmed = raw.redactionConfirmed === 'true';
    const meta = parseBody(evidenceMetadataSchema, raw);
    const cause = await db().cause.findUnique({ where: { id: meta.causeId } });
    if (!cause) throw notFound('cause not found');
    if (cause.status === 'closed') throw badRequest('cause is closed');
    let fileUrl: string;
    let fileHash: string;
    let mime: string | null = null;
    let size: number | null = null;
    if (meta.kind === 'link') {
      fileUrl = meta.link!;
      fileHash = `0x${createHash('sha256').update(meta.link!).digest('hex')}`;
    } else {
      const file = req.file;
      if (!file) throw badRequest('file is required for this evidence kind');
      if (!(EVIDENCE_MIME_TYPES as readonly string[]).includes(file.mimetype)) throw badRequest(`unsupported file type ${file.mimetype}`);
      const stored = await storeUpload(file);
      fileUrl = stored.url;
      fileHash = `0x${stored.hash}`;
      mime = file.mimetype;
      size = stored.size;
      await mkdir(path.dirname(path.join(config().uploadDir, `${stored.hash}${EXT[file.mimetype] ?? ''}`)), { recursive: true });
    }
    const evidence = await db().evidence.create({
      data: { causeId: meta.causeId, claimType: meta.claimType, uploader: req.wallet!, kind: meta.kind, fileUrl, fileHash, mime, size, title: meta.title, note: meta.note ?? null, redactionConfirmed: true },
    });
    res.status(201).json(serializeEvidence(evidence));
  }),
);

// ---------------------------------------------------------------------------
// POST /paths
// ---------------------------------------------------------------------------

writes.post(
  '/paths',
  requireAuth,
  wrap(async (req, res) => {
    const body = parseBody(pathSubmitSchema, req.body);
    const wallet = assertSameWallet(req.wallet, body.wallet);
    const causeId = Number(body.message.causeId);
    const { claimType, cs } = await currentClaim(causeId, body.message.claimType);
    if (body.message.epoch !== cs.epoch) throw badRequest(`claim is at epoch ${cs.epoch}`);
    if (cs.state !== 'open' && cs.state !== 'voting') throw badRequest(`claim is ${cs.state}; paths are not accepted`);
    if (contentHash(body.body) !== body.message.contentHash) throw badRequest('contentHash does not match the path body');
    if (PATH_RESULT[body.body.result] !== body.message.result) throw badRequest('result does not match the path body');
    if (Math.floor(Date.parse(body.body.checkedAt) / 1000) !== Number(body.message.checkedAt)) throw badRequest('checkedAt does not match the path body');
    const checkedMs = Number(body.message.checkedAt) * 1000;
    if (checkedMs > Date.now() + 10 * 60 * 1000) throw badRequest('checkedAt is in the future');
    if (checkedMs < Date.now() - 365 * 86400 * 1000) throw badRequest('checkedAt is more than a year old');
    await verifySignedMessage('Path', wallet, body.message, body.signature);
    const dup = await db().path.findUnique({ where: { causeId_claimType_epoch_author: { causeId, claimType, epoch: cs.epoch, author: wallet } } });
    if (dup) throw conflict('this wallet already signed a path for this claim epoch');
    const pathRow = await db().path.create({
      data: {
        causeId,
        claimType,
        epoch: cs.epoch,
        author: wallet,
        body: body.body as object,
        contentHash: body.message.contentHash,
        result: body.body.result,
        checkedAt: new Date(body.body.checkedAt),
        signature: body.signature,
      },
    });
    let claim = cs;
    if (cs.state === 'open') {
      const authors = (await db().path.findMany({ where: { causeId, claimType, epoch: cs.epoch }, select: { author: true } })).map((p) => p.author);
      if (votingCanOpen(authors)) {
        const now = new Date();
        claim = await db().claimState.update({
          where: { causeId_claimType: { causeId, claimType } },
          data: { state: 'voting', votingStart: now, votingEnd: new Date(now.getTime() + VOTING.periodDays * 86400 * 1000) },
        });
      }
    }
    res.status(201).json({ path: serializePath(pathRow), claim: { state: claim.state, epoch: claim.epoch, votingStart: claim.votingStart, votingEnd: claim.votingEnd } });
  }),
);

// ---------------------------------------------------------------------------
// POST /votes
// ---------------------------------------------------------------------------

writes.post(
  '/votes',
  requireAuth,
  wrap(async (req, res) => {
    const body = parseBody(voteSubmitSchema, req.body);
    const wallet = assertSameWallet(req.wallet, body.wallet);
    const causeId = Number(body.message.causeId);
    const { claimType, cs } = await currentClaim(causeId, body.message.claimType);
    if (body.message.epoch !== cs.epoch) throw badRequest(`claim is at epoch ${cs.epoch}`);
    if (cs.state !== 'voting') throw badRequest('voting is not open on this claim');
    if (cs.votingEnd && cs.votingEnd.getTime() < Date.now()) throw badRequest('the voting period has ended');
    if (textHash(body.reason) !== body.message.reasonHash) throw badRequest('reasonHash does not match the reason');
    checkSignedAt(body.message.signedAt);
    await verifySignedMessage('Vote', wallet, body.message, body.signature);
    const eligibility = await voterEligibility(wallet);
    if (!eligibility.canVote) throw new HttpError(403, 'wallet is not eligible to vote', eligibility);
    const dup = await db().vote.findUnique({ where: { causeId_claimType_epoch_voter: { causeId, claimType, epoch: cs.epoch, voter: wallet } } });
    if (dup) throw conflict('this wallet already voted on this claim epoch');
    const rep = await db().reputation.findUnique({ where: { wallet } });
    const vote = await db().vote.create({
      data: {
        causeId,
        claimType,
        epoch: cs.epoch,
        voter: wallet,
        choice: voteChoiceName(body.message.choice),
        reason: body.reason,
        weight: voteWeight(rep?.score ?? 0),
        signature: body.signature,
        signedAt: new Date(Number(body.message.signedAt) * 1000),
      },
    });
    const { tally } = await tallyFor(causeId, claimType, cs.epoch);
    res.status(201).json({ vote: serializeVote(vote), tally, decidedBy: config().verificationMode === 'advisory' ? 'stewards' : 'votes' });
  }),
);

// ---------------------------------------------------------------------------
// POST /causes/:id/homepage
// ---------------------------------------------------------------------------

writes.post(
  '/causes/:id/homepage',
  requireAuth,
  wrap(async (req, res) => {
    const body = parseBody(homepageToggleSubmitSchema, req.body);
    const wallet = assertSameWallet(req.wallet, body.wallet);
    const causeId = Number(req.params.id);
    if (Number(body.message.causeId) !== causeId) throw badRequest('causeId does not match the route');
    const cause = await db().cause.findUnique({ where: { id: causeId } });
    if (!cause) throw notFound('cause not found');
    if (cause.owner !== wallet) throw forbidden('only the cause owner can change the homepage setting');
    checkSignedAt(body.message.signedAt);
    await verifySignedMessage('HomepageToggle', wallet, body.message, body.signature);
    const signedAt = new Date(Number(body.message.signedAt) * 1000);
    const existing = await db().homepageFlag.findUnique({ where: { causeId } });
    if (existing && (existing.signature === body.signature || existing.signedAt.getTime() >= signedAt.getTime())) {
      throw conflict('this toggle was already applied or is older than the stored one');
    }
    const flag = await db().homepageFlag.upsert({
      where: { causeId },
      create: { causeId, shown: body.message.shown, setBy: wallet, signature: body.signature, signedAt },
      update: { shown: body.message.shown, setBy: wallet, signature: body.signature, signedAt },
    });
    res.json({ causeId, shown: flag.shown, showOnHomepage: flag.shown && !flag.stewardHiddenReason, stewardHiddenReason: flag.stewardHiddenReason, updatedAt: flag.updatedAt.toISOString() });
  }),
);

// ---------------------------------------------------------------------------
// Stewards
// ---------------------------------------------------------------------------

writes.post(
  '/stewards/urgent-appeal',
  requireSteward,
  wrap(async (req, res) => {
    const body = parseBody(urgentAppealSchema, req.body);
    const cause = await db().cause.findUnique({ where: { id: body.causeId } });
    if (!cause) throw notFound('cause not found');
    const now = new Date();
    const cleared = await db().urgentAppeal.updateMany({ where: { clearedAt: null }, data: { clearedAt: now, clearedBy: req.wallet! } });
    if (body.clear) {
      res.json({ cleared: cleared.count, appeal: null });
      return;
    }
    const appeal = await db().urgentAppeal.create({
      data: { causeId: body.causeId, reason: body.reason, setBy: req.wallet!, startsAt: now, endsAt: body.endsAt ? new Date(body.endsAt) : null },
    });
    res.status(201).json({ cleared: cleared.count, appeal: { ...appeal, startsAt: appeal.startsAt.toISOString(), endsAt: appeal.endsAt?.toISOString() ?? null, clearedAt: null } });
  }),
);

writes.post(
  '/stewards/hide',
  requireSteward,
  wrap(async (req, res) => {
    const body = parseBody(stewardHideSchema, req.body);
    const cause = await db().cause.findUnique({ where: { id: body.causeId } });
    if (!cause) throw notFound('cause not found');
    const data = body.hidden
      ? { stewardHiddenReason: body.reason, stewardHiddenBy: req.wallet!, stewardHiddenAt: new Date() }
      : { stewardHiddenReason: null, stewardHiddenBy: null, stewardHiddenAt: null };
    const flag = await db().homepageFlag.upsert({
      where: { causeId: body.causeId },
      create: { causeId: body.causeId, shown: false, setBy: req.wallet!, signature: 'steward', signedAt: new Date(), ...data },
      update: data,
    });
    res.json({ causeId: body.causeId, hidden: !!flag.stewardHiddenReason, reason: flag.stewardHiddenReason, showOnHomepage: flag.shown && !flag.stewardHiddenReason });
  }),
);

// ---------------------------------------------------------------------------
// POST /challenges
// ---------------------------------------------------------------------------

writes.post(
  '/challenges',
  requireAuth,
  wrap(async (req, res) => {
    const body = parseBody(challengeSubmitSchema, req.body);
    const wallet = assertSameWallet(req.wallet, body.wallet);
    const causeId = Number(body.message.causeId);
    const { claimType, cs } = await currentClaim(causeId, body.message.claimType);
    if (body.message.epoch !== cs.epoch) throw badRequest(`claim is at epoch ${cs.epoch}`);
    if (!['challenge_window', 'final'].includes(cs.state) || cs.outcome === 'open') throw badRequest('only a finalised or pending-final claim can be challenged');
    if (contentHash(body.body) !== body.message.contentHash) throw badRequest('contentHash does not match the challenge body');
    checkSignedAt(body.message.signedAt);
    await verifySignedMessage('Challenge', wallet, body.message, body.signature);
    const eligibility = await voterEligibility(wallet);
    if (eligibility.kytState !== 'clear') throw new HttpError(403, 'wallet must pass KYT to challenge', eligibility);
    const dup = await db().challenge.findUnique({ where: { causeId_claimType_epoch_challenger: { causeId, claimType, epoch: cs.epoch, challenger: wallet } } });
    if (dup) throw conflict('this wallet already challenged this claim epoch');
    const challenge = await db().challenge.create({
      data: { causeId, claimType, epoch: cs.epoch, challenger: wallet, stake: Number(body.message.stake), contentHash: body.message.contentHash, body: body.body as object, signature: body.signature },
    });
    try {
      await stakeChallenge(wallet, challenge.id);
    } catch (err) {
      await db().challenge.delete({ where: { id: challenge.id } });
      if (err instanceof StakeError) throw new HttpError(402, err.message, { spendable: err.spendable, required: err.required });
      throw err;
    }
    const now = new Date();
    await db().claimState.update({
      where: { causeId_claimType: { causeId, claimType } },
      data: { state: 'voting', votingStart: now, votingEnd: new Date(now.getTime() + VOTING.periodDays * 86400 * 1000) },
    });
    await notifyClaimParticipants(causeId, claimType, cs.epoch, {
      kind: 'claim_challenged',
      title: `Claim ${claimType} on cause ${causeId} was challenged`,
      body: 'Voting reopened for 5 days with the challenge shown at the top.',
      data: { challengeId: challenge.id, priorOutcome: cs.outcome as ClaimOutcomeName },
    });
    res.status(201).json(serializeChallenge(challenge));
  }),
);

// ---------------------------------------------------------------------------
// POST /needs/:id/confirm
// ---------------------------------------------------------------------------

writes.post(
  '/needs/:id/confirm',
  requireAuth,
  wrap(async (req, res) => {
    const body = parseBody(helpConfirmSubmitSchema, req.body);
    const wallet = assertSameWallet(req.wallet, body.wallet);
    const needId = Number(req.params.id);
    if (Number(body.message.needId) !== needId) throw badRequest('needId does not match the route');
    const need = await db().need.findUnique({ where: { id: needId }, include: { cause: true } });
    if (!need) throw notFound('help request not found');
    if (need.cause.owner !== wallet) throw forbidden('only the cause owner can confirm help');
    checkSignedAt(body.message.signedAt);
    await verifySignedMessage('HelpConfirm', wallet, body.message, body.signature);
    if (need.confirmedAt) throw conflict('this help request was already confirmed');
    const helper = body.message.helper.toLowerCase();
    const updated = await db().need.update({ where: { id: needId }, data: { confirmedHelper: helper, confirmedAt: new Date(), confirmSignature: body.signature, open: false } });
    await rewardHelp(needId, helper);
    res.json(serializeNeed(updated));
  }),
);

// ---------------------------------------------------------------------------
// Share counts, profile settings, notifications
// ---------------------------------------------------------------------------

const shareSchema = z.object({ channel: z.enum(['whatsapp', 'telegram', 'x', 'facebook', 'copy', 'embed', 'qr', 'other']) });

writes.post(
  '/causes/:id/share',
  wrap(async (req, res) => {
    const body = parseBody(shareSchema, req.body);
    const causeId = Number(req.params.id);
    const cause = await db().cause.findUnique({ where: { id: causeId } });
    if (!cause) throw notFound('cause not found');
    await db().shareEvent.create({ data: { causeId, channel: body.channel } });
    const counts = await db().shareEvent.groupBy({ by: ['channel'], where: { causeId }, _count: { _all: true } });
    res.status(201).json({ causeId, shares: Object.fromEntries(counts.map((c) => [c.channel, c._count._all])) });
  }),
);

const meSchema = z.object({
  email: z.string().trim().email().max(200).nullable().optional(),
  leaderboardOptOut: z.boolean().optional(),
});

writes.post(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    const body = parseBody(meSchema, req.body);
    const data: { email?: string | null; leaderboardOptOut?: boolean } = {};
    if (body.email !== undefined) data.email = body.email;
    if (body.leaderboardOptOut !== undefined) data.leaderboardOptOut = body.leaderboardOptOut;
    const w = await db().wallet.upsert({ where: { address: req.wallet! }, create: { address: req.wallet!, ...data }, update: data });
    res.json({ wallet: w.address, email: w.email, leaderboardOptOut: w.leaderboardOptOut });
  }),
);

writes.post(
  '/notifications/read',
  requireAuth,
  wrap(async (req, res) => {
    const body = parseBody(z.object({ ids: z.array(z.string()).max(200).optional() }), req.body ?? {});
    const r = await db().notification.updateMany({ where: { wallet: req.wallet!, readAt: null, ...(body.ids ? { id: { in: body.ids } } : {}) }, data: { readAt: new Date() } });
    res.json({ marked: r.count });
  }),
);

export const claimCodes = CLAIMS;
