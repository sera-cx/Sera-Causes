/* Footer after sera.cx's FooterStack Footer: ink background, white wordmark. */
import { Link } from "wouter";
import { useSignInNote } from "@/lib/auth";
import { LINKS } from "@/lib/constants";
import { SeraLogo } from "./SeraLogo";

const COLS = [
  { head: "Care Share Donate", links: [["Causes", "/causes"], ["Verify a charity", "/verify"], ["Add a cause", "/add"], ["Leaderboards", "/leaderboards"], ["My gSera", "/me"]] },
  { head: "How it works", links: [["Technology", "/technology"], ["Rules and points", "/rules"], ["Verification", "/rules#verification"], ["gSera", "/rules#gsera"]] },
  { head: "Sera.cx", links: [["GitHub", LINKS.github], ["g.sera.cx", LINKS.gsera], ["Terms", LINKS.terms], ["Privacy", LINKS.privacy], ["Brand", LINKS.brand]] },
];

export function Footer() {
  const signInNote = useSignInNote();
  return (
    <footer className="no-print" style={{ background: "#0B1426", color: "rgba(255,255,255,0.7)" }}>
      <div className="container py-12 md:py-16">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:gap-8">
          <div>
            <SeraLogo variant="white" className="h-5" />
            <p className="mt-5 text-[15px] leading-[1.55] text-white/60 max-w-sm">Care Share Donate is open source. Give in stablecoins, help check the charities, and see where every gift goes.</p>
          </div>
          {COLS.map((col) => (
            <div key={col.head}>
              <div className="mb-4 font-mono text-[10px] uppercase tracking-[0.18em] text-white/50">{col.head}</div>
              <ul className="space-y-2.5 text-[14px]">
                {col.links.map(([label, href]) => (
                  <li key={label}>
                    {href.startsWith("http") ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-white rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00D26A]">
                        {label}
                      </a>
                    ) : (
                      <Link href={href} className="text-white/80 hover:text-white rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00D26A]">
                        {label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {signInNote && <p className="mt-10 text-[13px] text-white/50">{signInNote}</p>}
        <div className="mt-12 flex flex-col gap-3 border-t border-white/10 pt-6 md:flex-row md:items-center md:justify-between">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/50">2026 Sera.cx. Settled on Sera.cx. Not a licensed charity or fundraiser.</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/50">causes.sera.cx</span>
        </div>
      </div>
    </footer>
  );
}
