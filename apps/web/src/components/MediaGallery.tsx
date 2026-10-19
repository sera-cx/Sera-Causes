/* Photos plus embeddable video links. Embeds are click-to-load so no third
   party script or cookie loads until the visitor asks for it. */
import { ExternalLink, Play } from "lucide-react";
import { useState } from "react";
import type { MediaItem } from "@/lib/types";
import { cn } from "@/lib/utils";

const PROVIDER_LABEL: Record<NonNullable<MediaItem["provider"]>, string> = { youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", x: "X", other: "Embedded video" };

function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1) || null;
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    const m = u.pathname.match(/\/(embed|shorts)\/([^/]+)/);
    return m?.[2] ?? null;
  } catch {
    return null;
  }
}

function embedSrc(item: MediaItem): string | null {
  switch (item.provider) {
    case "youtube": {
      const id = youtubeId(item.url);
      return id ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1` : null;
    }
    case "tiktok": {
      const m = item.url.match(/\/video\/(\d+)/);
      return m ? `https://www.tiktok.com/embed/v2/${m[1]}` : null;
    }
    case "instagram": {
      const m = item.url.match(/instagram\.com\/(p|reel)\/([^/?]+)/);
      return m ? `https://www.instagram.com/${m[1]}/${m[2]}/embed` : null;
    }
    case "x": {
      const m = item.url.match(/status\/(\d+)/);
      return m ? `https://platform.twitter.com/embed/Tweet.html?id=${m[1]}&dnt=true` : null;
    }
    default:
      return null;
  }
}

function VideoTile({ item }: { item: MediaItem }) {
  const [loaded, setLoaded] = useState(false);
  const src = embedSrc(item);
  const label = PROVIDER_LABEL[item.provider ?? "other"];
  if (loaded && src) {
    return (
      <div className="overflow-hidden rounded-xl border border-rule bg-black aspect-video">
        <iframe src={src} title={item.title} className="h-full w-full" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" />
      </div>
    );
  }
  return (
    <div className="relative overflow-hidden rounded-xl border border-rule bg-[#0B1426] aspect-video text-white">
      {item.thumbnail && <img src={item.thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />}
      <div className="relative flex h-full flex-col items-start justify-between p-4">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/60">{label}</span>
        <div>
          <p className="font-display text-[16px] font-semibold leading-tight">{item.title}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {src ? (
              <button type="button" onClick={() => setLoaded(true)} className="inline-flex h-9 items-center gap-2 rounded-full bg-sera px-4 text-[13px] font-semibold text-[#06120C] hover:bg-[#00E676] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00E676]">
                <Play className="h-4 w-4" aria-hidden /> Load from {label}
              </button>
            ) : null}
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/30 px-3.5 text-[13px] font-medium text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00E676]">
              Open on {label} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </div>
          <p className="mt-2 font-mono text-[10px] text-white/50">Nothing loads from {label} until you ask.</p>
        </div>
      </div>
    </div>
  );
}

export function MediaGallery({ items, className }: { items: MediaItem[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <ul className={cn("grid gap-4 sm:grid-cols-2", className)}>
      {items.map((m) => (
        <li key={m.id}>
          {m.kind === "photo" ? (
            <figure>
              <div className="overflow-hidden rounded-xl border border-rule bg-paper-warm aspect-video">
                <img src={m.url} alt={m.alt ?? m.title} loading="lazy" className="h-full w-full object-cover" />
              </div>
              <figcaption className="mt-1.5 text-[13px] text-ink-muted">
                <span>{m.title}</span>
                {m.credit && <span className="block font-mono text-[10.5px] text-ink-subtle">Photo: {m.credit}</span>}
              </figcaption>
            </figure>
          ) : (
            <VideoTile item={m} />
          )}
        </li>
      ))}
    </ul>
  );
}
