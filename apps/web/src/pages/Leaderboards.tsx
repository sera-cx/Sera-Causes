import { useState } from "react";
import { Link } from "wouter";
import { Spinner } from "@/components/Empty";
import { GfCard, GreenField } from "@/components/GreenField";
import { SectionHeader } from "@/components/SectionHeader";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSeo } from "@/hooks/useSeo";
import { fmtInt } from "@/lib/format";
import { useLeaderboards } from "@/lib/queries";
import { causeHref } from "@/lib/rules";
import type { LeaderboardBoard, LeaderboardPeriod } from "@/lib/types";
import { cn } from "@/lib/utils";

const BOARDS: { id: LeaderboardBoard; label: string; blurb: string }[] = [
  { id: "givers", label: "Givers", blurb: "By the number of causes given to, not by amount." },
  { id: "helpers", label: "Helpers", blurb: "By accepted paths and fulfilled help requests." },
  { id: "causes", label: "Causes", blurb: "By number of givers." },
];

export function LeaderboardsPage() {
  useSeo("Leaderboards", "Givers, helpers and causes, this month and all time.");
  const [board, setBoard] = useState<LeaderboardBoard>("givers");
  const [period, setPeriod] = useState<LeaderboardPeriod>("month");
  const q = useLeaderboards(board, period);
  const rows = q.data?.rows ?? [];
  const top = rows.slice(0, 3);
  const info = BOARDS.find((b) => b.id === board)!;

  return (
    <div>
      <div className="container pt-10 md:pt-14">
        <SectionHeader
          kicker="Leaderboards"
          title="Who gives, who checks, who gets given to."
          lede="Wallets show as short addresses. You can opt out in your settings."
          action={
            <div className="flex rounded-full border border-rule p-0.5" role="group" aria-label="Period">
              {(["month", "all"] as LeaderboardPeriod[]).map((p) => (
                <button key={p} type="button" onClick={() => setPeriod(p)} aria-pressed={period === p} className={cn("h-9 rounded-full px-4 text-[13.5px] font-medium", period === p ? "bg-ink text-paper" : "text-ink-muted hover:text-ink")}>
                  {p === "month" ? "This month" : "All time"}
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
        <p className="mt-3 text-[14px] text-ink-muted">{info.blurb}</p>
      </div>

      <GreenField className="mt-6" kicker={`Top ${info.label.toLowerCase()}, ${period === "month" ? "this month" : "all time"}`} footer={false}>
        {q.isLoading ? (
          <Spinner />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {top.map((r, i) => (
              <GfCard key={r.rank} label={`#${r.rank}`} ticker={r.label} figure={fmtInt(r.value)} meta={[{ label: r.unit, value: r.secondary ?? "" }]} tab={["#00D26A", "#00E676", "#59E39A"][i]} />
            ))}
          </div>
        )}
      </GreenField>

      <div className="container py-10 md:py-14">
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
        {rows.length === 0 && !q.isLoading && <p className="text-ink-muted">Nothing yet for this period.</p>}
      </div>
    </div>
  );
}
