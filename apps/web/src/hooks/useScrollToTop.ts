import { useEffect } from "react";
import { useLocation } from "wouter";

/** Scroll to the top on route change, unless the URL carries a hash. */
export function useScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash) {
      const el = document.getElementById(window.location.hash.slice(1));
      if (el) {
        el.scrollIntoView();
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [location]);
}
