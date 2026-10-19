import { Award, Check, CircleDashed, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { Empty, Spinner } from "@/components/Empty";
import { Eyebrow } from "@/components/Eyebrow";
import { GfCard, GreenField } from "@/components/GreenField";
import { Pill } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { useSeo } from "@/hooks/useSeo";
import { useAuth } from "@/lib/auth";
import { LINKS, VOTE_WEIGHT } from "@/lib/constants";
import { fmtDate, fmtGsera, fmtInt, fmtMultiplier, fmtUsd, timeAgo } from "@/lib/format";
import { useMe } from "@/lib/queries";
import { causeHref } from "@/lib/rules";
import type { LedgerEntry, Me } from "@/lib/types";
import { cn } from "@/lib/utils";

const EXPLORER = "https://sepolia.etherscan.io/tx/";

export function MePage() {
  useSeo("My gSera", "Your gSera balance, reputation, gifts and contributions.");
  const { user, signIn, busy, ready } = useAuth();
  const me = useMe();
  if (!ready) return <div className="container"><Spinner /></div>;
  if (!user)
    return (
      <div className="container max-w-xl py-16 text-center">
        <Eyebrow>My gSera</Eyebrow>
        <h1 className="mt-2 font-display text-[32px] font-semibold tracking-tight">Sign in to see your balance.</h1>
        <p className="mt-2 text-ink-muted">The same gSera balance as g.sera.cx, your reputation, gifts and contributions.</p>
        <Button size="lg" className="mt-6" onClick={() => void signIn()} disabled={busy}>
          {busy ? "Signing in" : "Sign in"}
        </Button>
      </div>
    );
  if (me.isLoading || !me.data) return <div className="container"><Spinner label="Loading your balance" /></div>;
  return <MeView me={me.data} />;
}

function MeView({ me }: { me: Me }) {
  return (
    <div>
      <div className="container pt-8 md:pt-12">
        <Eyebrow>My gSera</Eyebrow>
        <h1 className="mt-2 font-display text-[32px] font-semibold leading-[1.05] tracking-[-0.025em] sm:text-[40px]">
          {me.displayName} <span className="font-mono text-[16px] font-normal text-ink-muted tnum align-middle">{me.wallet.slice(0, 6)}…{me.wallet.slice(-4)}</span>
        </h1>
        <p className="mt-2 text-[15.5px] text-ink-muted">
          One balance with{" "}
          <a href={LINKS.gsera} target="_blank" rel="noopener noreferrer" className="text-sera-text underline underline-offset-2">
            g.sera.cx
          </a>
          . Charity-tagged gSera cannot buy Lucky Draw tickets.
        </p>
      </div>

      <GreenField className="mt-8" kicker="Balance" title="Spend it, stake it, keep your rank.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <GfCard label="Spendable" ticker="gSera" figure={fmtInt(me.gsera.spendable)} meta={[{ label: "volume tier", value: fmtMultiplier(me.multipliers.volumeTier) }, { label: "streak", value: `${fmtMultiplier(me.multipliers.streak)}, ${me.multipliers.streakWeeks} wks` }]} />
          <GfCard label="Charity-tagged" ticker="From gifts and helping" figure={fmtInt(me.gsera.charityTagged)} meta={[{ label: "of spendable", value: me.gsera.spendable ? `${Math.round((me.gsera.charityTagged / me.gsera.spendable) * 100)}%` : "0%" }]} tab="#59E39A" />
          <GfCard label="Lifetime earned" ticker="Season 1" figure={fmtInt(me.gsera.lifetime)} meta={[{ label: "rank is never lowered", value: "by spending" }]} tab="#00E676" />
        </div>
      </GreenField>

      <div className="container grid gap-10 py-10 lg:grid-cols-[1fr_340px] lg:py-14">
        <div className="min-w-0 space-y-12">
          <section aria-labelledby="hist-h">
            <h2 id="hist-h" className="font-display text-[22px] font-semibold tracking-tight">History</h2>
            <p className="mt-1 text-[14px] text-ink-muted">Earned, spent and held, with the reason for every entry.</p>
            <ul className="mt-4 divide-y divide-rule border-y border-rule">
              {me.ledger.map((l) => (
                <LedgerRow key={l.id} entry={l} />
              ))}
            </ul>
          </section>

          <section aria-labelledby="gifts-h">
            <h2 id="gifts-h" className="font-display text-[22px] font-semibold tracking-tight">Gifts</h2>
            <p className="mt-1 text-[14px] text-ink-muted">Each gift went straight to the cause's own address and is on its public record.</p>
            {me.gifts.length === 0 ? (
              <Empty className="mt-4" title="No gifts yet" />
            ) : (
              <ul className="mt-4 divide-y divide-rule border-y border-rule">
                {me.gifts.map((g) => (
                  <li key={g.id} className="grid gap-1 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div>
                      <Link href={causeHref(g.causeId, g.causeSlug)} className="font-medium text-[15px] hover:text-sera-text">
                        {g.causeName}
                      </Link>
                      <p className="font-mono text-[12.5px] text-ink-muted tnum">
                        {g.amount.toLocaleString("en-GB")} {g.token} ({fmtUsd(g.usd)}) · {fmtDate(g.at)} · {g.route === "swap" ? "via Sera.cx swap" : "direct transfer"} · +{fmtGsera(g.gsera)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Pill tone="green" icon={Check}>
                        Arrived
                      </Pill>
                      <a href={`${EXPLORER}${g.txHash}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-[11px] text-sera-text" aria-label="Transaction">
                        tx <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="contrib-h">
            <h2 id="contrib-h" className="font-display text-[22px] font-semibold tracking-tight">Contributions</h2>
            <p className="mt-1 text-[14px] text-ink-muted">Paths, votes, help and listings, with their outcomes.</p>
            <ul className="mt-4 divide-y divide-rule border-y border-rule">
              {me.contributions.map((c) => (
                <li key={c.id} className="grid gap-1 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <p className="text-[15px]">
                      <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-subtle mr-2">{c.kind}</span>
                      {c.claim ? (
                        <Link href={`/verify/${c.causeId}/${c.claim}`} className="font-medium hover:text-sera-text">
                          {c.claim} on {c.causeName}
                        </Link>
                      ) : (
                        <Link href={`/causes`} className="font-medium hover:text-sera-text">
                          {c.causeName}
                        </Link>
                      )}
                    </p>
                    <p className="font-mono text-[12px] text-ink-muted">{timeAgo(c.at)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {c.outcome === "agreed" || c.outcome === "accepted" ? (
                      <Pill tone="green" icon={Check}>
                        {c.outcome === "agreed" ? "Agreed with outcome" : "Accepted"}
                      </Pill>
                    ) : c.outcome === "overturned" ? (
                      <Pill tone="red" icon={CircleDashed}>
                        Overturned
                      </Pill>
                    ) : (
                      <Pill tone="amber" icon={CircleDashed}>
                        {c.outcome === "pending" ? "Awaiting outcome" : "Open"}
                      </Pill>
                    )}
                    <span className="font-mono text-[12px] tnum text-ink-muted">{c.outcome === "agreed" || c.outcome === "accepted" ? "+" : ""}{fmtGsera(c.gsera)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-rule bg-card p-5">
            <Eyebrow>Reputation</Eyebrow>
            <p className="mt-2 font-mono text-[32px] font-semibold leading-none tnum">{me.reputation}</p>
            <p className="mt-2 text-[13.5px] text-ink-muted">
              Vote weight <span className="font-mono tnum text-ink">{me.voteWeight}</span> of {VOTE_WEIGHT.max}. Earned only from checks that match final outcomes. gSera does not add weight.
            </p>
            <p className="mt-2 text-[13px] text-ink-muted">{me.canVote ? "You can vote." : "Give once or get one contribution accepted to vote."} Screening: {me.kytState}.</p>
          </div>
          <div className="rounded-2xl border border-rule bg-card p-5">
            <Eyebrow>Badges</Eyebrow>
            <ul className="mt-3 space-y-2">
              {me.badges.map((b) => (
                <li key={b.id} className={cn("flex items-center gap-2.5 text-[14px]", !b.earned && "text-ink-subtle")}>
                  <Award className={cn("h-4.5 w-4.5", b.earned ? "text-sera-text" : "text-ink-subtle")} aria-hidden />
                  <span>
                    {b.label}
                    <span className="block text-[12px] text-ink-muted">{b.hint}</span>
                  </span>
                  {b.earned && <span className="sr-only">earned</span>}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-rule bg-paper-warm p-5 text-[13.5px] text-ink-muted">
            <p>
              Your causes: {me.causesOwned.length}.{" "}
              <Link href="/dashboard" className="text-sera-text underline underline-offset-2">
                Open the dashboard
              </Link>
            </p>
            <p className="mt-2">Leaderboards: {me.leaderboardOptOut ? "opted out" : "shown as a short address"}.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const sign = entry.amount < 0 ? "-" : "+";
  return (
    <li className="grid gap-1 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <p className="text-[14.5px]">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-subtle mr-2">{entry.reason.replace("_", " ")}</span>
          {entry.note}
        </p>
        <p className="font-mono text-[12px] text-ink-muted">
          {fmtDate(entry.createdAt)} · {entry.sourceTag === "charity" ? "charity-tagged" : "trading"}
          {entry.multipliers ? ` · heat ${fmtMultiplier(entry.multipliers.heat)} x volume ${fmtMultiplier(entry.multipliers.volume)} x streak ${fmtMultiplier(entry.multipliers.streak)}` : ""}
          {entry.state !== "credited" ? ` · ${entry.state}` : ""}
        </p>
      </div>
      <span className={cn("font-mono text-[15px] tnum", entry.amount < 0 ? "text-danger" : entry.state === "held" ? "text-ink-muted" : "text-sera-text")}>
        {sign}
        {fmtInt(Math.abs(entry.amount))}
      </span>
    </li>
  );
}
