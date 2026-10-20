/**
 * The three states every list and every detail page has to show clearly:
 * still loading, loaded with nothing in it, and failed. An empty database is
 * the normal first run here, and the API can be down, so neither case may
 * leave a reader staring at the word "Loading".
 */
import { CircleAlert, RotateCcw } from "lucide-react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

export function Empty({ title, body, className, children }: { title: string; body?: string; className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-dashed border-rule bg-paper-warm/60 px-5 py-8 text-center", className)}>
      <p className="font-display text-[17px] font-semibold">{title}</p>
      {body && <p className="mt-1 text-[14.5px] text-ink-muted measure mx-auto">{body}</p>}
      {children && <div className="mt-4 flex flex-wrap justify-center gap-3">{children}</div>}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-10 text-ink-muted" role="status" aria-live="polite">
      <span className="h-2 w-2 rounded-full bg-sera live-dot" aria-hidden />
      <span className="text-[14px]">{label}</span>
    </div>
  );
}

/**
 * Plain English for whatever the query threw. The reader does not need the
 * status code, only whether to try again or to stop trying.
 */
export function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return "We could not reach the server. Your connection may be down, or the server may be busy.";
    if (error.status === 408) return "The server took too long to answer. It may be busy.";
    if (error.status === 401 || error.status === 403) return "You are not signed in, or this is not yours to see.";
    if (error.status === 404) return "That is not here any more.";
    if (error.status >= 500) return "The server had a problem. It is not something you did.";
    return error.message || "Something went wrong.";
  }
  // Anything that is not an ApiError is a bug on our side, and its message is
  // written for us, not for a reader. Say something true and useful instead.
  return "Something went wrong at our end. Try again, and tell us at security@sera.cx if it keeps happening.";
}

/**
 * A failed fetch. Always says something went wrong and always offers a
 * retry, so the reader is never left wondering whether it is still working.
 */
export function ErrorState({
  title = "Something went wrong",
  error,
  onRetry,
  retryLabel = "Try again",
  className,
  children,
}: {
  title?: string;
  error?: unknown;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-xl border border-[var(--pill-red-fg)]/30 bg-[var(--pill-red-bg)] px-5 py-6", className)} role="alert">
      <div className="flex gap-3">
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--pill-red-fg)]" aria-hidden />
        <div className="min-w-0">
          <p className="font-display text-[17px] font-semibold text-[var(--pill-red-fg)]">{title}</p>
          <p className="mt-1 text-[14.5px] text-[var(--pill-red-fg)] measure">{errorText(error)}</p>
          {(onRetry || children) && (
            <div className="mt-4 flex flex-wrap gap-3">
              {onRetry && (
                <Button size="sm" variant="outline" onClick={onRetry}>
                  <RotateCcw className="h-4 w-4" aria-hidden /> {retryLabel}
                </Button>
              )}
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** A grey block the shape of the content that is coming. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-ink/10", className)} aria-hidden />;
}

/** Placeholder rows for a list that is still loading. */
export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("divide-y divide-rule border-y border-rule", className)} role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-3.5">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-4 w-14 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "warn" | "good" | "bad"; children: React.ReactNode; className?: string }) {
  const tones = {
    info: "border-rule bg-paper-warm text-ink",
    warn: "border-[var(--pill-amber-fg)]/30 bg-[var(--pill-amber-bg)] text-[var(--pill-amber-fg)]",
    good: "border-[var(--pill-green-fg)]/30 bg-[var(--pill-green-bg)] text-[var(--pill-green-fg)]",
    bad: "border-[var(--pill-red-fg)]/30 bg-[var(--pill-red-bg)] text-[var(--pill-red-fg)]",
  };
  return <div className={cn("rounded-lg border px-4 py-3 text-[14.5px] leading-[1.5]", tones[tone], className)}>{children}</div>;
}
