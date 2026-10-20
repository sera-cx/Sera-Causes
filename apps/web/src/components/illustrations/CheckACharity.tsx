import { GREEN, PAPER, hint, line, thin, trace, type IllustrationProps } from "./common";

/**
 * Helping without money.
 *
 * A page from the official register under a magnifying glass, and beside
 * it the notebook where the helper writes down every step they took, so
 * somebody else can walk the same way and get the same answer.
 */
export function CheckACharity({ className = "h-auto w-full", style }: IllustrationProps) {
  return (
    <svg viewBox="0 0 480 280" className={className} style={style} role="img" aria-label="A page from the official register propped on a desk under a magnifying glass, with a stamped seal on it. Beside it a notebook lists the steps the checker took, and footprints lead back to the register building." focusable="false">
      <g {...line}>
        <path d="M24 266 H456" />
        <path d="M40 236 H440" />
        <path d="M80 236 V266 M400 236 V266" />

        {/* the official register, at the back */}
        <rect x="398" y="74" width="56" height="42" />
        <path d="M390 74 L426 52 L462 74" />
        <path d="M410 86 V114 M426 86 V114 M442 86 V114" />

        {/* the page being checked */}
        <rect x="70" y="116" width="112" height="120" rx="4" fill={PAPER} />
        <circle cx="148" cy="152" r="34" strokeWidth="3" />
        <path d="M172 176 L204 208" strokeWidth="6" />

        {/* what the helper writes down */}
        <rect x="236" y="160" width="140" height="76" rx="4" fill={PAPER} />
        <path d="M248 160 V152 M268 160 V152 M288 160 V152 M308 160 V152 M328 160 V152 M348 160 V152 M364 160 V152" />
        <path d="M396 148 L366 188" />
        <path d="M366 188 L359 199 L370 195 Z" fill={PAPER} />
      </g>

      <g {...hint}>
        <path d="M86 132 h50" />
        <path d="M86 198 h36 M86 212 h52" />
        <path d="M266 182 h86 M266 200 h70 M266 218 h78" />
      </g>
      <g {...thin}>
        <path d="M130 150 h36" />
      </g>

      {/* the seal on the page, and the walk back to the source */}
      <g fill={GREEN} stroke="var(--ink)" strokeWidth="2.4">
        <circle cx="156" cy="214" r="14" />
      </g>
      <g {...trace}>
        <path d="M384 116 l-14 8 M356 130 l-14 8 M328 144 l-14 8" />
      </g>
    </svg>
  );
}
