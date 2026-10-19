/** Fires once when the element enters the viewport. SSR-safe. */
import { useEffect, useRef, useState } from "react";

export function useInView<T extends Element = HTMLDivElement>({ once = true, rootMargin = "0px 0px -8% 0px", threshold = 0.15 } = {}) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            if (once) obs.unobserve(entry.target);
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { rootMargin, threshold },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [once, rootMargin, threshold]);

  return { ref, inView };
}
