import { DEEP, GREEN, PAPER, hint, line, thin, tick, trace, type IllustrationProps } from "./common";

/**
 * The whole idea, in one square.
 *
 * A board stands in the open where every charity posts itself. One listing
 * carries a tick, and pinned beside the listings is the record: a printed
 * strip with a row for every gift. Somebody holds a glass up to a listing,
 * because checking is open to anyone. At the charity's own door stands its tin, with
 * its own address written on it and what has arrived sitting in plain sight.
 * On the right a giver has just let go of a coin, and the trail runs over the
 * board and straight into that tin, stopping nowhere on the way.
 *
 * The hero piece, so it is drawn larger and holds more than the section
 * drawings do. Every mark still comes from the house style in common.tsx.
 */
export function GiftInTheOpen({ className = "h-auto w-full", style }: IllustrationProps) {
  /* The record: four rows, newest at the top, each with a gift beside it. */
  const rows = [216, 230, 244, 258];
  return (
    <svg
      viewBox="0 0 620 420"
      className={className}
      style={style}
      role="img"
      aria-label="A board standing in an open square where charities post themselves. One listing has a green tick, and pinned beside the listings is a printed record with a row for every gift. Somebody holds a magnifying glass up to a listing. At the charity's own door stands a see-through tin with its address written on it and the coins that have arrived sitting inside. On the right a giver has just let go of a green coin, and its dotted trail runs over the board and straight into that tin."
      focusable="false"
    >
      <g {...line}>
        {/* the square */}
        <path d="M20 392 H600" />

        {/* a palm behind the roof, because this is somewhere, not nowhere */}
        <path d="M120 234 C 114 200, 108 168, 104 136" />
        <path d="M104 136 C 84 116, 58 118, 46 132" />
        <path d="M104 136 C 84 128, 62 138, 54 154" />
        <path d="M104 136 C 124 114, 150 114, 162 128" />
        <path d="M104 136 C 124 126, 146 134, 154 150" />
        <path d="M104 136 C 100 112, 108 98, 120 92" />

        {/* the charity's own place, with its name over the door. The roof is
            filled so the palm stands behind the house rather than through it. */}
        <rect x="24" y="226" width="126" height="166" fill={PAPER} />
        <path d="M14 226 L87 178 L160 226 Z" fill={PAPER} />
        <rect x="46" y="242" width="82" height="26" rx="2" fill={PAPER} />
        <rect x="44" y="300" width="30" height="30" fill={PAPER} />
        <rect x="96" y="322" width="38" height="70" fill={PAPER} />
        <path d="M126 358 h3" strokeWidth="5" />

        {/* its tin, standing on its own step: see-through, one way in */}
        <rect x="162" y="286" width="62" height="106" rx="6" fill={PAPER} />
        <path d="M156 286 H230" />
        <rect x="179" y="272" width="28" height="14" rx="7" />

        {/* the board, and the record hanging beside the listings */}
        <path d="M296 284 V392 M432 284 V392" />
        <rect x="288" y="130" width="152" height="154" rx="5" fill={DEEP} />
        <rect x="300" y="146" width="60" height="56" rx="2" fill={PAPER} />
        <rect x="370" y="142" width="58" height="48" rx="2" fill={PAPER} />
        <rect x="300" y="214" width="56" height="54" rx="2" fill={PAPER} />
        <path d="M368 200 H428 V268 l-10 8 l-10 -8 l-10 8 l-10 -8 l-10 8 l-10 -8 Z" fill={PAPER} />

        {/* whoever wants to check a listing, and may */}
        <circle cx="254" cy="254" r="13" fill={PAPER} />
        <path d="M236 310 C 236 288, 244 274, 254 274 C 264 274, 272 288, 272 310 Z" fill={PAPER} />
        <path d="M244 310 V392 M264 310 V392" />
        <path d="M271 284 L290 266" />

        {/* whoever is giving, having just let go */}
        <circle cx="544" cy="214" r="14" fill={PAPER} />
        <path d="M524 274 C 524 250, 532 236, 544 236 C 556 236, 564 250, 564 274 Z" fill={PAPER} />
        <path d="M534 274 V392 M554 274 V392" />
        <path d="M526 248 L502 212" />
        <circle cx="496" cy="204" r="6" fill={PAPER} />
      </g>

      {/* the glass, held up to one of the listings */}
      <g {...line} strokeWidth="2.8">
        <circle cx="306" cy="246" r="14" />
      </g>
      <path d="M296 256 L288 264" stroke="var(--ink)" strokeWidth="5" strokeLinecap="round" />
      <g {...thin}>
        <path d="M300 242 h12" />
        {/* the address the charity wrote on its own tin */}
        <rect x="170" y="296" width="46" height="18" rx="3" />
        <path d="M187 305 h22" />
      </g>

      {/* the same writing on every listing, and a row for every gift */}
      <g {...hint}>
        <path d="M56 252 h44 M56 262 h28" />
        <path d="M310 164 h40 M310 178 h18" />
        <path d="M380 160 h40 M380 172 h28" />
        <path d="M310 234 h36 M310 246 h22" />
        {rows.map((y) => (
          <path key={y} d={`M376 ${y} h24`} />
        ))}
      </g>

      {/* the pins, the tick, and the gifts on the record */}
      <g fill={GREEN}>
        <circle cx="308" cy="152" r="4" />
        <circle cx="378" cy="148" r="4" />
        <circle cx="308" cy="220" r="4" />
        <circle cx="376" cy="206" r="4" />
        {rows.map((y) => (
          <circle key={y} cx="418" cy={y - 1} r="3.5" />
        ))}
        <circle cx="178" cy="305" r="3.5" />
      </g>
      {/* the tick, a shade lighter than the preset so it fits inside a listing */}
      <g {...tick} strokeWidth="4">
        <path d="M334 188 l6 7 l15 -18" />
      </g>

      {/* what has arrived, sitting in plain sight */}
      <g fill={GREEN} stroke="var(--ink)" strokeWidth="2.4">
        <circle cx="181" cy="366" r="11" />
        <circle cx="206" cy="370" r="10" />
        <circle cx="195" cy="342" r="10" />
        <circle cx="472" cy="186" r="15" />
      </g>

      {/* over the board, and straight into the tin */}
      <g {...trace}>
        <path d="M456 180 C 408 108, 312 82, 250 126 C 212 156, 192 224, 193 296" />
      </g>
    </svg>
  );
}
