/**
 * Recompute a published claim result so anyone can check an on-chain root.
 *
 *   node dist/recompute.js <inputs.json> [--json]
 *
 * Inputs are the JSON the finaliser publishes alongside each `finaliseClaim`:
 *
 *   { "kind": "claim", "causeId", "claimType", "epoch", "votes": Vote[], "reputations": { [wallet]: score } }
 *
 * The result printed is what the finaliser should have committed. If it does
 * not match the chain, that is a public, provable fault.
 */

import { claimTypeIndex, type ClaimCode } from './constants.js';
import { merkleLeafFor, merkleRoot, tallyClaim } from './rules.js';
import type { ClaimTally, Hex, Vote } from './types.js';

export interface ClaimInputs {
  kind: 'claim';
  causeId?: number;
  claimType?: ClaimCode;
  epoch?: number;
  votes: Vote[];
  reputations?: Record<string, number>;
}

export type RecomputeInputs = ClaimInputs;

export interface ClaimResult {
  kind: 'claim';
  causeId: number | null;
  claimType: ClaimCode | null;
  claimTypeIndex: number | null;
  epoch: number | null;
  tally: ClaimTally;
  leaves: Hex[];
  resultRoot: Hex;
}

export type RecomputeResult = ClaimResult;

function scopedVotes(input: ClaimInputs): Vote[] {
  return input.votes.filter(
    (v) =>
      (input.causeId === undefined || v.causeId === input.causeId) &&
      (input.claimType === undefined || v.claimType === input.claimType) &&
      (input.epoch === undefined || v.epoch === input.epoch),
  );
}

/** Pure recompute. Votes outside the stated scope are ignored. */
export function recompute(input: RecomputeInputs): RecomputeResult {
  if (input.kind !== 'claim') {
    throw new TypeError(`unknown inputs kind ${String((input as { kind?: unknown }).kind)}`);
  }
  const votes = scopedVotes(input);
  const tally = tallyClaim(votes, input.reputations ?? {});
  const leaves = votes.map((vote) => merkleLeafFor({ kind: 'vote', vote }));
  return {
    kind: 'claim',
    causeId: input.causeId ?? null,
    claimType: input.claimType ?? null,
    claimTypeIndex: input.claimType ? claimTypeIndex(input.claimType) : null,
    epoch: input.epoch ?? null,
    tally,
    leaves,
    resultRoot: merkleRoot(leaves),
  };
}

/** Parse a published inputs file. Throws with a plain message on bad shape. */
export function parseInputs(text: string): RecomputeInputs {
  const data = JSON.parse(text) as Partial<RecomputeInputs>;
  if (data.kind !== 'claim') throw new TypeError('inputs kind must be "claim"');
  if (!Array.isArray(data.votes)) throw new TypeError('claim inputs need a votes array');
  return data as ClaimInputs;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(3);
}

/** Human-readable report. */
export function formatResult(result: RecomputeResult): string {
  const t = result.tally;
  const scope = [
    result.causeId !== null ? `cause ${result.causeId}` : null,
    result.claimType ? `claim ${result.claimType}` : null,
    result.epoch !== null ? `epoch ${result.epoch}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  return [
    `Claim tally${scope ? ` (${scope})` : ''}`,
    `  votes counted:  ${t.voters}`,
    `  verified:       ${fmt(t.verified)}`,
    `  not verified:   ${fmt(t.not)}`,
    `  needs more:     ${fmt(t.more)}`,
    `  total weight:   ${fmt(t.total)}`,
    `  quorum met:     ${t.quorumMet ? 'yes' : 'no'}`,
    `  verified share: ${(t.verifiedShare * 100).toFixed(1)}%`,
    `  passed:         ${t.passed ? 'yes' : 'no'}`,
    `  outcome:        ${t.outcome}`,
    `  leaves:         ${result.leaves.length}`,
    `  resultRoot:     ${result.resultRoot}`,
  ].join('\n');
}

/**
 * CLI entry. Node's fs and url modules are loaded lazily so this module stays
 * importable in the browser through the package index (the web app bundles
 * @sera-causes/shared; only the CLI path touches the filesystem).
 */
export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const file = argv.find((a) => !a.startsWith('--'));
  if (!file) {
    process.stderr.write('usage: node dist/recompute.js <inputs.json> [--json]\n');
    return 2;
  }
  const { readFileSync } = await import('node:fs');
  const result = recompute(parseInputs(readFileSync(file, 'utf8')));
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatResult(result)}\n`);
  }
  return 0;
}

async function runIfInvokedDirectly(): Promise<void> {
  if (typeof process === 'undefined' || typeof process.argv?.[1] !== 'string' || typeof process.versions?.node !== 'string') return;
  const { pathToFileURL } = await import('node:url');
  if (import.meta.url !== pathToFileURL(process.argv[1]).href) return;
  process.exitCode = await main();
}

void runIfInvokedDirectly();
