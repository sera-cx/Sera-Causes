/**
 * DEV ONLY. The demo wallet the mock sign-in uses, and the account it signs
 * with. No private key is committed in this repository.
 *
 * The API verifies every signed write with real signature recovery, so a
 * placeholder signature is rejected. Exercising verification paths, votes,
 * the homepage toggle and challenges without Privy credentials therefore
 * needs a real signer. This module provides one, and only in a dev build.
 *
 * Where the account comes from, in order:
 *   1. `VITE_DEV_PRIVATE_KEY`, if you set one in apps/web/.env.local. Never
 *      point this at a key that holds anything.
 *   2. otherwise it is derived from the public Ganache default mnemonic at
 *      account index 5. That mnemonic is published in Ganache's own
 *      documentation, so the account is known to everyone and holds nothing
 *      on any network. It matches the `giver` the indexer seed uses
 *      (indexer/src/seed/seed.ts, `DEMO.giver`), so the demo wallet owns
 *      cause 1 and cause 14 and has a few gifts on the seeded database.
 *
 * Signatures made with it verify against `X-Dev-Wallet` on the API in dev.
 * It is never used when `VITE_PRIVY_APP_ID` is set: the Privy adapter in
 * ./privy replaces this file entirely.
 *
 * This module must never reach a production bundle, and three things keep it
 * out:
 *   1. nothing imports it statically. The only reference is the
 *      `await import("./devWallet")` in ./auth, inside an
 *      `if (import.meta.env.DEV)` branch that Vite folds to `if (false)` and
 *      drops, along with this chunk, from a production build.
 *   2. `vite.config.ts` additionally aliases this path to ./devWallet.prod in
 *      a production build, so even a stray import cannot pull it in.
 *   3. the guard below throws the moment the module is evaluated anywhere but
 *      a dev build, so a leak fails loudly instead of shipping a signer.
 * src/test/devWallet.test.ts asserts no signing material reaches dist/.
 */
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";

if (!import.meta.env.DEV) {
  throw new Error("devWallet is a development-only module and must not be loaded outside a dev build");
}

/**
 * Ganache's published default mnemonic. Public knowledge, worth nothing, and
 * here only so the demo address matches the seeded database.
 */
const PUBLIC_TEST_MNEMONIC =
  "myth like bonus scare over problem client lizard pioneer submit female collect";

const override = import.meta.env.VITE_DEV_PRIVATE_KEY as string | undefined;

export const devAccount = override
  ? privateKeyToAccount(override as `0x${string}`)
  : mnemonicToAccount(PUBLIC_TEST_MNEMONIC, { addressIndex: 5 });

/** 0x95ced938f7991cd0dfcb48f0a06a40fa1af46ebc, lowercase like every address the API stores. */
export const DEMO_WALLET: `0x${string}` = devAccount.address.toLowerCase() as `0x${string}`;
