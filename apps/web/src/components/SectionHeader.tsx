import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Eyebrow } from "./Eyebrow";

/**
 * Kicker, headline, lede and an optional action. `level` sets the heading
 * rank: 1 when this is the page's own heading, 2 for a section inside a page.
 * One h1 per page, so only one SectionHeader on a page may take level 1.
 */
export function SectionHeader({
  kicker,
  title,
  lede,
  action,
  className,
  size = "md",
  level = 2,
  id,
}: {
  kicker?: string;
  title: ReactNode;
  lede?: ReactNode;
  action?: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
  level?: 1 | 2 | 3;
  id?: string;
}) {
  const h = size === "lg" ? "text-[34px] sm:text-[44px] md:text-[54px] leading-[1.02]" : size === "sm" ? "text-[22px] sm:text-[26px] leading-[1.15]" : "text-[28px] sm:text-[34px] md:text-[40px] leading-[1.08]";
  const Heading = (level === 1 ? "h1" : level === 3 ? "h3" : "h2") as "h1" | "h2" | "h3";
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      {/* The headline may run wider than the measure because display type is
          scanned, not read, and so may the lede: a page introduction of one
          to three lines is not long-form reading. The cap here only stops a
          headline from running the whole 1100px of the container, and it is
          wide enough to leave the lede measure in charge of the lede. */}
      <div className="min-w-0 max-w-[46rem]">
        {kicker && <Eyebrow className="mb-3">{kicker}</Eyebrow>}
        <Heading id={id} className={cn("font-display font-semibold tracking-[-0.025em]", h)}>
          {title}
        </Heading>
        {lede && <p className="mt-3 measure-lede text-[16px] sm:text-[17px] leading-[1.55] text-ink-muted">{lede}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
