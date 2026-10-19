import { useCallback, useEffect, useState } from "react";

export function useCopy(resetMs = 1800) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), resetMs);
    return () => clearTimeout(t);
  }, [copied, resetMs]);
  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, []);
  return { copied, copy };
}
