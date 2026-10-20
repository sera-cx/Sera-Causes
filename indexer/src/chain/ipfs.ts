/**
 * Fetching content-addressed data, without trusting whoever hands it over.
 *
 * A cause's profile and its evidence are named by CID, so the bytes are only
 * worth anything if they hash back to the name that was asked for. Two ways to
 * get them, in order of how much trust they need:
 *
 *   1. a local IPFS node (`IPFS_API_URL`). A node verifies every block against
 *      its CID as it assembles the content, so there is nothing left to check
 *      and no third party in the path. This is the one to run in production.
 *   2. a gateway from `IPFS_GATEWAYS`. A gateway is an HTTP server that can
 *      return whatever it likes, so the bytes are verified here before being
 *      used. Gateways are tried in order, because public ones rate-limit.
 *
 * Verification is only cheap for CIDs whose digest covers the bytes directly,
 * which means a raw codec with sha2-256: hash the response, compare, done. A
 * dag-pb CID names the root of a chunked DAG instead, so proving it needs the
 * whole DAG rebuilt, which is a node's job rather than ours. `IPFS_VERIFY`
 * decides what happens then: `strict` refuses the content, `warn` uses it and
 * says so, `off` skips checking entirely and is for local development.
 *
 * Nothing here is hardcoded: every gateway, the node URL and the policy come
 * from configuration.
 */
import { createHash } from 'node:crypto';
import { CID } from 'multiformats/cid';
import { config } from '../config.js';
import { logger } from '../log.js';

const SHA2_256 = 0x12;
const RAW_CODEC = 0x55;

export type IpfsVerify = 'strict' | 'warn' | 'off';

export interface IpfsFetchOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  apiUrl?: string;
  gateways?: string[];
  verify?: IpfsVerify;
}

export interface IpfsResult {
  bytes: Buffer;
  /** Where it came from, for logs and the record: an api url or a gateway. */
  source: string;
  /** True when the bytes were proven to match the CID, here or by a node. */
  verified: boolean;
}

/** Splits `<cid>` or `<cid>/a/b.json` into its root CID and the path under it. */
export function splitCidPath(ref: string): { cid: string; path: string } {
  const clean = ref.replace(/^ipfs:\/\//, '').replace(/^\/ipfs\//, '').replace(/^\/+/, '');
  const slash = clean.indexOf('/');
  return slash === -1 ? { cid: clean, path: '' } : { cid: clean.slice(0, slash), path: clean.slice(slash) };
}

/**
 * Whether this CID's digest covers the bytes themselves, so a plain hash is
 * enough to prove them. Raw blocks do; a dag-pb root names a DAG instead.
 */
export function isDirectlyVerifiable(cid: string): boolean {
  try {
    const parsed = CID.parse(cid);
    return parsed.code === RAW_CODEC && parsed.multihash.code === SHA2_256;
  } catch {
    return false;
  }
}

/** Throws unless sha2-256 over `bytes` is exactly the digest named by `cid`. */
export function assertMatchesCid(cid: string, bytes: Buffer): void {
  const parsed = CID.parse(cid);
  const got = createHash('sha256').update(bytes).digest();
  const want = Buffer.from(parsed.multihash.digest);
  if (!got.equals(want)) {
    throw new Error(`content does not match ${cid}: the gateway returned different bytes`);
  }
}

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await run(ctrl.signal);
  } finally {
    clearTimeout(t);
  }
}

/**
 * Fetches `ipfs://<cid>[/path]`, preferring a local node and falling back
 * through the configured gateways. Throws only when every source failed, or
 * when verification failed under `strict`.
 */
export async function fetchIpfs(ref: string, opts: IpfsFetchOptions = {}): Promise<IpfsResult> {
  const c = config();
  const f = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? c.ipfsTimeoutMs;
  const apiUrl = opts.apiUrl ?? c.ipfsApiUrl;
  const gateways = opts.gateways ?? c.ipfsGateways;
  const verify = opts.verify ?? c.ipfsVerify;
  const { cid, path } = splitCidPath(ref);
  if (!cid) throw new Error(`not an ipfs reference: ${ref}`);

  const failures: string[] = [];

  // 1. A local node. It has already checked every block against its CID.
  if (apiUrl) {
    const url = `${apiUrl.replace(/\/$/, '')}/api/v0/cat?arg=${encodeURIComponent(cid + path)}`;
    try {
      const bytes = await withTimeout(timeoutMs, async (signal) => {
        const res = await f(url, { method: 'POST', signal });
        if (!res.ok) throw new Error(`${res.status}`);
        return Buffer.from(await res.arrayBuffer());
      });
      return { bytes, source: apiUrl, verified: true };
    } catch (err) {
      failures.push(`node ${apiUrl}: ${(err as Error).message}`);
    }
  }

  // 2. Gateways, which are not trusted: check the bytes where we can.
  for (const gateway of gateways) {
    const url = gateway.replace(/\/$/, '') + '/' + cid + path;
    try {
      const bytes = await withTimeout(timeoutMs, async (signal) => {
        const res = await f(url, { signal });
        if (!res.ok) throw new Error(`${res.status}`);
        return Buffer.from(await res.arrayBuffer());
      });

      // A path under a directory CID is not covered by the root's digest.
      const checkable = !path && isDirectlyVerifiable(cid);
      if (verify !== 'off' && checkable) {
        assertMatchesCid(cid, bytes);
        return { bytes, source: gateway, verified: true };
      }
      if (verify === 'strict') {
        throw new Error(
          `cannot verify ${cid} from a gateway: ${path ? 'it is a path under a directory' : 'its digest covers a dag, not the bytes'}. ` +
            'Run a node (IPFS_API_URL), or set IPFS_VERIFY=warn to accept it unchecked.',
        );
      }
      if (verify === 'warn') {
        logger.warn({ cid, path, gateway }, 'ipfs content used without verification; run a node to remove this trust');
      }
      return { bytes, source: gateway, verified: false };
    } catch (err) {
      failures.push(`${gateway}: ${(err as Error).message}`);
    }
  }

  throw new Error(`could not fetch ${ref}. Tried: ${failures.join('; ') || 'nothing configured'}`);
}
