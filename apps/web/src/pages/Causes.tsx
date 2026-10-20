import { useMemo } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { CauseCard, CauseCardSkeleton } from "@/components/CauseCard";
import { Empty, ErrorState } from "@/components/Empty";
import { SectionHeader } from "@/components/SectionHeader";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { CategoryMark } from "@/components/illustrations";
import { useJsonLdMany } from "@/hooks/useJsonLd";
import { useSeo } from "@/hooks/useSeo";
import { CATEGORIES, STAGE_INFO, STATE_NAMES, TRIAL, categoryLabel, type CauseStage } from "@/lib/constants";
import { useCauses, useHome } from "@/lib/queries";
import { ROUTE_SEO } from "@/lib/seo";
import { breadcrumbSchema, causeListSchema } from "@/lib/seoSchemas";
import type { CauseFilters } from "@/lib/types";
import { cn } from "@/lib/utils";

/** "Turtles", "Turtles and Marine", "Turtles, Marine and Children". */
function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Read the `cat` parameter as a list. Both a repeated parameter and a comma
 * separated one are accepted, so an old link with one category still works,
 * and unknown slugs are dropped. The result is in the order the categories
 * are declared, which keeps one URL per selection and one query key per
 * selection however the chips were clicked.
 */
export function readCats(p: URLSearchParams): string[] {
  const picked = new Set(
    p
      .getAll("cat")
      .flatMap((v) => v.split(","))
      .map((v) => v.trim())
      .filter(Boolean),
  );
  return CATEGORIES.filter((c) => picked.has(c.slug)).map((c) => c.slug);
}

export function CausesPage() {
  useSeo(ROUTE_SEO.causes);
  const search = useSearch();
  const [, navigate] = useLocation();
  const filters = useMemo<CauseFilters>(() => {
    const p = new URLSearchParams(search);
    return {
      cat: readCats(p),
      state: p.get("state") ?? "",
      status: (p.get("status") as CauseStage | null) ?? "",
      q: p.get("q") ?? "",
      sort: (p.get("sort") as CauseFilters["sort"]) ?? "activity",
    };
  }, [search]);
  const cats = filters.cat ?? [];
  const list = useCauses(filters);
  // Only for the number on each chip. It is the count across the whole list,
  // the same figure the home page shows, so it does not move as the other
  // filters change. No count is shown until it arrives.
  const home = useHome();
  const counts = useMemo(() => new Map((home.data?.categories ?? []).map((c) => [c.slug, c.count])), [home.data]);
  useJsonLdMany([
    { id: "breadcrumb", node: breadcrumbSchema([{ name: "Causes", path: "/causes" }]) },
    { id: "causelist", node: list.data?.length ? causeListSchema(list.data, "Charities on Care Share Donate", "/causes") : null },
  ]);

  /**
   * Write the filters back to the URL. A list joins with commas, so one
   * category stays `?cat=turtles` exactly as before and several read
   * `?cat=turtles,marine`.
   *
   * Typing in the search box replaces the history entry, because every
   * keystroke would otherwise be a step to go back through. Clicking a
   * category is one deliberate act, so it pushes an entry and the back
   * button takes the chip off again.
   */
  const set = (patch: Partial<CauseFilters>, opts: { push?: boolean } = {}) => {
    const p = new URLSearchParams(search);
    for (const [k, v] of Object.entries({ ...filters, ...patch })) {
      const value = Array.isArray(v) ? v.join(",") : v ? String(v) : "";
      if (value && !(k === "sort" && value === "activity")) p.set(k, value);
      else p.delete(k);
    }
    // A comma is legal in a query string, so put it back the way it was
    // written: `?cat=turtles,marine` reads better in a shared link than the
    // escape URLSearchParams produces for it.
    const s = p.toString().replace(/%2C/g, ",");
    navigate(`/causes${s ? `?${s}` : ""}`, { replace: !opts.push });
  };

  const toggleCat = (slug: string) => {
    const on = cats.includes(slug);
    const next = CATEGORIES.filter((c) => (c.slug === slug ? !on : cats.includes(c.slug))).map((c) => c.slug);
    set({ cat: next }, { push: true });
  };

  const active = [...cats, filters.state, filters.status, filters.q].filter(Boolean).length;
  const clearFilters = () => navigate("/causes", { replace: true });
  const catLabels = cats.map((s) => categoryLabel(s));

  // The three states, told apart explicitly. An empty list is the normal
  // first run here, and a failed fetch must never look like a slow one.
  const loading = list.isPending || list.isLoading;
  const failed = list.isError;
  const rows = list.data ?? [];
  const emptyAfterFetch = !loading && !failed && rows.length === 0;

  return (
    <div className="container py-10 md:py-14">
      <SectionHeader level={1} kicker="All causes" title="Find a cause." lede="Filter by what you care about, where it is, and how far the checks have got." />
      <p className="mt-3 measure-lede text-[14px] text-ink-muted">{TRIAL.home}</p>
      <form className="mt-8" onSubmit={(e) => e.preventDefault()} role="search" aria-label="Filter causes">
        {/* Categories are toggles, not a list to pick one from, so they are
            buttons with aria-pressed inside a named group. Several on at
            once means a cause in any of them is shown, and none on means
            every category, which is why there is no "All" chip. */}
        <fieldset className="min-w-0 border-0 p-0">
          <legend className="eyebrow">Categories</legend>
          <p className="mt-1.5 text-[13.5px] text-ink-muted">Pick as many as you like. With none picked you see every category.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => {
              const on = cats.includes(c.slug);
              const count = counts.get(c.slug);
              return (
                <li key={c.slug}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleCat(c.slug)}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-[14.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      on ? "border-sera bg-sera text-[#06120C]" : "border-rule bg-card text-ink hover:border-ink/40",
                    )}
                  >
                    <CategoryMark slug={c.slug} decorative className={cn("h-5 w-5", on ? "text-[#06120C]" : "text-ink-subtle")} />
                    {c.label}
                    {count !== undefined && <span className={cn("font-mono text-[11.5px] tnum", on ? "text-[#06120C]/70" : "text-ink-subtle")}>{count}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </fieldset>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div>
            <Label htmlFor="q">Search</Label>
            <Input id="q" type="search" placeholder="Name, town or registration number" value={filters.q} onChange={(e) => set({ q: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="state">State</Label>
            <Select id="state" value={filters.state} onChange={(e) => set({ state: e.target.value })}>
              <option value="">All</option>
              {STATE_NAMES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="status">Status</Label>
            <Select id="status" value={filters.status} onChange={(e) => set({ status: e.target.value as CauseStage | "" })}>
              <option value="">All</option>
              {(Object.keys(STAGE_INFO) as CauseStage[]).map((s) => (
                <option key={s} value={s}>
                  {STAGE_INFO[s].label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="sort">Sort</Label>
            <Select id="sort" value={filters.sort} onChange={(e) => set({ sort: e.target.value as CauseFilters["sort"] })}>
              <option value="activity">Recent activity</option>
              <option value="newest">Newest</option>
              <option value="checks">Most checks done</option>
              <option value="given">Most given</option>
              <option value="name">Name</option>
            </Select>
          </div>
        </div>
      </form>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[12px] text-ink-muted tnum" aria-live="polite">
          {failed ? "Could not load the list" : loading ? "Loading the list" : `${rows.length} ${rows.length === 1 ? "cause" : "causes"}${catLabels.length > 0 ? ` in ${joinList(catLabels)}` : ""}`}
        </p>
        {active > 0 && (
          <Button variant="link" size="sm" onClick={clearFilters}>
            {active > 1 ? `Clear ${active} filters` : "Clear filters"}
          </Button>
        )}
      </div>

      {failed && (
        <ErrorState className="mt-5" title="We could not load the causes" error={list.error} onRetry={() => void list.refetch()}>
          <Button asChild size="sm" variant="ghost">
            <Link href="/rules">Read the rules instead</Link>
          </Button>
        </ErrorState>
      )}

      {loading && (
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <CauseCardSkeleton key={i} />
          ))}
        </div>
      )}

      {!loading && !failed && rows.length > 0 && (
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((c) => (
            <CauseCard key={c.id} cause={c} />
          ))}
        </div>
      )}

      {/* Zero results reads differently depending on whether the filters did
          it or there is simply nothing listed yet. With categories on, the
          body names them, because a reader who turned three of them on needs
          to know the list is empty across all three. */}
      {emptyAfterFetch && active > 0 && (
        <Empty
          className="mt-6"
          title={catLabels.length > 0 ? `No causes match ${joinList(catLabels)}` : "No causes match those filters"}
          body={catLabels.length > 0 ? "Nothing on the list fits those categories with the other filters you set. Turn a category off, or clear the filters and start again." : "Nothing on the list fits what you asked for. Try fewer filters, or search the whole list."}
        >
          <Button variant="outline" onClick={clearFilters}>
            Clear filters
          </Button>
        </Empty>
      )}
      {emptyAfterFetch && active === 0 && (
        <Empty className="mt-6" title="No causes on the list yet" body="This is a new site, so the list starts empty. If you run a charity in Malaysia, yours could be the first one on it.">
          <Button asChild>
            <Link href="/add">List your cause</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/rules#verification">How we check charities</Link>
          </Button>
        </Empty>
      )}
    </div>
  );
}
