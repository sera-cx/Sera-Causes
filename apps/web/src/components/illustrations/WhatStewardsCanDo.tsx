import { GREEN, PAPER, hint, line, thin, tick, trace, type IllustrationProps } from "./common";

/**
 * What a steward can do, and what a steward cannot.
 *
 * On the near side of the rope: the four things a steward may reach, pinned
 * on the wall, and the record on the desk where every one of those actions
 * is written down with a reason before it counts.
 *
 * On the far side: the charity's own tin, with the gifts that have arrived
 * sitting in it. A hand reaching for it is crossed out. The rope is the
 * point, so it is drawn as the one thing that runs the full height of the
 * scene.
 */
export function WhatStewardsCanDo({ className = "h-auto w-full", style }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 640 330"
      className={className}
      style={style}
      role="img"
      aria-label="On one side of a rope barrier, a steward at a desk with four things pinned on the wall above: a listing paused with two bars, a stuck check being settled with a green tick, a file with its personal details blacked out, and one urgent appeal pinned up. In the steward's hand is a stamp, and on the desk is the record, where each action is written down with a reason. On the far side of the rope stands the charity's own tin with the gifts that have arrived sitting in it, and a hand reaching for the tin is crossed out."
      focusable="false"
    >
      <g {...line}>
        <path d="M20 306 H620" />

        {/* the four things a steward may reach, pinned on the wall */}
        <rect x="36" y="34" width="78" height="66" rx="4" fill={PAPER} />
        <path d="M60 52 V84 M90 52 V84" strokeWidth="7" />

        <rect x="130" y="34" width="78" height="66" rx="4" fill={PAPER} />

        <rect x="224" y="34" width="78" height="66" rx="4" fill={PAPER} />

        <rect x="318" y="34" width="78" height="66" rx="4" fill={PAPER} />

        {/* the steward */}
        <circle cx="92" cy="170" r="17" fill={PAPER} />
        <path d="M66 236 C 66 210, 76 194, 92 194 C 108 194, 118 210, 118 236 Z" fill={PAPER} />
        <path d="M116 208 L152 194" />
        <circle cx="160" cy="191" r="7" fill={PAPER} />

        {/* the stamp in that hand */}
        <rect x="150" y="196" width="38" height="18" rx="3" fill={PAPER} />
        <path d="M169 196 V182" />
        <rect x="157" y="170" width="24" height="12" rx="6" fill={PAPER} />

        {/* the desk, and the record kept on it */}
        <path d="M30 236 H404" />
        <path d="M56 236 V306 M378 236 V306" />
        <rect x="196" y="242" width="150" height="60" rx="3" fill={PAPER} />

        {/* the rope: as far as a steward goes */}
        <path d="M440 306 V200 M506 306 V200" />
        <circle cx="440" cy="194" r="7" fill={PAPER} />
        <circle cx="506" cy="194" r="7" fill={PAPER} />
        <path d="M440 206 C 456 236, 490 236, 506 206" strokeWidth="3" />

        {/* the charity's own tin, on the far side of it */}
        <rect x="532" y="196" width="68" height="110" rx="6" fill={PAPER} />
        <path d="M526 196 H606" />
        <rect x="552" y="182" width="28" height="14" rx="7" />
      </g>

      {/* a hand reaching across for the gifts, and the circle it cannot pass */}
      <g {...line}>
        <path d="M426 180 L452 152" />
        <rect x="456" y="118" width="32" height="30" rx="6" fill={PAPER} />
        <path d="M459 118 c0 -9 9 -9 9 0 M469 118 c0 -11 10 -11 10 0 M479 118 c0 -9 9 -9 9 0" />
        <path d="M456 129 c-8 -1 -9 9 -2 10" />
      </g>
      <g {...line} strokeWidth="3">
        <circle cx="470" cy="132" r="38" />
      </g>
      <g {...line} strokeWidth="4">
        <path d="M443 159 L497 105" />
      </g>

      {/* what is pinned up there: paused, settled, blacked out, one appeal */}
      <g {...hint}>
        <path d="M142 52 h46 M142 64 h30" />
        <path d="M236 52 h52" />
        <path d="M236 88 h40" />
        <path d="M330 52 h50 M330 64 h34 M330 76 h44" />
        <path d="M208 258 h34 M208 272 h58 M208 286 h44" />
      </g>

      {/* the personal details taken out of the file */}
      <g fill="var(--ink)">
        <rect x="236" y="62" width="48" height="9" rx="2" />
        <rect x="236" y="74" width="32" height="9" rx="2" />
      </g>

      {/* the check a steward settled, and the appeal a steward pinned */}
      <g {...tick} strokeWidth="4.5">
        <path d="M148 76 l9 10 l19 -22" />
      </g>
      <g fill={GREEN}>
        <circle cx="357" cy="44" r="6" />
        <circle cx="288" cy="276" r="7" />
      </g>

      {/* what has arrived, sitting in the tin in plain sight */}
      <g fill={GREEN} stroke="var(--ink)" strokeWidth="2.4">
        <circle cx="552" cy="278" r="12" />
        <circle cx="578" cy="282" r="11" />
        <circle cx="566" cy="254" r="11" />
      </g>

      {/* the pin through the one urgent appeal, and the address on the tin */}
      <g {...thin}>
        <path d="M357 44 V60" />
        <rect x="540" y="206" width="48" height="18" rx="3" />
        <path d="M549 215 h30" />
      </g>

      {/* no action counts until the reason is written down */}
      <g {...trace}>
        <path d="M172 220 C 182 230, 194 238, 206 244" />
      </g>
    </svg>
  );
}
