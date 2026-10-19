# Care Share Donate on Sera.cx: product and build brief

**Version:** 1.1, 19 October 2026 (gSera aligned with g.sera.cx)
**Owner:** Douglas Gan
**Scope:** causes.sera.cx only (brief originally written for sera.cx/csd; all `/csd/...` paths below map to the root of causes.sera.cx). YouApp and other front ends are out of scope for this brief. The registry stays shared so they can be added later without rework.
**Status:** Ready to design and build. Open decisions are listed in section 17.

---

## 1. One-paragraph summary

Care Share Donate (CSD) is a giving hub on Sera.cx. Anyone can add a cause. Anyone can give to it in stablecoins. Gifts wait in escrow until the community has verified the charity, then the charity claims them. Giving earns **gSera points** on the same logic as takers on g.sera.cx: 100 gSera per US$1, with multipliers. People spend gSera points to decide which causes get highlighted on the site each week. Verification is done in the open: the charity or a helper uploads evidence, helpers check it and write down exactly how they checked (the verification path), and the community votes on whether it is verified. Everything is recorded on a public, open-source cause registry on Ethereum.

Tagline: **Care. Share. Donate.**

---

## 2. Goals and non-goals

### Goals

1. Get real Malaysian causes in front of stablecoin holders, starting with the 44 already researched (Kasih Turtle Conservation Project first).
2. Make trust visible. A donor should see, for any cause, what has been checked, by whom, how, and what is still open.
3. Let people help without money: adding causes, uploading evidence, checking evidence, voting, translating, visiting.
4. Reward participation with gSera points, and let those points steer what the site highlights.
5. Show stablecoins doing something useful and visible, settled on Sera.cx.

### Non-goals (for this version)

- No YouApp front end, no ringgit DuitNow payout flow, no YouApp branding.
- No new token. CSD uses the existing gSera points from g.sera.cx; it adds no transfer, sale or cash-out.
- No tax receipts issued by Sera.cx. Receipts are the charity's job where it holds LHDN approval.
- No fiat card payments. Stablecoins only at launch (other assets are phase 2, see section 15).

---

## 3. Principles

1. **Charity first, technology second.** The front page is about causes and people. The registry, escrow and voting live on a separate Technology page and in plain-language "how this works" links.
2. **Open by default.** Anyone can add a cause, upload evidence, review, vote and see every record. Nothing is decided in private once the community phase starts.
3. **Money only moves to verified causes.** Listing is open. Claiming is not.
4. **Show the working.** A "verified" label is worthless without the path behind it. Every verification shows its steps, sources and the people who checked.
5. **Points reward help, not wealth alone.** Giving earns points, but so does checking evidence well. Highlight voting is weighted so one large holder cannot buy the front page.
6. **Non-custodial.** Gifts sit in the registry contract, not with Sera.cx. Sera.cx cannot move them.

---

## 4. Roles

| Role | Who | What they can do |
| --- | --- | --- |
| Visitor | Anyone, no wallet | Browse causes, read profiles, evidence, verification paths and the full record |
| Giver | Anyone with a wallet | Give stablecoins, earn gSera like a taker, spend gSera on highlights, take a gift back when refundable |
| Lister | Anyone with a wallet | Add a cause, edit its profile until the charity claims it, post help requests |
| Charity | The organisation behind a cause | Claim its listing, upload its documents, set its payout wallet, post updates and live streams, claim funds once verified |
| Helper | Anyone with a wallet | Upload evidence, write verification paths, translate, visit, take on help requests |
| Voter | Wallets that meet the voting bar (section 7.6) | Vote on whether a claim is verified |
| Challenger | Anyone who stakes gSera | Challenge a verification with counter-evidence during the challenge window |
| Steward | Sera.cx team multisig (phase 0 and 1 only) | Resolve disputes, act on reports, pause a cause in an emergency. Every steward action is public with a written reason |

---

## 5. The cause lifecycle

```
Listed ─▶ Evidence in ─▶ Community checked ─▶ Verified ─▶ Claiming
   │                                              │
   └──────────── 90 days with no Verified ────────┴─▶ Refunds open
```

| Stage | Meaning | What the site shows | Can receive gifts | Can claim |
| --- | --- | --- | --- | --- |
| Listed | Someone added it | "New" pill, "Not checked yet" | Yes, into escrow | No |
| Evidence in | At least one piece of evidence uploaded | "Evidence in" | Yes | No |
| Community checked | At least one required claim verified (usually "organisation exists") | "Partly verified" with a count, e.g. 2 of 4 | Yes | No |
| Verified | All required claims verified (section 7.2) | "Verified" | Yes | Yes |
| Suspended | A challenge succeeded or a steward paused it | "Paused" with the reason | No | No, refunds open |
| Closed | Owner or steward closed it | "Closed" | No | No, refunds open |

**Refund rule (already in the contract):** if a cause has not been Verified for 90 days since listing (or since it last lost Verified), each giver can take back what they gave, capped at what is still in escrow. Paused and closed causes open refunds straight away.

**Payout safety (already in the contract):** changing the payout wallet removes Verified. The "payout wallet controlled by the charity" claim must then be verified again.

---

## 6. gSera points

### 6.1 How gSera works today (g.sera.cx, checked 19 Oct 2026)

| Who | Earns | Formula |
| --- | --- | --- |
| Takers (swaps) | 100 gSera per US$1, times a compound multiplier, max 10× | size_usd × heat × volume × streak × power |
| Makers (filled liquidity) | Flat 100 gSera per US$1 filled, 1× only (limited time to 22 Aug 2026) | No multipliers, filled volume not deposits |
| Referrals | 88 gSera to both sides on the friend's first swap | |

Multipliers for takers: **Heat Index** 1.0× to 4.0× by pair tier (S 4.0×, A 2.5×, B 1.5×, C 1.0×, published monthly). **Volume tier** 1.0× to 1.6× on cumulative season volume (peaks at 1.6× from US$100k to US$10M). **Streak** 1.0× to 1.3×, weekly, Monday 00:00 to Sunday 23:59:59 UTC, resets if you miss a week. **Power Hour** 1.0× to 1.2× in the currency's regional session. Earning volume is capped at US$1,000,000 per pair per UTC day. Same-currency stablecoin swaps earn nothing.

Uses today: Lucky Draw (88 gSera per ticket, winners paid in gSera, 6% of each pool burned) and leaderboards. Spending burns only the spendable balance and never lowers lifetime-earned rank. Seasons: Season 1, volume tiers reset each season.

### 6.2 Donors earn like takers

A donor is a taker whose trade goes to a cause. Same balance, same leaderboard, same season, same base rate.

**gSera per gift = gift_usd × 100 × heat × volume × streak**

| Multiplier | For gifts | Range |
| --- | --- | --- |
| Base | 100 gSera per US$1, measured at the value the cause receives | Same as takers |
| Heat | Cause heat instead of pair heat: Urgent appeal 2.5×, Cause of the week 1.5×, all other causes 1.0× | Published with each round |
| Volume tier | Same season volume ladder as takers. Gifts count towards it, and swaps count towards a donor's tier | 1.0× to 1.6× |
| Streak | Same weekly streak. A gift in a week keeps your streak alive | 1.0× to 1.3× |
| Power Hour | Not applied to gifts | 1.0× |
| Compound cap | Same as takers | Max 10× |

Example: a US$50 gift to the Cause of the week, by someone on a 1.2× volume tier and a 1.1× streak, earns 50 × 100 × 1.5 × 1.2 × 1.1 = **9,900 gSera**.

**No double counting.** A gift that settles through a swap on Sera.cx (for example USDT given to a cause that takes MYRT) earns once, at the donor rate. The swap leg does not also earn taker gSera.

**Same-currency rule does not apply to gifts.** A USDT gift to a cause that takes USDT still earns, because the point is the gift, not the swap.

### 6.3 Helpers earn too (proposed, tunable)

Helping earns on the same scale, so a careful helper can keep up with a small donor.

| Action | gSera | When it is credited |
| --- | --- | --- |
| Add a cause that later reaches Verified | 2,500 | On Verified |
| Write a verification path the final outcome agrees with | 1,000 | When the claim is final and the challenge window has closed |
| Vote in line with the final outcome | 100 | Same |
| Help request fulfilled (confirmed by the charity) | 500 | On confirmation |
| Successful challenge | Stake back + 2,000 | When the challenge is upheld |

### 6.4 Pending gSera on gifts

Takers' gSera is credited at once. Gifts are different because a gift to an unverified cause can be taken back. So:

- gSera from a gift shows as **pending** straight away and becomes **spendable** when the cause claims the gift, or when 90 days pass with no refund taken.
- If the gift is refunded, its pending gSera is cancelled.
- Pending gSera counts towards lifetime rank and leaderboards only once it vests.

### 6.5 What gSera is spent on in CSD

- **Boost a cause** in the weekly highlight round (section 8). Spent gSera is burned.
- **Stake to challenge** a verification (section 7.8). Returned if you win, burned if you lose.
- Spending never lowers lifetime-earned rank, same as g.sera.cx.

### 6.6 gSera and the Lucky Draw

gSera earned from gifts lands in the same spendable balance that buys Lucky Draw tickets on g.sera.cx. "Give to charity, win in a draw" is a bad look, and charity-linked draws can fall under gaming and lotteries rules. Options, in order of preference:

1. Tag gSera by source. gSera earned from gifts and helping can be spent on boosts and challenges but not on Lucky Draw tickets. Simple to explain: "Charity gSera goes back to charity."
2. Keep one balance, and keep CSD pages free of any Lucky Draw promotion or link.
3. Keep one balance with no restriction. Not recommended.

Recommendation: option 1. It needs one extra field (source) on each ledger entry.

### 6.7 Anti-gaming rules

| Risk | Rule |
| --- | --- |
| Give, earn, refund | Gift gSera vests only after claim or after the refund window passes unused |
| Charity giving to itself to farm points | Wallets linked to the cause's owner or payout wallet earn no gSera on that cause. Linked = same address, funded directly from it within 30 days, or flagged by Sera.cx KYT clustering |
| One wallet pouring into one cause | gSera-earning gifts capped at US$1,000 per wallet per cause per 30 days. Gifts above the cap are recorded but earn 0×, the same way the taker daily cap works |
| Many fake wallets | Voting and boosting need a wallet that has passed KYT and has at least one vested gift or one accepted contribution |
| Rubber-stamp votes | Vote rewards are small. Voting against the final outcome costs reputation (section 6.8) |
| Laundering through gifts | All gifts pass Sera.cx KYT/KYA screening. Flagged gifts are held and earn no gSera |

### 6.8 Reputation (separate from gSera)

Reputation measures how reliable someone's checking has been. It is earned only from verification work: paths and votes that match final outcomes. It cannot be spent, transferred or bought with gifts. It sets vote weight (section 7.6). Wrong calls later overturned by a challenge reduce it.

## 7. Verification

### 7.1 Idea in one line

Evidence goes up, helpers show exactly how they checked it, the community votes, and a short challenge window lets anyone object before the result is final.

### 7.2 Claims: what gets verified

A cause is verified one claim at a time. Each claim is a single fact with a clear yes or no.

| Claim | Required for Verified | What counts as proof | Where to check (verification paths library) |
| --- | --- | --- | --- |
| C1. The organisation exists and is registered | Yes | Registration number and legal name match an official register | Registrar of Societies (ROS) for societies (PPM numbers); SSM for companies limited by guarantee; Legal Affairs Division (BHEUU) for trusts (PPAB numbers); state registries for Sabah and Sarawak societies |
| C2. Registration is current | Yes | Register shows active status, or latest annual return accepted | Same registers, plus the charity's latest annual return or AGM minutes |
| C3. The payout wallet belongs to the organisation | Yes | A message signed by the payout wallet, published on the organisation's official website or verified social account, plus a matching board resolution | The org's own site or account; on-chain signature check |
| C4. The work is real and current | Yes | At least two independent dated sources from the last 12 months: site visit, news, photos with location and date, partner confirmation | News archives, the org's channels, a helper's site visit |
| C5. Tax-exempt approval (s44(6)) | No, separate badge | LHDN approval reference and validity period that match LHDN's own search | LHDN "Semakan Kelulusan Derma" search: https://www.hasil.gov.my/institusi-organisasi-tabung/semakan-kelulusan-derma/ |
| C6. Care licence where the law needs one | Required for children's homes and elderly care centres | Registration under the Care Centres Act 1993 with the Department of Social Welfare (JKM) | JKM, the licence certificate on site |
| C7. Accounts are published | No, separate badge | Audited accounts or an annual report within the last 2 years | The org's site, the register |

Verified = C1, C2, C3, C4 (and C6 where it applies). C5 and C7 show as extra badges.

### 7.3 Evidence

- Anyone can upload evidence to a claim: the charity, the lister, any helper.
- Evidence types: document (PDF or image), link, photo, video, signed wallet message.
- **Personal data is redacted before upload.** The upload form must warn and offer a redaction tool for IC numbers, home addresses, personal phone numbers and signatures. Files with unredacted personal data are rejected by moderation.
- Files are stored on IPFS. Their hashes are recorded on-chain so nobody can swap a file later.
- Each piece of evidence shows who uploaded it, when, and its hash.

### 7.4 The verification path

This is the core of the trust model. A helper who checks a claim writes down how they checked it, in a fixed template, so anyone can repeat the check and get the same answer.

**Verification path template**

| Field | Example (Turtle Conservation Society of Malaysia, claim C1) |
| --- | --- |
| Claim | C1: The organisation exists and is registered |
| Source | Registrar of Societies public search (name of the official tool) |
| Steps | 1. Opened the ROS public search. 2. Searched the registration number "PPM-001-11-10062011". 3. Opened the result. |
| Exact search used | `PPM-001-11-10062011` |
| What I found | Name: Persatuan Pemuliharaan Tuntung, Kura-Kura dan Penyu Malaysia. Status: [as shown]. Registered: [date]. State: Terengganu |
| Matches the profile? | Yes: legal name and number match the cause profile |
| Screenshot | Uploaded, hash `0x…` |
| Checked on | 19 Oct 2026, 14:05 MYT |
| Result | Verified |
| Caveats | The register does not show office-bearers publicly |
| Conflict of interest | None. I have no relationship with this organisation |

Rules:
- One claim per path. A path without a source, steps and a dated screenshot cannot be submitted.
- Paths are public, permanent and signed by the helper's wallet.
- Several helpers can write paths for the same claim. Agreeing paths from different helpers count for more (shown as "3 independent checks").
- A path can also conclude "Not verified" or "Could not check". Those are useful and earn the same points if the final outcome agrees.

### 7.5 Voting

Once a claim has at least **two** independent paths, voting opens.

- **Who can vote:** a wallet that has passed KYT, and has either at least one vested gift or at least one accepted contribution (a path, translation or fulfilled help request). One vote per wallet per claim.
- **Choices:** Verified, Not verified, Needs more evidence.
- **Voters must read the paths first.** The vote button sits under the paths and opens only after the voter has expanded them.
- **Voting period:** 5 days, or earlier once quorum and threshold are met and at least 48 hours have passed.
- **Quorum:** total vote weight of at least 7.
- **Threshold:** at least 75% of vote weight says Verified.
- **Outcome "Needs more evidence"** reopens the claim for new evidence and paths. It is not a fail.

### 7.6 Vote weight

`weight = 1 + min(4, log2(1 + reputation))`, so between 1 and 5.

- New voters count as 1.
- Reputation (section 6.8) grows by 1 for each vote and each path that matches a final, unchallenged outcome. It drops by 3 for each that a successful challenge overturns.
- gSera balance does **not** add vote weight. Points cannot buy verification.

### 7.7 Finalising

When voting passes, the claim enters a **72-hour challenge window**. If nobody challenges, the claim is final. The result goes on-chain (section 11), points and reputation are settled, and the cause's stage updates.

### 7.8 Challenges

- Anyone can challenge a verified or pending-final claim by staking **5,000 gSera** and uploading counter-evidence with their own verification path.
- A challenge reopens voting on that claim for 5 days, with the challenge shown at the top.
- If the challenge wins: the claim flips, the challenger gets their stake back plus 2,000 gSera, and the people whose paths and votes were overturned lose reputation. If the claim was required, the cause loses Verified and refunds open.
- If the challenge loses: the stake is burned.

### 7.9 Stewards (temporary)

During phases 0 and 1 (section 16), a Sera.cx steward multisig can:
- finalise or overturn a claim where voting is stuck, or where there is clear fraud or a legal problem;
- pause a cause immediately on a credible report of fraud, harm or a legal notice;
- remove evidence that contains personal data or defamatory content.

Every steward action is posted on the cause's record with a written reason. Steward powers shrink as the community grows: the target is that by phase 2 stewards only handle legal takedowns.

---

## 8. Highlights: what gets the spotlight

### 8.1 Slots

| Slot | Where | How many | Who is eligible |
| --- | --- | --- | --- |
| Cause of the week | Home page, under the hero | 1 | Verified causes only |
| Featured | Home page, first row of causes | 6 | Community checked or Verified |
| Rising | Home page, "New and rising" rail | 6 | Any cause, including newly listed |
| Category leader | Top card of each category | 1 per category | Community checked or Verified |

Unverified causes can rise on the "New and rising" rail, which is clearly labelled as such, but cannot take Cause of the week or Featured. That stops someone boosting an unchecked cause into the most trusted spot.

### 8.2 Rounds

- One round per week, Monday 00:00 to Sunday 23:59 UTC.
- During the round, anyone eligible boosts causes by spending gSera (minimum 1,000 per boost).
- **Score per cause = the sum, across wallets, of the square root of gSera each wallet spent on it this round.** One wallet spending 100,000 gSera adds 316 to the score. 100 wallets spending 1,000 each add 3,162. Breadth beats size.
- At the round's end, the top causes fill the slots for the following week. Ties go to the cause with more distinct boosters, then to the cause with older evidence.
- The round's results are committed on-chain (section 11) and shown on the Highlights page with full standings.
- A cause cannot hold Cause of the week two weeks in a row. It drops to Featured if it wins again.

### 8.3 Editorial floor

Stewards can reserve **one** Featured slot per round for an urgent appeal, such as a flood. It is labelled "Urgent appeal, chosen by Sera.cx", with the reason shown.

---

## 9. Site map for sera.cx/csd

```
/csd                     Home (charity first)
/csd/causes              All causes, filters
/csd/c/<id>-<slug>       Cause page
/csd/give/<id>           Give sheet (also opens as a modal from anywhere)
/csd/add                 Add a cause
/csd/verify              Verification hub: claims that need evidence, paths or votes
/csd/verify/<claimId>    Claim workspace: evidence, paths, vote, challenge
/csd/highlights          This week's round: standings, boost, past winners
/csd/me                  My gSera, reputation, gifts, contributions
/csd/leaderboards        Givers, helpers, causes
/csd/technology          How it works, open source, contracts, the record
/csd/rules               Rules, points table, FAQ, terms
```

Primary nav: **Causes · Verify · Highlights · Add a cause · Technology**. Right side: gSera balance chip (when signed in) and Sign in.

---

## 10. Page by page

Copy rules for everything below: Sera.cx not "Sera", British spelling, we-voice, no em dashes, "stablecoins" for the currency, short sentences, no rhetorical flourishes.

### 10.1 Home (/csd)

Purpose: get a visitor to a cause they care about within one scroll.

| Section | Content | Notes |
| --- | --- | --- |
| Hero | Eyebrow: "Care. Share. Donate." Headline: "Give to the causes you care about." Sub: "Turtle hatcheries, animal shelters, children's homes, food banks and flood relief across Malaysia. Give in stablecoins, help check the charities, and see where every gift goes." Buttons: "Find a cause" (primary), "How we check charities" (secondary, to /csd/rules#verification). Photo: the Kasih hatchling in a coconut shell | No mention of registry, escrow or chains here |
| Numbers strip | Causes listed · Verified · Given so far (US$) · Helpers this month | Real figures from the registry. Hide "Given so far" until above US$1,000 |
| Cause of the week | Large photo, cause name, 2-sentence story, verification bar (e.g. "3 of 4 checks done"), "Give" button, "Read their story". Small line: "Chosen by 214 people with gSera this week. See the round" | Driven by the highlight round |
| Featured causes | 6 cards from the round | Card spec in 10.2 |
| Browse by cause | Category chips with counts: Turtles, Marine, Wildlife, Environment, Animals, Children, Health, Food, Relief, Elderly, Women, Disability | Links to /csd/causes?cat= |
| New and rising | 6 cards, labelled "New and rising. Some are still being checked" | From the Rising slots |
| Help without money | 3 cards: "Check a charity" (to /csd/verify), "Visit one near you", "Translate a profile". Line: "Every bit of help earns gSera." | |
| How gSera works | Three steps with small illustrations: Give or help → Earn gSera (100 per US$1, same as swapping on Sera.cx) → Choose what gets highlighted. Link to /csd/rules#gsera and g.sera.cx | Show the visitor's current streak and volume tier when signed in |
| Footer | Sera.cx logo, "Care Share Donate is open source." Links: Technology, Rules, GitHub, Terms, Privacy. Legal line | |

### 10.2 Cause card

Photo (16:10), category tag, verification state pill, cause name, town and state, one-line summary (max 3 lines), "x of 4 checks" mini bar, Give button, "Read more" link. Optional small chip: "Urgent appeal" or "Cause of the week".

Pills: New (grey), Evidence in (amber), Partly verified (amber with count), Verified (green), Paused (red). Always icon plus word plus colour, never colour alone.

### 10.3 Cause page (/csd/c/<id>-<slug>)

Order on desktop, two columns: story on the left, trust on the right. On mobile the trust card follows the hero.

1. **Hero:** name, legal name, location, category, photo with credit, 2-sentence story, Give, "Help without money".
2. **Trust card (right column, sticky on desktop):**
   - Verification bar: C1 to C4 (plus C6 if it applies), each a row with ✓ / … / !, the result, how many independent paths, and "See how it was checked" opening the claim workspace.
   - Badges: Tax-exempt (C5), Accounts published (C7).
   - Escrow line: "Gifts are held until this charity is verified. If it is not verified within 90 days, you can take your gift back."
   - Given so far, number of givers.
   - Concerns: any open challenge or steward note, in plain words, with a link.
3. **Live:** stream embed when the charity posts a live link (for example hatchling releases at dusk). Gifts made during a stream pop up on screen. When offline: their channels, and "Turn on alerts" for the next stream.
4. **What they do / Impact:** programmes and dated figures from the profile.
5. **Help this cause:** open help requests (intro, visit, translate, items) with "I can help".
6. **Organisation:** legal name, entity type, registration number, founded, founders, leadership, contact (organisation contacts only).
7. **Updates:** posts from the charity, newest first: reports, receipts, photos, streams.
8. **The record:** full on-chain history, newest first: listed, evidence, paths, votes, results, gifts, claims, updates. Each line has a date and a link to the transaction.
9. **Sources:** every page the profile came from.
10. **Boost:** "Spend gSera to highlight this cause this week" with the current rank.

### 10.4 Give sheet

- Step 1: choose stablecoin (USDT, USDC, XSGD, MYRT and others the council accepts) and amount. Preset amounts: US$5, 10, 25, 50, 100.
- Step 2: review. Shows: you give; the network fee; the Sera.cx settlement rate if the cause takes a different stablecoin; "Held for [cause] until verified"; "gSera you will earn: 9,900 (100 per US$1 × your multipliers, pending until the cause claims)", with the multipliers listed.
- Step 3: confirm in wallet.
- Step 4: thank-you screen led by the cause, not the transaction: cause photo, "Thank you. Your gift is with [cause]'s escrow.", what happens next, share card, transaction link in small text. Do not use a generic green payment tick screen.

Never say "no fee". Say "Fees are shown before you confirm."

### 10.5 Add a cause (/csd/add)

Form, then "what happens next".

Fields: cause name; category; town and state; what the money pays for (280 chars, with the hint "Be specific. RM15 buys one hatchery basket beats help the ocean"); official website or social link; registration number if known; payout wallet (optional at this stage; if blank, gifts wait until the charity sets one); photos (with a permission tick box: "I took these or have permission to use them"); your relationship to the cause (I run it / I volunteer / I support it / Other).

After submit: "Your cause is listed. Here is what happens next: 1. It shows under New and rising. 2. Anyone can upload evidence and check it. 3. When it is verified, the charity can claim gifts. If you know the charity, invite them to claim the listing." Invite link to share with the charity.

Duplicate check before submit: fuzzy match on name and registration number, "Is it one of these?"

### 10.6 Verification hub (/csd/verify)

The place for helpers.

- Tabs: **Needs evidence · Needs checking · Open for votes · Challenged · Recently verified**.
- Each row: cause, claim (C1 to C7), what is missing, gSera on offer, time open.
- Filters: claim type, state, category, "near me" (by state).
- Side panel: "How to check a charity", the verification paths library (where to check each claim, section 7.2), and the path template.
- Leader strip: top helpers this month by accepted paths.

### 10.7 Claim workspace (/csd/verify/<claimId>)

One claim on one cause.

1. Header: cause, claim, current state, time left.
2. Evidence list with hashes, uploader, date. "Upload evidence" button.
3. Paths, each as a card in the template layout, with the author's reputation and conflict-of-interest line. "Add your check" opens the template form.
4. Vote panel (locked until the voter has opened the paths): Verified / Not verified / Needs more evidence, with a required one-line reason.
5. Tally: weight for each option, quorum progress, threshold line.
6. Challenge panel (during the challenge window): stake 5,000 gSera, upload counter-evidence and path.
7. History of this claim.

### 10.8 Highlights (/csd/highlights)

- Countdown to round end.
- Standings table: rank, cause, eligibility for which slot, score, distinct boosters, gSera spent.
- Boost form: pick a cause, amount (min 1,000), see the effect on its score ("+31.6 to score" for 1,000 gSera) before confirming.
- Rules in plain words, with the square-root example.
- Past rounds archive with winners.

### 10.9 My gSera (/csd/me)

- Balance: the same gSera balance as g.sera.cx, split into spendable, pending from gifts (with "vests when [cause] claims or on [date]"), charity-tagged (section 6.6) and lifetime earned. Current multipliers: volume tier, streak.
- Reputation and vote weight.
- History: earned, spent, cancelled, with reasons.
- Gifts: per cause, status, refund button when refundable.
- Contributions: paths, votes, help, with outcomes.
- Badges (optional, cosmetic): First gift, Helper, Witness, Path finder (10 accepted paths), Steady hand (25 votes with the outcome).

### 10.10 Leaderboards (/csd/leaderboards)

Three boards, monthly and all-time: Givers (by number of causes given to, not by amount, to avoid whale bragging), Helpers (by accepted paths and fulfilled help), Causes (by givers). Wallets show as short address or ENS. Opt-out of leaderboards in settings.

### 10.11 Technology (/csd/technology)

For people who want to know how it works. Sections:
1. "One open list of causes": the registry on Ethereum, open source, anyone can build their own front end on it.
2. "Your gift is held, not handed over": escrow, claim, 90-day refund, payout-change rule.
3. "How charities get verified": claims, paths, votes, challenges, stewards and how their role shrinks.
4. "gSera for giving": donors earn like takers on g.sera.cx, how pending gSera vests, and why charity gSera cannot buy Lucky Draw tickets.
5. "The record": live feed of the latest events.
6. "Build on it": GitHub, contract addresses, indexer, how to run your own front end.
7. "Safety": security review status, KYT/KYA screening, bug bounty.

Illustration direction: drawn conceptual scenes (a shared notice board in a village square that every house can read; a locked donation box that only opens when the community has checked the charity), not labelled box diagrams.

### 10.12 Rules (/csd/rules)

The full points table, verification rules, highlight rules, refund rules, steward powers, what we do with reports, personal data rules, and FAQ. Written so a 15-year-old can follow it. Every number in this brief that is marked "proposed" lives here and nowhere else in the UI, so it can be changed in one place.

---

## 11. Data and contracts

### 11.1 What already exists (csd-protocol repo, v0.1)

`CauseRegistry.sol` with 10 passing tests: list, update, payout change (drops Verified), owner transfer, verify/suspend/close by verifier role, attest (evidence events), donate into escrow per cause and stablecoin, claim, refund after 90 days or on suspend/close, progress posts, help requests and pledges, council-managed verifiers and accepted stablecoins. Plus an indexer, 44 seeded causes with sourced profiles and photo credits, and a front end builder.

### 11.2 Changes for this brief

| Change | Why |
| --- | --- |
| Replace the single `verify` call with **per-claim results**: `finaliseClaim(causeId, claimType, outcome, resultRoot)` | Verification is now per claim, decided by community votes |
| Cause becomes Verified automatically when all required claims are final and positive | No manual "verify" step |
| A losing challenge on a required claim triggers `Suspended` and opens refunds | Section 7.8 |
| `commitRound(roundId, resultsRoot, slots[])` | Weekly highlight results on-chain so every front end shows the same spotlight |
| Remove the verifier role; add a **finaliser** role (steward multisig in phases 0 and 1) that can only submit results whose data anyone can recompute | Moves trust from people to published tallies |
| Keep escrow, claim and refund logic unchanged | Already tested |

### 11.3 Votes, paths and boosts: signed off-chain, settled on-chain

Writing every vote and boost to Ethereum would be slow and costly. Use the same pattern as Sera.cx intents:

1. Paths, votes, boosts and challenges are **EIP-712 signed messages** from the user's wallet. No gas for the user.
2. Messages are stored publicly (IPFS plus a public API) the moment they are signed.
3. At the end of a voting period or round, the finaliser computes the tally with the open-source rules, publishes the full input set and the result, and commits a Merkle root on-chain.
4. Anyone can download the inputs and recompute the result. If it does not match, that is a public, provable fault.
5. Later: the result is proven inside Sera.cx's v2 ZK engine so the finaliser cannot cheat at all.

### 11.4 Data model

**Cause**: id, owner, payout, category, profileURI (IPFS), stage, listedAt, verifiedAt, requiredClaims[], claimStates{}, totals per stablecoin, givers count.

**Evidence**: id, causeId, claimType, uploader, fileURI, fileHash, kind (doc, link, photo, video, signature), createdAt, redactionConfirmed.

**Path**: id, claimId, author, source, steps[], exactQuery, findings, matches (bool), screenshotHash, checkedAt, result (verified, not_verified, could_not_check), caveats, conflictOfInterest, signature.

**Claim**: id, causeId, type (C1 to C7), state (open, voting, challenge_window, final_verified, final_not_verified, needs_more), evidenceIds[], pathIds[], votingStart, votingEnd, tally{verified, not, more}, finalisedAt, resultRoot.

**Vote**: claimId, voter, choice, reason, weight (computed), signature, signedAt.

**Challenge**: id, claimId, challenger, stake, evidenceIds[], pathId, state, resolvedAt.

**Round**: id, start, end, boosts[], scores{}, slots{causeOfWeek, featured[], rising[], categoryLeaders{}}, resultRoot.

**Boost**: roundId, causeId, wallet, amount, signature.

**gSera ledger entry** (written to the existing g.sera.cx ledger): wallet, amount, multipliers applied, reason (gift, path, vote, help, listing, challenge, boost), source tag (charity or trading), sourceRef, state (pending, vested, spent, cancelled, burned), vestsAt.

**Reputation entry** (derived): wallet, delta, reason, sourceRef.

**HelpRequest / Pledge**: as in v0.1.

### 11.5 Indexer

Extend `indexer/index.mjs` to read registry events plus the signed-message store and produce: causes with claim states, gSera ledger entries to post to g.sera.cx, reputation, rounds, and the record feed. Publish the snapshot every 5 minutes and expose a read API. Anyone can run their own indexer and get the same numbers.

---

## 12. Content to load at launch

- **44 causes** from the csd-protocol seed, with sourced profiles, research flags and illustrative photos (credited, to be replaced with each charity's own photos with permission at onboarding).
- **Research flags become evidence or concerns** on the record, not hidden notes. Already known:
  - National Cancer Society Malaysia: printed s44(6) approval ended 31 Dec 2025.
  - NKF Malaysia: LHDN revoked s44(6) in 2019; the revocation was quashed by the High Court in Nov 2024; no current reference published.
  - Websites with injected spam: NASOM, Rumah KIDS, Women's Aid Organisation, National Cancer Society, Malaysian Relief Agency. Do not link them until fixed; tell them.
  - Perhentian Turtle Project is run by a private company, not a charity.
  - Kudat Turtle Conservation Society: no activity found after 2017.
  - Kasih: no registration, website or named operator found online. First outreach target, since we know them directly.
- **Exact LHDN references already found** (to be confirmed by C5 paths): Make-A-Wish Malaysia (LHDN.AG.600-12/1/4-6.7208, valid 2026 to 2035), Free Tree Society (LHDN.AG.600-12/1/4-6.8888, valid Apr 2025 to Mar 2030), NASOM, CPSM, Shelter Home, Food Aid Foundation, Reef Check Malaysia.
- **Seed verification tasks:** C1 and C5 for all 44 causes, so the Verify hub is busy on day one.
- **Launch Cause of the week:** Kasih Turtle Conservation Project is the story, but it cannot hold the slot until it is verified. Launch with a verified-ready cause in the slot (suggest Free Tree Society or Make-A-Wish once their C1 to C4 pass) and Kasih in "New and rising" with its own story block.

---

## 13. Design direction

- **Brand:** Sera.cx Green Field. Sera green `#00D26A` as fill with ink text on top. For green text on white use a darker green such as `#007A3D` (5.4:1 on white) because the brand green fails contrast as text. White or warm paper backgrounds only, no black backgrounds. Ghost "S" watermark allowed in the hero.
- **Type:** Green Field specifies Inter ExtraBold for headlines and Chivo Mono for figures. The live sera.cx site currently uses IBM Plex Sans, IBM Plex Mono and Instrument Serif. Pick one family for CSD; recommendation: match the live site so CSD feels like part of sera.cx.
- **Giving accent:** one warm accent used only on Give buttons and thank-you moments. Recommendation from the colour research: burnt orange `#C2410C` (5.2:1 with white text). Alternative: Sera green fill with ink text. Avoid red (reads as error, and as gain to mainland Chinese visitors), saturated royal yellow, large fields of party colours (PAS green, BN blue, PH red), and any red cross or crescent shape.
- **Status:** icon plus word plus colour every time. Received / Pending / Not sent / Info, with icons. Amounts with "+" and "−" signs.
- **Photography over decoration.** Real cause photos carry the emotion. Illustrations only on the Technology and Rules pages, drawn as scenes, not labelled boxes.
- **Accessibility:** WCAG 2.2 AA in light and dark. Body text 4.5:1, large text and controls 3:1. Full keyboard use. Dark mode follows the system setting.
- **Mobile first:** most Malaysian donors will arrive on phones from social links. Cause page trust card collapses to a summary bar under the hero on mobile.

---

## 14. Notifications

| Trigger | Who | Channel |
| --- | --- | --- |
| A cause you gave to becomes Verified | Givers | Email (if given), in-app |
| A cause you gave to is paused, or refunds open | Givers | Email, in-app, with refund button |
| A claim you checked or voted on is finalised or challenged | Helpers, voters | In-app |
| Your gSera vests | Givers | In-app |
| A cause you follow goes live | Followers | Push or email |
| Round results | Boosters | In-app |
| Someone invites you to claim your cause | Charity | Email via invite link |

---

## 15. Phase 2 ideas (not in this build)

- **Give other assets:** meme coins and NFTs, swapped to a stablecoin through a third-party aggregator before the gift. Refuse assets with no liquid market.
- **Recurring gifts** using signed allowances.
- **Matching pools:** a sponsor commits stablecoins to match gifts to a category for a period.
- **Round-ups:** give the spare change from Sera.cx settlements.
- **Charity dashboard:** analytics, donor thank-you messages, receipt generation for LHDN-approved charities.
- **Other countries:** Singapore (IPC charities), Indonesia, Philippines, with their own verification path libraries.

---

## 16. Phases and milestones

| Phase | Target | Verification | Highlights | gSera |
| --- | --- | --- | --- | --- |
| 0. Soft launch | Nov 2026 | Stewards finalise claims using community paths; votes shown as advisory | Stewards pick Cause of the week; boosts open and shown | Earned and shown; spending on boosts live |
| 1. Community | Q1 2027 | Votes decide; stewards only on disputes and legal issues | Rounds decide all slots except the urgent-appeal slot | Full rules, including challenges |
| 2. Open | After Sera.cx v2 | Results proven in the ZK engine; any finaliser can submit | Same | Same |

Before phase 0 goes live:
1. Independent security review of the registry changes.
2. Rules page and terms reviewed by Malaysian counsel (section 18).
3. KYT/KYA screening wired into gifts.
4. At least 5 causes through C1 to C4 so Verified exists on day one.

---

## 17. Open decisions

1. Cause heat values (section 6.2), helper rewards (6.3), the US$1,000 per-cause cap (6.7), and the quorum and threshold in 7.5. These are proposals.
1a. Lucky Draw separation for charity gSera (section 6.6). Recommendation: option 1.
2. Steward multisig members and threshold.
3. Which stablecoins the registry accepts at launch.
4. Whether to charge a front-end fee on sera.cx/csd. Current config: none. If one is added, it must show before confirm.
5. Type family: match sera.cx live (IBM Plex) or Green Field (Inter plus Chivo Mono).
6. Giving accent: burnt orange or Sera green.
7. Ethereum mainnet only, or the registry on Sera.cx v2 once it is live.
8. A small refundable deposit to add a cause, to slow down spam. Recommendation: none at launch, add only if spam appears.
9. Whether leaderboards show amounts at all.

---

## 18. Risks and how we handle them

| Risk | What we do |
| --- | --- |
| **gSera seen as a token or security** | CSD adds no transfer, sale or cash-out to gSera. Rules and terms say it has no cash value and no promised future value. Any change needs legal review first |
| **Charity mixed with a lucky draw** | Charity-tagged gSera cannot buy Lucky Draw tickets (section 6.6). Boosting has no prizes: it only changes what the site shows, and spent gSera is burned |
| **Public fundraising rules in Malaysia** for causes not yet registered | Gifts are held in escrow and only reach verified, registered organisations. Counsel to confirm whether listing an unregistered cause counts as fundraising. If needed, unregistered causes can be listed but not receive gifts until C1 passes |
| **Personal data (PDPA)** | Redaction before upload, moderation, organisation contacts only, nothing personal on-chain. Takedown process for personal data |
| **Defamation from concerns and challenges** | Evidence and paths must cite sources. Charities get a right of reply shown next to any concern. Stewards remove unsupported allegations |
| **Fake charities and impersonation** | Claim payout requires C3 (wallet signature published on the organisation's own channel). Changing payout drops Verified. Challenges and stewards |
| **Sybil voting** | KYT-passed wallets with a vested gift or accepted contribution, reputation-weighted votes capped at 5, quadratic highlight scoring |
| **Laundering through gifts** | Sera.cx KYT/KYA on every gift; flagged gifts held, earn no points |
| **Tax receipt confusion** | "Tax receipts come from the charity, and only where it holds current LHDN approval." C5 badge only from a verified LHDN path |
| **Smart contract risk** | Security review before mainnet, bug bounty, escrow-only design, no admin path to move funds |
| **Photos without permission** | Illustrative Commons photos credited and replaced at onboarding; uploads require a permission tick box |

---

## 19. Success measures (first 90 days)

| Measure | Target |
| --- | --- |
| Causes listed | 150 |
| Causes Verified | 30 |
| Median days from listed to Verified | Under 21 |
| Unique givers | 1,000 |
| Unique helpers with an accepted path | 100 |
| Challenges upheld as a share of finalised claims | Under 5% (higher means checking is too loose) |
| Distinct boosters per round | 200 |
| Stablecoin volume settled through Sera.cx from CSD | Report weekly |

---

## 20. Acceptance criteria (build checklist)

**Causes**
- [ ] Anyone with a wallet can add a cause; duplicate check runs before submit.
- [ ] Cause page shows all seven claim states with links to their workspaces.
- [ ] The record lists every on-chain event with a transaction link.

**Giving**
- [ ] Give sheet shows fees, settlement rate when relevant, escrow wording and pending gSera before confirm.
- [ ] Thank-you screen leads with the cause, not the transaction.
- [ ] Refund button appears exactly when the contract allows a refund.

**Verification**
- [ ] Path form refuses submission without source, steps and a dated screenshot.
- [ ] Vote button stays locked until the voter has opened the paths.
- [ ] Tally, quorum and threshold update live; challenge window shows a countdown.
- [ ] Anyone can download a claim's inputs and recompute its result with the published script.

**gSera**
- [ ] Gift gSera = gift_usd × 100 × heat × volume × streak, capped at 10×, and the same figure shows in the give sheet before confirm.
- [ ] Gifts that settle through a swap earn once, not twice.
- [ ] Balance splits into spendable, pending, charity-tagged and lifetime, with reasons for every entry.
- [ ] Refunded gifts cancel their pending points.
- [ ] Charity-tagged gSera cannot be spent on Lucky Draw tickets.

**Highlights**
- [ ] Boost preview shows the square-root effect before confirming.
- [ ] Round results are committed on-chain and match the published standings.
- [ ] Unverified causes never appear in Cause of the week or Featured.

**Quality**
- [ ] WCAG 2.2 AA in light and dark; full keyboard use; status never by colour alone.
- [ ] No em dashes, "Sera.cx" naming, British spelling across all copy.
- [ ] Works at 360px width with no sideways scrolling.

---

## 21. Reference material

- csd-protocol repo (registry contract, tests, indexer, 44 seeded causes, front end builder).
- Cause directory: 162 Malaysian charities by category and state (outreach list).
- CSD colour system and research.
- Sera Community brief for community.sera.cx (Evangelise and Build missions).
- LHDN donation approval search: https://www.hasil.gov.my/institusi-organisasi-tabung/semakan-kelulusan-derma/
