# @sera-causes/gsera-client

HMAC-signed client for the gSera points ledger at [g.sera.cx](https://g.sera.cx).
Sera Causes uses it to credit vested gSera to donors and helpers, burn gSera on
boosts and challenge stakes, and read a wallet's spendable balance and
multipliers. A `mock` mode keeps balances locally so the whole flow runs
without the gSera service.

The gSera-side routes this client calls do not exist yet. The change request
for the gSera maintainers is in [`docs/GSERA-INTEGRATION.md`](../../docs/GSERA-INTEGRATION.md).

## Install

Workspace package, no publish step:

```json
{ "dependencies": { "@sera-causes/gsera-client": "workspace:*" } }
```

Runtime dependency is `zod` only. Uses the global `fetch` and `node:crypto`
(Node 22).

## Usage

```ts
import { createGseraClient, InsufficientSpendable } from '@sera-causes/gsera-client';

const gsera = createGseraClient({
  mode: process.env.GSERA_MODE === 'live' ? 'live' : 'mock',
  baseUrl: process.env.GSERA_BASE_URL ?? 'https://g.sera.cx',
  hmacKey: process.env.GSERA_HMAC_KEY ?? '',
});

// Credit vested gSera. Idempotent on (grantType, referenceId, wallet).
await gsera.credit({
  wallet: '0xabc…',
  amountGsera: 9900,
  grantType: 'causes_gift',
  referenceId: 'ledger_01HZX…',  // the CSD LedgerEntry id
  reason: 'Gift to cause 42 vested on claim',
});

// Burn spendable gSera. Idempotent on (reason, referenceId, wallet).
try {
  await gsera.spend({ wallet: '0xabc…', amountGsera: 500, reason: 'cause_boost', referenceId: 'boost_01HZY…' });
} catch (e) {
  if (e instanceof InsufficientSpendable) {
    // e.spendable, e.required
  }
  throw e;
}

// Balance and multipliers.
const w = await gsera.getWallet('0xabc…');
// { wallet, spendable, earned, spent, multipliers: { heat?, volumeTier, streak, powerHour, compound } }

// Claw back a credit (fraud, linked wallet found later). Idempotent.
await gsera.reverseCredit('ledger_01HZX…', 'causes_gift', '0xabc…', 'linked to cause owner');
```

### `createGseraClient(options)`

| Option | Mode | Meaning |
| --- | --- | --- |
| `mode` | both | `'live'` or `'mock'` |
| `baseUrl` | live | gSera API origin. Production is `https://g.sera.cx` (`GSERA_PRODUCTION_URL`) |
| `hmacKey` | live | Shared secret, `CAUSES_HMAC_KEY` on the gSera side |
| `timeoutMs` | live | Per-request timeout, default 10 000 |
| `creditRetries` | live | Extra attempts for `credit` only, default 2 |
| `retryBackoffMs` | live | Base backoff between credit attempts, doubled each time, default 250 |
| `fetch` | live | Injectable fetch for tests |
| `store` | mock | `{ get(wallet), set(wallet, state) }`, default in-memory Map |
| `now` | mock | Clock for deterministic timestamps |

In `mock` mode the returned client also has `seed(wallet, spendable, multipliers?)`
and `setMultipliers(wallet, partial)`.

### Types

- `GrantType`: `causes_gift | causes_path | causes_vote | causes_help | causes_listing | causes_challenge`
- `SpendReason`: `cause_boost | cause_challenge_stake`
- `WalletInfo`: `{ wallet, spendable, earned, spent, multipliers }`
- `Multipliers`: `{ heat?, volumeTier, streak, powerHour, compound }`. `heat` is the
  pair heat of the wallet's last trade on g.sera.cx and is informational; CSD
  applies cause heat on its own side and does not apply power hour to gifts.
- Errors: `GseraError { status, code, detail }`, `InsufficientSpendable { spendable, required }`
  (HTTP 402), `GseraConfigError`.

## Wire format (live mode)

Every request carries `X-Sera-Signature: sha256=<hex HMAC-SHA256 of the raw body>`
under the shared key, exactly as gSera's `partnerAuth.ts` expects. The client
signs the string it puts on the wire and never re-serialises. Requests without
a body (the GET) are signed over the literal `{}`, which is what gSera's
guard falls back to when there is no raw body. `signBody(key, raw)` is exported
so other code can produce or verify the same header.

| Method | Path | Body |
| --- | --- | --- |
| POST | `/v1/causes/credit` | `{ wallet, amount_gsera, grant_type, reference_id, reason }` |
| POST | `/v1/causes/spend` | `{ wallet, amount_gsera, reason, reference_id }` |
| POST | `/v1/causes/credit/reverse` | `{ wallet, grant_type, reference_id, reason }` |
| GET | `/v1/causes/wallet/:address` | none |

Responses use gSera's `{ data, meta }` envelope on success and
`{ error: { code, message, detail? } }` on failure. See the integration doc for
the full shapes.

### Retries

Only `credit` is retried (on network errors, timeouts, 502, 503 and 504).
gSera's `GSeraGrant` has a unique `(grant_type, reference_id, wallet)` key,
so a retry of a request that actually landed comes back as `already_granted`
instead of a duplicate. `spend` and `reverseCredit` are idempotent on the
gSera side too, but are not retried automatically: a timeout should surface
so the caller's own ledger entry stays in a retryable state.

## Mock mode

The mock mirrors the gSera model: lifetime `earned` is never reduced by
spending, `spendable = earned - spent`, grants are idempotent on
`(grantType, referenceId)` per wallet and spends on `(reason, referenceId)` per
wallet. Reversed grants come off `earned` and stay recorded so a second
reversal is a no-op. New wallets report `volumeTier` 1.0, `streak` 1.0,
`powerHour` 1.0, `compound` 1.0.

Plug in a store to persist balances (the indexer backs it with Postgres under
`GSERA_MODE=mock`):

```ts
import { createGseraClient, type MockStore, type MockWalletState } from '@sera-causes/gsera-client';

const store: MockStore = {
  get: (wallet) => db.gseraMock.findUnique({ where: { wallet } }).then((r) => r?.state as MockWalletState | undefined),
  set: (wallet, state) => db.gseraMock.upsert({ where: { wallet }, create: { wallet, state }, update: { state } }).then(() => {}),
};
const gsera = createGseraClient({ mode: 'mock', store });
await gsera.seed('0xabc…', 10_000);
```

`MockWalletState` is plain JSON. The mock does read, mutate, write, so a store
shared by several processes should serialise `get`/`set` per wallet.

## Scripts

```
pnpm --filter @sera-causes/gsera-client check   # tsc --noEmit over src and test
pnpm --filter @sera-causes/gsera-client test    # vitest
pnpm --filter @sera-causes/gsera-client build   # tsc to dist/
```
