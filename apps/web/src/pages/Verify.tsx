import { ArrowRight, BookOpen } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Empty, Spinner } from "@/components/Empty";
import { Eyebrow } from "@/components/Eyebrow";
import { GfCard, GreenField } from "@/components/GreenField";
import { SectionHeader } from "@/components/SectionHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label, Select } from "@/components/ui/input";
import { useSeo } from "@/hooks/useSeo";
import { CATEGORIES, CLAIMS, CLAIM_INFO, CLAIM_SHORT, GSERA, STATE_NAMES, VOTING, categoryLabel, type ClaimCode } from "@/lib/constants";
import { fmtGsera, fmtInt, timeAgo } from "@/lib/format";
import { useClaims, useLeaderboards } from "@/lib/queries";
import { shortAddress } from "@/lib/rules";
import type { ClaimListItem, ClaimTab } from "@/lib/types";

const TABS: { id: ClaimTab; label: string; blurb: string }[] = [
  { id: "needs_evidence", label: "Needs evidence", blurb: "No evidence yet. Upload a document, a link, dated photos or a signed message." },
  { id: "needs_checking", label: "Needs checking", blurb: `Evidence is in. Write a verification path. Voting opens at ${VOTING.minPaths} independent paths.` },
  { id: "open_for_votes", label: "Open for votes", blurb: "Read the paths, then vote with a one-line reason." },
  { id: "challenged", label: "Challenged", blurb: "A challenge is open with counter-evidence. Voting reopened." },
  { id: "recently_verified", label: "Recently verified", blurb: "Finalised claims, newest first." },
];

export function VerifyPage() {
  useSeo("Verification hub", "Claims that need evidence, checking or votes. Help check a charity and earn gSera.");
  const search = useSearch();
  const [, navigate] = useLocation();
  const tab = (new URLSearchParams(search).get("tab") as ClaimTab | null) ?? "needs_checking";
  const [claim, setClaim] = useState<ClaimCode | "">("");
  const [state, setState] = useState("");
  const [cat, setCat] = useState("");
  const helpers = useLeaderboards("helpers", "30d");
  const topHelpers = helpers.data?.board === "helpers" ? helpers.data.entries.slice(0, 3) : [];

  return (
    <div>
      <div className="container pt-10 md:pt-14">
        <SectionHeader kicker="Verification hub" title="Help check a charity." lede="Evidence goes up, helpers write down exactly how they checked it, the community votes, and a short challenge window lets anyone object. Stewards finalise every claim while we launch." size="lg" />
      </div>
      <GreenField className="mt-8" kicker="Top helpers this month" footer={false}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {topHelpers.map((r, i) => (
            <GfCard key={r.wallet} label={`#${i + 1} helper`} ticker={shortAddress(r.wallet)} figure={fmtInt(r.gsera)} meta={[{ label: "gSera earned", value: `reputation ${r.reputation}` }]} tab={["#00D26A", "#00E676", "#59E39A"][i]} />
          ))}
          {!helpers.isLoading && topHelpers.length === 0 && <p className="text-[14px] text-white/70">No helper rewards credited in the last 30 days yet.</p>}
        </div>
      </GreenField>
      <div className="container grid gap-10 py-10 lg:grid-cols-[1fr_340px] lg:py-14">
        <div className="min-w-0">
          <Tabs value={tab} onValueChange={(v) => navigate(`/verify?tab=${v}`, { replace: true })}>
            <TabsList aria-label="Claim queues">
              {TABS.map((t) => (
                <TabsTrigger key={t.id} value={t.id}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="f-claim">Claim</Label>
                <Select id="f-claim" value={claim} onChange={(e) => setClaim(e.target.value as ClaimCode | "")} className="h-10">
                  <option value="">All claims</option>
                  {CLAIMS.map((c) => (
                    <option key={c} value={c}>
                      {c}: {CLAIM_SHORT[c]}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="f-state">State (near me)</Label>
                <Select id="f-state" value={state} onChange={(e) => setState(e.target.value)} className="h-10">
                  <option value="">Anywhere</option>
                  {STATE_NAMES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="f-cat">Category</Label>
                <Select id="f-cat" value={cat} onChange={(e) => setCat(e.target.value)} className="h-10">
                  <option value="">All</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            {TABS.map((t) => (
              <TabsContent key={t.id} value={t.id}>
                <p className="text-[14.5px] text-ink-muted">{t.blurb}</p>
                {tab === t.id && <ClaimTable tab={t.id} claim={claim} state={state} cat={cat} />}
              </TabsContent>
            ))}
          </Tabs>
        </div>
        <SidePanel />
      </div>
    </div>
  );
}

function missingFor(tab: ClaimTab, item: ClaimListItem): string {
  const k = item.claim;
  switch (tab) {
    case "needs_evidence":
      return "No evidence yet";
    case "needs_checking": {
      const n = Math.max(1, VOTING.minPaths - k.pathCount);
      return `${n} more independent ${n === 1 ? "path" : "paths"}`;
    }
    case "open_for_votes":
      return "Votes";
    case "challenged":
      return "Challenged. Votes";
    default:
      return "Done";
  }
}

function offerFor(tab: ClaimTab): number {
  switch (tab) {
    case "needs_evidence":
    case "needs_checking":
      return GSERA.helper.pathAgrees;
    case "open_for_votes":
    case "challenged":
      return GSERA.helper.voteAgrees;
    default:
      return 0;
  }
}

function sinceFor(tab: ClaimTab, item: ClaimListItem): string {
  const k = item.claim;
  if (tab === "recently_verified") return k.finalisedAt ?? item.cause.listedAt;
  if (tab === "open_for_votes" || tab === "challenged") return k.votingStart ?? item.cause.listedAt;
  return item.cause.listedAt;
}

function ClaimTable({ tab, claim, state, cat }: { tab: ClaimTab; claim: ClaimCode | ""; state: string; cat: string }) {
  const q = useClaims(tab);
  const rows = useMemo(
    () =>
      (q.data ?? [])
        .filter((r) => {
          const st = r.cause.location?.state ?? "";
          return (!claim || r.claim.claimType === claim) && (!state || st === state || (state !== "Nationwide" && st.includes(state))) && (!cat || r.cause.category === cat);
        })
        .sort((a, b) => sinceFor(tab, b).localeCompare(sinceFor(tab, a))),
    [q.data, claim, state, cat, tab],
  );
  if (q.isLoading) return <Spinner label="Loading claims" />;
  if (rows.length === 0) return <Empty className="mt-4" title="Nothing here right now" body="Try another queue or fewer filters." />;
  return (
    <ul className="mt-4 divide-y divide-rule border-y border-rule">
      {rows.map((r) => (
        <ClaimRowItem key={`${r.cause.id}-${r.claim.claimType}`} item={r} tab={tab} />
      ))}
    </ul>
  );
}

function ClaimRowItem({ item, tab }: { item: ClaimListItem; tab: ClaimTab }) {
  const k = item.claim;
  const offer = offerFor(tab);
  const since = sinceFor(tab, item);
  return (
    <li>
      <Link href={`/verify/${item.cause.id}/${k.claimType}`} className="group grid gap-1 py-3.5 sm:grid-cols-[1fr_auto] sm:items-center hover:bg-paper-warm/60 -mx-2 px-2 rounded-md focus-visible:outline-2 focus-visible:outline-ring">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-[11px] text-ink-subtle">{k.claimType}</span>
            <span className="font-medium text-[15.5px] group-hover:text-sera-text">{item.cause.name}</span>
            <span className="text-[13px] text-ink-muted">{item.label}</span>
          </div>
          <p className="mt-0.5 font-mono text-[11.5px] text-ink-muted">
            {categoryLabel(item.cause.category)} · {item.cause.location?.state || "Malaysia"} · {missingFor(tab, item)}
            {tab !== "recently_verified" ? ` · ${k.evidenceCount} evidence, ${k.pathCount} paths` : ""}
          </p>
        </div>
        <div className="flex items-center gap-4 sm:justify-end">
          {offer > 0 && <span className="font-mono text-[12px] text-sera-text tnum">{fmtGsera(offer)}</span>}
          <span className="font-mono text-[11.5px] text-ink-subtle">{tab === "recently_verified" ? `final ${timeAgo(since)}` : `open ${timeAgo(since)}`}</span>
          <ArrowRight className="h-4 w-4 text-ink-subtle group-hover:text-ink" aria-hidden />
        </div>
      </Link>
    </li>
  );
}

function SidePanel() {
  return (
    <aside className="space-y-6">
      <div className="rounded-2xl border border-rule bg-paper-warm p-5">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4.5 w-4.5 text-sera-text" aria-hidden />
          <h2 className="font-display text-[18px] font-semibold">How to check a charity</h2>
        </div>
        <ol className="mt-3 space-y-2 text-[14px] text-ink-muted">
          <li>1. Pick a claim. Each one is a single fact with a yes or no.</li>
          <li>2. Go to the official source in the library below. Not the charity's own site, unless the claim is about it.</li>
          <li>3. Write down every step, the exact search you used, and what you found. Take a dated screenshot.</li>
          <li>4. Say whether it matches the profile, and declare any conflict of interest.</li>
          <li>5. "Not verified" and "Could not check" are useful results and earn the same {fmtGsera(GSERA.helper.pathAgrees)} when the outcome agrees.</li>
        </ol>
      </div>
      <div className="rounded-2xl border border-rule bg-card p-5">
        <Eyebrow>Verification paths library</Eyebrow>
        <ul className="mt-3 divide-y divide-rule">
          {CLAIMS.map((c) => (
            <li key={c} className="py-2.5">
              <p className="text-[14px] font-medium">
                <span className="font-mono text-[11px] text-ink-subtle mr-1.5">{c}</span>
                {CLAIM_INFO[c].label}
              </p>
              <p className="mt-0.5 text-[12.5px] text-ink-muted">{CLAIM_INFO[c].whereToCheck}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-2xl border border-rule bg-card p-5">
        <Eyebrow>Path template</Eyebrow>
        <dl className="mt-3 space-y-1.5 text-[13px]">
          {[
            ["Claim", "C1: The organisation exists and is registered"],
            ["Source", "Registrar of Societies public search"],
            ["Steps", "1. Opened the ROS search. 2. Searched the number. 3. Opened the result."],
            ["Exact search", "PPM-001-11-10062011"],
            ["What I found", "Name, status, registered date, state"],
            ["Matches the profile?", "Yes or no, and why"],
            ["Screenshot", "Uploaded, hashed"],
            ["Checked on", "Date and time, MYT"],
            ["Result", "Verified, Not verified or Could not check"],
            ["Caveats", "What the source does not show"],
            ["Conflict of interest", "None, or say what it is"],
          ].map(([k, v]) => (
            <div key={k} className="grid grid-cols-[120px_1fr] gap-2">
              <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-subtle">{k}</dt>
              <dd className="text-ink-muted">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </aside>
  );
}
