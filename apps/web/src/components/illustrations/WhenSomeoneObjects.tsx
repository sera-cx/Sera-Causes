import { GREEN, PAPER, hint, line, thin, tick, trace, type IllustrationProps } from "./common";

/** One raised hand, voting again. */
function Hand({ x, y }: { x: number; y: number }) {
  return (
    <>
      <rect x={x} y={y} width="26" height="24" rx="5" fill={PAPER} />
      <path d={`M${x + 3} ${y} c0 -7 7 -7 7 0 M${x + 11} ${y} c0 -9 8 -9 8 0 M${x + 20} ${y} c0 -7 7 -7 7 0`} />
      <path d={`M${x} ${y + 9} c-6 -1 -7 7 -2 8`} />
      <path d={`M${x + 13} ${y + 24} V316`} />
    </>
  );
}

/**
 * What happens when somebody objects to a result.
 *
 * Read left to right. A claim has been settled with a tick. Somebody puts
 * up evidence against it and stakes a gSera coin, which locks the coin up
 * until the result. Voting on that one claim opens again, with the
 * objection pinned over the claim, and the clock runs. Then the fork: the
 * objection is upheld, the tick becomes a cross and the coin comes back
 * with XP; or it is not upheld, the claim keeps its tick and the staked
 * coin is burned.
 */
export function WhenSomeoneObjects({ className = "h-auto w-full", style }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 660 340"
      className={className}
      style={style}
      role="img"
      aria-label="Read left to right. A settled claim carries a green tick. Somebody puts up a stack of evidence against it and stakes a green gSera coin, which locks the coin up. Voting on that claim opens again, with the objection pinned over the claim, three hands raised and an hourglass running. Then the path forks. Upheld: the tick becomes a cross, the staked coin comes back and an XP rosette comes with it. Not upheld: the claim keeps its tick and the staked coin goes up in smoke."
      focusable="false"
    >
      <g {...line}>
        <path d="M20 316 H640" />

        {/* the claim, settled, hanging on its peg */}
        <path d="M34 42 H160" />
        <path d="M92 42 V56" />
        <rect x="50" y="56" width="84" height="72" rx="4" fill={PAPER} />

        {/* the evidence put up against it */}
        <rect x="36" y="188" width="56" height="60" rx="3" fill={PAPER} />
        <rect x="28" y="198" width="56" height="50" rx="3" fill={PAPER} />

        {/* the same claim, open again, with the objection pinned over it */}
        <path d="M226 42 H414" />
        <path d="M300 42 V56" />
        <rect x="258" y="56" width="84" height="72" rx="4" fill={PAPER} />
        <rect x="286" y="80" width="80" height="68" rx="3" fill={PAPER} />

        {/* voting again */}
        <Hand x={236} y={236} />
        <Hand x={282} y={220} />
        <Hand x={328} y={246} />

        {/* and the time it runs for */}
        <path d="M380 192 H422 M380 272 H422" />
        <path d="M386 192 L416 192 L401 232 L416 272 L386 272 L401 232 Z" fill={PAPER} />

        {/* upheld: the claim flips */}
        <rect x="470" y="70" width="64" height="58" rx="4" fill={PAPER} />
        <path d="M486 88 L514 112 M514 88 L486 112" strokeWidth="5" />

        {/* not upheld: the claim stands */}
        <rect x="470" y="226" width="64" height="58" rx="4" fill={PAPER} />

        {/* the staked coin, gone up in smoke */}
        <path d="M588 222 c 8 -10 -6 -16 2 -26 M606 218 c 8 -10 -6 -16 2 -26 M624 224 c 8 -10 -6 -16 2 -26" />
      </g>

      <g {...hint}>
        <path d="M62 74 h46 M62 86 h30" />
        <path d="M38 212 h36 M38 224 h22" />
        <path d="M296 98 h58 M296 112 h40 M296 126 h50" />
      </g>

      {/* the tick the claim started with, and the one it keeps if nothing changes */}
      <g {...tick} strokeWidth="4.5">
        <path d="M60 104 l9 10 l19 -22" />
        <path d="M482 250 l8 9 l17 -20" />
      </g>

      {/* the coin staked, and the coin that comes back */}
      <circle cx="128" cy="234" r="24" fill={PAPER} stroke="var(--ink)" strokeWidth="2.4" />
      <circle cx="128" cy="234" r="16" fill="none" stroke="var(--sera-text)" strokeWidth="2.4" />
      <text x="128" y="243" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="20" fontWeight="700" fill="var(--sera-text)">
        g
      </text>
      {/* the shackle: staked means locked up until the result */}
      <g {...thin}>
        <path d="M117 213 C 117 199, 139 199, 139 213" />
      </g>
      <circle cx="568" cy="100" r="22" fill={PAPER} stroke="var(--ink)" strokeWidth="2.4" />
      <circle cx="568" cy="100" r="15" fill="none" stroke="var(--sera-text)" strokeWidth="2.4" />
      <text x="568" y="108" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="19" fontWeight="700" fill="var(--sera-text)">
        g
      </text>

      {/* and the XP that comes with it */}
      <circle cx="620" cy="104" r="19" fill={PAPER} stroke="var(--ink)" strokeWidth="2.4" />
      <text x="620" y="111" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="15" fontWeight="700" fill="var(--sera-text)">
        XP
      </text>

      {/* the stake that is burned: the same coin, with nothing left in it */}
      <circle cx="606" cy="254" r="22" fill={PAPER} stroke="var(--ink)" strokeWidth="2.4" strokeDasharray="5 6" />

      {/* the sand still running */}
      <path d="M390 266 H412 L401 248 Z" fill={GREEN} />

      {/* the pin that holds the objection over the claim */}
      <g fill={GREEN}>
        <circle cx="298" cy="90" r="4.5" />
      </g>

      <g {...trace}>
        {/* staked against that claim, which opens again */}
        <path d="M150 210 C 192 182, 226 162, 252 150" />
        {/* and then one of two ends */}
        <path d="M428 222 C 448 182, 452 130, 462 104" />
        <path d="M428 242 C 446 248, 452 252, 462 254" />
        {/* the coin on its way back */}
        <path d="M540 108 C 550 106, 558 104, 564 102" />
      </g>
    </svg>
  );
}
