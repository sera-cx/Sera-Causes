import { DEEP, GREEN, PAPER, hint, line, trace, type IllustrationProps } from "./common";

/**
 * Earning.
 *
 * Two different things, side by side, so nobody mixes them up. Put a coin
 * in the tin and a coin comes back that you can spend. Check a charity and
 * what comes back is a badge: standing, not money.
 */
export function CoinAndBadge({ className = "h-auto w-full", style }: IllustrationProps) {
  return (
    <svg viewBox="0 0 520 260" className={className} style={style} role="img" aria-label="On the left, a coin drops into a charity's tin and a gSera coin comes back out beside it. On the right, a page under a magnifying glass and an XP rosette with ribbons. One is money you can spend, the other is a badge you wear." focusable="false">
      <g stroke="var(--rule)" strokeWidth="2" strokeLinecap="round" fill="none">
        <path d="M262 44 V228" />
      </g>

      <g {...line}>
        <path d="M36 224 H236 M292 224 H484" />

        {/* give */}
        <rect x="70" y="128" width="76" height="96" rx="5" fill={PAPER} />
        <path d="M64 128 H152" />
        <rect x="94" y="115" width="28" height="13" rx="6" />
        <circle cx="108" cy="64" r="17" fill={DEEP} />

        {/* help */}
        <rect x="306" y="124" width="78" height="100" rx="4" fill={PAPER} />
        <circle cx="350" cy="148" r="26" strokeWidth="3" />
        <path d="M369 167 L392 190" strokeWidth="5" />
        <path d="M426 140 L416 186 L437 170 L455 190 L457 142" fill={PAPER} />
        <circle cx="441" cy="112" r="28" fill={PAPER} />
      </g>

      {/* what you put in */}
      <g fill={GREEN} stroke="var(--ink)" strokeWidth="2.4">
        <circle cx="92" cy="196" r="12" />
        <circle cx="122" cy="200" r="11" />
        <circle cx="107" cy="170" r="11" />
      </g>

      {/* the coin that comes back, and can be spent */}
      <circle cx="196" cy="116" r="25" fill={PAPER} stroke="var(--ink)" strokeWidth="2.4" />
      <circle cx="196" cy="116" r="17" fill="none" stroke="var(--sera-text)" strokeWidth="2.4" />
      <text x="196" y="125" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="21" fontWeight="700" fill="var(--sera-text)">
        g
      </text>

      {/* the badge that cannot */}
      <circle cx="441" cy="112" r="20" fill="none" stroke="var(--sera-text)" strokeWidth="2.4" />
      <text x="441" y="119" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="16" fontWeight="700" fill="var(--sera-text)">
        XP
      </text>

      <g {...hint}>
        <path d="M318 140 h32 M318 180 h50 M318 194 h36 M318 208 h44" />
      </g>
      <g {...trace}>
        <path d="M108 83 V111" />
        <path d="M154 152 C 168 142, 182 130, 188 124" />
        <path d="M388 126 C 398 116, 408 110, 416 108" />
      </g>
    </svg>
  );
}
