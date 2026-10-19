import { ArrowRight, Flame } from "lucide-react";
import { Link } from "wouter";
import { causeHref } from "@/lib/rules";
import type { CauseCardData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { ChecksBar } from "./ChecksBar";
import { StatusPill } from "./StatusPill";

/** Cause card per brief 10.2. Photo 16:10, category, pill, name, place, summary, checks bar, Give, Read more. */
export function CauseCard({ cause, className, compact }: { cause: CauseCardData; className?: string; compact?: boolean }) {
  const href = causeHref(cause.id, cause.slug);
  const canGive = cause.stage !== "paused" && cause.stage !== "closed";
  return (
    <article className={cn("group flex flex-col overflow-hidden rounded-xl border border-rule bg-card", className)}>
      <Link href={href} className="relative block aspect-[16/10] overflow-hidden bg-paper-warm focus-visible:outline-2 focus-visible:outline-ring" aria-label={`${cause.name}, read more`}>
        <img src={cause.image?.src ?? "/photos/hero.jpg"} alt={cause.image?.alt ?? cause.name} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-white/90 px-2 h-6 inline-flex items-center font-mono text-[10.5px] uppercase tracking-[0.1em] text-[#0B1426]">{cause.category}</span>
          {cause.urgent && (
            <span className="rounded-full bg-[#0B1426] px-2 h-6 inline-flex items-center gap-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-[#00E676]">
              <Flame className="h-3 w-3" aria-hidden /> Urgent appeal
            </span>
          )}
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <StatusPill stage={cause.stage} checksDone={cause.checksDone} checksTotal={cause.checksTotal} />
        <h3 className="mt-2.5 font-display text-[18px] font-semibold leading-[1.2] tracking-tight">
          <Link href={href} className="hover:text-sera-text focus-visible:outline-2 focus-visible:outline-ring rounded-sm">
            {cause.name}
          </Link>
        </h3>
        <p className="mt-0.5 font-mono text-[11.5px] text-ink-subtle">{[cause.town, cause.state].filter(Boolean).join(", ") || "Malaysia"}</p>
        {!compact && <p className="mt-2 text-[14.5px] leading-[1.5] text-ink-muted line-clamp-3">{cause.summary}</p>}
        <div className="mt-auto pt-4 flex items-center justify-between gap-3">
          <ChecksBar done={cause.checksDone} total={cause.checksTotal} />
        </div>
        <div className="mt-3 flex items-center gap-3">
          {canGive ? (
            <Button asChild variant="give" size="sm">
              <Link href={`/give/${cause.id}`}>Give</Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Not taking gifts
            </Button>
          )}
          <Link href={href} className="inline-flex items-center gap-1 text-[13.5px] font-medium text-ink hover:text-sera-text rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
            Read more <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </article>
  );
}

export function CauseCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-rule bg-card animate-pulse" aria-hidden>
      <div className="aspect-[16/10] bg-ink/10" />
      <div className="p-4 space-y-3">
        <div className="h-6 w-24 rounded-full bg-ink/10" />
        <div className="h-5 w-3/4 rounded bg-ink/10" />
        <div className="h-4 w-full rounded bg-ink/10" />
        <div className="h-9 w-20 rounded-full bg-ink/10" />
      </div>
    </div>
  );
}
