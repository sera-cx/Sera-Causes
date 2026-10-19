import { ArrowRightLeft, Check, ExternalLink, Image as ImageIcon, Link2, Share2, Trash2, TriangleAlert, Video } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { Empty, Notice, Spinner } from "@/components/Empty";
import { Eyebrow } from "@/components/Eyebrow";
import { GfCard, GreenField } from "@/components/GreenField";
import { MediaGallery } from "@/components/MediaGallery";
import { RecordList } from "@/components/RecordList";
import { ShareButtons } from "@/components/ShareButtons";
import { StatusPill } from "@/components/StatusPill";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Wallet } from "@/components/Wallet";
import { useCopy } from "@/hooks/useCopy";
import { useSeo } from "@/hooks/useSeo";
import * as api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { STABLECOINS } from "@/lib/constants";
import { fmtDate, fmtInt, fmtUsd, timeAgo } from "@/lib/format";
import { useDashboard, useInvalidateAll, useRecord } from "@/lib/queries";
import { causeHref } from "@/lib/rules";
import type { Cause, CauseUpdate, ConvertQuote, DashboardCause } from "@/lib/types";
import { cn } from "@/lib/utils";

export function DashboardPage() {
  useSeo("Creator dashboard");
  const { user, signIn, busy, ready } = useAuth();
  const dash = useDashboard();

  if (!ready) return <div className="container"><Spinner /></div>;
  if (!user) {
    return (
      <div className="container max-w-xl py-16 text-center">
        <Eyebrow>Dashboard</Eyebrow>
        <h1 className="mt-2 font-display text-[32px] font-semibold tracking-tight">Sign in to manage your causes.</h1>
        <p className="mt-2 text-ink-muted">Your causes, gifts received, treasury, sharing tools, updates and help requests.</p>
        <Button size="lg" className="mt-6" onClick={() => void signIn()} disabled={busy}>
          {busy ? "Signing in" : "Sign in"}
        </Button>
      </div>
    );
  }
  if (dash.isLoading || !dash.data) return <div className="container"><Spinner label="Loading your causes" /></div>;

  const d = dash.data;
  const totalGiven = d.causes.reduce((s, c) => s + c.cause.givenUsd, 0);
  const totalTreasury = d.causes.reduce((s, c) => s + c.treasuryUsd, 0);
  const totalGivers = d.causes.reduce((s, c) => s + c.cause.giversCount, 0);

  return (
    <div>
      <div className="container pt-8 md:pt-12">
        <Eyebrow>Creator dashboard</Eyebrow>
        <h1 className="mt-2 font-display text-[32px] font-semibold leading-[1.05] tracking-[-0.025em] sm:text-[40px]">Your causes.</h1>
        <p className="mt-2 text-[15.5px] text-ink-muted">
          Signed in as <Wallet address={user.wallet} you={false} />. {d.causes.length === 1 ? "One cause" : `${d.causes.length} causes`}.
        </p>
      </div>
      <GreenField className="mt-8" kicker="Totals" footer={false}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <GfCard label="Given to your causes" ticker="All time" figure={fmtUsd(totalGiven)} meta={[{ label: "givers", value: fmtInt(totalGivers) }, { label: "causes", value: fmtInt(d.causes.length) }]} />
          <GfCard label="In treasuries now" ticker="Stablecoins" figure={fmtUsd(totalTreasury)} meta={[{ label: "withdrawable", value: "100%" }]} tab="#00E676" />
          <GfCard label="On the homepage" ticker="Creator switch" figure={fmtInt(d.causes.filter((c) => c.cause.homepage).length)} meta={[{ label: "of", value: fmtInt(d.causes.length) }]} tab="#59E39A" />
        </div>
      </GreenField>
      <div className="container space-y-14 py-10 md:py-14">
        {d.causes.length === 0 && (
          <Empty title="You have not listed a cause yet" body="Add one and it appears here with its treasury, sharing tools and updates.">
            <Button asChild>
              <Link href="/add">Add a cause</Link>
            </Button>
          </Empty>
        )}
        {d.causes.map((dc) => (
          <CausePanel key={dc.cause.id} dc={dc} />
        ))}
      </div>
    </div>
  );
}

function CausePanel({ dc }: { dc: DashboardCause }) {
  const c = dc.cause;
  const invalidate = useInvalidateAll();
  const [homepageBusy, setHomepageBusy] = useState(false);
  const toggleHomepage = async (v: boolean) => {
    setHomepageBusy(true);
    try {
      await api.setHomepageFlag(c.id, v);
      await invalidate();
    } finally {
      setHomepageBusy(false);
    }
  };
  return (
    <section className="rounded-2xl border border-rule bg-card" aria-labelledby={`cause-${c.id}`}>
      <header className="flex flex-col gap-4 border-b border-rule p-5 sm:flex-row sm:items-center sm:p-6">
        <img src={c.profile.image?.src} alt="" className="h-20 w-28 shrink-0 rounded-xl object-cover" />
        <div className="min-w-0 flex-1">
          <h2 id={`cause-${c.id}`} className="font-display text-[24px] font-semibold leading-tight tracking-tight">
            <Link href={causeHref(c.id, c.slug)} className="hover:text-sera-text">
              {c.name}
            </Link>
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <StatusPill stage={c.stage} checksDone={c.checksDone} checksTotal={c.checksTotal} />
            <span className="font-mono text-[12px] text-ink-muted tnum">{fmtUsd(c.givenUsd)} from {fmtInt(c.giversCount)} givers</span>
            <span className="font-mono text-[12px] text-ink-muted tnum">{fmtUsd(dc.treasuryUsd)} in treasury</span>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-rule bg-paper-warm px-4 py-3">
          <div>
            <p className="text-[14px] font-medium">Show on homepage</p>
            <p className="text-[12px] text-ink-muted">Signed by your wallet, off-chain</p>
          </div>
          <Switch label={`Show ${c.name} on homepage`} checked={c.homepage} onCheckedChange={(v) => void toggleHomepage(v)} disabled={homepageBusy} />
        </div>
      </header>

      <div className="grid gap-8 p-5 sm:p-6 lg:grid-cols-2">
        <Treasury cause={c} />
        <div className="space-y-8">
          <GiftsReceived dc={dc} />
          <ShareTools dc={dc} />
        </div>
        <PostUpdate cause={c} />
        <Media cause={c} />
        <Socials cause={c} />
        <HelpRequests cause={c} />
        <InviteCharity dc={dc} />
        <Payout cause={c} />
      </div>
      <PanelRecord cause={c} />
    </section>
  );
}

function Panel({ title, lede, children, icon: Icon }: { title: string; lede?: string; children: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div>
      <h3 className="flex items-center gap-2 font-display text-[18px] font-semibold tracking-tight">
        {Icon && <Icon className="h-4.5 w-4.5 text-sera-text" aria-hidden />}
        {title}
      </h3>
      {lede && <p className="mt-1 text-[13.5px] text-ink-muted">{lede}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Treasury({ cause }: { cause: Cause }) {
  const t = cause.treasury;
  const invalidate = useInvalidateAll();
  const [policy, setPolicy] = useState(t.policy);
  const [autoToken, setAutoToken] = useState(t.autoToken);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { copied, copy } = useCopy();

  const savePolicy = async () => {
    setSaving(true);
    setErr(null);
    try {
      await api.setTreasuryPolicy(cause.id, policy, autoToken);
      await invalidate();
      setMsg(policy === "auto" ? `Everything that arrives is converted to ${autoToken} through Sera.cx.` : "Holding what arrives. Convert when you choose.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="Treasury" lede="Balances at the cause's own address. Gifts land here directly; nothing is held back." icon={ArrowRightLeft}>
      <div className="rounded-xl border border-rule bg-paper-warm p-3">
        <Eyebrow>Cause address</Eyebrow>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <code className="break-all font-mono text-[12.5px] tnum">{t.depositAddress}</code>
          <Button size="sm" variant="outline" onClick={() => void copy(t.depositAddress)}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
      <table className="mt-3 w-full text-[14px]">
        <thead>
          <tr className="text-left">
            <th className="eyebrow pb-1.5 font-medium">Token</th>
            <th className="eyebrow pb-1.5 font-medium text-right">Balance</th>
            <th className="eyebrow pb-1.5 font-medium text-right">US$</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule border-y border-rule">
          {t.balances.length === 0 && (
            <tr>
              <td colSpan={3} className="py-2 text-ink-muted">Nothing received yet.</td>
            </tr>
          )}
          {t.balances.map((b) => (
            <tr key={b.token}>
              <td className="py-2 font-mono">{b.token}</td>
              <td className="py-2 text-right font-mono tnum">{b.amount.toLocaleString("en-GB")}</td>
              <td className="py-2 text-right font-mono tnum text-ink-muted">{fmtUsd(b.usd, { cents: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <fieldset className="mt-5">
        <legend className="text-[14px] font-medium">Currency</legend>
        <div className="mt-2 space-y-2">
          <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3", policy === "auto" ? "border-ink bg-paper-warm" : "border-rule")}>
            <input type="radio" name={`policy-${cause.id}`} checked={policy === "auto"} onChange={() => setPolicy("auto")} className="mt-1 accent-[#1B7A3F]" />
            <span className="flex-1">
              <span className="block text-[14.5px] font-medium">Keep everything in one currency</span>
              <span className="block text-[13px] text-ink-muted">Each arrival is converted through Sera.cx straight away.</span>
              {policy === "auto" && (
                <Select aria-label="Stablecoin to keep" value={autoToken} onChange={(e) => setAutoToken(e.target.value)} className="mt-2 h-9 max-w-[200px] text-[13.5px]">
                  {STABLECOINS.map((s) => (
                    <option key={s.symbol} value={s.symbol}>
                      {s.symbol}, {s.name}
                    </option>
                  ))}
                </Select>
              )}
            </span>
          </label>
          <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3", policy === "hold" ? "border-ink bg-paper-warm" : "border-rule")}>
            <input type="radio" name={`policy-${cause.id}`} checked={policy === "hold"} onChange={() => setPolicy("hold")} className="mt-1 accent-[#1B7A3F]" />
            <span>
              <span className="block text-[14.5px] font-medium">Hold what arrives and convert when I choose</span>
              <span className="block text-[13px] text-ink-muted">Balances stay in the token they came in.</span>
            </span>
          </label>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <Button size="sm" onClick={() => void savePolicy()} disabled={saving || (policy === t.policy && autoToken === t.autoToken)}>
            {saving ? "Saving" : "Save setting"}
          </Button>
          {msg && <span className="text-[13px] text-ink-muted" role="status">{msg}</span>}
        </div>
        {err && <Notice tone="bad" className="mt-2">{err}</Notice>}
      </fieldset>

      <Convert cause={cause} />
      <Withdraw cause={cause} />

      {(t.conversions.length > 0 || t.withdrawals.length > 0) && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[13.5px] font-medium">Conversions and withdrawals</summary>
          <ul className="mt-2 space-y-1.5 text-[13px] text-ink-muted">
            {t.conversions.map((cv) => (
              <li key={`c${cv.id}`} className="font-mono tnum">
                {fmtDate(cv.at)}: {cv.amountIn.toLocaleString("en-GB")} {cv.fromToken} to {cv.amountOut.toLocaleString("en-GB")} {cv.toToken} ({cv.reason})
              </li>
            ))}
            {t.withdrawals.map((wd) => (
              <li key={`w${wd.id}`} className="font-mono tnum">
                {fmtDate(wd.at)}: withdrew {wd.amount.toLocaleString("en-GB")} {wd.token} to {wd.to.slice(0, 6)}…{wd.to.slice(-4)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  );
}

function Convert({ cause }: { cause: Cause }) {
  const invalidate = useInvalidateAll();
  const balances = cause.treasury.balances.filter((b) => b.amount > 0);
  const [from, setFrom] = useState(balances[0]?.token ?? "USDT");
  const [to, setTo] = useState(STABLECOINS.find((s) => s.symbol !== (balances[0]?.token ?? "USDT"))?.symbol ?? "MYRT");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<ConvertQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const getQuote = async () => {
    setErr(null);
    setDone(null);
    setBusy(true);
    try {
      setQuote(await api.quoteConvert(cause.id, from, to, Number.parseFloat(amount) || 0));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not quote");
      setQuote(null);
    } finally {
      setBusy(false);
    }
  };
  const run = async () => {
    if (!quote) return;
    setBusy(true);
    setErr(null);
    try {
      await api.convert(cause.id, quote);
      await invalidate();
      setDone(`Converted ${quote.amountIn} ${quote.fromToken} to ${quote.amountOut} ${quote.toToken}. It is on the record.`);
      setQuote(null);
      setAmount("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Conversion failed");
    } finally {
      setBusy(false);
    }
  };

  if (balances.length === 0) return null;
  return (
    <div className="mt-5 rounded-xl border border-rule p-4">
      <p className="text-[14.5px] font-medium">Convert now</p>
      <p className="text-[13px] text-ink-muted">A Sera.cx quote is shown before anything moves.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="From" htmlFor={`from-${cause.id}`}>
          <Select id={`from-${cause.id}`} value={from} onChange={(e) => { setFrom(e.target.value); setQuote(null); }} className="h-10">
            {balances.map((b) => (
              <option key={b.token} value={b.token}>
                {b.token} ({b.amount.toLocaleString("en-GB")})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="To" htmlFor={`to-${cause.id}`}>
          <Select id={`to-${cause.id}`} value={to} onChange={(e) => { setTo(e.target.value); setQuote(null); }} className="h-10">
            {STABLECOINS.filter((s) => s.symbol !== from).map((s) => (
              <option key={s.symbol} value={s.symbol}>
                {s.symbol}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount" htmlFor={`amt-${cause.id}`}>
          <Input id={`amt-${cause.id}`} type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={(e) => { setAmount(e.target.value); setQuote(null); }} className="h-10 font-mono" />
        </Field>
      </div>
      {quote && (
        <dl className="mt-3 rounded-lg bg-paper-warm p-3 text-[13.5px] font-mono tnum">
          <div className="flex justify-between"><dt>Rate</dt><dd>1 {quote.fromToken} = {quote.rate} {quote.toToken}</dd></div>
          <div className="flex justify-between"><dt>You receive</dt><dd>{quote.amountOut.toLocaleString("en-GB")} {quote.toToken}</dd></div>
          <div className="flex justify-between"><dt>Sera.cx fee</dt><dd>{fmtUsd(quote.feeUsd, { cents: true })}</dd></div>
        </dl>
      )}
      {err && <Notice tone="bad" className="mt-3">{err}</Notice>}
      {done && <Notice tone="good" className="mt-3">{done}</Notice>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => void getQuote()} disabled={busy || !(Number.parseFloat(amount) > 0)}>
          Get quote
        </Button>
        <Button size="sm" onClick={() => void run()} disabled={busy || !quote}>
          {busy ? "Working" : "Convert"}
        </Button>
      </div>
    </div>
  );
}

function Withdraw({ cause }: { cause: Cause }) {
  const invalidate = useInvalidateAll();
  const balances = cause.treasury.balances.filter((b) => b.amount > 0);
  const [token, setToken] = useState(balances[0]?.token ?? "USDT");
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState(cause.payout ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setErr(null);
    setDone(null);
    try {
      await api.withdraw(cause.id, token, Number.parseFloat(amount) || 0, to);
      await invalidate();
      setDone(`Sent ${amount} ${token}. It is on the record.`);
      setAmount("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Withdrawal failed");
    } finally {
      setBusy(false);
    }
  };
  if (balances.length === 0) return null;
  return (
    <div className="mt-4 rounded-xl border border-rule p-4">
      <p className="text-[14.5px] font-medium">Withdraw</p>
      <p className="text-[13px] text-ink-muted">To any Ethereum address. Withdrawals are public on the cause's record.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_2fr]">
        <Field label="Token" htmlFor={`wtoken-${cause.id}`}>
          <Select id={`wtoken-${cause.id}`} value={token} onChange={(e) => setToken(e.target.value)} className="h-10">
            {balances.map((b) => (
              <option key={b.token} value={b.token}>
                {b.token}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount" htmlFor={`wamt-${cause.id}`}>
          <Input id={`wamt-${cause.id}`} type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-10 font-mono" />
        </Field>
        <Field label="To address" htmlFor={`wto-${cause.id}`}>
          <Input id={`wto-${cause.id}`} value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" className="h-10 font-mono" />
        </Field>
      </div>
      {err && <Notice tone="bad" className="mt-3">{err}</Notice>}
      {done && <Notice tone="good" className="mt-3">{done}</Notice>}
      <Button size="sm" className="mt-3" onClick={() => void run()} disabled={busy || !(Number.parseFloat(amount) > 0) || !to}>
        {busy ? "Sending" : "Withdraw"}
      </Button>
    </div>
  );
}

function GiftsReceived({ dc }: { dc: DashboardCause }) {
  return (
    <Panel title="Gifts received" lede="Newest first. Each one is on the public record with its transaction.">
      {dc.gifts.length === 0 ? (
        <p className="text-[14px] text-ink-muted">No gifts yet. Share the page to get the first one.</p>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule text-[14px]">
          {dc.gifts.slice(0, 6).map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-3 py-2">
              <span className="font-mono tnum">
                {g.amount.toLocaleString("en-GB")} {g.token} <span className="text-ink-muted">({fmtUsd(g.usd)})</span>
                {g.route === "swap" && <span className="ml-2 text-[11px] text-ink-subtle">via Sera.cx swap</span>}
              </span>
              <span className="font-mono text-[11.5px] text-ink-subtle">{timeAgo(g.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ShareTools({ dc }: { dc: DashboardCause }) {
  const c = dc.cause;
  const total = dc.shares.reduce((s, x) => s + x.count, 0);
  return (
    <Panel title="Share tools" icon={Share2} lede={`${fmtInt(total)} shares so far: ${dc.shares.map((s) => `${s.channel} ${s.count}`).join(", ")}.`}>
      <ShareButtons causeId={c.id} slug={c.slug} name={c.name} />
      <Button asChild variant="link" className="mt-2">
        <Link href={`/c/${c.id}/share`}>Embed button, preview card and QR poster</Link>
      </Button>
    </Panel>
  );
}

function PostUpdate({ cause }: { cause: Cause }) {
  const invalidate = useInvalidateAll();
  const [kind, setKind] = useState<CauseUpdate["kind"]>("report");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.postUpdate(cause.id, { kind, title, body, link: link || undefined });
      await invalidate();
      setMsg(kind === "stream" ? "Posted. The live block on your page now shows the stream." : "Posted. It is on the cause page and the record.");
      setTitle("");
      setBody("");
      setLink("");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not post");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Post an update or a live link" lede="Reports, receipts, photos and streams. A stream link turns the Live block on.">
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
          <Field label="Kind" htmlFor={`ukind-${cause.id}`}>
            <Select id={`ukind-${cause.id}`} value={kind} onChange={(e) => setKind(e.target.value as CauseUpdate["kind"])} className="h-10">
              <option value="report">Report</option>
              <option value="receipt">Receipts</option>
              <option value="photo">Photos</option>
              <option value="stream">Live stream</option>
              <option value="note">Note</option>
            </Select>
          </Field>
          <Field label="Title" htmlFor={`utitle-${cause.id}`}>
            <Input id={`utitle-${cause.id}`} required value={title} onChange={(e) => setTitle(e.target.value)} className="h-10" />
          </Field>
        </div>
        <Field label="Text" htmlFor={`ubody-${cause.id}`}>
          <Textarea id={`ubody-${cause.id}`} required value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[72px]" />
        </Field>
        <Field label={kind === "stream" ? "Stream embed link" : "Link (optional)"} htmlFor={`ulink-${cause.id}`} hint={kind === "stream" ? "A YouTube or Instagram embed URL. Gifts made during the stream show on screen." : undefined}>
          <Input id={`ulink-${cause.id}`} type="url" value={link} onChange={(e) => setLink(e.target.value)} required={kind === "stream"} className="h-10" />
        </Field>
        {err && <Notice tone="bad">{err}</Notice>}
        {msg && <Notice tone="good">{msg}</Notice>}
        <Button size="sm" type="submit" disabled={busy}>
          {busy ? "Posting" : "Post"}
        </Button>
      </form>
    </Panel>
  );
}

function Media({ cause }: { cause: Cause }) {
  const invalidate = useInvalidateAll();
  const [kind, setKind] = useState<"photo" | "video">("video");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.addMedia(cause.id, { kind, url, title });
      await invalidate();
      setUrl("");
      setTitle("");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not add");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: number) => {
    await api.removeMedia(cause.id, id);
    await invalidate();
  };
  return (
    <Panel title="Photos and video" icon={ImageIcon} lede="Photos, plus links from YouTube, TikTok, Instagram, X or any oEmbed-style URL. Shown as click-to-load embeds.">
      <form onSubmit={(e) => void add(e)} className="grid gap-3 sm:grid-cols-[120px_1fr_1fr_auto] sm:items-end">
        <Field label="Kind" htmlFor={`mkind-${cause.id}`}>
          <Select id={`mkind-${cause.id}`} value={kind} onChange={(e) => setKind(e.target.value as "photo" | "video")} className="h-10">
            <option value="video">Video link</option>
            <option value="photo">Photo URL</option>
          </Select>
        </Field>
        <Field label="URL" htmlFor={`murl-${cause.id}`}>
          <Input id={`murl-${cause.id}`} type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder={kind === "video" ? "https://www.youtube.com/watch?v=…" : "https://…/photo.jpg"} className="h-10" />
        </Field>
        <Field label="Title" htmlFor={`mtitle-${cause.id}`}>
          <Input id={`mtitle-${cause.id}`} value={title} onChange={(e) => setTitle(e.target.value)} className="h-10" />
        </Field>
        <Button size="sm" type="submit" disabled={busy} className="h-10">
          {kind === "video" ? <Video className="h-4 w-4" aria-hidden /> : <ImageIcon className="h-4 w-4" aria-hidden />} Add
        </Button>
      </form>
      {err && <Notice tone="bad" className="mt-2">{err}</Notice>}
      {cause.media.length > 0 && (
        <ul className="mt-3 divide-y divide-rule border-y border-rule text-[13.5px]">
          {cause.media.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate">
                <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-subtle mr-2">{m.kind === "video" ? (m.provider ?? "video") : "photo"}</span>
                {m.title}
              </span>
              <button type="button" onClick={() => void remove(m.id)} className="shrink-0 rounded-full p-1.5 text-ink-muted hover:bg-ink/5 hover:text-danger" aria-label={`Remove ${m.title}`}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {cause.media.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[13.5px] font-medium">Preview the gallery</summary>
          <MediaGallery items={cause.media} className="mt-3" />
        </details>
      )}
    </Panel>
  );
}

function Socials({ cause }: { cause: Cause }) {
  const invalidate = useInvalidateAll();
  const s = cause.profile.contact.socials ?? {};
  const [form, setForm] = useState({ website: cause.profile.contact.website ?? "", instagram: s.instagram ?? "", facebook: s.facebook ?? "", youtube: s.youtube ?? "", tiktok: s.tiktok ?? "", x: (s as { x?: string }).x ?? "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.updateSocials(cause.id, form);
      await invalidate();
      setMsg("Saved. The links on the cause page are updated.");
    } finally {
      setBusy(false);
    }
  };
  const fields: [keyof typeof form, string][] = [
    ["website", "Website"],
    ["instagram", "Instagram"],
    ["facebook", "Facebook"],
    ["youtube", "YouTube"],
    ["tiktok", "TikTok"],
    ["x", "X"],
  ];
  return (
    <Panel title="Links" icon={Link2} lede="The organisation's own channels. Shown in the Live block and the organisation section.">
      <form onSubmit={(e) => void save(e)} className="grid gap-3 sm:grid-cols-2">
        {fields.map(([k, label]) => (
          <Field key={k} label={label} htmlFor={`soc-${k}-${cause.id}`}>
            <Input id={`soc-${k}-${cause.id}`} type="url" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="h-10" placeholder="https://" />
          </Field>
        ))}
        <div className="sm:col-span-2 flex items-center gap-3">
          <Button size="sm" type="submit" disabled={busy}>
            {busy ? "Saving" : "Save links"}
          </Button>
          {msg && <span className="text-[13px] text-ink-muted" role="status">{msg}</span>}
        </div>
      </form>
    </Panel>
  );
}

function HelpRequests({ cause }: { cause: Cause }) {
  const invalidate = useInvalidateAll();
  const confirm = async (id: number) => {
    await api.confirmHelp(id);
    await invalidate();
  };
  return (
    <Panel title="Help requests" lede="Confirm a request once it is done. The helper earns gSera on your confirmation.">
      {cause.helpRequests.length === 0 ? (
        <p className="text-[14px] text-ink-muted">None open.</p>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule text-[14px]">
          {cause.helpRequests.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="font-medium leading-snug">{h.title}</p>
                <p className="font-mono text-[11.5px] text-ink-muted">
                  {h.kind} · {h.state}
                  {h.pledgedBy ? <> · taken by <Wallet address={h.pledgedBy} /></> : null}
                </p>
              </div>
              {h.state === "pledged" ? (
                <Button size="sm" variant="outline" onClick={() => void confirm(h.id)}>
                  <Check className="h-4 w-4" aria-hidden /> Confirm done
                </Button>
              ) : h.state === "fulfilled" ? (
                <span className="inline-flex items-center gap-1 text-[13px] text-sera-text">
                  <Check className="h-4 w-4" aria-hidden /> Done
                </span>
              ) : (
                <span className="text-[12.5px] text-ink-subtle">Waiting for a helper</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function InviteCharity({ dc }: { dc: DashboardCause }) {
  const { copied, copy } = useCopy();
  return (
    <Panel title="Invite the charity to claim the listing" lede="Send this link to the organisation. When they claim it, they control the profile, the payout wallet and updates.">
      <div className="flex flex-col gap-2 sm:flex-row">
        <code className="flex-1 min-w-0 truncate rounded-md border border-rule bg-paper-warm px-3 py-2 font-mono text-[12.5px]">{dc.inviteLink}</code>
        <Button variant="outline" size="sm" className="h-10" onClick={() => void copy(dc.inviteLink)}>
          {copied ? "Copied" : "Copy invite"}
        </Button>
      </div>
    </Panel>
  );
}

function Payout({ cause }: { cause: Cause }) {
  const invalidate = useInvalidateAll();
  const [payout, setPayout] = useState(cause.payout ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.setPayout(cause.id, payout);
      await invalidate();
      setMsg("Saved. The payout wallet claim (C3) is open again.");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Payout wallet" lede="The organisation's own wallet, named in the C3 claim. Withdrawals default to it.">
      <Notice tone="warn">
        <div className="flex gap-2">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>Changing the payout wallet removes Verified. The claim "the payout wallet belongs to the organisation" (C3) must be checked again, with a new signed message.</span>
        </div>
      </Notice>
      <form onSubmit={(e) => void save(e)} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input aria-label="Payout wallet address" value={payout} onChange={(e) => setPayout(e.target.value)} placeholder="0x…" className="h-10 font-mono flex-1" />
        <Button size="sm" type="submit" className="h-10" disabled={busy || payout === (cause.payout ?? "")}>
          {busy ? "Saving" : "Save wallet"}
        </Button>
      </form>
      {err && <Notice tone="bad" className="mt-2">{err}</Notice>}
      {msg && <Notice tone="good" className="mt-2">{msg}</Notice>}
      <p className="mt-2 font-mono text-[11.5px] text-ink-muted">
        Current: {cause.payout ? <Wallet address={cause.payout} you={false} /> : "not set"}.{" "}
        <Link href={`/verify/${cause.id}/C3`} className="text-sera-text underline underline-offset-2">
          C3 claim <ExternalLink className="inline h-3 w-3" aria-hidden />
        </Link>
      </p>
    </Panel>
  );
}

function PanelRecord({ cause }: { cause: Cause }) {
  const rec = useRecord(cause.id);
  return (
    <div className="border-t border-rule p-5 sm:p-6">
      <Panel title="Recent record" lede="The same public record visitors see on the cause page: gifts, conversions, withdrawals, updates and checks.">
        {rec.data ? <RecordList events={rec.data} limit={6} /> : <Spinner />}
        <Button asChild variant="link" className="mt-2">
          <Link href={`${causeHref(cause.id, cause.slug)}#record`}>Full record on the cause page</Link>
        </Button>
      </Panel>
    </div>
  );
}
