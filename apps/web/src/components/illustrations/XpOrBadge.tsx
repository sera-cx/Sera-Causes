import { GREEN, PAPER, hint, line, thin, tick, trace, type IllustrationProps } from "./common";

/**
 * Why some help earns XP and some help earns a badge.
 *
 * One piece of work at the top, and then the fork that decides which it is.
 *
 * Left: work a stranger can repeat. Footprints lead from the official
 * register to a second page that reached the same answer, so it earns XP,
 * and the bars behind the rosette say XP adds up.
 *
 * Right: work only the charity can confirm. The page goes in at the
 * charity's own door and comes back with the charity's seal on it. The
 * magnifying glass is crossed out, because nobody outside can check it.
 * What comes back is a badge: one mark, with no amount on it.
 */
export function XpOrBadge({ className = "h-auto w-full", style }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 600 340"
      className={className}
      style={style}
      role="img"
      aria-label="One piece of helping work at the top, and a fork below it. On the left, work a stranger can repeat: footprints lead from the official register to a second page that reached the same answer, and it earns an XP rosette, with rising bars behind it to say XP adds up. On the right, work only the charity can confirm: the page goes in at the charity's door and comes back with the charity's green seal, while a magnifying glass beside it is crossed out. What comes back is a badge, a single mark with a tick and no amount on it."
      focusable="false"
    >
      <g {...line}>
        <path d="M20 318 H580" />

        {/* the work somebody did */}
        <rect x="256" y="20" width="92" height="74" rx="4" fill={PAPER} />

        {/* left: the official register anybody may look in */}
        <path d="M34 148 L80 122 L126 148" />
        <rect x="42" y="148" width="76" height="52" fill={PAPER} />
        <path d="M58 160 V200 M80 160 V200 M102 160 V200" />

        {/* and a second page that got the same answer */}
        <rect x="192" y="158" width="70" height="66" rx="3" fill={PAPER} />

        {/* right: the charity's own door, the only place this can be confirmed */}
        <path d="M330 136 L374 108 L418 136" />
        <rect x="336" y="136" width="76" height="126" fill={PAPER} />
        <rect x="350" y="174" width="30" height="88" rx="2" fill={PAPER} />
        <path d="M373 220 h3" strokeWidth="5" />

        {/* the work handed in at that door */}
        <rect x="412" y="168" width="62" height="58" rx="3" fill={PAPER} />

        {/* the glass that cannot be used on it */}
        <circle cx="512" cy="118" r="20" strokeWidth="3" />
        <path d="M498 133 L474 157" strokeWidth="6" />
      </g>
      <g {...line} strokeWidth="4">
        <path d="M496 134 L528 102" />
      </g>

      <g {...hint}>
        <path d="M270 42 h62 M270 56 h44 M270 70 h54" />
        <path d="M202 176 h46 M202 188 h30" />
        <path d="M422 182 h40 M422 194 h28" />
      </g>

      {/* XP adds up, so the bars behind the rosette rise */}
      <g {...thin} stroke="var(--ink-subtle)" strokeWidth="6">
        <path d="M70 296 V272 M90 296 V256 M110 296 V240" />
      </g>

      {/* the walk anybody else can take, from the register to the same answer */}
      <g fill="var(--sera-text)">
        <ellipse cx="140" cy="214" rx="5.4" ry="3.4" transform="rotate(-18 140 214)" />
        <ellipse cx="158" cy="205" rx="5.4" ry="3.4" transform="rotate(-18 158 205)" />
        <ellipse cx="176" cy="214" rx="5.4" ry="3.4" transform="rotate(-18 176 214)" />
      </g>

      {/* the same answer, and the seal only the charity can give */}
      <g {...tick} strokeWidth="4.5">
        <path d="M204 204 l8 9 l17 -20" />
      </g>
      <circle cx="450" cy="206" r="13" fill={GREEN} stroke="var(--ink)" strokeWidth="2.4" />

      {/* what comes back on each side: a rosette that counts, a badge that does not */}
      <path d="M126 268 L116 310 L135 296 L152 314 L154 268" fill={PAPER} stroke="var(--ink)" strokeWidth="2.4" strokeLinejoin="round" />
      <circle cx="140" cy="250" r="28" fill={PAPER} stroke="var(--ink)" strokeWidth="2.4" />
      <circle cx="140" cy="250" r="20" fill="none" stroke="var(--sera-text)" strokeWidth="2.4" />
      <text x="140" y="258" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="17" fontWeight="700" fill="var(--sera-text)">
        XP
      </text>

      <path
        d="M502 222 L546 238 V274 C546 294, 526 306, 502 314 C478 306, 458 294, 458 274 V238 Z"
        fill={PAPER}
        stroke="var(--ink)"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      {/* one mark, earned once, with no amount on it */}
      <g {...tick} strokeWidth="5">
        <path d="M486 268 l10 11 l21 -24" />
      </g>

      <g {...trace}>
        {/* the fork: which kind of work is it */}
        <path d="M252 86 C 200 104, 160 122, 134 138" />
        <path d="M352 86 C 390 100, 420 124, 436 150" />
        {/* and what each side comes back with */}
        <path d="M196 220 C 180 230, 166 232, 156 232" />
        <path d="M452 228 C 462 240, 472 248, 482 254" />
      </g>
    </svg>
  );
}
