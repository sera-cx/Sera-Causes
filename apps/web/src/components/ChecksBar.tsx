import { cn } from "@/lib/utils";

/** The "x of 4 checks" mini bar shown on every card. */
export function ChecksBar({ done, total, className, showLabel = true }: { done: number; total: number; className?: string; showLabel?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", className)} role="img" aria-label={`${done} of ${total} checks done`}>
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={cn("h-1.5 w-6 rounded-full", i < done ? "bg-sera-deep dark:bg-sera" : "bg-ink/15")} />
        ))}
      </div>
      {showLabel && (
        <span className="font-mono text-[11px] text-ink-muted tnum">
          {done} of {total} checks
        </span>
      )}
    </div>
  );
}
