import { Award, Check, CircleDashed, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { Empty, ErrorState, Notice, SkeletonRows, Spinner } from "@/components/Empty";
import { Eyebrow } from "@/components/Eyebrow";
import { GfCard, GreenField } from "@/components/GreenField";
import { SignInButton } from "@/components/SignInButton";
import { Pill } from "@/components/StatusPill";
import { useSeo } from "@/hooks/useSeo";
import { useAuth } from "@/lib/auth";
import { COMMUNITY_SITE, LINKS, VOTE_WEIGHT, XP } from "@/lib/constants";
import { fmtDate, fmtGsera, fmtInt, fmtMultiplier, fmtRm, fmtUsd, fmtXp, timeAgo } from "@/lib/format";
import { useDashboard, useMe } from "@/lib/queries";
import { causeHref, claimHref, fromRaw, voteWeight } from "@/lib/rules";
import { ROUTE_SEO } from "@/lib/seo";
import type { ClaimCode, LedgerView, Me } from "@/lib/types";
import { cn } from "@/lib/utils";

const EXPLORER = "https://sepolia.etherscan.io/tx/";

export function MePage() {
  useSeo(ROUTE_SEO.me);
  const { user, ready } = useAuth();
  const me = useMe();
  if (!ready) return <div className="container"><Spinner /></div>;
  if (!user)
    return (
      // Nothing to put beside a sign-in prompt, so the block is centred.
      <div className="container py-16 text-center">
        <div className="mx-auto max-w-[36rem]">
          <Eyebrow>My gSera and XP</Eyebrow>
          <h1 className="mt-2 font-display text-[32px] font-semibold tracking-tight">Sign in to see your balance.</h1>
          <p className="mt-2 measure mx-auto text-ink-muted">The same gSera balance as g.sera.cx for giving, your Care XP on {COMMUNITY_SITE} for helping, plus your reputation, your gifts and your checks.</p>
          <SignInButton size="lg" className="mt-6" label="Sign in" />
        </div>
      </div>
    );
  if (me.isError)
    return (
      <div className="container py-10">
        <ErrorState title="We could not load your balance" error={me.error} onRetry={() => void me.refetch()} />
      </div>
    );
  if (me.isLoading || !me.data)
    return (
      <div className="container py-10">
        <Spinner label="Loading your balance" />
        <SkeletonRows rows={4} />
      </div>
    );
  return <MeView me={me.data} displayName={user.displayName} />;
}

interface Contribution {
  id: string;
  kind: "path" | "vote" | "help";
  causeId: number;
  claim?: ClaimCode;
  at: string;
  outcome: "agreed" | "accepted" | "pending" | "overturned";
  /** XP on community.sera.cx. */
  xp: number;
}

function contributions(me: Me): Contribution[] {
  const out: Contribution[] = [
    ...me.paths.map((p): Contribution => ({ id: `p-${p.id}`, kind: "path", causeId: p.causeId, claim: p.claimType, at: p.createdAt, outcome: p.outcomeAgreed === true ? "agreed" : p.outcomeAgreed === false ? "overturned" : "pending", xp: XP.care_path_agreed.amount })),
    ...me.votes.map((v): Contribution => ({ id: `v-${v.id}`, kind: "vote", causeId: v.causeId, claim: v.claimType, at: v.createdAt, outcome: v.outcomeAgreed === true ? "agreed" : v.outcomeAgreed === false ? "overturned" : "pending", xp: XP.care_vote_agreed.amount })),
    ...me.helped.map((h): Contribution => ({ id: `h-${h.id}`, kind: "help", causeId: h.causeId, at: h.confirmedAt ?? h.postedAt, outcome: h.confirmedAt ? "accepted" : "pending", xp: h.kind === "translate" ? XP.care_translation.amount : XP.care_help_fulfilled.amount })),
  ];
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

function MeView({ me, displayName }: { me: Me; displayName: string }) {
  const dash = useDashboard();
  const causeName = (id: number) => me.causes.find((c) => c.id === id)?.name ?? `Cause ${id}`;
  const causeSlug = (id: number) => me.causes.find((c) => c.id === id)?.slug ?? "";
  const tokenOf = (address: string) => me.tokens.find((t) => t.address === address.toLowerCase());
  const entries = me.ledger.entries;
  const credited = entries.filter((l) => l.state === "credited" && l.reason !== "challenge_stake");
  const spendable = me.gsera?.spendable ?? credited.reduce((s, l) => s + l.amount, 0) + me.ledger.staked;
  const charityTagged = credited.filter((l) => l.sourceTag === "charity").reduce((s, l) => s + l.amount, 0);
  const lifetime = me.gsera?.earned ?? me.ledger.credited;
  const m = me.gsera?.multipliers;
  const contribs = contributions(me);
  const gseraForGift = (giftId: string) => entries.find((l) => l.reason === "gift" && l.sourceRef === giftId)?.amount ?? 0;
  const badges = [
    { id: "first-gift", label: "First gift", earned: me.gifts.length > 0, hint: "Give once" },
    { id: "helper", label: "Helper", earned: contribs.some((c) => c.outcome === "agreed" || c.outcome === "accepted"), hint: "One accepted path or fulfilled help request" },
    { id: "witness", label: "Witness", earned: me.helped.some((h) => h.kind === "visit" && !!h.confirmedAt), hint: "A site visit that a claim relied on" },
    { id: "path-finder", label: "Path finder", earned: me.paths.filter((p) => p.outcomeAgreed).length >= 10, hint: "10 accepted paths" },
    { id: "steady-hand", label: "Steady hand", earned: me.votes.filter((v) => v.outcomeAgreed).length >= 25, hint: "25 votes with the outcome" },
  ];
  return (
    <div>
      <div className="container pt-8 md:pt-12">
        <Eyebrow>My gSera and XP</Eyebrow>
        <h1 className="mt-2 font-display text-[32px] font-semibold leading-[1.05] tracking-[-0.025em] sm:text-[40px]">
          {displayName} <span className="font-mono text-[16px] font-normal text-ink-muted tnum align-middle">{me.wallet.slice(0, 6)}…{me.wallet.slice(-4)}</span>
        </h1>
        <p className="mt-2 measure text-[15.5px] text-ink-muted">
          One balance with{" "}
          <a href={LINKS.gsera} target="_blank" rel="noopener noreferrer" className="text-sera-text underline underline-offset-2">
            g.sera.cx
          </a>
          . gSera earned from giving cannot buy Lucky Draw tickets. Helping earns Care XP on {COMMUNITY_SITE} instead, which is a standing and not a balance.
        </p>
      </div>

      <GreenField className="mt-8" kicker="gSera balance, from giving" title="Spend it, stake it, keep your rank.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <GfCard label="Spendable" ticker="gSera" figure={fmtInt(spendable)} meta={m ? [{ label: "volume tier", value: fmtMultiplier(m.volumeTier) }, { label: "streak", value: fmtMultiplier(m.streak) }] : [{ label: "staked", value: fmtInt(Math.abs(me.ledger.staked)) }]} />
          <GfCard label="From giving" ticker="Charity-tagged" figure={fmtInt(charityTagged)} meta={[{ label: "of everything credited", value: me.ledger.credited ? `${Math.round((charityTagged / me.ledger.credited) * 100)}%` : "0%" }]} tab="#59E39A" />
          <GfCard label="Earned all time" ticker="Season 1" figure={fmtInt(lifetime)} meta={[{ label: "spending never", value: "lowers your rank" }]} tab="#00E676" />
        </div>
      </GreenField>

      <div className="container grid gap-10 py-10 lg:grid-cols-[1fr_340px] lg:py-14">
        <div className="min-w-0 space-y-12">
          <CareXp me={me} causeName={causeName} />

          <section aria-labelledby="hist-h">
            <h2 id="hist-h" className="font-display text-[22px] font-semibold tracking-tight">gSera history</h2>
            <p className="mt-1 measure text-[14px] text-ink-muted">Gifts and challenge stakes, with the reason for every line.</p>
            {entries.length === 0 ? (
              <Empty className="mt-4" title="Nothing credited yet" body="Give to a cause and the gSera appears here. Helping earns Care XP instead, in the section above." />
            ) : (
              <ul className="mt-4 divide-y divide-rule border-y border-rule">
                {entries.map((l) => (
                  <LedgerRow key={l.id} entry={l} causeName={causeName} />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="gifts-h">
            <h2 id="gifts-h" className="font-display text-[22px] font-semibold tracking-tight">Gifts</h2>
            <p className="mt-1 measure text-[14px] text-ink-muted">Each gift went straight to the cause's own address, and each one is on that cause's public record.</p>
            {me.gifts.length === 0 ? (
              <Empty className="mt-4" title="No gifts yet" body="Find a cause you care about and give whatever you can." />
            ) : (
              <ul className="mt-4 divide-y divide-rule border-y border-rule">
                {me.gifts.map((g) => {
                  const t = tokenOf(g.token);
                  const gsera = gseraForGift(g.id);
                  return (
                    <li key={g.id} className="grid gap-1 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                      <div>
                        <Link href={causeHref(g.causeId, causeSlug(g.causeId))} className="font-medium text-[15px] hover:text-sera-text">
                          {causeName(g.causeId)}
                        </Link>
                        <p className="font-mono text-[12.5px] text-ink-muted tnum">
                          {fromRaw(g.amount, t?.decimals ?? 6).toLocaleString("en-GB")} {t?.symbol ?? "tokens"} ({fmtUsd(Number(g.usd))}, about {fmtRm(Number(g.usd))}) · {fmtDate(g.createdAt)} · {g.source === "sera_swap" ? "through a Sera.cx swap" : "sent directly"}
                          {gsera > 0 ? ` · +${fmtGsera(gsera)}` : g.ledgerNote ? ` · no gSera (${g.ledgerNote.replace(/_/g, " ")})` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Pill tone={g.kytState === "clear" ? "green" : "amber"} icon={g.kytState === "clear" ? Check : CircleDashed}>
                          {g.kytState === "clear" ? "Arrived" : "Screening"}
                        </Pill>
                        <a href={`${EXPLORER}${g.txHash}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 font-mono text-[11px] text-sera-text sm:min-h-0" aria-label="Transaction">
                          tx <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="contrib-h">
            <h2 id="contrib-h" className="font-display text-[22px] font-semibold tracking-tight">Contributions</h2>
            <p className="mt-1 measure text-[14px] text-ink-muted">Your checks, votes and help, with how each one turned out. Each earns Care XP on {COMMUNITY_SITE}, not gSera.</p>
            {contribs.length === 0 ? (
              <Empty className="mt-4" title="You have not helped yet" body="Check a claim on a charity, or vote on one that is open." />
            ) : (
              <ul className="mt-4 divide-y divide-rule border-y border-rule">
                {contribs.map((c) => (
                  <li key={c.id} className="grid gap-1 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div>
                      <p className="text-[15px]">
                        <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-subtle mr-2">{c.kind}</span>
                        {c.claim ? (
                          <Link href={claimHref(c.causeId, c.claim)} className="font-medium hover:text-sera-text">
                            {c.claim} on {causeName(c.causeId)}
                          </Link>
                        ) : (
                          <Link href={causeHref(c.causeId, causeSlug(c.causeId))} className="font-medium hover:text-sera-text">
                            {causeName(c.causeId)}
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
                          Awaiting outcome
                        </Pill>
                      )}
                      <span className="font-mono text-[12px] tnum text-ink-muted" title={`XP on ${COMMUNITY_SITE}`}>{c.outcome === "agreed" || c.outcome === "accepted" ? "+" : ""}{fmtXp(c.xp)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-rule bg-card p-5">
            <Eyebrow>Reputation</Eyebrow>
            <p className="mt-2 font-mono text-[32px] font-semibold leading-none tnum">{me.reputation}</p>
            <p className="mt-2 text-[13.5px] text-ink-muted">
              Vote weight <span className="font-mono tnum text-ink">{voteWeight(me.reputation)}</span> of {VOTE_WEIGHT.max}. You earn it only from checks that match the final result. Neither gSera nor XP adds
              weight.
            </p>
            <p className="mt-2 text-[13px] text-ink-muted">
              {me.eligibility.canVote ? "You can vote." : `Not eligible to vote yet: ${me.eligibility.reasons.join("; ")}.`} Screening: {me.kytState}.
            </p>
          </div>
          <div className="rounded-2xl border border-rule bg-card p-5">
            <Eyebrow>Badges</Eyebrow>
            <ul className="mt-3 space-y-2">
              {badges.map((b) => (
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
              Your causes: {dash.data ? dash.data.causes.length : "…"}.{" "}
              <Link href="/dashboard" className="text-sera-text underline underline-offset-2">
                Open the dashboard
              </Link>
            </p>
            <p className="mt-2">Leaderboards: {me.leaderboardOptOut ? "you are kept off them" : "you show as a short address"}.</p>
            {me.notifications.length > 0 && <p className="mt-2">{me.notifications.filter((n) => !n.readAt).length} unread notifications.</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * Care XP, kept separate from the gSera balance above. XP is a standing on
 * community.sera.cx, not a balance here: it cannot be spent and has no cash value.
 */
function CareXp({ me, causeName }: { me: Me; causeName: (id: number) => string }) {
  const xp = me.xp;
  return (
    <section aria-labelledby="xp-h">
      <h2 id="xp-h" className="font-display text-[22px] font-semibold tracking-tight">Care XP</h2>
      <p className="mt-1 text-[14px] text-ink-muted">
        XP is recorded on{" "}
        <a href={LINKS.community} target="_blank" rel="noopener noreferrer" className="text-sera-text underline underline-offset-2">
          {COMMUNITY_SITE}
        </a>
        . Everything you do as a helper earns it. It is not gSera, it is not a balance and it cannot be spent.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-rule bg-card p-4">
          <Eyebrow>Earned here</Eyebrow>
          <p className="mt-2 font-mono text-[32px] font-semibold leading-none tnum">{fmtInt(xp.total)}</p>
          <p className="mt-1 font-mono text-[11.5px] text-ink-muted">XP from {xp.events.length === 1 ? "1 event" : `${fmtInt(xp.events.length)} events`}</p>
        </div>
        <div className="rounded-2xl border border-rule bg-card p-4">
          <Eyebrow>Waiting to be credited</Eyebrow>
          <p className="mt-2 font-mono text-[32px] font-semibold leading-none tnum">{fmtInt(xp.queued)}</p>
          <p className="mt-1 font-mono text-[11.5px] text-ink-muted">moves across once the link is live</p>
        </div>
        <div className="rounded-2xl border border-rule bg-card p-4">
          <Eyebrow>Credited on {COMMUNITY_SITE}</Eyebrow>
          <p className="mt-2 font-mono text-[32px] font-semibold leading-none tnum">{fmtInt(xp.sent)}</p>
          <p className="mt-1 font-mono text-[11.5px] text-ink-muted">{xp.unmatched > 0 ? `${fmtInt(xp.unmatched)} waiting on a linked account` : "nothing held back"}</p>
        </div>
      </div>
      <Notice tone="warn" className="mt-4">
        The link to {COMMUNITY_SITE} is not live yet. Every event is recorded here, and credited there as soon as it is.
      </Notice>
      {xp.events.length === 0 ? (
        <Empty className="mt-4" title="No XP yet" body="Check a claim, vote on an open one, or finish a help request." />
      ) : (
        <ul className="mt-4 divide-y divide-rule border-y border-rule">
          {xp.events.map((e) => (
            <li key={e.id} className="grid gap-1 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="min-w-0">
                <p className="text-[14.5px]">
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-subtle mr-2">{e.eventType.replace(/_/g, " ")}</span>
                  {e.label}
                  {e.causeId ? `, ${causeName(e.causeId)}` : ""}
                </p>
                <p className="font-mono text-[12px] text-ink-muted">
                  {fmtDate(e.createdAt)} · {e.state === "sent" ? `credited on ${COMMUNITY_SITE}` : e.state === "unmatched" ? "waiting on a linked account" : "queued"}
                </p>
              </div>
              <span className="font-mono text-[15px] tnum text-sera-text">+{fmtInt(e.xp)} XP</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const REASON_LABEL: Record<LedgerView["reason"], string> = {
  gift: "Gift",
  challenge_stake: "Challenge stake",
  challenge_stake_return: "Challenge stake returned",
};

function LedgerRow({ entry, causeName }: { entry: LedgerView; causeName: (id: number) => string }) {
  const sign = entry.amount < 0 ? "-" : "+";
  const note = `${REASON_LABEL[entry.reason] ?? entry.reason}${entry.causeId ? `, ${causeName(entry.causeId)}` : entry.sourceTag === "trading" ? ", swaps on Sera.cx" : ""}`;
  const mult = entry.multipliers;
  return (
    <li className="grid gap-1 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <p className="text-[14.5px]">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-subtle mr-2">{entry.reason.replace("_", " ")}</span>
          {note}
        </p>
        <p className="font-mono text-[12px] text-ink-muted">
          {fmtDate(entry.createdAt)} · {entry.sourceTag === "charity" ? "charity-tagged" : "trading"}
          {mult ? ` · heat ${fmtMultiplier(mult.heat)} x volume ${fmtMultiplier(mult.volumeTier)} x streak ${fmtMultiplier(mult.streak)}` : ""}
          {entry.state !== "credited" ? ` · ${entry.state}` : ""}
        </p>
      </div>
      <span className={cn("font-mono text-[15px] tnum", entry.amount < 0 ? "text-danger" : entry.state !== "credited" ? "text-ink-muted" : "text-sera-text")}>
        {sign}
        {fmtInt(Math.abs(entry.amount))}
      </span>
    </li>
  );
}
