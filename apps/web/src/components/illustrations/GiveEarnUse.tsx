import { DEEP, GREEN, PAPER, line, trace, type IllustrationProps } from "./common";

/**
 * Give, earn, use.
 *
 * One coin on one unbroken trail: out of a giver's hand, into the cause's
 * tin, back out as a gSera coin, and into a purse. Three beats, one
 * movement, so the whole thing reads in a glance.
 */
export function GiveEarnUse({ className = "h-auto w-full", style }: IllustrationProps) {
  return (
    <svg viewBox="0 0 520 240" className={className} style={style} role="img" aria-label="A coin leaves a giver's hand, drops into a charity's tin, comes back out as a gSera coin and lands in a purse." focusable="false">
      <g {...line}>
        <path d="M26 196 H496" />

        {/* whoever is giving */}
        <circle cx="52" cy="96" r="13" fill={PAPER} />
        <path d="M34 160 C 34 140, 42 128, 52 128 C 62 128, 70 140, 70 160 Z" fill={PAPER} />
        <path d="M44 160 V196 M60 160 V196" />
        <path d="M68 140 L98 132" />
        <circle cx="105" cy="130" r="5.5" fill={PAPER} />

        {/* the cause's own tin */}
        <rect x="158" y="124" width="64" height="72" rx="5" fill={PAPER} />
        <path d="M154 124 H226" />
        <rect x="177" y="112" width="26" height="12" rx="6" />

        {/* and the purse it comes back to */}
        <path d="M380 196 V156 C 380 142, 392 134, 408 134 H452 C 468 134, 480 142, 480 156 V196 Z" fill={PAPER} />
        <path d="M414 134 C 414 118, 446 118, 446 134" />

        <circle cx="146" cy="113" r="14" fill={DEEP} />
      </g>

      <g fill={GREEN} stroke="var(--ink)" strokeWidth="2.4">
        <circle cx="178" cy="172" r="11" />
        <circle cx="202" cy="176" r="10" />
      </g>

      {/* the coin that comes back */}
      <circle cx="296" cy="92" r="23" fill={PAPER} stroke="var(--ink)" strokeWidth="2.4" />
      <circle cx="296" cy="92" r="15" fill="none" stroke="var(--sera-text)" strokeWidth="2.4" />
      <text x="296" y="100" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="19" fontWeight="700" fill="var(--sera-text)">
        g
      </text>

      <g {...trace}>
        <path d="M112 126 C 132 120, 158 108, 180 106" />
        <path d="M228 128 C 252 116, 272 102, 280 96" />
        <path d="M318 98 C 350 108, 388 124, 408 136" />
      </g>
    </svg>
  );
}
