/* Top navigation, restrained and left-anchored, after sera.cx's Nav.tsx.
   Links: Causes, Verify, Add a cause, Technology. Signed in: Dashboard.
   Right: the gSera chip, which opens /me, and Sign in.
   With no sign-in configured there is no Sign in button at all. Mobile:
   hamburger. */
import { LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { fmtInt } from "@/lib/format";
import { useMe } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { SeraLogoAuto } from "./SeraLogo";
import { Button } from "./ui/button";

const LINKS = [
  { to: "/causes", label: "Causes" },
  { to: "/verify", label: "Verify" },
  { to: "/add", label: "Add a cause" },
  { to: "/technology", label: "Technology" },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  const { user, signIn, signOut, busy, ready, canSignIn } = useAuth();
  const me = useMe();

  const isActive = (path: string) => location === path || (path !== "/" && location.startsWith(path + "/")) || (path === "/causes" && location.startsWith("/c/"));
  const links = user ? [...LINKS, { to: "/dashboard", label: "Dashboard" }] : LINKS;

  const linkCls = (path: string) =>
    cn("font-sans text-[15px] font-medium tracking-tight whitespace-nowrap transition-colors rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring", isActive(path) ? "text-sera-text" : "text-ink-muted hover:text-ink");

  const gsera = me.data ? (me.data.gsera?.spendable ?? me.data.ledger.credited) : null;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-rule backdrop-blur-sm no-print" style={{ background: "color-mix(in srgb, var(--paper) 90%, transparent)" }}>
      {/* Ringgit on this site is MYRT, the ringgit stablecoin YouApp issues.
          It sits in a strip of its own because the nav row below is already
          full, and it is a partner mark, not a claim about who moves the
          money: settlement runs through Sera.cx. */}
      <div className="hidden border-b border-rule/60 sm:block">
        <div className="container flex h-8 items-center justify-end">
          <a
            href="https://youapp.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-ink-subtle transition-colors hover:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="whitespace-nowrap font-mono text-[10.5px] uppercase tracking-[0.1em]">Ringgit gifts use MYRT from</span>
            <img src="/brand/youapp-logo.svg" alt="YouApp" className="h-[15px] w-auto" width={118} height={30} />
          </a>
        </div>
      </div>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-paper">
        Skip to content
      </a>
      <nav className="container flex h-[64px] items-center justify-between gap-2" aria-label="Main">
        <div className="flex min-w-0 items-center gap-8">
          <Link href="/" aria-label="Care Share Donate home" className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
            {/* The wordmark is 186px wide at its usual 18px height, which on a
                360px screen runs straight into the gSera pill. It steps down
                to 16px there, and the pill drops its label, so the two never
                meet. */}
            <SeraLogoAuto className="h-4 sm:h-[18px]" />
            <span className="hidden sm:inline font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-subtle border-l border-rule pl-2.5">Causes</span>
          </Link>
          <div className="hidden lg:flex items-center gap-6">
            {links.map((l) => (
              <Link key={l.to} href={l.to} className={linkCls(l.to)} aria-current={isActive(l.to) ? "page" : undefined}>
                {isActive(l.to) && <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full mr-1.5 align-middle bg-sera" />}
                {l.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {/* The wallet address used to sit here as a pill. Once signed in the
              row carries the wordmark, five links, the gSera pill and sign
              out, and the address ran into the Dashboard link between about
              1024 and 1200px. It is the least useful of them, because the
              full address is on /me, which the gSera pill opens. */}
          {user && (
            <Link href="/me" className="inline-flex h-9 min-h-11 items-center gap-2 rounded-full border border-rule bg-paper-warm px-3 font-mono text-[12.5px] tnum text-ink hover:border-ink/40 lg:min-h-9 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" aria-label={gsera !== null ? `${fmtInt(gsera)} gSera, open My gSera` : "My gSera"}>
              <span className="h-1.5 w-1.5 rounded-full bg-sera" aria-hidden />
              {gsera !== null ? fmtInt(gsera) : ""}
              <span className={gsera !== null ? "hidden sm:inline" : undefined}>gSera</span>
            </Link>
          )}
          {ready && !user && canSignIn && (
            <Button size="sm" onClick={() => void signIn()} disabled={busy}>
              {busy ? "Signing in" : "Sign in"}
            </Button>
          )}
          {user && (
            <Button size="sm" variant="ghost" onClick={() => void signOut()} className="hidden lg:inline-flex" aria-label="Sign out">
              <LogOut className="h-4 w-4" aria-hidden /> <span className="hidden xl:inline">Sign out</span>
            </Button>
          )}
          <button type="button" onClick={() => setOpen(!open)} className="lg:hidden inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-ring" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="mobile-menu">
            {open ? <X size={22} aria-hidden /> : <Menu size={22} aria-hidden />}
          </button>
        </div>
      </nav>

      {open && (
        <div id="mobile-menu" className="lg:hidden border-t border-rule bg-paper">
          <div className="container flex flex-col gap-1 py-3">
            {links.map((l) => (
              <Link key={l.to} href={l.to} onClick={() => setOpen(false)} className={cn("flex min-h-11 items-center gap-2 rounded-md px-2 text-[16px] font-medium", isActive(l.to) ? "text-sera-text" : "text-ink-muted")}>
                {isActive(l.to) && <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-sera" />}
                {l.label}
              </Link>
            ))}
            {user && (
              <>
                <Link href="/me" onClick={() => setOpen(false)} className="flex min-h-11 items-center px-2 text-[16px] font-medium text-ink-muted">My gSera</Link>
                <Link href="/leaderboards" onClick={() => setOpen(false)} className="flex min-h-11 items-center px-2 text-[16px] font-medium text-ink-muted">Leaderboards</Link>
                <button type="button" onClick={() => { setOpen(false); void signOut(); }} className="flex min-h-11 items-center justify-start px-2 text-left text-[16px] font-medium text-ink-muted">Sign out</button>
              </>
            )}
            {!user && (
              <>
                <Link href="/leaderboards" onClick={() => setOpen(false)} className="flex min-h-11 items-center px-2 text-[16px] font-medium text-ink-muted">Leaderboards</Link>
                <Link href="/rules" onClick={() => setOpen(false)} className="flex min-h-11 items-center px-2 text-[16px] font-medium text-ink-muted">Rules and points</Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
