import { ArrowRight, Flame, HandHeart, Languages, MapPin, Search } from "lucide-react";
import { Link } from "wouter";
import { CauseCard, CauseCardSkeleton } from "@/components/CauseCard";
import { ChecksBar } from "@/components/ChecksBar";
import { Eyebrow } from "@/components/Eyebrow";
import { GfCard, GreenField } from "@/components/GreenField";
import { PhotoCredit } from "@/components/PhotoCredit";
import { SectionHeader } from "@/components/SectionHeader";
import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { useSeo } from "@/hooks/useSeo";
import { useAuth } from "@/lib/auth";
import { GSERA, LINKS } from "@/lib/constants";
import { fmtCompactUsd, fmtInt, fmtMultiplier } from "@/lib/format";
import { useHome, useMe } from "@/lib/queries";
import { causeHref } from "@/lib/rules";
import type { HomeData } from "@/lib/types";

const HERO_IMAGE = {
  src: "/photos/hero.jpg",
  alt: "Green turtle hatchling resting in a coconut shell on the sand at Pantai Chendor",
  credit: "Kasih Turtle Conservation Project, Pantai Chendor",
  licence: "Supplied",
};

export function HomePage() {
  useSeo("", "Give to the causes you care about. Turtle hatcheries, animal shelters, children's homes, food banks and flood relief across Malaysia.");
  const home = useHome();
  const data = home.data;

  return (
    <>
      <Hero />
      {data?.urgent && <UrgentAppeal urgent={data.urgent} />}
      <NumbersStrip stats={data?.stats} />
      <Feed data={data} loading={home.isLoading} />
      <NewRail data={data} />
      <BrowseBy data={data} />
      <HelpWithoutMoney />
      <HowGseraWorks />
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-rule">
      <img src="/brand/mark/sera-mark-color.svg" alt="" aria-hidden className="pointer-events-none absolute -right-16 -top-10 h-[420px] w-auto opacity-[0.045] select-none hidden md:block" />
      <div className="container grid gap-8 py-10 md:grid-cols-[1.05fr_1fr] md:items-center md:py-16 lg:py-20">
        <div className="rise-in">
          <Eyebrow>Care. Share. Donate.</Eyebrow>
          <h1 className="mt-4 font-display text-[38px] leading-[1.02] font-semibold tracking-[-0.03em] sm:text-[52px] md:text-[60px]">
            Give to the causes <em>you</em> care about.
          </h1>
          <p className="mt-5 max-w-[52ch] text-[17px] leading-[1.55] text-ink-muted sm:text-[19px]">
            Turtle hatcheries, animal shelters, children's homes, food banks and flood relief across Malaysia. Give in stablecoins, help check the charities, and see where every gift goes.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/causes">
                <Search className="h-4 w-4" aria-hidden /> Find a cause
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/rules#verification">How we check charities</Link>
            </Button>
          </div>
        </div>
        <figure className="relative">
          <div className="overflow-hidden rounded-2xl aspect-[4/3] bg-paper-warm">
            <img src={HERO_IMAGE.src} alt={HERO_IMAGE.alt} className="h-full w-full object-cover" fetchPriority="high" decoding="async" width={1200} height={900} />
          </div>
          <figcaption className="mt-2 flex items-center justify-between gap-3">
            <PhotoCredit image={HERO_IMAGE} />
            <Link href={causeHref(1, "kasih-turtle-conservation-project")} className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-subtle hover:text-ink">
              Kasih, Cherating
            </Link>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

function UrgentAppeal({ urgent }: { urgent: NonNullable<HomeData["urgent"]> }) {
  const c = urgent.cause;
  return (
    <section aria-labelledby="urgent-heading" className="border-b border-rule bg-paper-warm">
      <div className="container py-8 md:py-10">
        <div className="grid gap-6 md:grid-cols-[1fr_1.2fr] md:items-center">
          <Link href={causeHref(c.id, c.slug)} className="block overflow-hidden rounded-xl aspect-[16/10] bg-ink/10 focus-visible:outline-2 focus-visible:outline-ring" aria-label={`${c.name}, read their story`}>
            <img src={c.image?.src} alt={c.image?.alt ?? c.name} className="h-full w-full object-cover" loading="lazy" />
          </Link>
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[#0B1426] px-3 h-7 font-mono text-[11px] uppercase tracking-[0.12em] text-[#00E676]">
              <Flame className="h-3.5 w-3.5" aria-hidden /> Urgent appeal, chosen by Sera.cx
            </div>
            <h2 id="urgent-heading" className="mt-3 font-display text-[28px] sm:text-[34px] font-semibold leading-[1.08] tracking-[-0.025em]">
              {urgent.reason}
            </h2>
            <p className="mt-2 text-[16px] text-ink-muted">
              <span className="font-medium text-ink">{c.name}</span>. {c.summary}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <StatusPill stage={c.stage} checksDone={c.checksDone} checksTotal={c.checksTotal} size="md" />
              <ChecksBar done={c.checksDone} total={c.checksTotal} />
            </div>
            <p className="mt-2 font-mono text-[12px] text-ink-muted">Gifts to an urgent appeal earn {fmtMultiplier(GSERA.heat.urgent)} gSera.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild variant="give" size="lg">
                <Link href={`/give/${c.id}`}>Give to {c.name}</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href={causeHref(c.id, c.slug)}>Read their story</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function NumbersStrip({ stats }: { stats?: HomeData["stats"] }) {
  const showGiven = (stats?.givenUsd ?? 0) >= 1000;
  return (
    <GreenField kicker="Care Share Donate" title="Every gift, every check, in the open." footer={false} className="border-b border-rule">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-busy={!stats}>
        <GfCard label="Causes listed" ticker="Malaysia" figure={stats ? fmtInt(stats.causes) : "…"} meta={[{ label: "verified", value: stats ? fmtInt(stats.verified) : "" }, { label: "givers", value: stats ? fmtInt(stats.giversCount) : "" }]} />
        <GfCard label="Verified" ticker="All required checks done" figure={stats ? fmtInt(stats.verified) : "…"} meta={[{ label: "of", value: stats ? fmtInt(stats.causes) : "" }]} tab="#00E676" />
        {showGiven && <GfCard label="Given so far" ticker="Stablecoins" figure={stats ? fmtCompactUsd(stats.givenUsd) : "…"} meta={[{ label: "givers", value: stats ? fmtInt(stats.giversCount) : "" }]} tab="#59E39A" />}
        <GfCard label="Helpers this month" ticker="Paths written" figure={stats ? fmtInt(stats.helpersThisMonth) : "…"} meta={[{ label: "earn", value: `${fmtInt(GSERA.helper.pathAgrees)} gSera per path` }]} tab="#FFFFFF" />
      </div>
    </GreenField>
  );
}

function Feed({ data, loading }: { data?: HomeData; loading: boolean }) {
  return (
    <section className="container py-12 md:py-16" aria-labelledby="feed-heading">
      <SectionHeader
        kicker="On the homepage"
        title={<span id="feed-heading">Causes, as their creators chose to show them.</span>}
        lede="Ordered by what happened last: gifts, evidence, updates and checks. Every card shows how far the checks have got, so a new cause is never mistaken for a verified one."
        action={
          <Button asChild variant="outline">
            <Link href="/causes">
              All causes <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
        }
      />
      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {loading && Array.from({ length: 6 }, (_, i) => <CauseCardSkeleton key={i} />)}
        {data?.feed.map((c) => (
          <CauseCard key={c.id} cause={c} />
        ))}
      </div>
    </section>
  );
}

function NewRail({ data }: { data?: HomeData }) {
  if (!data) return null;
  return (
    <section className="border-t border-rule bg-paper-warm" aria-labelledby="new-heading">
      <div className="container py-12 md:py-14">
        <SectionHeader kicker="New" title={<span id="new-heading">Just added. Some are still being checked.</span>} size="sm" />
        <div className="mt-6 -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 snap-x" role="list">
          {data.newest.map((c) => (
            <div key={c.id} role="listitem" className="w-[260px] shrink-0 snap-start">
              <CauseCard cause={c} compact />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BrowseBy({ data }: { data?: HomeData }) {
  return (
    <section className="container py-12 md:py-14" aria-labelledby="browse-heading">
      <SectionHeader kicker="Browse by cause" title={<span id="browse-heading">What do you care about?</span>} size="sm" />
      <ul className="mt-6 flex flex-wrap gap-2">
        {(data?.categories ?? []).map((cat) => (
          <li key={cat.slug}>
            <Link href={`/causes?cat=${cat.slug}`} className="inline-flex h-10 items-center gap-2 rounded-full border border-rule bg-card px-4 text-[14.5px] font-medium text-ink hover:border-ink/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              {cat.label}
              <span className="font-mono text-[11.5px] text-ink-subtle tnum">{cat.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HelpWithoutMoney() {
  const cards = [
    { icon: Search, title: "Check a charity", body: "Follow the paths library, write down how you checked, and earn when the outcome agrees.", href: "/verify", cta: "Open the hub" },
    { icon: MapPin, title: "Visit one near you", body: "Dated photos from a visit are one of the two sources a 'work is real' check needs.", href: "/verify?tab=needs_evidence", cta: "See who needs a visit" },
    { icon: Languages, title: "Translate a profile", body: "Bahasa Malaysia, Chinese or Tamil. Keep names and numbers as they are.", href: "/causes", cta: "Find a profile" },
  ];
  return (
    <section className="border-t border-rule" aria-labelledby="help-heading">
      <div className="container py-12 md:py-16">
        <SectionHeader kicker="Help without money" title={<span id="help-heading">No wallet balance needed.</span>} lede={`Every bit of help earns gSera. A fulfilled help request earns ${fmtInt(GSERA.helper.helpFulfilled)}, an accepted check ${fmtInt(GSERA.helper.pathAgrees)}.`} />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {cards.map((c) => (
            <Link key={c.title} href={c.href} className="group rounded-xl border border-rule bg-card p-6 hover:border-ink/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <c.icon className="h-6 w-6 text-sera-text" aria-hidden />
              <h3 className="mt-4 font-display text-[20px] font-semibold tracking-tight">{c.title}</h3>
              <p className="mt-2 text-[15px] leading-[1.5] text-ink-muted">{c.body}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-[14px] font-semibold text-ink group-hover:text-sera-text">
                {c.cta} <ArrowRight className="h-4 w-4" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowGseraWorks() {
  const { user } = useAuth();
  const me = useMe();
  const steps = [
    { n: "01", title: "Give or help", body: "Give in stablecoins to any cause, or check a charity, visit, translate and fulfil help requests." },
    { n: "02", title: "Earn gSera", body: `${fmtInt(GSERA.perUsd)} gSera per US$1, the same rate as swapping on Sera.cx. Credited to your wallet as soon as the gift arrives.` },
    { n: "03", title: "Use it, keep your rank", body: "Spend it on g.sera.cx or stake it to challenge a bad verification. Charity gSera goes back to charity, never into the Lucky Draw." },
  ];
  return (
    <section className="border-t border-rule bg-paper-warm" aria-labelledby="gsera-heading">
      <div className="container py-12 md:py-16">
        <SectionHeader
          kicker="How gSera works"
          title={<span id="gsera-heading">One balance with g.sera.cx.</span>}
          action={
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <Link href="/rules#gsera">Points table</Link>
              </Button>
              <Button asChild variant="link">
                <a href={LINKS.gsera} target="_blank" rel="noopener noreferrer">
                  g.sera.cx
                </a>
              </Button>
            </div>
          }
        />
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n} className="rounded-xl border border-rule bg-card p-6">
              <div className="flex items-center gap-3">
                <span className="font-mono text-[12px] text-ink-subtle">{s.n}</span>
                <HandHeart className="h-5 w-5 text-sera-text" aria-hidden />
              </div>
              <h3 className="mt-3 font-display text-[19px] font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-2 text-[15px] leading-[1.5] text-ink-muted">{s.body}</p>
            </li>
          ))}
        </ol>
        {user && me.data && (
          <p className="mt-5 font-mono text-[12.5px] text-ink-muted tnum">
            Your multipliers this week: volume tier {fmtMultiplier(me.data.multipliers.volumeTier)}, streak {fmtMultiplier(me.data.multipliers.streak)} ({me.data.multipliers.streakWeeks} weeks running).
          </p>
        )}
      </div>
    </section>
  );
}
