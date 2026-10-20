import { GREEN, PAPER, hint, line, trace, type IllustrationProps } from "./common";

/**
 * Build on it.
 *
 * The plans lie open on a stand in the square, where anyone may copy them.
 * Two people are part-way through building their own front on to the same
 * list: a shop window with a ladder against it, and a screen going up on a
 * post. Both show what the plans show.
 */
export function BuildOnIt({ className = "h-auto w-full", style }: IllustrationProps) {
  return (
    <svg viewBox="0 0 520 270" className={className} style={style} role="img" aria-label="Open plans on a stand in the square. On one side a shop window is being built with a ladder leaning against it, on the other a screen is going up on a post beside a hammer. Both show the same list of causes as the plans." focusable="false">
      <g {...line}>
        <path d="M16 252 H504" />

        {/* the plans, open for anyone to copy */}
        <path d="M248 252 V208 M226 252 H270" />
        <path d="M248 208 L160 196 L166 158 L248 170 Z" fill={PAPER} />
        <path d="M248 208 L336 196 L330 158 L248 170 Z" fill={PAPER} />
        <path d="M248 170 V208" />

        {/* someone's shop window, half up */}
        <rect x="36" y="128" width="108" height="124" />
        <path d="M28 128 C 36 116, 48 116, 56 128 C 64 116, 76 116, 84 128 C 92 116, 104 116, 112 128 C 120 116, 132 116, 140 128 C 143 123, 148 122, 152 128" />
        <rect x="52" y="150" width="76" height="66" fill={PAPER} />
        <path d="M152 252 L128 126 M166 252 L142 126" />
        <path d="M133 222 L157 222 M138 192 L162 192 M143 162 L167 162" />
        <path d="M68 216 V252" />

        {/* someone else's screen, going up on a post */}
        <path d="M424 252 V190 M400 252 H448" />
        <rect x="372" y="106" width="104" height="84" rx="5" fill={PAPER} />
        <path d="M494 252 L484 222" />
        <path d="M490 222 L476 216 L482 204 L496 210 Z" fill={PAPER} />
      </g>

      {/* the same list, three times over */}
      <g {...hint}>
        <path d="M176 180 h46 M176 190 h32" />
        <path d="M272 180 h46 M272 190 h32" />
        <path d="M64 166 h48 M64 178 h34 M64 190 h42" />
        <path d="M386 124 h50 M386 136 h36 M386 148 h44 M386 160 h28" />
      </g>

      <g {...trace}>
        <path d="M170 188 C 152 184, 138 182, 130 181" />
        <path d="M330 190 C 352 180, 368 168, 378 156" />
      </g>

      {/* the place they were left open at */}
      <path d="M238 169 V194 L244 187 L250 194 V171 Z" fill={GREEN} stroke="var(--ink)" strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}
