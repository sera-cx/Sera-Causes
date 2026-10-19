import { privateKeyToAccount } from 'viem/accounts';
import { hashTypedData, keccak256, toBytes, verifyTypedData } from 'viem';
import { describe, expect, it } from 'vitest';

import {
  CAUSES_TYPES,
  canonicalJson,
  causesDomain,
  contentHash,
  textHash,
  typedData,
  typedDataHash,
  type HomepageToggleMessage,
  type PathMessage,
  type VoteMessage,
} from '../src/eip712.js';

const registry = '0x1234567890abcdef1234567890abcdef12345678' as const;
const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');

describe('causesDomain', () => {
  it('matches ARCHITECTURE.md section 4', () => {
    expect(causesDomain(11155111, registry)).toEqual({
      name: 'Sera Causes',
      version: '1',
      chainId: 11155111,
      verifyingContract: registry,
    });
  });
});

describe('typed data', () => {
  it('encodes the five primary types with the documented field order', () => {
    const sig = (name: keyof typeof CAUSES_TYPES) =>
      `${name}(${CAUSES_TYPES[name].map((f) => `${f.type} ${f.name}`).join(',')})`;
    expect(sig('Path')).toBe(
      'Path(uint256 causeId,uint8 claimType,uint32 epoch,bytes32 contentHash,uint8 result,uint64 checkedAt)',
    );
    expect(sig('Vote')).toBe(
      'Vote(uint256 causeId,uint8 claimType,uint32 epoch,uint8 choice,bytes32 reasonHash,uint64 signedAt)',
    );
    expect(sig('HomepageToggle')).toBe('HomepageToggle(uint256 causeId,bool shown,uint64 signedAt)');
    expect(sig('Challenge')).toBe(
      'Challenge(uint256 causeId,uint8 claimType,uint32 epoch,uint256 stake,bytes32 contentHash,uint64 signedAt)',
    );
    expect(sig('HelpConfirm')).toBe('HelpConfirm(uint256 needId,address helper,uint64 signedAt)');
    expect(Object.keys(CAUSES_TYPES)).not.toContain('Boost');
  });

  it('signs and verifies a vote with viem', async () => {
    const message: VoteMessage = {
      causeId: 7n,
      claimType: 0,
      epoch: 0,
      choice: 1,
      reasonHash: textHash('ROS search matches'),
      signedAt: 1792000000n,
    };
    const data = typedData('Vote', 11155111, registry, message);
    const signature = await account.signTypedData(data);
    expect(await verifyTypedData({ ...data, address: account.address, signature })).toBe(true);
    expect(
      await verifyTypedData({ ...data, message: { ...message, choice: 2 }, address: account.address, signature }),
    ).toBe(false);
    expect(typedDataHash('Vote', 11155111, registry, message)).toBe(hashTypedData(data));
  });

  it('signs a homepage toggle and a path', async () => {
    const toggle: HomepageToggleMessage = { causeId: 7n, shown: true, signedAt: 1792000000n };
    const toggleData = typedData('HomepageToggle', 1, registry, toggle);
    const sig = await account.signTypedData(toggleData);
    expect(await verifyTypedData({ ...toggleData, address: account.address, signature: sig })).toBe(true);

    const path: PathMessage = {
      causeId: 7n,
      claimType: 0,
      epoch: 0,
      contentHash: contentHash({ source: 'ROS' }),
      result: 1,
      checkedAt: 1792000000n,
    };
    const pathData = typedData('Path', 1, registry, path);
    const pathSig = await account.signTypedData(pathData);
    expect(await verifyTypedData({ ...pathData, address: account.address, signature: pathSig })).toBe(true);
  });

  it('a different chain or registry gives a different digest', () => {
    const message: HomepageToggleMessage = { causeId: 1n, shown: false, signedAt: 1n };
    const a = typedDataHash('HomepageToggle', 1, registry, message);
    expect(typedDataHash('HomepageToggle', 11155111, registry, message)).not.toBe(a);
    expect(typedDataHash('HomepageToggle', 1, '0x0000000000000000000000000000000000000001', message)).not.toBe(a);
  });
});

describe('canonicalJson and contentHash', () => {
  it('sorts keys recursively and strips whitespace', () => {
    const a = { z: 1, a: { d: [3, { y: 2, x: 1 }], c: 'text' } };
    expect(canonicalJson(a)).toBe('{"a":{"c":"text","d":[3,{"x":1,"y":2}]},"z":1}');
  });

  it('is independent of key order and drops undefined', () => {
    const a = { steps: ['1', '2'], source: 'ROS', caveats: undefined };
    const b = { source: 'ROS', steps: ['1', '2'] };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(contentHash(a)).toBe(contentHash(b));
  });

  it('serialises bigints as decimal strings and dates as ISO', () => {
    expect(canonicalJson({ n: 10n, d: new Date('2026-10-19T00:00:00Z') })).toBe(
      '{"d":"2026-10-19T00:00:00.000Z","n":"10"}',
    );
  });

  it('contentHash is keccak256 of the UTF-8 bytes', () => {
    const obj = { source: 'ROS', name: 'Persatuan Pemuliharaan Penyu' };
    expect(contentHash(obj)).toBe(keccak256(toBytes(canonicalJson(obj))));
    expect(contentHash(obj)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('refuses values that cannot round-trip', () => {
    expect(() => canonicalJson({ n: Number.NaN })).toThrow(TypeError);
    expect(() => canonicalJson(undefined)).toThrow(TypeError);
  });
});
