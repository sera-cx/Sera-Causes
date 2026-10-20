import { ArrowRight, Flame, HandHeart, Languages, MapPin, Search } from "lucide-react";
import { Link } from "wouter";
import { CauseCard, CauseCardSkeleton } from "@/components/CauseCard";
import { ChecksBar } from "@/components/ChecksBar";
import { Empty, ErrorState } from "@/components/Empty";
import { Eyebrow } from "@/components/Eyebrow";
import { GfCard, GreenField } from "@/components/GreenField";
import { PhotoCredit } from "@/components/PhotoCredit";
import { SectionHeader } from "@/components/SectionHeader";
import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { CategoryMark, CheckACharity, CloseToHome, GiveEarnUse } from "@/components/illustrations";
import { useJsonLdMany } from "@/hooks/useJsonLd";
import { useSeo } from "@/hooks/useSeo";
import { useAuth } from "@/lib/auth";
import { COMMUNITY_SITE, GSERA, LINKS, TRIAL, XP } from "@/lib/constants";
import { fmtCompactUsd, fmtInt, fmtMultiplier, fmtRm } from "@/lib/format";
import { HERO_IMAGE_SRC, causeImage, imageUrl } from "@/lib/images";
import { useHome, useMe } from "@/lib/queries";
import { causeHref } from "@/lib/rules";
import { ROUTE_SEO } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { causeListSchema, organizationSchema, websiteSchema } from "@/lib/seoSchemas";
import type { HomeData } from "@/lib/types";

const HERO_IMAGE = {
  src: imageUrl(HERO_IMAGE_SRC),
  alt: "A green turtle hatchling resting in a coconut shell on the sand at Pantai Chendor, Pahang",
  credit: "Kasih Turtle Conservation Project, Pantai Chendor",
  licence: "Supplied",
};

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
      <NumbersStrip stats={data?.stats} />
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

function Hero({ empty }: { empty: boolean }) {
  return (
    <section className="relative overflow-hidden border-b border-rule">
      <img src="/brand/mark/sera-mark-color.svg" alt="" aria-hidden className="pointer-events-none absolute -right-16 -top-10 h-[420px] w-auto opacity-[0.045] select-none hidden md:block" />
      <div className="container grid gap-8 py-10 md:grid-cols-[1.05fr_1fr] md:items-center md:py-16 lg:py-20">
        <div className="rise-in">
          <Eyebrow>Care. Share. Donate.</Eyebrow>
          <h1 className="mt-4 font-display text-[38px] leading-[1.02] font-semibold tracking-[-0.03em] sm:text-[52px] md:text-[60px]">
            {empty ? (
              <>
                Giving to Malaysian charities, <em>in the open</em>.
              </>
            ) : (
              <>
                Give to the causes <em>you</em> care about.
              </>
            )}
          </h1>
          {empty ? (
            <>
              <p className="mt-5 measure-lede text-[17px] leading-[1.55] text-ink-muted sm:text-[19px]">
                We are building one open list of Malaysian charities. A charity lists itself and sets its own address for money. You give in stablecoins, which are digital money that holds a steady
                value, and the gift goes straight there. Nothing is held back.
              </p>
              <p className="mt-3 measure text-[15px] leading-[1.55] text-ink-muted">
                Anyone can help check a charity, and anyone can read every gift, check and update. The list is empty today, so we are looking for the first charities to join.
              </p>
            </>
          ) : (
            <>
              <p className="mt-5 measure-lede text-[17px] leading-[1.55] text-ink-muted sm:text-[19px]">
                Turtle hatcheries, animal shelters, children's homes, food banks and flood relief across Malaysia. You give in stablecoins, which are digital money that holds a steady value, and the gift
                goes straight to the charity.
              </p>
              <p className="mt-3 measure text-[15px] leading-[1.55] text-ink-muted">You can also help check a charity, and anyone can see where every gift went.</p>
            </>
          )}
          <div className="mt-7 flex flex-wrap items-center gap-3">
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
          <p className="mt-6 measure text-[13.5px] leading-[1.5] text-ink-subtle">{TRIAL.home}</p>
        </div>
        <figure className="relative">
          <div className="overflow-hidden rounded-2xl aspect-[4/3] bg-paper-warm">
            <img src={HERO_IMAGE.src} alt={HERO_IMAGE.alt} className="h-full w-full object-cover" fetchPriority="high" decoding="async" width={1200} height={900} />
          </div>
          <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <PhotoCredit image={HERO_IMAGE} />
            <Link href={causeHref(1, "kasih-turtle-conservation-project")} className="inline-flex min-h-11 items-center font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-subtle hover:text-ink sm:min-h-0">
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

function NumbersStrip({ stats }: { stats?: HomeData["stats"] }) {
  // A wall of zeros says less than no wall at all, so each card has to earn
  // its place and the band only appears once at least two of them have.
  if (!stats) return null;
  const givenUsd = Number(stats.givenUsd ?? 0);
  const cards = [
    stats.causes > 0 && (
      <GfCard
        key="causes"
        label="Causes listed"
        ticker="Malaysia"
        figure={fmtInt(stats.causes)}
        meta={[
          { label: "verified", value: fmtInt(stats.verified) },
          { label: "givers", value: fmtInt(stats.givers) },
        ]}
      />
    ),
    stats.verified > 0 && (
      <GfCard key="verified" label="Verified" ticker="All required checks done" figure={fmtInt(stats.verified)} meta={[{ label: "of", value: fmtInt(stats.causes) }]} tab="#00E676" />
    ),
    givenUsd >= 1000 && (
      <GfCard
        key="given"
        label="Given so far"
        ticker="Stablecoins"
        figure={fmtCompactUsd(givenUsd)}
        meta={[
          { label: "about", value: fmtRm(givenUsd) },
          { label: "givers", value: fmtInt(stats.givers) },
        ]}
        tab="#59E39A"
      />
    ),
    stats.helpers > 0 && (
      <GfCard key="helpers" label="Helpers" ticker="Checks written" figure={fmtInt(stats.helpers)} meta={[{ label: "earn", value: `${fmtInt(XP.care_path_agreed.amount)} XP per check` }]} tab="#FFFFFF" />
    ),
  ].filter(Boolean);

  if (cards.length < 2) return null;

  return (
    <GreenField kicker="Care Share Donate" title="Every gift, every check, in the open." footer={false} className="border-b border-rule">
      <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", cards.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3")}>{cards}</div>
    </GreenField>
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
    { icon: Search, title: "Check a charity", body: "Pick a claim, follow the official source we point you at, write down what you did, and earn XP when the result agrees with you.", href: "/verify", cta: "Open the hub" },
    { icon: MapPin, title: "Visit one near you", body: "Dated photos from a visit are one of the two sources the 'the work is real' check needs.", href: "/verify?tab=needs_evidence", cta: "See who needs a visit" },
    { icon: Languages, title: "Translate a profile", body: "Into Bahasa Malaysia, Chinese or Tamil. Keep the names and the numbers exactly as they are.", href: "/causes", cta: "Find a profile" },
  ];
  return (
    <section className="border-t border-rule" aria-labelledby="help-heading">
      <div className="container py-12 md:py-16">
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
          <SectionHeader
            kicker="Help without money"
            title={<span id="help-heading">No wallet balance needed.</span>}
            lede={`Organisations list themselves here. Checking them is open to everyone, and every bit of help earns XP on ${COMMUNITY_SITE}. A help request you finish earns ${fmtInt(XP.care_help_fulfilled.amount)} XP, an accepted check ${fmtInt(XP.care_path_agreed.amount)} XP.`}
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
  const steps = [
    { n: "01", title: "Give to a cause", body: "Give in stablecoins to any cause on the list, either from this site or straight to the cause's own address." },
    { n: "02", title: "Earn gSera", body: `${fmtInt(GSERA.perUsd)} gSera for every US$1, the same rate as a swap on Sera.cx. It reaches your wallet as soon as the gift arrives.` },
    { n: "03", title: "Use it, keep your rank", body: "Spend it on g.sera.cx, or stake it to challenge a check you think is wrong. gSera earned from giving goes back to charity and never into the Lucky Draw." },
  ];
  return (
    <section className="border-t border-rule bg-paper-warm" aria-labelledby="gsera-heading">
      <div className="container py-12 md:py-16">
        <SectionHeader
          kicker="How gSera works"
          title={<span id="gsera-heading">One balance with g.sera.cx.</span>}
          lede="gSera is the reward points balance you share with the rest of Sera.cx. Giving earns it."
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
        {user && me.data?.gsera?.multipliers && (
          <p className="mt-5 font-mono text-[12.5px] text-ink-muted tnum">
            Your multipliers this week: volume tier {fmtMultiplier(me.data.gsera.multipliers.volumeTier)}, streak {fmtMultiplier(me.data.gsera.multipliers.streak)}.
          </p>
        )}
      </div>
    </section>
  );
}
