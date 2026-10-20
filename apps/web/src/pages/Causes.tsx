import { useMemo } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { CauseCard, CauseCardSkeleton } from "@/components/CauseCard";
import { Empty, ErrorState } from "@/components/Empty";
import { SectionHeader } from "@/components/SectionHeader";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useJsonLdMany } from "@/hooks/useJsonLd";
import { useSeo } from "@/hooks/useSeo";
import { CATEGORIES, STAGE_INFO, STATE_NAMES, TRIAL, type CauseStage } from "@/lib/constants";
import { useCauses } from "@/lib/queries";
import { ROUTE_SEO } from "@/lib/seo";
import { breadcrumbSchema, causeListSchema } from "@/lib/seoSchemas";
import type { CauseFilters } from "@/lib/types";

export function CausesPage() {
  useSeo(ROUTE_SEO.causes);
  const search = useSearch();
  const [, navigate] = useLocation();
  const filters = useMemo<CauseFilters>(() => {
    const p = new URLSearchParams(search);
    return {
      cat: p.get("cat") ?? "",
      state: p.get("state") ?? "",
      status: (p.get("status") as CauseStage | null) ?? "",
      q: p.get("q") ?? "",
      sort: (p.get("sort") as CauseFilters["sort"]) ?? "activity",
    };
  }, [search]);
  const list = useCauses(filters);
  useJsonLdMany([
    { id: "breadcrumb", node: breadcrumbSchema([{ name: "Causes", path: "/causes" }]) },
    { id: "causelist", node: list.data?.length ? causeListSchema(list.data, "Charities on Care Share Donate", "/causes") : null },
  ]);

  const set = (patch: Partial<CauseFilters>) => {
    const p = new URLSearchParams(search);
    for (const [k, v] of Object.entries({ ...filters, ...patch })) {
      if (v && !(k === "sort" && v === "activity")) p.set(k, String(v));
      else p.delete(k);
    }
    const s = p.toString();
    navigate(`/causes${s ? `?${s}` : ""}`, { replace: true });
  };

  const active = [filters.cat, filters.state, filters.status, filters.q].filter(Boolean).length;
  const clearFilters = () => navigate("/causes", { replace: true });

  // The three states, told apart explicitly. An empty list is the normal
  // first run here, and a failed fetch must never look like a slow one.
  const loading = list.isPending || list.isLoading;
  const failed = list.isError;
  const rows = list.data ?? [];
  const emptyAfterFetch = !loading && !failed && rows.length === 0;

  return (
    <div className="container py-10 md:py-14">
      <SectionHeader level={1} kicker="All causes" title="Find a cause." lede="Filter by what you care about, where it is, and how far the checks have got." />
      <p className="mt-3 measure text-[14px] text-ink-muted">{TRIAL.home}</p>
      <form className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]" onSubmit={(e) => e.preventDefault()} role="search" aria-label="Filter causes">
        <div>
          <Label htmlFor="q">Search</Label>
          <Input id="q" type="search" placeholder="Name, town or registration number" value={filters.q} onChange={(e) => set({ q: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="cat">Category</Label>
          <Select id="cat" value={filters.cat} onChange={(e) => set({ cat: e.target.value })}>
            <option value="">All</option>
            {CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </Select>
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
      </form>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[12px] text-ink-muted tnum" aria-live="polite">
          {failed ? "Could not load the list" : loading ? "Loading the list" : `${rows.length} ${rows.length === 1 ? "cause" : "causes"}`}
        </p>
        {active > 0 && (
          <Button variant="link" size="sm" onClick={clearFilters}>
            Clear filters
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
          it or there is simply nothing listed yet. */}
      {emptyAfterFetch && active > 0 && (
        <Empty className="mt-6" title="No causes match those filters" body="Nothing on the list fits what you asked for. Try fewer filters, or search the whole list.">
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
