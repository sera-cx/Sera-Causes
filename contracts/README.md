# @sera-causes/contracts

`CauseRegistry.sol` v1.1: the shared cause registry behind causes.sera.cx and
any other front end built on Sera Causes. One contract holds the list of
causes, each cause's deposit address, the per-claim verification outcomes and
the public record of attestations, progress and help requests. Everything a
front end shows is rebuilt from its events.

**The registry holds no funds.** Gifts are plain stablecoin transfers (or
Sera.cx swaps) straight to the cause's deposit address. There is no escrow, no
claiming step and no refund. Verification is a public trust signal, not a gate
on money. See [docs/PLAN.md](../docs/PLAN.md) section 6 for the decision and
[ARCHITECTURE.md](../ARCHITECTURE.md) section 2 for the spec this implements.

The package exports the ABI (`@sera-causes/contracts/abi`) and the address
book (`@sera-causes/contracts/deployments/<chainId>.json`).

## Toolchain

solc-js 0.8.24, ganache 7 (in-process chain), ethers 6, `node:test`. No
Foundry, no Hardhat, no Docker, no network needed for anything but deploys.

```sh
pnpm install            # from the repo root
pnpm compile            # contracts/*.sol -> build/*.json ({ contractName, abi, bytecode })
pnpm test               # compile, then node --test on an in-process ganache chain
pnpm demo               # compile, seed 44 causes on a local chain, write build/demo-snapshot.json
pnpm check              # syntax check of every script and test
```

Compiler settings: optimizer on (200 runs), EVM `paris`. The deployed bytecode
is about 9.5 KB.

## Layout

| Path | What |
| --- | --- |
| `contracts/CauseRegistry.sol` | The registry. Plain-English NatSpec on every public function. |
| `contracts/mocks/MockTokens.sol` | `MockStable` (USDC-like) and `MockUSDT` (returns nothing from `transfer`). Not used by the registry or its tests; kept for the indexer's local gift tests. |
| `test/registry.test.mjs` | 16 tests covering listing, ownership, deposit address changes, per-claim verification, steward actions, the record and the council. |
| `scripts/compile.mjs` | solc-js compile into `build/`. |
| `scripts/deploy.mjs` | Deploy to a real network and write `deployments/<chainId>.json`. |
| `scripts/seed.mjs` | List the 44 researched causes from `../seed/` with attestations and help requests. Importable or CLI. |
| `scripts/snapshot.mjs` | Rebuild a JSON snapshot from events (the small indexer; the Postgres one lives in `../indexer`). Importable or CLI. |
| `scripts/demo-chain.mjs` | Local end-to-end run: deploy, roles, seed, finalise two causes, snapshot. |
| `deployments/` | One JSON per chain id: `{ address, block, council, deployedAt, ... }`. |

## The role model

| Role | Who | Can |
| --- | --- | --- |
| council | A multisig, set in the constructor | `setFinaliser`, `setSteward`, `setCouncil`. Nothing else. |
| finaliser | Steward multisig in phases 0 and 1, later a proven tally | `finaliseClaim`: record a claim outcome whose inputs anyone can recompute (`resultRoot` is the Merkle root of the published votes). |
| steward | Sera.cx steward multisig in phases 0 and 1 | `suspend`, `reinstate`, `closeBySteward`, `setRequiresCareLicence`. Every call carries a written reason or is re-evaluated on-chain. |
| owner | Whoever listed the cause, or was given it | `updateCause`, `setPayout`, `transferCauseOwnership`, `closeCause`, `postProgress`, `postNeed`, `closeNeed`. |
| anyone | Any wallet | `listCause`, `attest`, `pledge`, every view. Giving needs no contract call at all: send to the deposit address. |

There is no verifier role and no `verify` call. A cause becomes Verified only
when every required claim has been finalised as Verified.

## The deposit address (`payout`)

Each cause carries one address that gifts go to. In v1 this is an embedded
wallet created under the owner's Privy account for that cause; the seed script
uses the lister's own address until the charity claims the listing. Changing
it with `setPayout` resets claim C3 ("the deposit address belongs to the
organisation") to Open and drops a Verified cause to Listed, so a stolen owner
key cannot redirect gifts while keeping the badge.

## Claims and status

```
ClaimType    C1_Registered, C2_Current, C3_Payout, C4_WorkReal, C5_TaxExempt, C6_CareLicence, C7_Accounts
ClaimOutcome Open, Verified, NotVerified, NeedsMore
Status       None, Listed, Verified, Suspended, Closed
```

Required for Verified: C1 to C4, plus C6 when `requiresCareLicence[causeId]`
is set (children's homes and elderly care centres; set at listing, a steward
can toggle it). C5 and C7 are badges and never change status. The views
`isRequired`, `requiredClaimsMet` and `verifiedRequiredCount` expose the rule
so front ends show "2 of 4" without re-implementing it.

Suspended and Closed mean the cause takes no new activity on the site. They
carry no money semantics; what has already been given stays with the cause.

Rules the contract enforces:

- `finaliseClaim` on a Listed cause: when every required claim is Verified
  the cause becomes Verified, `verifiedAt` is set and `StatusChanged` carries
  the note `all required claims verified`.
- `finaliseClaim` setting a required claim to NotVerified on a Verified cause:
  the cause is Suspended with note `required claim overturned`.
- `finaliseClaim` setting a required claim back to Open or NeedsMore on a
  Verified cause: the cause drops to Listed with note `required claim
  reopened`. Not a fail.
- `setPayout` resets C3 to Open and drops a Verified cause to Listed.
- `reinstate` moves Suspended to Listed, then straight to Verified if the
  required claims still hold.
- `setRequiresCareLicence` re-evaluates: a Verified cause that now needs an
  unverified C6 drops to Listed; a Listed cause whose claims are now all met
  becomes Verified.
- Closed causes take no further results or status changes.

## Deploy to Sepolia

```sh
cd contracts
RPC_URL=https://sepolia.infura.io/v3/<key> \
DEPLOYER_KEY=0x<deployer private key> \
COUNCIL=0x<council multisig> \
pnpm deploy
```

This compiles, deploys `CauseRegistry(COUNCIL)` and writes
`deployments/11155111.json`. If the deployer is also the council you can pass
`FINALISER=0x...` and `STEWARD=0x...` to set the roles in the same run;
otherwise the council multisig calls `setFinaliser` and `setSteward` itself.

Then seed the researched causes (pin `../seed/causes` to IPFS first):

```sh
RPC_URL=... REGISTRY=0x<address> LISTER_KEY=0x... RESEARCH_KEY=0x... \
URI_BASE=ipfs://<cid>/ pnpm seed
```

The lister passes `needsCareLicence=true` for causes in the Children or
Elderly categories and its own address as the deposit address. Copy the
registry address into `.env` as `REGISTRY_ADDRESS` and
`VITE_REGISTRY_ADDRESS` for the indexer and the web app.

## Demo chain

`pnpm demo` starts ganache in-process, deploys the registry with a council, a
finaliser and a steward, lists the 44 causes from `../seed` with Sera
research's attestations and help requests, finalises C1 to C4 for Free Tree
Society and Make-A-Wish Malaysia so both are Verified, marks three more as
partly checked, and writes `build/demo-snapshot.json` from the event log.
Make-A-Wish is listed in the Children category, so the lister flags a care
licence; the demo steward then unflags it with a written attestation because
it grants wishes rather than running a care centre.

## Using the ABI from another package

```js
import abi from "@sera-causes/contracts/abi" with { type: "json" };
import sepolia from "@sera-causes/contracts/deployments/11155111.json" with { type: "json" };
```

Enum values match the Solidity order: `ClaimType` 0 to 6 is C1 to C7,
`ClaimOutcome` 0 to 3 is Open, Verified, NotVerified, NeedsMore, `Status` 0 to
4 is None, Listed, Verified, Suspended, Closed.

## Licence

The repository licence is MIT plus a settlement condition (see `../LICENSE`).
The registry contract itself is open: anyone may read it, build a front end on
it or deploy their own copy.
