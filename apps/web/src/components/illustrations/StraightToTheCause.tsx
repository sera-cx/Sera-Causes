import { DEEP, GREEN, PAPER, hint, line, trace, type IllustrationProps } from "./common";

/**
 * A gift goes straight to the cause.
 *
 * A see-through tin stands on the cause's own doorstep. One coin travels
 * to it in a straight line with nothing on the way to catch it, and what
 * went in is sitting there in plain sight. A coin in a currency the cause
 * does not keep takes the only other route there is: through the money
 * changer's window, and then into the very same tin.
 */
export function StraightToTheCause({ className = "h-auto w-full", style }: IllustrationProps) {
  return (
    <svg viewBox="0 0 520 330" className={className} style={style} role="img" aria-label="A coin travels in one unbroken line from a hand into a see-through tin standing on the charity's own doorstep, and every coin that went in is visible inside it. A square coin in another currency passes through a money changer's window, comes out round, and drops into the very same tin." focusable="false">
      <g {...line}>
        <path d="M14 306 H506" />

        {/* the cause's own front door, and its step */}
        <path d="M356 86 V296 M506 86 V296" />
        <path d="M348 86 H514" />
        <rect x="396" y="176" width="60" height="120" rx="3" fill={PAPER} />
        <path d="M444 238 h4" strokeWidth="5" />
        <rect x="388" y="128" width="76" height="28" rx="3" fill={PAPER} />
        <path d="M226 296 H506" strokeWidth="3" />

        {/* the money changer's window: the only detour, and only for money of another kind */}
        <rect x="170" y="58" width="132" height="70" rx="4" fill={PAPER} />
        <path d="M164 58 C 172 46, 186 46, 194 58 C 202 46, 216 46, 224 58 C 232 46, 246 46, 254 58 C 262 46, 276 46, 284 58 C 290 50, 302 50, 308 58" />
        <path d="M192 88 C 206 74, 242 74, 256 86" />
        <path d="M256 106 C 242 120, 206 120, 192 108" />
        <path d="M248 76 L258 87 L244 90" />
        <path d="M200 118 L190 107 L204 104" />
        <rect x="126" y="78" width="32" height="32" rx="9" fill={DEEP} />

        {/* whoever is giving, having just let go */}
        <circle cx="62" cy="160" r="15" fill={PAPER} />
        <path d="M42 232 C 42 208, 50 194, 62 194 C 74 194, 82 208, 82 232 Z" fill={PAPER} />
        <path d="M52 232 V306 M72 232 V306" />
        <path d="M80 206 L120 196" />
        <circle cx="128" cy="194" r="6" fill={PAPER} />

        {/* the tin: see-through, no pocket, no tap, no second way out */}
        <rect x="248" y="184" width="84" height="112" rx="6" fill={PAPER} />
        <path d="M242 184 H338" />
        <rect x="274" y="170" width="32" height="14" rx="7" />
      </g>

      {/* what goes in is sitting there in plain sight */}
      <g fill={GREEN} stroke="var(--ink)" strokeWidth="2.4">
        <circle cx="271" cy="272" r="13" />
        <circle cx="302" cy="276" r="12" />
        <circle cx="289" cy="246" r="12" />
        <circle cx="262" cy="240" r="11" />
        <circle cx="172" cy="184" r="18" />
        <circle cx="322" cy="94" r="16" />
      </g>

      <g {...trace}>
        <path d="M138 190 C 176 186, 224 176, 270 170" />
        <path d="M160 94 H168" />
        <path d="M328 110 C 338 136, 332 156, 308 168" />
      </g>

      <g {...hint}>
        <path d="M248 214 H332" />
      </g>
    </svg>
  );
}
