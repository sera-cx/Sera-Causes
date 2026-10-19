/**
 * EIP-712 typed data for paths, votes, the homepage toggle, challenges and
 * help confirmations (ARCHITECTURE.md section 4), plus canonical JSON hashing.
 */
import {
  encodeAbiParameters,
  hashTypedData,
  keccak256,
  stringToHex,
  toBytes,
  type Address,
  type Hex,
  type TypedDataDomain,
} from 'viem';

export const CAUSES_DOMAIN_NAME = 'Sera Causes';
export const CAUSES_DOMAIN_VERSION = '1';

/** EIP-712 domain for a deployment of the registry. */
export function causesDomain(chainId: number, registry: Address): TypedDataDomain {
  return {
    name: CAUSES_DOMAIN_NAME,
    version: CAUSES_DOMAIN_VERSION,
    chainId,
    verifyingContract: registry,
  };
}

export const PATH_TYPES = {
  Path: [
    { name: 'causeId', type: 'uint256' },
    { name: 'claimType', type: 'uint8' },
    { name: 'epoch', type: 'uint32' },
    { name: 'contentHash', type: 'bytes32' },
    { name: 'result', type: 'uint8' },
    { name: 'checkedAt', type: 'uint64' },
  ],
} as const;

export const VOTE_TYPES = {
  Vote: [
    { name: 'causeId', type: 'uint256' },
    { name: 'claimType', type: 'uint8' },
    { name: 'epoch', type: 'uint32' },
    { name: 'choice', type: 'uint8' },
    { name: 'reasonHash', type: 'bytes32' },
    { name: 'signedAt', type: 'uint64' },
  ],
} as const;

export const HOMEPAGE_TOGGLE_TYPES = {
  HomepageToggle: [
    { name: 'causeId', type: 'uint256' },
    { name: 'shown', type: 'bool' },
    { name: 'signedAt', type: 'uint64' },
  ],
} as const;

export const CHALLENGE_TYPES = {
  Challenge: [
    { name: 'causeId', type: 'uint256' },
    { name: 'claimType', type: 'uint8' },
    { name: 'epoch', type: 'uint32' },
    { name: 'stake', type: 'uint256' },
    { name: 'contentHash', type: 'bytes32' },
    { name: 'signedAt', type: 'uint64' },
  ],
} as const;

export const HELP_CONFIRM_TYPES = {
  HelpConfirm: [
    { name: 'needId', type: 'uint256' },
    { name: 'helper', type: 'address' },
    { name: 'signedAt', type: 'uint64' },
  ],
} as const;

/** All five type sets keyed by primary type. */
export const CAUSES_TYPES = {
  ...PATH_TYPES,
  ...VOTE_TYPES,
  ...HOMEPAGE_TOGGLE_TYPES,
  ...CHALLENGE_TYPES,
  ...HELP_CONFIRM_TYPES,
} as const;

export type CausesPrimaryType = keyof typeof CAUSES_TYPES;

// Message shapes as viem expects them: uint256 and uint64 as bigint, smaller ints as number.

export interface PathMessage {
  causeId: bigint;
  claimType: number;
  epoch: number;
  contentHash: Hex;
  /** 1 verified, 2 not_verified, 3 could_not_check. */
  result: number;
  checkedAt: bigint;
}

export interface VoteMessage {
  causeId: bigint;
  claimType: number;
  epoch: number;
  /** 1 verified, 2 not_verified, 3 needs_more. */
  choice: number;
  reasonHash: Hex;
  signedAt: bigint;
}

export interface HomepageToggleMessage {
  causeId: bigint;
  shown: boolean;
  signedAt: bigint;
}

export interface ChallengeMessage {
  causeId: bigint;
  claimType: number;
  epoch: number;
  stake: bigint;
  contentHash: Hex;
  signedAt: bigint;
}

export interface HelpConfirmMessage {
  needId: bigint;
  helper: Address;
  signedAt: bigint;
}

export interface CausesMessages {
  Path: PathMessage;
  Vote: VoteMessage;
  HomepageToggle: HomepageToggleMessage;
  Challenge: ChallengeMessage;
  HelpConfirm: HelpConfirmMessage;
}

/** The full object to pass to `signTypedData` or `verifyTypedData`. */
export function typedData<K extends CausesPrimaryType>(
  kind: K,
  chainId: number,
  registry: Address,
  message: CausesMessages[K],
) {
  return {
    domain: causesDomain(chainId, registry),
    types: { [kind]: CAUSES_TYPES[kind] } as { [P in K]: (typeof CAUSES_TYPES)[K] },
    primaryType: kind,
    message,
  } as const;
}

/** EIP-712 digest of a message, the hash the wallet signs. */
export function typedDataHash<K extends CausesPrimaryType>(
  kind: K,
  chainId: number,
  registry: Address,
  message: CausesMessages[K],
): Hex {
  const data = typedData(kind, chainId, registry, message);
  // viem's generic parameterisation over the union of type sets is too narrow to express
  // here; the shape is correct by construction.
  return hashTypedData(data as unknown as Parameters<typeof hashTypedData>[0]);
}

// ---------------------------------------------------------------------------
// Canonical JSON and content hashes
// ---------------------------------------------------------------------------

function canonicalise(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('canonicalJson: non-finite number');
      return JSON.stringify(value);
    case 'bigint':
      return JSON.stringify(value.toString());
    case 'string':
      return JSON.stringify(value);
    case 'undefined':
      throw new TypeError('canonicalJson: undefined is not allowed here');
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value.map((v) => canonicalise(v === undefined ? null : v)).join(',')}]`;
      }
      if (value instanceof Date) return JSON.stringify(value.toISOString());
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined && typeof v !== 'function')
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalise(v)}`).join(',')}}`;
    }
    default:
      throw new TypeError(`canonicalJson: cannot serialise ${typeof value}`);
  }
}

/**
 * Deterministic JSON: object keys sorted (recursively), no whitespace,
 * `undefined` properties dropped, bigints as decimal strings, dates as ISO.
 */
export function canonicalJson(obj: unknown): string {
  return canonicalise(obj);
}

/** keccak256 of the UTF-8 bytes of `canonicalJson(obj)`. */
export function contentHash(obj: unknown): Hex {
  return keccak256(toBytes(canonicalJson(obj)));
}

/** keccak256 of a UTF-8 string, used for `reasonHash` on votes. */
export function textHash(text: string): Hex {
  return keccak256(toBytes(text));
}

// ---------------------------------------------------------------------------
// Merkle leaves for signed messages
// ---------------------------------------------------------------------------

/** Type tag mixed into every leaf so a vote leaf can never collide with a path leaf. */
export function leafTag(kind: CausesPrimaryType): Hex {
  return keccak256(stringToHex(kind));
}

/** Leaf for a vote: keccak256(abi.encode(tag, voter, causeId, claimType, epoch, choice, reasonHash, signedAt)). */
export function voteLeaf(voter: Address, m: VoteMessage): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'address' },
        { type: 'uint256' },
        { type: 'uint8' },
        { type: 'uint32' },
        { type: 'uint8' },
        { type: 'bytes32' },
        { type: 'uint64' },
      ],
      [leafTag('Vote'), voter, m.causeId, m.claimType, m.epoch, m.choice, m.reasonHash, m.signedAt],
    ),
  );
}

/** Leaf for a path: keccak256(abi.encode(tag, author, causeId, claimType, epoch, contentHash, result, checkedAt)). */
export function pathLeaf(author: Address, m: PathMessage): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'address' },
        { type: 'uint256' },
        { type: 'uint8' },
        { type: 'uint32' },
        { type: 'bytes32' },
        { type: 'uint8' },
        { type: 'uint64' },
      ],
      [leafTag('Path'), author, m.causeId, m.claimType, m.epoch, m.contentHash, m.result, m.checkedAt],
    ),
  );
}
