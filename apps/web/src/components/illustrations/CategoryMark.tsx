/* Small marks for the twelve cause categories.
   One weight, one grid, no fills except a couple of 0.8 radius dots, so a
   row of them reads as a set at 24 to 32px. They take their colour from
   `currentColor`, which is already a brand token wherever they are used,
   so they follow light and dark without a second rule. */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { IllustrationProps } from "./common";

const MARKS: Record<string, { label: string; art: ReactNode }> = {
  turtles: {
    label: "Turtles",
    art: (
      <>
        <ellipse cx="12" cy="12.4" rx="6.2" ry="5.4" />
        <path d="M18.1 10.8 c2.1 -0.4 3.6 0.6 3.6 1.8 s-1.5 2.2 -3.6 1.8" />
        <path d="M7.4 8.6 C 5.4 6, 2.6 5.2, 2.2 6.6 C 1.8 8, 3.6 9.4, 6.2 10" />
        <path d="M7.4 16.2 C 5.4 18.8, 2.6 19.6, 2.2 18.2 C 1.8 16.8, 3.6 15.4, 6.2 14.8" />
        <path d="M16.6 8.8 C 17.8 6.8, 19.2 5.8, 20 6.6" />
        <path d="M16.6 16 C 17.8 18, 19.2 19, 20 18.2" />
        <path d="M8.4 12.2 C 9.6 10.2, 14.4 10.2, 15.6 12.2" />
        <path d="M8.6 14.4 C 10 13, 14 13, 15.4 14.4" />
      </>
    ),
  },
  marine: {
    label: "Marine",
    art: (
      <>
        <path d="M6.6 9.4 c2.6 -3.1 7.3 -3.1 9.9 0 c-2.6 3.1 -7.3 3.1 -9.9 0 Z" />
        <path d="M16.5 9.4 l3.4 -2.5 v5 Z" />
        <circle cx="9.4" cy="9.4" r="0.85" fill="currentColor" stroke="none" />
        <path d="M2.6 17.6 c1.8 -1.9 3.7 -1.9 5.5 0 c1.8 1.9 3.7 1.9 5.5 0 c1.8 -1.9 3.7 -1.9 5.5 0" />
      </>
    ),
  },
  wildlife: {
    label: "Wildlife",
    art: (
      <>
        <ellipse cx="8.4" cy="15.8" rx="5" ry="3.4" transform="rotate(-35 8.4 15.8)" />
        <circle cx="14" cy="8.4" r="4.2" />
        <path d="M17.8 7.2 L22 8.8 L18 11 Z" />
        <path d="M16.4 5.2 C 18.6 4.8, 20.6 5.6, 21.4 6.6" />
        <path d="M4.6 19.4 L2.2 21.8" />
        <path d="M10 18.8 V20.8" />
        <circle cx="14.4" cy="7.6" r="0.9" fill="currentColor" stroke="none" />
      </>
    ),
  },
  environment: {
    label: "Environment",
    art: (
      <>
        <path d="M4 20.5 h16" />
        <path d="M12 20.5 V9.6" />
        <path d="M12 14.4 c-3.5 0 -5.7 -2 -5.7 -4.7 c3.3 -0.4 5.7 1.6 5.7 4.7 Z" />
        <path d="M12 11.6 c3.5 0 5.7 -2 5.7 -4.7 c-3.3 -0.4 -5.7 1.6 -5.7 4.7 Z" />
      </>
    ),
  },
  animals: {
    label: "Animals",
    art: (
      <>
        <path d="M12 20.6 c-2.9 0 -5.2 -1.9 -5.2 -4.1 c0 -2 1.9 -3.5 3.7 -4.5 c0.9 -0.5 2 -0.5 2.9 0 c1.9 1 3.8 2.5 3.8 4.5 c0 2.2 -2.3 4.1 -5.2 4.1 Z" />
        <ellipse cx="5.6" cy="10.4" rx="1.7" ry="2.2" />
        <ellipse cx="9.6" cy="6.8" rx="1.7" ry="2.4" />
        <ellipse cx="14.4" cy="6.8" rx="1.7" ry="2.4" />
        <ellipse cx="18.4" cy="10.4" rx="1.7" ry="2.2" />
      </>
    ),
  },
  children: {
    label: "Children",
    art: (
      <>
        <path d="M12 2.4 L18.6 9 L12 15.6 L5.4 9 Z" />
        <path d="M12 2.4 V15.6 M5.4 9 H18.6" />
        <path d="M12 15.6 c1.5 1.2 -1.5 2.1 0 3.3 c1.5 1.2 -1.5 2.1 0 3.3" />
      </>
    ),
  },
  health: {
    label: "Health",
    art: (
      <>
        <path d="M12 20 L4.5 12.5 a4.7 4.7 0 0 1 6.6 -6.6 l0.9 0.9 l0.9 -0.9 a4.7 4.7 0 0 1 6.6 6.6 Z" />
        <path d="M7.1 12.4 h2.6 l1.4 -2.7 l1.9 4.1 l1.1 -1.4 h2.8" />
      </>
    ),
  },
  food: {
    label: "Food",
    art: (
      <>
        <path d="M3.6 12.8 h16.8 a8.4 8.4 0 0 1 -16.8 0 Z" />
        <path d="M2.4 12.8 h19.2" />
        <path d="M9.2 9.6 c-1.3 -1.4 1.3 -2.4 0 -3.9" />
        <path d="M14.8 9.6 c-1.3 -1.4 1.3 -2.4 0 -3.9" />
      </>
    ),
  },
  relief: {
    label: "Relief",
    art: (
      <>
        <path d="M3 12.4 a9 9 0 0 1 18 0 Z" />
        <path d="M3 12.4 c1.5 1.7 4.5 1.7 6 0 c1.5 1.7 4.5 1.7 6 0 c1.5 1.7 4.5 1.7 6 0" />
        <path d="M12 12.4 V19 c0 1.5 -1.3 2.3 -2.6 1.8" />
        <path d="M4.6 16.6 l-1 2.4 M19.4 16.6 l-1 2.4" />
      </>
    ),
  },
  elderly: {
    label: "Elderly",
    art: (
      <>
        <circle cx="9.8" cy="4.6" r="2.1" />
        <path d="M9.8 6.9 c-0.5 3.1 -0.9 5.4 -1.5 7.7" />
        <path d="M9.5 9.5 l4.4 1.6" />
        <path d="M13.9 11.1 V20.6" />
        <path d="M13.9 11.1 c0 -1.1 1.8 -1.1 1.8 0" />
        <path d="M8.3 14.6 l-1.5 6 M8.3 14.6 l2.5 6" />
      </>
    ),
  },
  women: {
    label: "Women",
    art: (
      <>
        <circle cx="12" cy="8.6" r="5.2" />
        <path d="M12 13.8 V20.8" />
        <path d="M8.8 18 H15.2" />
      </>
    ),
  },
  disability: {
    label: "Disability",
    art: (
      <>
        <circle cx="13.2" cy="4.3" r="2" />
        <path d="M11.4 7.3 c-0.3 2.7 0.5 4.3 1.7 5.3 h4.2" />
        <path d="M17.3 12.6 l1.5 4.6" />
        <circle cx="11.6" cy="15" r="5.8" />
      </>
    ),
  },
};

const FALLBACK: ReactNode = <path d="M12 20 L4.5 12.5 a4.7 4.7 0 0 1 6.6 -6.6 l0.9 0.9 l0.9 -0.9 a4.7 4.7 0 0 1 6.6 6.6 Z" />;

export type CategoryMarkSlug = keyof typeof MARKS;

/**
 * A mark for one cause category, sized by the box it is put in.
 *
 * It is labelled by default. Next to a visible label, as in the browse-by
 * chips, pass `decorative` so a screen reader hears the word once.
 */
export function CategoryMark({ slug, label, decorative = false, className, style }: IllustrationProps & { slug: string; label?: string; decorative?: boolean }) {
  const mark = MARKS[slug];
  const name = label ?? mark?.label ?? slug;
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-6 w-6 shrink-0", className)}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": name })}
    >
      {mark?.art ?? FALLBACK}
    </svg>
  );
}
