import { ArrowRightLeft, Check, ExternalLink, Image as ImageIcon, Link2, Share2, Trash2, TriangleAlert, Video } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { Empty, ErrorState, Notice, Spinner, SkeletonRows } from "@/components/Empty";
import { Eyebrow } from "@/components/Eyebrow";
import { GfCard, GreenField } from "@/components/GreenField";
import { MediaGallery, providerLabel } from "@/components/MediaGallery";
import { QrCode } from "@/components/QrCode";
import { RecordList } from "@/components/RecordList";
import { ShareButtons } from "@/components/ShareButtons";
import { StatusPill } from "@/components/StatusPill";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { SignInButton } from "@/components/SignInButton";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Wallet } from "@/components/Wallet";
import { useCopy } from "@/hooks/useCopy";
import { useSeo } from "@/hooks/useSeo";
import * as api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { stablecoinUsd } from "@/lib/constants";
import { fmtDate, fmtInt, fmtRm, fmtUsd, timeAgo } from "@/lib/format";
import { causeImage } from "@/lib/images";
import { useDashboard, useInvalidateAll, useRecord } from "@/lib/queries";
import { recordLines } from "@/lib/record";
import { causeHref, fromRaw, pledgedBy, profileOf, toRaw } from "@/lib/rules";
import { ROUTE_SEO } from "@/lib/seo";
import type { ConvertQuote, DashboardCause, Stablecoin, WithdrawResult } from "@/lib/types";
import { cn } from "@/lib/utils";

export function DashboardPage() {
  useSeo(ROUTE_SEO.dashboard);
  const { user, ready } = useAuth();
  const dash = useDashboard();

  if (!ready) return <div className="container"><Spinner /></div>;
  if (!user) {
    return (
      // Nothing to put beside a sign-in prompt, so the block is centred and
      // the whitespace around it reads as a choice.
      <div className="container py-16 text-center">
        <div className="mx-auto max-w-[36rem]">
          <Eyebrow>Dashboard</Eyebrow>
          <h1 className="mt-2 font-display text-[32px] font-semibold tracking-tight">Sign in to manage your causes.</h1>
          <p className="mt-2 measure mx-auto text-ink-muted">Your causes, what has arrived, your money, your sharing tools, your updates and your help requests.</p>
          <SignInButton size="lg" className="mt-6" label="Sign in" />
        </div>
      </div>
    );
  }
  if (dash.isError)
    return (
      <div className="container py-10">
        <ErrorState title="We could not load your causes" error={dash.error} onRetry={() => void dash.refetch()} />
      </div>
    );
  if (dash.isLoading || !dash.data)
    return (
      <div className="container py-10">
        <SkeletonRows rows={4} />
      </div>
    );

  const d = dash.data;
  const totalTreasury = d.causes.reduce((s, c) => s + treasuryUsd(c, d.tokens), 0);

  return (
    <div>
      <div className="container pt-8 md:pt-12">
        <Eyebrow>Creator dashboard</Eyebrow>
        <h1 className="mt-2 font-display text-[32px] font-semibold leading-[1.05] tracking-[-0.025em] sm:text-[40px]">Your causes.</h1>
        <p className="mt-2 measure text-[15.5px] text-ink-muted">
          Signed in as <Wallet address={user.wallet} you={false} />. {d.causes.length === 1 ? "One cause" : `${d.causes.length} causes`}. You own these listings, so you set the payout wallet, post the updates
          and ask for help here.
        </p>
      </div>
      <GreenField className="mt-8" kicker="Totals" footer={false}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <GfCard label="Given to your causes" ticker="All time" figure={fmtUsd(Number(d.totals.givenUsd))} meta={[{ label: "about", value: fmtRm(Number(d.totals.givenUsd)) }, { label: "givers", value: fmtInt(d.totals.givers) }]} />
          <GfCard label="Still held, after withdrawals" ticker="Stablecoins" figure={fmtUsd(totalTreasury)} meta={[{ label: "about", value: fmtRm(totalTreasury) }, { label: "you can withdraw", value: "all of it" }]} tab="#00E676" />
          <GfCard label="On the home page" ticker="Your switch" figure={fmtInt(d.causes.filter((c) => c.showOnHomepage).length)} meta={[{ label: "of", value: fmtInt(d.causes.length) }]} tab="#59E39A" />
        </div>
      </GreenField>
      <div className="container space-y-14 py-10 md:py-14">
        {d.causes.length === 0 && (
          <Empty title="You have not listed a cause yet" body="List your organisation and it appears here, with its own address, its sharing tools and a place to post updates.">
            <Button asChild>
              <Link href="/add">List your cause</Link>
            </Button>
          </Empty>
        )}
        {d.causes.map((dc) => (
          <CausePanel key={dc.id} dc={dc} tokens={d.tokens} />
        ))}
      </div>
    </div>
  );
}

/** Balances by token: gifts in, minus withdrawals, plus settled conversions. */
function balances(c: DashboardCause, tokens: Stablecoin[]): { token: Stablecoin; units: number; usd: number }[] {
  const byAddress = new Map<string, bigint>();
  for (const r of c.receivedByToken) byAddress.set(r.token, (byAddress.get(r.token) ?? 0n) + BigInt(r.amountRaw));
  return [...byAddress]
    .map(([address, raw]) => {
      const token = tokens.find((t) => t.address === address) ?? { address: address as Stablecoin["address"], symbol: `${address.slice(0, 6)}…`, decimals: 6, currency: "USD" };
      const units = fromRaw(raw.toString(), token.decimals);
      return { token, units, usd: Math.round(units * stablecoinUsd(token.symbol) * 100) / 100 };
    })
    .filter((b) => b.units > 0);
}

function treasuryUsd(c: DashboardCause, tokens: Stablecoin[]): number {
  return Math.round(balances(c, tokens).reduce((s, b) => s + b.usd, 0) * 100) / 100;
}

function symbolOf(address: string, tokens: Stablecoin[]): string {
  return tokens.find((t) => t.address === address.toLowerCase())?.symbol ?? `${address.slice(0, 6)}…`;
}
function decimalsOf(address: string, tokens: Stablecoin[]): number {
  return tokens.find((t) => t.address === address.toLowerCase())?.decimals ?? 6;
}

function CausePanel({ dc, tokens }: { dc: DashboardCause; tokens: Stablecoin[] }) {
  const c = dc;
  const invalidate = useInvalidateAll();
  const [homepageBusy, setHomepageBusy] = useState(false);
  const [homepageErr, setHomepageErr] = useState<string | null>(null);
  const toggleHomepage = async (v: boolean) => {
    setHomepageBusy(true);
    setHomepageErr(null);
    try {
      await api.setHomepageFlag(c.id, v);
      await invalidate();
    } catch (e) {
      setHomepageErr(e instanceof Error ? e.message : "Could not save");
    } finally {
      setHomepageBusy(false);
    }
  };
  return (
    <section className="rounded-2xl border border-rule bg-card" aria-labelledby={`cause-${c.id}`}>
      <header className="flex flex-col gap-4 border-b border-rule p-5 sm:flex-row sm:items-center sm:p-6">
        <img src={causeImage(c).src} alt="" className="h-20 w-28 shrink-0 rounded-xl object-cover" />
        <div className="min-w-0 flex-1">
          <h2 id={`cause-${c.id}`} className="font-display text-[24px] font-semibold leading-tight tracking-tight">
            <Link href={causeHref(c.id, c.slug)} className="hover:text-sera-text">
              {c.name}
            </Link>
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <StatusPill stage={c.stage} checksDone={c.checksDone} checksTotal={c.checksTotal} />
            <span className="font-mono text-[12px] text-ink-muted tnum">{fmtUsd(Number(c.givenUsd))} from {fmtInt(c.giversCount)} givers</span>
            <span className="font-mono text-[12px] text-ink-muted tnum">{fmtUsd(treasuryUsd(c, tokens))} received, net</span>
          </div>
          {homepageErr && <Notice tone="bad" className="mt-2">{homepageErr}</Notice>}
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-rule bg-paper-warm px-4 py-3">
          <div>
            <p className="text-[14px] font-medium">Show on the home page</p>
            <p className="text-[12px] text-ink-muted">{c.homepageHiddenReason ? `Hidden by a steward: ${c.homepageHiddenReason}` : "Signed by your wallet"}</p>
          </div>
          <Switch label={`Show ${c.name} on the home page`} checked={c.showOnHomepage} onCheckedChange={(v) => void toggleHomepage(v)} disabled={homepageBusy || !!c.homepageHiddenReason} />
        </div>
      </header>

      <div className="grid gap-8 p-5 sm:p-6 lg:grid-cols-2">
        <Treasury dc={c} tokens={tokens} />
        <div className="space-y-8">
          <GiftsReceived dc={c} tokens={tokens} />
          <ShareTools dc={c} />
        </div>
        <PostUpdate dc={c} />
        <Media dc={c} />
        <Socials dc={c} />
        <HelpRequests dc={c} />
        <InviteCharity dc={c} />
        <Payout dc={c} />
      </div>
      <PanelRecord dc={c} />
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

function OnChainNotice({ action }: { action: string }) {
  return (
    <Notice tone="info">
      {action} is a registry transaction sent from the organisation's own wallet, not something we do for you. It appears here once the signed-in wallet can send it.
    </Notice>
  );
}

function Treasury({ dc: cause, tokens }: { dc: DashboardCause; tokens: Stablecoin[] }) {
  const w = cause.wallet;
  const invalidate = useInvalidateAll();
  const [mode, setMode] = useState<"auto" | "manual">(w.treasuryMode);
  const [target, setTarget] = useState<string>(w.targetToken ?? tokens[0]?.address ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { copied, copy } = useCopy();
  const list = balances(cause, tokens);
  const unchanged = mode === w.treasuryMode && (mode === "manual" || target === w.targetToken);

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await api.setTreasury(cause.id, mode, mode === "auto" ? target : undefined);
      await invalidate();
      setMsg(mode === "auto" ? `Everything that arrives is converted to ${symbolOf(target, tokens)} through Sera.cx.` : "Holding what arrives. Convert when you choose.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="Money held" lede="What is sitting at the cause's own address. Gifts land here directly, and nothing is held back on the way." icon={ArrowRightLeft}>
      <div className="rounded-xl border border-rule bg-paper-warm p-3">
        <Eyebrow>Cause address</Eyebrow>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <code className="break-all font-mono text-[12.5px] tnum">{w.address}</code>
          <Button size="sm" variant="outline" onClick={() => void copy(w.address)}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
      <div className="table-scroll mt-3">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="text-left">
              <th className="eyebrow pb-1.5 font-medium">Stablecoin</th>
              <th className="eyebrow pb-1.5 font-medium text-right">Held now</th>
              <th className="eyebrow pb-1.5 font-medium text-right">US$</th>
              <th className="eyebrow pb-1.5 font-medium text-right">About</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule border-y border-rule">
            {list.length === 0 && (
              <tr>
                <td colSpan={4} className="py-2 text-ink-muted">Nothing has arrived yet. Share the page to get the first gift.</td>
              </tr>
            )}
            {list.map((b) => (
              <tr key={b.token.address}>
                <td className="py-2 font-mono">{b.token.symbol}</td>
                <td className="py-2 text-right font-mono tnum">{b.units.toLocaleString("en-GB", { maximumFractionDigits: 2 })}</td>
                <td className="py-2 text-right font-mono tnum text-ink-muted">{fmtUsd(b.usd, { cents: true })}</td>
                <td className="py-2 text-right font-mono tnum text-ink-muted">{fmtRm(b.usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <fieldset className="mt-5">
        <legend className="text-[14px] font-medium">Which currency do you want to keep?</legend>
        <div className="mt-2 space-y-2">
          <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3", mode === "auto" ? "border-ink bg-paper-warm" : "border-rule")}>
            <input type="radio" name={`policy-${cause.id}`} checked={mode === "auto"} onChange={() => setMode("auto")} className="mt-1 accent-[#1B7A3F]" />
            <span className="flex-1">
              <span className="block text-[14.5px] font-medium">Keep everything in one currency</span>
              <span className="block text-[13px] text-ink-muted">Everything that arrives is swapped through Sera.cx straight away.</span>
              {mode === "auto" && (
                <Select aria-label="Stablecoin to keep" value={target} onChange={(e) => setTarget(e.target.value)} className="mt-2 h-9 max-w-[240px] text-[13.5px]">
                  {tokens.map((t) => (
                    <option key={t.address} value={t.address}>
                      {t.symbol} ({t.currency})
                    </option>
                  ))}
                </Select>
              )}
            </span>
          </label>
          <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3", mode === "manual" ? "border-ink bg-paper-warm" : "border-rule")}>
            <input type="radio" name={`policy-${cause.id}`} checked={mode === "manual"} onChange={() => setMode("manual")} className="mt-1 accent-[#1B7A3F]" />
            <span>
              <span className="block text-[14.5px] font-medium">Keep what arrives and swap it when I choose</span>
              <span className="block text-[13px] text-ink-muted">The money stays in whatever stablecoin it came in.</span>
            </span>
          </label>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <Button size="sm" onClick={() => void save()} disabled={saving || unchanged}>
            {saving ? "Saving" : "Save setting"}
          </Button>
          {msg && <span className="text-[13px] text-ink-muted" role="status">{msg}</span>}
        </div>
        {err && <Notice tone="bad" className="mt-2">{err}</Notice>}
      </fieldset>

      <Convert dc={cause} tokens={tokens} />
      <Withdraw dc={cause} tokens={tokens} />

      {(cause.conversions.length > 0 || cause.withdrawals.length > 0) && (
        <details className="mt-4">
          <summary className="flex min-h-11 cursor-pointer items-center text-[13.5px] font-medium">Swaps and withdrawals</summary>
          <ul className="mt-2 space-y-1.5 text-[13px] text-ink-muted">
            {cause.conversions.map((cv) => (
              <li key={`c${cv.id}`} className="font-mono tnum">
                {fmtDate(cv.createdAt)}: {fromRaw(cv.amountIn, decimalsOf(cv.fromToken, tokens)).toLocaleString("en-GB")} {symbolOf(cv.fromToken, tokens)} to {cv.amountOut ? fromRaw(cv.amountOut, decimalsOf(cv.toToken, tokens)).toLocaleString("en-GB") : "…"} {symbolOf(cv.toToken, tokens)} ({cv.triggeredBy}, {cv.state})
              </li>
            ))}
            {cause.withdrawals.map((wd) => (
              <li key={`w${wd.id}`} className="font-mono tnum">
                {fmtDate(wd.createdAt)}: withdrew {fromRaw(wd.amount, decimalsOf(wd.token, tokens)).toLocaleString("en-GB")} {symbolOf(wd.token, tokens)} to {wd.to.slice(0, 6)}…{wd.to.slice(-4)}{wd.txHash ? "" : " (transfer not sent yet)"}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  );
}

function Convert({ dc: cause, tokens }: { dc: DashboardCause; tokens: Stablecoin[] }) {
  const invalidate = useInvalidateAll();
  const held = balances(cause, tokens);
  const [from, setFrom] = useState<string>(held[0]?.token.address ?? tokens[0]?.address ?? "");
  const [to, setTo] = useState<string>(tokens.find((t) => t.address !== (held[0]?.token.address ?? tokens[0]?.address))?.address ?? "");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<ConvertQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const fromToken = tokens.find((t) => t.address === from);
  const toToken = tokens.find((t) => t.address === to);

  const getQuote = async () => {
    setErr(null);
    setDone(null);
    setBusy(true);
    try {
      setQuote(await api.quoteConvert(cause.id, from, to, toRaw(Number.parseFloat(amount) || 0, fromToken?.decimals ?? 6)));
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
      const cv = await api.submitConvert(cause.id, quote);
      await invalidate();
      setDone(`Conversion ${cv.state}: ${fromRaw(quote.quote.fromAmountRaw, quote.quote.from.decimals)} ${quote.quote.from.symbol} to at least ${fromRaw(quote.quote.minOutputRaw, quote.quote.to.decimals)} ${quote.quote.to.symbol}. It is on the record.`);
      setQuote(null);
      setAmount("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Conversion failed");
    } finally {
      setBusy(false);
    }
  };

  if (held.length === 0 || tokens.length < 2) return null;
  return (
    <div className="mt-5 rounded-xl border border-rule p-4">
      <p className="text-[14.5px] font-medium">Swap now</p>
      <p className="measure text-[13px] text-ink-muted">You see a Sera.cx quote before anything moves.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="From" htmlFor={`from-${cause.id}`}>
          <Select id={`from-${cause.id}`} value={from} onChange={(e) => { setFrom(e.target.value); setQuote(null); }} className="h-10">
            {held.map((b) => (
              <option key={b.token.address} value={b.token.address}>
                {b.token.symbol} ({b.units.toLocaleString("en-GB", { maximumFractionDigits: 2 })})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="To" htmlFor={`to-${cause.id}`}>
          <Select id={`to-${cause.id}`} value={to} onChange={(e) => { setTo(e.target.value); setQuote(null); }} className="h-10">
            {tokens.filter((t) => t.address !== from).map((t) => (
              <option key={t.address} value={t.address}>
                {t.symbol}
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
          <div className="flex justify-between"><dt>You convert</dt><dd>{fromRaw(quote.quote.fromAmountRaw, quote.quote.from.decimals).toLocaleString("en-GB")} {quote.quote.from.symbol}</dd></div>
          <div className="flex justify-between"><dt>You receive at least</dt><dd>{fromRaw(quote.quote.minOutputRaw, quote.quote.to.decimals).toLocaleString("en-GB")} {quote.quote.to.symbol}</dd></div>
          <div className="flex justify-between"><dt>Quote expires</dt><dd>{fmtDate(quote.quote.expiresAt, true)}</dd></div>
        </dl>
      )}
      {err && <Notice tone="bad" className="mt-3">{err}</Notice>}
      {done && <Notice tone="good" className="mt-3">{done}</Notice>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => void getQuote()} disabled={busy || !(Number.parseFloat(amount) > 0) || !fromToken || !toToken}>
          Get quote
        </Button>
        <Button size="sm" onClick={() => void run()} disabled={busy || !quote}>
          {busy ? "Working" : "Sign and convert"}
        </Button>
      </div>
    </div>
  );
}

function Withdraw({ dc: cause, tokens }: { dc: DashboardCause; tokens: Stablecoin[] }) {
  const invalidate = useInvalidateAll();
  const held = balances(cause, tokens);
  const [token, setToken] = useState<string>(held[0]?.token.address ?? "");
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState<string>(cause.payout ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [plan, setPlan] = useState<WithdrawResult | null>(null);
  const run = async () => {
    setBusy(true);
    setErr(null);
    setPlan(null);
    try {
      const t = tokens.find((x) => x.address === token);
      const r = await api.withdraw(cause.id, token, toRaw(Number.parseFloat(amount) || 0, t?.decimals ?? 6), to);
      await invalidate();
      setPlan(r);
      setAmount("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Withdrawal failed");
    } finally {
      setBusy(false);
    }
  };
  if (held.length === 0) return null;
  return (
    <div className="mt-4 rounded-xl border border-rule p-4">
      <p className="text-[14.5px] font-medium">Withdraw</p>
      <p className="measure text-[13px] text-ink-muted">To any Ethereum address. We record it and hand back the transfer for the cause wallet to send.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_2fr]">
        <Field label="Token" htmlFor={`wtoken-${cause.id}`}>
          <Select id={`wtoken-${cause.id}`} value={token} onChange={(e) => setToken(e.target.value)} className="h-10">
            {held.map((b) => (
              <option key={b.token.address} value={b.token.address}>
                {b.token.symbol}
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
      {plan && (
        <Notice tone="good" className="mt-3">
          Recorded. Send {fromRaw(plan.plan.amountRaw, plan.plan.decimals ?? 6).toLocaleString("en-GB")} {plan.plan.symbol ?? ""} from {plan.plan.from.slice(0, 6)}…{plan.plan.from.slice(-4)} to {plan.plan.to.slice(0, 6)}…{plan.plan.to.slice(-4)}.
          <code className="mt-1 block break-all font-mono text-[11px] opacity-80">{plan.plan.eip681}</code>
        </Notice>
      )}
      <Button size="sm" className="mt-3" onClick={() => void run()} disabled={busy || !(Number.parseFloat(amount) > 0) || !/^0x[0-9a-fA-F]{40}$/.test(to.trim())}>
        {busy ? "Recording" : "Withdraw"}
      </Button>
    </div>
  );
}

function GiftsReceived({ dc, tokens }: { dc: DashboardCause; tokens: Stablecoin[] }) {
  return (
    <Panel title="Gifts received" lede="Newest first. Each one is on the public record, with its transaction.">
      {dc.gifts.length === 0 ? (
        <p className="text-[14px] text-ink-muted">No gifts yet. Share the page to get the first one.</p>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule text-[14px]">
          {dc.gifts.slice(0, 6).map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-3 py-2">
              <span className="font-mono tnum">
                {fromRaw(g.amount, decimalsOf(g.token, tokens)).toLocaleString("en-GB")} {symbolOf(g.token, tokens)} <span className="text-ink-muted">({fmtUsd(Number(g.usd))})</span>
                {g.source === "sera_swap" && <span className="ml-2 text-[11px] text-ink-subtle">via Sera.cx swap</span>}
              </span>
              <span className="font-mono text-[11.5px] text-ink-subtle">{timeAgo(g.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ShareTools({ dc }: { dc: DashboardCause }) {
  const entries = Object.entries(dc.shares);
  const total = entries.reduce((s, [, n]) => s + n, 0);
  return (
    <Panel title="Sharing tools" icon={Share2} lede={total > 0 ? `${fmtInt(total)} shares so far: ${entries.map(([ch, n]) => `${ch} ${n}`).join(", ")}.` : "Nobody has shared this yet."}>
      <ShareButtons causeId={dc.id} slug={dc.slug} name={dc.name} />
      <Button asChild variant="link" className="mt-2">
        <Link href={`/c/${dc.id}/share`}>Website button, preview card and QR poster</Link>
      </Button>
    </Panel>
  );
}

function PostUpdate({ dc: cause }: { dc: DashboardCause }) {
  const invalidate = useInvalidateAll();
  const [kind, setKind] = useState("report");
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
    <Panel title="Post an update or a live link" lede="Reports, receipts, photos and live streams. A stream link switches the Live block on your page.">
      {api.ONCHAIN_ONLY ? (
        <OnChainNotice action="Posting an update (postProgress)" />
      ) : (
        <form onSubmit={(e) => void submit(e)} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
            <Field label="Kind" htmlFor={`ukind-${cause.id}`}>
              <Select id={`ukind-${cause.id}`} value={kind} onChange={(e) => setKind(e.target.value)} className="h-10">
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
      )}
    </Panel>
  );
}

function Media({ dc: cause }: { dc: DashboardCause }) {
  const invalidate = useInvalidateAll();
  const [kind, setKind] = useState<"video" | "photo" | "upload">("video");
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.addMedia(cause.id, kind === "upload" ? { kind: "photo", file, caption } : { kind, url, caption });
      await invalidate();
      setUrl("");
      setCaption("");
      setFile(null);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not add");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    setErr(null);
    try {
      await api.removeMedia(id);
      await invalidate();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not remove");
    }
  };
  return (
    <Panel title="Photos and video" icon={ImageIcon} lede="Upload a photo, paste a link to an image, or link a video from YouTube, TikTok, Instagram, X, Vimeo or Twitch. A video only loads when a visitor asks for it.">
      <form onSubmit={(e) => void add(e)} className="grid gap-3 sm:grid-cols-[130px_1fr_1fr_auto] sm:items-end">
        <Field label="Kind" htmlFor={`mkind-${cause.id}`}>
          <Select id={`mkind-${cause.id}`} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="h-10">
            <option value="video">Video link</option>
            <option value="photo">Photo URL</option>
            <option value="upload">Photo upload</option>
          </Select>
        </Field>
        {kind === "upload" ? (
          <Field label="File (png, jpg, webp)" htmlFor={`mfile-${cause.id}`}>
            <input id={`mfile-${cause.id}`} type="file" accept="image/png,image/jpeg,image/webp" required className="block min-h-11 w-full text-[14px] text-ink-muted file:mr-3 file:rounded-full file:border file:border-rule file:bg-card file:px-3 file:py-2.5 file:text-[13px] file:font-medium file:text-ink" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
        ) : (
          <Field label="URL" htmlFor={`murl-${cause.id}`}>
            <Input id={`murl-${cause.id}`} type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder={kind === "video" ? "https://www.youtube.com/watch?v=…" : "https://…/photo.jpg"} className="h-10" />
          </Field>
        )}
        <Field label="Caption" htmlFor={`mtitle-${cause.id}`}>
          <Input id={`mtitle-${cause.id}`} value={caption} onChange={(e) => setCaption(e.target.value)} className="h-10" />
        </Field>
        <Button size="sm" type="submit" disabled={busy || (kind === "upload" ? !file : !url)} className="h-10">
          {kind === "video" ? <Video className="h-4 w-4" aria-hidden /> : <ImageIcon className="h-4 w-4" aria-hidden />} Add
        </Button>
      </form>
      {err && <Notice tone="bad" className="mt-2">{err}</Notice>}
      {cause.media.length > 0 && (
        <ul className="mt-3 divide-y divide-rule border-y border-rule text-[13.5px]">
          {cause.media.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate">
                <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-subtle mr-2">{m.kind === "video" ? providerLabel(m.provider) : "photo"}</span>
                {m.caption || m.url}
              </span>
              <button type="button" onClick={() => void remove(m.id)} className="shrink-0 rounded-full p-1.5 text-ink-muted hover:bg-ink/5 hover:text-danger" aria-label={`Remove ${m.caption || m.kind}`}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {cause.media.length > 0 && (
        <details className="mt-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-[13.5px] font-medium">Preview the gallery</summary>
          <MediaGallery items={cause.media} className="mt-3" />
        </details>
      )}
    </Panel>
  );
}

function Socials({ dc: cause }: { dc: DashboardCause }) {
  const invalidate = useInvalidateAll();
  const p = profileOf(cause);
  const s = p.contact.socials ?? {};
  const [form, setForm] = useState({ website: p.contact.website ?? "", instagram: s.instagram ?? "", facebook: s.facebook ?? "", youtube: s.youtube ?? "", tiktok: s.tiktok ?? "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.updateSocials(cause.id, form);
      await invalidate();
      setMsg("Saved. The links on the cause page are updated.");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not save");
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
  ];
  return (
    <Panel title="Links" icon={Link2} lede="Your organisation's own pages. They show in the Live block and in the Organisation section.">
      {api.ONCHAIN_ONLY ? (
        <OnChainNotice action="Changing the profile (setURI with new metadata)" />
      ) : (
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
            {err && <span className="text-[13px] text-danger" role="alert">{err}</span>}
          </div>
        </form>
      )}
    </Panel>
  );
}

function HelpRequests({ dc: cause }: { dc: DashboardCause }) {
  const invalidate = useInvalidateAll();
  const [err, setErr] = useState<string | null>(null);
  const confirm = async (id: number, helper: string) => {
    setErr(null);
    try {
      await api.confirmHelp(id, helper);
      await invalidate();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not confirm");
    }
  };
  return (
    <Panel title="Help requests" lede="Confirm a request once it is done. Your confirmation, signed by your wallet, is what earns the helper their badge. It carries no points, so confirming costs you nothing and buys them nothing.">
      {cause.helpRequests.length === 0 ? (
        <p className="text-[14px] text-ink-muted">None open.</p>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule text-[14px]">
          {cause.helpRequests.map((h) => {
            const taker = pledgedBy(h);
            return (
              <li key={h.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-medium leading-snug">{h.title}</p>
                  <p className="font-mono text-[11.5px] text-ink-muted">
                    {h.kind} · {h.state}
                    {taker ? <> · taken by <Wallet address={taker} /></> : null}
                  </p>
                </div>
                {h.state === "pledged" && taker ? (
                  <Button size="sm" variant="outline" onClick={() => void confirm(h.id, taker)}>
                    <Check className="h-4 w-4" aria-hidden /> Confirm done
                  </Button>
                ) : h.state === "fulfilled" ? (
                  <span className="inline-flex items-center gap-1 text-[13px] text-sera-text">
                    <Check className="h-4 w-4" aria-hidden /> Done
                  </span>
                ) : h.state === "closed" ? (
                  <span className="text-[12.5px] text-ink-subtle">Closed</span>
                ) : (
                  <span className="text-[12.5px] text-ink-subtle">Waiting for a helper</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {err && <Notice tone="bad" className="mt-2">{err}</Notice>}
    </Panel>
  );
}

function InviteCharity({ dc }: { dc: DashboardCause }) {
  const { copied, copy } = useCopy();
  const invite = `${dc.share.url}?claim=invite`;
  return (
    <Panel title="Hand this listing over" lede="Only needed if you listed this cause for someone else. Send them this link. Once they claim it, they control the profile, the payout wallet and the updates.">
      <div className="flex flex-col gap-2 sm:flex-row">
        <code className="flex-1 min-w-0 truncate rounded-md border border-rule bg-paper-warm px-3 py-2 font-mono text-[12.5px]">{invite}</code>
        <Button variant="outline" size="sm" className="h-10" onClick={() => void copy(invite)}>
          {copied ? "Copied" : "Copy invite"}
        </Button>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="rounded-lg border border-rule bg-white p-1.5">
          <QrCode text={dc.address.qr} size={72} alt={`QR code for ${dc.name}'s address`} />
        </div>
        <p className="font-mono text-[11.5px] text-ink-muted break-all">Cause address {dc.address.address} on chain {dc.address.chainId}.</p>
      </div>
    </Panel>
  );
}

function Payout({ dc: cause }: { dc: DashboardCause }) {
  const invalidate = useInvalidateAll();
  const [payout, setPayout] = useState<string>(cause.payout ?? "");
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
    <Panel title="Payout wallet" lede="Your organisation's own wallet, named in the C3 claim. Withdrawals go here unless you change them.">
      <Notice tone="warn">
        <div className="flex gap-2">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>Changing the payout wallet removes Verified. The claim "the payout wallet belongs to the organisation" (C3) has to be checked again, with a new signed message.</span>
        </div>
      </Notice>
      {api.ONCHAIN_ONLY ? (
        <div className="mt-3">
          <OnChainNotice action="Changing the payout wallet (setPayout)" />
        </div>
      ) : (
        <form onSubmit={(e) => void save(e)} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input aria-label="Payout wallet address" value={payout} onChange={(e) => setPayout(e.target.value)} placeholder="0x…" className="h-10 font-mono flex-1" />
          <Button size="sm" type="submit" className="h-10" disabled={busy || payout === (cause.payout ?? "")}>
            {busy ? "Saving" : "Save wallet"}
          </Button>
        </form>
      )}
      {err && <Notice tone="bad" className="mt-2">{err}</Notice>}
      {msg && <Notice tone="good" className="mt-2">{msg}</Notice>}
      <p className="mt-2 font-mono text-[11.5px] text-ink-muted">
        Current: {cause.payout ? <Wallet address={cause.payout} you={false} /> : "not set"}.{" "}
        <Link href={`/helpers/${cause.id}/C3`} className="text-sera-text underline underline-offset-2">
          C3 claim <ExternalLink className="inline h-3 w-3" aria-hidden />
        </Link>
      </p>
    </Panel>
  );
}

function PanelRecord({ dc: cause }: { dc: DashboardCause }) {
  const rec = useRecord(cause.id);
  return (
    <div className="border-t border-rule p-5 sm:p-6">
      <Panel title="Recent record" lede="The same public record a visitor sees on the cause page: gifts, swaps, withdrawals, updates and checks.">
        {rec.isError ? (
          <ErrorState title="We could not load the record" error={rec.error} onRetry={() => void rec.refetch()} />
        ) : rec.isLoading ? (
          <Spinner label="Loading the record" />
        ) : (
          <RecordList events={recordLines(rec.data ?? [])} limit={6} />
        )}
        <Button asChild variant="link" className="mt-2">
          <Link href={`${causeHref(cause.id, cause.slug)}#record`}>Full record on the cause page</Link>
        </Button>
      </Panel>
    </div>
  );
}
