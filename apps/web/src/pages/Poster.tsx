/* Printable A4 poster. The API will serve /c/<id>/poster.pdf; until then the
   browser's print dialog saves this page as a PDF. */
import { useEffect } from "react";
import { useParams } from "wouter";
import { QrCode } from "@/components/QrCode";
import { shareUrlFor } from "@/components/ShareButtons";
import { useSeo } from "@/hooks/useSeo";
import { useCause } from "@/lib/queries";
import { NotFoundPage } from "./NotFound";

export function PosterPage() {
  const { id = "" } = useParams<{ id: string }>();
  const q = useCause(Number.parseInt(id, 10));
  const cause = q.data;
  useSeo(cause ? `${cause.name} poster` : "Poster");
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.style.colorScheme = "light";
    return () => {
      document.documentElement.style.colorScheme = "";
    };
  }, []);
  if (q.isLoading) return null;
  if (!cause) return <NotFoundPage />;
  const url = shareUrlFor(cause.id, cause.slug);
  return (
    <div className="min-h-screen bg-[#E5E7E0] print:bg-white" style={{ color: "#0B1426" }}>
      <div className="no-print mx-auto flex max-w-[210mm] items-center justify-between px-4 py-3 text-[13px]">
        <span>Print, or choose "Save as PDF" in the print dialog.</span>
        <button type="button" onClick={() => window.print()} className="rounded-full bg-[#0B1426] px-4 py-2 text-[13px] font-semibold text-white">
          Print
        </button>
      </div>
      <div className="mx-auto bg-white shadow-lg print:shadow-none" style={{ width: "210mm", minHeight: "297mm", padding: "16mm", display: "flex", flexDirection: "column", gap: "8mm", fontFamily: "var(--font-sans)" }}>
        <div className="flex items-center justify-between">
          <img src="/brand/wordmark/sera-wordmark-black.svg" alt="Sera.cx" style={{ height: "7mm" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "9pt", letterSpacing: "0.14em", textTransform: "uppercase" }}>Care Share Donate</span>
        </div>
        <img src={cause.profile.image?.src} alt={cause.profile.image?.alt ?? cause.name} style={{ width: "100%", height: "95mm", objectFit: "cover", borderRadius: "4mm" }} />
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "9pt", letterSpacing: "0.14em", textTransform: "uppercase", color: "#455067" }}>
            {cause.profile.category} · {[cause.profile.location.town, cause.profile.location.state].filter(Boolean).join(", ")}
          </div>
          <h1 style={{ fontSize: "30pt", lineHeight: 1.05, fontWeight: 600, letterSpacing: "-0.02em", marginTop: "2mm" }}>{cause.name}</h1>
          <p style={{ fontSize: "12.5pt", lineHeight: 1.45, color: "#455067", marginTop: "3mm" }}>{cause.profile.summary}</p>
        </div>
        <div style={{ marginTop: "auto", display: "grid", gridTemplateColumns: "auto 1fr", gap: "8mm", alignItems: "center", background: "#00D26A", borderRadius: "4mm", padding: "8mm" }}>
          <div style={{ background: "#fff", padding: "3mm", borderRadius: "2mm" }}>
            <QrCode text={url} size={150} alt={`QR code linking to ${cause.name} on causes.sera.cx`} />
          </div>
          <div style={{ color: "#06120C" }}>
            <div style={{ fontSize: "20pt", fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em" }}>Give in stablecoins on causes.sera.cx</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "10.5pt", marginTop: "3mm" }}>{url.replace("https://", "")}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "8.5pt", marginTop: "3mm", wordBreak: "break-all", opacity: 0.8 }}>Address {cause.depositAddress}</div>
          </div>
        </div>
        {cause.profile.image?.credit && <div style={{ fontFamily: "var(--font-mono)", fontSize: "7.5pt", color: "#6B7384" }}>Photo: {cause.profile.image.credit}{cause.profile.image.licence ? `, ${cause.profile.image.licence}` : ""}</div>}
      </div>
    </div>
  );
}
