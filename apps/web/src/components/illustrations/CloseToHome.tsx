import { GREEN, PAPER, line, thin, trace, type IllustrationProps } from "./common";

/**
 * Giving to a cause close to home.
 *
 * A house on stilts by the water, a palm, a hill behind, a hatchling on
 * its way down the sand, and a coin travelling along the shore to the
 * door. Quiet line work, so it can sit beside a photograph without
 * arguing with it.
 */
export function CloseToHome({ className = "h-auto w-full", style }: IllustrationProps) {
  return (
    <svg viewBox="0 0 480 300" className={className} style={style} role="img" aria-label="A house on stilts by the water with a palm tree and a hill behind it, a turtle hatchling crossing the sand, a heart above the roof, and a coin travelling along the shore to the door." focusable="false">
      {/* the heart, before anything else */}
      <path d="M258 102 L231.6 75.6 a9.4 9.4 0 0 1 13.3 -13.3 l2.1 2.1 l2.1 -2.1 a9.4 9.4 0 0 1 13.3 13.3 Z" fill={GREEN} stroke="var(--ink)" strokeWidth="2.4" strokeLinejoin="round" />

      <g {...line}>
        {/* the hill, and the water behind the shore */}
        <path d="M336 160 C 358 118, 400 116, 428 158" />
        <path d="M20 256 H460" />

        {/* a house on stilts */}
        <rect x="210" y="148" width="96" height="52" fill={PAPER} />
        <path d="M194 148 L258 110 L322 148" />
        <rect x="244" y="168" width="28" height="32" fill={PAPER} />
        <path d="M226 200 V250 M290 200 V250" />
        <path d="M226 236 L206 252" />

        {/* a palm */}
        <path d="M128 252 C 122 216, 116 192, 108 172" />
        <path d="M108 172 C 92 158, 74 160, 66 170" />
        <path d="M108 172 C 94 164, 78 170, 72 184" />
        <path d="M108 172 C 122 154, 142 154, 152 164" />
        <path d="M108 172 C 124 162, 142 168, 148 182" />
        <path d="M108 172 C 106 154, 112 142, 122 136" />

        {/* the shore */}
        <path d="M14 290 C 120 278, 320 278, 466 290" />
      </g>

      {/* a hatchling crossing the sand */}
      <g stroke="var(--ink)" strokeWidth="2.4" strokeLinejoin="round">
        <ellipse cx="358" cy="238" rx="21" ry="14" fill={GREEN} />
        <circle cx="384" cy="234" r="6.5" fill={PAPER} />
        <ellipse cx="342" cy="222" rx="9" ry="5" fill={PAPER} transform="rotate(-32 342 222)" />
        <ellipse cx="342" cy="254" rx="9" ry="5" fill={PAPER} transform="rotate(32 342 254)" />
        <ellipse cx="374" cy="221" rx="8" ry="4.5" fill={PAPER} transform="rotate(-42 374 221)" />
        <ellipse cx="374" cy="255" rx="8" ry="4.5" fill={PAPER} transform="rotate(42 374 255)" />
      </g>
      <g {...thin}>
        <path d="M349 232 L358 227 L367 232 L367 244 L358 249 L349 244 Z" />
      </g>

      {/* and a gift finding its way there */}
      <circle cx="122" cy="279" r="14" fill={GREEN} stroke="var(--ink)" strokeWidth="2.4" />
      <g {...trace}>
        <path d="M30 286 C 80 288, 144 274, 202 254" />
      </g>
    </svg>
  );
}
