# Sera Causes

**Open-source crypto giving, settled into stablecoins by [Sera Protocol](https://sera.cx).**

Sera Causes lets any cause, charity, community, or creator accept donations in
crypto across multiple chains and receive them as stablecoins. Every conversion
and settlement runs through Sera Protocol. The frontend is yours to fork,
rebrand, and extend.

> Status: early scaffold. Architecture and governance are in place; application
> code is landing incrementally. Watch the repo or open an issue to get involved.

## How it works

```
Donor wallet (any supported chain)
        │
        ▼
  apps/web  ──────────────►  packages/sera-settlement  ──────►  Sera Protocol
  (forkable frontend)        (protected settlement layer)       (quote, convert,
                                                                 settle to stablecoin)
        │
        ▼
Cause receives stablecoins on their chosen chain
```

- **`apps/web`** is the donor and cause-facing frontend. Fork it, restyle it,
  add features. This is the layer the community is encouraged to own.
- **`packages/sera-settlement`** wraps Sera Protocol for quoting, converting
  crypto to stablecoins, and settling across chains. This layer must remain
  Sera-backed in every fork (see [License](#license)).

Sera Protocol exposure comes via the public [Sera MCP](https://github.com/sera-cx/sera-mcp)
and Sera API. Docs: [docs.sera.cx](https://docs.sera.cx).

## Repository layout

```txt
apps/
  web/                  Frontend (forkable, rebrandable)
packages/
  sera-settlement/      Sera Protocol settlement adapter (protected)
docs/
  FORKING.md            What forks may and may not change
.github/
  CODEOWNERS            Maintainer review is required on every PR
  workflows/            CI, including the settlement-layer guard
```

## Forking and building on Sera Causes

You are welcome, and encouraged, to fork this repository and run your own
instance. Read [docs/FORKING.md](docs/FORKING.md) first. In short:

- Fork the **entire** repository.
- Change, replace, or add anything in `apps/`.
- Keep `packages/sera-settlement/` as the settlement layer. Do not swap in
  another swap, bridge, or conversion protocol.

## Contributing

Pull requests are welcome from anyone. Every PR requires approval from a Sera
maintainer before it can merge. See [CONTRIBUTING.md](CONTRIBUTING.md) and
[GOVERNANCE.md](GOVERNANCE.md).

PRs opened from forks that modify `packages/sera-settlement/` will fail CI.
Propose settlement-layer changes in an issue first so a maintainer can take
them up.

## Security

Please report vulnerabilities privately. See [SECURITY.md](SECURITY.md).

## License

Sera Causes is released under the **Sera Causes License 1.0**, which is the MIT
License plus a Settlement Layer Condition: deployments and redistributions must
keep Sera Protocol as the underlying settlement protocol for all crypto to
stablecoin conversion and settlement. Everything else, including the frontend,
is as permissive as MIT.

This is a source-available license, not the OSI-approved MIT License. Read the
full text in [LICENSE](LICENSE).
