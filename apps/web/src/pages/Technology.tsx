/* How it works, told in pictures.
   The old version of this page was a wall of prose that nobody read. The
   drawings in components/illustrations carry the mechanism now, and the
   words are down to a caption and a sentence or two per section, kept
   plain enough for a reader whose first language is not English. */
import { ArrowRight, ExternalLink } from "lucide-react";
import { type ReactNode } from "react";
import { Link } from "wouter";
import { Empty, ErrorState, Spinner } from "@/components/Empty";
import { Eyebrow } from "@/components/Eyebrow";
import { GfCard, GreenField } from "@/components/GreenField";
import { Wallet } from "@/components/Wallet";
import {
  BuildOnIt,
  CoinAndBadge,
  Figure,
  HowChecked,
  OpenList,
  PublicRecord,
  StraightToTheCause,
  TwoJars,
} from "@/components/illustrations";
import { useSeo } from "@/hooks/useSeo";
import { CHALLENGE_STAKE, COMMUNITY_SITE, LINKS, VOTING } from "@/lib/constants";
import { fmtDate, fmtGsera } from "@/lib/format";
import { useLatestEvents } from "@/lib/queries";
import { describeRecord } from "@/lib/record";
import { causeHref } from "@/lib/rules";
import { ROUTE_SEO } from "@/lib/seo";
import { cn } from "@/lib/utils";

const EXPLORER = "https://sepolia.etherscan.io/tx/";

export function TechnologyPage() {
  useSeo(ROUTE_SEO.technology);
  return (
    <>
      <Hero />

      <Scene
        id="registry"
        n="01"
        title="One open list of causes"
        caption="One notice board. Every house reads the same list."
        art={<OpenList />}
      >
        <p>Every cause sits on one public list. It is kept on Ethereum, a shared computer no company owns. Any website can read it. Ours is only one of them.</p>
      </Scene>

      <Scene
        id="gifts"
        n="02"
        title="Your gift goes straight to the cause"
        caption="A tin you can see through, on the cause's own doorstep."
        art={<StraightToTheCause />}
        flip
      >
        <p>Each cause has its own address for money, like its own post box. Your gift lands there. Nothing is held back, and nobody has to claim it.</p>
        <p>Giving in a currency the cause does not keep? Sera.cx changes it on the way, at a rate you see first.</p>
      </Scene>

      <Scene
        id="treasury"
        n="03"
        title="What the cause does with it"
        caption="Two jars. The cause picks one."
        art={<TwoJars />}
      >
        <p>The cause picks how to hold the money. Change it to one currency as it arrives, or keep it as it comes and change it later.</p>
      </Scene>

      <Wide
        id="verification"
        n="04"
        title="How a cause gets checked"
        caption="One fact at a time, checked in the open."
        art={<HowChecked />}
        cap="max-w-[680px]"
        tone="card"
      >
        <p>We check one fact at a time. Is the charity registered? Is it still registered today? Is the money address really theirs? Is the work real? Helpers write down every step they took, then people vote, then anyone may object.</p>
        <p>A check tells you what we have found. It does not block the money. A gift reaches the cause either way.</p>
        <p>While we are new, a Sera.cx steward signs off each result.</p>
      </Wide>

      <GreenField kicker="What a check needs" title="Every claim clears the same bar." footer={false} className="border-y border-rule">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <GfCard label="Separate checks" ticker="Before voting starts" figure={String(VOTING.minPaths)} />
          <GfCard label="Days to vote" ticker="Anyone who has earned a vote" figure={String(VOTING.periodDays)} tab="#00E676" />
          <GfCard label="Must say yes" ticker="Share of the votes" figure={`${VOTING.thresholdPct}%`} tab="#59E39A" />
          <GfCard label="Time to object" ticker={`Costs ${fmtGsera(CHALLENGE_STAKE)} to try`} figure={`${VOTING.challengeWindowHours}h`} tab="#FFFFFF" />
        </div>
      </GreenField>

      <Wide
        id="record"
        n="05"
        title="The record"
        caption="Every gift, swap, check and update, printed in order."
        art={<PublicRecord />}
      >
        <p>Every gift, change, check and update is written down in order. Nobody can delete a line later.</p>
      </Wide>

      <section className="container pb-12 md:pb-16" aria-label="Latest events across every cause">
        <LatestRecord />
      </section>

      <Scene
        id="earning"
        n="06"
        title="What you earn"
        caption="A coin for giving. A badge for helping."
        art={<CoinAndBadge />}
        flip
      >
        <p>
          Give, and you earn gSera on{" "}
          <a href={LINKS.gsera} target="_blank" rel="noopener noreferrer" className="underline underline-offset-[3px] text-sera-text">
            g.sera.cx
          </a>
          . Help check a charity, and you earn XP on{" "}
          <a href={LINKS.community} target="_blank" rel="noopener noreferrer" className="underline underline-offset-[3px] text-sera-text">
            {COMMUNITY_SITE}
          </a>
          . gSera you can spend. XP is a score for helping, not money.
        </p>
      </Scene>

      <Scene
        id="build"
        n="07"
        title="Build on it"
        caption="The plans are public. Anyone can build their own."
        art={<BuildOnIt />}
      >
        <p>The code is open. Anyone can read the list, keep a copy, or build their own website on it.</p>
        <ul className="mt-5 space-y-2 font-mono text-[12.5px] text-ink-muted">
          <li>
            <a href={LINKS.github} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sera-text underline underline-offset-[3px]">
              Code on GitHub <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </li>
          <li>
            <code>/api/v1</code> is open to read, no key needed.
          </li>
        </ul>
      </Scene>

      <section id="safety" className="border-t border-rule bg-paper-warm" aria-labelledby="safety-h">
        <div className="container py-12 md:py-16">
          <Eyebrow>08</Eyebrow>
          <h2 id="safety-h" className="mt-3 max-w-[20ch] font-display text-[26px] font-semibold leading-[1.1] tracking-[-0.025em] sm:text-[32px]">
            Safety
          </h2>
          <div className="mt-4 max-w-[35rem] text-[17px] leading-[1.6] text-ink-muted">
            <p>Outside experts review the code before launch. Every gift and every voter is screened. Found a problem? Write to <a href="mailto:security@sera.cx" className="text-sera-text underline underline-offset-[3px]">security@sera.cx</a>.</p>
          </div>
          <Link href="/rules" className="mt-6 inline-flex items-center gap-1.5 text-[16px] font-semibold text-ink hover:text-sera-text">
            Every number is on the rules page <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>
    </>
  );
}

function Hero() {
  return (
    <section className="border-b border-rule">
      <div className="container py-10 md:py-16">
        <Eyebrow>How it works</Eyebrow>
        <h1 className="mt-4 max-w-[16ch] font-display text-[38px] leading-[1.02] font-semibold tracking-[-0.03em] sm:text-[52px] md:text-[60px]">
          How it works, <em>in pictures</em>.
        </h1>
        <p className="mt-5 max-w-[36rem] text-[17px] leading-[1.55] text-ink-muted sm:text-[19px]">One open list of charities. You give, the gift goes straight there, and everyone can see what happened.</p>
      </div>
    </section>
  );
}

type SceneProps = {
  id: string;
  n: string;
  title: string;
  caption: ReactNode;
  art: ReactNode;
  children: ReactNode;
  flip?: boolean;
};

/* Drawing on one side, a sentence or two on the other. The text track is
   the wider of the two on both sides of the flip, which lands the prose at
   72 to 75 characters instead of letting it run the width of a monitor. */
function Scene({ id, n, title, caption, art, children, flip }: SceneProps) {
  return (
    <section id={id} className="border-t border-rule first:border-t-0" aria-labelledby={`${id}-h`}>
      <div className={cn("container grid items-center gap-8 py-12 md:gap-12 md:py-16", flip ? "md:grid-cols-[1fr_1.2fr]" : "md:grid-cols-[1.2fr_1fr]")}>
        <div className={cn("max-w-[38rem]", flip && "md:order-2")}>
          <Eyebrow>{n}</Eyebrow>
          <h2 id={`${id}-h`} className="mt-3 font-display text-[26px] font-semibold leading-[1.1] tracking-[-0.025em] sm:text-[32px]">
            {title}
          </h2>
          <div className="mt-4 space-y-3.5 text-[17px] leading-[1.6] text-ink-muted">{children}</div>
        </div>
        <Figure caption={caption} className={cn(flip && "md:order-1")}>
          {art}
        </Figure>
      </div>
    </section>
  );
}

/* The two scenes that need the room: the checks, and the record. */
function Wide({ id, n, title, caption, art, children, cap, tone = "warm" }: Omit<SceneProps, "flip"> & { cap?: string; tone?: "warm" | "card" }) {
  return (
    <section id={id} className={cn("border-t border-rule", tone === "card" && "bg-paper-warm")} aria-labelledby={`${id}-h`}>
      <div className="container py-12 md:py-16">
        <Eyebrow>{n}</Eyebrow>
        <h2 id={`${id}-h`} className="mt-3 max-w-[20ch] font-display text-[26px] font-semibold leading-[1.1] tracking-[-0.025em] sm:text-[32px]">
          {title}
        </h2>
        <div className="mt-4 max-w-[35rem] space-y-3.5 text-[17px] leading-[1.6] text-ink-muted">{children}</div>
        <Figure caption={caption} cap={cap} tone={tone} className="mt-8">
          {art}
        </Figure>
      </div>
    </section>
  );
}

function LatestRecord() {
  const q = useLatestEvents(10);
  if (q.isLoading) return <Spinner label="Loading the record" />;
  // Without this the block is simply blank when the site cannot reach the
  // record, which reads as "nothing has ever happened" rather than "we could
  // not check". Say which it is.
  if (q.isError) {
    return (
      <ErrorState
        title="We could not load the record just now"
        error={q.error}
        onRetry={() => void q.refetch()}
      />
    );
  }
  if (!q.data?.length) {
    return (
      <Empty title="Nothing on the record yet" body="The first gift, check or update will show up here." />
    );
  }
  return (
    <div className="rounded-2xl border border-rule bg-card p-4 sm:p-5">
      <Eyebrow>Latest events</Eyebrow>
      <ol className="mt-3 divide-y divide-rule">
        {(q.data ?? []).map((e, i) => {
          const l = describeRecord(e, i);
          return (
            <li key={l.key} className="grid gap-0.5 py-2.5 text-[14px] sm:grid-cols-[150px_1fr_auto] sm:items-baseline sm:gap-3">
              <time dateTime={e.at} className="font-mono text-[11.5px] text-ink-subtle tnum">
                {fmtDate(e.at, true)}
              </time>
              <span>
                <Link href={causeHref(e.causeId, e.causeSlug)} className="font-medium hover:text-sera-text">
                  {e.causeName}
                </Link>
                <span className="text-ink-muted">: {l.summary}</span>
                {l.by && (
                  <span className="text-ink-muted">
                    {" "}
                    by <Wallet address={l.by} you={false} />
                  </span>
                )}
              </span>
              {l.txHash && (
                <a href={`${EXPLORER}${l.txHash}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-[11px] text-sera-text" aria-label="Transaction">
                  tx <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
