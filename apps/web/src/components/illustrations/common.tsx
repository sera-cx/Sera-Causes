/* Shared house style for the hand-drawn illustrations.
   ------------------------------------------------------------------
   Rules that keep the set reading as one family:
   - Line art only. Strokes use var(--ink), fills use var(--paper) and
     var(--paper-warm-deep). No hex anywhere, so every drawing flips with
     the colour scheme on its own.
   - Sera.cx green is the subject of a scene, never decoration: the gift,
     the tick, the thing that moves. Solid green shapes use var(--sera);
     anything green that has to be read as a line or a letter uses
     var(--sera-text), which passes contrast on paper in both schemes.
   - A dotted green trace means "this is being read" or "this is on its
     way". It is the only animatable-looking element and it is always
     backed up by the caption and the aria-label.
   - Every drawing scales from its viewBox, so nothing breaks at 360px.
*/
import type { CSSProperties, ReactNode, SVGProps } from "react";
import { cn } from "@/lib/utils";

export type IllustrationProps = { className?: string; style?: CSSProperties };

/** The main drawn line: ink, round ends, one weight across the whole set. */
export const line = {
  fill: "none",
  stroke: "var(--ink)",
  strokeWidth: 2.4,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const satisfies SVGProps<SVGGElement>;

/** Thinner ink for structure that should sit behind the subject. */
export const thin = {
  fill: "none",
  stroke: "var(--ink)",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const satisfies SVGProps<SVGGElement>;

/** Texture: the squiggles that stand in for writing on a page. */
export const hint = {
  fill: "none",
  stroke: "var(--ink-subtle)",
  strokeWidth: 2,
  strokeLinecap: "round",
} as const satisfies SVGProps<SVGGElement>;

/** Dotted green: something being read, or something on its way. */
export const trace = {
  fill: "none",
  stroke: "var(--sera-text)",
  strokeWidth: 2.4,
  strokeLinecap: "round",
  strokeDasharray: "0.1 8",
} as const satisfies SVGProps<SVGGElement>;

/** A tick, drawn heavy enough to read at 360px. */
export const tick = {
  fill: "none",
  stroke: "var(--sera-text)",
  strokeWidth: 5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const satisfies SVGProps<SVGGElement>;

export const PAPER = "var(--paper)";
export const DEEP = "var(--paper-warm-deep)";
export const GREEN = "var(--sera)";

/**
 * Frame for a scene: a warm or carded surface, the drawing capped so it
 * never swells past a comfortable size on a wide monitor, and a short
 * mono caption that says the same thing the drawing says.
 */
export function Figure({
  children,
  caption,
  tone = "warm",
  cap = "max-w-[560px]",
  className,
}: {
  children: ReactNode;
  caption?: ReactNode;
  tone?: "warm" | "card" | "plain";
  cap?: string;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        "overflow-hidden rounded-2xl px-4 py-6 sm:px-6 sm:py-8",
        tone === "warm" && "bg-paper-warm",
        tone === "card" && "border border-rule bg-card",
        className,
      )}
    >
      <div className={cn("mx-auto w-full", cap)}>{children}</div>
      {/* The caption takes the width of the drawing it belongs to, not a
          reading measure. It is one short line of mono uppercase, so a cap
          of its own only broke it over two lines under a far wider figure. */}
      {caption && <figcaption className={cn("mx-auto mt-5 w-full text-balance text-center font-mono text-[11px] leading-[1.5] uppercase tracking-[0.1em] text-ink-muted", cap)}>{caption}</figcaption>}
    </figure>
  );
}
