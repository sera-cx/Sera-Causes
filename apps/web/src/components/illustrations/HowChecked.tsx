import { GREEN, PAPER, hint, line, tick, trace, type IllustrationProps } from "./common";

/**
 * How a cause gets checked.
 *
 * Top: four paper tags pegged on a line, taken one at a time. Two already
 * carry a tick, the third is under a magnifying glass, the fourth is still
 * blank. Bottom: what is going on under that magnifying glass, read left
 * to right. The evidence, the walk from the official register to a signed
 * and sealed page, hands going up, and an hourglass for the time left for
 * anyone to object.
 */
export function HowChecked({ className = "h-auto w-full", style }: IllustrationProps) {
  return (
    <svg viewBox="0 0 640 392" className={className} style={style} role="img" aria-label="Four paper tags pegged on a washing line, checked one at a time. The first two carry a green tick, the third is under a magnifying glass and the fourth is still blank. Below, the work behind that one check: a stack of evidence, footprints leading from the official register building to a signed and sealed page, three raised hands voting, and an hourglass for the time left for anyone to object." focusable="false">
      <g {...line}>
        {/* the line across the square */}
        <path d="M58 70 V210 M582 70 V210" />
        <path d="M58 84 C 200 110, 440 110, 582 84" />
        <path d="M150 98 V112 M270 105 V118 M390 107 V120 M510 102 V114" />

        {/* one tag per fact, taken one at a time */}
        <rect x="108" y="112" width="84" height="68" rx="4" fill={PAPER} />
        <rect x="228" y="118" width="84" height="68" rx="4" fill={PAPER} />
        <rect x="348" y="120" width="84" height="68" rx="4" fill={PAPER} />
        <rect x="468" y="114" width="84" height="68" rx="4" fill={PAPER} />

        {/* the one being looked at right now */}
        <circle cx="398" cy="152" r="32" strokeWidth="3" />
        <path d="M420 175 L447 202" strokeWidth="6" />
      </g>

      <g {...hint}>
        <path d="M122 130 h46 M122 142 h32" />
        <path d="M242 136 h46 M242 148 h32" />
        <path d="M362 138 h46 M362 150 h30" />
        <path d="M482 132 h46 M482 144 h32 M482 156 h40" />
      </g>

      {/* two facts already settled */}
      <g {...tick}>
        <path d="M128 158 l12 13 l24 -28" />
        <path d="M248 164 l12 13 l24 -28" />
      </g>

      {/* down into the work behind the one being checked */}
      <g {...trace}>
        <path d="M390 192 V250" />
      </g>

      <g transform="translate(0 -40)">
        <g {...line}>
          <path d="M44 402 H596" />

          {/* the evidence that went up first */}
          <rect x="76" y="330" width="60" height="62" rx="3" fill={PAPER} />
          <rect x="68" y="340" width="60" height="52" rx="3" fill={PAPER} />
          <rect x="60" y="350" width="60" height="42" rx="3" fill={PAPER} />

          {/* the official register, and the walk from it */}
          <rect x="190" y="330" width="88" height="62" />
          <path d="M182 330 L234 300 L286 330" />
          <path d="M208 346 V392 M234 346 V392 M260 346 V392" />

          {/* what the helper writes down, signed and sealed */}
          <rect x="344" y="330" width="58" height="62" rx="3" fill={PAPER} />

          {/* hands going up */}
          <rect x="416" y="350" width="28" height="26" rx="5" fill={PAPER} />
          <path d="M419 350 c0 -8 8 -8 8 0 M428 350 c0 -10 9 -10 9 0 M438 350 c0 -8 8 -8 8 0" />
          <path d="M416 360 c-7 -1 -8 8 -2 9" />
          <path d="M430 376 V402" />
          <rect x="454" y="338" width="28" height="26" rx="5" fill={PAPER} />
          <path d="M457 338 c0 -8 8 -8 8 0 M466 338 c0 -10 9 -10 9 0 M476 338 c0 -8 8 -8 8 0" />
          <path d="M454 348 c-7 -1 -8 8 -2 9" />
          <path d="M468 364 V402" />
          <rect x="492" y="356" width="28" height="26" rx="5" fill={PAPER} />
          <path d="M495 356 c0 -8 8 -8 8 0 M504 356 c0 -10 9 -10 9 0 M514 356 c0 -8 8 -8 8 0" />
          <path d="M492 366 c-7 -1 -8 8 -2 9" />
          <path d="M506 382 V402" />

          {/* and then the wait, so anyone can object */}
          <path d="M540 326 H592 M540 402 H592" />
          <path d="M548 326 L584 326 L562 364 L584 402 L548 402 L570 364 Z" fill={PAPER} />
        </g>

        <g {...hint}>
          <path d="M70 362 h40 M70 374 h26" />
          <path d="M354 344 h38 M354 356 h26 M354 368 h32" />
        </g>

        {/* the walk from the register to the page */}
        <g fill="var(--sera-text)">
          <ellipse cx="300" cy="388" rx="5.4" ry="3.4" transform="rotate(-18 300 388)" />
          <ellipse cx="318" cy="379" rx="5.4" ry="3.4" transform="rotate(-18 318 379)" />
          <ellipse cx="336" cy="388" rx="5.4" ry="3.4" transform="rotate(-18 336 388)" />
        </g>

        <circle cx="384" cy="378" r="11" fill={GREEN} stroke="var(--ink)" strokeWidth="2.4" />
        <path d="M554 396 H578 L566 378 Z" fill={GREEN} />
      </g>
    </svg>
  );
}
