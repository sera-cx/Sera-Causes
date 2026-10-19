# gSera integration: change request for the g.sera.cx repo

**Audience:** gSera maintainers. **Requested by:** Sera Causes (CSD).
**Status:** proposed, 19 October 2026. **Effort:** one afternoon, one migration.

Sera Causes (causes.sera.cx) pays gSera to donors and helpers and burns gSera
on cause boosts and challenge stakes, as described in
[`PRODUCT-BRIEF.md`](./PRODUCT-BRIEF.md) section 6. It needs four small
partner routes on g.sera.cx, one shared secret, one extracted service function
and one new column. Everything else (pending balances, vesting, cause heat,
anti-gaming caps) stays on the CSD side, so gSera only ever sees vested
credits and finished spends.

The client that will call these routes already exists:
[`packages/gsera-client`](../packages/gsera-client/README.md). The wire
shapes below are what it sends and expects.

## 1. Summary of changes

| # | Change | Files in gSera |
| --- | --- | --- |
| 1 | `CAUSES_HMAC_KEY` env var | `src/config/env.ts` |
| 2 | `spendGsera()` extracted from `buyTickets` | `src/services/gseraLedger.ts`, `src/services/sweepstakes.ts` |
| 3 | `source` column on `GSeraGrant`, draw exclusion rule | `prisma/schema.prisma`, `prisma/migrations/<ts>_causes_grant_source/migration.sql`, `src/services/gseraLedger.ts` |
| 4 | Six new `grant_type` values | comment in `prisma/schema.prisma`, `src/routes/causes.ts` |
| 5 | Four routes under `/v1/causes` | `src/routes/causes.ts` (new), `src/server.ts` |
| 6 | Tests | `__tests__/causesRoutes.test.ts`, `__tests__/spendGsera.test.ts` (new) |
| 7 | Optional: gifts count towards volume tier and streak | `src/routes/causes.ts`, `src/services/streakService.ts` |

No change to any existing route's behaviour. Existing grants default to
`source = 'trading'` so nothing moves for current users.

## 2. Authentication: `requireHmac(() => env.CAUSES_HMAC_KEY)`

Reuse `src/middleware/partnerAuth.ts` as it stands. CSD signs the raw request
body with HMAC-SHA256 under its own key and sends
`X-Sera-Signature: sha256=<hex>`, exactly like sera.money and
ambassador.sera.cx. One new key, so a leak on either side never affects the
other partners and it rotates on its own.

`src/config/env.ts`, next to `SERAMONEY_HMAC_KEY`:

```ts
  //   CAUSES     → /v1/causes/* (causes.sera.cx)
  CAUSES_HMAC_KEY: z.string().optional(),
```

While the key is unset the routes answer 503 `NOT_CONFIGURED`, which is what
we want: nothing can credit points before the integration is provisioned.
The CSD client retries `credit` on 503, so turning the key on later needs no
replay on our side.

One detail to keep in mind when testing: the GET wallet route has no body.
`express.json` leaves `req.body` as `{}` and `hmacValid` falls back to
`JSON.stringify({})`, so the client signs bodyless requests over the literal
string `{}`. No middleware change is needed; it already works this way.

## 3. The routes

New file `src/routes/causes.ts`, mounted in `src/server.ts` beside the other
partner routers:

```ts
import causesRoutes from './routes/causes';
app.use('/v1/causes', rateLimit, causesRoutes);
```

All four routes use `requireHmac(() => env.CAUSES_HMAC_KEY)`. Success responses
go through `respond()` (the `{ data, meta }` envelope). Errors use the existing
`{ error: { code, message } }` shape, with an extra `detail` object where it
helps the caller.

Common validation (422 `INVALID_INPUT` on failure):

- `wallet`: lowercased, must match `/^0x[a-f0-9]{40}$/`.
- `amount_gsera`: finite number greater than 0, at most `CAUSES_MAX_GSERA_PER_CALL`
  (suggest a constant of 10,000,000 in `src/config/constants.ts`; the largest
  single gift credit under the brief's caps is about 1,600,000).
- `reference_id`: 1 to 100 characters for grants (`GSeraGrant.reference_id` is
  VarChar(100)), 1 to 80 for spends (`GSeraSpend.reference_id` is VarChar(80)).
- `reason` on credit and reverse: free text up to 500 characters, for logs.
  On credit it is logged, not stored. On reverse it goes into
  `GSeraGrant.reversal_reason`.

### 3.1 `POST /v1/causes/credit`

Credit vested gSera. CSD has already applied the multipliers; gSera stores the
final amount.

Request:

```json
{
  "wallet": "0xabc0000000000000000000000000000000000001",
  "amount_gsera": 9900,
  "grant_type": "causes_gift",
  "reference_id": "ledger_01J9ZK4Q2W8X3N5M7P9R1T3V5Y",
  "reason": "Gift 0x7f…:3 to cause 42 vested on claim"
}
```

Behaviour:

1. Validate. `grant_type` must be one of the six values in section 5.
2. Insert into `GSeraGrant` with `source = 'charity'`, using the same
   `INSERT … ON CONFLICT (grant_type, reference_id, wallet) DO NOTHING` pattern
   as `src/services/downloadPromo.ts:123`. Upsert the `Wallet` row first so
   the foreign key and the later `FOR UPDATE` lock have something to hold.
3. If the insert was skipped, read the existing row and return it with
   `status: "already_granted"`. Never credit twice.
4. Increment `Balance.gsera_total` by the amount inside the same transaction,
   as the referral and promo paths do, so the stored mirror agrees with the
   recompute readers.
5. Return the wallet's spendable after the credit, from `getSpendableInfo`.

Response 200:

```json
{
  "data": {
    "status": "granted",
    "grant_id": "grt_…",
    "wallet": "0xabc0000000000000000000000000000000000001",
    "amount_gsera": "9900.0000",
    "spendable_after": "12400.0000"
  },
  "meta": { "request_id": "…", "ts_utc": "…" }
}
```

`status` is `"granted"` or `"already_granted"`. On `already_granted`,
`amount_gsera` is the stored amount, not the one in the request (if they
differ, log a warning; CSD never changes an amount under the same reference).
Numbers may be returned as strings, as the wallet routes do; the client
accepts both.

Errors: 401 `BAD_SIGNATURE`, 422 `INVALID_INPUT`, 503 `NOT_CONFIGURED`.

### 3.2 `POST /v1/causes/spend`

Burn spendable gSera for a boost or a challenge stake.

Request:

```json
{
  "wallet": "0xabc0000000000000000000000000000000000001",
  "amount_gsera": 500,
  "reason": "cause_boost",
  "reference_id": "boost_01J9ZK7…"
}
```

`reason` must be `cause_boost` or `cause_challenge_stake`. These two values are
charity-source spends (section 4).

Behaviour: one call to `spendGsera()` (section 6) inside `prisma.$transaction`
with `source: 'charity'`. The function does the wallet lock, the idempotency
check, the balance check and the `GSeraSpend` insert.

Response 200:

```json
{
  "data": {
    "status": "spent",
    "spend_id": "gss_…",
    "wallet": "0xabc0000000000000000000000000000000000001",
    "amount_gsera": "500.0000",
    "spendable_after": "11900.0000"
  },
  "meta": { "request_id": "…", "ts_utc": "…" }
}
```

`status` is `"spent"` or `"already_spent"` (unique `(reason, reference_id,
wallet)` already existed; nothing was burned again).

Response 402 when the wallet is short:

```json
{
  "error": {
    "code": "INSUFFICIENT_GSERA",
    "message": "insufficient_gsera",
    "detail": { "spendable": 120, "required": 500, "wallet": "0xabc…" }
  }
}
```

The client turns this into an `InsufficientSpendable` error with those two
numbers, so please keep `detail.spendable` and `detail.required` as numbers.
Other errors as for credit.

### 3.3 `POST /v1/causes/credit/reverse`

Claw back a credit. CSD uses this only after vesting, for the anti-gaming
cases in the brief (a wallet later found to be linked to the cause owner, a
KYT flag that arrives late). Gifts refunded before vesting never reach gSera
in the first place.

Request:

```json
{
  "wallet": "0xabc0000000000000000000000000000000000001",
  "grant_type": "causes_gift",
  "reference_id": "ledger_01J9ZK4Q2W8X3N5M7P9R1T3V5Y",
  "reason": "Giver wallet funded by cause payout wallet within 30 days"
}
```

Behaviour: look up the grant by `(grant_type, reference_id, wallet)`, then
call the existing `reverseGrant(grantId, reason)` in
`src/services/gseraLedger.ts`. That function already sets `reversed_at_utc`,
decrements `Balance.gsera_total` and is idempotent.

Response 200:

```json
{
  "data": {
    "status": "reversed",
    "grant_id": "grt_…",
    "wallet": "0xabc0000000000000000000000000000000000001",
    "amount_gsera": "9900.0000"
  },
  "meta": { "request_id": "…", "ts_utc": "…" }
}
```

`status` is `"reversed"` or `"already_reversed"`. 404 `NOT_FOUND` when no grant
matches. Reversing can take spendable below zero if the wallet has already
spent the points; that is the same as today's admin reversal and
`getSpendableInfo` clamps at 0.

### 3.4 `GET /v1/causes/wallet/:address`

Spendable balance and current multipliers, so CSD can show "you will earn
about N gSera" on the give sheet and price boosts.

No body. Signed over `{}` (section 2).

Response 200:

```json
{
  "data": {
    "wallet": "0xabc0000000000000000000000000000000000001",
    "earned": "12400.0000",
    "spent": "500.0000",
    "spendable": "11900.0000",
    "draw_spendable": "2000.0000",
    "multipliers": {
      "heat_index": 2.5,
      "volume_tier": 1.2,
      "streak": 1.1,
      "power_hour": 1.0,
      "compound": 3.3
    }
  },
  "meta": { "request_id": "…", "ts_utc": "…" }
}
```

- `earned`, `spent`, `spendable`: straight from `getSpendableInfo(address)`
  (`src/services/gseraLedger.ts:95`).
- `draw_spendable`: the Lucky Draw figure from section 4. Optional for CSD
  but cheap to include; it is the number the draw UI should show once the
  rule lands.
- `multipliers`: the same `computeMultipliers(curPair, seasonVol, week, now)`
  call the existing `GET /v1/wallet/:address/multipliers` route makes
  (`src/routes/wallet.ts:380`). Lift that block into a small helper
  `getWalletMultipliers(address, now)` in `src/services/multiplierEngine.ts`
  (or a new `src/services/walletMultipliers.ts`) and call it from both routes
  so they cannot drift. `heat_index` may be `null` when the wallet has no
  trade; CSD ignores it and applies cause heat itself, and does not apply
  power hour to gifts. CSD uses `volume_tier` and `streak` only.

The existing multipliers route requires a Privy JWT or API key for the same
wallet. This route is partner-authenticated instead, because CSD reads it
server-side for any wallet that is giving; that is the reason for a separate
path rather than widening the existing one. For a well-formed address gSera
has never seen, return zeros and default multipliers (1.0 each,
`heat_index: null`) rather than 404: a first-time donor is the common case.

## 4. `source` tag on grants, and the Lucky Draw rule

Brief section 6.6, option 1: "Charity gSera goes back to charity." gSera
earned from gifts and helping can be spent on boosts and challenges but not
on Lucky Draw tickets. This keeps "give to charity, win in a draw" off the
table and keeps CSD clear of gaming and lottery rules.

### 4.1 Schema

`prisma/schema.prisma`, model `GSeraGrant`:

```prisma
model GSeraGrant {
  id              String    @id @db.VarChar(36)
  wallet          String    @db.VarChar(42)
  grant_type      String    @db.VarChar(30) // referral_referee | referral_referrer | early_bird_starter | causes_* (see routes/causes.ts)
  amount_gsera    Decimal   @db.Decimal(20, 4)
  reference_id    String?   @db.VarChar(100)
  source          String    @default("trading") @db.VarChar(10) // trading | charity
  granted_at_utc  DateTime  @default(now())
  reversed_at_utc DateTime?
  reversal_reason String?   @db.VarChar(500)

  @@unique([grant_type, reference_id, wallet])
  @@index([wallet, granted_at_utc(sort: Desc)])
  @@index([wallet, source])
  @@index([grant_type])
}
```

Migration `prisma/migrations/<timestamp>_causes_grant_source/migration.sql`:

```sql
ALTER TABLE "GSeraGrant" ADD COLUMN "source" VARCHAR(10) NOT NULL DEFAULT 'trading';
CREATE INDEX "GSeraGrant_wallet_source_idx" ON "GSeraGrant"("wallet", "source");
```

No backfill: every grant that exists today came from trading, referrals or
promos, and `'trading'` is the right tag for all of them. Only the causes
credit route writes `'charity'`.

Spends do not need a column. Classify them by `reason`:

```ts
// src/services/gseraLedger.ts
export const CHARITY_SPEND_REASONS = new Set(['cause_boost', 'cause_challenge_stake']);
export type SpendSource = 'trading' | 'charity';
export const spendSource = (reason: string): SpendSource =>
  CHARITY_SPEND_REASONS.has(reason) ? 'charity' : 'trading';
```

### 4.2 The rule

Definitions, all over non-reversed rows and the Season 1 window that
`getEarnedGsera` already applies:

- `earned` = taker + maker + all grants (unchanged, this is lifetime rank).
- `earned_charity` = sum of grants where `source = 'charity'`.
- `earned_trading` = `earned - earned_charity`.
- `spent` = sum of all spends (unchanged).
- `spent_trading` = sum of spends whose reason is not in `CHARITY_SPEND_REASONS`
  (today that is only `lucky_draw_ticket`).
- `spendable` = `max(0, earned - spent)`. Unchanged. Charity spends may draw
  on the whole balance: trading gSera going to a cause is fine.
- `draw_spendable` = `max(0, min(earned - spent, earned_trading - spent_trading))`.

The `min` is what makes it correct in both directions. Charity spends are in
effect attributed to charity earnings first and trading earnings second, and
draw tickets can never reach the charity part. Worked cases:

| earned_trading | earned_charity | spent (reason) | spendable | draw_spendable |
| --- | --- | --- | --- | --- |
| 1000 | 0 | 800 boost | 200 | 200 |
| 1000 | 500 | 800 boost | 700 | 700 |
| 1000 | 500 | 900 tickets | 600 | 100 |
| 0 | 500 | 0 | 500 | 0 |

Leaderboards and lifetime rank do not change: `earned` still counts
everything, and spending still never lowers it.

### 4.3 Where it is enforced

Only in `spendGsera()` (section 6). A spend with `source: 'trading'` is
checked against `draw_spendable`; a spend with `source: 'charity'` against
`spendable`. `buyTickets` passes `'trading'`, the causes spend route passes
`'charity'`. The draw is retired at the moment (`DRAW_ENABLED = false` in
`src/config/constants.ts:194`), so this lands as protection for whenever it
returns rather than as a change to live behaviour.

Extend `getSpendableInfo` so one read gives everything:

```ts
export interface SpendableInfo {
  earned: number;
  spent: number;
  spendable: number;
  earned_charity: number;
  spent_trading: number;
  draw_spendable: number;
}
```

Existing callers only read `earned`, `spent` and `spendable`, so this is
additive. `GET /v1/wallet/:address/balance` (`src/routes/wallet.ts:140`) can
add `gsera_draw_spendable` next to `gsera_spendable` when the draw comes back;
not needed for this change.

## 5. New `grant_type` values

| `grant_type` | Paid when | Typical amount |
| --- | --- | --- |
| `causes_gift` | A gift vests (cause claims it, or 90 days pass with no refund) | gift_usd × 100 × cause heat × volume tier × streak |
| `causes_listing` | A cause the wallet added reaches Verified | 2,500 |
| `causes_path` | A verification path the final outcome agrees with, after the challenge window closes | 1,000 |
| `causes_vote` | A vote in line with the final outcome, same timing | 100 |
| `causes_help` | A help request fulfilled and confirmed by the charity | 500 |
| `causes_challenge` | A challenge upheld: the returned stake plus 2,000 | stake + 2,000 |

All six carry `source = 'charity'`. `reference_id` is CSD's `LedgerEntry.id`
(a ULID, 26 characters), so it is unique per wallet and per event on our side
and the `(grant_type, reference_id, wallet)` key gives exactly-once credit.
The existing `getEarnedGsera` aggregate picks them up without change, so they
count towards the leaderboard like any grant. If any "earned from X"
breakdown filters on `grant_type`, add the `causes_` prefix to it.

Keep the `grant_type` column at VarChar(30); the longest new value is 16
characters.

## 6. `spendGsera()` extracted from `buyTickets`

`buyTickets` in `src/services/sweepstakes.ts:79-123` is the only correct spend
path today: lock the wallet row `FOR UPDATE`, compute earned minus spent under
the lock, insert `GSeraSpend`. The causes spend route needs the same thing
without a draw, so lift the middle of `buyTickets` into
`src/services/gseraLedger.ts`:

```ts
export class SpendError extends Error {
  constructor(public reason: 'insufficient_gsera' | 'invalid_amount', public detail?: Record<string, unknown>) {
    super(reason);
  }
}

export interface SpendGseraInput {
  wallet: string;        // lowercased
  amount: number;        // > 0
  reason: string;        // 'lucky_draw_ticket' | 'cause_boost' | 'cause_challenge_stake'
  referenceId: string;   // idempotency key with reason and wallet
  source: SpendSource;   // which balance the check runs against
  now?: Date;
}

export interface SpendGseraResult {
  spendId: string;
  amount: number;
  spendableAfter: number;
  alreadySpent: boolean;
}

/**
 * Burn gSera inside the caller's transaction. Locks the wallet row so two
 * spends cannot both pass the balance check. Idempotent on
 * (reason, reference_id, wallet): a repeat returns the stored spend and burns
 * nothing. `source` picks the balance that is checked: 'trading' uses
 * draw_spendable (charity gSera excluded), 'charity' uses spendable.
 */
export async function spendGsera(tx: Prisma.TransactionClient, input: SpendGseraInput): Promise<SpendGseraResult> {
  const { wallet, amount, reason, referenceId, source } = input;
  const now = input.now ?? new Date();
  if (!Number.isFinite(amount) || amount <= 0) throw new SpendError('invalid_amount');

  await tx.wallet.upsert({ where: { address: wallet }, update: {}, create: { address: wallet } });
  await tx.$queryRaw`SELECT 1 FROM "Wallet" WHERE address = ${wallet} FOR UPDATE`;

  const existing = await tx.gSeraSpend.findUnique({
    where: { reason_reference_id_wallet: { reason, reference_id: referenceId, wallet } },
  });
  if (existing) {
    const info = await getSpendableInfo(wallet);
    return { spendId: existing.id, amount: Number(existing.amount_gsera), spendableAfter: info.spendable, alreadySpent: true };
  }

  const info = await getSpendableInfo(wallet); // committed reads are fine under the lock
  const available = source === 'trading' ? info.draw_spendable : info.spendable;
  if (available < amount) throw new SpendError('insufficient_gsera', { spendable: available, required: amount, wallet });

  const spendId = id('gss');
  await tx.gSeraSpend.create({
    data: { id: spendId, wallet, amount_gsera: amount, reason, reference_id: referenceId, spent_at_utc: now },
  });
  return { spendId, amount, spendableAfter: info.spendable - amount, alreadySpent: false };
}
```

Then `buyTickets` becomes: lock the draw row as now, call
`spendGsera(tx, { wallet, amount: cost, reason: 'lucky_draw_ticket', referenceId: ticketId, source: 'trading', now })`,
catch `SpendError('insufficient_gsera')` and rethrow it as
`DrawError('insufficient_gsera', detail)` so `src/routes/sweepstakes.ts:67`
still maps it to 402, then insert the ticket and update the draw exactly as
today. `getSpendableInfo` reads the sum of non-reversed spends the same way
`buyTickets` does inline today, so the arithmetic is unchanged; the only new
input is the `source` check.

Lock order stays draw row then wallet row in `buyTickets`; the causes route
locks only the wallet row. No deadlock is possible between them because the
causes route never touches the draw row.

## 7. Optional: gifts count towards volume tier and streak

Brief 6.2 says gifts count towards the donor's season volume and keep the
weekly streak alive. That is gSera state (`Balance.season_volume_usd`,
`StreakState`), so if you want it, accept an optional field on credit:

```json
{ "…": "…", "volume_usd": 50.00 }
```

On a `causes_gift` grant that is actually inserted (not `already_granted`),
increment `Balance.season_volume_usd` by `volume_usd` and mark the current UTC
week as qualifying in `StreakState`, with whatever helper the taker path uses
after a trade. The CSD side sends the USD value the cause received. Leave this
out of the first cut if the streak helper is awkward to call outside the trade
path; the client already works without it, and the only effect is that gifts
then earn at the donor's swap-derived tier and streak.

## 8. How CSD keeps pending and vesting on its side

gSera has no pending state, no vesting and no generic burn, and this request
does not add any. CSD's indexer keeps its own ledger
(`LedgerEntry { wallet, amount, reason, sourceTag, sourceRef, multipliers, state, vestsAt, gseraRef }`,
see [`ARCHITECTURE.md`](../ARCHITECTURE.md) section 5) and only calls gSera at
the edges:

1. **Gift received.** CSD writes a `LedgerEntry` in state `pending` with
   `vestsAt = now + 90 days`, the amount computed from `gift_usd × 100 × cause
   heat × volume tier × streak`, with the tier and streak read from
   `GET /v1/causes/wallet/:address` at gift time and stored in `multipliers`.
   Nothing is sent to gSera. The donor sees it as pending on causes.sera.cx.
2. **Vesting.** When the cause claims the gift, or `vestsAt` passes with no
   refund taken, a vesting job moves the entry to `vested` and calls
   `POST /v1/causes/credit` with `reference_id = LedgerEntry.id`. The
   returned `grant_id` is stored in `gseraRef`. The job is safe to re-run:
   the unique key on your side and the `already_granted` answer make a
   duplicate call harmless, which is why the client retries only this call.
3. **Refund before vesting.** The entry moves to `cancelled`. gSera never
   hears about it.
4. **Helper rewards** (`causes_path`, `causes_vote`, `causes_listing`,
   `causes_help`, `causes_challenge`) are written as `vested` straight away
   when the triggering event is final, and credited the same way.
5. **Boosts and challenge stakes.** CSD validates the signed boost or
   challenge, then calls `POST /v1/causes/spend` with the boost or challenge
   id as `reference_id`. On 402 the boost is rejected and nothing is written.
   On success the entry is recorded as `spent` (stake) or `burned` (boost)
   with `gseraRef = spend_id`. A challenge that is upheld gets its stake back
   as a fresh `causes_challenge` credit (stake plus 2,000) rather than a
   reversal of the spend, so the spend ledger stays append-only.
6. **Clawback after vesting** (anti-gaming, brief 6.7): the entry moves to
   `cancelled` and CSD calls `POST /v1/causes/credit/reverse`.

The CSD ledger is the source of truth for what the donor sees as pending; the
gSera ledger is the source of truth for spendable and for the leaderboard.
Reconciliation is a nightly job on the CSD side that compares the sum of
`vested` entries per wallet with the sum of non-reversed `causes_*` grants
on your side, which it can read back through `GET /v1/causes/wallet/:address`
once that route exists. No gSera cron is needed.

## 9. Tests to add

`__tests__/spendGsera.test.ts`:

- Spend under balance succeeds and lowers `spendable` but not `earned`.
- Spend over balance throws `SpendError('insufficient_gsera')` with
  `detail.spendable` and `detail.required`.
- Repeat with the same `(reason, reference_id, wallet)` returns
  `alreadySpent: true` and inserts nothing.
- With `earned_charity > 0`, `source: 'trading'` is limited to
  `draw_spendable` while `source: 'charity'` can use the full `spendable`.
  Use the four rows in the table in section 4.2.
- `buyTickets` still returns `insufficient_gsera` as a `DrawError`.

`__tests__/causesRoutes.test.ts` (supertest against the Express app, as the
promo routes are tested):

- Missing or wrong `X-Sera-Signature` gives 401; unset key gives 503.
- Credit twice with the same key gives `granted` then `already_granted` and
  one row.
- Spend with insufficient balance gives 402 with the `detail` shape above.
- Reverse gives `reversed` then `already_reversed`; unknown gives 404.
- GET wallet for an unknown address gives zeros and default multipliers.

To compute a signature in a test:

```ts
const raw = JSON.stringify(body);
const sig = 'sha256=' + createHmac('sha256', process.env.CAUSES_HMAC_KEY!).update(raw).digest('hex');
await request(app).post('/v1/causes/credit').set('X-Sera-Signature', sig).set('Content-Type', 'application/json').send(raw);
```

Send the string, not the object, so the bytes on the wire are the bytes
signed.

## 10. Rollout

1. Merge with `CAUSES_HMAC_KEY` unset. Routes answer 503; nothing changes.
2. Run the migration. The default fills `source` for every existing grant.
3. Generate a 32-byte random key, set `CAUSES_HMAC_KEY` on g.sera.cx and
   `GSERA_HMAC_KEY` on the CSD indexer. Share it out of band, never in a
   ticket.
4. CSD flips `GSERA_MODE=live` and runs its reconciliation once against an
   empty set of `causes_*` grants to confirm the wallet route reads cleanly.

Questions to the CSD side: open an issue in the Sera Causes repo, or reach
the maintainers at douglas@sera.cx.
