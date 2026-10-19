import { ArrowLeft, ArrowRightLeft, Check, Copy, ExternalLink, Wallet as WalletIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { Notice, Spinner } from "@/components/Empty";
import { Eyebrow } from "@/components/Eyebrow";
import { PhotoCredit } from "@/components/PhotoCredit";
import { QrCode } from "@/components/QrCode";
import { ShareButtons } from "@/components/ShareButtons";
import { StatusPill } from "@/components/StatusPill";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useCopy } from "@/hooks/useCopy";
import { useSeo } from "@/hooks/useSeo";
import { quoteGift, submitGift } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { GIFT_PRESETS_USD, GSERA, STABLECOINS } from "@/lib/constants";
import { fmtGsera, fmtInt, fmtMultiplier, fmtUsd } from "@/lib/format";
import { useCause, useInvalidateAll } from "@/lib/queries";
import { causeHref, giftGsera, shortAddress } from "@/lib/rules";
import type { Cause, GiftQuote, GiftReceipt } from "@/lib/types";
import { cn } from "@/lib/utils";
import { NotFoundPage } from "./NotFound";

const EXPLORER = "https://sepolia.etherscan.io/tx/";

export function GivePage() {
  const { id = "" } = useParams<{ id: string }>();
  const causeId = Number.parseInt(id, 10);
  const q = useCause(causeId);
  const cause = q.data;
  useSeo(cause ? `Give to ${cause.name}` : "Give");

  if (q.isLoading) return <div className="container"><Spinner label="Loading" /></div>;
  if (!cause) return <NotFoundPage />;
  if (cause.stage === "paused" || cause.stage === "closed") {
    return (
      <div className="container max-w-2xl py-14">
        <Notice tone="bad">{cause.name} is not taking gifts right now. {cause.pausedReason}</Notice>
        <Button asChild variant="link" className="mt-4">
          <Link href={causeHref(cause.id, cause.slug)}>Back to the cause</Link>
        </Button>
      </div>
    );
  }
  return <GiveSheet cause={cause} />;
}

function GiveSheet({ cause }: { cause: Cause }) {
  const [receipt, setReceipt] = useState<GiftReceipt | null>(null);
  if (receipt) return <ThankYou cause={cause} receipt={receipt} />;
  return (
    <div className="container max-w-3xl py-8 md:py-12">
      <Link href={causeHref(cause.id, cause.slug)} className="inline-flex items-center gap-1.5 text-[14px] text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {cause.name}
      </Link>
      <div className="mt-4 flex items-start gap-4">
        <img src={cause.profile.image?.src} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" aria-hidden />
        <div>
          <Eyebrow>Give</Eyebrow>
          <h1 className="mt-1 font-display text-[28px] font-semibold leading-tight tracking-tight sm:text-[34px]">{cause.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusPill stage={cause.stage} checksDone={cause.checksDone} checksTotal={cause.checksTotal} />
            {cause.urgent && <span className="font-mono text-[11.5px] text-ink-muted">Urgent appeal: gifts earn {fmtMultiplier(GSERA.heat.urgent)} gSera</span>}
          </div>
        </div>
      </div>

      <Tabs defaultValue="site" className="mt-8">
        <TabsList aria-label="Ways to give">
          <TabsTrigger value="site">Give from this site</TabsTrigger>
          <TabsTrigger value="direct">Send directly</TabsTrigger>
        </TabsList>
        <TabsContent value="site">
          <FromSite cause={cause} onDone={setReceipt} />
        </TabsContent>
        <TabsContent value="direct">
          <SendDirectly cause={cause} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type Step = 1 | 2 | 3;

function FromSite({ cause, onDone }: { cause: Cause; onDone: (r: GiftReceipt) => void }) {
  const { user, signIn, busy: signingIn } = useAuth();
  const invalidate = useInvalidateAll();
  const [step, setStep] = useState<Step>(1);
  const [token, setToken] = useState(cause.acceptedTokens[0] ?? "USDT");
  const [amount, setAmount] = useState<string>("25");
  const [quote, setQuote] = useState<GiftQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tokenInfo = STABLECOINS.find((t) => t.symbol === token)!;
  const amountNum = Number.parseFloat(amount) || 0;
  const usd = amountNum * tokenInfo.usd;
  const direct = cause.acceptedTokens.includes(token);
  const previewGsera = giftGsera(usd, { heat: cause.urgent ? GSERA.heat.urgent : 1 });

  const review = async () => {
    setError(null);
    if (!(amountNum > 0)) {
      setError("Enter an amount.");
      return;
    }
    setBusy(true);
    try {
      setQuote(await quoteGift(cause.id, token, amountNum));
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not get a quote");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!quote) return;
    setStep(3);
    setBusy(true);
    setError(null);
    try {
      const r = await submitGift(quote);
      await invalidate();
      onDone(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The gift did not go through");
      setStep(2);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-rule bg-card p-5 sm:p-7">
      <ol className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] uppercase tracking-[0.12em]" aria-label="Steps">
        {["Amount", "Review", "Confirm", "Thank you"].map((s, i) => (
          <li key={s} className={cn(i + 1 === step ? "text-ink" : "text-ink-subtle")} aria-current={i + 1 === step ? "step" : undefined}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            void review();
          }}
        >
          <fieldset>
            <legend className="font-sans text-[14px] font-medium mb-2">Stablecoin</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Stablecoin">
              {STABLECOINS.map((t) => {
                const accepted = cause.acceptedTokens.includes(t.symbol);
                return (
                  <button
                    key={t.symbol}
                    type="button"
                    role="radio"
                    aria-checked={token === t.symbol}
                    onClick={() => setToken(t.symbol)}
                    className={cn("inline-flex h-10 items-center gap-2 rounded-full border px-4 font-mono text-[13.5px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", token === t.symbol ? "border-ink bg-ink text-paper" : "border-rule bg-card text-ink hover:border-ink/40")}
                  >
                    {t.symbol}
                    {!accepted && <span className="font-sans text-[11px] opacity-70">via swap</span>}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[13px] text-ink-muted">
              {cause.name} keeps {cause.acceptedTokens.join(", ")}. {direct ? "Your gift goes straight to its address." : `A ${token} gift is swapped on Sera.cx and delivered to its address as ${cause.acceptedTokens[0]}. The rate is shown before you confirm.`}
            </p>
          </fieldset>

          <div className="mt-6">
            <Label htmlFor="amount">Amount in {token}</Label>
            <div className="flex flex-wrap gap-2 mb-2" role="group" aria-label="Preset amounts">
              {GIFT_PRESETS_USD.map((p) => {
                const v = Math.round((p / tokenInfo.usd) * 100) / 100;
                return (
                  <button key={p} type="button" onClick={() => setAmount(String(v))} className={cn("h-9 rounded-full border px-3.5 font-mono text-[13px] tnum focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", amountNum === v ? "border-ink bg-ink text-paper" : "border-rule hover:border-ink/40")}>
                    US${p}
                  </button>
                );
              })}
            </div>
            <Input id="amount" inputMode="decimal" type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-mono text-[18px] h-12" aria-describedby="amount-hint" />
            <p id="amount-hint" className="mt-1.5 font-mono text-[12.5px] text-ink-muted tnum">
              About {fmtUsd(usd, { cents: true })}. You would earn about {fmtGsera(previewGsera)}{user ? " before your multipliers" : ""}.
            </p>
          </div>

          {error && <Notice tone="bad" className="mt-4">{error}</Notice>}
          <div className="mt-6 flex items-center justify-between gap-3">
            <p className="text-[12.5px] text-ink-muted">Fees are shown before you confirm.</p>
            <Button type="submit" variant="give" size="lg" disabled={busy}>
              {busy ? "Getting a quote" : "Review"}
            </Button>
          </div>
        </form>
      )}

      {step === 2 && quote && (
        <div className="mt-6">
          <dl className="divide-y divide-rule border-y border-rule text-[15px]">
            <Row k="You give" v={<span className="font-mono tnum">{fmtInt(quote.amount)} {quote.fromToken} <span className="text-ink-muted">({fmtUsd(quote.usd, { cents: true })})</span></span>} />
            <Row k="Network fee" v={<span className="font-mono tnum">about {fmtUsd(quote.networkFeeUsd, { cents: true })}</span>} />
            {quote.swap ? (
              <>
                <Row k="Sera.cx swap" v={<span className="font-mono tnum">1 {quote.fromToken} = {quote.swap.rate} {quote.swap.toToken}, fee {fmtUsd(quote.swap.swapFeeUsd, { cents: true })}</span>} />
                <Row k={`${cause.name} receives`} v={<span className="font-mono tnum">{quote.swap.receives.toLocaleString("en-GB")} {quote.swap.toToken}</span>} />
              </>
            ) : (
              <Row k={`${cause.name} receives`} v={<span className="font-mono tnum">{fmtInt(quote.amount)} {quote.fromToken}, a direct transfer</span>} />
            )}
            <Row k="Delivered to" v={<span className="font-mono tnum break-all">{quote.depositAddress}</span>} />
            <Row
              k="gSera you will earn"
              v={
                quote.gsera.earns ? (
                  <span>
                    <span className="font-mono tnum font-semibold">{fmtGsera(quote.gsera.amount)}</span>
                    <span className="block text-[13px] text-ink-muted">
                      {fmtInt(quote.gsera.base)} per US$1 x heat {fmtMultiplier(quote.gsera.heat)} x volume tier {fmtMultiplier(quote.gsera.volume)} x streak {fmtMultiplier(quote.gsera.streak)}
                      {quote.gsera.capped ? `, capped at ${GSERA.compoundCap}x` : ""}. Credited when the gift arrives.{quote.swap ? " A swap-settled gift earns once, at the donor rate." : ""}
                    </span>
                  </span>
                ) : (
                  <span className="text-ink-muted">None. {quote.gsera.whyNot}</span>
                )
              }
            />
          </dl>
          <Notice tone="info" className="mt-4">
            Gifts are final. This goes to {cause.name}'s own address and cannot be taken back. Verification shows what has been checked, not whether the cause can use the money.
          </Notice>
          {error && <Notice tone="bad" className="mt-3">{error}</Notice>}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep(1)}>
              <ArrowLeft className="h-4 w-4" aria-hidden /> Change amount
            </Button>
            {user ? (
              <Button variant="give" size="lg" onClick={() => void confirm()} disabled={busy}>
                <WalletIcon className="h-4 w-4" aria-hidden /> Confirm in wallet
              </Button>
            ) : (
              <Button size="lg" onClick={() => void signIn()} disabled={signingIn}>
                {signingIn ? "Signing in" : "Sign in to give"}
              </Button>
            )}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="mt-8 flex flex-col items-center py-8 text-center">
          <span className="h-3 w-3 rounded-full bg-sera live-dot" aria-hidden />
          <p className="mt-4 font-display text-[20px] font-semibold">Confirm in your wallet</p>
          <p className="mt-1 text-[14.5px] text-ink-muted">{quote?.swap ? "Signing the Sera.cx swap intent, then the transfer." : "Signing the stablecoin transfer."}</p>
          <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-subtle">Mock wallet, no real transaction</p>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[200px_1fr]">
      <dt className="text-[13.5px] text-ink-muted">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

function SendDirectly({ cause }: { cause: Cause }) {
  const { copied, copy } = useCopy();
  return (
    <div className="rounded-2xl border border-rule bg-card p-5 sm:p-7">
      <h2 className="font-display text-[22px] font-semibold tracking-tight">Send to {cause.name}'s own address</h2>
      <p className="mt-2 text-[15px] leading-[1.55] text-ink-muted max-w-[58ch]">
        Send any supported stablecoin on Ethereum ({STABLECOINS.map((t) => t.symbol).join(", ")}) from any wallet or exchange. No sign-in needed. The gift shows on the cause's public record once it arrives
        {cause.treasury.policy === "auto" ? `, and is kept as ${cause.treasury.autoToken} through Sera.cx.` : "."}
      </p>
      <div className="mt-6 grid gap-6 sm:grid-cols-[auto_1fr] sm:items-start">
        <div className="rounded-xl border border-rule bg-white p-3 w-fit">
          <QrCode text={`ethereum:${cause.depositAddress}`} size={168} alt={`QR code for ${cause.name}'s address`} />
        </div>
        <div className="min-w-0">
          <Eyebrow>Ethereum address</Eyebrow>
          <p className="mt-1.5 break-all font-mono text-[14px] tnum">{cause.depositAddress}</p>
          <Button variant="outline" className="mt-3" onClick={() => void copy(cause.depositAddress)}>
            {copied ? <Check className="h-4 w-4 text-sera-text" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            {copied ? "Copied" : "Copy address"}
          </Button>
          <ul className="mt-4 space-y-1.5 text-[13.5px] text-ink-muted">
            <li>Ethereum mainnet only. Other networks will not arrive.</li>
            <li>Gifts are final once sent.</li>
            <li>gSera is credited to the sending wallet when it passes screening. Sign in with the same wallet to see it on your balance.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function ThankYou({ cause, receipt }: { cause: Cause; receipt: GiftReceipt }) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  const next = [
    `Your gift is at ${cause.name}'s own address${receipt.route === "swap" ? ` as ${receipt.received.amount.toLocaleString("en-GB")} ${receipt.received.token}` : ""}.`,
    receipt.gsera > 0 ? `${fmtGsera(receipt.gsera)} has been credited to your wallet.` : "No gSera on this gift.",
    "It is on the public record. Updates and receipts from the charity appear on the cause page.",
  ];
  return (
    <div className="container max-w-3xl py-8 md:py-12">
      <figure className="overflow-hidden rounded-2xl">
        <img src={cause.profile.image?.src} alt={cause.profile.image?.alt ?? cause.name} className="aspect-[16/9] w-full object-cover" />
        <figcaption className="mt-2">
          <PhotoCredit image={cause.profile.image} />
        </figcaption>
      </figure>
      <Eyebrow className="mt-6">Thank you</Eyebrow>
      <h1 className="mt-2 font-display text-[32px] font-semibold leading-[1.05] tracking-[-0.025em] sm:text-[40px]">
        Thank you. Your gift is with <em>{cause.name}</em>.
      </h1>
      <p className="mt-3 font-mono text-[14px] tnum text-ink-muted">
        {fmtInt(receipt.amount)} {receipt.token} ({fmtUsd(receipt.usd, { cents: true })})
      </p>
      <h2 className="mt-8 font-display text-[18px] font-semibold">What happens next</h2>
      <ol className="mt-2 space-y-2 text-[15px] text-ink-muted">
        {next.map((n, i) => (
          <li key={i} className="flex gap-3">
            <span className="font-mono text-[12px] text-ink-subtle mt-1">{i + 1}</span>
            {n}
          </li>
        ))}
      </ol>
      <div className="mt-8 rounded-2xl p-5" style={{ background: "var(--give)", color: "var(--give-foreground)" }}>
        <p className="font-display text-[18px] font-semibold">Tell someone about {cause.name}</p>
        <p className="mt-1 text-[14px] opacity-90">A share link with the cause photo, name and status.</p>
        <div className="mt-3 [&_a]:bg-white [&_a]:text-[#0B1426] [&_a]:border-transparent [&_button]:bg-white [&_button]:text-[#0B1426] [&_button]:border-transparent">
          <ShareButtons causeId={cause.id} slug={cause.slug} name={cause.name} />
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button asChild variant="outline">
          <Link href={causeHref(cause.id, cause.slug)}>Back to {cause.name}</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/me">
            <ArrowRightLeft className="h-4 w-4" aria-hidden /> My gSera
          </Link>
        </Button>
        <a href={`${EXPLORER}${receipt.txHash}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-[11px] text-ink-subtle hover:text-ink">
          tx {shortAddress(receipt.txHash)} <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </div>
    </div>
  );
}
