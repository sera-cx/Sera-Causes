import { createPublicClient, createWalletClient, defineChain, http, type Address, type PublicClient, type WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { config } from '../config.js';
import { registryAbi } from './abi.js';

export function chainFor(id: number) {
  return defineChain({
    id,
    name: id === 1 ? 'Ethereum' : id === 11155111 ? 'Sepolia' : `chain-${id}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [config().RPC_URL ?? 'http://127.0.0.1:8545'] } },
  });
}

let pub: PublicClient | undefined;

export function getPublicClient(): PublicClient {
  if (pub) return pub;
  const c = config();
  if (!c.RPC_URL) throw new Error('RPC_URL is not set');
  pub = createPublicClient({ chain: chainFor(c.CHAIN_ID), transport: http(c.RPC_URL) });
  return pub;
}

export function setPublicClientForTests(p: PublicClient | undefined): void {
  pub = p;
}

export function getFinaliserWallet(): WalletClient {
  const c = config();
  if (!c.FINALISER_PRIVATE_KEY) throw new Error('FINALISER_PRIVATE_KEY is not set');
  if (!c.RPC_URL) throw new Error('RPC_URL is not set');
  const account = privateKeyToAccount(c.FINALISER_PRIVATE_KEY as `0x${string}`);
  return createWalletClient({ account, chain: chainFor(c.CHAIN_ID), transport: http(c.RPC_URL) });
}

const stewardCache = new Map<string, { value: boolean; at: number }>();

/**
 * Steward check: on-chain `isSteward` cached for STEWARD_CACHE_SECONDS when a
 * registry is configured; otherwise the STEWARD_WALLETS list (never in production).
 */
export async function isSteward(address: string): Promise<boolean> {
  const c = config();
  const a = address.toLowerCase() as Address;
  if (!c.isProduction && c.STEWARD_WALLETS.includes(a)) return true;
  if (!c.hasChain) return false;
  const hit = stewardCache.get(a);
  const ttl = c.STEWARD_CACHE_SECONDS * 1000;
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  try {
    const value = await getPublicClient().readContract({ address: c.REGISTRY_ADDRESS, abi: registryAbi, functionName: 'isSteward', args: [a] });
    stewardCache.set(a, { value, at: Date.now() });
    return value;
  } catch {
    // Fall back to the mirrored role table when the RPC is down.
    const { db } = await import('../db.js');
    const row = await db().chainRole.findUnique({ where: { address_role: { address: a, role: 'steward' } } });
    return !!row?.on;
  }
}

export function clearStewardCache(): void {
  stewardCache.clear();
}
