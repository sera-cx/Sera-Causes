import { ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { Spinner } from "@/components/Empty";
import { Eyebrow } from "@/components/Eyebrow";
import { SectionHeader } from "@/components/SectionHeader";
import { Wallet } from "@/components/Wallet";
import { useSeo } from "@/hooks/useSeo";
import { CHALLENGE_STAKE, GSERA, LINKS, VOTING } from "@/lib/constants";
import { fmtDate, fmtGsera, fmtInt } from "@/lib/format";
import { useLatestEvents } from "@/lib/queries";
import { describeRecord } from "@/lib/record";
import { causeHref } from "@/lib/rules";

const EXPLORER = "https://sepolia.etherscan.io/tx/";

export function TechnologyPage() {
  useSeo("Technology", "How Care Share Donate works: one open list of causes, gifts that go straight to the cause, community verification, gSera, and the public record.");
  return (
    <div className="container max-w-4xl py-10 md:py-14">
      <SectionHeader kicker="Technology" title="How it works, for people who want to know." lede="Everything below is open source. Anyone can read the list, check the record, or run their own front end on it." size="lg" />

      <div className="prose-csd mt-10">
        <h2 id="registry">1. One open list of causes</h2>
        <p>Every cause is an entry in a registry contract on Ethereum. The entry holds the owner, the cause's own address, its status, the hash of its profile, and the outcome of each verification claim. The profile itself (name, story, photos, sources) is a JSON file the site hosts now and pins to IPFS before mainnet. The contract never reads it; front ends do.</p>
        <p>Because the list is public and the contract is open source, anyone can build another front end on the same 44 causes, or fork the whole thing for another country. The only rule in our own front end is that gifts in a different stablecoin are swapped through Sera.cx, nothing else.</p>

        <NoticeBoard />

        <h2 id="gifts">2. Your gift goes straight to the cause</h2>
        <p>Each cause has its own deposit address, an embedded wallet created under the owner's account for that cause. A gift is a stablecoin transfer to that address. If you give in a stablecoin the cause does not keep, the site asks Sera.cx for a swap with the cause's address as the recipient, and shows you the rate and fees before you confirm. Nothing is held back, there is no claiming step, and gifts are final.</p>
        <p>You can also send directly from any wallet or exchange. The address and a QR code are on every give page. The gift appears on the cause's public record when it arrives.</p>
        <p>The owner decides what the treasury does with arrivals: keep one currency (each arrival is converted through Sera.cx on arrival) or hold what arrives and convert from the dashboard when they choose. Every conversion and every withdrawal is on the record too.</p>

        <h2 id="verification">3. How charities get verified</h2>
        <p>Verification is a trust signal, not a gate on the money. It shows what has been checked, by whom, and how. A cause is verified one claim at a time. Each claim is a single fact with a yes or no: the organisation is registered; the registration is current; the payout wallet belongs to it; the work is real and current. Children's homes and care centres also need a care licence. Tax exemption and published accounts are extra badges.</p>
        <p>Evidence goes up first. Then helpers write a verification path: the official source they used, every step, the exact search string, what they found, a dated screenshot and a conflict-of-interest line. Paths are signed by the helper's wallet and are public and permanent, so anyone can repeat the check.</p>
        <p>Once a claim has {VOTING.minPaths} independent paths, voting opens for {VOTING.periodDays} days. Vote weight comes from reputation alone, between 1 and 5, never from gSera. A claim needs a total weight of {VOTING.quorumWeight} and {VOTING.thresholdPct}% saying Verified. Then a {VOTING.challengeWindowHours} hour challenge window lets anyone object by staking {fmtGsera(CHALLENGE_STAKE)} with counter-evidence. If nobody does, the result and a Merkle root of the inputs go on-chain, and anyone can recompute it with the published script.</p>
        <p>While we launch, the site runs in advisory mode: votes and tallies are shown, and a Sera.cx steward finalises each claim. Switching to community mode, where votes decide, is one setting. Stewards also pause a cause on a credible report of fraud or harm, and remove evidence that contains personal data. Every steward action is on the record with a written reason, and the plan is for their role to shrink to legal takedowns.</p>

        <h2 id="gsera">4. gSera for giving</h2>
        <p>A donor is a taker whose trade goes to a cause. Same balance as g.sera.cx, same season, same base rate: {fmtInt(GSERA.perUsd)} gSera per US$1, times your volume tier and streak, and {GSERA.heat.urgent}x for an urgent appeal. gSera is credited to the sending wallet when the gift arrives and passes screening. A gift that settles through a Sera.cx swap earns once, at the donor rate. Wallets linked to a cause's owner or payout wallet earn nothing on that cause, and gifts above US${fmtInt(GSERA.giftCapUsdPerWalletPerCausePer30d)} per wallet per cause in {GSERA.giftCapWindowDays} days earn 0x.</p>
        <p>Helping earns on the same scale: {fmtGsera(GSERA.helper.pathAgrees)} for a path the final outcome agrees with, {fmtGsera(GSERA.helper.voteAgrees)} for a vote in line with it, {fmtGsera(GSERA.helper.helpFulfilled)} for a fulfilled help request, {fmtGsera(GSERA.helper.listingVerified)} for listing a cause that reaches Verified. gSera earned from gifts and helping is tagged as charity gSera. It can be spent on g.sera.cx and staked on challenges, but it cannot buy Lucky Draw tickets. Charity gSera goes back to charity.</p>

        <h2 id="record">5. The record</h2>
        <p>Every listing, piece of evidence, path, vote, result, gift, conversion, withdrawal and update is on the cause's record, newest first. On-chain events link to their transaction. Signed messages are stored with their hash and committed in the Merkle root when a claim is finalised. The latest events across every cause:</p>
      </div>
      <LatestRecord />

      <div className="prose-csd">
        <h2 id="build">6. Build on it</h2>
        <p>
          The code is on{" "}
          <a href={LINKS.github} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          : the registry contract and tests, the shared rules package with the recompute script, the indexer and API, and this web app. The registry is on Sepolia now and moves to Ethereum mainnet at launch. To run your own front end, point it at the API or at the contract directly and read the profile JSON by its hash.
        </p>
        <ul>
          <li>Registry (Sepolia): published with the first deployment.</li>
          <li>API: <code>/api/v1</code>, public reads need no key.</li>
          <li>Recompute: <code>pnpm --filter @sera-causes/shared recompute &lt;inputs.json&gt;</code>.</li>
        </ul>

        <h2 id="safety">7. Safety</h2>
        <p>An independent security review of the contract happens before mainnet, not before Sepolia. Every gift and every voter passes KYT and KYA screening through kyt.sera.cx; flagged gifts earn no gSera. Personal data is redacted before upload and files with unredacted personal data are rejected. There is a bug bounty from launch. Report anything to security@sera.cx.</p>
        <p>
          Read the{" "}
          <Link href="/rules">rules</Link> for every number in one place.
        </p>
      </div>
    </div>
  );
}

/* A village notice board: the record that every house can read. Drawn as a
   scene, not a box diagram. */
function NoticeBoard() {
  return (
    <figure className="my-8 rounded-2xl bg-paper-warm p-6">
      <svg viewBox="0 0 640 260" role="img" aria-labelledby="nb-title" className="mx-auto h-auto w-full max-w-[560px]">
        <title id="nb-title">A notice board in a village square, with pinned notes that anyone passing can read</title>
        <g fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M40 232 H600" strokeWidth="2.5" />
          <rect x="150" y="48" width="340" height="150" rx="6" />
          <path d="M170 198 V232 M470 198 V232" />
          <path d="M150 48 L320 22 L490 48" />
          <rect x="178" y="74" width="80" height="56" rx="3" fill="var(--paper)" />
          <rect x="282" y="66" width="96" height="70" rx="3" fill="var(--paper)" />
          <rect x="404" y="80" width="64" height="48" rx="3" fill="var(--paper)" />
          <rect x="200" y="146" width="150" height="34" rx="3" fill="var(--paper)" />
          <path d="M190 90 h56 M190 102 h40 M190 114 h48" stroke="var(--ink-subtle)" />
          <path d="M294 84 h72 M294 96 h58 M294 108 h66 M294 120 h30" stroke="var(--ink-subtle)" />
          <path d="M414 96 h44 M414 108 h30" stroke="var(--ink-subtle)" />
          <path d="M212 158 h126 M212 170 h80" stroke="var(--ink-subtle)" />
          <circle cx="60" cy="200" r="14" />
          <path d="M60 214 V232 M46 232 H74" />
          <circle cx="560" cy="196" r="14" />
          <path d="M560 210 V232 M546 232 H574" />
          <path d="M92 128 c20 -40 60 -40 80 0" />
          <path d="M520 120 c16 -36 52 -36 68 0" />
        </g>
        <g fill="var(--sera)">
          <circle cx="218" cy="74" r="4" />
          <circle cx="330" cy="66" r="4" />
          <circle cx="436" cy="80" r="4" />
          <circle cx="275" cy="146" r="4" />
        </g>
      </svg>
      <figcaption className="mt-3 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-ink-subtle">The record is a notice board every house can read.</figcaption>
    </figure>
  );
}

function LatestRecord() {
  const q = useLatestEvents(10);
  if (q.isLoading) return <Spinner label="Loading the record" />;
  return (
    <div className="my-6 rounded-2xl border border-rule bg-card p-4 sm:p-5">
      <Eyebrow>Latest events</Eyebrow>
      <ol className="mt-3 divide-y divide-rule">
        {(q.data ?? []).map((e, i) => {
          const line = describeRecord(e, i);
          return (
            <li key={line.key} className="grid gap-0.5 py-2.5 sm:grid-cols-[150px_1fr_auto] sm:items-baseline sm:gap-3 text-[14px]">
              <time dateTime={e.at} className="font-mono text-[11.5px] text-ink-subtle tnum">
                {fmtDate(e.at, true)}
              </time>
              <span>
                <Link href={causeHref(e.causeId, e.causeSlug)} className="font-medium hover:text-sera-text">
                  {e.causeName}
                </Link>
                <span className="text-ink-muted">: {line.summary}</span>
                {line.by && (
                  <span className="text-ink-muted">
                    {" "}
                    by <Wallet address={line.by} you={false} />
                  </span>
                )}
              </span>
              {line.txHash && (
                <a href={`${EXPLORER}${line.txHash}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-[11px] text-sera-text" aria-label="Transaction">
                  tx <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
