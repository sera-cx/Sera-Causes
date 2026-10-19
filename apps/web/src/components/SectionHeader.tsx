import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Eyebrow } from "./Eyebrow";

export function SectionHeader({ kicker, title, lede, action, className, size = "md" }: { kicker?: string; title: ReactNode; lede?: ReactNode; action?: ReactNode; className?: string; size?: "sm" | "md" | "lg" }) {
  const h = size === "lg" ? "text-[34px] sm:text-[44px] md:text-[54px] leading-[1.02]" : size === "sm" ? "text-[22px] sm:text-[26px] leading-[1.15]" : "text-[28px] sm:text-[34px] md:text-[40px] leading-[1.08]";
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="max-w-[60ch]">
        {kicker && <Eyebrow className="mb-3">{kicker}</Eyebrow>}
        <h2 className={cn("font-display font-semibold tracking-[-0.025em]", h)}>{title}</h2>
        {lede && <p className="mt-3 text-[16px] sm:text-[17px] leading-[1.55] text-ink-muted">{lede}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
