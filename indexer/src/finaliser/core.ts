/**
 * Finaliser steps shared by the CLI and tests: tally, publish inputs, Merkle root,
 * on-chain finaliseClaim, challenge window.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { type Hex } from 'viem';
import {
  CLAIMS,
  VOTING,
  claimOutcomeValue,
  claimTypeIndex,
  merkleLeafFor,
  merkleRoot,
  type ClaimCode,
  type ClaimOutcomeName,
  type PathResult,
  type VoteChoice,
} from '@sera-causes/shared';
import { db } from '../db.js';
import { config } from '../config.js';
import { tallyFor } from '../api/tally.js';
import { registryAbi } from '../chain/abi.js';
import { getFinaliserWallet, getPublicClient } from '../chain/client.js';

export function parseClaim(code: string): ClaimCode {
  const c = code.toUpperCase() as ClaimCode;
  if (!CLAIMS.includes(c)) throw new Error(`unknown claim ${code}; use C1..C7`);
  return c;
}

export function parseOutcome(name: string): Exclude<ClaimOutcomeName, 'open'> {
  const n = name.toLowerCase().replace('-', '_');
  if (n === 'verified' || n === 'not_verified' || n === 'needs_more') return n;
  throw new Error(`unknown outcome ${name}; use verified, not_verified or needs_more`);
}

export interface ClaimInputs {
  schema: 'sera-causes.claim-inputs/1';
  chainId: number;
  registry: string;
  causeId: number;
  claim: ClaimCode;
  claimType: number;
  epoch: number;
  generatedAt: string;
  verificationMode: string;
  decidedBy: 'stewards' | 'votes';
  outcome: ClaimOutcomeName;
  tally: Awaited<ReturnType<typeof tallyFor>>['tally'];
  reputations: Record<string, number>;
  votes: { voter: string; choice: VoteChoice; reason: string; signedAt: number; weight: number; signature: string; leaf: Hex }[];
  paths: { author: string; result: PathResult; contentHash: Hex; checkedAt: string; signature: string; leaf: Hex }[];
  leaves: Hex[];
  resultRoot: Hex;
}

export async function buildInputs(causeId: number, claim: ClaimCode, outcome: ClaimOutcomeName): Promise<ClaimInputs> {
  const c = config();
  const cs = await db().claimState.findUnique({ where: { causeId_claimType: { causeId, claimType: claim } } });
  if (!cs) throw new Error(`claim ${claim} of cause ${causeId} not found`);
  const { tally, votes, reputations } = await tallyFor(causeId, claim, cs.epoch);
  const paths = await db().path.findMany({ where: { causeId, claimType: claim, epoch: cs.epoch }, orderBy: { createdAt: 'asc' } });
  const voteRows = votes.map((v) => {
    const signedAt = Math.floor(v.signedAt.getTime() / 1000);
    const leaf = merkleLeafFor({ kind: 'vote', vote: { voter: v.voter as Hex, causeId, claimType: claim, epoch: cs.epoch, choice: v.choice as VoteChoice, reason: v.reason, signedAt } });
    return { voter: v.voter, choice: v.choice as VoteChoice, reason: v.reason, signedAt, weight: v.weight, signature: v.signature, leaf };
  });
  const pathRows = paths.map((p) => {
    const leaf = merkleLeafFor({ kind: 'path', path: { author: p.author as Hex, causeId, claimType: claim, epoch: cs.epoch, contentHash: p.contentHash as Hex, result: p.result as PathResult, checkedAt: p.checkedAt.toISOString() } });
    return { author: p.author, result: p.result as PathResult, contentHash: p.contentHash as Hex, checkedAt: p.checkedAt.toISOString(), signature: p.signature, leaf };
  });
  const leaves = [...voteRows.map((v) => v.leaf), ...pathRows.map((p) => p.leaf)];
  return {
    schema: 'sera-causes.claim-inputs/1',
    chainId: c.CHAIN_ID,
    registry: c.REGISTRY_ADDRESS,
    causeId,
    claim,
    claimType: claimTypeIndex(claim),
    epoch: cs.epoch,
    generatedAt: new Date().toISOString(),
    verificationMode: c.verificationMode,
    decidedBy: c.verificationMode === 'advisory' ? 'stewards' : 'votes',
    outcome,
    tally,
    reputations: Object.fromEntries(reputations),
    votes: voteRows,
    paths: pathRows,
    leaves,
    resultRoot: merkleRoot(leaves),
  };
}

export async function publishInputs(inputs: ClaimInputs): Promise<string> {
  const dir = path.join(config().publicDir, 'results');
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${inputs.causeId}-${inputs.claim}-${inputs.epoch}.json`);
  await writeFile(file, JSON.stringify(inputs, null, 1));
  return file;
}

/** Sends finaliseClaim and waits for the receipt. Returns the tx hash. */
export async function sendFinaliseClaim(inputs: ClaimInputs): Promise<Hex> {
  const c = config();
  const wallet = getFinaliserWallet();
  const hash = await wallet.writeContract({
    address: c.REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: 'finaliseClaim',
    args: [BigInt(inputs.causeId), inputs.claimType, claimOutcomeValue(inputs.outcome), inputs.resultRoot],
    chain: wallet.chain,
    account: wallet.account!,
  });
  await getPublicClient().waitForTransactionReceipt({ hash });
  return hash;
}

/** Records the outcome locally and opens the 72-hour challenge window. */
export async function openChallengeWindow(inputs: ClaimInputs, now: Date = new Date()): Promise<void> {
  const reopens = inputs.outcome === 'needs_more';
  await db().claimState.update({
    where: { causeId_claimType: { causeId: inputs.causeId, claimType: inputs.claim } },
    data: reopens
      ? { outcome: inputs.outcome, resultRoot: inputs.resultRoot, finalisedAt: now, epoch: inputs.epoch + 1, state: 'open', votingStart: null, votingEnd: null, challengeWindowEnd: null, settledAt: null }
      : { outcome: inputs.outcome, resultRoot: inputs.resultRoot, finalisedAt: now, state: 'challenge_window', challengeWindowEnd: new Date(now.getTime() + VOTING.challengeWindowHours * 3600 * 1000), settledAt: null },
  });
}
