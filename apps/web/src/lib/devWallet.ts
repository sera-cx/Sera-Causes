/**
 * DEV ONLY. The demo wallet the mock sign-in uses, and the key it signs with.
 *
 * This is Ganache's deterministic account 5 ("myth like bonus scare over
 * problem client lizard pioneer submit female collect"), the same `giver`
 * account the indexer seed uses (indexer/src/seed/seed.ts, `DEMO.giver`), so
 * the demo wallet owns cause 1 and cause 14 and has a few gifts on the seeded
 * database. The key is public knowledge and holds nothing; never reuse it.
 *
 * Signatures made with it verify against `X-Dev-Wallet` on the API in dev.
 * In production a Privy adapter replaces this file entirely.
 */
import { privateKeyToAccount } from "viem/accounts";

export const DEV_PRIVATE_KEY = "0x395df67f0c2d2d9fe1ad08d1bc8b6627011959b79c53d7dd6a3536a33ab8a4fd" as const;

export const devAccount = privateKeyToAccount(DEV_PRIVATE_KEY);

/** 0x95ced938f7991cd0dfcb48f0a06a40fa1af46ebc, lowercase like every address the API stores. */
export const DEMO_WALLET: `0x${string}` = devAccount.address.toLowerCase() as `0x${string}`;
