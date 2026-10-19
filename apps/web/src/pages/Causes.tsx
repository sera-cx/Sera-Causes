import { useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { CauseCard, CauseCardSkeleton } from "@/components/CauseCard";
import { Empty } from "@/components/Empty";
import { SectionHeader } from "@/components/SectionHeader";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useSeo } from "@/hooks/useSeo";
import { CATEGORIES, MALAYSIAN_STATES, STAGE_INFO, type CauseStage } from "@/lib/constants";
import { useCauses } from "@/lib/queries";
import type { CauseFilters } from "@/lib/types";

export function CausesPage() {
  useSeo("All causes", "Every cause on Care Share Donate, with filters by category, state and verification status.");
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

  return (
    <div className="container py-10 md:py-14">
      <SectionHeader kicker="All causes" title="Find a cause." lede="Filter by what you care about, where it is and how far the checks have got." />
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
            {MALAYSIAN_STATES.map((s) => (
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
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="font-mono text-[12px] text-ink-muted tnum" aria-live="polite">
          {list.data ? `${list.data.length} ${list.data.length === 1 ? "cause" : "causes"}` : "Loading"}
        </p>
        {active > 0 && (
          <Button variant="link" size="sm" onClick={() => navigate("/causes", { replace: true })}>
            Clear filters
          </Button>
        )}
      </div>
      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {list.isLoading && Array.from({ length: 6 }, (_, i) => <CauseCardSkeleton key={i} />)}
        {list.data?.map((c) => (
          <CauseCard key={c.id} cause={c} />
        ))}
      </div>
      {list.data?.length === 0 && (
        <Empty className="mt-6" title="No causes match" body="Try fewer filters, or add the cause you are looking for.">
          <Button asChild variant="outline">
            <a href="/add">Add a cause</a>
          </Button>
        </Empty>
      )}
    </div>
  );
}
