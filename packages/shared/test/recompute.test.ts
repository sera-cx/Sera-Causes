import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { formatResult, parseInputs, recompute } from '../src/recompute.js';
import { merkleLeafFor, merkleRoot } from '../src/rules.js';

const fixtureText = readFileSync(new URL('./fixtures/claim-inputs.json', import.meta.url), 'utf8');

describe('recompute on the claim fixture', () => {
  const inputs = parseInputs(fixtureText);
  const result = recompute(inputs);

  it('tallies the scoped votes with reputation weights', () => {
    expect(result.kind).toBe('claim');
    expect(result.claimTypeIndex).toBe(0);
    expect(result.tally).toMatchObject({
      verified: 10,
      not: 0,
      more: 1,
      total: 11,
      voters: 4,
      quorumMet: true,
      passed: true,
      outcome: 'verified',
    });
  });

  it('ignores votes for another claim and commits only the counted leaves', () => {
    expect(result.leaves).toHaveLength(4);
    if (inputs.kind !== 'claim') throw new Error('fixture must be a claim');
    const counted = inputs.votes.filter((v) => v.claimType === 'C1');
    expect(result.resultRoot).toBe(merkleRoot(counted.map((vote) => merkleLeafFor({ kind: 'vote', vote }))));
  });

  it('pins the fixture root so the finaliser and this package cannot drift', () => {
    expect(result.resultRoot).toBe('0xc6f45796661dc802fa536cb1a9397972f54b3f1d7dc8e31a92459fec7239acea');
  });

  it('gives the same root when votes are supplied in another order', () => {
    if (inputs.kind !== 'claim') throw new Error('fixture must be a claim');
    const shuffled = { ...inputs, votes: [...inputs.votes].reverse() };
    expect(recompute(shuffled).resultRoot).toBe(result.resultRoot);
  });

  it('prints a readable report', () => {
    const text = formatResult(result);
    expect(text).toContain('Claim tally (cause 7, claim C1, epoch 0)');
    expect(text).toContain('passed:         yes');
    expect(text).toContain(result.resultRoot);
  });

  it('rejects unknown input kinds', () => {
    expect(() => parseInputs('{"kind":"round","boosts":[]}')).toThrow(/kind must be "claim"/);
    expect(() => parseInputs('{"kind":"claim"}')).toThrow(/votes array/);
  });
});
