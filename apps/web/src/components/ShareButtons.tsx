/* Share row: WhatsApp, Telegram, X, Facebook, copy link. Records share counts. */
import { Check, Link2 } from "lucide-react";
import { useCopy } from "@/hooks/useCopy";
import { recordShare } from "@/lib/api";
import { SITE_ORIGIN } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function shareUrlFor(id: number, slug: string) {
  return `${SITE_ORIGIN}/c/${id}-${slug}`;
}

const CHANNELS = (url: string, text: string) => [
  { id: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}` },
  { id: "telegram", label: "Telegram", href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}` },
  { id: "x", label: "X", href: `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}` },
  { id: "facebook", label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
];

export function ShareButtons({ causeId, slug, name, className, size = "sm" }: { causeId: number; slug: string; name: string; className?: string; size?: "sm" | "md" }) {
  const url = shareUrlFor(causeId, slug);
  const text = `Give to ${name} in stablecoins on causes.sera.cx`;
  const { copied, copy } = useCopy();
  const btn = cn("inline-flex items-center gap-1.5 rounded-full border border-rule bg-card font-sans font-medium text-ink hover:border-ink/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", size === "sm" ? "h-9 min-h-11 px-3.5 text-[13px] sm:min-h-9" : "h-11 px-4 text-[14.5px]");
  return (
    <div className={cn("flex flex-wrap gap-2", className)} role="group" aria-label={`Share ${name}`}>
      {CHANNELS(url, text).map((c) => (
        <a key={c.id} href={c.href} target="_blank" rel="noopener noreferrer" className={btn} onClick={() => void recordShare(causeId, c.id)}>
          {c.label}
        </a>
      ))}
      <button type="button" className={btn} onClick={() => { void copy(url); void recordShare(causeId, "copy"); }} aria-live="polite">
        {copied ? <Check className="h-4 w-4 text-sera-text" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
