/**
 * useSeo: mounts the per-route <title>, meta description, canonical link,
 * Open Graph and Twitter card tags. After the sera.cx home repo, client/src/lib/useSeo.ts.
 *
 * Single-page app safe: every tag it writes is in a fixed whitelist, so the
 * next route's hook overwrites the same elements instead of piling up new
 * ones. A route that should not be indexed also gets a robots meta tag, which
 * is removed again on the way out.
 *
 * Security: meta tags are only ever created from META_SPECS, never from a
 * selector built out of data. The OG image is resolved through
 * `absoluteUrl`, which refuses anything that is not same-origin.
 *
 * TODO(prerender): this runs in a useEffect, so it only exists once the page
 * has executed JavaScript. Crawlers that do not run JavaScript see the static
 * tags in index.html instead. See the TODO in src/lib/seo.ts.
 */
import { useEffect } from "react";
import { SITE, SITE_NAME, TWITTER_SITE, absoluteUrl, type RouteSeo } from "@/lib/seo";

type MetaSpec = { attr: "name" | "property" };

const META_SPECS: Record<string, MetaSpec> = {
  description: { attr: "name" },
  keywords: { attr: "name" },
  robots: { attr: "name" },
  "og:type": { attr: "property" },
  "og:title": { attr: "property" },
  "og:description": { attr: "property" },
  "og:url": { attr: "property" },
  "og:image": { attr: "property" },
  "og:image:alt": { attr: "property" },
  "og:site_name": { attr: "property" },
  "og:locale": { attr: "property" },
  "twitter:card": { attr: "name" },
  "twitter:title": { attr: "name" },
  "twitter:description": { attr: "name" },
  "twitter:image": { attr: "name" },
  "twitter:site": { attr: "name" },
};

function setMeta(key: keyof typeof META_SPECS, content: string) {
  const spec = META_SPECS[key];
  if (!spec || typeof document === "undefined") return;
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${spec.attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(spec.attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function removeMeta(key: keyof typeof META_SPECS) {
  const spec = META_SPECS[key];
  if (!spec || typeof document === "undefined") return;
  document.head.querySelector(`meta[${spec.attr}="${key}"]`)?.remove();
}

function setCanonical(href: string) {
  if (typeof document === "undefined") return;
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.rel = "canonical";
    document.head.appendChild(el);
  }
  el.href = href;
}

export function useSeo(seo: RouteSeo) {
  const { title, description, path, ogImage, ogType = "website", keywords, noIndex } = seo;
  useEffect(() => {
    if (typeof document === "undefined") return;
    const url = `${SITE}${path === "/" ? "" : path}` || SITE;
    const image = absoluteUrl(ogImage);

    document.title = title;
    setMeta("description", description);
    setCanonical(url);
    if (keywords) setMeta("keywords", keywords);
    else removeMeta("keywords");
    if (noIndex) setMeta("robots", "noindex, follow");
    else removeMeta("robots");

    setMeta("og:type", ogType);
    setMeta("og:title", title);
    setMeta("og:description", description);
    setMeta("og:url", url);
    setMeta("og:image", image);
    setMeta("og:image:alt", title);
    setMeta("og:site_name", SITE_NAME);
    setMeta("og:locale", "en_MY");

    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:title", title);
    setMeta("twitter:description", description);
    setMeta("twitter:image", image);
    setMeta("twitter:site", TWITTER_SITE);

    return () => {
      // Only the tags that would be wrong on a page that does not set them.
      removeMeta("robots");
      removeMeta("keywords");
    };
  }, [title, description, path, ogImage, ogType, keywords, noIndex]);
}
