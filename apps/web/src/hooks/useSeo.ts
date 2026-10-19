import { useEffect } from "react";

/** Sets the document title and description. SSR will render these server-side later. */
export function useSeo(title: string, description?: string) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = title ? `${title} | Care Share Donate on Sera.cx` : "Care Share Donate on Sera.cx";
    if (description) {
      let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = "description";
        document.head.appendChild(meta);
      }
      meta.content = description;
    }
  }, [title, description]);
}
