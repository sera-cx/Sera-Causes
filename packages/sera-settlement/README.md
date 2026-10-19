# packages/sera-settlement

**Protected settlement layer.** This package wraps Sera Protocol for:

- discovering supported currencies and chains,
- quoting a donation from any supported cryptoasset into a stablecoin,
- executing the conversion, and
- settling the stablecoin to the cause's receiving address on its chosen chain.

It is the single point through which every Sera Causes deployment reaches
Sera Protocol. Under the [Sera Causes License](../../LICENSE) it must not be
removed, bypassed, or replaced with another settlement protocol in any fork
or deployment.

Changes to this package are made by Sera maintainers only. Pull requests from
forks that modify it fail CI. Propose changes in an issue.

Protocol references: [Sera MCP](https://github.com/sera-cx/sera-mcp),
[docs.sera.cx](https://docs.sera.cx).

## What it does

`createSettlement()` returns the seven functions from
[ARCHITECTURE.md section 8](../../ARCHITECTURE.md), plus `fxRate` for USD
valuation. It is **server-side only**: the Sera API key never leaves the
indexer, and the browser only ever sees typed data to sign.

| Function | Sera.cx calls | Cache |
| --- | --- | --- |
| `getDeployment()` | `GET /config`, `GET /health` | 1 h |
| `listCurrencies()` | `GET /tokens`, `GET /markets` | 10 min |
| `quoteGift({ fromToken, toToken, fromAmountRaw, giver, recipient, ttlSeconds })` | `GET /system/time` (5 s), `POST /swap/quote` | none |
| `buildSigningRequest(quote)` | pure: `Intent` and optional `Permit` EIP-712 typed data | n/a |
| `submitGift({ uuid, signature, permitSignature?, permitDeadline? })` | `POST /swap` (never retried, 25 s timeout) | none |
| `getSettlement(tradeId, expectation?)` | `GET /orders/{trade_id}` (API key) with strict validation | none |
| `screenAddress(address, checkType)` | Sera KYT `POST https://kyt.sera.cx/api/v1/screen` (`KYT_MODE=live`; `stub` needs no network). Wire format provisional, isolated in `src/kyt.ts` | none |
| `fxRate(from, to)` | `GET /fx/rate?base&quote` | 60 s |

Base URLs: mainnet `https://api.sera.cx/api/v1`, Sepolia
`https://api.testnet.sera.cx/api/v1` (sera-pay and rotor; sera-mcp alone
uses `api-testnet.sera.cx`). The testnet host must be confirmed against a
live `GET /health` before go-live. Auth is
`Authorization: Bearer <key>:<secret>` and is only sent on
`GET /orders/{id}`. Sera publishes no webhooks: poll `getSettlement`.

## Usage

```ts
import { createSettlement, isQuoteStaleError } from "@sera-causes/sera-settlement";

const sera = createSettlement();                 // reads SERA_* from process.env

// 1. Quote (server). Amounts are raw token units.
const quote = await sera.quoteGift({
  fromToken: "USDC",                             // symbol or ERC-20 address
  toToken: cause.payoutToken,
  fromAmountRaw: "25000000",
  giver: wallet,
  recipient: cause.payout,                       // locked into the signed Intent
  ttlSeconds: 120,                               // clamped to [30, 600]
});

// 2. Sign (browser). Both objects go straight into viem `signTypedData`.
const { intent, permit } = sera.buildSigningRequest(quote);
// quote.authorization: "permit" (sign `permit`), "approval" (approve
// quote.permit.spender for quote.initialDepositRaw on-chain first), or "none".

// 3. Submit (server) before quote.expiresAt (about 30 s after quoting).
const { tradeId } = await sera.submitGift({
  uuid: quote.quoteId,
  signature,
  permitSignature,
  permitDeadline: Number(permit?.message.deadline),
});

// 4. Poll (worker). Pass what you stored so the order is proven to be yours.
const status = await sera.getSettlement(tradeId, {
  payerAddress: quote.giver,
  inputTokenAddress: quote.from.address,
  outputTokenAddress: quote.to.address,
  targetOutputAmountRaw: quote.minOutputRaw,
});
// { state: "pending" | "settled" | "failed", txHash?, received: { token, amountRaw } | null, feesPaid: [...] }

// KYT/KYA screen before quoting (also for "payout", "voter", "lister").
// With KYT_FAIL_CLOSED=true an outage comes back as "flagged" with reason "kyt_unavailable".
const kyt = await sera.screenAddress(wallet, "giver");   // { state: "clear" | "flagged" | "unavailable", reasons, checkedAt }

// USD valuation of a non-USD stablecoin gift.
const { rate } = await sera.fxRate("SGD", "USD");
```

Local development and tests use the same interface with no network:

```ts
import { createMockSettlement } from "@sera-causes/sera-settlement";
const sera = createMockSettlement();   // 1:1 minus 10 bps, settles on the second poll
```

### What the quote validation guarantees

Every `POST /swap/quote` response is checked before anything is signed
(logic copied from sera-pay's `sera-swap-quote.ts`):

- `GET /config` is for the configured chain; Sera, Vault and SOR addresses are
  distinct; the EIP-712 domain is `{ name: "Sera", version: "1" }` pinned to
  `sera_address`.
- `route_params` echo the request: taker = giver, tokens, recipient, deadline
  = requested expiration; `receive_less` preserves the input amount;
  `minOutputAmount = 0` is reported as `no_liquidity`.
- The permit envelope (always present on wallet-funded quotes) has an
  EIP-2612 `Permit` type, a domain bound to the input token and the live
  chain, `spender = sor_address`, and a message whose owner, value, nonce and
  deadline match the metadata, with the deadline never outliving the Intent.

Settlement validation (from sera-pay's `sera-settlement.ts`) proves order
identity (trade id, owner, `order_type = swap`, tokens), a 32-byte non-zero
`settlement_summary.latest_tx_hash`, `settlement_economics` belonging to the
same order, a payer debit only in the input token, and an output credit at or
above `targetOutputAmountRaw`. The tracked order does not contain the swap
recipient; verify the on-chain transfer before crediting a gift.

### Errors

| Class | When |
| --- | --- |
| `SeraApiError { status, code, body }` | Sera answered 4xx/5xx. `code` is Sera's `error_code` (e.g. `NO_LIQUIDITY`, `QUOTE_STALE`, `ALLOWANCE_INSUFFICIENT`). HTTP 410 is always `QUOTE_STALE`; check `isQuoteStaleError(e)` and re-quote. |
| `SeraNetworkError { code: "TIMEOUT" \| "NETWORK" }` | Transport failure. GETs retry twice on 5xx/transport errors; `POST /swap` never does. |
| `SeraSubmitError { outcome }` | 2xx from `POST /swap` that is not a success. `rejected` is safe to re-quote; `indeterminate` must be reconciled, never resubmitted. |
| `SeraQuoteValidationError { code, field }` | Input or quote failed validation (`invalid_request`, `unsupported_token`, `amount_below_min`, `no_liquidity`, `invalid_quote`, `invalid_config`, `unsupported_chain`, `sera_unavailable`, `sera_rate_limited`). |
| `SeraSettlementValidationError { code, retryable }` | Tracked order is not provably ours or its economics are malformed. |
| `SeraSchemaError` | A response did not match the zod schema for its endpoint. |

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `SERA_NETWORK` | `mainnet` | `mainnet` or `sepolia`; selects the canonical base URL and chain id. |
| `SERA_API_KEY`, `SERA_API_SECRET` | unset | API-key pair for `GET /orders/{id}`. Quotes, tokens, markets, time and FX are public. |
| `SERA_BASE_URL` | unset | Ignored unless `SERA_BASE_URL_ALLOW_CUSTOM=true`. Must be https. |
| `SERA_BASE_URL_ALLOW_CUSTOM` | `false` | First override gate. |
| `SERA_BASE_URL_ALLOW_NON_SERA` | `false` | Second gate, required for hosts outside `*.sera.cx`. |
| `KYT_MODE` | `stub` | `stub` (no network; every address clear) or `live` (kyt.sera.cx). Production must set `live`. |
| `KYT_BASE_URL` | `https://kyt.sera.cx` | KYT service origin. |
| `KYT_API_KEY` | unset | Sent as `Authorization: Bearer <key>` when set. |
| `KYT_FAIL_CLOSED` | `false` | Fail-closed: report an outage (transport error, timeout, non-2xx, unreadable body) as `flagged` with reason `kyt_unavailable` instead of `unavailable`. |

All of these can also be passed to `createSettlement({ network, apiKey, apiSecret, baseUrl, env, fetch, kyt })`, and the KYT client is available on its own as `createKytClient({ mode, baseUrl, apiKey, timeoutMs, failClosed, flagged, simulateOutage })` with `screen({ address, checkType })`.

## Development

```sh
pnpm --filter @sera-causes/sera-settlement check   # tsc, including tests
pnpm --filter @sera-causes/sera-settlement test    # vitest with a fetch stub; no network
pnpm --filter @sera-causes/sera-settlement build   # emits dist/
```

Source of truth for shapes: `sera-cx/sera-mcp` (`src/config.ts`,
`src/sera/client.ts`, `src/sera/types.ts`, `src/tools/core.ts`,
`src/signer/signer.ts`), `sera-cx/sera-pay` (`server/sera-api.ts`,
`server/sera-swap-quote.ts`, `server/sera-settlement.ts`) and
`sera-cx/sera-docs` (`docs/en/api-reference/endpoints/{system,swaps,orders}.md`).
The kyt.sera.cx wire format in `src/kyt.ts` is provisional until that repo
is public; correct it there only.
