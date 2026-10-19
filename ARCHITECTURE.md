# Sera Causes architecture (v1)

> Revised 19 October 2026 after the decisions in docs/PLAN.md: no highlight
> rounds or boosts, creator-controlled homepage, sharing tools, a creator
> dashboard, and (section 6 of PLAN.md) no escrow, no refunds, per-cause
> deposit wallets with gifts detected from on-chain transfers. Where this file and PLAN.md disagree, PLAN.md wins until this
> file is updated.

This is the shared contract between every package in the monorepo. Change it
here first, then in code. Product rules come from
[docs/PRODUCT-BRIEF.md](docs/PRODUCT-BRIEF.md); section numbers below refer to it.

## 1. Packages

| Path | Package | Role |
| --- | --- | --- |
| `contracts/` | `@sera-causes/contracts` | `CauseRegistry.sol` v1.1, solc-js compile, node:test on an in-process chain. Exports ABI + address book. |
| `packages/shared/` | `@sera-causes/shared` | Types, constants, EIP-712 types, zod schemas, pure rule functions (gSera maths, vote weight, round score, tallies). The recompute script. No I/O. |
| `packages/sera-settlement/` | `@sera-causes/sera-settlement` | **Protected.** Sera.cx API adapter: config, currencies, quote, signing payloads, submit, settlement status, sanctions screen. Server-side only. |
| `packages/gsera-client/` | `@sera-causes/gsera-client` | HMAC-signed client for g.sera.cx credit, spend, spendable and multipliers. `mock` mode keeps a local balance. |
| `indexer/` | `@sera-causes/indexer` | Postgres (Prisma). Chain listener, signed-message store, read API, gift flow, CSD gSera ledger, finaliser CLI. |
| `apps/web/` | `@sera-causes/web` | causes.sera.cx. React 19, Vite 7, wouter, Tailwind v4, shadcn new-york, Privy, viem. Express SSR like sera.cx. |

Toolchain: pnpm 10, Node 22, TypeScript strict, ESM everywhere. Tests with
`node:test` or vitest. No Docker or Foundry on the dev machine; local Postgres 16
is installed.

## 2. CauseRegistry v1.1

Keep from v0.1: `listCause`, `updateCause`, `setPayout` (drops Verified;
`payout` is now the cause's deposit address), `transferCauseOwnership`,
`closeCause`, `attest`, `postProgress`, `postNeed`, `pledge`, `closeNeed`.

**Removed (PLAN.md section 6):** `donate`, `claim`, `refund`, `refundable`,
`held`, `givenBy`, `totalGiven`, `acceptedToken`, `setToken`, `TokenSet`,
`Donated`, `Claimed`, `Refunded`, `REFUND_WINDOW`, `waitingSince`, the
transfer helpers and the reentrancy lock. The contract holds no funds.

Changes:

```solidity
enum ClaimType { C1_Registered, C2_Current, C3_Payout, C4_WorkReal, C5_TaxExempt, C6_CareLicence, C7_Accounts }
enum ClaimOutcome { Open, Verified, NotVerified, NeedsMore }

// roles, council managed
mapping(address => bool) public isFinaliser;   // submits recomputable results
mapping(address => bool) public isSteward;     // pause, reinstate, close (phases 0 and 1)

// per cause
mapping(uint256 => mapping(ClaimType => ClaimOutcome)) public claimOutcome;
mapping(uint256 => bool) public requiresCareLicence;   // set at listing, steward can toggle

function listCause(string uri, address payout, bytes32 category, bytes32 frontend, bool needsCareLicence) returns (uint256);
function finaliseClaim(uint256 causeId, ClaimType claim, ClaimOutcome outcome, bytes32 resultRoot) onlyFinaliser;
function suspend(uint256 causeId, string reason) onlySteward;
function reinstate(uint256 causeId) onlySteward;           // Suspended -> Listed, then re-evaluates Verified
function closeBySteward(uint256 causeId, string reason) onlySteward;
function setRequiresCareLicence(uint256 causeId, bool on) onlySteward;
function setFinaliser(address, bool) onlyCouncil;  function setSteward(address, bool) onlyCouncil;
function isRequired(uint256 causeId, ClaimType c) view returns (bool);   // C1..C4, plus C6 when flagged
function requiredClaimsMet(uint256 causeId) view returns (bool);
function verifiedRequiredCount(uint256 causeId) view returns (uint8 done, uint8 total);

event ClaimFinalised(uint256 indexed causeId, ClaimType indexed claim, ClaimOutcome outcome, bytes32 resultRoot, address by);
event RequiresCareLicenceSet(uint256 indexed causeId, bool on);
event FinaliserSet(address indexed who, bool on);  event StewardSet(address indexed who, bool on);
```

Rules enforced on-chain:

- `finaliseClaim` on a Listed cause: when every required claim is `Verified`,
  status becomes `Verified`, `verifiedAt` set, `StatusChanged` emitted with
  note `"all required claims verified"`.
- `finaliseClaim` setting a required claim to `NotVerified` while the cause is
  `Verified`: status becomes `Suspended`, note
  `"required claim overturned"`.
- `setPayout` resets `claimOutcome[causeId][C3_Payout]` to `Open` and drops
  Verified (existing behaviour).
- `reinstate` moves Suspended to Listed, then if `requiredClaimsMet` the cause
  goes straight back to Verified.
- Remove `verify` and the verifier role entirely.

Tests: port the 10 v0.1 tests to the new API and add: per-claim finalisation
flips status automatically; overturning a required claim suspends; payout
change reopens C3; reinstate re-verifies when claims still
hold; only finaliser/steward/council can call their functions;
C6 required only when flagged.

Deploy script: `scripts/deploy.mjs` (ethers, env `RPC_URL`,
`DEPLOYER_KEY`, `COUNCIL`) writes `contracts/deployments/<chainId>.json`
`{ address, block, council }`. `scripts/demo-chain.mjs` keeps the v0.1
behaviour: local chain, seed 44 causes, write a snapshot.

## 3. Shared constants and rules (`packages/shared`)

```ts
export const CLAIMS = ['C1','C2','C3','C4','C5','C6','C7'] as const;        // index = ClaimType
export const REQUIRED_CLAIMS = ['C1','C2','C3','C4'];                        // + C6 when flagged
export const VOTING = { minPaths: 2, periodDays: 5, minHours: 48, quorumWeight: 7, thresholdPct: 75, challengeWindowHours: 72 };
export const CHALLENGE_STAKE = 5000;
export const GSERA = { perUsd: 100, compoundCap: 10, heat: { urgent: 2.5, normal: 1 },
  helper: { listingVerified: 2500, pathAgrees: 1000, voteAgrees: 100, helpFulfilled: 500, challengeWin: 2000 },
  giftCapUsdPerWalletPerCausePer30d: 1000, vestDays: 90 };

export function giftGsera(usd, { heat, volumeTier, streak }): number;        // usd*100*min(10, heat*volume*streak), floor
export function voteWeight(reputation: number): number;                       // 1 + min(4, log2(1 + rep))
export function tallyClaim(votes: Vote[], reputations): { verified, not, more, quorumMet, passed };
export function feedOrder(causes, events): Cause[];                           // homepage feed by recent activity
export function merkleRoot(leaves: Hex[]): Hex;                               // keccak256, sorted pairs
```

`scripts/recompute.ts`: given a published inputs JSON (votes with
reputations), prints the tally and Merkle root so anyone can check an on-chain
`resultRoot`.

## 4. EIP-712 signed messages

Domain: `{ name: "Sera Causes", version: "1", chainId, verifyingContract: <registry> }`.

```
Path(uint256 causeId,uint8 claimType,uint32 epoch,bytes32 contentHash,uint8 result,uint64 checkedAt)
Vote(uint256 causeId,uint8 claimType,uint32 epoch,uint8 choice,bytes32 reasonHash,uint64 signedAt)
HomepageToggle(uint256 causeId,bool shown,uint64 signedAt)
Challenge(uint256 causeId,uint8 claimType,uint32 epoch,uint256 stake,bytes32 contentHash,uint64 signedAt)
HelpConfirm(uint256 needId,address helper,uint64 signedAt)
```

- `epoch` starts at 0 per (cause, claim) and increments whenever voting
  reopens (NeedsMore outcome, successful challenge, payout change for C3).
- `contentHash` = keccak256 of the canonical JSON body (sorted keys, no
  whitespace). The API stores the full body and the signature; the hash is
  what gets Merkle-committed.
- `result`: 1 verified, 2 not_verified, 3 could_not_check. `choice`: 1
  verified, 2 not, 3 needs_more.
- The API verifies every signature with viem `verifyTypedData` against the
  wallet in the request, rejects duplicates by (type, wallet, causeId,
  claimType, epoch), and rejects messages whose
  `signedAt` is more than 10 minutes off server time.

## 5. Database (`indexer/prisma/schema.prisma`)

Postgres. Addresses lowercase. Amounts as `Decimal` or string of raw units.

- `IndexerCursor { id, chainId, lastBlock }`
- `Cause { id (chain id), chainId, slug, owner, payout, category, uri, status, listedAt, verifiedAt, requiresCareLicence, listedVia, profile Json, photoUrl, givenUsd Decimal, giversCount, createdAt, updatedAt }`
- `ClaimState { causeId, claimType, outcome, epoch, state (open|voting|challenge_window|final), votingStart, votingEnd, challengeWindowEnd, resultRoot, finalisedAt, @@id([causeId, claimType]) }`
- `Evidence { id, causeId, claimType, uploader, kind, fileUrl, fileHash, title, note, redactionConfirmed, createdAt, removedAt, removedReason }`
- `Path { id, causeId, claimType, epoch, author, body Json, contentHash, result, checkedAt, signature, createdAt, outcomeAgreed Boolean? }`
- `Vote { id, causeId, claimType, epoch, voter, choice, reason, weight, signature, signedAt, @@unique([causeId, claimType, epoch, voter]) }`
- `Challenge { id, causeId, claimType, epoch, challenger, stake, contentHash, body Json, signature, state (open|upheld|rejected), resolvedAt }`
- `HomepageFlag { causeId, shown, setBy, signature, updatedAt, stewardHiddenReason? }`
- `UrgentAppeal { id, causeId, reason, setBy, startsAt, endsAt }`
- `ShareEvent { id, causeId, channel, at }` (counts only, no personal data)
- `Gift { id, causeId, sender, token, amount, usd Decimal, source (site|direct|sera_swap), txHash, logIndex, tradeId?, kytState, createdAt, @@unique([txHash, logIndex]) }` detected from ERC-20 `Transfer` logs to cause deposit addresses
- `CauseWallet { causeId, address, privyWalletId, delegated Boolean, treasuryMode (auto|manual), targetToken?, updatedAt }`
- `Conversion { id, causeId, fromToken, toToken, amountIn, amountOut, tradeId, state, txHash?, triggeredBy (auto|owner), createdAt }`
- `Withdrawal { id, causeId, token, amount, to, txHash, createdAt }`
- `Media { id, causeId, kind (photo|video), url, embedUrl?, provider?, caption, credit, position, createdAt }`
- `LedgerEntry { id, wallet, amount, reason (gift|path|vote|help|listing|challenge_win|challenge_stake), sourceTag (charity), sourceRef, multipliers Json, state (credited|cancelled|spent|burned), gseraRef (remote id), createdAt }`
- `Reputation { wallet, score, @@id([wallet]) }` plus `ReputationEntry { id, wallet, delta, reason, sourceRef, createdAt }`
- `Wallet { address, kytState (unknown|clear|flagged), kytCheckedAt, privyUserId?, leaderboardOptOut }`
- `Need`, `Pledge`, `Progress`, `Attestation`, `RecordEvent { id, causeId, type, block, txHash, at, data Json }` mirrored from chain (shapes from the v0.1 indexer).

## 6. API (`indexer/src/api`, Express, prefix `/api/v1`)

Auth: `Authorization: Bearer <Privy JWT>` verified server-side; the resolved
wallet must match the signer of any EIP-712 payload. Public reads need no
auth. Dev bypass `X-Dev-Wallet` only when `NODE_ENV !== 'production'`.

Reads:
`GET /stats`, `GET /causes?cat&state&status&q&sort`, `GET /causes/:id`,
`GET /causes/:id/record`, `GET /claims?tab=needs_evidence|needs_checking|open_for_votes|challenged|recently_verified`,
`GET /claims/:causeId/:claimType`, `GET /home` (urgent appeal, feed, new),
`GET /me` (auth), `GET /leaderboards?board=givers|helpers|causes&period`,
`GET /profiles/:hash.json` (cause metadata the site hosts until IPFS pinning),
`GET /og/cause/:id.png` (Open Graph image), `GET /causes/:id/poster.pdf`, `GET /embed/give/:id` (iframe HTML).

Writes (auth + signature where noted):
`POST /causes/prepare` (metadata JSON → stores it, returns `{ uri, duplicates[] }`; the browser then calls `listCause`),
`POST /evidence` (multipart, 10 MB, pdf/png/jpg/webp/mp4 or a link),
`POST /paths` (Path), `POST /votes` (Vote), `POST /causes/:id/homepage` (HomepageToggle by the owner), `POST /stewards/urgent-appeal` and `POST /stewards/hide` (steward wallet, public reason),
`POST /challenges` (Challenge, stake via spend), `POST /needs/:id/confirm` (HelpConfirm by cause owner),
`POST /gifts/quote` `{ causeId, fromToken, amountRaw }` → same currency: a transfer plan `{ to: causeAddress, token, amountRaw }` the browser sends itself; different currency: a Sera.cx quote with `recipient = causeAddress` and signing payloads,
`POST /gifts/submit` `{ quoteId, signature, permitSignature?, permitDeadline? }` → `{ tradeId }` (Sera path only),
`GET /gifts/:id`, `GET /causes/:id/address` (deposit address and QR payload),
`POST /causes/:id/treasury` (owner: auto or manual, target token), `POST /causes/:id/convert` (owner: manual conversion via Sera.cx), `POST /causes/:id/withdraw`, `POST /causes/:id/media`, `DELETE /media/:id`.

Workers (`indexer/src/workers`): `chain-listener` (viem `getLogs` from cursor, every 15 s: registry events into mirrored tables and `RecordEvent`, plus ERC-20 `Transfer` logs for the listed stablecoins filtered by `to` in the set of cause deposit addresses, valued in USD via Sera `/fx/rate` or 1:1 for USD stables, KYT-screened, and credited to gSera at once through `LedgerEntry` with the brief's multipliers), `treasury` (for causes in auto mode with delegated signing: quote and execute a Sera.cx conversion of newly arrived balances into the target token), `settlement-poll` (pending Sera trades), `snapshot` (every 5 min, writes `public/snapshot.json`).

Finaliser CLI (`indexer/src/finaliser`): `tally-claim <causeId> <claim>`,
`finalise-claim …` (publishes inputs JSON, computes root, sends
`finaliseClaim`), Stewards run these until the finaliser is automated.

## 7. gSera integration

- gSera today has no pending state, no source tags and no burn endpoint.
  CSD keeps its own ledger (`LedgerEntry`) and only pushes **vested** credits
  and **spends** (challenge stakes) to g.sera.cx.
- Two endpoints to add in the gSera repo, both guarded by
  `requireHmac(CAUSES_HMAC_KEY)` in the same style as the promo and referral
  partner routes: `POST /v1/causes/credit { wallet, amount_gsera, grant_type, reference_id, reason }`
  and `POST /v1/causes/spend { wallet, amount_gsera, reason, reference_id }`,
  plus `GET /v1/causes/wallet/:address` returning `{ spendable, multipliers }`.
  `grant_type` values: `causes_gift`, `causes_path`, `causes_vote`,
  `causes_help`, `causes_listing`, `causes_challenge`. Charity-tag exclusion
  from Lucky Draw is a gSera-side change tracked in `docs/GSERA-INTEGRATION.md`.
- `gsera-client` signs `X-Sera-Signature: sha256=<hmac of raw body>` and
  exposes `credit`, `spend`, `getWallet`, `reverseCredit`. `GSERA_MODE=mock`
  stores balances in Postgres so the full flow works locally.
- With no refunds there is no vesting: gift gSera is credited on arrival once
  KYT is clear. `reverseCredit` is for steward clawbacks only.

## 8. Settlement adapter (`packages/sera-settlement`)

Functions and Sera.cx calls:

| Function | Calls |
| --- | --- |
| `getDeployment()` | `GET /config`, `GET /health` (cache 1 h) |
| `listCurrencies()` | `GET /tokens`, `GET /markets` (cache 10 min) |
| `quoteGift({ fromToken, toToken, fromAmountRaw, giver, recipient, ttlSeconds })` | `GET /system/time`, `POST /swap/quote` |
| `buildSigningRequest(quote)` | pure: `Intent` and optional `Permit` typed data |
| `submitGift({ uuid, signature, permitSignature?, permitDeadline? })` | `POST /swap` |
| `getSettlement(tradeId)` | `GET /orders/{trade_id}` with strict validation |
| `screenAddress(address, checkType)` | Chainalysis public sanctions API, env-gated |

Base URLs: mainnet `https://api.sera.cx/api/v1`, sepolia
`https://api-testnet.sera.cx/api/v1` (verify against sera-pay's
`api.testnet.sera.cx` before go-live). Auth `Bearer <key>:<secret>`. Keys stay
on the server. No webhooks: poll.

## 9. Web app

- Routes: see docs/PLAN.md section 2.5.
- Nav: Causes · Verify · Add a cause · Technology. Signed in: Dashboard. Right: gSera chip, Sign in.
- Design: copy `index.css` tokens, fonts (IBM Plex Sans/Mono, Instrument Serif), `components.json`, `cn()`, Nav/Footer/SectionHeader patterns from sera.cx. Warm paper backgrounds, Sera green fills with ink text, `#007A3D` for green text, giving accent `#C2410C` on Give buttons and thank-you only. Status is always icon + word + colour. WCAG 2.2 AA, dark mode via system, 360 px wide with no sideways scroll.
- Copy: "Sera.cx" not "Sera", British spelling, no em dashes, short sentences. Every tunable number comes from `@sera-causes/shared` and is shown only on `/rules`.
- Wallet: Sera's existing Privy app (`@privy-io/react-auth`) for sign-in; each cause gets its own embedded wallet under the owner's Privy user (its deposit address) with delegated signing requested for auto-convert; viem wallet client for stablecoin transfers, `listCause`, `postProgress`, `postNeed`, `pledge`; `signTypedData` for paths, votes, challenges, the homepage toggle and Sera.cx intents. The site renders read-only when `VITE_PRIVY_APP_ID` is unset.
- Data: fetch from `VITE_API_URL`; SSR pre-fetches the home and cause pages for SEO like sera.cx's `server/ssr.ts`.

## 10. Scope and deferrals

See docs/PLAN.md sections 3 and 4. Deferred: IPFS pinning (profiles and
evidence served from the API with hashes recorded until mainnet), KYT beyond
the Chainalysis sanctions screen, ZK finaliser.
