import { DEEP, GREEN, PAPER, hint, line, thin, type IllustrationProps } from "./common";

/**
 * The record.
 *
 * A machine hanging in the square prints one long receipt, a row for every
 * thing that happened, newest at the top. Two people read it from either
 * side. The torn-off rolls at the foot say the older ones are still there.
 */
export function PublicRecord({ className = "h-auto w-full", style }: IllustrationProps) {
  const rows = [110, 134, 158, 182, 206, 230];
  return (
    <svg viewBox="0 0 520 340" className={className} style={style} role="img" aria-label="A machine hanging in the village square prints one long receipt with a row for everything that happened, newest at the top. Two people read it from either side, one through a magnifying glass, and earlier rolls lie kept at its foot." focusable="false">
      <g {...line}>
        <path d="M20 316 H500" />
        <path d="M120 18 H400" />
        <path d="M260 18 V36" />
        <rect x="182" y="36" width="156" height="56" rx="8" fill={DEEP} />
        <path d="M198 92 H322" strokeWidth="4" />

        {/* one long receipt, torn across the bottom */}
        <path d="M198 92 H322 V262 l-15.5 12 l-15.5 -12 l-15.5 12 l-15.5 -12 l-15.5 12 l-15.5 -12 l-15.5 12 l-15.5 -12 Z" fill={PAPER} />

        {/* whoever wants to read it, from either side */}
        <circle cx="92" cy="216" r="14" fill={PAPER} />
        <path d="M74 272 C 74 252, 80 240, 92 240 C 104 240, 110 252, 110 272 Z" fill={PAPER} />
        <path d="M84 272 V316 M100 272 V316" />
        <path d="M108 252 L132 240" />
        <circle cx="153" cy="226" r="17" strokeWidth="2.8" />
        <path d="M141 239 L131 248" strokeWidth="4" />

        <circle cx="408" cy="210" r="14" fill={PAPER} />
        <path d="M390 266 C 390 246, 396 234, 408 234 C 420 234, 426 246, 426 266 Z" fill={PAPER} />
        <path d="M400 266 V316 M416 266 V316" />
        <path d="M391 247 L366 256" />
        <circle cx="360" cy="258" r="5" fill={PAPER} />

        {/* kept, not thrown away */}
        <rect x="432" y="290" width="50" height="11" rx="3" fill={PAPER} />
        <rect x="440" y="276" width="50" height="11" rx="3" fill={PAPER} />
        <rect x="428" y="262" width="50" height="11" rx="3" fill={PAPER} />
      </g>

      {/* a row for every gift, swap, check and update */}
      <g {...hint}>
        {rows.map((y) => (
          <path key={y} d={`M210 ${y} h28 M210 ${y + 10} h82`} />
        ))}
      </g>
      <g {...thin} stroke="var(--rule)">
        {rows.map((y) => (
          <path key={y} d={`M204 ${y + 17} H316`} />
        ))}
      </g>
      <g fill={GREEN}>
        <circle cx="306" cy="112" r="4.5" />
        <circle cx="306" cy="160" r="4.5" />
        <circle cx="306" cy="208" r="4.5" />
        <circle cx="206" cy="50" r="5" />
      </g>
    </svg>
  );
}
