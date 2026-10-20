import { DEEP, GREEN, PAPER, hint, line, trace, type IllustrationProps } from "./common";

/**
 * One open list of causes.
 *
 * A notice board standing in the village square. Two houses and a person
 * passing each read the same four pinned notes: one list, many readers,
 * nobody holding the only copy.
 */
export function OpenList({ className = "h-auto w-full", style }: IllustrationProps) {
  return (
    <svg viewBox="0 0 520 300" className={className} style={style} role="img" aria-label="A notice board standing in a village square with four notes pinned to it. Two houses and a person walking past all read the same notes through their windows and screens." focusable="false">
      <g {...line}>
        {/* the square */}
        <path d="M16 286 H504" />

        {/* the board */}
        <path d="M198 184 V286 M322 184 V286" />
        <rect x="180" y="62" width="160" height="122" rx="5" fill={DEEP} />
        <path d="M176 62 L260 36 L344 62" />
        <rect x="194" y="80" width="54" height="40" rx="2" fill={PAPER} />
        <rect x="258" y="74" width="66" height="50" rx="2" fill={PAPER} />
        <rect x="194" y="130" width="70" height="32" rx="2" fill={PAPER} />
        <rect x="276" y="134" width="48" height="30" rx="2" fill={PAPER} />

        {/* the house on the left, reading */}
        <rect x="24" y="194" width="96" height="92" />
        <path d="M16 194 L72 152 L128 194" />
        <rect x="40" y="212" width="50" height="44" fill={PAPER} />
        <rect x="96" y="248" width="20" height="38" rx="2" />

        {/* the house on the right, reading the same thing */}
        <rect x="388" y="200" width="100" height="86" />
        <path d="M380 200 L438 162 L496 200" />
        <rect x="404" y="216" width="52" height="42" fill={PAPER} />

        {/* someone passing, reading it on something they carry */}
        <circle cx="152" cy="222" r="11" fill={PAPER} />
        <path d="M152 233 V262" />
        <path d="M152 262 L143 286 M152 262 L161 286" />
        <path d="M152 243 H160" />
        <rect x="160" y="228" width="34" height="28" rx="3" fill={PAPER} />
      </g>

      {/* the same lines of writing, on all four surfaces */}
      <g {...hint}>
        <path d="M204 92 h34 M204 102 h24 M204 112 h30" />
        <path d="M268 86 h46 M268 96 h34 M268 106 h42 M268 116 h20" />
        <path d="M204 140 h50 M204 152 h32" />
        <path d="M286 144 h28 M286 156 h18" />
        <path d="M50 224 h30 M50 234 h22 M50 244 h26" />
        <path d="M414 228 h32 M414 238 h22 M414 248 h28" />
        <path d="M168 238 h18 M168 246 h12" />
      </g>

      {/* every reader looking at the one board */}
      <g {...trace}>
        <path d="M190 148 C 156 162, 112 192, 92 216" />
        <path d="M196 170 C 190 194, 184 212, 180 226" />
        <path d="M346 140 C 372 160, 398 190, 404 216" />
      </g>

      {/* the pins */}
      <g fill={GREEN}>
        <circle cx="205" cy="84" r="4" />
        <circle cx="270" cy="78" r="4" />
        <circle cx="205" cy="134" r="4" />
        <circle cx="288" cy="138" r="4" />
      </g>
    </svg>
  );
}
