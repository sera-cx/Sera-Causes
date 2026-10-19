import { ArrowLeft, CircleAlert, CircleCheck, CircleDashed, CircleX, ExternalLink, Lock, Shield, Upload } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "wouter";
import { Empty, Notice, Spinner } from "@/components/Empty";
import { Eyebrow } from "@/components/Eyebrow";
import { Pill, StatusPill } from "@/components/StatusPill";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { Wallet } from "@/components/Wallet";
import { useSeo } from "@/hooks/useSeo";
import * as api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { CHALLENGE_STAKE, CLAIM_INFO, CLAIMS, GSERA, VOTING, type ClaimCode } from "@/lib/constants";
import { fmtDate, fmtGsera, fmtInt, timeLeft } from "@/lib/format";
import { useClaim, useInvalidateAll, useMe } from "@/lib/queries";
import { causeHref } from "@/lib/rules";
import type { Claim, EvidenceKind, PathResult, VerificationPath, VoteChoice } from "@/lib/types";
import { cn } from "@/lib/utils";
import { NotFoundPage } from "./NotFound";

export function ClaimPage() {
  const { causeId = "", claim = "" } = useParams<{ causeId: string; claim: string }>();
  const id = Number.parseInt(causeId, 10);
  const code = claim.toUpperCase() as ClaimCode;
  const valid = (CLAIMS as readonly string[]).includes(code);
  const q = useClaim(id, valid ? code : "C1");
  const data = q.data;
  useSeo(data ? `${code} on ${data.causeName}` : "Claim");
  if (!valid) return <NotFoundPage />;
  if (q.isLoading) return <div className="container"><Spinner label="Loading claim" /></div>;
  if (!data) return <NotFoundPage />;
  return <Workspace claim={data} />;
}

function stateLabel(c: Claim) {
  if (c.challenged) return { label: "Challenged, voting reopened", tone: "red" as const, icon: CircleAlert, time: c.challenge ? timeLeft(c.challenge.votingEnd) : "" };
  if (c.outcome === "verified" && c.state === "final") return { label: "Verified, final", tone: "green" as const, icon: CircleCheck, time: c.finalisedAt ? `since ${fmtDate(c.finalisedAt)}` : "" };
  if (c.outcome === "not_verified") return { label: "Not verified", tone: "red" as const, icon: CircleX, time: "" };
  if (c.state === "voting") return { label: "Open for votes", tone: "amber" as const, icon: CircleDashed, time: c.votingEnd ? timeLeft(c.votingEnd) : "" };
  if (c.state === "challenge_window") return { label: "Challenge window", tone: "amber" as const, icon: CircleDashed, time: c.challengeWindowEnd ? timeLeft(c.challengeWindowEnd) : "" };
  if (c.evidenceCount === 0) return { label: "Needs evidence", tone: "grey" as const, icon: CircleDashed, time: "" };
  return { label: `Needs checking, ${c.pathCount} of ${VOTING.minPaths} paths`, tone: "amber" as const, icon: CircleDashed, time: "" };
}

function Workspace({ claim }: { claim: Claim }) {
  const info = CLAIM_INFO[claim.code];
  const s = stateLabel(claim);
  const [pathsOpened, setPathsOpened] = useState(false);
  const canVote = claim.state === "voting" || claim.challenged;
  const canChallenge = (claim.outcome === "verified" && (claim.state === "challenge_window" || claim.state === "final")) && !claim.challenged;

  return (
    <div className="container max-w-5xl py-8 md:py-12">
      <Link href={causeHref(claim.causeId, claim.causeSlug)} className="inline-flex items-center gap-1.5 text-[14px] text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {claim.causeName}
      </Link>
      <header className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Eyebrow>Claim {claim.code}</Eyebrow>
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
          <StatusPill stage={claim.causeStage} />
          {claim.gseraOnOffer > 0 && <span className="font-mono text-[12.5px] text-sera-text tnum">{fmtGsera(claim.gseraOnOffer)} on offer</span>}
        </div>
        <div className="mt-4 grid gap-3 rounded-xl border border-rule bg-paper-warm p-4 text-[14px] sm:grid-cols-2">
          <div>
            <Eyebrow>What counts as proof</Eyebrow>
            <p className="mt-1 text-ink-muted">{info.proof}</p>
          </div>
          <div>
            <Eyebrow>Where to check</Eyebrow>
            <p className="mt-1 text-ink-muted">{info.whereToCheck}</p>
            {claim.registration && (
              <p className="mt-1 font-mono text-[12.5px] tnum">
                Registration on the profile: {claim.registration}
                {claim.legalName ? ` (${claim.legalName})` : ""}
              </p>
            )}
          </div>
        </div>
        {claim.mode === "advisory" && (
          <Notice tone="info" className="mt-3">
            <span className="inline-flex items-center gap-2">
              <Shield className="h-4 w-4" aria-hidden /> Advisory mode. Votes and tallies are shown. Stewards finalise this claim.
            </span>
          </Notice>
        )}
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-10">
          {claim.challenge && <ChallengeCard claim={claim} />}
          <EvidenceList claim={claim} />
          <Paths claim={claim} onOpened={() => setPathsOpened(true)} />
          <History claim={claim} />
        </div>
        <aside className="space-y-6">
          <div className="lg:sticky lg:top-20 space-y-6">
            <Tally claim={claim} />
            {canVote && <VotePanel claim={claim} unlocked={pathsOpened} />}
            {canChallenge && <ChallengePanel claim={claim} />}
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
          {lede && <p className="mt-1 text-[14px] text-ink-muted max-w-[56ch]">{lede}</p>}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function EvidenceList({ claim }: { claim: Claim }) {
  return (
    <Block title="Evidence" lede="Anyone can upload. Files are hashed and the hash is recorded, so nobody can swap a file later." action={<UploadEvidence claim={claim} />}>
      {claim.evidence.length === 0 ? (
        <Empty title="No evidence yet" body="A document, link, dated photo, video or signed wallet message." />
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {claim.evidence.map((e) => (
            <li key={e.id} className="grid gap-1 py-3 sm:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <p className="text-[15px] font-medium">
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-subtle mr-2">{e.kind}</span>
                  {e.title}
                </p>
                <p className="text-[13.5px] text-ink-muted">{e.note}</p>
                <p className="mt-1 font-mono text-[11px] text-ink-subtle break-all">
                  <Wallet address={e.uploader} /> · {fmtDate(e.createdAt, true)} · hash {e.hash.slice(0, 18)}…
                </p>
              </div>
              {e.url && (
                <a href={e.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] text-sera-text underline underline-offset-2">
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

function UploadEvidence({ claim }: { claim: Claim }) {
  const { user, signIn } = useAuth();
  const invalidate = useInvalidateAll();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<EvidenceKind>("document");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [url, setUrl] = useState("");
  const [redacted, setRedacted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!user)
    return (
      <Button variant="outline" size="sm" onClick={() => void signIn()}>
        Sign in to upload
      </Button>
    );
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.postEvidence({ causeId: claim.causeId, claim: claim.code, kind, title, note, url: url || undefined, redactionConfirmed: redacted });
      await invalidate();
      setOpen(false);
      setTitle("");
      setNote("");
      setUrl("");
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
      <DialogContent title="Upload evidence" description={`For ${claim.code}: ${CLAIM_INFO[claim.code].label}`}>
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <Notice tone="warn">Redact personal data first: IC numbers, home addresses, personal phone numbers and signatures. Files with unredacted personal data are rejected by moderation.</Notice>
          <Field label="Type" htmlFor="ev-kind">
            <Select id="ev-kind" value={kind} onChange={(e) => setKind(e.target.value as EvidenceKind)}>
              <option value="document">Document (PDF or image)</option>
              <option value="link">Link</option>
              <option value="photo">Photo with location and date</option>
              <option value="video">Video</option>
              <option value="signature">Signed wallet message</option>
            </Select>
          </Field>
          <Field label="Title" htmlFor="ev-title">
            <Input id="ev-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          {kind === "link" || kind === "video" ? (
            <Field label="URL" htmlFor="ev-url">
              <Input id="ev-url" type="url" required value={url} onChange={(e) => setUrl(e.target.value)} />
            </Field>
          ) : (
            <div>
              <p className="font-sans text-[14px] font-medium mb-1.5">File (10 MB, pdf, png, jpg, webp or mp4)</p>
              <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.mp4" className="block w-full text-[14px] text-ink-muted file:mr-3 file:rounded-full file:border file:border-rule file:bg-card file:px-4 file:py-2 file:text-[13px] file:font-medium file:text-ink" aria-label="File" />
            </div>
          )}
          <Field label="Note" htmlFor="ev-note" hint="What it shows, in one or two sentences.">
            <Textarea id="ev-note" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[72px]" />
          </Field>
          <Checkbox id="ev-redacted" checked={redacted} onChange={(e) => setRedacted(e.target.checked)} label="I have removed personal data from this file" />
          {err && <Notice tone="bad">{err}</Notice>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !redacted}>
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

function Paths({ claim, onOpened }: { claim: Claim; onOpened: () => void }) {
  const opened = async () => {
    onOpened();
    await api.markPathsOpened(claim.causeId, claim.code);
  };
  return (
    <Block title="Verification paths" lede={`How each helper checked this claim, in the fixed template. ${claim.independentChecks} independent ${claim.independentChecks === 1 ? "check agrees" : "checks agree"}. Open a path to unlock the vote.`} action={<AddPath claim={claim} />}>
      {claim.paths.length === 0 ? (
        <Empty title="No paths yet" body={`Be the first. Write down how you checked it and earn ${fmtGsera(GSERA.helper.pathAgrees)} when the outcome agrees.`} />
      ) : (
        <ul className="space-y-3">
          {claim.paths.map((p) => (
            <PathCard key={p.id} path={p} onToggle={opened} />
          ))}
        </ul>
      )}
    </Block>
  );
}

function PathCard({ path, onToggle }: { path: VerificationPath; onToggle: () => void }) {
  const r = RESULT[path.result];
  const rows: [string, React.ReactNode][] = [
    ["Source", path.source],
    ["Steps", <ol className="list-decimal pl-4 space-y-0.5">{path.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>],
    ["Exact search used", <code className="font-mono text-[13px] tnum">{path.exactSearch}</code>],
    ["What I found", path.found],
    ["Matches the profile?", path.matches],
    ["Screenshot", <span className="font-mono text-[12px] break-all">Uploaded, hash {path.screenshotHash.slice(0, 22)}…</span>],
    ["Checked on", `${fmtDate(path.checkedAt, true)} MYT`],
    ["Result", <Pill tone={r.tone} icon={r.icon}>{r.label}</Pill>],
    ["Caveats", path.caveats || "None"],
    ["Conflict of interest", path.conflict],
  ];
  return (
    <li>
      <details className="group rounded-xl border border-rule bg-card" onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) onToggle(); }}>
        <summary className="flex cursor-pointer flex-wrap items-center gap-3 p-4 list-none [&::-webkit-details-marker]:hidden focus-visible:outline-2 focus-visible:outline-ring rounded-xl">
          <Pill tone={r.tone} icon={r.icon}>
            {r.label}
          </Pill>
          <span className="text-[14.5px]">
            <Wallet address={path.author} /> <span className="text-ink-muted">· reputation {path.authorReputation}</span>
            {path.epoch > 0 && <span className="text-ink-muted"> · epoch {path.epoch}</span>}
            {path.outcomeAgreed && <span className="text-sera-text"> · agreed with the outcome</span>}
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

function AddPath({ claim }: { claim: Claim }) {
  const { user, signIn } = useAuth();
  const invalidate = useInvalidateAll();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ source: "", steps: "", exactSearch: "", found: "", matches: "", screenshotName: "", checkedAt: new Date().toISOString().slice(0, 16), result: "verified" as PathResult, caveats: "", conflict: "None. I have no relationship with this organisation." });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!user)
    return (
      <Button variant="outline" size="sm" onClick={() => void signIn()}>
        Sign in to add a check
      </Button>
    );
  const valid = f.source.trim() && f.steps.trim() && f.screenshotName.trim() && f.checkedAt;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) {
      setErr("A path needs a source, steps and a dated screenshot.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.postPath({ causeId: claim.causeId, claim: claim.code, ...f, steps: f.steps.split("\n"), checkedAt: new Date(f.checkedAt).toISOString() });
      await invalidate();
      setOpen(false);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not submit");
    } finally {
      setBusy(false);
    }
  };
  const field = (k: keyof typeof f) => ({ value: f[k] as string, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value }) });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Add your check</Button>
      </DialogTrigger>
      <DialogContent title="Add your check" description={`${claim.code}: ${CLAIM_INFO[claim.code].label}. One claim per path. Signed by your wallet, public and permanent.`} className="max-w-2xl">
        <form onSubmit={(e) => void submit(e)} className="space-y-3">
          <Field label="Source (name of the official tool)" htmlFor="p-source" hint={CLAIM_INFO[claim.code].whereToCheck}>
            <Input id="p-source" required {...field("source")} />
          </Field>
          <Field label="Steps, one per line" htmlFor="p-steps">
            <Textarea id="p-steps" required {...field("steps")} placeholder={"1. Opened the ROS public search.\n2. Searched the registration number.\n3. Opened the result."} />
          </Field>
          <Field label="Exact search used" htmlFor="p-search">
            <Input id="p-search" className="font-mono" {...field("exactSearch")} placeholder={claim.registration || "the search string"} />
          </Field>
          <Field label="What I found" htmlFor="p-found">
            <Textarea id="p-found" required {...field("found")} className="min-h-[72px]" />
          </Field>
          <Field label="Matches the profile?" htmlFor="p-matches">
            <Input id="p-matches" required {...field("matches")} placeholder="Yes: legal name and number match" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Screenshot (dated)" htmlFor="p-shot">
              <input id="p-shot" type="file" accept="image/*,.pdf" required className="block w-full text-[14px] text-ink-muted file:mr-3 file:rounded-full file:border file:border-rule file:bg-card file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-ink" onChange={(e) => setF({ ...f, screenshotName: e.target.files?.[0]?.name ?? "" })} />
            </Field>
            <Field label="Checked on" htmlFor="p-at">
              <Input id="p-at" type="datetime-local" required {...field("checkedAt")} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Result" htmlFor="p-result">
              <Select id="p-result" {...field("result")}>
                <option value="verified">Verified</option>
                <option value="not_verified">Not verified</option>
                <option value="could_not_check">Could not check</option>
              </Select>
            </Field>
            <Field label="Caveats" htmlFor="p-caveats">
              <Input id="p-caveats" {...field("caveats")} />
            </Field>
          </div>
          <Field label="Conflict of interest" htmlFor="p-conflict">
            <Input id="p-conflict" required {...field("conflict")} />
          </Field>
          {err && <Notice tone="bad">{err}</Notice>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
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

function Tally({ claim }: { claim: Claim }) {
  const t = claim.tally;
  const quorumPct = Math.min(100, Math.round((t.total / VOTING.quorumWeight) * 100));
  const bars: [string, number, string][] = [
    ["Verified", t.verified, "bg-sera-deep dark:bg-sera"],
    ["Not verified", t.not, "bg-[var(--pill-red-fg)]"],
    ["Needs more evidence", t.more, "bg-[var(--pill-amber-fg)]"],
  ];
  return (
    <div className="rounded-2xl border border-rule bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-[18px] font-semibold">Tally</h2>
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-subtle">Advisory</span>
      </div>
      <p className="mt-1 text-[13px] text-ink-muted">{fmtInt(claim.votes.length)} votes, weight {t.total}. Stewards finalise this claim.</p>
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
            <dd className="font-mono tnum">{t.quorumMet ? "met" : `${t.total} of ${VOTING.quorumWeight}`}</dd>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-ink/10" aria-hidden>
            <div className="h-1.5 rounded-full bg-ink/60" style={{ width: `${quorumPct}%` }} />
          </div>
        </div>
        <div className="flex justify-between">
          <dt>Threshold ({VOTING.thresholdPct}% Verified)</dt>
          <dd className="font-mono tnum">{t.verifiedPct}%</dd>
        </div>
        <div className="flex justify-between">
          <dt>Would pass</dt>
          <dd className={cn("font-mono", t.passed ? "text-sera-text" : "text-ink-muted")}>{t.passed ? "yes" : "not yet"}</dd>
        </div>
      </dl>
      {claim.votes.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[13px] font-medium">Votes and reasons</summary>
          <ul className="mt-2 space-y-2 text-[13px]">
            {claim.votes.map((v) => (
              <li key={v.id}>
                <span className="font-mono text-[11px] text-ink-subtle">w{v.weight}</span> <Wallet address={v.voter} /> <span className="font-medium">{v.choice.replace("_", " ")}</span>
                <p className="text-ink-muted">{v.reason}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function VotePanel({ claim, unlocked }: { claim: Claim; unlocked: boolean }) {
  const { user, signIn } = useAuth();
  const me = useMe();
  const invalidate = useInvalidateAll();
  const [choice, setChoice] = useState<VoteChoice>("verified");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const already = !!user && claim.votes.some((v) => v.voter === user.wallet);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.postVote({ causeId: claim.causeId, claim: claim.code, choice, reason });
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
          <p className="text-[13.5px] text-ink-muted">Voting needs a wallet that has passed screening and has one gift or one accepted contribution.</p>
          <Button size="sm" className="mt-3" onClick={() => void signIn()}>
            Sign in
          </Button>
        </div>
      ) : already || done ? (
        <Notice tone="good" className="mt-3">You have voted on this claim. {fmtGsera(GSERA.helper.voteAgrees)} when the final outcome agrees.</Notice>
      ) : !unlocked ? (
        <div className="mt-2 rounded-xl border border-dashed border-rule bg-paper-warm p-4 text-[13.5px] text-ink-muted">
          <p className="inline-flex items-center gap-2 font-medium text-ink">
            <Lock className="h-4 w-4" aria-hidden /> Locked
          </p>
          <p className="mt-1">Open at least one verification path above. The vote unlocks once you have read how the claim was checked.</p>
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="mt-3 space-y-3">
          <p className="text-[13px] text-ink-muted">
            Your weight: <span className="font-mono tnum">{me.data?.voteWeight ?? 1}</span> (reputation {me.data?.reputation ?? 0}).
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
            <Input id="vote-reason" required maxLength={140} value={reason} onChange={(e) => setReason(e.target.value)} />
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

function ChallengeCard({ claim }: { claim: Claim }) {
  const ch = claim.challenge!;
  return (
    <Notice tone="bad">
      <div className="flex gap-3">
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <div>
          <p className="font-display text-[16px] font-semibold">Challenge open. {fmtGsera(ch.stake)} staked by <Wallet address={ch.challenger} />.</p>
          <p className="mt-1 text-[14px]">{ch.summary}</p>
          <p className="mt-1 text-[13px] opacity-90">Counter-evidence: {ch.counterEvidence}</p>
          <p className="mt-1 font-mono text-[11.5px] opacity-80">Voting reopened, {timeLeft(ch.votingEnd)}. If upheld, the challenger gets the stake back plus {fmtGsera(GSERA.helper.challengeWin)}. If not, the stake is burned.</p>
        </div>
      </div>
    </Notice>
  );
}

function ChallengePanel({ claim }: { claim: Claim }) {
  const { user, signIn } = useAuth();
  const me = useMe();
  const invalidate = useInvalidateAll();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [counter, setCounter] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const spendable = me.data?.gsera.spendable ?? 0;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.postChallenge({ causeId: claim.causeId, claim: claim.code, summary, counterEvidence: counter });
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
        Think this is wrong? Stake {fmtGsera(CHALLENGE_STAKE)}, upload counter-evidence and your own path. Voting reopens for {VOTING.periodDays} days.
        {claim.state === "challenge_window" && claim.challengeWindowEnd ? ` Window: ${timeLeft(claim.challengeWindowEnd)}.` : ""}
      </p>
      {!user ? (
        <Button size="sm" variant="outline" className="mt-3" onClick={() => void signIn()}>
          Sign in to challenge
        </Button>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="mt-3">
              Challenge this claim
            </Button>
          </DialogTrigger>
          <DialogContent title="Challenge this claim" description={`Stake ${fmtGsera(CHALLENGE_STAKE)}. Returned plus ${fmtGsera(GSERA.helper.challengeWin)} if upheld, burned if not.`}>
            <form onSubmit={(e) => void submit(e)} className="space-y-3">
              <p className="font-mono text-[12.5px] tnum text-ink-muted">Your spendable gSera: {fmtInt(spendable)}</p>
              {spendable < CHALLENGE_STAKE && <Notice tone="warn">You need {fmtGsera(CHALLENGE_STAKE)} spendable to stake.</Notice>}
              <Field label="What is wrong, in one or two sentences" htmlFor="ch-summary">
                <Textarea id="ch-summary" required value={summary} onChange={(e) => setSummary(e.target.value)} className="min-h-[72px]" />
              </Field>
              <Field label="Counter-evidence and your path" htmlFor="ch-counter" hint="Describe the file you are uploading and how you checked. The full path template follows after the stake.">
                <Textarea id="ch-counter" required value={counter} onChange={(e) => setCounter(e.target.value)} className="min-h-[72px]" />
              </Field>
              <input type="file" accept=".pdf,image/*" className="block w-full text-[14px] text-ink-muted file:mr-3 file:rounded-full file:border file:border-rule file:bg-card file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-ink" aria-label="Counter-evidence file" />
              {err && <Notice tone="bad">{err}</Notice>}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy || spendable < CHALLENGE_STAKE}>
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

function History({ claim }: { claim: Claim }) {
  return (
    <Block title="History of this claim">
      <ol className="divide-y divide-rule border-y border-rule">
        {claim.history.map((h) => (
          <li key={h.id} className="grid gap-0.5 py-2.5 sm:grid-cols-[150px_1fr]">
            <time dateTime={h.at} className="font-mono text-[12px] text-ink-subtle tnum">
              {fmtDate(h.at, true)}
            </time>
            <span className="text-[14px]">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-subtle mr-2">{h.type.replace("_", " ")}</span>
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
    </Block>
  );
}
