/* Every tunable number is rendered from src/lib/constants.ts and shown only here. */
import { SectionHeader } from "@/components/SectionHeader";
import { useJsonLdMany } from "@/hooks/useJsonLd";
import { useSeo } from "@/hooks/useSeo";
import {
  CHALLENGE_STAKE,
  CLAIMS,
  CLAIM_INFO,
  COMMUNITY_SITE,
  DEFAULT_VERIFICATION_MODE,
  GSERA,
  LINKS,
  REPUTATION,
  TRIAL,
  VOTE_WEIGHT,
  VOTING,
  XP,
  XP_EVENT_TYPES,
} from "@/lib/constants";
import { fmtInt, fmtMultiplier, fmtRm } from "@/lib/format";
import { useStats } from "@/lib/queries";
import { giftGsera, voteWeight } from "@/lib/rules";
import { RULES_FAQS, ROUTE_SEO } from "@/lib/seo";
import { breadcrumbSchema, faqSchema } from "@/lib/seoSchemas";

/** A table that scrolls inside its own box instead of pushing the page sideways. */
function ScrollTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="table-scroll" role="region" tabIndex={0} aria-label="Table, scrolls sideways on a narrow screen">
      <table>{children}</table>
    </div>
  );
}

export function RulesPage() {
  useSeo(ROUTE_SEO.rules);
  useJsonLdMany([
    { id: "faq", node: faqSchema(RULES_FAQS) },
    { id: "breadcrumb", node: breadcrumbSchema([{ name: "Rules and points", path: "/rules" }]) },
  ]);
  const stats = useStats();
  const verificationMode = stats.data?.verificationMode ?? DEFAULT_VERIFICATION_MODE;
  const example = giftGsera(50, { heat: GSERA.heat.urgent, volumeTier: 1.2, streak: 1.1 });
  return (
    <div className="container container-reading py-10 md:py-14">
      <SectionHeader
        level={1}
        kicker="Rules"
        title="The rules, with every number in one place."
        lede="Written so a 15 year old can follow it. Any number marked proposed may still change before community mode. We change it here and nowhere else."
        size="lg"
      />
      <nav aria-label="On this page" className="mt-6 flex flex-wrap gap-2 font-mono text-[11.5px] uppercase tracking-[0.1em]">
        {[["scope", "What this covers"], ["gsera", "gSera"], ["xp", "Care XP"], ["listing", "Who lists a cause"], ["verification", "Verification"], ["challenges", "Challenges"], ["stewards", "Stewards"], ["reports", "Reports"], ["data", "Personal data"], ["faq", "FAQ"]].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="inline-flex min-h-11 items-center rounded-full border border-rule px-3 text-ink-muted hover:text-ink">
            {label}
          </a>
        ))}
      </nav>

      <div className="prose-csd">
        <h2 id="scope" className="scroll-mt-24">What this first run covers</h2>
        <p>{TRIAL.rules}</p>
        <p>
          Gifts arrive at the cause's own address on Ethereum. Nothing is held back on the way. We do not take a cut of a gift, and the only cost is the network fee your wallet pays to send it, which the wallet
          shows you first.
        </p>

        <h2 id="gsera" className="scroll-mt-24">gSera points, for giving</h2>
        <p>
          gSera is the reward points balance you share with g.sera.cx. Giving earns it. It reaches your wallet when the gift arrives and passes screening. There is nothing to refund, so there is no waiting
          period. Helping earns Care XP on {COMMUNITY_SITE} instead, which is the next section.
        </p>
        <h3>Gifts</h3>
        <p>gSera per gift = the gift in US$ x {GSERA.perUsd} x heat x volume tier x streak, up to {GSERA.compoundCap}x in total.</p>
        <ScrollTable>
          <thead>
            <tr><th>Multiplier</th><th>Range</th><th>Note</th></tr>
          </thead>
          <tbody>
            <tr><td>Base</td><td className="num">{GSERA.perUsd} per US$1</td><td>Measured at the value the cause receives. The same as a taker on Sera.cx.</td></tr>
            <tr><td>Heat</td><td className="num">{fmtMultiplier(GSERA.heat.normal)} to {fmtMultiplier(GSERA.heat.urgent)}</td><td>An urgent appeal chosen by Sera.cx: {fmtMultiplier(GSERA.heat.urgent)}. Every other cause: {fmtMultiplier(GSERA.heat.normal)}. Proposed.</td></tr>
            <tr><td>Volume tier</td><td className="num">{fmtMultiplier(GSERA.volumeTier.min)} to {fmtMultiplier(GSERA.volumeTier.max)}</td><td>The same season ladder as swaps. Gifts count towards it.</td></tr>
            <tr><td>Streak</td><td className="num">{fmtMultiplier(GSERA.streak.min)} to {fmtMultiplier(GSERA.streak.max)}</td><td>Weekly, Monday to Sunday UTC. A gift keeps a streak alive.</td></tr>
            <tr><td>Power Hour</td><td className="num">1.0x</td><td>Not used on gifts.</td></tr>
          </tbody>
        </ScrollTable>
        <p>
          An example. You give US$50, about {fmtRm(50)}, to an urgent appeal. You are on a 1.2x volume tier and a 1.1x streak. That earns 50 x {GSERA.perUsd} x {GSERA.heat.urgent} x 1.2 x 1.1 ={" "}
          {fmtInt(example)} gSera.
        </p>
        <p>
          A gift that settles through a Sera.cx swap earns once, at the giver's rate. The swap leg does not also earn taker gSera. A gift already in the cause's own stablecoin still earns, because the point is
          the gift, not the swap.
        </p>
        <h3>Charity gSera</h3>
        <p>gSera earned from a gift is tagged by where it came from. You can spend it on g.sera.cx and stake it on a challenge, but it cannot buy Lucky Draw tickets. Spending never lowers your lifetime rank.</p>
        <h3>Stopping people gaming it</h3>
        <ul>
          <li>A wallet linked to a cause's owner or its payout wallet earns no gSera on that cause. Linked means the same address, funded straight from it within 30 days, or grouped with it by Sera.cx screening.</li>
          <li>Gifts earn gSera up to US${fmtInt(GSERA.giftCapUsdPerWalletPerCausePer30d)} per wallet, per cause, per {GSERA.giftCapWindowDays} days. A gift above that is still recorded, but earns 0x. Proposed.</li>
          <li>To vote you need a wallet that has passed screening and has made one gift or had one contribution accepted.</li>
          <li>Vote rewards are small. Voting against the final result costs you reputation.</li>
          <li>Every gift passes Sera.cx screening. A flagged gift earns no gSera.</li>
        </ul>

        <h2 id="xp" className="scroll-mt-24">Care XP, for helping</h2>
        <p>
          Helping earns XP on{" "}
          <a href={LINKS.community} target="_blank" rel="noopener noreferrer">
            {COMMUNITY_SITE}
          </a>
          , not gSera. XP is your standing in the Care track of the Sera.cx community programme. It is not a balance, you cannot spend it, and it has no cash value.
        </p>
        <ScrollTable>
          <thead>
            <tr><th>Action</th><th>XP</th><th>When it is credited</th></tr>
          </thead>
          <tbody>
            {XP_EVENT_TYPES.map((t) => (
              <tr key={t}>
                <td>{XP[t].label}</td>
                <td className="num">{fmtInt(XP[t].amount)}</td>
                <td>{XP[t].when}</td>
              </tr>
            ))}
          </tbody>
        </ScrollTable>
        <p>Every XP number here is proposed, pending the community team's assessment.</p>
        <p>
          Each event is recorded on causes.sera.cx the moment you earn it: once per listing, path, vote, piece of evidence, help request or challenge. It is credited on {COMMUNITY_SITE} once the link between the
          two sites is live. Until then your XP is held here and nothing is lost.
        </p>

        <h2 id="listing" className="scroll-mt-24">Who lists a cause</h2>
        <p>
          The organisation does. A charity lists itself, in its own words, and sets the wallet that receives the gifts. That is the whole point of listing: whoever lists a cause sets that wallet, so it has to be
          the organisation's own.
        </p>
        <p>
          So you never have to wonder whose wallet your gift lands in. It is the organisation's, by design. If that wallet is ever changed, the cause loses Verified at once, and the payout wallet claim (C3) has
          to be checked again with a new signed message.
        </p>
        <p>
          Checking a cause is the opposite: it is open to everyone. Anyone can upload evidence, write down how they checked a claim, and vote on the result. The organisation says who it is. The community checks
          whether that is true.
        </p>
        <p>
          Someone can still list a cause for an organisation, with their agreement, for example a volunteer helping a group that is not online. They are asked to use the organisation's own payout wallet and to
          send the organisation an invite link so it can take the listing over.
        </p>

        <h2 id="verification" className="scroll-mt-24">Verification</h2>
        <p>
          A cause is verified one claim at a time. A claim is a single fact with a clear yes or no. Verified means C1, C2, C3 and C4 are all verified, plus C6 where the law needs a care licence. C5 and C7 are
          separate badges. Verification is a trust signal. It does not control the money, which goes straight to the cause.
        </p>
        <ScrollTable>
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
        </ScrollTable>
        <h3>Evidence</h3>
        <p>
          Anyone can upload evidence: a document, a link, a photo, a video or a message signed by a wallet. Personal details are blacked out first. We take a fingerprint of every file and record it, so nobody
          can swap a file later. Each piece shows who uploaded it and when.
        </p>
        <h3>Verification paths</h3>
        <p>
          A verification path is a written note of exactly how one person checked one claim. It uses a fixed form: the source, the steps, the exact search, what they found, whether it matches the profile, a
          dated screenshot, the result, anything the source does not show, and a line about any connection they have to the organisation. One claim per path. A path with no source, no steps and no dated
          screenshot cannot be sent. Paths are public, permanent and signed. Paths that agree, written by different helpers, count for more. "Not verified" and "Could not check" are useful results and earn the
          same points when the final result agrees.
        </p>
        <h3>Voting</h3>
        <ScrollTable>
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
        </ScrollTable>
        <p>You have to open the paths first. The vote button sits under them and unlocks only once you have opened one. A "Needs more evidence" result reopens the claim. It is not a fail.</p>
        <h3>Vote weight and reputation</h3>
        <p>
          weight = 1 + min({VOTE_WEIGHT.max - VOTE_WEIGHT.min}, log2(1 + reputation)), so it sits between {VOTE_WEIGHT.min} and {VOTE_WEIGHT.max}. A new voter counts as {VOTE_WEIGHT.min}. Reputation grows by{" "}
          {REPUTATION.agrees} for each vote and each path that matches a final, unchallenged result, and drops by {Math.abs(REPUTATION.overturned)} for each one a successful challenge overturns. Neither gSera
          nor XP adds vote weight. Points cannot buy verification.
        </p>
        <ScrollTable>
          <thead>
            <tr><th>Reputation</th><th>Weight</th></tr>
          </thead>
          <tbody>
            {[0, 1, 3, 7, 15, 30].map((r) => (
              <tr key={r}><td className="num">{r}</td><td className="num">{voteWeight(r)}</td></tr>
            ))}
          </tbody>
        </ScrollTable>
        <h3>Launch mode</h3>
        <p>
          Current mode: <span className="font-mono">{verificationMode}</span>. In advisory mode, votes and tallies are shown and Sera.cx stewards settle every claim. In community mode, the votes decide and
          stewards only step in on disputes and legal problems. Switching is one setting.
        </p>

        <h2 id="challenges" className="scroll-mt-24">Challenges</h2>
        <ul>
          <li>Anyone can challenge a verified or nearly final claim by staking {fmtInt(CHALLENGE_STAKE)} gSera (proposed) and uploading evidence against it, with their own path.</li>
          <li>A challenge reopens voting on that claim for {VOTING.periodDays} days, with the challenge shown at the top.</li>
          <li>If the challenge wins: the claim flips, the challenger gets the stake back plus {fmtInt(XP.care_challenge_upheld.amount)} XP on {COMMUNITY_SITE}, and everyone whose path or vote was overturned loses {Math.abs(REPUTATION.overturned)} reputation. If the claim was a required one, the cause loses Verified.</li>
          <li>If the challenge loses: the stake is burned.</li>
        </ul>

        <h2 id="stewards" className="scroll-mt-24">Stewards</h2>
        <p>
          While we launch, a Sera.cx steward multisig can settle or overturn a claim where voting is stuck or there is clear fraud or a legal problem; pause a cause at once on a believable report of fraud, harm
          or a legal notice; remove evidence that contains personal details or defames someone; pin one urgent appeal at a time with a written reason; and take a cause off the home page with a public reason. Every
          steward action goes on the cause's record with a written reason. The aim is that stewards end up handling legal takedowns and nothing else.
        </p>

        <h2 id="reports" className="scroll-mt-24">What we do with reports</h2>
        <p>
          You can report a cause, a piece of evidence or a person from the cause page, or by email to security@sera.cx. We read every report. A believable report of fraud or harm pauses the cause while we look. A
          report about personal details removes the file first and asks questions after. We tell you what we did, and the action goes on the record.
        </p>

        <h2 id="data" className="scroll-mt-24">Personal data</h2>
        <ul>
          <li>A profile carries organisation contacts only. No personal phone numbers, home addresses or bank details of individuals.</li>
          <li>Evidence is blacked out before upload: IC numbers, home addresses, personal phone numbers and signatures. The upload form warns you, and we reject files that still show them.</li>
          <li>Wallets show as short addresses. You can keep yourself off the leaderboards.</li>
          <li>Share counts are kept per channel, with no personal data in them.</li>
        </ul>

        <h2 id="faq" className="scroll-mt-24">FAQ</h2>
        {/* Rendered from the same array that feeds the FAQPage schema, so the
            visible answers and the structured data can never drift apart. */}
        {RULES_FAQS.map((f) => (
          <div key={f.q}>
            <h3>{f.q}</h3>
            <p>{f.a}</p>
          </div>
        ))}
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
