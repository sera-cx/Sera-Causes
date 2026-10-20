/**
 * Fetches cause metadata (csd.cause/1) from a cause `uri`: https://, data:, ipfs://
 * or a path relative to SEED_DIR (what the demo chain and local seed use).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { causeProfileSchema, type CauseProfile } from '@sera-causes/shared';
import { config } from '../config.js';
import { fetchIpfs } from './ipfs.js';


export function decodeDataUri(uri: string): unknown {
  const m = /^data:([^,]*?)(;base64)?,(.*)$/s.exec(uri);
  if (!m) throw new Error('not a data uri');
  const [, , b64, payload] = m;
  const text = b64 ? Buffer.from(payload!, 'base64').toString('utf8') : decodeURIComponent(payload!);
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

/** Parses a small JSON payload carried in an attestation, need or progress uri. Never throws. */
export function parseJsonUri(uri: string): Record<string, unknown> | null {
  try {
    if (uri.startsWith('data:')) {
      const v = decodeDataUri(uri);
      return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
    }
  } catch {
    /* fall through */
  }
  return null;
}

export async function fetchUriText(uri: string, opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}): Promise<string> {
  const c = config();
  if (uri.startsWith('data:')) {
    const v = decodeDataUri(uri);
    return typeof v === 'string' ? v : JSON.stringify(v);
  }
  // Content-addressed: a node if there is one, else the configured gateways,
  // with the bytes checked against the CID wherever that is possible.
  if (uri.startsWith('ipfs://')) {
    const { bytes } = await fetchIpfs(uri, { fetchImpl: opts.fetchImpl, timeoutMs: opts.timeoutMs });
    return bytes.toString('utf8');
  }
  const url = uri;
  if (/^https?:\/\//.test(url)) {
    const f = opts.fetchImpl ?? fetch;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 10_000);
    try {
      const res = await f(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
      return await res.text();
    } finally {
      clearTimeout(t);
    }
  }
  // Relative path such as seed/causes/<slug>.json: resolve under SEED_DIR.
  const rel = uri.replace(/^\.?\/?seed\//, '');
  const file = path.resolve(c.seedDir, rel);
  if (!file.startsWith(c.seedDir)) throw new Error(`refusing to read outside SEED_DIR: ${uri}`);
  return readFile(file, 'utf8');
}

export interface FetchedProfile {
  profile: CauseProfile | null;
  photoUrl: string | null;
  slug: string | null;
}

/** Turns a profile image src into an absolute URL the site can show. */
export function photoUrlFor(profile: CauseProfile | null, uri: string): string | null {
  const src = profile?.image?.src;
  if (!src) return null;
  if (/^https?:\/\//.test(src)) return src;
  const c = config();
  // A browser cannot speak ipfs://, so a photo needs a gateway URL. The first
  // configured gateway is the public one; a local node is not reachable from
  // someone else's browser, so it is deliberately not used here.
  if (src.startsWith('ipfs://')) {
    const gateway = c.ipfsGateways[0];
    return gateway ? `${gateway.replace(/\/$/, '')}/${src.slice('ipfs://'.length)}` : null;
  }
  const file = src.replace(/^\.?\/?(seed\/)?photos\//, '');
  if (/^https?:\/\//.test(uri)) {
    // Relative to the profile's own location.
    try {
      return new URL(src, uri).toString();
    } catch {
      /* fall through */
    }
  }
  return `${c.PUBLIC_API_URL}/photos/${file}`;
}

export async function fetchProfile(uri: string, opts: { fetchImpl?: typeof fetch } = {}): Promise<FetchedProfile> {
  try {
    const text = await fetchUriText(uri, opts);
    const json = JSON.parse(text);
    const parsed = causeProfileSchema.safeParse(json);
    const profile = (parsed.success ? parsed.data : json) as CauseProfile;
    return { profile, photoUrl: photoUrlFor(profile, uri), slug: typeof profile?.slug === 'string' ? profile.slug : null };
  } catch {
    return { profile: null, photoUrl: null, slug: null };
  }
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'cause';
}
