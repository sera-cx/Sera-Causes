# @sera-causes/indexer

The Postgres-backed service behind causes.sera.cx: chain listener, signed-message
store, read and write API, give flow, CSD gSera ledger, Care XP queue,
finaliser CLI and the public snapshot. Rules come from `@sera-causes/shared`;
money moves through `@sera-causes/sera-settlement`; gift points go to g.sera.cx
through `@sera-causes/gsera-client`; helper XP goes to community.sera.cx
through `src/community/client.ts`.

The money model is the one in [docs/PLAN.md section 6](../docs/PLAN.md): no
escrow, no refunds. Each cause has a deposit address (`Cause.payout`, or the
embedded wallet in `CauseWallet`). Gifts are ERC-20 `Transfer` logs of the
listed stablecoins to those addresses, valued in USD, KYT-screened and credited
to gSera on arrival.

## Run locally, end to end

Needs Node 22, pnpm 10 and a local Postgres 16 with a database `sera_causes`.
No chain is required for local development: the seed puts the 44 researched
causes into Postgres in the same state the contracts demo chain produces.

```sh
pnpm install                                   # repo root

cd indexer
cp ../.env.example .env                        # then edit; at minimum:
#   DATABASE_URL=postgresql://<your os user>@localhost:5432/sera_causes
#   (Prisma needs a user in the URL even when psql does not)

pnpm db:generate                               # Prisma client
pnpm db:migrate                                # applies prisma/migrations (creates the schema)
pnpm db:seed                                   # 44 causes, attestations, 89 help requests, 2 Verified
pnpm db:seed --reset --with-gifts              # same, wiping first, plus a dozen demo gifts

pnpm dev                                       # API on http://localhost:3001 (or `pnpm dev:api` at the root)
pnpm worker                                    # listener, treasury, settlement poll, snapshot, email, hourly settlement
pnpm check && pnpm test && pnpm build          # tsc, vitest (uses a sera_causes_test schema), dist/
```

Try it:

```sh
curl localhost:3001/api/v1/stats
curl localhost:3001/api/v1/home | jq '.feed[0], .new | length'
curl localhost:3001/api/v1/causes/14 | jq '{slug, stage, checksDone, badges}'
curl -o og.png localhost:3001/api/v1/og/cause/14.png
curl -o poster.pdf localhost:3001/api/v1/causes/14/poster.pdf
curl -H 'X-Dev-Wallet: 0xe11ba2b4d45eaed5996cd0823791e0c93114882d' localhost:3001/api/v1/dashboard | jq '.totals'
```

### Finaliser CLI (stewards, advisory mode)

Every command prints what it will do and only acts with `--yes`.

```sh
pnpm finaliser tally 14 C1                                   # tally of stored votes with weights, Merkle root
pnpm finaliser finalise 14 C1 verified --dry-run             # writes public/results/14-C1-0.json, sends nothing
pnpm finaliser finalise 14 C1 verified --yes                 # publish inputs, finaliseClaim on-chain, open the 72 h window
pnpm finaliser resolve-challenge <challengeId> upheld --yes  # or rejected
pnpm finaliser urgent-appeal 41 "Flood relief, east coast" --ends 2026-11-01T00:00:00Z --yes
pnpm finaliser urgent-appeal clear --yes
pnpm finaliser hide 7 "Duplicate of cause 3" --yes          # or `unhide 7`
```

`finalise` needs `RPC_URL`, `REGISTRY_ADDRESS` and `FINALISER_PRIVATE_KEY`
to send the transaction; without them it records the outcome locally and
says so (useful on the seeded database).

### Against a real chain

Set `RPC_URL`, `REGISTRY_ADDRESS`, `REGISTRY_FROM_BLOCK` and `CHAIN_ID`. The
listener folds every registry event from the cursor and scans `Transfer`
logs of the listed stablecoins to cause deposit addresses. Do not seed a
database that also follows a chain: the seed writes the same cause ids the
registry would.

## Environment

Names follow the root `.env.example`. Extras added here are marked.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | required | Postgres URL. Needs a user, e.g. `postgresql://douglas@localhost:5432/sera_causes` |
| `NODE_ENV` | `development` | `production` rejects the `X-Dev-Wallet` bypass outright and disables `STEWARD_WALLETS` |
| `LOG_LEVEL` | `info` | pino level |
| `CHAIN_ID` | `11155111` | Chain for EIP-712 domains and the listener |
| `RPC_URL` | unset | viem transport. Unset means the listener idles and steward checks use the role mirror |
| `REGISTRY_ADDRESS` | zero | `CauseRegistry` address (part of the EIP-712 domain) |
| `REGISTRY_FROM_BLOCK` | `0` | First block to scan |
| `FRONTEND_TAG` | `causes.sera.cx` | Our `frontend` tag |
| `LISTENER_CHUNK` *(extra)* | `5000` | Blocks per `getLogs` call |
| `LISTENER_INTERVAL_MS` *(extra)* | `15000` | Listener cadence |
| `STABLECOINS` *(extra)* | unset | Override of the listed stablecoins: `USDT:0x..:6:USD,XSGD:0x..:6:SGD`. Otherwise settlement `listCurrencies`, then the static Sepolia fallback in `src/chain/stablecoins.ts` |
| `FINALISER_PRIVATE_KEY` | unset | Sends `finaliseClaim` from the CLI |
| `API_PORT` | `3001` | |
| `PUBLIC_API_URL` | `http://localhost:3001` | Absolute URLs for photos, uploads, OG, poster, embed |
| `PUBLIC_WEB_URL` *(extra)* | `http://localhost:3000` | Share links `/c/<id>-<slug>`, give page, Twitch embed parent |
| `UPLOAD_DIR` | `./uploads` | Evidence and photo uploads, served at `/uploads/<sha256>` |
| `PUBLIC_DIR` *(extra)* | `./public` | `snapshot.json` and `results/*.json`, served at `/` |
| `SEED_DIR` *(extra)* | `../seed` | Where `seed/causes/*.json` uris and `/photos/*` resolve |
| `PRIVY_APP_ID` | unset | Sera.cx's existing Privy app (the one g.sera.cx and sera-pay use). Verifies `Authorization: Bearer <Privy access token>` against that app's JWKS. Unset in production means nobody can sign in and every write route answers 503. `causes.sera.cx` must be added to the app's allowed origins |
| `PRIVY_APP_SECRET` | unset | Same Privy app's secret. Resolves which Ethereum wallets an account owns, through the Privy user API (cached 5 minutes), which is what binds an EIP-712 signature to the signed-in account. Unset means write routes answer 503 |
| `STEWARD_WALLETS` *(extra)* | unset | Comma list of steward wallets, dev only. On-chain `isSteward` (60 s cache) is used when a registry is configured |
| `STEWARD_CACHE_SECONDS` *(extra)* | `60` | |
| `SETTLEMENT_MODE` *(extra)* | `mock`, or `live` when `SERA_API_KEY` is set | `createMockSettlement` vs `createSettlement` |
| `SERA_NETWORK`, `SERA_API_KEY`, `SERA_API_SECRET` | `sepolia` | Sera.cx settlement |
| `GSERA_MODE`, `GSERA_BASE_URL`, `GSERA_HMAC_KEY` | `mock` | Mock balances live in Postgres (`MockGseraWallet`) |
| `COMMUNITY_MODE` | `queue` | `queue` records every Care XP event in `XpEvent` and holds it. `live` is reserved for `POST /api/partner/xp` on community.sera.cx, which is not agreed yet |
| `COMMUNITY_BASE_URL` | `https://community.sera.cx` | Where the partner route will live |
| `COMMUNITY_HMAC_KEY` | unset | `X-Sera-Signature` HMAC key for that route |
| `KYT_MODE`, `KYT_BASE_URL`, `KYT_API_KEY`, `KYT_FAIL_CLOSED` | `stub` | kyt.sera.cx screen on senders, voters and challengers |
| `RESEND_API_KEY`, `EMAIL_FROM` | unset | Email outbox; without a key emails are logged and marked `logged` |
| `VERIFICATION_MODE` | `advisory` | `advisory`: stewards finalise with the CLI. `community`: votes decide (automatic finalisation is not wired yet, see below) |
| `TREASURY_INTERVAL_MS` *(extra)* | `60000` | Treasury worker cadence |

## Routes (`/api/v1`)

Auth: `Authorization: Bearer <Privy access token>` (plus optional `X-Wallet` to
pick one of the user's linked wallets), or `X-Dev-Wallet: 0x…` when
`NODE_ENV !== 'production'`.

The order is deliberate, and it is the one sera-pay settled on. The token is
verified against the Privy JWKS for `PRIVY_APP_ID`; then the account's linked
Ethereum wallets are read from the Privy user API with `PRIVY_APP_SECRET` and
`X-Wallet` is rejected with 403 unless Privy confirms the account owns it; only
then do signed routes verify the EIP-712 payload with viem `verifyTypedData`
against that wallet, reject duplicates, and reject `signedAt` outside
`SIGNED_AT_TOLERANCE_SECONDS`. A signature proves who holds a key, not who is
signed in, so it is never the first gate.

With `NODE_ENV=production` and no `PRIVY_APP_ID`, or with no
`PRIVY_APP_SECRET`, nobody can be authenticated: every write route answers
`503` with a plain message, reads keep working, and the API logs a warning at
startup.

| Method | Path | Auth | What |
| --- | --- | --- | --- |
| GET | `/stats` | | Numbers strip, verification mode, tunables |
| GET | `/causes?cat&state&status&q&sort&limit&offset` | | All causes with stage, checks, claims, homepage state |
| GET | `/causes/:id` | | Cause by id or slug: claims, help requests, updates, attestations, concerns, media, wallet, recent gifts, conversions, withdrawals |
| GET | `/causes/:id/record` | | Chronological public record: chain events, evidence, paths, votes, challenges, steward actions |
| GET | `/causes/:id/address` | | Deposit address, chain id, EIP-681 QR payloads per stablecoin |
| GET | `/claims?tab=needs_evidence\|needs_checking\|open_for_votes\|challenged\|recently_verified` | | Verification hub |
| GET | `/claims/:causeId/:claimType` | optional | Claim workspace: evidence, paths, votes, live tally, challenges, your eligibility |
| GET | `/home` | | Urgent appeal, feed (`feedOrder`), new rail, categories, stats, open help requests |
| GET | `/me` | auth | Wallet, gSera balance and multipliers, ledger, Care XP total and recent XP events, reputation, gifts, paths, votes, notifications, eligibility |
| GET | `/notifications` | auth | In-app notifications |
| GET | `/leaderboards?board=givers\|helpers\|causes&period=7d\|30d\|all` | | |
| GET | `/profiles/:hash.json` | | Cause metadata stored by `POST /causes/prepare` |
| GET | `/gifts/:id` | | A gift (by id) or a Sera.cx trade (by quote or trade id) |
| GET | `/og/cause/:id.png` | | 1200x630 Open Graph image (resvg) |
| GET | `/causes/:id/poster.pdf` | | A4 QR poster (pdfkit, qrcode) |
| GET | `/embed/give/:id` | | Iframe page with the Sera-branded Give button (`/embed.js` at the root is the script snippet) |
| GET | `/dashboard` | auth | Creator dashboard: your causes, gifts, balances by token, wallet, media, share tools |
| GET | `/dashboard/causes/:id` | auth, owner or lister | One cause in detail |
| POST | `/causes/prepare` | auth | Stores metadata JSON, returns `{ uri, hash, duplicates[] }`; the browser then calls `listCause` |
| POST | `/evidence` | auth, multipart | `file` (pdf/png/jpg/webp/mp4, 10 MB) or a `link`; sha256 recorded |
| POST | `/paths` | auth + Path signature | Opens voting at two independent paths |
| POST | `/votes` | auth + Vote signature | Needs KYT clear plus one credited gift or one signed verification path. A confirmed help request does not count |
| POST | `/causes/:id/homepage` | auth + HomepageToggle signature | Owner only; older or repeated toggles are rejected |
| POST | `/challenges` | auth + Challenge signature | Spends the 5,000 gSera stake, reopens voting |
| POST | `/needs/:id/confirm` | auth + HelpConfirm signature | Owner confirms a helper; awards the Helper badge, or Translator for a translation. No XP |
| POST | `/stewards/urgent-appeal` | steward | Pin one cause with a public reason (or `clear`) |
| POST | `/stewards/hide` | steward | Take a cause off the homepage with a public reason (or restore) |
| POST | `/gifts/quote` | optional | Same currency: transfer plan `{ to, token, amountRaw, eip681 }`. Different currency: Sera.cx quote with `recipient = causeAddress` and signing payloads |
| POST | `/gifts/submit` | auth | Submits a signed Sera.cx quote, returns `{ tradeId }` |
| POST | `/causes/:id/treasury` | owner | `treasuryMode` auto or manual, `targetToken`, plus wallet `address`, `privyWalletId`, `delegated` |
| POST | `/causes/:id/convert` | owner | Quote a manual conversion (recipient = cause address), returns signing payloads |
| POST | `/causes/:id/convert/submit` | owner | Submit the signed conversion |
| POST | `/causes/:id/withdraw` | owner | Records a withdrawal and returns the transfer plan the browser sends |
| POST | `/withdrawals/:id/tx` | owner | Attach the tx hash afterwards |
| POST | `/causes/:id/media` | owner | Photo upload (`file`) or `{ url }` for YouTube, TikTok, Instagram, X, Vimeo, Twitch (allowlisted through shared `embedFor`) or a direct https image |
| DELETE | `/media/:id` | owner or steward | |
| POST | `/causes/:id/share` | | Share counts by channel, no personal data |
| POST | `/me` | auth | `email` for giver notifications, `leaderboardOptOut` |
| POST | `/notifications/read` | auth | |

Also at the root: `GET /health`, `GET /photos/<file>` (seed photos),
`GET /uploads/<sha256>`, `GET /snapshot.json`, `GET /results/<causeId>-<claim>-<epoch>.json`.

## Workers (`pnpm worker`)

| Job | Every | Does |
| --- | --- | --- |
| `listener` | 15 s | Registry logs from the cursor in chunks into the mirrored tables and `RecordEvent`; then `Transfer` logs of the listed stablecoins filtered by `to` in the set of deposit addresses: USD via settlement `fxRate` (1 for USD stables), KYT screen on the sender, `Gift` with `source` site, direct or sera_swap, cause totals from gift rows, gSera credited at once through the ledger. Re-screens gifts held on an unknown KYT answer |
| `treasury` | 60 s | Causes in auto mode with delegated signing: quote a Sera.cx conversion of unconverted balance into the target token. Signing goes through `TreasurySigner`; the stub cannot sign, so the conversion stays `quoted` for the dashboard |
| `settlement-poll` | 30 s | Pending Sera.cx trades (gift swaps and conversions) through `getSettlement` |
| `claims-and-credits` | 1 h | Claims whose 72 h challenge window closed: mark final, queue XP for agreeing paths (400), site visits (400), votes (25) and the evidence the claim rests on (100), reputation +1. Re-push any ledger entry whose gSera credit failed |
| `snapshot` | 5 min | `public/snapshot.json` (`sera-causes.snapshot/1`) |
| `email` | 30 s | Resend outbox; log-only without `RESEND_API_KEY` |

## Ledger

`LedgerEntry` is credited the moment it is created (`grantType` per reason,
`referenceId = LedgerEntry.id`, idempotent on the gSera side). States are
`credited`, `cancelled` (steward clawback through `reverseCredit`), `spent`
(challenge stake) and `burned`; a row sits in `queued` only while a failed
credit call is retried.

gSera has two jobs here, and only two (docs/PLAN.md section 7): gifts, and the
challenge stake. Every helper action earns Care XP instead.

| Event | gSera | Reputation |
| --- | --- | --- |
| Gift (sender not owner or deposit address, KYT clear, within the US$1,000 per wallet per cause per 30 days cap) | `usd x 100 x heat x volume x streak`, max 10x; heat 2.5 under an urgent appeal | |
| Challenge opened | 5,000 stake spent | |
| Challenge upheld | stake back | overturned paths and votes −3 each |
| Challenge rejected | stake stays burned | |

## Care XP

Helpers earn XP on community.sera.cx, never gSera (docs/PLAN.md section 7).
Each event is an `XpEvent` row, unique on `(eventType, sourceRef)` so one
listing, path, vote, piece of evidence or challenge can earn its XP only once.
States are `queued`, `sent` and `unmatched` (no community member for that
wallet). Amounts come from `XP` in `@sera-causes/shared`.

Every event below is anchored to something a stranger can check: a path or a
vote the final outcome agrees with, a listing that reaches Verified, a
challenge that was upheld. Work that rests on a cause owner's word earns a
badge instead, see "Helper badges" below.

| Event key | XP | Credited | Created in |
| --- | --- | --- | --- |
| `care_cause_listed` | 100 | On listing, once the duplicate check has passed | `chain/listener.ts` (`CauseListed`) |
| `care_cause_verified` | 1,500 | Last required claim final, to the lister | `ledger/rewards.ts` (`xpForListingVerified`) |
| `care_evidence_accepted` | 100 | The claim the evidence supports is final | `ledger/rewards.ts` (`settleClaim`) |
| `care_path_agreed` | 400 | Claim final, challenge window closed, path result agrees | `ledger/rewards.ts` (`settleClaim`) |
| `care_site_visit` | 400 | Added, for a C4 path with a dated photo | `ledger/rewards.ts` (`settleClaim`) |
| `care_vote_agreed` | 25 | Same timing as a path | `ledger/rewards.ts` (`settleClaim`) |
| `care_charity_claimed` | 500 | Cause ownership transfers to the charity | `chain/listener.ts` (`OwnerChanged`) |
| `care_challenge_upheld` | 1,000 | The challenge resolves upheld | `ledger/rewards.ts` (`resolveChallenge`) |
| `community_referral` | 500 | A referred member's first credited Care event | Not triggered here yet |

Nothing is sent anywhere yet. `COMMUNITY_MODE=queue` writes the row and logs
it; `POST /api/partner/xp` with an `X-Sera-Signature` HMAC over the raw body,
keyed by `COMMUNITY_HMAC_KEY`, is the proposed route and is not agreed. XP is a
standing on community.sera.cx: it is not a balance, it cannot be spent and it
has no cash value.

## Helper badges

`care_help_fulfilled` and `care_translation` used to pay 250 XP each on nothing
but a cause owner's signed word, and a confirmed help request also counted
towards voting eligibility. A charity and a friend could trade both between
themselves without limit. Both events are gone. That work earns a
`HelperBadge` row instead, written by `ledger/badges.ts`, unique on
`(wallet, slug)` so each badge is earned once. A badge carries no amount, is
not ranked, cannot be spent and gates nothing. `GET /me` returns a wallet's
badges and `/me` on the web app shows them. The table is `HELPER_BADGES` in
`@sera-causes/shared`.

| Slug | Earned when | Awarded in |
| --- | --- | --- |
| `helper` | A cause confirms your help on one of its requests | `ledger/rewards.ts` (`rewardHelp`) |
| `translator` | A cause confirms a translation | `ledger/rewards.ts` (`rewardHelp`) |
| `first_gift` | Your first gift arrives and passes screening | `ledger/gifts.ts` (`recordGiftLedger`) |
| `path_finder` | Ten paths the final outcome agreed with | `ledger/rewards.ts` (`settleClaim`) |
| `steady_hand` | Twenty-five votes the final outcome agreed with | `ledger/rewards.ts` (`settleClaim`) |
| `witness` | A C4 site visit path with a dated photo | `ledger/rewards.ts` (`settleClaim`) |

## Tests

`pnpm test` runs vitest against the real local Postgres in a separate
`sera_causes_test` schema (created by `prisma db push` in the global setup;
tables are truncated between tests). Covered: signature verification and
replay rejection on `POST /votes`, `POST /paths` and `POST /causes/:id/homepage`;
gift ledger maths with cap, owner and deposit-address exclusion, KYT hold and
clawback; transfer scanning and conversion-output detection; registry event
folding including listing XP and notifications; advisory-mode tally that
never changes claim state; finaliser inputs, challenge window and settlement;
`GET /home` ordering through `feedOrder` with hidden and unshown causes
excluded; OG PNG, poster PDF, embed page; media allowlist; treasury, convert,
withdraw and gift quote routes.

## Known gaps

- `VERIFICATION_MODE=community` is accepted and reported, but automatic
  finalisation when voting closes is not wired; the CLI still finalises.
- `TreasurySigner` is a stub. Privy delegated signing needs the real app id and
  `@privy-io/server-auth`; see the TODO in `src/services/treasury-signer.ts`.
- The static Sepolia stablecoin fallback only knows Circle's test USDC. Set
  `STABLECOINS` for USDT, XSGD and MYRT test deployments.
- Evidence and profiles are served from this API with hashes recorded; IPFS
  pinning is deferred to before mainnet.
