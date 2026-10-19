# contracts

The Care Share Donate cause registry on Ethereum.

Planned contents, per [docs/PRODUCT-BRIEF.md](../docs/PRODUCT-BRIEF.md)
section 11:

- `CauseRegistry.sol` (v0.1 exists with 10 passing tests): list, update,
  payout change (drops Verified), owner transfer, attest, donate into escrow per
  cause and stablecoin, claim, refund after 90 days or on suspend/close,
  progress posts, help requests and pledges, council-managed accepted
  stablecoins.
- Changes for v1.1: per-claim `finaliseClaim`, automatic Verified when all
  required claims are final, `commitRound` for weekly highlights, and a
  finaliser role replacing the verifier role.

The registry is fully open. Anyone may build their own front end on it.
Escrow, claim and refund logic must pass an independent security review before
mainnet.
