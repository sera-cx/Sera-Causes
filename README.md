# Sera Causes

**Care. Share. Donate.** Open-source crypto giving, settled in stablecoins on
[Sera.cx](https://sera.cx).

Sera Causes is the code behind **Care Share Donate (CSD)** at **causes.sera.cx**.
Anyone can add a cause. Anyone can give to it in stablecoins. Gifts wait in
escrow until the community has verified the charity, then the charity claims
them. Giving and helping earn gSera points, which steer what the site
highlights each week. Every cause, piece of evidence, vote and gift is recorded
on a public cause registry on Ethereum.

The full product and build brief is in
[docs/PRODUCT-BRIEF.md](docs/PRODUCT-BRIEF.md). Read it before contributing.

> Status: scaffold. The v0.1 registry contract, tests, indexer and 44 seeded
> Malaysian causes described in the brief are being brought into this repo.
> Governance, licence and CI guard are in place now.

## How it works

```
Giver wallet (stablecoins, any supported chain)
        │
        ▼
  apps/web  ──►  packages/sera-settlement  ──►  Sera.cx settlement
  (forkable)     (protected: quote, convert     (when the cause takes a
                  and settle via Sera.cx)        different stablecoin)
        │
        ▼
  contracts/CauseRegistry  (Ethereum: causes, claims, escrow, refunds, rounds)
        │
        ▼
  indexer/  ──►  public read API and the record feed
```

- **Causes** are listed by anyone and verified one claim at a time
  (registration, current status, payout wallet, real work). Helpers write
  verification paths showing exactly how they checked. The community votes,
  with a challenge window before anything is final.
- **Gifts** sit in the registry's escrow, not with Sera.cx. Only verified
  causes can claim. If a cause is not verified within 90 days, givers can take
  their gift back.
- **gSera** is earned on gifts at the same rate as takers on g.sera.cx
  (100 per US$1 with multipliers) and on helping. It is spent to boost causes
  in the weekly highlight round. Charity-tagged gSera cannot buy Lucky Draw
  tickets.
- **Settlement** of any cross-stablecoin gift runs through Sera.cx. That layer
  is protected by the licence. Everything else is yours to fork.

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
