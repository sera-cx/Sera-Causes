/* Every tunable number is rendered from src/lib/constants.ts and shown only here. */
import { SectionHeader } from "@/components/SectionHeader";
import { useSeo } from "@/hooks/useSeo";
import { CHALLENGE_STAKE, CLAIMS, CLAIM_INFO, GSERA, LINKS, REPUTATION, VERIFICATION_MODE, VOTE_WEIGHT, VOTING } from "@/lib/constants";
import { fmtInt, fmtMultiplier } from "@/lib/format";
import { giftGsera, voteWeight } from "@/lib/rules";

export function RulesPage() {
  useSeo("Rules", "The full points table, verification rules, steward powers, personal data rules and FAQ for Care Share Donate.");
  const example = giftGsera(50, { heat: GSERA.heat.urgent, volumeTier: 1.2, streak: 1.1 });
  return (
    <div className="container max-w-4xl py-10 md:py-14">
      <SectionHeader kicker="Rules" title="The rules, with every number in one place." lede="Written so a 15 year old can follow it. Numbers marked proposed may change before community mode; we change them here and nowhere else." size="lg" />
      <nav aria-label="On this page" className="mt-6 flex flex-wrap gap-2 font-mono text-[11.5px] uppercase tracking-[0.1em]">
        {[["gsera", "gSera"], ["verification", "Verification"], ["challenges", "Challenges"], ["stewards", "Stewards"], ["reports", "Reports"], ["data", "Personal data"], ["faq", "FAQ"]].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-full border border-rule px-3 py-1.5 text-ink-muted hover:text-ink">
            {label}
          </a>
        ))}
      </nav>

      <div className="prose-csd">
        <h2 id="gsera" className="scroll-mt-24">gSera points</h2>
        <p>gSera is the same balance as g.sera.cx. Gifts and helping earn it. It is credited to your wallet when the gift arrives and passes screening. There is nothing to refund, so there is no waiting period.</p>
        <h3>Gifts</h3>
        <p>gSera per gift = gift in US$ x {GSERA.perUsd} x heat x volume tier x streak, capped at {GSERA.compoundCap}x in total.</p>
        <table>
          <thead>
            <tr><th>Multiplier</th><th>Range</th><th>Note</th></tr>
          </thead>
          <tbody>
            <tr><td>Base</td><td className="num">{GSERA.perUsd} per US$1</td><td>Measured at the value the cause receives. Same as takers.</td></tr>
            <tr><td>Heat</td><td className="num">{fmtMultiplier(GSERA.heat.normal)} to {fmtMultiplier(GSERA.heat.urgent)}</td><td>Urgent appeal chosen by Sera.cx: {fmtMultiplier(GSERA.heat.urgent)}. Every other cause: {fmtMultiplier(GSERA.heat.normal)}. Proposed.</td></tr>
            <tr><td>Volume tier</td><td className="num">{fmtMultiplier(GSERA.volumeTier.min)} to {fmtMultiplier(GSERA.volumeTier.max)}</td><td>Same season ladder as swaps. Gifts count towards it.</td></tr>
            <tr><td>Streak</td><td className="num">{fmtMultiplier(GSERA.streak.min)} to {fmtMultiplier(GSERA.streak.max)}</td><td>Weekly, Monday to Sunday UTC. A gift keeps a streak alive.</td></tr>
            <tr><td>Power Hour</td><td className="num">1.0x</td><td>Not applied to gifts.</td></tr>
          </tbody>
        </table>
        <p>Example: a US$50 gift to an urgent appeal, on a 1.2x volume tier and a 1.1x streak, earns 50 x {GSERA.perUsd} x {GSERA.heat.urgent} x 1.2 x 1.1 = {fmtInt(example)} gSera.</p>
        <p>A gift that settles through a Sera.cx swap earns once, at the donor rate. The swap leg does not also earn taker gSera. A gift in the cause's own stablecoin still earns, because the point is the gift, not the swap.</p>
        <h3>Helping</h3>
        <table>
          <thead>
            <tr><th>Action</th><th>gSera</th><th>Credited</th></tr>
          </thead>
          <tbody>
            <tr><td>Add a cause that later reaches Verified</td><td className="num">{fmtInt(GSERA.helper.listingVerified)}</td><td>On Verified</td></tr>
            <tr><td>Write a verification path the final outcome agrees with</td><td className="num">{fmtInt(GSERA.helper.pathAgrees)}</td><td>When the claim is final and the challenge window has closed</td></tr>
            <tr><td>Vote in line with the final outcome</td><td className="num">{fmtInt(GSERA.helper.voteAgrees)}</td><td>Same</td></tr>
            <tr><td>Help request fulfilled, confirmed by the charity</td><td className="num">{fmtInt(GSERA.helper.helpFulfilled)}</td><td>On confirmation</td></tr>
            <tr><td>Successful challenge</td><td className="num">stake back + {fmtInt(GSERA.helper.challengeWin)}</td><td>When the challenge is upheld</td></tr>
          </tbody>
        </table>
        <p>All helper numbers are proposed.</p>
        <h3>Charity gSera</h3>
        <p>gSera earned from gifts and helping is tagged by source. It can be spent on g.sera.cx and staked on challenges, but it cannot buy Lucky Draw tickets. Spending never lowers your lifetime rank.</p>
        <h3>Anti-gaming</h3>
        <ul>
          <li>Wallets linked to a cause's owner or payout wallet earn no gSera on that cause. Linked means the same address, funded directly from it within 30 days, or flagged by Sera.cx KYT clustering.</li>
          <li>gSera-earning gifts are capped at US${fmtInt(GSERA.giftCapUsdPerWalletPerCausePer30d)} per wallet per cause per {GSERA.giftCapWindowDays} days. Gifts above the cap are recorded but earn 0x. Proposed.</li>
          <li>Voting needs a wallet that has passed KYT and has at least one gift or one accepted contribution.</li>
          <li>Vote rewards are small. Voting against the final outcome costs reputation.</li>
          <li>All gifts pass Sera.cx KYT and KYA screening. Flagged gifts earn no gSera.</li>
        </ul>

        <h2 id="verification" className="scroll-mt-24">Verification</h2>
        <p>A cause is verified one claim at a time. Each claim is a single fact with a clear yes or no. Verified means C1, C2, C3 and C4 are all verified, plus C6 where the law needs a care licence. C5 and C7 are separate badges. Verification is a trust signal. It does not control the money, which goes straight to the cause.</p>
        <table>
          <thead>
            <tr><th>Claim</th><th>Needed for Verified</th><th>What counts as proof</th><th>Where to check</th></tr>
          </thead>
          <tbody>
            {CLAIMS.map((c) => {
              const i = CLAIM_INFO[c];
              return (
                <tr key={c}>
                  <td><span className="font-mono">{c}</span>. {i.label}</td>
                  <td>{i.required === "always" ? "Yes" : i.required === "when_flagged" ? "Children's homes and care centres" : `No, badge: ${i.badge}`}</td>
                  <td>{i.proof}</td>
                  <td>{i.whereToCheck}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <h3>Evidence</h3>
        <p>Anyone can upload evidence: a document, link, photo, video or signed wallet message. Personal data is redacted before upload. Files are hashed and the hash is recorded, so nobody can swap a file later. Each piece shows who uploaded it and when.</p>
        <h3>Paths</h3>
        <p>A helper who checks a claim writes down how, in a fixed template: source, steps, exact search, what they found, whether it matches, a dated screenshot, the result, caveats and a conflict-of-interest line. One claim per path. A path without a source, steps and a dated screenshot cannot be submitted. Paths are public, permanent and signed. Agreeing paths from different helpers count for more. "Not verified" and "Could not check" are useful results and earn the same points when the outcome agrees.</p>
        <h3>Voting</h3>
        <table>
          <thead>
            <tr><th>Rule</th><th>Value</th></tr>
          </thead>
          <tbody>
            <tr><td>Independent paths before voting opens</td><td className="num">{VOTING.minPaths}</td></tr>
            <tr><td>Voting period</td><td className="num">{VOTING.periodDays} days</td></tr>
            <tr><td>Earliest close once quorum and threshold are met</td><td className="num">{VOTING.minHours} hours</td></tr>
            <tr><td>Quorum (total vote weight)</td><td className="num">{VOTING.quorumWeight}</td></tr>
            <tr><td>Threshold (vote weight saying Verified)</td><td className="num">{VOTING.thresholdPct}%</td></tr>
            <tr><td>Challenge window after a pass</td><td className="num">{VOTING.challengeWindowHours} hours</td></tr>
            <tr><td>Choices</td><td>Verified, Not verified, Needs more evidence</td></tr>
          </tbody>
        </table>
        <p>Voters must open the paths first. The vote button sits under the paths and unlocks only after they have been opened. A "Needs more evidence" outcome reopens the claim. It is not a fail.</p>
        <h3>Vote weight and reputation</h3>
        <p>weight = 1 + min({VOTE_WEIGHT.max - VOTE_WEIGHT.min}, log2(1 + reputation)), so between {VOTE_WEIGHT.min} and {VOTE_WEIGHT.max}. New voters count as {VOTE_WEIGHT.min}. Reputation grows by {REPUTATION.agrees} for each vote and each path that matches a final, unchallenged outcome, and drops by {Math.abs(REPUTATION.overturned)} for each one a successful challenge overturns. gSera does not add vote weight. Points cannot buy verification.</p>
        <table>
          <thead>
            <tr><th>Reputation</th><th>Weight</th></tr>
          </thead>
          <tbody>
            {[0, 1, 3, 7, 15, 30].map((r) => (
              <tr key={r}><td className="num">{r}</td><td className="num">{voteWeight(r)}</td></tr>
            ))}
          </tbody>
        </table>
        <h3>Launch mode</h3>
        <p>Current mode: <span className="font-mono">{VERIFICATION_MODE}</span>. In advisory mode, votes and tallies are shown and Sera.cx stewards finalise every claim. In community mode, votes decide and stewards act only on disputes and legal issues. Switching is one setting.</p>

        <h2 id="challenges" className="scroll-mt-24">Challenges</h2>
        <ul>
          <li>Anyone can challenge a verified or pending-final claim by staking {fmtInt(CHALLENGE_STAKE)} gSera (proposed) and uploading counter-evidence with their own path.</li>
          <li>A challenge reopens voting on that claim for {VOTING.periodDays} days, with the challenge shown at the top.</li>
          <li>If the challenge wins: the claim flips, the challenger gets the stake back plus {fmtInt(GSERA.helper.challengeWin)} gSera, and the people whose paths and votes were overturned lose {Math.abs(REPUTATION.overturned)} reputation each. If the claim was required, the cause loses Verified.</li>
          <li>If the challenge loses: the stake is burned.</li>
        </ul>

        <h2 id="stewards" className="scroll-mt-24">Stewards</h2>
        <p>While we launch, a Sera.cx steward multisig can finalise or overturn a claim where voting is stuck or there is clear fraud or a legal problem; pause a cause immediately on a credible report of fraud, harm or a legal notice; remove evidence that contains personal data or defamatory content; pin one urgent appeal at a time with a written reason; and take a cause off the homepage with a public reason. Every steward action is posted on the cause's record with a written reason. The target is that stewards only handle legal takedowns later.</p>

        <h2 id="reports" className="scroll-mt-24">What we do with reports</h2>
        <p>Report a cause, a piece of evidence or a person from the cause page or by email to security@sera.cx. We read every report. A credible report of fraud or harm pauses the cause while we look. A report about personal data removes the file first and asks questions after. We tell you what we did, and the action goes on the record.</p>

        <h2 id="data" className="scroll-mt-24">Personal data</h2>
        <ul>
          <li>Profiles carry organisation contacts only. No personal phone numbers, home addresses or bank details of individuals.</li>
          <li>Evidence is redacted before upload: IC numbers, home addresses, personal phone numbers and signatures. The upload form warns you and files with unredacted personal data are rejected.</li>
          <li>Wallets show as short addresses. You can opt out of leaderboards.</li>
          <li>Share counts are kept per channel with no personal data.</li>
        </ul>

        <h2 id="faq" className="scroll-mt-24">FAQ</h2>
        <h3>Can the charity use my gift straight away?</h3>
        <p>Yes. Gifts go to the cause's own address and the owner can use them from day one. Verification tells you what has been checked about the organisation, not whether the money is locked.</p>
        <h3>Can I get a gift back?</h3>
        <p>No. Gifts are final, the same as handing cash to a collection tin. Read the trust card before you give.</p>
        <h3>Why do some causes say New?</h3>
        <p>Anyone with a wallet can add a cause. New means nobody has checked it yet. The pill and the checks bar are on every card so you can see that at a glance.</p>
        <h3>What happens if a charity's payout wallet changes?</h3>
        <p>Verified is removed and the payout wallet claim (C3) has to be checked again with a new signed message.</p>
        <h3>Which stablecoins can I use?</h3>
        <p>USDT, USDC, XSGD and MYRT at launch. If the cause keeps a different one, the site swaps through Sera.cx and shows the rate and fees before you confirm.</p>
        <h3>Is this a licensed charity or fundraiser?</h3>
        <p>No. Care Share Donate is an open list and a set of tools on Sera.cx. Gifts go to the organisations themselves. Check the C5 badge for tax deductibility.</p>
        <p>
          Terms:{" "}
          <a href={LINKS.terms} target="_blank" rel="noopener noreferrer">
            sera.cx/terms
          </a>
          . Privacy:{" "}
          <a href={LINKS.privacy} target="_blank" rel="noopener noreferrer">
            sera.cx/privacy
          </a>
          .
        </p>
      </div>
    </div>
  );
}
