/* The rules, and every tunable number, in one place.
   ------------------------------------------------------------------
   How this page is built, so it stays readable as rules are added:
   - Every number is rendered from src/lib/constants.ts, which re-exports
     @sera-causes/shared. Nothing on this page is typed in by hand.
   - Each section leads with the answer in one sentence, before any table
     or detail, so a reader who stops after the heading still leaves with
     the right idea.
   - Tables are for looking a number up. Mechanisms are drawn instead: how
     a cause is checked, where gSera comes from, how XP and badges differ,
     what a steward may touch, what happens when somebody objects.
   - Each thing is said once, in the section it belongs to, and cross
     linked from anywhere else that needs it.
   - Section ids are a public interface: other pages deep link to #gsera,
     #verification, #badges, #reports and #data. Do not rename them. */
import { type ReactNode } from "react";
import { SectionHeader } from "@/components/SectionHeader";
import { CoinAndBadge, Figure, HowChecked, ListedByTheCharity, WhatStewardsCanDo, WhenSomeoneObjects, XpOrBadge } from "@/components/illustrations";
import { useJsonLdMany } from "@/hooks/useJsonLd";
import { useSeo } from "@/hooks/useSeo";
import {
  CHALLENGE_STAKE,
  CLAIMS,
  CLAIM_INFO,
  COMMUNITY_SITE,
  DEFAULT_VERIFICATION_MODE,
  GSERA,
  HELPER_BADGES,
  HELPER_BADGE_SLUGS,
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

/** The contents rail, and the order the sections are written in below. */
const SECTIONS: readonly (readonly [string, string])[] = [
  ["scope", "What this covers"],
  ["listing", "Who lists a cause"],
  ["verification", "How a cause is checked"],
  ["gsera", "gSera"],
  ["xp", "Care XP"],
  ["badges", "Badges"],
  ["challenges", "Challenges"],
  ["stewards", "Stewards"],
  ["reports", "Reports"],
  ["data", "Personal data"],
  ["faq", "FAQ"],
];

/**
 * A table that scrolls inside its own box instead of pushing the page
 * sideways. `min` raises the width the table asks for before it starts to
 * scroll: wide enough that a column of sentences is never squeezed down to
 * breaking words in half, which is what happens otherwise once the page
 * drops to one column.
 */
function ScrollTable({ children, min }: { children: React.ReactNode; min?: string }) {
  return (
    <div className="table-scroll" role="region" tabIndex={0} aria-label="Table, scrolls sideways on a narrow screen">
      <table className={min}>{children}</table>
    </div>
  );
}

/**
 * One rule section: a rule above the heading so the page reads as a stack
 * of separate answers, then the answer itself in one sentence, then the
 * detail. The id stays on the heading, because that is what other pages
 * link to.
 */
function Section({ id, title, lead, children }: { id: string; title: string; lead: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-14 border-t border-rule pt-9 first:mt-0 first:border-t-0 first:pt-0">
      <h2 id={id} className="mt-0 scroll-mt-24">
        {title}
      </h2>
      {/* The answer, before any detail. Balanced from the small breakpoint
          up, where a one sentence answer would otherwise leave a short
          second line; left alone on a phone, where every character of the
          width is wanted. */}
      <p className="mt-3 measure text-[18px] font-medium leading-[1.5] text-ink sm:text-balance">{lead}</p>
      {children}
    </section>
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
    <div className="container py-10 md:py-14">
      <SectionHeader
        level={1}
        kicker="Rules"
        title="The rules, with every number in one place."
        lede="Every rule and every number is set here and nowhere else. Anything marked proposed may still change before community mode."
        size="lg"
      />
      {/* The page keeps the full container, so the prose starts on the same
          left edge as the nav above it. The paragraphs still take the
          measure, and the room that leaves goes to the contents list, which
          follows you down the page instead of scrolling away at the top. */}
      <div className="mt-8 grid gap-10 xl:grid-cols-[minmax(0,1fr)_220px] xl:gap-14">
        <nav aria-label="On this page" className="xl:order-2 xl:sticky xl:top-20 xl:self-start">
          <p className="eyebrow hidden xl:block">On this page</p>
          <ul className="flex flex-wrap gap-2 font-mono text-[11.5px] uppercase tracking-[0.1em] xl:mt-3 xl:flex-col xl:gap-0 xl:border-l xl:border-rule xl:pl-4">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="inline-flex min-h-11 items-center rounded-full border border-rule px-3 text-ink-muted hover:text-ink xl:w-full xl:rounded-none xl:border-0 xl:px-0 xl:leading-[1.3]">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="prose-csd min-w-0 xl:order-1">
          <Section
            id="scope"
            title="What this first run covers"
            lead="Causes in Malaysia, gifts in four stablecoins, and more countries from 2027."
          >
            <p>{TRIAL.rules}</p>
            <p>A stablecoin is digital money that holds a steady value against a currency. MYRT follows the ringgit, XSGD the Singapore dollar, USDT and USDC the US dollar.</p>
            <p>
              Your gift goes to the cause's own address on Ethereum. Nothing is held back on the way, and we do not take a cut of a gift. The only cost is the network fee your wallet pays to send it, which the
              wallet shows you before you confirm.
            </p>
          </Section>

          <Section
            id="listing"
            title="Who lists a cause"
            lead="The organisation lists itself, and it sets the wallet its gifts arrive at."
          >
            <Figure
              className="mt-6"
              caption="The charity pins up its own listing. Change the address on it and the tick comes off."
            >
              <ListedByTheCharity />
            </Figure>
            <p>
              A charity writes its own listing, in its own words, and sets the address that receives the gifts. So you never have to wonder whose wallet your gift lands in. It is the organisation's own, by
              design.
            </p>
            <p>
              Change that address and the cause loses Verified at once. The payout wallet claim (C3) then has to be checked again, with a new message signed by the new wallet. Verified means every required
              check has passed. See <a href="#verification">how a cause is checked</a>.
            </p>
            <p>
              Somebody may list a cause for an organisation that agrees to it, for example a volunteer helping a group that is not online. They are asked to use the organisation's own payout wallet, and to send
              the organisation an invite link so it can take the listing over.
            </p>
            <p>Listing is the organisation's job. Checking the listing is open to everyone, which is the next section.</p>
          </Section>

          <Section
            id="verification"
            title="How a cause is checked"
            lead="One claim at a time, in the open, by anyone who wants to check it."
          >
            <Figure className="mt-6" tone="card" cap="max-w-[680px]" caption="One claim at a time: evidence, a written path back to the source, a vote, then time to object.">
              <HowChecked />
            </Figure>
            <p>
              A claim is one fact with a clear yes or no. A cause is Verified when C1, C2, C3 and C4 are all verified, plus C6 where the law needs a care licence. C5 and C7 are badges on the cause and are not
              part of Verified.
            </p>
            <p>A check is a signal, not a lock. It tells you what has been found about the organisation. The gift reaches the cause either way.</p>
            <ScrollTable min="min-w-[48rem]">
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
              Anyone can upload evidence: a document, a link, a photo, a video, or a message signed by a wallet. Personal details are blacked out first. We take a fingerprint of every file and record it, so
              nobody can swap a file later. Each piece shows who uploaded it and when.
            </p>

            <h3>Verification paths</h3>
            <p>
              A path is a written note of exactly how one person checked one claim. It uses a fixed form: the source, the steps, the exact search, what they found, whether it matches the profile, a dated
              screenshot, the result, anything the source does not show, and a line about any connection the writer has to the organisation.
            </p>
            <p>
              One claim per path. A path with no source, no steps and no dated screenshot cannot be sent. Paths are public, permanent and signed. Paths that agree, written by different helpers, count for more.
              "Not verified" and "Could not check" are useful results, and they earn the same as "Verified" when the final result agrees.
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
                <tr><td>Least total vote weight needed (quorum)</td><td className="num">{VOTING.quorumWeight}</td></tr>
                <tr><td>Share of that weight saying Verified (threshold)</td><td className="num">{VOTING.thresholdPct}%</td></tr>
                <tr><td>Time to object after a claim passes</td><td className="num">{VOTING.challengeWindowHours} hours</td></tr>
                <tr><td>Choices</td><td>Verified, Not verified, Needs more evidence</td></tr>
              </tbody>
            </ScrollTable>
            <p>
              You have to open the paths first. The vote button sits under them and unlocks only once you have opened one. A "Needs more evidence" result reopens the claim, and is not a fail. Once a claim
              passes, anyone can still <a href="#challenges">object to the result</a> inside that window.
            </p>

            <h3>Who can vote</h3>
            <p>
              You need a wallet that has passed screening, and that has either made one gift with <a href="#gsera">gSera</a> credited, or written and signed one verification path. Screening is the Sera.cx check
              that money is not linked to crime. Help that a cause confirmed does not count, because only that cause can say it happened.
            </p>

            <h3>Vote weight and reputation</h3>
            <p>
              Vote weight is how much one vote counts. Reputation is what you have built up by being right. Neither gSera nor XP adds vote weight, so points cannot buy verification.
            </p>
            <p>
              weight = 1 + min({VOTE_WEIGHT.max - VOTE_WEIGHT.min}, log2(1 + reputation)), so it sits between {VOTE_WEIGHT.min} and {VOTE_WEIGHT.max}. A new voter counts as {VOTE_WEIGHT.min}. Reputation grows
              by {REPUTATION.agrees} for each vote and each path that matches a final, unchallenged result, and drops by {Math.abs(REPUTATION.overturned)} for each one a successful challenge overturns.
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

            <h3>Who settles a claim today</h3>
            <p>
              Current mode: <span className="font-mono">{verificationMode}</span>. In advisory mode, votes and tallies are shown and Sera.cx <a href="#stewards">stewards</a> settle every claim. In community
              mode, the votes decide and stewards step in only on disputes and legal problems. Switching is one setting.
            </p>
          </Section>

          <Section
            id="gsera"
            title="gSera, for giving"
            lead={`Giving earns gSera: ${GSERA.perUsd} for every US$1 that reaches the cause, then multiplied by up to ${GSERA.compoundCap}x.`}
          >
            <Figure className="mt-6" cap="max-w-[540px]" caption="A gift earns a coin you can spend. Checking a charity earns standing, which you cannot.">
              <CoinAndBadge />
            </Figure>
            <p>
              gSera is the reward points balance you share with{" "}
              <a href={LINKS.gsera} target="_blank" rel="noopener noreferrer">
                g.sera.cx
              </a>
              . It reaches your wallet when the gift arrives and passes screening. There is nothing to refund, so there is no waiting period. Helping earns <a href="#xp">Care XP</a> instead.
            </p>

            <h3>What a gift earns</h3>
            <p>
              gSera per gift = the gift in US$ x {GSERA.perUsd} x heat x volume tier x streak. A multiplier makes the base rate bigger, the four are multiplied together, and the total is capped at{" "}
              {GSERA.compoundCap}x.
            </p>
            <ScrollTable>
              <thead>
                <tr><th>Multiplier</th><th>Range</th><th>Note</th></tr>
              </thead>
              <tbody>
                <tr><td className="whitespace-nowrap">Base</td><td className="num">{GSERA.perUsd} per US$1</td><td>Measured at the value the cause receives. The same as a taker on Sera.cx.</td></tr>
                <tr><td className="whitespace-nowrap">Heat</td><td className="num">{fmtMultiplier(GSERA.heat.normal)} to {fmtMultiplier(GSERA.heat.urgent)}</td><td>An urgent appeal chosen by Sera.cx: {fmtMultiplier(GSERA.heat.urgent)}. Every other cause: {fmtMultiplier(GSERA.heat.normal)}. Proposed.</td></tr>
                <tr><td className="whitespace-nowrap">Volume tier</td><td className="num">{fmtMultiplier(GSERA.volumeTier.min)} to {fmtMultiplier(GSERA.volumeTier.max)}</td><td>The same season ladder as swaps. Gifts count towards it.</td></tr>
                <tr><td className="whitespace-nowrap">Streak</td><td className="num">{fmtMultiplier(GSERA.streak.min)} to {fmtMultiplier(GSERA.streak.max)}</td><td>Weekly, Monday to Sunday UTC. A gift keeps a streak alive.</td></tr>
                <tr><td className="whitespace-nowrap">Power Hour</td><td className="num">1.0x</td><td>Not used on gifts.</td></tr>
              </tbody>
            </ScrollTable>
            <p>
              An example. You give US$50, about {fmtRm(50)}, to an urgent appeal. You are on a 1.2x volume tier and a 1.1x streak. That earns 50 x {GSERA.perUsd} x {GSERA.heat.urgent} x 1.2 x 1.1 ={" "}
              {fmtInt(example)} gSera.
            </p>
            <p>
              A gift that settles through a Sera.cx swap earns once, at the giver's rate. The swap leg does not also earn taker gSera. A gift already in the cause's own stablecoin still earns, because the point
              is the gift, not the swap.
            </p>

            <h3>What gSera is for here</h3>
            <p>
              gSera from a gift is tagged by where it came from, so it is always clear what was earned by giving. On this site it has one use: staking it to <a href="#challenges">object to a check</a> you
              believe is wrong. Staking never lowers your lifetime rank. Everything else gSera does is on g.sera.cx.
            </p>

            <h3>Stopping people gaming it</h3>
            <ul>
              <li>A wallet linked to a cause's owner or its payout wallet earns no gSera on that cause. Linked means the same address, funded straight from it within 30 days, or grouped with it by Sera.cx screening.</li>
              <li>Gifts earn gSera up to US${fmtInt(GSERA.giftCapUsdPerWalletPerCausePer30d)} per wallet, per cause, per {GSERA.giftCapWindowDays} days. A gift above that is still recorded, but earns 0x. Proposed.</li>
              <li>Every gift passes Sera.cx screening. A flagged gift earns no gSera.</li>
            </ul>
          </Section>

          <Section
            id="xp"
            title="Care XP, for helping"
            lead="Help that a stranger can check earns XP, which is standing on community.sera.cx and not money."
          >
            <p>
              XP is your standing in the Care track of the Sera.cx community programme, not a balance you can spend. It is kept on{" "}
              <a href={LINKS.community} target="_blank" rel="noopener noreferrer">
                {COMMUNITY_SITE}
              </a>
              , not here.
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
            <p>Every XP number in that table is proposed, pending the community team's assessment.</p>
            <p>
              Each event is recorded on causes.sera.cx the moment you earn it: once per listing, path, vote, piece of evidence or challenge. It is credited on {COMMUNITY_SITE} once the link between the two
              sites is live. Until then your XP is held here and nothing is lost.
            </p>
            <p>Every event in that table rests on something a stranger can check. Work only the cause can confirm earns a <a href="#badges">badge</a> instead.</p>
          </Section>

          <Section
            id="badges"
            title="Badges, for work only the cause can confirm"
            lead="A badge is a mark on your profile, and that is all it is."
          >
            <Figure className="mt-6" cap="max-w-[620px]" caption="Work anyone can repeat earns XP. Work only the charity can confirm earns a badge.">
              <XpOrBadge />
            </Figure>
            <p>
              Some work cannot be checked by anybody but the cause: a translation, a visit, an introduction. Paying points for it would mean paying on one organisation's word, and a charity could hand points to
              a friend all day long. So that work earns a badge.
            </p>
            <p>Badges are not ranked, they carry no amount, they cannot be spent, and each one is earned once. They unlock nothing: not voting, not vote weight, not XP.</p>
            <ScrollTable>
              <thead>
                <tr><th>Badge</th><th>How it is earned</th></tr>
              </thead>
              <tbody>
                {HELPER_BADGE_SLUGS.map((slug) => (
                  <tr key={slug}>
                    <td className="whitespace-nowrap">{HELPER_BADGES[slug].label}</td>
                    <td>{HELPER_BADGES[slug].earnedBy}</td>
                  </tr>
                ))}
              </tbody>
            </ScrollTable>
            <p>Your badges are on your own page, under your reputation.</p>
          </Section>

          <Section
            id="challenges"
            title="Challenges, when you think a check is wrong"
            lead={`Stake ${fmtInt(CHALLENGE_STAKE)} gSera, show evidence against the claim, and that one claim is voted on again.`}
          >
            <Figure className="mt-6" tone="card" cap="max-w-[680px]" caption="A stake and your evidence reopen one claim. Upheld, the stake comes back. Not upheld, it is gone.">
              <WhenSomeoneObjects />
            </Figure>
            <p>
              Anyone can challenge a verified or nearly final claim. Staking means locking up that much of your own gSera until the result, and the amount, {fmtInt(CHALLENGE_STAKE)} gSera, is proposed. You
              upload evidence against the claim and write your own path, on the same form as any other path.
            </p>
            <ul>
              <li>Voting on that claim reopens for {VOTING.periodDays} days, with the challenge shown at the top.</li>
              <li>
                Upheld: the claim flips, your stake comes back with {fmtInt(XP.care_challenge_upheld.amount)} XP on {COMMUNITY_SITE}, and everyone whose path or vote was overturned loses{" "}
                {Math.abs(REPUTATION.overturned)} reputation. If it was a required claim, the cause loses Verified.
              </li>
              <li>Not upheld: the stake is burned, which means it is gone for good.</li>
            </ul>
          </Section>

          <Section
            id="stewards"
            title="Stewards"
            lead="A Sera.cx steward can pause, settle and remove, always with a written reason. A steward cannot touch the money."
          >
            <Figure className="mt-6" cap="max-w-[660px]" caption="Four things a steward may reach, each written on the record. The gifts are on the other side of the rope.">
              <WhatStewardsCanDo />
            </Figure>
            <p>Stewards are a small Sera.cx group. They act through one shared account that needs several of their keys, so no steward acts alone. While we launch, they can:</p>
            <ul>
              <li>settle or overturn a claim where voting is stuck, or there is clear fraud or a legal problem;</li>
              <li>pause a cause at once on a believable report of fraud, harm or a legal notice;</li>
              <li>remove evidence that carries personal details, or that defames someone;</li>
              <li>pin one urgent appeal at a time, with a written reason;</li>
              <li>take a cause off the home page, with a public reason.</li>
            </ul>
            <p>
              Every steward action goes on the cause's record with a written reason. Gifts are not theirs to move: a gift goes to the cause's own address, and no steward can call it back or hold it. The aim is
              that stewards end up handling legal takedowns and nothing else.
            </p>
          </Section>

          <Section
            id="reports"
            title="What we do with a report"
            lead="We read every report, and a believable report of fraud or harm pauses the cause while we look."
          >
            <p>
              You can report a cause, a piece of evidence or a person from the cause page, or by email to <a href="mailto:security@sera.cx">security@sera.cx</a>. A report about personal details removes the file
              first and asks questions after. We tell you what we did, and the action goes on the record with its reason, like any other <a href="#stewards">steward action</a>.
            </p>
          </Section>

          <Section
            id="data"
            title="Personal data"
            lead="We keep no personal details of individuals, on a profile or in a file."
          >
            <ul>
              <li>A profile carries organisation contacts only. No personal phone numbers, home addresses or bank details of individuals.</li>
              <li>Evidence is blacked out before upload: IC numbers, home addresses, personal phone numbers and signatures. The upload form warns you, and we reject files that still show them.</li>
              <li>Wallets show as short addresses. You can keep yourself off the leaderboards.</li>
              <li>Share counts are kept per channel, with no personal data in them.</li>
            </ul>
          </Section>

          <Section id="faq" title="FAQ" lead="The questions we are asked most, answered in a line each.">
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
          </Section>
        </div>
      </div>
    </div>
  );
}
