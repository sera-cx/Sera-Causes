# Sera Causes v1 plan

**Status:** signed off by Douglas, 19 October 2026 (sections 1 to 4 and the
answers in section 5). Building. The product brief
([PRODUCT-BRIEF.md](PRODUCT-BRIEF.md), v1.1) stays the reference; this file
records where v1 departs from it and why.

## 1. Decisions taken on 19 October 2026

| Topic | Decision | Brief said |
| --- | --- | --- |
| Domain | causes.sera.cx, routes at the root | sera.cx/csd |
| Who can add a cause | Anyone with a wallet, no deposit | Same |
| Homepage | **Creator decides.** The person who adds a cause can switch "Show on homepage" on. The homepage is a live feed ordered by activity and recency, with the verification state on every card. No gSera contest for slots. | Weekly gSera boost rounds decide Cause of the week, Featured and Rising; unverified causes locked out of the top slots |
| Verification | **Full community model** from brief section 7: claims C1 to C7, evidence, signed verification paths, weighted votes, quorum and threshold, 72-hour challenge window, staked challenges, reputation, finaliser commits | Same (phase 1); phase 0 was stewards only |
| gSera | **Full integration at launch.** Gifts and helping credit real gSera on g.sera.cx. Needs the gSera repo changes in [GSERA-INTEGRATION.md](GSERA-INTEGRATION.md) | Same |
| Sharing | Share link with preview card, embeddable Give button, QR poster, creator dashboard | Only a share card after a gift |

## 2. What changes because of those decisions

### 2.1 Highlights are removed

- No `/highlights` page, no rounds, no boosts, no `commitRound` in the
  contract, no round tables in the database.
- gSera is still **earned** on gifts and helping (brief 6.2, 6.3) and still
  **spent** on challenge stakes (6.5). It is the same balance as g.sera.cx, so
  people can use it there too, except charity-tagged gSera cannot buy Lucky
  Draw tickets (6.6 option 1).
- Heat multiplier for gifts becomes: Urgent appeal 2.5x, every other cause
  1.0x. The 1.5x "Cause of the week" tier goes.
- Helper reward table is unchanged.

### 2.2 Homepage

- **Urgent appeal** (optional, one at a time): a steward can pin a cause to
  the top with a written reason, for floods and similar. Labelled "Urgent
  appeal, chosen by Sera.cx". This keeps brief 8.3.
- **Feed**: every cause whose creator switched "Show on homepage" on, ordered
  by recent activity (gifts, evidence, updates, claims finalised), newest
  first for ties. Cards always carry the status pill and the "x of 4 checks"
  bar, so an unverified cause on the homepage is never mistaken for a
  verified one.
- **New** rail: the latest causes added, whether or not they are on the feed.
- **Browse by cause** chips, **Help without money**, **How gSera works** and
  the numbers strip stay as in brief 10.1.
- The "Show on homepage" switch is off-chain. It is a creator preference,
  signed by the owner wallet and stored in the API, so it costs no gas and no
  contract change.
- Abuse guard: a steward can take a cause off the homepage with a public
  reason. Suspended and closed causes drop off automatically.

### 2.3 Sharing and the creator dashboard

| Feature | What it is | Where |
| --- | --- | --- |
| Share link | `causes.sera.cx/c/<id>-<slug>` with an Open Graph image rendered server-side (cause photo, name, status, given so far), share buttons for WhatsApp, Telegram, X, Facebook and copy link | Cause page and dashboard |
| Embeddable Give button | A script tag or iframe snippet that renders a Sera.cx-branded "Give to <cause>" button on any site and opens the give flow | `/embed/give/<id>` plus a snippet generator on the dashboard |
| QR poster | A4 PDF with the cause photo, name, QR to the cause page, and "Give in stablecoins on causes.sera.cx" | `/c/<id>/poster.pdf` from the dashboard |
| Creator dashboard | `/dashboard`: your causes, gifts received, escrow and claimable balance, homepage switch, share tools, post updates and live stream links, help requests, claim the listing invite, payout wallet (with the C3 warning) | New route |

### 2.4 Contract (v1.1, revised)

Keep everything in [ARCHITECTURE.md](../ARCHITECTURE.md) section 2 except
`commitRound` and the `RoundCommitted` event, which are dropped. Urgent
appeal is an off-chain steward action recorded in the API, not on-chain.

### 2.5 Site map (revised)

```
/                          Home: urgent appeal, feed, new, browse, help, how gSera works
/causes                    All causes, filters
/c/<id>-<slug>             Cause page
/c/<id>/share              Share tools (link, buttons, embed snippet, poster)
/give/<id>                 Give sheet
/add                       Add a cause
/dashboard                 Creator dashboard (signed in)
/verify                    Verification hub
/verify/<causeId>/<claim>  Claim workspace
/me                        My gSera, reputation, gifts, contributions
/leaderboards              Givers, helpers, causes
/technology                How it works
/rules                     Rules, points table, FAQ, terms
/embed/give/<id>           Iframe target for the embeddable button
```

## 3. Things the brief relies on that are not confirmed

| Dependency | Needed for | Owner | Status |
| --- | --- | --- | --- |
| gSera partner endpoints (credit, spend, reverse, wallet) and the `source` tag | gSera at launch | Claude, as a PR in the gSera repo for Douglas to review | Change request in GSERA-INTEGRATION.md. Confirmed |
| Privy app for causes.sera.cx | Sign-in | Douglas | Not created. Needs `PRIVY_APP_ID` and secret |
| Sera.cx API key and secret | Settlement of cross-stablecoin gifts | Douglas | Not provided. Testnet host set to `api.testnet.sera.cx` (sera-pay and rotor agree; sera-mcp differs) |
| Steward multisig members and threshold | Finaliser and steward roles | Douglas | Brief 17.2, still open. Sepolia uses a single steward key for now |
| Accepted stablecoins at launch | Contract token list | Douglas | USDT, USDC, XSGD, MYRT. Confirmed |
| Registry chain | Deploy target | Douglas | Sepolia now, Ethereum mainnet at launch. Confirmed |
| KYT/KYA screening | Anti-gaming rules in 6.7, voter eligibility in 7.5, every gift | Build, then Douglas | **kyt.sera.cx**, Sera's own service. Its repo is not public yet, so v1 ships a stub behind `createKytClient` with a provisional wire format in `packages/sera-settlement/src/kyt.ts`, to be corrected when the API is shared |
| IPFS pinning | Profiles and evidence hashes | Build | Proposed: API serves files with hashes recorded on-chain now; pin to IPFS before mainnet |
| Email provider | Notifications in brief 14 | Build | **Resend** |
| Malaysian counsel | Fundraising rules, PDPA, gSera not a security | Douglas | Brief 16 and 18 gate launch on this |
| Independent security review | Mainnet | Douglas | Before mainnet, not before Sepolia |
| Hosting | Production | Douglas | Docker on Linode, same pattern as sera.cx and gSera. Confirmed |

## 4. Build order

Each step ends with something you can see or run.

| Step | Delivers | You can check |
| --- | --- | --- |
| A. Rules and contract | `packages/shared` (all constants and pure rules, recompute script), `contracts/` v1.1 without rounds, 20+ tests, local demo chain with the 44 causes | `pnpm test`, `pnpm demo` |
| B. Web app on mock data | Every page in section 2.5 on the seeded causes, demo sign-in, give flow, verification hub, dashboard, share tools | localhost:3000 |
| C. Indexer and API | Postgres, chain listener, signed message store, finaliser CLI, settlement adapter wired, Sepolia deployment, web app switched from mock to API | Sepolia explorer, localhost against real data |
| D. Live integrations | Privy sign-in, gSera live credit and spend, Chainalysis screen, OG images, QR poster, embed button, email | Staging |
| E. Launch readiness | Rules page and terms for counsel, security review package, mainnet deploy script, Docker and deploy workflow | Checklist in brief 20 |

## 5. Answers from Douglas, 19 October 2026

1. Claude implements the gSera-side change as a PR in the local gSera repo.
2. **Launch in advisory mode (brief phase 0):** votes and tallies are shown,
   stewards finalise every claim with the finaliser CLI. Phase 1 (votes
   decide) is a configuration switch, `VERIFICATION_MODE=advisory|community`.
3. Defaults accepted except: KYT/KYA through kyt.sera.cx, email through
   Resend.

## 6. Money model, revised 19 October 2026 (second round of decisions)

Douglas's answers: no escrow, no refunds, Sera.cx-listed stablecoins only at
launch, sign-in through Sera's existing Privy app.

| Topic | v1 | Brief said |
| --- | --- | --- |
| Cause address | Each cause has its own deposit address: an embedded wallet created under the owner's Privy account for that cause. Shown with a QR on the give page and in share tools | Gifts go into the registry contract's escrow |
| Who can give | Anyone, signed in or not. From the site: a stablecoin transfer, or a Sera.cx swap with the cause address as recipient when currencies differ. Directly: any wallet or exchange sends a listed stablecoin to the address | Only through `donate` on the site |
| Escrow and claiming | None. The owner can use funds from day one. Verification is a public trust signal, not a gate | Only Verified causes could claim |
| Refunds | None. Gifts are final | 90-day refund when never verified |
| Accepted tokens | Sera.cx-listed stablecoins (USDT, USDC, XSGD, MYRT at launch). Other ERC-20s show as held balances the owner can withdraw; aggregator conversion is phase 2 | Council-managed token list in the contract |
| Conversion | Treasury setting per cause: keep one currency (auto-convert on arrival through Sera.cx, using Privy delegated signing on the cause wallet) or hold and convert manually from the dashboard | Charity claims in the given stablecoin |
| Public record | Every transfer in, conversion, withdrawal and update is on the cause page, from on-chain data | Same |
| gSera on gifts | Credited to the sender wallet on arrival once KYT is clear. No vesting (there is nothing to refund). Owner and payout wallets excluded; US$1,000 per wallet per cause per 30 days cap kept | Pending until claim or 90 days |
| Contract | Registry only: list, update, ownership, deposit address (payout), status, claims, finaliser and steward roles, attest, needs, pledges, progress. `donate`, `claim`, `refund`, `held`, `givenBy`, `totalGiven`, `acceptedToken`, `REFUND_WINDOW` and the token events are removed | Escrow in the contract |
| Media | Photos plus embeddable video links (YouTube, TikTok, Instagram, X, any oEmbed URL) in a gallery on the cause page, managed from the dashboard | Live stream link only |
| Documents | Uploaded during add-a-cause against C1, C5 or C6, with a licensed, registered or informal selector | Evidence uploaded per claim later |

Dependency added: Privy embedded wallets per cause and delegated signing for
auto-convert. If delegated signing is unavailable for a wallet (for example an
external wallet owner who declined it), that cause falls back to manual
conversion.
