import { AlertTriangle, BellRing, Check, CircleAlert, CircleCheck, CircleDashed, ExternalLink, HandHeart, Share2 } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "wouter";
import { parseIdSlug } from "@/App";
import { ChecksBar } from "@/components/ChecksBar";
import { Empty, Notice, Spinner } from "@/components/Empty";
import { Eyebrow } from "@/components/Eyebrow";
import { MediaGallery } from "@/components/MediaGallery";
import { PhotoCredit } from "@/components/PhotoCredit";
import { RecordList } from "@/components/RecordList";
import { ShareButtons } from "@/components/ShareButtons";
import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { Wallet } from "@/components/Wallet";
import { useSeo } from "@/hooks/useSeo";
import { ONCHAIN_ONLY, pledgeHelp } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { CLAIM_INFO, COMMUNITY_SITE, XP, categoryLabel, type ClaimCode } from "@/lib/constants";
import { fmtDate, fmtInt, fmtUsd, fmtXp, plural, timeLeft } from "@/lib/format";
import { causeImage } from "@/lib/images";
import { useCause, useInvalidateAll, useRecord } from "@/lib/queries";
import { recordLines } from "@/lib/record";
import { claimHref, claimOf, pledgedBy, profileOf } from "@/lib/rules";
import type { CauseDetail, ClaimSummary, HelpRequestView } from "@/lib/types";
import { cn } from "@/lib/utils";
import { NotFoundPage } from "./NotFound";

export function CausePage() {
  const { idSlug = "" } = useParams<{ idSlug: string }>();
  const id = parseIdSlug(idSlug);
  const q = useCause(id);
  const cause = q.data;
  useSeo(cause?.name ?? "Cause", cause?.profile?.summary);

  if (q.isLoading) return <div className="container"><Spinner label="Loading cause" /></div>;
  if (!cause) return <NotFoundPage />;

  const canGive = cause.stage !== "paused" && cause.stage !== "closed";
  const p = profileOf(cause);
  const img = causeImage(cause);

  return (
    <article>
      {/* Hero */}
      <section className="border-b border-rule">
        <div className="container grid gap-6 py-8 md:grid-cols-[1.1fr_1fr] md:items-center md:py-12">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Eyebrow>{categoryLabel(p.category)}</Eyebrow>
              <span className="text-ink-subtle" aria-hidden>·</span>
              <Eyebrow>{[p.location.town, p.location.state].filter(Boolean).join(", ") || "Malaysia"}</Eyebrow>
            </div>
            <h1 className="mt-3 font-display text-[34px] leading-[1.04] font-semibold tracking-[-0.03em] sm:text-[44px] md:text-[50px]">{cause.name}</h1>
            {p.legalName && p.legalName !== cause.name && <p className="mt-1.5 font-mono text-[12.5px] text-ink-muted">{p.legalName}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <StatusPill stage={cause.stage} checksDone={cause.checksDone} checksTotal={cause.checksTotal} size="md" />
              {cause.urgent && <span className="rounded-full bg-[#0B1426] px-3 h-8 inline-flex items-center font-mono text-[11px] uppercase tracking-[0.12em] text-[#00E676]">Urgent appeal, chosen by Sera.cx</span>}
            </div>
            <p className="mt-5 max-w-[56ch] text-[17px] leading-[1.55] text-ink-muted sm:text-[18px]">{p.summary}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              {canGive ? (
                <Button asChild variant="give" size="lg">
                  <Link href={`/give/${cause.id}`}>Give to {cause.name.split(" ")[0]}</Link>
                </Button>
              ) : (
                <Button size="lg" variant="outline" disabled>Not taking gifts</Button>
              )}
              <Button asChild variant="outline" size="lg">
                <a href="#help">
                  <HandHeart className="h-4 w-4" aria-hidden /> Help without money
                </a>
              </Button>
              <Button asChild variant="ghost" size="lg">
                <Link href={`/c/${cause.id}/share`}>
                  <Share2 className="h-4 w-4" aria-hidden /> Share
                </Link>
              </Button>
            </div>
          </div>
          <figure>
            <div className="overflow-hidden rounded-2xl aspect-[4/3] bg-paper-warm">
              <img src={img.src} alt={img.alt} className="h-full w-full object-cover" fetchPriority="high" width={1200} height={900} />
            </div>
            <figcaption className="mt-2">
              <PhotoCredit image={p.image} />
            </figcaption>
          </figure>
        </div>
      </section>

      <div className="container grid gap-10 py-10 lg:grid-cols-[1fr_380px] lg:gap-14 lg:py-14">
        {/* Trust card: first on mobile, sticky right on desktop */}
        <aside className="order-first lg:order-none">
          <div className="lg:sticky lg:top-20">
            <TrustCard cause={cause} />
          </div>
        </aside>

        <div className="min-w-0 space-y-12">
          <LiveBlock cause={cause} />
          <WhatTheyDo cause={cause} />
          <HelpSection cause={cause} />
          <Organisation cause={cause} />
          {cause.media.length > 0 && (
            <Section id="media" title="Photos and video" lede="Posted by the organisation. Videos load only when you ask.">
              <MediaGallery items={cause.media} />
            </Section>
          )}
          <Updates cause={cause} />
          <Record cause={cause} />
          <Sources cause={cause} />
          <Section id="share" title="Share this cause" lede="A share link with a preview card, buttons for a website, and a poster with a QR code.">
            <ShareButtons causeId={cause.id} slug={cause.slug} name={cause.name} size="md" />
            <Button asChild variant="link" className="mt-3">
              <Link href={`/c/${cause.id}/share`}>All sharing tools, embed button and poster</Link>
            </Button>
          </Section>
        </div>
      </div>
    </article>
  );
}

function Section({ id, title, lede, children, className }: { id: string; title: string; lede?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("scroll-mt-24", className)} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="font-display text-[24px] font-semibold tracking-tight sm:text-[28px]">
        {title}
      </h2>
      {lede && <p className="mt-1.5 text-[15px] text-ink-muted max-w-[60ch]">{lede}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function rowState(s: ClaimSummary): { icon: React.ReactNode; label: string; tone: string } {
  if (s.challenged) return { icon: <CircleAlert className="h-4.5 w-4.5" aria-hidden />, label: "Challenged, voting reopened", tone: "text-[var(--pill-red-fg)]" };
  if (s.outcome === "verified" && s.state === "final") return { icon: <CircleCheck className="h-4.5 w-4.5" aria-hidden />, label: `Verified, ${plural(s.independentChecks, "independent check")}`, tone: "text-sera-text" };
  if (s.state === "voting") return { icon: <CircleDashed className="h-4.5 w-4.5" aria-hidden />, label: `Open for votes, ${timeLeft(s.votingEnd ?? "")}`, tone: "text-[var(--pill-amber-fg)]" };
  if (s.outcome === "needs_more") return { icon: <CircleDashed className="h-4.5 w-4.5" aria-hidden />, label: "Needs more evidence", tone: "text-[var(--pill-amber-fg)]" };
  if (s.pathCount > 0) return { icon: <CircleDashed className="h-4.5 w-4.5" aria-hidden />, label: `Being checked, ${plural(s.pathCount, "path")} so far`, tone: "text-[var(--pill-amber-fg)]" };
  if (s.evidenceCount > 0) return { icon: <CircleDashed className="h-4.5 w-4.5" aria-hidden />, label: `Evidence in, ${plural(s.evidenceCount, "item")}`, tone: "text-[var(--pill-amber-fg)]" };
  return { icon: <CircleDashed className="h-4.5 w-4.5" aria-hidden />, label: "Not checked yet", tone: "text-ink-subtle" };
}

function TrustCard({ cause }: { cause: CauseDetail }) {
  const required = cause.requiredClaims;
  const challenged = cause.claims.filter((k) => k.challenged);
  const badges: { code: ClaimCode; on: boolean; label: string }[] = [
    { code: "C5", on: cause.badges.taxExempt, label: "Tax-exempt (s44(6))" },
    { code: "C7", on: cause.badges.accountsPublished, label: "Accounts published" },
  ];
  return (
    <div className="rounded-2xl border border-rule bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>Trust</Eyebrow>
        <ChecksBar done={cause.checksDone} total={cause.checksTotal} />
      </div>
      <ul className="mt-4 divide-y divide-rule">
        {required.map((code) => {
          const s = claimOf(cause, code);
          if (!s) return null;
          const r = rowState(s);
          return (
            <li key={code} className="py-3">
              <div className="flex items-start gap-3">
                <span className={cn("mt-0.5 shrink-0", r.tone)}>{r.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14.5px] font-medium leading-snug">
                    <span className="mr-2 font-mono text-[11px] font-normal text-ink-subtle whitespace-nowrap">{code}</span>
                    {CLAIM_INFO[code].label}
                  </div>
                  <p className={cn("mt-0.5 text-[13px]", r.tone)}>{r.label}</p>
                  <Link href={`/verify/${cause.id}/${code}`} className="mt-1 inline-block text-[13px] text-sera-text underline-offset-2 hover:underline rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
                    {s.pathCount > 0 ? "See how it was checked" : "Help check this"}
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        {badges.map((b) => (
          <Link key={b.code} href={`/verify/${cause.id}/${b.code}`} className={cn("inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium", b.on ? "bg-[var(--pill-green-bg)] text-[var(--pill-green-fg)]" : "bg-[var(--pill-grey-bg)] text-[var(--pill-grey-fg)]")}>
            {b.on ? <Check className="h-3.5 w-3.5" aria-hidden /> : <CircleDashed className="h-3.5 w-3.5" aria-hidden />}
            {b.label}
            {!b.on && <span className="sr-only">, not yet</span>}
          </Link>
        ))}
      </div>
      <p className="mt-4 text-[13.5px] leading-[1.5] text-ink-muted">Gifts go straight to this cause's own address. Verification shows what has been checked, not whether the cause can use the money.</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-rule pt-4">
        <div>
          <dt className="eyebrow">Given so far</dt>
          <dd className="mt-1 font-mono text-[20px] font-semibold tnum">{fmtUsd(Number(cause.givenUsd))}</dd>
        </div>
        <div>
          <dt className="eyebrow">Givers</dt>
          <dd className="mt-1 font-mono text-[20px] font-semibold tnum">{fmtInt(cause.giversCount)}</dd>
        </div>
      </dl>
      {(cause.concerns.length > 0 || challenged.length > 0 || cause.homepageHiddenReason) && (
        <div className="mt-4 space-y-2 border-t border-rule pt-4">
          <Eyebrow>Concerns</Eyebrow>
          {challenged.map((k) => (
            <Notice key={k.claimType} tone="bad">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div>
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] opacity-80">challenge</span>
                  <p className="mt-0.5 text-[13.5px]">A challenge is open on {k.claimType} ({CLAIM_INFO[k.claimType].label}). Voting reopened.</p>
                  <Link href={claimHref(cause.id, k.claimType)} className="mt-1 inline-block text-[13px] font-medium underline underline-offset-2">
                    Open the claim
                  </Link>
                </div>
              </div>
            </Notice>
          ))}
          {cause.homepageHiddenReason && (
            <Notice tone="warn">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div>
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] opacity-80">steward</span>
                  <p className="mt-0.5 text-[13.5px]">Taken off the homepage by a steward: {cause.homepageHiddenReason}</p>
                </div>
              </div>
            </Notice>
          )}
          {cause.concerns.map((c, i) => (
            <Notice key={i} tone={c.kind === "note" ? "info" : c.kind === "steward-note" || c.kind === "challenge" ? "bad" : "warn"}>
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div>
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] opacity-80">{c.kind.replace(/-/g, " ")}</span>
                  <p className="mt-0.5 text-[13.5px]">{c.text}</p>
                </div>
              </div>
            </Notice>
          ))}
        </div>
      )}
    </div>
  );
}

function liveUrlOf(cause: CauseDetail): string | undefined {
  const stream = cause.updates.find((u) => u.kind === "stream" && (u.body?.link || u.body?.url));
  return stream?.body?.link ?? stream?.body?.url ?? undefined;
}

function LiveBlock({ cause }: { cause: CauseDetail }) {
  const [alerts, setAlerts] = useState(false);
  const p = profileOf(cause);
  const socials = p.contact.socials ?? {};
  const channels = Object.entries({ ...socials, website: p.contact.website }).filter(([, v]) => v) as [string, string][];
  const liveUrl = liveUrlOf(cause);
  return (
    <Section id="live" title={liveUrl ? "Live now" : "Live"} lede={p.live?.note}>
      {liveUrl ? (
        <div className="overflow-hidden rounded-xl border border-rule bg-black aspect-video">
          <iframe src={liveUrl} title={`${cause.name} live stream`} className="h-full w-full" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" />
        </div>
      ) : (
        <div className="rounded-xl border border-rule bg-paper-warm p-5">
          <div className="flex items-center gap-2 text-[14.5px] font-medium">
            <span className="h-2 w-2 rounded-full bg-ink/30" aria-hidden /> Offline. Gifts made during a stream show on screen.
          </div>
          {channels.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {channels.map(([k, v]) => (
                <li key={k}>
                  <a href={v} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 rounded-full border border-rule bg-card px-3 text-[13px] capitalize hover:border-ink/40">
                    {k} <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          )}
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setAlerts(!alerts)} aria-pressed={alerts}>
            <BellRing className="h-4 w-4" aria-hidden /> {alerts ? "Alerts on for the next stream" : "Turn on alerts"}
          </Button>
        </div>
      )}
    </Section>
  );
}

function WhatTheyDo({ cause }: { cause: CauseDetail }) {
  const p = profileOf(cause);
  return (
    <Section id="work" title="What they do">
      {p.background && <p className="text-[15.5px] leading-[1.6] text-ink-muted max-w-[64ch]">{p.background}</p>}
      <div className="mt-4 grid gap-6 sm:grid-cols-2">
        <div>
          <Eyebrow>Programmes</Eyebrow>
          <ul className="mt-2 space-y-1.5 text-[15px] leading-snug">
            {p.programmes.map((x) => (
              <li key={x} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sera" aria-hidden /> {x}
              </li>
            ))}
            {p.programmes.length === 0 && <li className="text-ink-muted">Not published yet.</li>}
          </ul>
        </div>
        <div>
          <Eyebrow>Impact</Eyebrow>
          <ul className="mt-2 space-y-1.5 text-[15px] leading-snug">
            {p.impact.map((x) => (
              <li key={x} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sera" aria-hidden /> <span className="tnum">{x}</span>
              </li>
            ))}
            {p.impact.length === 0 && <li className="text-ink-muted">No dated figures published yet. A helper's site visit would add one.</li>}
          </ul>
          {p.beneficiaries && (
            <p className="mt-3 text-[13.5px] text-ink-muted">
              <span className="font-medium text-ink">Who it serves:</span> {p.beneficiaries}
            </p>
          )}
        </div>
      </div>
    </Section>
  );
}

function HelpSection({ cause }: { cause: CauseDetail }) {
  const { user, signIn } = useAuth();
  const invalidate = useInvalidateAll();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onHelp = async (h: HelpRequestView) => {
    if (!user) return void signIn();
    setBusy(h.id);
    setError(null);
    try {
      await pledgeHelp(h.id);
      await invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };
  return (
    <Section id="help" title="Help this cause" lede={`Open requests from the listing. A fulfilled request, confirmed by the cause owner, earns ${fmtXp(XP.care_help_fulfilled.amount)} on ${COMMUNITY_SITE}.`}>
      {cause.helpRequests.length === 0 && <Empty title="No open requests" body="Check back after the charity claims its listing." />}
      <ul className="grid gap-3 sm:grid-cols-2">
        {cause.helpRequests.map((h) => {
          const taker = pledgedBy(h);
          return (
            <li key={h.id} className="rounded-xl border border-rule bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <Eyebrow>{h.kind}</Eyebrow>
                <span className="font-mono text-[11px] text-ink-muted tnum" title={`XP on ${COMMUNITY_SITE}`}>{fmtXp(h.kind === "translate" ? XP.care_translation.amount : XP.care_help_fulfilled.amount)}</span>
              </div>
              <h3 className="mt-2 font-display text-[16.5px] font-semibold leading-snug">{h.title}</h3>
              <p className="mt-1 text-[14px] leading-snug text-ink-muted">{h.detail}</p>
              <div className="mt-3">
                {h.state === "open" ? (
                  ONCHAIN_ONLY ? (
                    <span className="text-[13px] text-ink-muted">Pledge from your wallet on the registry (pledgeHelp #{h.id}).</span>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => void onHelp(h)} disabled={busy === h.id}>
                      {busy === h.id ? "Saving" : "I can help"}
                    </Button>
                  )
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted">
                    <Check className="h-4 w-4 text-sera-text" aria-hidden /> {h.state === "fulfilled" ? "Fulfilled" : h.state === "closed" ? "Closed" : <>Taken by {taker ? <Wallet address={taker} /> : "a helper"}</>}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {error && <Notice tone="bad" className="mt-3">{error}</Notice>}
    </Section>
  );
}

function Organisation({ cause }: { cause: CauseDetail }) {
  const p = profileOf(cause);
  const o = p.organisation;
  const c = p.contact;
  const rows: [string, React.ReactNode][] = [
    ["Legal name", p.legalName || "Not published"],
    ["Entity type", o.entityType || "Not published"],
    ["Registration number", o.registration ? <span className="font-mono tnum">{o.registration}</span> : "Not published"],
    ["Founded", o.founded || "Not published"],
    ["Founders", o.founders || "Not published"],
    ["Leadership", o.leadership || "Not published"],
    ["Tax exemption", o.taxExemption.statement || "Not stated"],
    ["Accounts", o.accounts || "Not public"],
    ["Contact", [c.address, c.phone, c.email].filter(Boolean).join(" · ") || "Organisation contacts not published"],
    ["Website", c.website ? <a className="text-sera-text underline underline-offset-2 break-all" href={c.website} target="_blank" rel="noopener noreferrer">{c.website}</a> : "None"],
  ];
  return (
    <Section id="organisation" title="Organisation" lede="Organisation contacts only. Nothing about private people goes on the record.">
      <dl className="divide-y divide-rule border-y border-rule">
        {rows.map(([k, v]) => (
          <div key={k} className="grid gap-1 py-2.5 sm:grid-cols-[180px_1fr]">
            <dt className="eyebrow">{k}</dt>
            <dd className="text-[14.5px] leading-snug">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 font-mono text-[12px] text-ink-muted">
        Cause address <Wallet address={cause.depositAddress} you={false} />. Every transfer in, conversion and withdrawal is on the record below.
      </p>
    </Section>
  );
}

function Updates({ cause }: { cause: CauseDetail }) {
  return (
    <Section id="updates" title="Updates" lede="From the charity, newest first: reports, receipts, photos and streams.">
      {cause.updates.length === 0 ? (
        <Empty title="No updates yet" body="Updates appear here once the charity claims its listing and posts." />
      ) : (
        <ol className="space-y-4">
          {cause.updates.map((u) => (
            <li key={u.id} className="rounded-xl border border-rule bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <Eyebrow>{u.kind}</Eyebrow>
                <time className="font-mono text-[11.5px] text-ink-subtle" dateTime={u.at}>{fmtDate(u.at)}</time>
              </div>
              <h3 className="mt-1.5 font-display text-[17px] font-semibold leading-snug">{u.body?.title ?? u.kind}</h3>
              <p className="mt-1 text-[14.5px] leading-[1.5] text-ink-muted">{u.body?.text ?? u.body?.body ?? ""}</p>
              {(u.body?.link ?? u.body?.url) && (
                <a href={u.body?.link ?? u.body?.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[13.5px] text-sera-text underline underline-offset-2">
                  Open link <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              )}
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

function Record({ cause }: { cause: CauseDetail }) {
  const rec = useRecord(cause.id);
  const [all, setAll] = useState(false);
  const events = recordLines(rec.data ?? []);
  return (
    <Section id="record" title="The record" lede="Everything that happened to this cause, newest first. On-chain events link to their transaction. Signed messages are stored by the API with their hash.">
      {rec.isLoading ? <Spinner label="Loading the record" /> : <RecordList events={events} limit={all ? undefined : 12} />}
      {events.length > 12 && (
        <Button variant="link" className="mt-3" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${events.length} events`}
        </Button>
      )}
    </Section>
  );
}

function Sources({ cause }: { cause: CauseDetail }) {
  const p = profileOf(cause);
  return (
    <Section id="sources" title="Sources" lede={p.profileCheckedOn ? `Every page this profile came from. Profile checked on ${fmtDate(p.profileCheckedOn)}.` : "Every page this profile came from."}>
      <ul className="space-y-1.5">
        {p.sources.map((s) => (
          <li key={s} className="text-[13.5px]">
            <a href={s} target="_blank" rel="noopener noreferrer" className="text-sera-text underline underline-offset-2 break-all">
              {s}
            </a>
          </li>
        ))}
        {p.sources.length === 0 && <li className="text-[14px] text-ink-muted">No sources recorded yet.</li>}
      </ul>
    </Section>
  );
}
