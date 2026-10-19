# Sera Causes

**Care. Share. Donate.** Open-source crypto giving, settled in stablecoins on
[Sera.cx](https://sera.cx).

Sera Causes is the code behind **Care Share Donate (CSD)** at **causes.sera.cx**.
Anyone can add a cause, upload the documents that prove it is real, and share
it anywhere. Anyone can give to it in stablecoins, from the site or by sending
straight to the cause's own address. The community checks each cause in the
open, claim by claim. Giving earns gSera points on g.sera.cx; helping earns
Care XP on community.sera.cx. Every gift, conversion and update is a public
record.

Start with [docs/PLAN.md](docs/PLAN.md), which records the v1 decisions, then
the original brief in [docs/PRODUCT-BRIEF.md](docs/PRODUCT-BRIEF.md). Where
they differ, the plan wins.

> Status: scaffold. The v0.1 registry contract, tests, indexer and 44 seeded
> Malaysian causes described in the brief are being brought into this repo.
> Governance, licence and CI guard are in place now.

## How it works

```
Giver (any wallet or exchange, signed in or not)
        │  stablecoin transfer, or a Sera.cx swap delivered to the cause
        ▼
  Cause deposit wallet (one per cause)
        │                                   packages/sera-settlement (protected)
        ├── auto-convert or manual convert ──►  Sera.cx settlement
        ▼
  contracts/CauseRegistry  (Ethereum: causes, claims, roles, updates)
        │
        ▼
  indexer/  ──►  gifts from on-chain transfers, public record, read API
        │
        ▼
  apps/web  (causes.sera.cx, forkable)
```

- **Causes** are listed by anyone and verified one claim at a time
  (registration, current status, deposit wallet, real work). Helpers write
  verification paths showing exactly how they checked. The community votes,
  with a challenge window before anything is final. Verification is a public
  trust signal, not a gate on the money.
- **Gifts** go straight to each cause's own deposit address. The owner keeps
  one currency (auto-converted on arrival through Sera.cx) or holds what
  arrives and converts when they choose. Gifts are final.
- **gSera** is earned on gifts at the same rate as takers on g.sera.cx
  (100 per US$1 with multipliers) and on helping. Charity-tagged gSera cannot
  buy Lucky Draw tickets.
- **Settlement** of every conversion runs through Sera.cx. That layer is
  protected by the licence. Everything else is yours to fork.

## Repository layout

```txt
apps/
  web/                  Frontend for causes.sera.cx (forkable, rebrandable)
packages/
  sera-settlement/      Sera.cx settlement adapter (protected)
contracts/              CauseRegistry.sol, tests, deploy scripts
indexer/                Reads registry events and signed messages, publishes snapshots
docs/
  PRODUCT-BRIEF.md      The product and build brief (v1.1)
  FORKING.md            What forks may and may not change
.github/
  CODEOWNERS            Maintainer review is required on every PR
  workflows/            CI, including the settlement-layer guard
```

## Forking and building on Sera Causes

Fork the whole repo and run your own giving site. Read
[docs/FORKING.md](docs/FORKING.md) first. In short:

- Change, replace, or add anything in `apps/`.
- Build your own front end on the registry. That is the point of it.
- Keep `packages/sera-settlement/` as the settlement layer. Do not swap in
  another swap, bridge, or conversion protocol.

## Contributing

Pull requests are welcome from anyone. Every PR requires approval from a Sera
maintainer before it can merge. See [CONTRIBUTING.md](CONTRIBUTING.md) and
[GOVERNANCE.md](GOVERNANCE.md).

PRs opened from forks that modify `packages/sera-settlement/` will fail CI.
Propose settlement-layer changes in an issue first so a maintainer can take
them up.

Copy rules for anything user-facing: "Sera.cx" not "Sera", British spelling,
no em dashes, "stablecoins" for the currency, short sentences.

## Security

Please report vulnerabilities privately. See [SECURITY.md](SECURITY.md).

## Licence

Sera Causes is released under the **Sera Causes License 1.0**, which is the MIT
License plus a Settlement Layer Condition: deployments and redistributions must
keep Sera.cx as the underlying settlement protocol for all crypto to stablecoin
conversion and settlement. Everything else, including the frontend, is as
permissive as MIT.

This is a source-available licence, not the OSI-approved MIT License. Read the
full text in [LICENSE](LICENSE).
