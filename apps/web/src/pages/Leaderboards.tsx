import { useState } from "react";
import { Link } from "wouter";
import { Empty, ErrorState, SkeletonRows } from "@/components/Empty";
import { GfCard, GreenField } from "@/components/GreenField";
import { SectionHeader } from "@/components/SectionHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useJsonLdMany } from "@/hooks/useJsonLd";
import { useSeo } from "@/hooks/useSeo";
import { COMMUNITY_SITE } from "@/lib/constants";
import { fmtInt, fmtUsd } from "@/lib/format";
import { useLeaderboards } from "@/lib/queries";
import { causeHref, shortAddress } from "@/lib/rules";
import { ROUTE_SEO } from "@/lib/seo";
import { breadcrumbSchema } from "@/lib/seoSchemas";
import type { LeaderboardBoard, LeaderboardPeriod, Leaderboards } from "@/lib/types";
import { cn } from "@/lib/utils";

const BOARDS: { id: LeaderboardBoard; label: string; blurb: string }[] = [
  { id: "givers", label: "Givers", blurb: "Ordered by how much they have given, in US$, across every cause." },
  { id: "helpers", label: "Helpers", blurb: `Ordered by Care XP on ${COMMUNITY_SITE}, earned from checks, votes, evidence, help and listings.` },
  { id: "causes", label: "Causes", blurb: "Ordered by how much each cause has received, in US$." },
];

interface Row {
  rank: number;
  label: string;
  causeId?: number;
  causeSlug?: string;
  value: number;
  unit: string;
  secondary?: string;
}

function toRows(data: Leaderboards | undefined): Row[] {
  if (!data) return [];
  if (data.board === "givers") return data.entries.map((e, i) => ({ rank: i + 1, label: shortAddress(e.wallet), value: Math.round(Number(e.usd)), unit: "US$", secondary: `${e.gifts} ${e.gifts === 1 ? "gift" : "gifts"}` }));
  if (data.board === "helpers") return data.entries.map((e, i) => ({ rank: i + 1, label: shortAddress(e.wallet), value: e.xp, unit: "XP", secondary: `reputation ${e.reputation}` }));
  return data.entries.map((e, i) => ({ rank: i + 1, label: e.cause.name, causeId: e.cause.id, causeSlug: e.cause.slug, value: Math.round(Number(e.usd)), unit: "US$", secondary: `${e.gifts} ${e.gifts === 1 ? "gift" : "gifts"}, ${fmtUsd(Number(e.cause.givenUsd))} all time` }));
}

export function LeaderboardsPage() {
  useSeo(ROUTE_SEO.leaderboards);
  useJsonLdMany([{ id: "breadcrumb", node: breadcrumbSchema([{ name: "Leaderboards", path: "/leaderboards" }]) }]);
  const [board, setBoard] = useState<LeaderboardBoard>("givers");
  const [period, setPeriod] = useState<LeaderboardPeriod>("30d");
  const q = useLeaderboards(board, period);
  const rows = toRows(q.data);
  const top = rows.slice(0, 3);
  const info = BOARDS.find((b) => b.id === board)!;

  return (
    <div>
      <div className="container pt-10 md:pt-14">
        <SectionHeader
          level={1}
          kicker="Leaderboards"
          title="Who gives, who checks, who gets given to."
          lede="A wallet shows as a short address. You can keep yourself off these lists in your settings."
          action={
            <div className="flex rounded-full border border-rule p-0.5" role="group" aria-label="Period">
              {(["30d", "all"] as LeaderboardPeriod[]).map((p) => (
                <button key={p} type="button" onClick={() => setPeriod(p)} aria-pressed={period === p} className={cn("min-h-11 rounded-full px-4 text-[13.5px] font-medium", period === p ? "bg-ink text-paper" : "text-ink-muted hover:text-ink")}>
                  {p === "30d" ? "Last 30 days" : "All time"}
                </button>
              ))}
            </div>
          }
        />
        <Tabs value={board} onValueChange={(v) => setBoard(v as LeaderboardBoard)} className="mt-8">
          <TabsList aria-label="Board">
            {BOARDS.map((b) => (
              <TabsTrigger key={b.id} value={b.id}>
                {b.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <p className="mt-3 measure text-[14px] text-ink-muted">{info.blurb}</p>
      </div>

      <GreenField className="mt-6" kicker={`Top ${info.label.toLowerCase()}, ${period === "30d" ? "last 30 days" : "all time"}`} footer={false}>
        {q.isError ? (
          <p className="text-[14px] font-medium text-[#06120C]">We could not load this board. Try again below.</p>
        ) : q.isPending || q.isLoading ? (
          <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-[#06120C]" role="status">
            Loading
          </p>
        ) : top.length === 0 ? (
          <p className="text-[14px] text-[#06120C]">Nothing to show for this period yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {top.map((r, i) => (
              <GfCard key={r.rank} label={`#${r.rank}`} ticker={r.label} figure={fmtInt(r.value)} meta={[{ label: r.unit, value: r.secondary ?? "" }]} tab={["#00D26A", "#00E676", "#59E39A"][i]} />
            ))}
          </div>
        )}
      </GreenField>

      <div className="container py-10 md:py-14">
        {q.isError && <ErrorState title="We could not load the leaderboards" error={q.error} onRetry={() => void q.refetch()} />}
        {!q.isError && (q.isPending || q.isLoading) && <SkeletonRows rows={6} />}
        <ol className="divide-y divide-rule border-y border-rule">
          {rows.slice(3).map((r) => (
            <li key={r.rank} className="grid grid-cols-[48px_1fr_auto] items-center gap-3 py-2.5 text-[14.5px]">
              <span className="font-mono text-[12px] text-ink-subtle tnum">#{r.rank}</span>
              {r.causeId && r.causeSlug ? (
                <Link href={causeHref(r.causeId, r.causeSlug)} className="font-medium hover:text-sera-text truncate">
                  {r.label}
                </Link>
              ) : (
                <span className="font-mono tnum">{r.label}</span>
              )}
              <span className="font-mono text-[13px] tnum text-right">
                {fmtInt(r.value)} {r.unit}
                {r.secondary && <span className="block text-[11px] text-ink-subtle">{r.secondary}</span>}
              </span>
            </li>
          ))}
        </ol>
        {rows.length === 0 && !q.isLoading && !q.isPending && !q.isError && (
          <Empty
            title={board === "causes" ? "No cause has received a gift yet" : board === "helpers" ? "Nobody has helped yet" : "Nobody has given yet"}
            body={board === "causes" ? "Once a cause receives its first gift it appears here." : board === "helpers" ? "Check a charity and you will be the first name on this list." : "Give to a cause and you will be the first name on this list."}
          >
            <Button asChild variant="outline">
              <Link href={board === "helpers" ? "/verify" : "/causes"}>{board === "helpers" ? "Help check a charity" : "Find a cause"}</Link>
            </Button>
          </Empty>
        )}
      </div>
    </div>
  );
}
