import { cn } from "@/lib/utils";

/** The "x of 4 checks" mini bar shown on every card. */
export function ChecksBar({ done, total, className, showLabel = true }: { done: number; total: number; className?: string; showLabel?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", className)} role="img" aria-label={`${done} of ${total} checks done`}>
      {/* In a narrow card the five dots and the label together came to a few
          pixels more than the room there was, and the label broke over two
          lines. The label is four short words, so it stays on one line and
          the dots give way instead, wrapping to a second row if they must. */}
      <div className="flex min-w-0 flex-wrap gap-1" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={cn("h-1.5 w-6 rounded-full", i < done ? "bg-sera-deep dark:bg-sera" : "bg-ink/15")} />
        ))}
      </div>
      {showLabel && (
        <span className="whitespace-nowrap font-mono text-[11px] text-ink-muted tnum">
          {done} of {total} checks
        </span>
      )}
    </div>
  );
}
