/**
 * Open Graph image: 1200x630 PNG with the cause photo, name, status pill and
 * given so far. Brand: Sera green #00D26A, ink #0B1426, paper #FAF7EE.
 * IBM Plex Sans when installed, else the system sans.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { config } from '../../config.js';
import type { CauseView } from '../serializers.js';

export const BRAND = { green: '#00D26A', ink: '#0B1426', paper: '#FAF7EE', greenText: '#007A3D', amber: '#B45309', grey: '#6B7280', red: '#B91C1C' } as const;
const FONT = "'IBM Plex Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif";

export function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}

/** Greedy word wrap by estimated glyph width. */
export function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = w;
    } else line = next;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = `${lines[maxLines - 1]!.replace(/.{0,3}$/, '')}…`;
  }
  return lines;
}

/** A photo URL served by this API (any origin): seed photo or an upload. */
export function localPhotoRef(photoUrl: string): { kind: 'seed' | 'upload'; name: string } | null {
  try {
    const u = new URL(photoUrl);
    const m = /^\/(photos|uploads)\/([^/]+)$/.exec(u.pathname);
    if (!m) return null;
    return { kind: m[1] === 'photos' ? 'seed' : 'upload', name: path.basename(decodeURIComponent(m[2]!)) };
  } catch {
    return null;
  }
}

/** Reads the cause photo as a data URI, from disk when it is one of ours, else over https. Null on any failure. */
export async function photoDataUri(photoUrl: string | null, opts: { fetchImpl?: typeof fetch } = {}): Promise<string | null> {
  if (!photoUrl) return null;
  const c = config();
  try {
    let bytes: Buffer | null = null;
    let mime = 'image/jpeg';
    const local = localPhotoRef(photoUrl);
    if (local?.kind === 'seed') {
      const file = local.name;
      bytes = await readFile(path.join(c.seedDir, 'photos', file));
      mime = file.endsWith('.png') ? 'image/png' : file.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    } else if (local?.kind === 'upload') {
      const hash = local.name;
      const { db } = await import('../../db.js');
      const m = await db().media.findFirst({ where: { fileHash: hash } });
      if (!m?.mime) return null;
      bytes = await readFile(path.join(c.uploadDir, hash));
      mime = m.mime;
    } else if (/^https:\/\//.test(photoUrl)) {
      const f = opts.fetchImpl ?? fetch;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      try {
        const res = await f(photoUrl, { signal: ctrl.signal });
        if (!res.ok) return null;
        mime = res.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
        bytes = Buffer.from(await res.arrayBuffer());
      } finally {
        clearTimeout(t);
      }
    }
    if (!bytes || bytes.length > 8 * 1024 * 1024) return null;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) return null;
    return `data:${mime};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}

function toneColour(tone: string): { fill: string; text: string } {
  if (tone === 'green') return { fill: BRAND.green, text: BRAND.ink };
  if (tone === 'amber') return { fill: '#FCD34D', text: BRAND.ink };
  if (tone === 'red') return { fill: '#FCA5A5', text: BRAND.ink };
  return { fill: '#E5E7EB', text: BRAND.ink };
}

export function ogSvg(cause: Pick<CauseView, 'name' | 'stageLabel' | 'stageTone' | 'checksDone' | 'checksTotal' | 'givenUsd' | 'giversCount' | 'status' | 'profile'>, photo: string | null): string {
  const W = 1200;
  const H = 630;
  const photoW = 460;
  const name = cause.name;
  const size = name.length > 48 ? 44 : name.length > 28 ? 54 : 64;
  const lines = wrapText(name, Math.floor(640 / (size * 0.52)), 3);
  const tone = toneColour(cause.stageTone);
  const pill = `${cause.stageLabel}${cause.status === 'listed' || cause.status === 'verified' ? ` · ${cause.checksDone} of ${cause.checksTotal} checks` : ''}`;
  const given = `US$${Number(cause.givenUsd).toLocaleString('en-GB', { maximumFractionDigits: 0 })} given so far`;
  const givers = cause.giversCount === 1 ? '1 giver' : `${cause.giversCount} givers`;
  const place = cause.profile?.location ? [cause.profile.location.town, cause.profile.location.state].filter(Boolean).join(', ') : '';
  const initial = escapeXml((name[0] ?? 'S').toUpperCase());
  const photoEl = photo
    ? `<image href="${photo}" x="0" y="0" width="${photoW}" height="${H}" preserveAspectRatio="xMidYMid slice" clip-path="url(#photo)"/>`
    : `<rect x="0" y="0" width="${photoW}" height="${H}" fill="${BRAND.green}"/><text x="${photoW / 2}" y="${H / 2 + 60}" font-family="${FONT}" font-size="220" font-weight="700" fill="${BRAND.ink}" text-anchor="middle">${initial}</text>`;
  const nameEls = lines.map((l, i) => `<text x="520" y="${250 + i * (size + 8)}" font-family="${FONT}" font-size="${size}" font-weight="700" fill="${BRAND.ink}">${escapeXml(l)}</text>`).join('');
  const pillW = Math.min(620, 28 + pill.length * 13);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><clipPath id="photo"><rect x="0" y="0" width="${photoW}" height="${H}"/></clipPath></defs>
  <rect width="${W}" height="${H}" fill="${BRAND.paper}"/>
  ${photoEl}
  <rect x="${photoW}" y="0" width="12" height="${H}" fill="${BRAND.green}"/>
  <text x="520" y="92" font-family="${FONT}" font-size="26" font-weight="600" fill="${BRAND.greenText}" letter-spacing="1">CARE SHARE DONATE · CAUSES.SERA.CX</text>
  ${place ? `<text x="520" y="150" font-family="${FONT}" font-size="28" fill="${BRAND.grey}">${escapeXml(place)}</text>` : ''}
  ${nameEls}
  <rect x="520" y="430" rx="24" ry="24" width="${pillW}" height="48" fill="${tone.fill}"/>
  <text x="${520 + pillW / 2}" y="463" font-family="${FONT}" font-size="24" font-weight="600" fill="${tone.text}" text-anchor="middle">${escapeXml(pill)}</text>
  <text x="520" y="540" font-family="${FONT}" font-size="34" font-weight="700" fill="${BRAND.ink}">${escapeXml(given)}</text>
  <text x="520" y="580" font-family="${FONT}" font-size="26" fill="${BRAND.grey}">${escapeXml(givers)} · Give in stablecoins on causes.sera.cx</text>
</svg>`;
}

export async function renderOgPng(cause: Parameters<typeof ogSvg>[0] & { photoUrl: string | null }, opts: { fetchImpl?: typeof fetch } = {}): Promise<Buffer> {
  const photo = await photoDataUri(cause.photoUrl, opts);
  const svg = ogSvg(cause, photo);
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
    font: { loadSystemFonts: true, defaultFontFamily: 'IBM Plex Sans' },
    background: BRAND.paper,
  });
  return Buffer.from(resvg.render().asPng());
}
