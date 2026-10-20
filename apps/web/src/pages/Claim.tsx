import { ArrowLeft, CircleAlert, CircleCheck, CircleDashed, CircleX, ExternalLink, Lock, Shield, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { Empty, ErrorState, Notice, Spinner } from "@/components/Empty";
import { Eyebrow } from "@/components/Eyebrow";
import { SignInButton } from "@/components/SignInButton";
import { Pill, StatusPill } from "@/components/StatusPill";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { Wallet } from "@/components/Wallet";
import { useSeo } from "@/hooks/useSeo";
import * as api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { CHALLENGE_STAKE, CLAIM_INFO, CLAIMS, COMMUNITY_SITE, VOTING, XP, type ClaimCode } from "@/lib/constants";
import { fmtDate, fmtGsera, fmtInt, fmtXp, timeLeft } from "@/lib/format";
import { useClaim, useInvalidateAll, useMe, useRecord } from "@/lib/queries";
import { recordLines } from "@/lib/record";
import { causeHref, voteWeight } from "@/lib/rules";
import { ROUTE_SEO, claimSeo } from "@/lib/seo";
import { breadcrumbSchema } from "@/lib/seoSchemas";
import { useJsonLdMany } from "@/hooks/useJsonLd";
import type { ClaimWorkspace, EvidenceKind, PathResult, PathView, VoteChoice } from "@/lib/types";
import { cn } from "@/lib/utils";
import { NotFoundPage } from "./NotFound";

export function ClaimPage() {
  const { causeId = "", claim = "" } = useParams<{ causeId: string; claim: string }>();
  const id = Number.parseInt(causeId, 10);
  const code = claim.toUpperCase() as ClaimCode;
  const valid = (CLAIMS as readonly string[]).includes(code);
  const q = useClaim(id, valid ? code : "C1");
  const data = q.data;
  useSeo(data ? claimSeo(data.cause, code, CLAIM_INFO[code].label) : ROUTE_SEO.verify);
  useJsonLdMany(
    data
      ? [
          {
            id: "breadcrumb",
            node: breadcrumbSchema([
              { name: "Causes", path: "/causes" },
              { name: data.cause.name, path: `/c/${data.cause.id}-${data.cause.slug}` },
              { name: `${code}: ${CLAIM_INFO[code].label}`, path: `/helpers/${data.cause.id}/${code}` },
            ]),
          },
        ]
      : [],
  );
  if (!valid) return <NotFoundPage />;
  if (q.isLoading) return <div className="container"><Spinner label="Loading the claim" /></div>;
  if (q.isError)
    return (
      <div className="container py-14">
        <div className="mx-auto max-w-[36rem]">
          <ErrorState title="We could not load this claim" error={q.error} onRetry={() => void q.refetch()}>
            <Button asChild size="sm" variant="ghost">
              <Link href="/helpers">Back to the hub</Link>
            </Button>
          </ErrorState>
        </div>
      </div>
    );
  if (!data) return <NotFoundPage />;
  return <Workspace ws={data} />;
}

function stateLabel(ws: ClaimWorkspace) {
  const c = ws.claim;
  if (c.challenged) return { label: "Challenged, voting reopened", tone: "red" as const, icon: CircleAlert, time: c.votingEnd ? timeLeft(c.votingEnd) : "" };
  if (c.outcome === "verified" && c.state === "final") return { label: "Verified, final", tone: "green" as const, icon: CircleCheck, time: c.finalisedAt ? `since ${fmtDate(c.finalisedAt)}` : "" };
  if (c.outcome === "not_verified") return { label: "Not verified", tone: "red" as const, icon: CircleX, time: "" };
  if (c.outcome === "needs_more" && c.state === "open") return { label: "Needs more evidence", tone: "amber" as const, icon: CircleDashed, time: "" };
  if (c.state === "voting") return { label: "Open for votes", tone: "amber" as const, icon: CircleDashed, time: c.votingEnd ? timeLeft(c.votingEnd) : "" };
  if (c.state === "challenge_window") return { label: "Challenge window", tone: "amber" as const, icon: CircleDashed, time: c.challengeWindowEnd ? timeLeft(c.challengeWindowEnd) : "" };
  if (c.evidenceCount === 0) return { label: "Needs evidence", tone: "grey" as const, icon: CircleDashed, time: "" };
  return { label: `Needs checking, ${c.pathCount} of ${VOTING.minPaths} paths`, tone: "amber" as const, icon: CircleDashed, time: "" };
}

/** The XP a helper can earn on this claim right now, credited on community.sera.cx. */
function xpOnOffer(ws: ClaimWorkspace): number {
  const c = ws.claim;
  if (c.state === "voting") return XP.care_vote_agreed.amount;
  if (c.state === "open" && c.outcome !== "verified") return XP.care_path_agreed.amount;
  return 0;
}

function Workspace({ ws }: { ws: ClaimWorkspace }) {
  const claim = ws.claim;
  const info = CLAIM_INFO[claim.claimType];
  const s = stateLabel(ws);
  const [pathsOpened, setPathsOpened] = useState(false);
  const openChallenge = ws.challenges.find((ch) => ch.state === "open");
  const canVote = claim.state === "voting";
  const canChallenge = claim.outcome !== "open" && (claim.state === "challenge_window" || claim.state === "final") && !claim.challenged;
  const offer = xpOnOffer(ws);

  return (
    <div className="container py-8 md:py-12">
      <Link href={causeHref(ws.cause.id, ws.cause.slug)} className="inline-flex min-h-11 items-center gap-1.5 text-[14px] text-ink-muted hover:text-ink sm:min-h-0">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {ws.cause.name}
      </Link>
      <header className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Eyebrow>Claim {claim.claimType}</Eyebrow>
          <span className="text-ink-subtle" aria-hidden>·</span>
          <Eyebrow>{claim.required ? "Required for Verified" : info.badge ? `Badge: ${info.badge}` : "Not required"}</Eyebrow>
          <span className="text-ink-subtle" aria-hidden>·</span>
          <Eyebrow>Epoch {claim.epoch}</Eyebrow>
        </div>
        <h1 className="mt-2 font-display text-[28px] font-semibold leading-[1.1] tracking-[-0.025em] sm:text-[36px]">{info.label}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Pill tone={s.tone} icon={s.icon}>
            {s.label}
          </Pill>
          {s.time && <span className="font-mono text-[12.5px] text-ink-muted tnum">{s.time}</span>}
          <StatusPill stage={ws.cause.stage} />
          {offer > 0 && (
            <span className="font-mono text-[12.5px] text-sera-text tnum">
              {fmtXp(offer)} on offer, on {COMMUNITY_SITE}
            </span>
          )}
        </div>
        {/* Two columns of running prose in a full-width box, so each one
            takes the measure rather than the whole half. */}
        <div className="mt-4 grid gap-3 rounded-xl border border-rule bg-paper-warm p-4 text-[14px] sm:grid-cols-2">
          <div>
            <Eyebrow>What counts as proof</Eyebrow>
            <p className="mt-1 measure text-ink-muted">{info.proof}</p>
          </div>
          <div>
            <Eyebrow>Where to check</Eyebrow>
            <p className="mt-1 measure text-ink-muted">{info.whereToCheck}</p>
            {ws.cause.registration && (
              <p className="mt-1 font-mono text-[12.5px] tnum">
                Registration on the profile: {ws.cause.registration}
                {ws.cause.legalName ? ` (${ws.cause.legalName})` : ""}
              </p>
            )}
          </div>
        </div>
        {ws.decidedBy === "stewards" && (
          <Notice tone="info" className="mt-3 measure">
            <span className="inline-flex items-center gap-2">
              <Shield className="h-4 w-4" aria-hidden /> Advisory mode. The votes and the tally are shown, and Sera.cx stewards settle this claim.
            </span>
          </Notice>
        )}
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-10">
          {openChallenge && <ChallengeCard ws={ws} challenge={openChallenge} />}
          <EvidenceList ws={ws} />
          <Paths ws={ws} onOpened={() => setPathsOpened(true)} />
          <History ws={ws} />
        </div>
        <aside className="space-y-6">
          <div className="lg:sticky lg:top-20 space-y-6">
            <Tally ws={ws} />
            {canVote && <VotePanel ws={ws} unlocked={pathsOpened} />}
            {canChallenge && <ChallengePanel ws={ws} />}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Block({ title, lede, action, children }: { title: string; lede?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[22px] font-semibold tracking-tight">{title}</h2>
          {lede && <p className="mt-1 measure text-[14px] text-ink-muted">{lede}</p>}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

const fileInputCls = "block min-h-11 w-full text-[14px] text-ink-muted file:mr-3 file:rounded-full file:border file:border-rule file:bg-card file:px-4 file:py-2.5 file:text-[13px] file:font-medium file:text-ink";

function EvidenceList({ ws }: { ws: ClaimWorkspace }) {
  return (
    <Block title="Evidence" lede="Anyone can upload. We take a fingerprint of every file and record it, so nobody can swap a file later." action={<UploadEvidence ws={ws} />}>
      {ws.evidence.length === 0 ? (
        <Empty title="No evidence yet" body="Upload a document, a link, a dated photo, a video or a message signed by a wallet." />
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {ws.evidence.map((e) => (
            <li key={e.id} className="grid gap-1 py-3 sm:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <p className="text-[15px] font-medium">
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-subtle mr-2">{e.kind}</span>
                  {e.title}
                </p>
                {e.note && <p className="text-[13.5px] text-ink-muted">{e.note}</p>}
                <p className="mt-1 font-mono text-[11px] text-ink-subtle break-all">
                  <Wallet address={e.uploader} /> · {fmtDate(e.createdAt, true)} · hash {e.fileHash.slice(0, 18)}…
                </p>
              </div>
              {e.fileUrl && (
                <a href={e.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] text-sera-text underline underline-offset-2">
                  Open <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </Block>
  );
}

function UploadEvidence({ ws }: { ws: ClaimWorkspace }) {
  const { user } = useAuth();
  const invalidate = useInvalidateAll();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<EvidenceKind>("document");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [redacted, setRedacted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!user) return <SignInButton variant="outline" size="sm" label="Sign in to upload" />;
  const needsFile = kind !== "link";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.postEvidence({ causeId: ws.cause.id, claim: ws.claim.claimType, kind, title, note, link: url || undefined, file, redactionConfirmed: redacted });
      await invalidate();
      setOpen(false);
      setTitle("");
      setNote("");
      setUrl("");
      setFile(null);
      setRedacted(false);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="h-4 w-4" aria-hidden /> Upload evidence
        </Button>
      </DialogTrigger>
      <DialogContent title="Upload evidence" description={`For ${ws.claim.claimType}: ${CLAIM_INFO[ws.claim.claimType].label}`}>
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <Notice tone="warn">Black out personal details first: IC numbers, home addresses, personal phone numbers and signatures. We reject files that still show them.</Notice>
          <Field label="Type" htmlFor="ev-kind">
            <Select id="ev-kind" value={kind} onChange={(e) => setKind(e.target.value as EvidenceKind)}>
              <option value="document">Document (PDF or image)</option>
              <option value="link">Link</option>
              <option value="photo">Photo with location and date</option>
              <option value="video">Video (mp4)</option>
              <option value="signature">Signed wallet message (file)</option>
            </Select>
          </Field>
          <Field label="Title" htmlFor="ev-title">
            <Input id="ev-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          {!needsFile ? (
            <Field label="URL" htmlFor="ev-url">
              <Input id="ev-url" type="url" required value={url} onChange={(e) => setUrl(e.target.value)} />
            </Field>
          ) : (
            <div>
              <p className="font-sans text-[14px] font-medium mb-1.5">File (10 MB, pdf, png, jpg, webp or mp4)</p>
              <input type="file" required accept=".pdf,.png,.jpg,.jpeg,.webp,.mp4,application/pdf,image/png,image/jpeg,image/webp,video/mp4" className={fileInputCls} aria-label="File" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
          )}
          <Field label="Note" htmlFor="ev-note" hint="What it shows, in one or two sentences.">
            <Textarea id="ev-note" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[72px]" />
          </Field>
          <Checkbox id="ev-redacted" checked={redacted} onChange={(e) => setRedacted(e.target.checked)} label="I have blacked out the personal details in this file" />
          {err && <Notice tone="bad">{err}</Notice>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !redacted || (needsFile && !file)}>
              {busy ? "Uploading" : "Upload"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const RESULT: Record<PathResult, { label: string; tone: "green" | "red" | "grey"; icon: typeof CircleCheck }> = {
  verified: { label: "Verified", tone: "green", icon: CircleCheck },
  not_verified: { label: "Not verified", tone: "red", icon: CircleX },
  could_not_check: { label: "Could not check", tone: "grey", icon: CircleDashed },
};

function Paths({ ws, onOpened }: { ws: ClaimWorkspace; onOpened: () => void }) {
  const opened = async () => {
    onOpened();
    await api.markPathsOpened(ws.cause.id, ws.claim.claimType);
  };
  const n = ws.claim.independentChecks;
  return (
    <Block title="Verification paths" lede={`A path is a written note of exactly how one person checked this claim. ${n} independent ${n === 1 ? "check agrees" : "checks agree"} so far. Open a path to unlock the vote.`} action={<AddPath ws={ws} />}>
      {ws.paths.length === 0 ? (
        <Empty title="Nobody has checked this yet" body={`Be the first. Write down how you checked it and earn ${fmtXp(XP.care_path_agreed.amount)} on ${COMMUNITY_SITE} when the final result agrees with you.`} />
      ) : (
        <ul className="space-y-3">
          {[...ws.paths].reverse().map((p) => (
            <PathCard key={p.id} path={p} onToggle={opened} />
          ))}
        </ul>
      )}
    </Block>
  );
}

function PathCard({ path, onToggle }: { path: PathView; onToggle: () => void }) {
  const r = RESULT[path.result];
  const b = path.body;
  const rows: [string, React.ReactNode][] = [
    ["Source", b.source],
    ["Steps", <ol className="list-decimal pl-4 space-y-0.5">{b.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>],
    ["Exact search used", <code className="font-mono text-[13px] tnum">{b.exactQuery}</code>],
    ["What I found", b.findings],
    ["Matches the profile?", b.matches ? "Yes" : "No"],
    ["Screenshot", <span className="font-mono text-[12px] break-all">Uploaded, fingerprint {b.screenshotHash.slice(0, 22)}…</span>],
    ["Checked on", `${fmtDate(b.checkedAt, true)} MYT`],
    ["Result", <Pill tone={r.tone} icon={r.icon}>{r.label}</Pill>],
    ["Caveats", b.caveats || "None"],
    ["Do they know the organisation?", b.conflictOfInterest],
    ["Signature", <span className="font-mono text-[11px] break-all text-ink-subtle">{path.signature.slice(0, 26)}… (EIP-712, content fingerprint {path.contentHash.slice(0, 12)}…)</span>],
  ];
  return (
    <li>
      <details className="group rounded-xl border border-rule bg-card" onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) onToggle(); }}>
        <summary className="flex cursor-pointer flex-wrap items-center gap-3 p-4 list-none [&::-webkit-details-marker]:hidden focus-visible:outline-2 focus-visible:outline-ring rounded-xl">
          <Pill tone={r.tone} icon={r.icon}>
            {r.label}
          </Pill>
          <span className="text-[14.5px]">
            <Wallet address={path.author} />
            {path.epoch > 0 && <span className="text-ink-muted"> · epoch {path.epoch}</span>}
            {path.outcomeAgreed === true && <span className="text-sera-text"> · agreed with the outcome</span>}
            {path.outcomeAgreed === false && <span className="text-[var(--pill-red-fg)]"> · overturned</span>}
          </span>
          <span className="ml-auto font-mono text-[11.5px] text-ink-subtle">{fmtDate(path.checkedAt)}</span>
          <span className="font-mono text-[11px] text-ink-subtle group-open:hidden">Open</span>
          <span className="font-mono text-[11px] text-ink-subtle hidden group-open:inline">Close</span>
        </summary>
        <dl className="border-t border-rule px-4 py-2 text-[14px]">
          {rows.map(([k, v]) => (
            <div key={k} className="grid gap-0.5 py-2 sm:grid-cols-[170px_1fr] border-b border-rule last:border-b-0">
              <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-subtle">{k}</dt>
              <dd className="text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </details>
    </li>
  );
}

/** The path template fields a helper fills in, shared by Add your check and Challenge. */
interface PathForm {
  source: string;
  steps: string;
  exactQuery: string;
  findings: string;
  matches: "yes" | "no";
  checkedAt: string;
  result: PathResult;
  caveats: string;
  conflictOfInterest: string;
}

const localNow = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const emptyPathForm = (): PathForm => ({ source: "", steps: "", exactQuery: "", findings: "", matches: "yes", checkedAt: localNow(), result: "verified", caveats: "", conflictOfInterest: "None. I do not know anyone at this organisation." });

function toPathBody(f: PathForm) {
  return {
    source: f.source,
    steps: f.steps.split("\n").map((s) => s.trim()).filter(Boolean),
    exactQuery: f.exactQuery,
    findings: f.findings,
    matches: f.matches === "yes",
    checkedAt: new Date(f.checkedAt).toISOString(),
    result: f.result,
    caveats: f.caveats,
    conflictOfInterest: f.conflictOfInterest,
  };
}

function PathFields({ f, setF, idPrefix, ws }: { f: PathForm; setF: (f: PathForm) => void; idPrefix: string; ws: ClaimWorkspace }) {
  const field = (k: keyof PathForm) => ({ value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value }) });
  return (
    <>
      <Field label="Source: the name of the official tool you used" htmlFor={`${idPrefix}-source`} hint={CLAIM_INFO[ws.claim.claimType].whereToCheck}>
        <Input id={`${idPrefix}-source`} required {...field("source")} />
      </Field>
      <Field label="Steps, one per line" htmlFor={`${idPrefix}-steps`}>
        <Textarea id={`${idPrefix}-steps`} required {...field("steps")} placeholder={"1. Opened the ROS public search.\n2. Searched the registration number.\n3. Opened the result."} />
      </Field>
      <Field label="Exact search used" htmlFor={`${idPrefix}-search`}>
        <Input id={`${idPrefix}-search`} required className="font-mono" {...field("exactQuery")} placeholder={ws.cause.registration || "the search string"} />
      </Field>
      <Field label="What I found" htmlFor={`${idPrefix}-found`}>
        <Textarea id={`${idPrefix}-found`} required {...field("findings")} className="min-h-[72px]" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Matches the profile?" htmlFor={`${idPrefix}-matches`}>
          <Select id={`${idPrefix}-matches`} {...field("matches")}>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </Select>
        </Field>
        <Field label="Checked on" htmlFor={`${idPrefix}-at`}>
          <Input id={`${idPrefix}-at`} type="datetime-local" required {...field("checkedAt")} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Result" htmlFor={`${idPrefix}-result`}>
          <Select id={`${idPrefix}-result`} {...field("result")}>
            <option value="verified">Verified</option>
            <option value="not_verified">Not verified</option>
            <option value="could_not_check">Could not check</option>
          </Select>
        </Field>
        <Field label="Caveats" htmlFor={`${idPrefix}-caveats`}>
          <Input id={`${idPrefix}-caveats`} {...field("caveats")} />
        </Field>
      </div>
      <Field label="Do you know this organisation?" htmlFor={`${idPrefix}-conflict`}>
        <Input id={`${idPrefix}-conflict`} required {...field("conflictOfInterest")} />
      </Field>
    </>
  );
}

function AddPath({ ws }: { ws: ClaimWorkspace }) {
  const { user } = useAuth();
  const invalidate = useInvalidateAll();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<PathForm>(emptyPathForm);
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [redacted, setRedacted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!user) return <SignInButton variant="outline" size="sm" label="Sign in to add a check" />;
  const already = ws.paths.some((p) => p.author.toLowerCase() === user.wallet.toLowerCase());
  const valid = f.source.trim() && f.steps.trim() && f.findings.trim() && f.exactQuery.trim() && screenshot && f.checkedAt && redacted;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) {
      setErr("A path needs a source, the steps you took, the exact search, what you found, and a screenshot with the date on it.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.postPath({ causeId: ws.cause.id, claim: ws.claim.claimType, epoch: ws.claim.epoch, body: toPathBody(f), screenshot, redactionConfirmed: redacted });
      await invalidate();
      setOpen(false);
      setF(emptyPathForm());
      setScreenshot(null);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not submit");
    } finally {
      setBusy(false);
    }
  };
  if (already) return <span className="text-[13px] text-ink-muted">You have signed a path on this epoch.</span>;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Add your check</Button>
      </DialogTrigger>
      <DialogContent title="Add your check" description={`${ws.claim.claimType}: ${CLAIM_INFO[ws.claim.claimType].label}. One claim per path. Signed by your wallet, public and permanent.`} className="max-w-2xl">
        <form onSubmit={(e) => void submit(e)} className="space-y-3">
          <PathFields f={f} setF={setF} idPrefix="p" ws={ws} />
          <Field label="Screenshot, with the date showing" htmlFor="p-shot" hint="It is uploaded as evidence on this claim, and its fingerprint goes into the path you sign.">
            <input id="p-shot" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" required className={fileInputCls} onChange={(e) => setScreenshot(e.target.files?.[0] ?? null)} />
          </Field>
          <Checkbox id="p-redacted" checked={redacted} onChange={(e) => setRedacted(e.target.checked)} label="I have blacked out the personal details in the screenshot" />
          {err && <Notice tone="bad">{err}</Notice>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !valid}>
              {busy ? "Signing" : "Sign and submit"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Tally({ ws }: { ws: ClaimWorkspace }) {
  const t = ws.tally;
  const round = (n: number) => Math.round(n * 10) / 10;
  const quorumPct = Math.min(100, Math.round((t.total / VOTING.quorumWeight) * 100));
  const verifiedPct = Math.round(t.verifiedShare * 100);
  const bars: [string, number, string][] = [
    ["Verified", round(t.verified), "bg-sera-deep dark:bg-sera"],
    ["Not verified", round(t.not), "bg-[var(--pill-red-fg)]"],
    ["Needs more evidence", round(t.more), "bg-[var(--pill-amber-fg)]"],
  ];
  return (
    <div className="rounded-2xl border border-rule bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-[18px] font-semibold">Tally</h2>
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-subtle">{ws.decidedBy === "stewards" ? "Advisory" : "Community"}</span>
      </div>
      <p className="mt-1 text-[13px] text-ink-muted">
        {fmtInt(ws.votes.length)} votes, weight {round(t.total)}. {ws.decidedBy === "stewards" ? "Stewards settle this claim." : "The votes decide this claim."}
      </p>
      <ul className="mt-4 space-y-2.5">
        {bars.map(([label, w, cls]) => (
          <li key={label}>
            <div className="flex items-baseline justify-between text-[13.5px]">
              <span>{label}</span>
              <span className="font-mono tnum">{w}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-ink/10" role="img" aria-label={`${label}: weight ${w}`}>
              <div className={cn("h-2 rounded-full", cls)} style={{ width: `${t.total ? (w / t.total) * 100 : 0}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <dl className="mt-4 space-y-2 border-t border-rule pt-3 text-[13.5px]">
        <div>
          <div className="flex justify-between">
            <dt>Quorum (weight {VOTING.quorumWeight})</dt>
            <dd className="font-mono tnum">{t.quorumMet ? "met" : `${round(t.total)} of ${VOTING.quorumWeight}`}</dd>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-ink/10" aria-hidden>
            <div className="h-1.5 rounded-full bg-ink/60" style={{ width: `${quorumPct}%` }} />
          </div>
        </div>
        <div className="flex justify-between">
          <dt>Threshold ({VOTING.thresholdPct}% Verified)</dt>
          <dd className="font-mono tnum">{verifiedPct}%</dd>
        </div>
        <div className="flex justify-between">
          <dt>Would pass</dt>
          <dd className={cn("font-mono", t.passed ? "text-sera-text" : "text-ink-muted")}>{t.passed ? "yes" : `not yet (${t.outcome.replace("_", " ")})`}</dd>
        </div>
      </dl>
      {ws.votes.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[13px] font-medium">Votes and reasons</summary>
          <ul className="mt-2 space-y-2 text-[13px]">
            {ws.votes.map((v) => (
              <li key={v.id}>
                <span className="font-mono text-[11px] text-ink-subtle">w{round(v.weight)}</span> <Wallet address={v.voter} /> <span className="font-medium">{v.choice.replace("_", " ")}</span>
                <p className="text-ink-muted">{v.reason}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function VotePanel({ ws, unlocked }: { ws: ClaimWorkspace; unlocked: boolean }) {
  const { user } = useAuth();
  const me = useMe();
  const invalidate = useInvalidateAll();
  const [choice, setChoice] = useState<VoteChoice>("verified");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const already = !!user && ws.votes.some((v) => v.voter.toLowerCase() === user.wallet.toLowerCase());
  const eligibility = ws.eligibility ?? me.data?.eligibility ?? null;
  const reputation = me.data?.reputation ?? 0;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.postVote({ causeId: ws.cause.id, claim: ws.claim.claimType, epoch: ws.claim.epoch, choice, reason });
      await invalidate();
      setDone(true);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not vote");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-2xl border border-rule bg-card p-5">
      <h2 className="font-display text-[18px] font-semibold">Vote</h2>
      {!user ? (
        <div className="mt-2">
          <p className="text-[13.5px] text-ink-muted">To vote you need a wallet that has passed screening and has made one gift, or had one contribution accepted.</p>
          <SignInButton size="sm" className="mt-3" label="Sign in" />
        </div>
      ) : already || done ? (
        <Notice tone="good" className="mt-3">You have voted on this claim. {fmtXp(XP.care_vote_agreed.amount)} on {COMMUNITY_SITE} when the final outcome agrees.</Notice>
      ) : eligibility && !eligibility.canVote ? (
        <Notice tone="warn" className="mt-3">Not eligible yet: {eligibility.reasons.join("; ")}.</Notice>
      ) : !unlocked ? (
        <div className="mt-2 rounded-xl border border-dashed border-rule bg-paper-warm p-4 text-[13.5px] text-ink-muted">
          <p className="inline-flex items-center gap-2 font-medium text-ink">
            <Lock className="h-4 w-4" aria-hidden /> Locked
          </p>
          <p className="mt-1">Open at least one verification path above. The vote unlocks once you have read how somebody checked this claim.</p>
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="mt-3 space-y-3">
          <p className="text-[13px] text-ink-muted">
            Your weight: <span className="font-mono tnum">{voteWeight(reputation)}</span> (reputation {reputation}).
          </p>
          <fieldset>
            <legend className="sr-only">Choice</legend>
            <div className="space-y-1.5">
              {(["verified", "not_verified", "needs_more"] as VoteChoice[]).map((c) => (
                <label key={c} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[14px]", choice === c ? "border-ink bg-paper-warm" : "border-rule")}>
                  <input type="radio" name="choice" value={c} checked={choice === c} onChange={() => setChoice(c)} className="accent-[#1B7A3F]" />
                  {c === "verified" ? "Verified" : c === "not_verified" ? "Not verified" : "Needs more evidence"}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="One-line reason" htmlFor="vote-reason">
            <Input id="vote-reason" required maxLength={280} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {err && <Notice tone="bad">{err}</Notice>}
          <Button type="submit" size="sm" disabled={busy || !reason.trim()}>
            {busy ? "Signing" : "Sign and vote"}
          </Button>
        </form>
      )}
    </div>
  );
}

function ChallengeCard({ ws, challenge: ch }: { ws: ClaimWorkspace; challenge: ClaimWorkspace["challenges"][number] }) {
  return (
    <Notice tone="bad">
      <div className="flex gap-3">
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <div>
          <p className="font-display text-[16px] font-semibold">Challenge open. {fmtGsera(ch.stake)} staked by <Wallet address={ch.challenger} />.</p>
          <p className="mt-1 text-[14px]">{ch.body.statement}</p>
          <p className="mt-1 text-[13px] opacity-90">
            Challenger's path: {ch.body.path.source}. Result: {ch.body.path.result.replace("_", " ")}.
            {ch.body.evidenceIds.length > 0 ? ` ${ch.body.evidenceIds.length} piece${ch.body.evidenceIds.length === 1 ? "" : "s"} of counter-evidence uploaded.` : ""}
          </p>
          <p className="mt-1 font-mono text-[11.5px] opacity-80">
            Voting is open again{ws.claim.votingEnd ? `, ${timeLeft(ws.claim.votingEnd)}` : ""}. If the challenge wins, the challenger gets the stake back plus {fmtXp(XP.care_challenge_upheld.amount)} on {COMMUNITY_SITE}. If it loses, the stake is burned.
          </p>
        </div>
      </div>
    </Notice>
  );
}

function ChallengePanel({ ws }: { ws: ClaimWorkspace }) {
  const { user } = useAuth();
  const me = useMe();
  const invalidate = useInvalidateAll();
  const [open, setOpen] = useState(false);
  const [statement, setStatement] = useState("");
  const [f, setF] = useState<PathForm>(() => ({ ...emptyPathForm(), result: "not_verified", matches: "no" }));
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const spendable = me.data?.gsera?.spendable ?? me.data?.ledger.credited ?? 0;
  const valid = statement.trim() && f.source.trim() && f.steps.trim() && f.findings.trim() && f.exactQuery.trim();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.postChallenge({ causeId: ws.cause.id, claim: ws.claim.claimType, epoch: ws.claim.epoch, statement, path: toPathBody(f), counterEvidence: file });
      await invalidate();
      setOpen(false);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not challenge");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-2xl border border-rule bg-card p-5">
      <h2 className="font-display text-[18px] font-semibold">Challenge</h2>
      <p className="mt-1 text-[13.5px] text-ink-muted">
        Think this result is wrong? Stake {fmtGsera(CHALLENGE_STAKE)}, upload evidence against it, and write your own path. Voting then reopens for {VOTING.periodDays} days.
        {ws.claim.state === "challenge_window" && ws.claim.challengeWindowEnd ? ` Window: ${timeLeft(ws.claim.challengeWindowEnd)}.` : ""}
      </p>
      {!user ? (
        <SignInButton size="sm" variant="outline" className="mt-3" label="Sign in to challenge" />
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="mt-3">
              Challenge this claim
            </Button>
          </DialogTrigger>
          <DialogContent title="Challenge this claim" description={`Stake ${fmtGsera(CHALLENGE_STAKE)}. Returned with ${fmtXp(XP.care_challenge_upheld.amount)} on ${COMMUNITY_SITE} if upheld, burned if not.`} className="max-w-2xl">
            <form onSubmit={(e) => void submit(e)} className="space-y-3">
              <p className="font-mono text-[12.5px] tnum text-ink-muted">Your spendable gSera: {fmtInt(spendable)}</p>
              {spendable < CHALLENGE_STAKE && <Notice tone="warn">You need {fmtGsera(CHALLENGE_STAKE)} spendable to stake.</Notice>}
              <Field label="What is wrong? One or two sentences." htmlFor="ch-summary">
                <Textarea id="ch-summary" required value={statement} onChange={(e) => setStatement(e.target.value)} className="min-h-[72px]" />
              </Field>
              <p className="font-display text-[15px] font-semibold pt-1">Your own path</p>
              <PathFields f={f} setF={setF} idPrefix="ch" ws={ws} />
              <Field label="Evidence against it (PDF or image)" htmlFor="ch-file" hint="It is uploaded as evidence on this claim and shown on the challenge.">
                <input id="ch-file" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className={fileInputCls} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </Field>
              {err && <Notice tone="bad">{err}</Notice>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy || !valid || spendable < CHALLENGE_STAKE}>
                  {busy ? "Staking" : `Stake ${fmtInt(CHALLENGE_STAKE)} and challenge`}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function History({ ws }: { ws: ClaimWorkspace }) {
  const rec = useRecord(ws.cause.id);
  const lines = useMemo(() => recordLines(rec.data ?? []).filter((l) => l.claim === ws.claim.claimType || l.tag === "listed"), [rec.data, ws.claim.claimType]);
  return (
    <Block title="History of this claim">
      {rec.isError ? (
        <ErrorState title="We could not load the history" error={rec.error} onRetry={() => void rec.refetch()} />
      ) : rec.isLoading ? (
        <Spinner label="Loading the record" />
      ) : lines.length === 0 ? (
        <p className="text-[14.5px] text-ink-muted">Nothing on the record for this claim yet.</p>
      ) : (
        <ol className="divide-y divide-rule border-y border-rule">
          {lines.map((h) => (
            <li key={h.key} className="grid gap-0.5 py-2.5 sm:grid-cols-[150px_1fr]">
              <time dateTime={h.at} className="font-mono text-[12px] text-ink-subtle tnum">
                {fmtDate(h.at, true)}
              </time>
              <span className="text-[14px]">
                <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-subtle mr-2">{h.tag}</span>
                {h.summary}
                {h.by && (
                  <span className="text-ink-muted">
                    {" "}
                    by <Wallet address={h.by} />
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Block>
  );
}
