import { ArrowLeft, ArrowRight, Check, FileText, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { Notice } from "@/components/Empty";
import { Eyebrow } from "@/components/Eyebrow";
import { ShareButtons } from "@/components/ShareButtons";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { useCopy } from "@/hooks/useCopy";
import { useSeo } from "@/hooks/useSeo";
import { ONCHAIN_ONLY, prepareCause, submitCause } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { CATEGORIES, CLAIM_INFO, COMMUNITY_SITE, STATE_NAMES, XP } from "@/lib/constants";
import { fmtXp } from "@/lib/format";
import { useInvalidateAll } from "@/lib/queries";
import { causeHref } from "@/lib/rules";
import type { CauseDetail, NewCauseDocument, NewCauseInput, OrgKind, PreparedCause } from "@/lib/types";
import { cn } from "@/lib/utils";

const EMPTY: NewCauseInput = {
  name: "",
  category: "",
  town: "",
  state: "",
  summary: "",
  link: "",
  registration: "",
  payout: "",
  photoPermission: false,
  relationship: "supports",
  homepage: true,
  orgKind: "registered",
  documents: [],
  redactionConfirmed: false,
};

const ORG_KINDS: { id: OrgKind; label: string; body: string; docs: { claim: NewCauseDocument["claim"]; label: string; required: boolean }[] }[] = [
  {
    id: "licensed",
    label: "Licensed non-profit",
    body: "A children's home, elderly care centre or other service the law licenses. Expected: registration certificate, the JKM care licence, and the LHDN approval if you have one.",
    docs: [
      { claim: "C1", label: "Registration certificate (ROS, SSM or BHEUU)", required: true },
      { claim: "C6", label: "Care licence (JKM, Care Centres Act 1993)", required: true },
      { claim: "C5", label: "LHDN section 44(6) approval letter", required: false },
    ],
  },
  {
    id: "registered",
    label: "Registered non-profit",
    body: "A society, foundation, trust or company limited by guarantee. Expected: registration certificate, and the LHDN approval if you have one.",
    docs: [
      { claim: "C1", label: "Registration certificate (ROS, SSM or BHEUU)", required: true },
      { claim: "C5", label: "LHDN section 44(6) approval letter", required: false },
    ],
  },
  {
    id: "informal",
    label: "Informal group",
    body: "A hatchery, a feeding round, a volunteer crew without a registered body. No documents expected. Helpers will look for dated photos and news instead, and the 'registered' checks stay open until there is a body to check.",
    docs: [],
  },
];

type Step = "details" | "documents" | "review" | "done";

export function AddPage() {
  useSeo("Add a cause", "List a cause on Care Share Donate. Anyone with a wallet can add one.");
  const { user, signIn, busy: signingIn } = useAuth();
  const invalidate = useInvalidateAll();
  const [step, setStep] = useState<Step>("details");
  const [form, setForm] = useState<NewCauseInput>(EMPTY);
  const [prepared, setPrepared] = useState<PreparedCause | null>(null);
  const [created, setCreated] = useState<CauseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof NewCauseInput>(k: K, v: NewCauseInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const validLink = /^https?:\/\/\S+\.\S+/i.test(form.link.trim());
  const validDetails = form.name.trim().length > 2 && form.category && form.state && form.summary.trim().length > 10 && form.summary.length <= 280 && validLink && form.photoPermission;

  const toReview = async () => {
    setError(null);
    if (!user) {
      await signIn();
    }
    setBusy(true);
    try {
      setPrepared(await prepareCause(form));
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check for duplicates");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const c = await submitCause(form);
      await invalidate();
      setCreated(c);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not list the cause");
    } finally {
      setBusy(false);
    }
  };

  if (step === "done" && created) return <Done cause={created} />;

  return (
    <div className="container max-w-3xl py-8 md:py-12">
      <Eyebrow>Add a cause</Eyebrow>
      <h1 className="mt-2 font-display text-[32px] font-semibold leading-[1.05] tracking-[-0.025em] sm:text-[40px]">List a cause you know.</h1>
      <p className="mt-3 text-[16px] text-ink-muted max-w-[58ch]">Anyone with a wallet can add one. There is no deposit. Listing it earns {fmtXp(XP.care_cause_listed.amount)} on {COMMUNITY_SITE}, and {fmtXp(XP.care_cause_verified.amount)} more if it later reaches Verified.</p>

      <ol className="mt-8 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] uppercase tracking-[0.12em]" aria-label="Steps">
        {(["details", "documents", "review"] as const).map((s, i) => (
          <li key={s} className={cn(step === s ? "text-ink" : "text-ink-subtle")} aria-current={step === s ? "step" : undefined}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {step === "details" && (
        <form
          className="mt-6 space-y-5 rounded-2xl border border-rule bg-card p-5 sm:p-7"
          onSubmit={(e) => {
            e.preventDefault();
            if (validDetails) setStep("documents");
          }}
        >
          <Field label="Cause name" htmlFor="name">
            <Input id="name" required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Kasih Turtle Conservation Project" />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Category" htmlFor="category">
              <Select id="category" required value={form.category} onChange={(e) => set("category", e.target.value)}>
                <option value="">Choose</option>
                {CATEGORIES.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="State" htmlFor="state">
              <Select id="state" required value={form.state} onChange={(e) => set("state", e.target.value)}>
                <option value="">Choose</option>
                {STATE_NAMES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Town" htmlFor="town" hint="Optional. Helps people find a cause near them.">
            <Input id="town" value={form.town} onChange={(e) => set("town", e.target.value)} placeholder="Cherating" />
          </Field>
          <Field label="What the money pays for" htmlFor="summary" hint="Be specific. 'RM15 buys one hatchery basket' beats 'help the ocean'.">
            <Textarea id="summary" required maxLength={280} value={form.summary} onChange={(e) => set("summary", e.target.value)} aria-describedby="summary-hint summary-count" />
            <p id="summary-count" className="mt-1 text-right font-mono text-[11px] text-ink-subtle tnum">{form.summary.length}/280</p>
          </Field>
          <Field label="Official website or social link" htmlFor="link" hint="Needed for the duplicate check and as the first source on the profile.">
            <Input id="link" type="url" required value={form.link} onChange={(e) => set("link", e.target.value)} placeholder="https://www.instagram.com/kasih.turtle/" />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Registration number, if known" htmlFor="registration" hint="PPM, SSM or PPAB number. Used for the duplicate check.">
              <Input id="registration" value={form.registration} onChange={(e) => set("registration", e.target.value)} placeholder="PPM-001-11-10062011" className="font-mono" />
            </Field>
            <Field label="Payout wallet (optional)" htmlFor="payout" hint="Leave blank if you do not run the cause. The charity sets it when it claims the listing.">
              <Input id="payout" value={form.payout} onChange={(e) => set("payout", e.target.value)} placeholder="0x…" className="font-mono" />
            </Field>
          </div>
          <Field label="Your relationship to the cause" htmlFor="relationship">
            <Select id="relationship" value={form.relationship} onChange={(e) => set("relationship", e.target.value as NewCauseInput["relationship"])}>
              <option value="runs">I run it</option>
              <option value="volunteers">I volunteer</option>
              <option value="supports">I support it</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <div>
            <p className="font-sans text-[14px] font-medium mb-1.5">Photos</p>
            <input type="file" accept="image/*" multiple className="block w-full text-[14px] text-ink-muted file:mr-3 file:rounded-full file:border file:border-rule file:bg-card file:px-4 file:py-2 file:text-[13px] file:font-medium file:text-ink" aria-label="Photos" />
            <Checkbox id="photoPermission" className="mt-3" checked={form.photoPermission} onChange={(e) => set("photoPermission", e.target.checked)} label="I took these or have permission to use them" required />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-rule bg-paper-warm p-4">
            <div>
              <p className="font-medium text-[15px]">Show on homepage</p>
              <p className="text-[13.5px] text-ink-muted">You decide. The homepage is a feed ordered by activity, and every card shows the verification state.</p>
            </div>
            <Switch id="homepage" label="Show on homepage" checked={form.homepage} onCheckedChange={(v) => set("homepage", v)} />
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="lg" disabled={!validDetails}>
              Documents <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </form>
      )}

      {step === "documents" && (
        <div className="mt-6 rounded-2xl border border-rule bg-card p-5 sm:p-7">
          <fieldset>
            <legend className="font-display text-[20px] font-semibold tracking-tight">What kind of organisation is it?</legend>
            <p className="mt-1 text-[14.5px] text-ink-muted">This sets which documents helpers expect to see. You can skip documents; helpers can upload them later.</p>
            <div className="mt-4 grid gap-3">
              {ORG_KINDS.map((k) => (
                <label key={k.id} className={cn("flex cursor-pointer gap-3 rounded-xl border p-4", form.orgKind === k.id ? "border-ink bg-paper-warm" : "border-rule")}>
                  <input type="radio" name="orgKind" value={k.id} checked={form.orgKind === k.id} onChange={() => set("orgKind", k.id)} className="mt-1 accent-[#1B7A3F]" />
                  <span>
                    <span className="block font-medium text-[15.5px]">{k.label}</span>
                    <span className="block text-[13.5px] text-ink-muted mt-0.5">{k.body}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {(() => {
            const kind = ORG_KINDS.find((k) => k.id === form.orgKind)!;
            if (kind.docs.length === 0) return null;
            return (
              <div className="mt-6">
                <h3 className="font-display text-[17px] font-semibold">Documents</h3>
                <p className="mt-1 text-[13.5px] text-ink-muted">PDF or image. Each one is stored as evidence against the matching claim, with its hash on the record.</p>
                <Notice tone="warn" className="mt-3">
                  <div className="flex gap-2">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>Redact personal data before you upload: IC numbers, home addresses, personal phone numbers and signatures. Files with unredacted personal data are rejected by moderation. Organisation details stay.</span>
                  </div>
                </Notice>
                <ul className="mt-4 space-y-3">
                  {kind.docs.map((d) => {
                    const existing = form.documents.find((x) => x.claim === d.claim);
                    return (
                      <li key={d.claim} className="rounded-xl border border-rule p-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <label htmlFor={`doc-${d.claim}`} className="font-medium text-[15px]">
                            <span className="font-mono text-[11px] text-ink-subtle mr-2">{d.claim}</span>
                            {d.label}
                            {!d.required && <span className="ml-2 text-[12px] text-ink-subtle">optional</span>}
                          </label>
                          <span className="text-[12.5px] text-ink-muted">Evidence for: {CLAIM_INFO[d.claim].label}</span>
                        </div>
                        <input
                          id={`doc-${d.claim}`}
                          type="file"
                          accept="application/pdf,image/*"
                          className="mt-2 block w-full text-[14px] text-ink-muted file:mr-3 file:rounded-full file:border file:border-rule file:bg-card file:px-4 file:py-2 file:text-[13px] file:font-medium file:text-ink"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            const rest = form.documents.filter((x) => x.claim !== d.claim);
                            set("documents", f ? [...rest, { claim: d.claim, file: f, fileName: f.name, title: d.label }] : rest);
                          }}
                        />
                        {existing && (
                          <p className="mt-1.5 inline-flex items-center gap-1.5 font-mono text-[12px] text-sera-text">
                            <FileText className="h-3.5 w-3.5" aria-hidden /> {existing.fileName}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <Checkbox id="redaction" className="mt-4" checked={form.redactionConfirmed} onChange={(e) => set("redactionConfirmed", e.target.checked)} label="I have removed personal data from these files" />
              </div>
            );
          })()}

          {error && <Notice tone="bad" className="mt-4">{error}</Notice>}
          <div className="mt-6 flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep("details")}>
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back
            </Button>
            <Button size="lg" onClick={() => void toReview()} disabled={busy || (form.documents.length > 0 && !form.redactionConfirmed)}>
              {busy ? "Checking for duplicates" : "Check and review"}
            </Button>
          </div>
        </div>
      )}

      {step === "review" && prepared && (
        <div className="mt-6 rounded-2xl border border-rule bg-card p-5 sm:p-7">
          {prepared.duplicates.length > 0 && (
            <div className="mb-6">
              <h2 className="font-display text-[20px] font-semibold tracking-tight">Is it one of these?</h2>
              <p className="mt-1 text-[14.5px] text-ink-muted">We found causes with a similar name or the same registration number. Give to the existing one rather than listing a copy.</p>
              <ul className="mt-3 divide-y divide-rule border-y border-rule">
                {prepared.duplicates.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div>
                      <Link href={causeHref(d.id, d.slug)} className="font-medium text-[15px] hover:text-sera-text">
                        {d.name}
                      </Link>
                      <p className="font-mono text-[11.5px] text-ink-muted">{d.reason}</p>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link href={causeHref(d.id, d.slug)}>Open</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <h2 className="font-display text-[20px] font-semibold tracking-tight">Review</h2>
          <dl className="mt-3 divide-y divide-rule border-y border-rule text-[14.5px]">
            {[
              ["Name", form.name],
              ["Category", CATEGORIES.find((c) => c.slug === form.category)?.label ?? ""],
              ["Place", [form.town, form.state].filter(Boolean).join(", ")],
              ["Pays for", form.summary],
              ["Link", form.link || "None"],
              ["Registration", form.registration || "Not given"],
              ["Organisation", ORG_KINDS.find((k) => k.id === form.orgKind)?.label ?? ""],
              ["Documents", form.documents.length ? form.documents.map((d) => `${d.claim}: ${d.fileName}`).join("; ") : "None"],
              ["Homepage", form.homepage ? "Shown" : "Not shown"],
            ].map(([k, v]) => (
              <div key={k} className="grid gap-0.5 py-2.5 sm:grid-cols-[150px_1fr]">
                <dt className="eyebrow">{k}</dt>
                <dd className="break-words">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-[13.5px] text-ink-muted break-words">
            Listing writes the profile hash to the registry and creates the cause's own deposit address. The profile is stored at{" "}
            <a href={prepared.uri} target="_blank" rel="noopener noreferrer" className="text-sera-text underline underline-offset-2">
              {prepared.uri}
            </a>{" "}
            (hash <span className="font-mono">{prepared.hash.slice(0, 16)}…</span>).
          </p>
          {ONCHAIN_ONLY && (
            <Notice tone="info" className="mt-4">
              The profile is prepared. Listing itself is a registry transaction (`listCause`) sent from your wallet with this URI; it appears on the site once the indexer sees it.
            </Notice>
          )}
          {error && <Notice tone="bad" className="mt-4">{error}</Notice>}
          <div className="mt-6 flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep("documents")}>
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back
            </Button>
            {ONCHAIN_ONLY ? (
              <Button size="lg" disabled>
                List this cause (from your wallet)
              </Button>
            ) : user ? (
              <Button size="lg" onClick={() => void submit()} disabled={busy}>
                {busy ? "Listing" : "List this cause"}
              </Button>
            ) : (
              <Button size="lg" onClick={() => void signIn()} disabled={signingIn}>
                {signingIn ? "Signing in" : "Sign in to list"}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Done({ cause }: { cause: CauseDetail }) {
  const invite = `${cause.shareUrl}?claim=invite`;
  const { copied, copy } = useCopy();
  return (
    <div className="container max-w-3xl py-10 md:py-14">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--pill-green-bg)] text-[var(--pill-green-fg)]">
        <Check className="h-5 w-5" aria-hidden />
      </div>
      <h1 className="mt-4 font-display text-[32px] font-semibold leading-[1.05] tracking-[-0.025em] sm:text-[40px]">Your cause is listed.</h1>
      <p className="mt-2 text-[16px] text-ink-muted">
        <Link href={causeHref(cause.id, cause.slug)} className="text-sera-text underline underline-offset-2">
          {cause.name}
        </Link>{" "}
        has its own address and a page. Here is what happens next.
      </p>
      <ol className="mt-6 space-y-3 text-[15.5px]">
        {[
          `It shows under New${cause.showOnHomepage ? " and on the homepage feed" : ""}, with a New pill until someone checks it.`,
          `Anyone can upload evidence and write a verification path. Helpers earn XP on ${COMMUNITY_SITE} when the outcome agrees with them.`,
          "Gifts go straight to the cause's address from day one. If you know the charity, invite them to claim the listing, set the payout wallet and post updates.",
        ].map((t, i) => (
          <li key={i} className="flex gap-3">
            <span className="font-mono text-[12px] text-ink-subtle mt-1">{i + 1}</span>
            <span>{t}</span>
          </li>
        ))}
      </ol>
      <div className="mt-8 rounded-2xl border border-rule bg-paper-warm p-5">
        <p className="font-display text-[17px] font-semibold">Invite the charity to claim the listing</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <code className="flex-1 min-w-0 truncate rounded-md border border-rule bg-card px-3 py-2 font-mono text-[12.5px]">{invite}</code>
          <Button variant="outline" onClick={() => void copy(invite)}>
            {copied ? "Copied" : "Copy invite"}
          </Button>
        </div>
      </div>
      <div className="mt-6">
        <Eyebrow className="mb-2">Share it</Eyebrow>
        <ShareButtons causeId={cause.id} slug={cause.slug} name={cause.name} />
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild>
          <Link href={causeHref(cause.id, cause.slug)}>Open the cause page</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">Go to your dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
