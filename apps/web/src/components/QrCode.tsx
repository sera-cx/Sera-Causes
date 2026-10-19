import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function useQrDataUrl(text: string, size = 320) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(text, { width: size, margin: 1, color: { dark: "#0B1426", light: "#FFFFFF" }, errorCorrectionLevel: "M" })
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => setUrl(null));
    return () => {
      cancelled = true;
    };
  }, [text, size]);
  return url;
}

export function QrCode({ text, size = 200, className, alt }: { text: string; size?: number; className?: string; alt: string }) {
  const url = useQrDataUrl(text, size * 2);
  if (!url) return <div className={className} style={{ width: size, height: size }} aria-hidden />;
  return <img src={url} width={size} height={size} alt={alt} className={className} />;
}
