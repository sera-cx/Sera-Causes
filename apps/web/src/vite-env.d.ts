/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_PRIVY_APP_ID?: string;
  /** Dev only, optional: a local test key for src/lib/devWallet.ts. Never a key holding funds. */
  readonly VITE_DEV_PRIVATE_KEY?: string;
  /** Chain id for the EIP-712 domain. Defaults to Sepolia, like the API. */
  readonly VITE_CHAIN_ID?: string;
  /** CauseRegistry address for the EIP-712 domain. Defaults to the zero address, like the API. */
  readonly VITE_REGISTRY_ADDRESS?: string;
}
