/**
 * Production stand-in for ./devWallet. `vite.config.ts` aliases every import of
 * `./devWallet` to this file in a production build, so no signing material can
 * reach dist/ even if some future import escapes the `import.meta.env.DEV`
 * branch in ./auth: not the public test mnemonic, and not a
 * VITE_DEV_PRIVATE_KEY that happened to be set when the build ran. Touching
 * any of it throws.
 */
const message = "the development signer is not available in a production build; sign in with Privy instead";

export const devAccount: never = (() => {
  throw new Error(message);
})();

export const DEMO_WALLET: `0x${string}` = (() => {
  throw new Error(message);
})();
