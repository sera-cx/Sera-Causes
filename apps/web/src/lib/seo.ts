/**
 * seo.ts: the one source of per-route titles, meta descriptions and canonical
 * paths, plus the FAQ copy that both /rules and its FAQPage schema read.
 *
 * A description is read by someone scanning a results page, often on a phone,
 * often not in their first language. Keep them in the same plain English as
 * the pages: short sentences, everyday words, and no term the page itself
 * would not use.
 *
 * Follows the pattern in the sera.cx home repo (client/src/lib/seo.ts). Two rules keep it
 * useful:
 *
 * 1. PURE DATA. No React, no browser globals, no `@/` alias imports beyond
 *    plain data modules. A future SSR entry (see the TODO in vite.config.ts)
 *    has to import this file to put the same tags in the first HTML response,
 *    and index.html carries the site-level copy by hand until it does.
 *
 * 2. An answer in a FAQPage block has to be visible on the page. The /rules
 *    page renders the same RULES_FAQS array it feeds to the schema, so the
 *    two cannot drift. Never add a question the page does not answer.
 *
 * TODO(prerender): this app is a single-page app with no server rendering, so
 * everything below is applied by `useSeo` and `useJsonLd` in a useEffect.
 * Googlebot and Bingbot run JavaScript and will see it. Most answer engines
 * and chat crawlers (GPTBot, ClaudeBot, PerplexityBot, Slack, WhatsApp,
 * Facebook, X) do not, so they only see the static shell in index.html. Until
 * the SSR entry lands, per-route titles, per-cause descriptions and the
 * NonprofitOrganization and FAQPage blocks are invisible to them. Prerender
 * at least /, /causes, /rules, /technology, /helpers and every /c/:idSlug.
 */

export const SITE = "https://causes.sera.cx";
export const SITE_NAME = "Care Share Donate on Sera.cx";
export const TITLE_SUFFIX = SITE_NAME;
export const DEFAULT_OG_IMAGE = "/photos/hero.jpg";
export const TWITTER_SITE = "@sera_cx";

export type OgType = "website" | "article" | "profile";

export interface RouteSeo {
  /** The full <title>. Already carries the suffix where one is wanted. */
  title: string;
  description: string;
  /** Canonical path, for example "/causes". Always starts with a slash. */
  path: string;
  /** Site-relative path or absolute same-origin URL. */
  ogImage?: string;
  ogType?: OgType;
  keywords?: string;
  /** True on routes that should not be indexed (dashboards, embeds, posters). */
  noIndex?: boolean;
}

/** "Find a cause" becomes "Find a cause | Care Share Donate on Sera.cx". */
export function withSuffix(title: string): string {
  return title ? `${title} | ${TITLE_SUFFIX}` : TITLE_SUFFIX;
}

/** Site-relative paths become absolute. Anything off-site is dropped. */
export function absoluteUrl(input: string | undefined): string {
  const s = (input ?? "").trim();
  if (!s) return `${SITE}${DEFAULT_OG_IMAGE}`;
  if (s.startsWith("/") && !s.startsWith("//")) return `${SITE}${s}`;
  try {
    const u = new URL(s);
    if (u.origin === SITE) return u.href;
  } catch {
    /* fall through to the default */
  }
  return `${SITE}${DEFAULT_OG_IMAGE}`;
}

/* ------------------------------------------------------------------ */
/* Static routes                                                       */
/* ------------------------------------------------------------------ */

export const ROUTE_SEO = {
  home: {
    title: SITE_NAME,
    description:
      "Give to charities in Malaysia. Turtle hatcheries, animal shelters, children's homes, food banks and flood relief. Your gift goes straight to the charity, nothing is held back on the way, and anyone can help check a charity before giving.",
    path: "/",
    keywords: "donate Malaysia, charity Malaysia, stablecoin donation, crypto donation Malaysia, verified charity, MYRT, USDC donation",
  },
  causes: {
    title: withSuffix("Find a charity to give to in Malaysia"),
    description:
      "Every charity on the list, with filters for what you care about, which state it is in, and how far the checks have got. You can give in ringgit, Singapore dollars or US dollars.",
    path: "/causes",
    keywords: "charities in Malaysia, donate to Malaysian charity, animal shelter Malaysia, children's home Malaysia, food bank Malaysia",
  },
  add: {
    title: withSuffix("List your organisation"),
    description:
      "Run a charity in Malaysia? List it yourself in a few minutes. You set the wallet that receives the gifts, so it is your organisation's own. There is nothing to pay to be on the list.",
    path: "/add",
    keywords: "list a charity, register charity for donations, charity fundraising Malaysia, accept stablecoin donations",
  },
  verify: {
    title: withSuffix("Be a helper: check a charity"),
    description:
      "Helpers check the charities on Care Share Donate. Pick one fact, look it up on the official register, write down exactly what you did, and earn Care XP when the result agrees with you. No wallet balance needed.",
    path: "/helpers",
    keywords: "volunteer charity checking Malaysia, verify a charity, charity due diligence, ROS check, SSM check, LHDN 44(6)",
  },
  rules: {
    title: withSuffix("Rules and how we check charities"),
    description:
      "Every rule and every number in one place, written so a 15 year old can follow it: who lists a cause, how a charity is checked, how points work, and what we do with your data.",
    path: "/rules",
    keywords: "charity verification rules, gSera points, Care XP, donation rules Malaysia",
  },
  technology: {
    title: withSuffix("How it works"),
    description:
      "How Care Share Donate works, in pictures: one open list of charities, gifts that go straight to the charity, checks anyone can repeat, and a record anyone can read.",
    path: "/technology",
    keywords: "how donations work, open charity list, public donation record, stablecoin giving",
  },
  leaderboards: {
    title: withSuffix("Leaderboards"),
    description: "Who gives, who checks charities, and which causes have received the most. The last 30 days, and all time.",
    path: "/leaderboards",
  },
  me: {
    title: withSuffix("My gSera and Care XP"),
    description: "Your gSera from giving, your Care XP from helping, every gift you have made, and every charity you have helped check.",
    path: "/me",
    noIndex: true,
  },
  dashboard: {
    title: withSuffix("Your causes"),
    description: "Look after the causes you have listed: what has arrived, what you have withdrawn, your updates, your sharing tools and your payout wallet.",
    path: "/dashboard",
    noIndex: true,
  },
  notFound: {
    title: withSuffix("Page not found"),
    description: "We could not find that page. The cause may have moved, or the link may have a typo in it. Try the full list of charities instead.",
    path: "/404",
    noIndex: true,
  },
} satisfies Record<string, RouteSeo>;

/* ------------------------------------------------------------------ */
/* Dynamic routes                                                      */
/* ------------------------------------------------------------------ */

/**
 * A results page shows about 160 characters of a description, so a cause's
 * own summary comes first and the standing sentence is only added if it
 * fits. Nothing is cut mid-word.
 */
function clamp(text: string, max = 165): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:]$/, "")}…`;
}

export function causeSeo(cause: { id: number; slug: string; name: string; summary?: string; town?: string; state?: string; category?: string; photoUrl?: string | null }): RouteSeo {
  const place = [cause.town, cause.state].filter(Boolean).join(", ") || "Malaysia";
  const summary = (cause.summary ?? "").trim();
  const standing = `Give to ${cause.name} in ${place}. Your gift goes straight to the charity.`;
  return {
    title: withSuffix(`${cause.name}, ${place}`),
    description: summary ? clamp(summary.length + standing.length + 1 <= 165 ? `${summary} ${standing}` : summary) : clamp(standing),
    path: `/c/${cause.id}-${cause.slug}`,
    ogImage: `/og/cause/${cause.id}.png`,
    ogType: "profile",
    keywords: [cause.name, cause.category, place, "donate", "Malaysia charity"].filter(Boolean).join(", "),
  };
}

export function giveSeo(cause: { id: number; name: string }): RouteSeo {
  return {
    title: withSuffix(`Give to ${cause.name}`),
    description: `Give to ${cause.name} in ringgit, Singapore dollars or US dollars. Your gift goes straight to the charity's own address, and nothing is held back on the way.`,
    path: `/give/${cause.id}`,
  };
}

export function shareSeo(cause: { id: number; slug: string; name: string }): RouteSeo {
  return {
    title: withSuffix(`Share ${cause.name}`),
    description: `Tell someone about ${cause.name}: a link with a preview card, buttons for chat apps, a button for your website and a printable poster with a QR code.`,
    path: `/c/${cause.id}/share`,
  };
}

export function claimSeo(cause: { id: number; name: string }, claim: string, label: string): RouteSeo {
  return {
    title: withSuffix(`${claim}: ${label}, ${cause.name}`),
    description: `How people checked "${label}" for ${cause.name}: the evidence, how each person checked it, the votes, and the result.`,
    path: `/helpers/${cause.id}/${claim}`,
  };
}

/* ------------------------------------------------------------------ */
/* FAQ copy, shared between the /rules page and its FAQPage schema     */
/* ------------------------------------------------------------------ */

export interface Faq {
  q: string;
  a: string;
}

export const RULES_FAQS: readonly Faq[] = [
  {
    q: "Can the charity use my gift straight away?",
    a: "Yes. The gift goes to the cause's own address, and the organisation can spend it from day one. Verification tells you what has been checked about the organisation. It does not lock the money.",
  },
  {
    q: "Can I get a gift back?",
    a: "No. A gift is final, like putting cash in a collection tin. Read the trust card on the cause page before you give.",
  },
  {
    q: "Why do some causes say New?",
    a: "Organisations list themselves here. New means nobody has checked the listing yet. The pill and the checks bar sit on every card, so you can see that at a glance before you give.",
  },
  {
    q: "Who sets the wallet that receives my gift?",
    a: "The organisation does, when it lists itself. It is the organisation's own wallet by design. If the wallet is ever changed, the cause loses Verified until the payout wallet claim is checked again with a new signed message.",
  },
  {
    q: "What happens if a charity's payout wallet changes?",
    a: "Verified is removed, and the payout wallet claim (C3) has to be checked again with a new signed message.",
  },
  {
    q: "Which stablecoins can I use?",
    a: "MYRT for ringgit, XSGD for Singapore dollars, and USDT or USDC for US dollars. If the cause keeps a different one, the site swaps it through Sera.cx and shows you the rate and the costs before you confirm.",
  },
  {
    q: "Which countries does this cover?",
    a: "Malaysia, for the first run. That is where we can check a charity against a public register ourselves. Other countries follow in 2027, one at a time.",
  },
  {
    q: "Can I spend my Care XP?",
    a: "No. XP is a standing on community.sera.cx. It is not money and not a balance. gSera is the balance, and giving is what earns it.",
  },
  {
    q: "Is this a licensed charity or fundraiser?",
    a: "No. Care Share Donate is an open list and a set of tools on Sera.cx. Gifts go to the organisations themselves. Check the C5 badge if you need a tax-deductible receipt.",
  },
];

/** Static routes for sitemap.xml and for a future prerender list. */
export const STATIC_ROUTES: readonly string[] = ["/", "/causes", "/add", "/helpers", "/rules", "/technology", "/leaderboards"];
