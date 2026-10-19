import { ArrowLeft, Check, Copy, Printer } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "wouter";
import { Spinner } from "@/components/Empty";
import { Eyebrow } from "@/components/Eyebrow";
import { QrCode } from "@/components/QrCode";
import { ShareButtons, shareUrlFor } from "@/components/ShareButtons";
import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/hooks/useCopy";
import { useSeo } from "@/hooks/useSeo";
import { API_URL, recordShare } from "@/lib/api";
import { SITE_ORIGIN } from "@/lib/constants";
import { fmtUsd } from "@/lib/format";
import { causeImage } from "@/lib/images";
import { useCause } from "@/lib/queries";
import { causeHref } from "@/lib/rules";
import type { CauseDetail } from "@/lib/types";
import { NotFoundPage } from "./NotFound";

export function SharePage() {
  const { id = "" } = useParams<{ id: string }>();
  const q = useCause(Number.parseInt(id, 10));
  const cause = q.data;
  useSeo(cause ? `Share ${cause.name}` : "Share");
  if (q.isLoading) return <div className="container"><Spinner /></div>;
  if (!cause) return <NotFoundPage />;
  return <ShareTools cause={cause} />;
}

function ShareTools({ cause }: { cause: CauseDetail }) {
  const url = shareUrlFor(cause.id, cause.slug);
  const { copied, copy } = useCopy();
  return (
    <div className="container max-w-4xl py-8 md:py-12">
      <Link href={causeHref(cause.id, cause.slug)} className="inline-flex items-center gap-1.5 text-[14px] text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {cause.name}
      </Link>
      <Eyebrow className="mt-4">Share</Eyebrow>
      <h1 className="mt-1 font-display text-[30px] font-semibold leading-tight tracking-tight sm:text-[38px]">Share {cause.name}.</h1>
      <p className="mt-2 text-[16px] text-ink-muted max-w-[58ch]">A link with a preview card, buttons for chat apps, a button for any website, and a poster with a QR code to the cause's page and address.</p>

      <section className="mt-10" aria-labelledby="link-h">
        <h2 id="link-h" className="font-display text-[22px] font-semibold tracking-tight">Link</h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <code className="flex-1 min-w-0 truncate rounded-md border border-rule bg-paper-warm px-3 py-2.5 font-mono text-[13.5px]">{url}</code>
          <Button variant="outline" onClick={() => { void copy(url); void recordShare(cause.id, "copy"); }}>
            {copied ? <Check className="h-4 w-4 text-sera-text" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
        <ShareButtons causeId={cause.id} slug={cause.slug} name={cause.name} className="mt-4" size="md" />
        <OgPreview cause={cause} />
      </section>

      <EmbedSnippet cause={cause} />

      <section className="mt-12" aria-labelledby="poster-h">
        <h2 id="poster-h" className="font-display text-[22px] font-semibold tracking-tight">QR poster</h2>
        <p className="mt-1.5 text-[15px] text-ink-muted max-w-[58ch]">A4, with the cause photo, name, a QR code to the page and the cause's own address. Print it or save it as a PDF from the print dialog.</p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="rounded-xl border border-rule bg-white p-2 w-fit">
            <QrCode text={url} size={120} alt={`QR code linking to ${cause.name}`} />
          </div>
          <Button asChild>
            <Link href={`/c/${cause.id}/poster`}>
              <Printer className="h-4 w-4" aria-hidden /> Open the poster
            </Link>
          </Button>
          {API_URL && (
            <Button asChild variant="outline">
              <a href={cause.posterUrl} target="_blank" rel="noopener noreferrer">
                A4 PDF from the API
              </a>
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}

function OgPreview({ cause }: { cause: CauseDetail }) {
  if (API_URL) {
    return (
      <div className="mt-6">
        <Eyebrow>Preview card (how the link looks in chat apps)</Eyebrow>
        <div className="mt-2 max-w-md overflow-hidden rounded-xl border border-rule bg-card">
          <img src={cause.ogImageUrl} alt={`Preview card for ${cause.name}`} className="aspect-[1200/630] w-full object-cover bg-paper-warm" />
          <div className="px-4 py-2.5 font-mono text-[11px] text-ink-subtle">causes.sera.cx</div>
        </div>
        <p className="mt-2 text-[12.5px] text-ink-muted">Rendered by the API at /og/cause/{cause.id}.png.</p>
      </div>
    );
  }
  return (
    <div className="mt-6">
      <Eyebrow>Preview card (how the link looks in chat apps)</Eyebrow>
      <div className="mt-2 max-w-md overflow-hidden rounded-xl border border-rule bg-card">
        <div className="relative aspect-[1200/630] bg-paper-warm">
          <img src={causeImage(cause).src} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0B1426]/90 to-transparent p-4 pt-10 text-white">
            <div className="flex items-center gap-2">
              <StatusPill stage={cause.stage} checksDone={cause.checksDone} checksTotal={cause.checksTotal} />
              <span className="font-mono text-[11px] tnum text-white/80">{fmtUsd(Number(cause.givenUsd))} given</span>
            </div>
            <p className="mt-2 font-display text-[20px] font-semibold leading-tight">{cause.name}</p>
            <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#00E676]">Give in stablecoins on causes.sera.cx</p>
          </div>
        </div>
        <div className="px-4 py-2.5 font-mono text-[11px] text-ink-subtle">causes.sera.cx</div>
      </div>
      <p className="mt-2 text-[12.5px] text-ink-muted">Rendered server-side as /og/cause/{cause.id}.png once the API is live. This is a mock of the same layout.</p>
    </div>
  );
}

function EmbedSnippet({ cause }: { cause: CauseDetail }) {
  const [tab, setTab] = useState<"script" | "iframe">("iframe");
  const { copied, copy } = useCopy();
  const embedSrc = API_URL ? cause.embedUrl : `${SITE_ORIGIN}/embed/give/${cause.id}`;
  const scriptSrc = API_URL ? `${API_URL}/embed.js` : `${SITE_ORIGIN}/embed.js`;
  const iframe = `<iframe src="${embedSrc}" title="Give to ${cause.name} on Sera.cx" width="360" height="120" style="border:0;overflow:hidden" loading="lazy"></iframe>`;
  const script = `<div data-sera-give="${cause.id}"></div>\n<script async src="${scriptSrc}"></script>`;
  const code = tab === "iframe" ? iframe : script;
  return (
    <section className="mt-12" aria-labelledby="embed-h">
      <h2 id="embed-h" className="font-display text-[22px] font-semibold tracking-tight">Give button for your website</h2>
      <p className="mt-1.5 text-[15px] text-ink-muted max-w-[58ch]">Paste this where you want a Sera.cx-branded "Give to {cause.name}" button. It opens the give flow on causes.sera.cx.</p>
      <div className="mt-4 grid gap-5 md:grid-cols-2">
        <div>
          <div className="flex gap-1 border-b border-rule" role="tablist" aria-label="Snippet type">
            {(["iframe", "script"] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-3 py-2 font-mono text-[12.5px] ${tab === t ? "border-sera text-ink" : "border-transparent text-ink-muted"}`}>
                {t === "iframe" ? "iframe" : "script tag"}
              </button>
            ))}
          </div>
          <pre className="mt-3 overflow-x-auto rounded-md border border-rule bg-paper-warm p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-all"><code>{code}</code></pre>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => { void copy(code); void recordShare(cause.id, "embed"); }}>
            {copied ? <Check className="h-4 w-4 text-sera-text" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            {copied ? "Copied" : "Copy snippet"}
          </Button>
        </div>
        <div>
          <Eyebrow>Preview</Eyebrow>
          <div className="mt-2 rounded-xl border border-dashed border-rule p-4 bg-paper-warm/50">
            <iframe src={API_URL ? cause.embedUrl : `/embed/give/${cause.id}`} title={`Give to ${cause.name} on Sera.cx, preview`} width="360" height="120" style={{ border: 0, maxWidth: "100%" }} />
          </div>
        </div>
      </div>
    </section>
  );
}
