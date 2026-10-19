/**
 * Typed subset of the CauseRegistry ABI: every event of the revised v1.1 contract
 * (no donate, claim or refund), plus the functions the indexer calls. test/abi.test.ts checks it against contracts/build/CauseRegistry.json.
 */
import { parseAbi } from 'viem';

export const registryAbi = parseAbi([
  'event Attested(uint256 indexed causeId, address indexed attester, bytes32 indexed kind, string uri)',
  'event CauseListed(uint256 indexed causeId, address indexed owner, bytes32 indexed category, address payout, string uri, bytes32 frontend)',
  'event CauseUpdated(uint256 indexed causeId, string uri)',
  'event ClaimFinalised(uint256 indexed causeId, uint8 indexed claim, uint8 outcome, bytes32 resultRoot, address by)',
  'event CouncilChanged(address council)',
  'event FinaliserSet(address indexed who, bool on)',
  'event NeedClosed(uint256 indexed needId, address indexed helper)',
  'event NeedPosted(uint256 indexed needId, uint256 indexed causeId, string uri)',
  'event OwnerChanged(uint256 indexed causeId, address owner)',
  'event PayoutChanged(uint256 indexed causeId, address payout)',
  'event Pledged(uint256 indexed needId, address indexed helper, string uri)',
  'event ProgressPosted(uint256 indexed causeId, bytes32 indexed kind, string uri)',
  'event RequiresCareLicenceSet(uint256 indexed causeId, bool on)',
  'event StatusChanged(uint256 indexed causeId, uint8 status, address indexed by, string note)',
  'event StewardSet(address indexed who, bool on)',
  'function isSteward(address) view returns (bool)',
  'function isFinaliser(address) view returns (bool)',
  'function finaliseClaim(uint256 causeId, uint8 claimType, uint8 outcome, bytes32 resultRoot)',
  'function suspend(uint256 causeId, string reason)',
  'function reinstate(uint256 causeId)',
  'function claimOutcome(uint256, uint8) view returns (uint8)',
  'function causeCount() view returns (uint256)',
]);

export const erc20Abi = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
]);

export const transferEvent = erc20Abi[0];

export const STATUS_NAMES = ['none', 'listed', 'verified', 'suspended', 'closed'] as const;
