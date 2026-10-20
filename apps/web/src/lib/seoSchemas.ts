/**
 * Pre-built JSON-LD blocks, after the sera.cx home repo, client/src/lib/seoSchemas.ts.
 * Each function returns a plain object for `useJsonLd`.
 *
 * Pure data: no React, no browser globals, so a future SSR entry can put the
 * same blocks in the first HTML response.
 *
 * Keep each block small and say only what the page says. Duplicate or
 * invented fields are what trigger structured-data warnings.
 */
import { SITE, SITE_NAME, absoluteUrl, type Faq } from "./seo";

const SERA = "https://sera.cx";

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    alternateName: "Care Share Donate",
    url: SITE,
    logo: `${SITE}/brand/mark/sera-mark-tile-color.svg`,
    description:
      "An open list of charities in Malaysia that take gifts in stablecoins. Every gift goes straight to the charity's own address, the record is public, and anyone can help check a charity.",
    parentOrganization: { "@type": "Organization", name: "Sera.cx", url: SERA },
    areaServed: { "@type": "Country", name: "Malaysia" },
    sameAs: ["https://sera.cx", "https://g.sera.cx", "https://community.sera.cx", "https://github.com/sera-cx/sera-causes"],
    contactPoint: [{ "@type": "ContactPoint", contactType: "Report a problem", email: "security@sera.cx", url: `${SITE}/rules#reports` }],
  };
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE,
    inLanguage: "en-MY",
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE}/causes?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

export interface CauseSchemaInput {
  id: number;
  slug: string;
  name: string;
  legalName?: string;
  summary?: string;
  background?: string;
  registration?: string;
  founded?: string;
  town?: string;
  state?: string;
  website?: string;
  email?: string;
  phone?: string;
  photoUrl?: string | null;
  sameAs?: string[];
  verified?: boolean;
  taxExempt?: boolean;
}

/**
 * NonprofitOrganization for a cause page. Only fields the profile actually
 * publishes go in; nothing is guessed. `nonprofitStatus` is set only where
 * the C5 tax-exemption badge is on.
 */
export function nonprofitOrganizationSchema(c: CauseSchemaInput) {
  const url = `${SITE}/c/${c.id}-${c.slug}`;
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "NonprofitOrganization",
    "@id": `${url}#organization`,
    name: c.name,
    url,
    description: c.summary || c.background || undefined,
    areaServed: { "@type": "Country", name: "Malaysia" },
  };
  if (c.legalName && c.legalName !== c.name) node.legalName = c.legalName;
  if (c.registration) node.identifier = c.registration;
  if (c.founded) node.foundingDate = c.founded;
  if (c.photoUrl) node.image = absoluteUrl(c.photoUrl);
  if (c.town || c.state) {
    node.address = { "@type": "PostalAddress", addressLocality: c.town || undefined, addressRegion: c.state || undefined, addressCountry: "MY" };
  }
  if (c.website) node.sameAs = [c.website, ...(c.sameAs ?? [])].filter(Boolean);
  else if (c.sameAs?.length) node.sameAs = c.sameAs;
  if (c.email || c.phone) node.contactPoint = { "@type": "ContactPoint", contactType: "Enquiries", email: c.email || undefined, telephone: c.phone || undefined };
  if (c.taxExempt) node.nonprofitStatus = "https://schema.org/NonprofitType";
  for (const k of Object.keys(node)) if (node[k] === undefined) delete node[k];
  return node;
}

/** DonateAction pointing at the give sheet, so an answer engine can say how to give. */
export function donateActionSchema(c: { id: number; slug: string; name: string }, currencies: readonly string[] = ["MYR", "SGD", "USD"]) {
  const url = `${SITE}/c/${c.id}-${c.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "DonateAction",
    name: `Give to ${c.name}`,
    description: `Give to ${c.name} in a stablecoin. The gift goes straight to the charity's own address.`,
    recipient: { "@id": `${url}#organization`, "@type": "NonprofitOrganization", name: c.name, url },
    target: { "@type": "EntryPoint", urlTemplate: `${SITE}/give/${c.id}`, actionPlatform: ["https://schema.org/DesktopWebPlatform", "https://schema.org/MobileWebPlatform"] },
    priceSpecification: { "@type": "PriceSpecification", priceCurrency: currencies.join(", ") },
  };
}

/** FAQPage. Every answer here has to be visible on the page that mounts it. */
export function faqSchema(items: readonly Faq[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
}

/** BreadcrumbList. Pass the trail without the site root; it is added for you. */
export function breadcrumbSchema(trail: readonly { name: string; path: string }[]) {
  const items = [{ name: "Home", path: "/" }, ...trail];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE}${item.path === "/" ? "" : item.path}` || SITE,
    })),
  };
}

/** ItemList for a browse page, so a crawler can see what is on the list. */
export function causeListSchema(causes: readonly { id: number; slug: string; name: string }[], name: string, path: string) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    url: `${SITE}${path}`,
    numberOfItems: causes.length,
    itemListElement: causes.slice(0, 50).map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      url: `${SITE}/c/${c.id}-${c.slug}`,
    })),
  };
}
