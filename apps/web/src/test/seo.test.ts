/**
 * The SEO layer is pure data, so it can be checked without a DOM. These tests
 * guard the things that break silently: a missing canonical path, an off-site
 * OG image sneaking into a meta tag, a FAQ answer that no longer matches the
 * page, and the static shell drifting from src/lib/seo.ts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROUTE_SEO, RULES_FAQS, SITE, STATIC_ROUTES, absoluteUrl, causeSeo, withSuffix, type RouteSeo } from "@/lib/seo";
import { breadcrumbSchema, causeListSchema, donateActionSchema, faqSchema, nonprofitOrganizationSchema, organizationSchema, websiteSchema } from "@/lib/seoSchemas";

const root = join(__dirname, "..", "..");
const indexHtml = readFileSync(join(root, "index.html"), "utf8");
const robots = readFileSync(join(root, "public", "robots.txt"), "utf8");
const sitemap = readFileSync(join(root, "public", "sitemap.xml"), "utf8");

const routes = Object.entries(ROUTE_SEO) as [string, RouteSeo][];

describe("per-route metadata", () => {
  it("gives every route a title, a description and a canonical path", () => {
    for (const [name, seo] of routes) {
      expect(seo.title, name).toBeTruthy();
      expect(seo.title.length, name).toBeLessThanOrEqual(70);
      expect(seo.description.length, `${name} description`).toBeGreaterThan(50);
      expect(seo.description.length, `${name} description`).toBeLessThanOrEqual(260);
      expect(seo.path.startsWith("/"), name).toBe(true);
    }
  });

  it("names the site the same way everywhere, and never bare Sera", () => {
    for (const [name, seo] of routes) {
      const text = `${seo.title} ${seo.description}`;
      expect(/\bSera(?!\.cx)\b/.test(text), `${name}: ${text}`).toBe(false);
    }
  });

  it("keeps the signed-in routes out of the index", () => {
    expect(ROUTE_SEO.me.noIndex).toBe(true);
    expect(ROUTE_SEO.dashboard.noIndex).toBe(true);
    expect(ROUTE_SEO.notFound.noIndex).toBe(true);
    // `satisfies` keeps the literal types, so the public routes have no
    // noIndex key at all. Read them through RouteSeo to say so.
    expect((ROUTE_SEO.home as RouteSeo).noIndex).toBeUndefined();
    expect((ROUTE_SEO.causes as RouteSeo).noIndex).toBeUndefined();
    expect((ROUTE_SEO.add as RouteSeo).noIndex).toBeUndefined();
  });

  it("builds a cause title and description from the profile", () => {
    const seo = causeSeo({ id: 1, slug: "kasih-turtle-conservation-project", name: "Kasih Turtle", summary: "RM15 buys one hatchery basket.", town: "Cherating", state: "Pahang" });
    expect(seo.path).toBe("/c/1-kasih-turtle-conservation-project");
    expect(seo.title).toContain("Cherating, Pahang");
    expect(seo.description).toContain("RM15 buys one hatchery basket.");
    expect(seo.description).toContain("Give to Kasih Turtle");
  });

  it("keeps a cause description short enough for a results page, and never cuts a word in half", () => {
    const long = "A beach hatchery that collects turtle eggs from the sand every night through the season, keeps them safe from poachers and dogs, and releases the hatchlings at dusk in front of the people who paid for it.";
    const seo = causeSeo({ id: 2, slug: "x", name: "Long Cause", summary: long, town: "Cherating", state: "Pahang" });
    expect(seo.description.length).toBeLessThanOrEqual(166);
    expect(seo.description.endsWith("…")).toBe(true);
    // What is left has to be a whole-word prefix of the original: the
    // character that follows it in the source is a space, not a letter.
    const kept = seo.description.slice(0, -1);
    expect(long.startsWith(kept)).toBe(true);
    expect(long.charAt(kept.length)).toBe(" ");
  });

  it("adds the site name once in withSuffix", () => {
    expect(withSuffix("Find a cause")).toBe("Find a cause | Care Share Donate on Sera.cx");
    expect(withSuffix("")).toBe("Care Share Donate on Sera.cx");
  });

  it("refuses an off-site Open Graph image", () => {
    expect(absoluteUrl("/photos/hero.jpg")).toBe(`${SITE}/photos/hero.jpg`);
    expect(absoluteUrl("//evil.example/x.png")).toBe(`${SITE}/photos/hero.jpg`);
    expect(absoluteUrl("https://evil.example/x.png")).toBe(`${SITE}/photos/hero.jpg`);
    expect(absoluteUrl(undefined)).toBe(`${SITE}/photos/hero.jpg`);
  });
});

describe("structured data", () => {
  it("describes the site as an Organization and a WebSite", () => {
    expect(organizationSchema()["@type"]).toBe("Organization");
    expect(organizationSchema().url).toBe(SITE);
    expect(websiteSchema()["@type"]).toBe("WebSite");
  });

  it("describes a cause as a NonprofitOrganization with a DonateAction pointing at it", () => {
    const cause = { id: 7, slug: "food-aid-foundation", name: "Food Aid Foundation", registration: "PPM-123", town: "Kuala Lumpur", state: "Kuala Lumpur", summary: "Food for families.", taxExempt: true };
    const org = nonprofitOrganizationSchema(cause);
    expect(org["@type"]).toBe("NonprofitOrganization");
    expect(org["@id"]).toBe(`${SITE}/c/7-food-aid-foundation#organization`);
    expect(org.identifier).toBe("PPM-123");
    expect(org.nonprofitStatus).toBeTruthy();
    const donate = donateActionSchema(cause, ["MYR", "USD"]);
    expect(donate["@type"]).toBe("DonateAction");
    expect((donate.recipient as { "@id": string })["@id"]).toBe(org["@id"]);
    expect((donate.target as { urlTemplate: string }).urlTemplate).toBe(`${SITE}/give/7`);
  });

  it("leaves out fields the profile does not publish", () => {
    const org = nonprofitOrganizationSchema({ id: 1, slug: "x", name: "X" });
    expect(org.identifier).toBeUndefined();
    expect(org.address).toBeUndefined();
    expect(org.nonprofitStatus).toBeUndefined();
    expect(Object.values(org).every((v) => v !== undefined)).toBe(true);
  });

  it("starts a breadcrumb trail at the site root", () => {
    const crumbs = breadcrumbSchema([{ name: "Causes", path: "/causes" }]).itemListElement;
    expect(crumbs).toHaveLength(2);
    expect(crumbs[0]).toMatchObject({ position: 1, name: "Home", item: SITE });
    expect(crumbs[1]).toMatchObject({ position: 2, name: "Causes", item: `${SITE}/causes` });
  });

  it("caps a cause list so the block stays small", () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ id: i + 1, slug: `c${i}`, name: `Cause ${i}` }));
    const list = causeListSchema(many, "Causes", "/causes");
    expect(list.numberOfItems).toBe(80);
    expect(list.itemListElement).toHaveLength(50);
  });
});

describe("the FAQPage block mirrors the page", () => {
  it("turns every visible question into a Question with an answer", () => {
    const schema = faqSchema(RULES_FAQS);
    expect(schema.mainEntity).toHaveLength(RULES_FAQS.length);
    for (const entry of schema.mainEntity) {
      expect(entry.name).toBeTruthy();
      expect(entry.acceptedAnswer.text).toBeTruthy();
    }
  });

  it("says plainly that the organisation sets the receiving wallet", () => {
    const answers = RULES_FAQS.map((f) => `${f.q} ${f.a}`).join(" ");
    expect(answers).toMatch(/organisation/i);
    expect(answers).toMatch(/lists itself|list themselves|lists themselves/i);
  });
});

describe("the static shell and the crawler files", () => {
  it("carries the site title, description and Organization block for crawlers that do not run JavaScript", () => {
    expect(indexHtml).toContain("<title>Care Share Donate on Sera.cx</title>");
    expect(indexHtml).toContain('<meta name="description"');
    expect(indexHtml).toContain('<link rel="canonical"');
    expect(indexHtml).toContain('property="og:image"');
    expect(indexHtml).toContain('name="twitter:card"');
    expect(indexHtml).toContain('"@type": "Organization"');
    expect(indexHtml).toContain('"@type": "WebSite"');
  });

  it("flags where pre-rendering is still needed", () => {
    expect(indexHtml).toContain("TODO(prerender)");
    expect(readFileSync(join(root, "src", "lib", "seo.ts"), "utf8")).toContain("TODO(prerender)");
  });

  it("lets search and answer engines in, keeps the private routes out, and points at the sitemap", () => {
    expect(robots).toContain("Sitemap: https://causes.sera.cx/sitemap.xml");
    expect(robots).toContain("Disallow: /dashboard");
    expect(robots).toContain("Disallow: /me");
    for (const agent of ["GPTBot", "ClaudeBot", "PerplexityBot", "OAI-SearchBot"]) expect(robots).toContain(agent);
  });

  it("lists every public static route in the sitemap", () => {
    for (const path of STATIC_ROUTES) {
      expect(sitemap, path).toContain(`<loc>https://causes.sera.cx${path === "/" ? "/" : path}</loc>`);
    }
    // Nothing that robots.txt disallows should be in there.
    for (const path of ["/me", "/dashboard"]) expect(sitemap).not.toContain(`<loc>https://causes.sera.cx${path}</loc>`);
  });
});
