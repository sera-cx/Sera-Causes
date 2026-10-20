/**
 * The point of these: a gateway is an HTTP server that can return anything, so
 * what it hands back has to be checked against the CID that was asked for.
 */
import { createHash } from 'node:crypto';
import { CID } from 'multiformats/cid';
import * as raw from 'multiformats/codecs/raw';
import { sha256 } from 'multiformats/hashes/sha2';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { assertMatchesCid, fetchIpfs, isDirectlyVerifiable, splitCidPath } from '../src/chain/ipfs.js';

const BODY = Buffer.from(JSON.stringify({ schema: 'csd.cause/1', name: 'Kasih' }));
let rawCid: string;
/** A dag-pb CID: its digest names a DAG, so bytes alone cannot prove it. */
const DAG_PB_CID = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';

beforeAll(async () => {
  rawCid = CID.create(1, raw.code, await sha256.digest(BODY)).toString();
});

function gatewayReturning(bytes: Buffer, status = 200) {
  return vi.fn(
    async () => new Response(status === 200 ? new Uint8Array(bytes) : 'nope', { status }),
  ) as unknown as typeof fetch;
}

const GW = ['https://gw-one.test/ipfs', 'https://gw-two.test/ipfs'];

describe('splitCidPath', () => {
  it('separates the root cid from a path under it', () => {
    expect(splitCidPath('ipfs://bafy123')).toEqual({ cid: 'bafy123', path: '' });
    expect(splitCidPath('ipfs://bafy123/photos/a.jpg')).toEqual({ cid: 'bafy123', path: '/photos/a.jpg' });
    expect(splitCidPath('/ipfs/bafy123')).toEqual({ cid: 'bafy123', path: '' });
  });
});

describe('what can be proven', () => {
  it('a raw sha2-256 cid covers the bytes', () => {
    expect(isDirectlyVerifiable(rawCid)).toBe(true);
  });

  it('a dag-pb cid does not, and nonsense is not a cid', () => {
    expect(isDirectlyVerifiable(DAG_PB_CID)).toBe(false);
    expect(isDirectlyVerifiable('not-a-cid')).toBe(false);
  });

  it('accepts the right bytes and rejects altered ones', () => {
    expect(() => assertMatchesCid(rawCid, BODY)).not.toThrow();
    expect(() => assertMatchesCid(rawCid, Buffer.concat([BODY, Buffer.from('!')]))).toThrow(/does not match/);
  });
});

describe('fetchIpfs', () => {
  it('verifies what a gateway returns', async () => {
    const res = await fetchIpfs(`ipfs://${rawCid}`, { fetchImpl: gatewayReturning(BODY), gateways: GW, verify: 'strict' });
    expect(res.bytes.toString()).toBe(BODY.toString());
    expect(res.verified).toBe(true);
    expect(res.source).toBe(GW[0]);
  });

  it('refuses content a lying gateway substitutes', async () => {
    const evil = gatewayReturning(Buffer.from('{"name":"Not Kasih"}'));
    await expect(
      fetchIpfs(`ipfs://${rawCid}`, { fetchImpl: evil, gateways: [GW[0]!], verify: 'strict' }),
    ).rejects.toThrow(/could not fetch/);
  });

  it('falls through to the next gateway when the first is rate limited', async () => {
    let call = 0;
    const flaky = vi.fn(async () => {
      call += 1;
      return call === 1 ? new Response('rate limited', { status: 429 }) : new Response(new Uint8Array(BODY), { status: 200 });
    }) as unknown as typeof fetch;
    const res = await fetchIpfs(`ipfs://${rawCid}`, { fetchImpl: flaky, gateways: GW, verify: 'strict' });
    expect(res.source).toBe(GW[1]);
    expect(res.verified).toBe(true);
  });

  it('prefers a node, and reports it as verified without hashing', async () => {
    const seen: string[] = [];
    const impl = vi.fn(async (url: unknown) => {
      seen.push(String(url));
      return new Response(new Uint8Array(BODY), { status: 200 });
    }) as unknown as typeof fetch;
    const res = await fetchIpfs(`ipfs://${DAG_PB_CID}`, {
      fetchImpl: impl,
      apiUrl: 'http://127.0.0.1:5001',
      gateways: GW,
      verify: 'strict',
    });
    expect(res.verified).toBe(true);
    expect(res.source).toBe('http://127.0.0.1:5001');
    expect(seen[0]).toContain('/api/v0/cat?arg=');
  });

  it('under strict, refuses a dag-pb cid from a gateway rather than trusting it', async () => {
    await expect(
      fetchIpfs(`ipfs://${DAG_PB_CID}`, { fetchImpl: gatewayReturning(BODY), gateways: GW, verify: 'strict' }),
    ).rejects.toThrow(/could not fetch/);
  });

  it('under warn, uses it but marks it unverified', async () => {
    const res = await fetchIpfs(`ipfs://${DAG_PB_CID}`, {
      fetchImpl: gatewayReturning(BODY),
      gateways: GW,
      verify: 'warn',
    });
    expect(res.verified).toBe(false);
  });

  it('a path under a directory cid is never claimed as verified', async () => {
    const res = await fetchIpfs(`ipfs://${rawCid}/photos/a.jpg`, {
      fetchImpl: gatewayReturning(BODY),
      gateways: GW,
      verify: 'warn',
    });
    expect(res.verified).toBe(false);
  });

  it('reports every source it tried when all of them fail', async () => {
    await expect(
      fetchIpfs(`ipfs://${rawCid}`, { fetchImpl: gatewayReturning(BODY, 500), gateways: GW, verify: 'warn' }),
    ).rejects.toThrow(/gw-one\.test.*gw-two\.test/s);
  });
});
