import { DEEP, GREEN, PAPER, line, trace, type IllustrationProps } from "./common";

/**
 * The treasury, as two jars on a shelf.
 *
 * The same three coins fall towards both jars. The left one has a funnel:
 * whatever goes in comes out as one matching kind, so that jar only ever
 * holds one currency. The right one takes coins exactly as they arrive and
 * has a tap for changing them later. The switch between the jars is the
 * point: the cause picks, not us.
 */
export function TwoJars({ className = "h-auto w-full", style }: IllustrationProps) {
  return (
    <svg viewBox="0 0 520 320" className={className} style={style} role="img" aria-label="Two glass jars on a shelf. The same square, triangle and circle coins fall towards both. The left jar has a funnel, so everything inside it has become one matching kind. The right jar holds the coins exactly as they arrived and has a tap on its side for changing them later. A switch stands between the two jars." focusable="false">
      <g {...line}>
        <path d="M20 302 H500" />
        <rect x="36" y="262" width="448" height="12" rx="3" fill={DEEP} />
        <path d="M62 274 V302 M458 274 V302" />

        {/* the same mix falling towards both */}
        <rect x="104" y="56" width="24" height="24" rx="7" fill={DEEP} />
        <path d="M152 54 L167 80 H137 Z" fill={DEEP} />
        <circle cx="186" cy="66" r="12" fill={DEEP} />
        <rect x="346" y="56" width="24" height="24" rx="7" fill={DEEP} />
        <path d="M394 54 L409 80 H379 Z" fill={DEEP} />
        <circle cx="426" cy="66" r="12" fill={DEEP} />

        {/* left: the funnel that makes everything one kind */}
        <path d="M96 112 H180 L152 152 H124 Z" fill={PAPER} />
        <path d="M102 158 H174" />
        <path d="M108 158 V174 M168 158 V174" />
        <path d="M108 174 C 92 180, 86 192, 86 206 V248 C 86 256, 92 262, 100 262 H176 C 184 262, 190 256, 190 248 V206 C 190 192, 184 180, 168 174 Z" fill={PAPER} />

        {/* right: kept as it comes, with a tap for later */}
        <path d="M350 158 H422" />
        <path d="M356 158 V174 M416 158 V174" />
        <path d="M356 174 C 340 180, 334 192, 334 206 V248 C 334 256, 340 262, 348 262 H424 C 432 262, 438 256, 438 248 V206 C 438 192, 432 180, 416 174 Z" fill={PAPER} />
        <path d="M438 214 H462 V238" />
        <path d="M454 204 V214 M446 204 H464" />

        {/* the switch: the cause's choice, not ours */}
        <path d="M262 262 V236" />
        <rect x="228" y="206" width="68" height="28" rx="14" fill={PAPER} />
      </g>

      {/* and what each jar ends up holding */}
      <g stroke="var(--ink)" strokeWidth="2.4" strokeLinejoin="round">
        <circle cx="112" cy="240" r="12" fill={GREEN} />
        <circle cx="138" cy="240" r="12" fill={GREEN} />
        <circle cx="164" cy="240" r="12" fill={GREEN} />
        <circle cx="125" cy="216" r="12" fill={GREEN} />
        <circle cx="151" cy="216" r="12" fill={GREEN} />

        <rect x="348" y="226" width="24" height="24" rx="7" fill={DEEP} />
        <path d="M396 222 L412 250 H380 Z" fill={DEEP} />
        <circle cx="424" cy="238" r="12" fill={GREEN} />

        <circle cx="246" cy="220" r="10" fill={GREEN} />
      </g>

      <g {...trace}>
        <path d="M116 84 V108 M152 84 V108 M186 80 V108" />
        <path d="M358 84 V170 M394 84 V170 M426 80 V170" />
      </g>
    </svg>
  );
}
