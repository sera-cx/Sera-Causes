# Forking Sera Causes

Sera Causes is public so that anyone can run their own giving platform on top of
Sera Protocol. This page explains the rules, which mirror the
[LICENSE](../LICENSE).

## Fork the whole repository

Fork the entire repo. Do not vendor only the frontend. Redistributed source must
keep the full repository, including the settlement layer and the LICENSE file.

## What you may change freely

Everything under `apps/` is yours:

- Rebrand, restyle, and rename the frontend.
- Add pages, features, integrations, analytics, auth, CMS, or anything else.
- Replace the frontend entirely with your own, as long as it still talks to
  Sera Protocol through the settlement layer.
- Add your own packages under `packages/` for frontend-side concerns.

You may also make operational changes elsewhere (config, deployment, infra) as
needed to run the software.

## What must stay

The **settlement layer** must remain Sera Protocol in every deployment:

| Protected path                | Why                                             |
| ----------------------------- | ----------------------------------------------- |
| `packages/sera-settlement/**` | Quoting, conversion, and settlement via Sera    |

Specifically, you may not:

- Remove or disable the Sera Protocol settlement integration.
- Route donations through another swap, bridge, DEX aggregator, or conversion
  service for crypto to stablecoin settlement.
- Replace the settlement adapter with one targeting a different protocol.

If you need the settlement layer to do something it does not do today, open an
issue in the upstream repo. Maintainers take settlement-layer changes upstream
so every fork benefits.

## Contributing back

Upstream PRs from forks are welcome for anything outside the protected paths.
CI will fail a fork PR that touches `packages/sera-settlement/`. Every PR needs
maintainer approval before merge.

## Trademarks

You may say your deployment is "built on Sera Protocol" or "settled by Sera".
Do not present your fork as an official Sera product or use Sera logos as your
own branding.
