/* Minimal iframe target for the embeddable Give button. No nav, no footer. */
import { useParams } from "wouter";
import { SeraLogo } from "@/components/SeraLogo";
import { useSeo } from "@/hooks/useSeo";
import { SITE_ORIGIN } from "@/lib/constants";
import { withSuffix } from "@/lib/seo";
import { fmtUsd } from "@/lib/format";
import { causeImage } from "@/lib/images";
import { useCause } from "@/lib/queries";

export function EmbedGivePage() {
  const { id = "" } = useParams<{ id: string }>();
  const causeId = Number.parseInt(id, 10);
  const q = useCause(causeId);
  const cause = q.data;
  useSeo({
    title: withSuffix(cause ? `Give to ${cause.name}` : "Give"),
    description: cause ? `A Give button for ${cause.name}, for embedding on another website.` : "A Give button for embedding on another website.",
    path: `/embed/give/${causeId}`,
    noIndex: true,
  });
  const href = `${SITE_ORIGIN}/give/${causeId}`;
  return (
    <div className="flex h-screen items-center bg-paper p-3">
      <div className="flex w-full items-center gap-3 rounded-xl border border-rule bg-card p-3">
        {cause && <img src={causeImage(cause).src} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <SeraLogo className="h-3.5" />
            <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-subtle">Causes</span>
          </div>
          <p className="truncate font-display text-[15px] font-semibold leading-tight mt-0.5">{cause?.name ?? "Loading"}</p>
          {cause && <p className="font-mono text-[10.5px] text-ink-muted tnum">{fmtUsd(Number(cause.givenUsd))} given</p>}
        </div>
        <a href={href} target="_top" rel="noopener" className="inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-[13px] font-semibold" style={{ background: "var(--give)", color: "var(--give-foreground)" }}>
          Give
        </a>
      </div>
    </div>
  );
}
