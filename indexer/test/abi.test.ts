import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { registryAbi } from '../src/chain/abi.js';

const require = createRequire(import.meta.url);
const artifact = require('@sera-causes/contracts/abi') as { abi: { type: string; name: string; inputs: { type: string; name: string; indexed?: boolean }[] }[] };

describe('registry ABI subset', () => {
  it('matches the compiled CauseRegistry artifact for every event and function it declares', () => {
    for (const item of registryAbi) {
      if (item.type !== 'event' && item.type !== 'function') continue;
      const match = artifact.abi.find((a) => a.type === item.type && a.name === item.name);
      expect(match, `${item.type} ${item.name} missing from artifact`).toBeTruthy();
      expect(match!.inputs.map((i) => i.type)).toEqual(item.inputs.map((i) => i.type));
      if (item.type === 'event') expect(match!.inputs.map((i) => !!i.indexed)).toEqual(item.inputs.map((i) => !!(i as { indexed?: boolean }).indexed));
    }
  });

  it('does not depend on the escrow functions removed in docs/PLAN.md section 6', () => {
    const names = registryAbi.map((i) => ('name' in i ? i.name : ''));
    for (const gone of ['donate', 'claim', 'refund', 'Donated', 'Claimed', 'Refunded', 'TokenSet']) expect(names).not.toContain(gone);
  });
});
