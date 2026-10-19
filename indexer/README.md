# indexer

Reads `CauseRegistry` events plus the public signed-message store (EIP-712
paths, votes, boosts and challenges) and produces:

- causes with claim states,
- gSera ledger entries to post to g.sera.cx,
- reputation,
- highlight rounds and standings,
- the record feed.

Snapshots publish every 5 minutes behind a read API. Anyone can run their own
indexer and must get the same numbers. See
[docs/PRODUCT-BRIEF.md](../docs/PRODUCT-BRIEF.md) sections 11.3 and 11.5.
