/**
 * EIP-712 checks shared by every signed write (ARCHITECTURE.md section 4).
 */
import { verifyTypedData, type Address, type Hex } from 'viem';
import { SIGNED_AT_TOLERANCE_SECONDS, typedData, type CausesMessages, type CausesPrimaryType } from '@sera-causes/shared';
import { config } from '../config.js';
import { badRequest, forbidden, unauthorized } from './errors.js';

export function domainParts(): { chainId: number; registry: Address } {
  const c = config();
  return { chainId: c.CHAIN_ID, registry: c.REGISTRY_ADDRESS };
}

/** Rejects messages whose signedAt is more than the tolerance away from server time. */
export function checkSignedAt(signedAt: bigint | number, now: number = Date.now()): void {
  const s = Number(signedAt);
  const drift = Math.abs(Math.floor(now / 1000) - s);
  if (drift > SIGNED_AT_TOLERANCE_SECONDS) throw badRequest(`signedAt is ${drift}s from server time (limit ${SIGNED_AT_TOLERANCE_SECONDS}s)`);
}

/** The payload wallet must be the authenticated wallet. */
export function assertSameWallet(authed: string | undefined, claimed: string): string {
  if (!authed) throw unauthorized();
  if (authed.toLowerCase() !== claimed.toLowerCase()) throw forbidden('payload wallet does not match the signed-in wallet');
  return authed.toLowerCase();
}

export async function verifySignedMessage<K extends CausesPrimaryType>(
  kind: K,
  wallet: string,
  message: CausesMessages[K],
  signature: Hex,
): Promise<void> {
  const { chainId, registry } = domainParts();
  const td = typedData(kind, chainId, registry, message);
  let ok = false;
  try {
    ok = await verifyTypedData({
      address: wallet as Address,
      domain: td.domain,
      types: td.types,
      primaryType: td.primaryType,
      message: td.message as unknown as Record<string, unknown>,
      signature,
    } as unknown as Parameters<typeof verifyTypedData>[0]);
  } catch {
    ok = false;
  }
  if (!ok) throw unauthorized('signature does not match the wallet');
}
