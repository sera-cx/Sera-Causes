/**
 * A4 QR poster: cause photo, name, QR to the cause page, "Give in stablecoins on causes.sera.cx".
 */
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Writable } from 'node:stream';
import { config } from '../../config.js';
import { BRAND, localPhotoRef } from './og.js';
import type { CauseView } from '../serializers.js';

async function localPhoto(photoUrl: string | null): Promise<Buffer | null> {
  if (!photoUrl) return null;
  const c = config();
  try {
    const local = localPhotoRef(photoUrl);
    if (local?.kind === 'seed') {
      if (!/\.(jpe?g|png)$/i.test(local.name)) return null;
      return await readFile(path.join(c.seedDir, 'photos', local.name));
    }
    if (local?.kind === 'upload') {
      const { db } = await import('../../db.js');
      const m = await db().media.findFirst({ where: { fileHash: local.name } });
      if (!m?.mime || !/image\/(jpeg|png)/.test(m.mime)) return null;
      return await readFile(path.join(c.uploadDir, local.name));
    }
    if (/^https:\/\//.test(photoUrl) && /\.(jpe?g|png)(\?|$)/i.test(photoUrl)) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      try {
        const res = await fetch(photoUrl, { signal: ctrl.signal });
        if (!res.ok) return null;
        return Buffer.from(await res.arrayBuffer());
      } finally {
        clearTimeout(t);
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function writePoster(cause: Pick<CauseView, 'id' | 'name' | 'slug' | 'photoUrl' | 'shareUrl' | 'stageLabel' | 'profile'>, depositAddress: string, out: Writable): Promise<void> {
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `${cause.name} poster`, Author: 'Care Share Donate' } });
  doc.pipe(out);
  const W = doc.page.width;
  const M = 48;
  const inner = W - M * 2;

  doc.rect(0, 0, W, 18).fill(BRAND.green);
  doc.fillColor(BRAND.greenText).font('Helvetica-Bold').fontSize(11).text('CARE SHARE DONATE · CAUSES.SERA.CX', M, 40, { characterSpacing: 1 });

  const photo = await localPhoto(cause.photoUrl);
  let y = 70;
  if (photo) {
    try {
      doc.save();
      doc.roundedRect(M, y, inner, 240, 12).clip();
      doc.image(photo, M, y, { cover: [inner, 240], align: 'center', valign: 'center' });
      doc.restore();
      y += 262;
    } catch {
      /* skip the photo */
    }
  }
  doc.fillColor(BRAND.ink).font('Helvetica-Bold').fontSize(30).text(cause.name, M, y, { width: inner });
  y = doc.y + 6;
  const place = cause.profile?.location ? [cause.profile.location.town, cause.profile.location.state].filter(Boolean).join(', ') : '';
  doc.font('Helvetica').fontSize(13).fillColor(BRAND.grey).text([place, cause.stageLabel].filter(Boolean).join(' · '), M, y, { width: inner });
  y = doc.y + 10;
  if (cause.profile?.summary) {
    doc.fontSize(13).fillColor(BRAND.ink).text(cause.profile.summary, M, y, { width: inner });
    y = doc.y + 18;
  }

  const qr = await QRCode.toBuffer(cause.shareUrl, { width: 720, margin: 1, color: { dark: BRAND.ink, light: '#FFFFFF' } });
  const qrSize = 220;
  const qrX = M;
  doc.image(qr, qrX, y, { width: qrSize, height: qrSize });
  doc.font('Helvetica-Bold').fontSize(20).fillColor(BRAND.ink).text('Scan to give', qrX + qrSize + 24, y + 20, { width: inner - qrSize - 24 });
  doc.font('Helvetica').fontSize(14).fillColor(BRAND.ink).text('Give in stablecoins on causes.sera.cx. Any wallet or exchange can send USDT, USDC, XSGD or MYRT straight to the cause.', qrX + qrSize + 24, doc.y + 8, { width: inner - qrSize - 24 });
  doc.font('Helvetica').fontSize(10).fillColor(BRAND.grey).text(cause.shareUrl, qrX + qrSize + 24, doc.y + 12, { width: inner - qrSize - 24 });
  doc.font('Courier').fontSize(9).fillColor(BRAND.grey).text(`Deposit address: ${depositAddress}`, qrX + qrSize + 24, doc.y + 6, { width: inner - qrSize - 24 });

  doc.rect(0, doc.page.height - 36, W, 36).fill(BRAND.ink);
  doc.fillColor('#FFFFFF').font('Helvetica').fontSize(10).text('Verification status and every gift are shown live on the cause page.', M, doc.page.height - 24, { width: inner, align: 'center' });
  doc.end();
}
