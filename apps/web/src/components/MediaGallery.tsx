/* Photos plus embeddable video links. Embeds are click-to-load so no third
   party script or cookie loads until the visitor asks for it. The player URL
   comes from the API (shared `embedFor`), never rebuilt here. */
import { ExternalLink, Play } from "lucide-react";
import { useState } from "react";
import { EMBED_PROVIDERS } from "@sera-causes/shared";
import { imageUrl } from "@/lib/images";
import type { MediaView } from "@/lib/types";
import { cn } from "@/lib/utils";

export function providerLabel(provider: string | undefined): string {
  return EMBED_PROVIDERS.find((p) => p.provider === provider)?.label ?? "Embedded video";
}

function VideoTile({ item }: { item: MediaView }) {
  const [loaded, setLoaded] = useState(false);
  const src = item.embedUrl;
  const label = providerLabel(item.provider);
  const title = item.caption || `Video on ${label}`;
  if (loaded && src) {
    return (
      <div className="overflow-hidden rounded-xl border border-rule bg-black aspect-video">
        <iframe src={src} title={title} className="h-full w-full" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" />
      </div>
    );
  }
  return (
    <div className="relative overflow-hidden rounded-xl border border-rule bg-[#0B1426] aspect-video text-white">
      <div className="relative flex h-full flex-col items-start justify-between p-4">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/60">{label}</span>
        <div>
          <p className="font-display text-[16px] font-semibold leading-tight">{title}</p>
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

export function MediaGallery({ items, className }: { items: MediaView[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <ul className={cn("grid gap-4 sm:grid-cols-2", className)}>
      {items.map((m) => (
        <li key={m.id}>
          {m.kind === "photo" ? (
            <figure>
              <div className="overflow-hidden rounded-xl border border-rule bg-paper-warm aspect-video">
                <img src={imageUrl(m.url)} alt={m.caption} loading="lazy" className="h-full w-full object-cover" />
              </div>
              <figcaption className="mt-1.5 text-[13px] text-ink-muted">
                <span>{m.caption || "Photo"}</span>
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
