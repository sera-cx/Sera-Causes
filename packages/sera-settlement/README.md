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
