import { GREEN, PAPER, hint, line, thin, tick, trace, type IllustrationProps } from "./common";

/**
 * Who lists a cause, and whose wallet it pays.
 *
 * Left: the charity stands at its own door and pins up its own listing. On
 * the listing are its own words, the address its gifts arrive at, and the
 * seal that address signed, so the listing can carry a tick.
 *
 * Right: that address has been changed. The seal is an empty dotted ring,
 * the tick has come off the listing and is lying on the ground, and a pen
 * waits over the ring for a fresh signed message. One drawing, two states,
 * which is the rule: change the wallet and Verified goes.
 */
export function ListedByTheCharity({ className = "h-auto w-full", style }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 560 300"
      className={className}
      style={style}
      role="img"
      aria-label="On the left, the charity stands at its own door and pins up its own listing: its own words, the address its gifts arrive at, and a green seal showing that address signed a message, so the listing carries a green tick. On the right, the same listing with the address changed: the seal is now an empty dotted ring, the tick has fallen off and lies on the ground, and a pen waits over the ring for a new signed message."
      focusable="false"
    >
      <g stroke="var(--rule)" strokeWidth="2" strokeLinecap="round" fill="none">
        <path d="M280 40 V276" />
      </g>

      <g {...line}>
        <path d="M24 276 H264 M296 276 H536" />

        {/* the charity's own door, and the charity at it */}
        <path d="M22 148 L56 124 L90 148" />
        <rect x="28" y="148" width="56" height="128" fill={PAPER} />
        <rect x="42" y="186" width="28" height="90" rx="2" fill={PAPER} />
        <path d="M64 232 h3" strokeWidth="5" />
        <circle cx="106" cy="172" r="15" fill={PAPER} />
        <path d="M88 232 C 88 208, 96 194, 106 194 C 116 194, 124 208, 124 232 Z" fill={PAPER} />
        <path d="M96 232 V276 M114 232 V276" />
        <path d="M122 206 L140 186" />
        <circle cx="146" cy="180" r="6" fill={PAPER} />

        {/* the listing it just pinned up, on its post */}
        <path d="M190 256 V276 M222 256 V276" />
        <rect x="156" y="112" width="104" height="144" rx="4" fill={PAPER} />

        {/* the same listing again, with the address changed */}
        <path d="M374 256 V276 M406 256 V276" />
        <rect x="340" y="112" width="104" height="144" rx="4" fill={PAPER} />

        {/* the pen waiting over the empty ring */}
        <path d="M490 130 L442 180" />
        <path d="M442 180 L432 192 L446 188 Z" fill={PAPER} />
      </g>

      {/* its own words, the same on both */}
      <g {...hint}>
        <path d="M170 142 h60 M170 154 h42 M170 166 h52" />
        <path d="M354 142 h60 M354 154 h42 M354 166 h52" />
      </g>

      {/* the address the charity set, written on the listing */}
      <g {...thin}>
        <rect x="170" y="184" width="76" height="26" rx="3" />
        <path d="M180 197 h34" />
        <rect x="354" y="184" width="76" height="26" rx="3" />
        <path d="M364 197 h46" />
      </g>

      {/* signed, and so ticked */}
      <circle cx="232" cy="197" r="8" fill={GREEN} stroke="var(--ink)" strokeWidth="2.4" />
      <g {...tick} strokeWidth="4.5">
        <path d="M174 230 l9 10 l19 -22" />
      </g>

      {/* changed, so unsigned: an empty seal where the signature was */}
      <g {...thin} stroke="var(--ink-subtle)" strokeDasharray="3 4">
        <circle cx="416" cy="197" r="9" />
      </g>

      {/* and the tick has come off the listing */}
      <g {...trace}>
        <path d="M376 238 C 400 254, 424 262, 448 264" />
      </g>
      <g {...tick} strokeWidth="4.5">
        <path d="M452 262 l9 10 l19 -22" transform="rotate(20 461 262)" />
      </g>

      {/* the pins that hold both listings up */}
      <g fill={GREEN}>
        <circle cx="208" cy="126" r="4.5" />
        <circle cx="392" cy="126" r="4.5" />
      </g>
    </svg>
  );
}
