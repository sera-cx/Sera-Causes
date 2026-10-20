/**
 * useJsonLd: puts <script type="application/ld+json"> blocks in <head>, each
 * keyed by an id so a route change replaces its own blocks cleanly. After
 * the sera.cx home repo, client/src/lib/useJsonLd.ts.
 *
 * Security: JSON.stringify is safe for the content, but a literal "</script>"
 * inside a string would end the tag early, so the closing slash is escaped.
 * Callers pass plain data objects, never HTML.
 *
 * TODO(prerender): like useSeo, this only exists after JavaScript runs. The
 * site-level Organization and WebSite blocks are also written by hand into
 * index.html so a crawler that does not run JavaScript still gets them. The
 * per-cause NonprofitOrganization, DonateAction and FAQPage blocks need
 * server rendering or prerendering to be visible to those crawlers.
 */
import { useEffect, useMemo } from "react";

type JsonLdNode = Record<string, unknown>;

const ID_PREFIX = "ld-";

function serialize(node: JsonLdNode): string {
  return JSON.stringify(node).replace(/<\/(script)/gi, "<\\/$1");
}

function mountTag(id: string, node: JsonLdNode) {
  if (typeof document === "undefined") return;
  const fullId = `${ID_PREFIX}${id}`;
  let el = document.getElementById(fullId) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement("script");
    el.id = fullId;
    el.type = "application/ld+json";
    document.head.appendChild(el);
  }
  el.textContent = serialize(node);
}

function unmountTag(id: string) {
  if (typeof document === "undefined") return;
  document.getElementById(`${ID_PREFIX}${id}`)?.remove();
}

/** One block. Re-runs when the payload changes, and cleans up on unmount. */
export function useJsonLd(id: string, node: JsonLdNode | null | undefined) {
  const payload = node ? serialize(node) : "";
  useEffect(() => {
    if (!payload) {
      unmountTag(id);
      return;
    }
    const el = document.getElementById(`${ID_PREFIX}${id}`) as HTMLScriptElement | null;
    if (el) el.textContent = payload;
    else mountTag(id, JSON.parse(payload) as JsonLdNode);
    return () => unmountTag(id);
  }, [id, payload]);
}

/** Several blocks at once. Entries whose node is null are removed. */
export function useJsonLdMany(entries: { id: string; node: JsonLdNode | null | undefined }[]) {
  const payload = useMemo(() => JSON.stringify(entries.map((e) => [e.id, e.node ? serialize(e.node) : ""])), [entries]);
  useEffect(() => {
    const pairs = JSON.parse(payload) as [string, string][];
    for (const [id, json] of pairs) {
      if (!json) {
        unmountTag(id);
        continue;
      }
      mountTag(id, JSON.parse(json) as JsonLdNode);
    }
    return () => {
      for (const [id] of pairs) unmountTag(id);
    };
  }, [payload]);
}
