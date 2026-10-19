import { cn } from "@/lib/utils";

export function Empty({ title, body, className, children }: { title: string; body?: string; className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-dashed border-rule bg-paper-warm/60 px-5 py-8 text-center", className)}>
      <p className="font-display text-[17px] font-semibold">{title}</p>
      {body && <p className="mt-1 text-[14.5px] text-ink-muted max-w-[48ch] mx-auto">{body}</p>}
      {children && <div className="mt-4 flex justify-center">{children}</div>}
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

export function Notice({ tone = "info", children, className }: { tone?: "info" | "warn" | "good" | "bad"; children: React.ReactNode; className?: string }) {
  const tones = {
    info: "border-rule bg-paper-warm text-ink",
    warn: "border-[var(--pill-amber-fg)]/30 bg-[var(--pill-amber-bg)] text-[var(--pill-amber-fg)]",
    good: "border-[var(--pill-green-fg)]/30 bg-[var(--pill-green-bg)] text-[var(--pill-green-fg)]",
    bad: "border-[var(--pill-red-fg)]/30 bg-[var(--pill-red-bg)] text-[var(--pill-red-fg)]",
  };
  return <div className={cn("rounded-lg border px-4 py-3 text-[14.5px] leading-[1.5]", tones[tone], className)}>{children}</div>;
}
