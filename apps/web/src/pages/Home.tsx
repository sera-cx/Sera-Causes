import { ArrowRight, Flame, HandHeart, Languages, MapPin, Search } from "lucide-react";
import { Link } from "wouter";
import { CauseCard, CauseCardSkeleton } from "@/components/CauseCard";
import { ChecksBar } from "@/components/ChecksBar";
import { Empty, ErrorState } from "@/components/Empty";
import { Eyebrow } from "@/components/Eyebrow";
import { SectionHeader } from "@/components/SectionHeader";
import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { CategoryMark, CheckACharity, CloseToHome, Figure, GiftInTheOpen, GiveEarnUse } from "@/components/illustrations";
import { useJsonLdMany } from "@/hooks/useJsonLd";
import { useSeo } from "@/hooks/useSeo";
import { useAuth } from "@/lib/auth";
import { COMMUNITY_SITE, GSERA, LINKS, TRIAL, XP } from "@/lib/constants";
import { fmtInt, fmtMultiplier } from "@/lib/format";
import { causeImage } from "@/lib/images";
import { useHome, useMe } from "@/lib/queries";
import { causeHref } from "@/lib/rules";
import { ROUTE_SEO } from "@/lib/seo";
import { causeListSchema, organizationSchema, websiteSchema } from "@/lib/seoSchemas";
import type { HomeData } from "@/lib/types";

/** How many causes the home page shows before sending you to /causes. */
const HOME_FEED_LIMIT = 6;

export function HomePage() {
  useSeo(ROUTE_SEO.home);
  const home = useHome();
  const data = home.data;
  // Only once the data has arrived, so the page does not flip layout mid-load.
  const empty = data?.stats.causes === 0;
  useJsonLdMany([
    { id: "organization", node: organizationSchema() },
    { id: "website", node: websiteSchema() },
    { id: "feed", node: data?.feed.length ? causeListSchema(data.feed, "Causes on Care Share Donate", "/causes") : null },
  ]);

  return (
    <>
      <Hero empty={empty} />
      {data?.urgent && <UrgentAppeal urgent={data.urgent} />}
      {/* Nothing listed yet: the hero already asks organisations to list, so a
          list of nothing, a rail of nothing and a row of empty categories only
          repeat it. /causes keeps its own empty state for anyone who goes
          looking. */}
      {!empty && (
        <>
          <Feed query={home} />
          <NewRail data={data} />
          <BrowseBy data={data} />
        </>
      )}
      <HelpWithoutMoney />
      <HowGseraWorks />
    </>
  );
}

/**
 * The hero. A stranger should leave it knowing two things: what this is, and
 * where we are starting from.
 *
 * Laid out as an opening spread rather than a column of text beside a
 * picture. The headline and the explanation sit side by side so the type
 * block stays short, the drawing then runs the full width of the page as the
 * one thing worth looking at, and the scope of the first run closes the band
 * as a quiet footnote under a hairline.
 */
function Hero({ empty }: { empty: boolean }) {
  return (
    <section className="border-b border-rule">
      <div className="container pt-10 md:pt-12">
        <div className="rise-in grid gap-6 lg:grid-cols-[1.12fr_1fr] lg:items-start lg:gap-14">
          <div>
            <Eyebrow>Care. Share. Donate.</Eyebrow>
            <h1 className="mt-4 font-display text-[36px] font-semibold leading-[1.03] tracking-[-0.03em] sm:text-[48px] lg:text-[56px]">
              {empty ? (
                <>
                  Malaysian charities, listed <em>in the open</em>.
                </>
              ) : (
                <>
                  Give straight to a charity, <em>in the open</em>.
                </>
              )}
            </h1>
          </div>
          {/* The explanation carries the whole idea in three sentences: who
              lists, how the money travels, and who gets to see it. */}
          <div className="lg:pt-2">
            <p className="measure-lede text-[17px] leading-[1.55] text-ink-muted sm:text-[18.5px]">
              {empty
                ? "Your organisation lists itself and sets its own address for money. People give in stablecoins, digital money that holds a steady value, and it arrives straight at that address. Every gift and every check is public, and anyone can help check a charity."
                : "A charity lists itself here and sets its own address for money. You give in stablecoins, digital money that holds a steady value, and it goes straight to that address. Every gift and every check is public, and anyone can help check a charity."}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {empty ? (
                <>
                  <Button asChild size="lg">
                    <Link href="/add">List your cause</Link>
                  </Button>
                  <Button asChild size="lg" variant="outline">
                    <Link href="/technology">How it works</Link>
                  </Button>
                </>
              ) : (
                <>
                  <Button asChild size="lg">
                    <Link href="/causes">
                      <Search className="h-4 w-4" aria-hidden /> Find a cause
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline">
                    <Link href="/rules#verification">How we check charities</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
        <Figure
          className="mt-9 md:mt-10"
          cap="max-w-[800px]"
          caption="A charity posts itself. Your gift goes straight to it. Every gift stays on the record."
        >
          <GiftInTheOpen />
        </Figure>
      </div>
      <FirstRunNote />
    </section>
  );
}

function UrgentAppeal({ urgent }: { urgent: NonNullable<HomeData["urgent"]> }) {
  const c = urgent.cause;
  const img = causeImage(c);
  return (
    <section aria-labelledby="urgent-heading" className="border-b border-rule bg-paper-warm">
      <div className="container py-8 md:py-10">
        <div className="grid gap-6 md:grid-cols-[1fr_1.2fr] md:items-center">
          <Link href={causeHref(c.id, c.slug)} className="block overflow-hidden rounded-xl aspect-[16/10] bg-ink/10 focus-visible:outline-2 focus-visible:outline-ring" aria-label={`${c.name}, read their story`}>
            <img src={img.src} alt={img.alt} className="h-full w-full object-cover" loading="lazy" />
          </Link>
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[#0B1426] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[#00E676]">
              <Flame className="h-3.5 w-3.5" aria-hidden /> Urgent appeal, chosen by Sera.cx
            </div>
            <h2 id="urgent-heading" className="mt-3 font-display text-[28px] sm:text-[34px] font-semibold leading-[1.08] tracking-[-0.025em]">
              {urgent.reason}
            </h2>
            <p className="mt-2 measure text-[16px] text-ink-muted">
              <span className="font-medium text-ink">{c.name}</span>. {c.profile?.summary}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <StatusPill stage={c.stage} checksDone={c.checksDone} checksTotal={c.checksTotal} size="md" />
              <ChecksBar done={c.checksDone} total={c.checksTotal} />
            </div>
            <p className="mt-2 font-mono text-[12px] text-ink-muted">A gift to an urgent appeal earns {fmtMultiplier(GSERA.heat.urgent)} gSera.</p>
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

function Feed({ query }: { query: ReturnType<typeof useHome> }) {
  const data = query.data;
  return (
    <section className="container py-12 md:py-16" aria-labelledby="feed-heading">
      <SectionHeader
        kicker="On the home page"
        title={<span id="feed-heading">Causes, as each organisation chose to show them.</span>}
        lede="Ordered by what happened last: gifts, proof, updates and checks. Every card shows how far the checks have got, so a new cause is never mistaken for a verified one."
        action={
          <Button asChild variant="outline">
            <Link href="/causes">
              All causes <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>
        }
      />
      {query.isError ? (
        <ErrorState className="mt-8" title="We could not load the causes" error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isLoading ? (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <CauseCardSkeleton key={i} />
          ))}
        </div>
      ) : data && data.feed.length === 0 ? (
        // Nothing here means one of two different things, and saying the wrong
        // one is worse than saying nothing: the site may have no causes at
        // all, or it may have plenty that simply have not chosen the home page.
        data.stats.causes > 0 ? (
          <Empty className="mt-8" title="No cause has chosen the home page yet" body="A charity decides whether its cause shows here. They are all on the causes page.">
            <Button asChild variant="outline">
              <Link href="/causes">
                See all {fmtInt(data.stats.causes)} causes <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          </Empty>
        ) : (
          <Empty className="mt-8" title="No causes on the list yet" body="This is a new site, so the list starts empty. If you run a charity in Malaysia, yours could be the first on it.">
            <Button asChild>
              <Link href="/add">List your cause</Link>
            </Button>
          </Empty>
        )
      ) : (
        <>
          {/* A taste, not the whole list: /causes is where you browse and
              filter. Six fills two rows of three and one of two on a tablet. */}
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data?.feed.slice(0, HOME_FEED_LIMIT).map((c) => (
              <CauseCard key={c.id} cause={c} />
            ))}
          </div>
          {/* The count is every cause on the site, not just the ones that chose
              the home page, because that is what /causes will show you. */}
          {(data?.stats.causes ?? 0) > HOME_FEED_LIMIT && (
            <div className="mt-8">
              <Button asChild variant="outline" size="lg">
                <Link href="/causes">
                  See all {fmtInt(data!.stats.causes)} causes <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function NewRail({ data }: { data?: HomeData }) {
  if (!data || data.new.length === 0) return null;
  return (
    <section className="border-t border-rule bg-paper-warm" aria-labelledby="new-heading">
      <div className="container py-12 md:py-14">
        <SectionHeader kicker="New" title={<span id="new-heading">Just listed. Some are still being checked.</span>} lede="An organisation lists itself here, then anyone can help check it. New means nobody has checked it yet." size="sm" />
        <div className="mt-6 -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 snap-x" role="list">
          {data.new.map((c) => (
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
  const categories = data?.categories ?? [];
  if (data && categories.length === 0) return null;
  return (
    <section className="container py-12 md:py-14" aria-labelledby="browse-heading">
      <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
        <SectionHeader kicker="Browse by cause" title={<span id="browse-heading">What do you care about?</span>} size="sm" />
        <CloseToHome className="hidden h-auto w-full max-w-[340px] justify-self-end lg:block" />
      </div>
      <ul className="mt-6 flex flex-wrap gap-2">
        {categories.map((cat) => (
          <li key={cat.slug}>
            <Link href={`/causes?cat=${cat.slug}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-rule bg-card px-4 text-[14.5px] font-medium text-ink hover:border-ink/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <CategoryMark slug={cat.slug} decorative className="h-5 w-5 text-ink-subtle" />
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
    { icon: Search, title: "Check a charity", body: "Pick a claim, follow the official source we point you at, write down what you did, and earn XP when the result agrees with you.", href: "/helpers", cta: "Open the hub" },
    { icon: MapPin, title: "Visit one near you", body: "Dated photos from a visit are one of the two sources the 'the work is real' check needs.", href: "/helpers?tab=needs_evidence", cta: "See who needs a visit" },
    { icon: Languages, title: "Translate a profile", body: "Into Bahasa Malaysia, Chinese or Tamil. Keep the names and the numbers exactly as they are. A cause that confirms your work marks you a Translator.", href: "/causes", cta: "Find a profile" },
  ];
  return (
    <section className="border-t border-rule" aria-labelledby="help-heading">
      <div className="container py-12 md:py-16">
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
          <SectionHeader
            kicker="Help without money"
            title={<span id="help-heading">No wallet balance needed.</span>}
            lede={`Organisations list themselves here, and checking them is open to everyone. A check that agrees with the final result earns ${fmtInt(XP.care_path_agreed.amount)} XP on ${COMMUNITY_SITE}. A help request is different: it is how a cause and a helper arrange work, so finishing one earns a badge and no points.`}
          />
          <CheckACharity className="hidden h-auto w-full max-w-[340px] justify-self-end lg:block" />
        </div>
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
  // Two facts, not three steps. Giving and earning are the same moment, and
  // padding them into separate cards said the same thing twice.
  const facts = [
    {
      title: "What you earn",
      body: `${fmtInt(GSERA.perUsd)} gSera for every US$1, the same rate as a swap on Sera.cx, credited as soon as your gift arrives. An urgent appeal pays ${GSERA.heat.urgent} times that.`,
    },
    {
      title: "What it is for",
      body: "Stake it to object to a check you think is wrong. Get it right and the stake comes back with more on top.",
    },
  ];
  return (
    <section className="border-t border-rule bg-paper-warm" aria-labelledby="gsera-heading">
      <div className="container py-12 md:py-16">
        <SectionHeader
          kicker="How gSera works"
          title={<span id="gsera-heading">Giving earns you gSera.</span>}
          lede="gSera is how Sera.cx recognises what you give. It is the same balance you carry everywhere else on Sera.cx, so giving here counts the same as trading there."
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
        <GiveEarnUse className="mx-auto mt-8 h-auto w-full max-w-[560px]" />
        <dl className="mt-8 grid gap-4 sm:grid-cols-2">
          {facts.map((f) => (
            <div key={f.title} className="rounded-xl border border-rule bg-card p-6">
              <dt className="flex items-center gap-3">
                <HandHeart className="h-5 w-5 text-sera-text" aria-hidden />
                <span className="font-display text-[19px] font-semibold tracking-tight">{f.title}</span>
              </dt>
              <dd className="mt-2 text-[15px] leading-[1.5] text-ink-muted">{f.body}</dd>
            </div>
          ))}
        </dl>
        {user && me.data?.gsera?.multipliers && (
          <p className="mt-5 font-mono text-[12.5px] text-ink-muted tnum">
            Your multipliers this week: volume tier {fmtMultiplier(me.data.gsera.multipliers.volumeTier)}, streak {fmtMultiplier(me.data.gsera.multipliers.streak)}.
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Where we are starting from: the last band of the hero, under a hairline, so
 * it reads as a footnote to the idea rather than a claim of its own. Two
 * facts, each under a mono label, and the YouApp mark sits beside MYRT, the
 * ringgit stablecoin YouApp issues, rather than floating somewhere else.
 *
 * The scope itself comes from TRIAL, so it is written in one place and only
 * split here, where the mark has to land in the middle of the sentence.
 */
function FirstRunNote() {
  return (
    <div className="mt-9 border-t border-rule md:mt-10">
      <div className="container grid gap-x-12 gap-y-6 py-7 md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] md:py-8">
        <div>
          <p className="eyebrow flex items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sera" aria-hidden />
            <span className="whitespace-nowrap">The first run</span>
          </p>
          <p className="mt-2.5 measure text-[14.5px] leading-[1.6] text-ink-muted">{TRIAL.heroWhy}</p>
        </div>
        <div>
          <p className="eyebrow whitespace-nowrap">What you give in</p>
          <p className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[14.5px] leading-[1.6] text-ink-muted">
            <a href="https://youapp.ai" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-medium text-ink hover:text-sera-text">
              MYRT
              {/* The mark is drawn in near-black, so in dark mode it needs a
                  light chip of its own to stay visible. */}
              <span className="inline-flex items-center rounded-[4px] px-1 py-0.5 dark:bg-white">
                <img src="/brand/youapp-logo.svg" alt="from YouApp" className="h-[14px] w-auto" width={118} height={30} />
              </span>
            </a>
            <span>{TRIAL.heroCurrenciesAfterMyrt}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
