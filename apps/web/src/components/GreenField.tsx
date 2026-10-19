/* Green Field, the sera.cx house style for anything that shows numbers.
   Full-bleed Sera.cx green, near-black cards floating on it, white
   monospaced figures, bright green tickers, mint tertiary, signal only for
   alerts. One mono number per card, at most two supporting stats, a slim
   footer bar per card, single-colour wordmark. Never a serif on a stat card. */
import { cn } from "@/lib/utils";

export function GreenField({ children, className, title, kicker, footer = true }: { children: React.ReactNode; className?: string; title?: React.ReactNode; kicker?: string; footer?: boolean }) {
  return (
    <section className={cn("green-field", className)}>
      <div className="container py-10 md:py-14">
        {(kicker || title) && (
          <div className="mb-6 md:mb-8">
            {kicker && <div className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[#06120C]">{kicker}</div>}
            {title && <h2 className="mt-1.5 font-display text-[26px] sm:text-[32px] md:text-[38px] font-bold leading-[1.05] tracking-[-0.03em] text-[#06120C] max-w-[18ch]">{title}</h2>}
          </div>
        )}
        {children}
        {footer && (
          <div className="mt-8 flex items-center justify-between gap-4">
            <img src="/brand/wordmark/sera-wordmark-black.svg" alt="Sera.cx" className="h-[18px] w-auto" draggable={false} />
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[rgba(6,18,12,0.6)]">Care Share Donate</span>
          </div>
        )}
      </div>
    </section>
  );
}

export type GfMeta = { label: string; value: string };

export function GfCard({ label, ticker, figure, meta, tab = "#00D26A", className, alert }: { label: string; ticker?: string; figure: string; meta?: [GfMeta?, GfMeta?]; tab?: string; className?: string; alert?: string }) {
  const metas = (meta ?? []).filter((m): m is GfMeta => !!m).slice(0, 2);
  return (
    <div className={cn("gf-card", className)}>
      <div className="h-[5px]" style={{ background: tab }} />
      <div className="px-[18px] pt-4 pb-3.5">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/55">{label}</div>
        {ticker && <div className="mt-[3px] font-mono text-[12px] font-bold tracking-[0.06em] text-[#00E676]">{ticker}</div>}
        <div className="mt-2.5 font-mono text-[28px] sm:text-[30px] font-bold leading-none tracking-[-0.02em] text-white tnum break-words">{figure}</div>
        {(metas.length > 0 || alert) && (
          <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-2">
            {metas.map((m) => (
              <div key={m.label}>
                <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/45">{m.label}</div>
                <div className="mt-0.5 font-mono text-[13px] text-white tnum">{m.value}</div>
              </div>
            ))}
            {alert && <div className="font-mono text-[11px] font-bold text-[#E35420]">{alert}</div>}
          </div>
        )}
      </div>
      <div className="flex h-[7px]" aria-hidden>
        {[["#00D26A", 3], ["#1B7A3F", 1], ["#59E39A", 2], ["#00E676", 1], ["#FFFFFF", 1]].map(([c, f], i) => (
          <div key={i} style={{ flex: f as number, background: c as string }} />
        ))}
      </div>
    </div>
  );
}
