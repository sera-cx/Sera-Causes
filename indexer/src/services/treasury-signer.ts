/**
 * Signing for the cause wallet on behalf of the owner (Privy delegated actions).
 *
 * TODO(privy): wire `@privy-io/server-auth` once the causes.sera.cx Privy app id
 * and secret exist. The live signer should load the wallet by `privyWalletId`,
 * check the delegation is still granted, and sign the Intent (and Permit) typed
 * data returned by `settlement.buildSigningRequest`. Until then the stub refuses
 * to sign and the treasury worker leaves auto conversions quoted for the
 * dashboard to finish by hand.
 */
import type { Hex } from 'viem';
import type { SigningRequest } from '@sera-causes/sera-settlement';

export interface TreasurySignature {
  signature: Hex;
  permitSignature?: Hex;
  permitDeadline?: number;
}

export interface TreasurySigner {
  readonly mode: 'stub' | 'privy';
  /** True when this signer can act for the wallet (delegation granted and usable). */
  canSign(wallet: { address: string; privyWalletId: string | null; delegated: boolean }): Promise<boolean>;
  /** Signs the swap Intent and optional Permit with the cause wallet. */
  sign(wallet: { address: string; privyWalletId: string | null }, request: SigningRequest): Promise<TreasurySignature>;
}

export class TreasurySignerUnavailable extends Error {
  constructor(message = 'delegated signing is not configured') {
    super(message);
    this.name = 'TreasurySignerUnavailable';
  }
}

export function createStubTreasurySigner(): TreasurySigner {
  return {
    mode: 'stub',
    async canSign() {
      return false;
    },
    async sign() {
      throw new TreasurySignerUnavailable();
    },
  };
}

let signer: TreasurySigner | undefined;

export function getTreasurySigner(): TreasurySigner {
  if (!signer) signer = createStubTreasurySigner();
  return signer;
}

export function setTreasurySignerForTests(s: TreasurySigner | undefined): void {
  signer = s;
}
