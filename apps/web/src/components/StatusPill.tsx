/* Status is always icon + word + colour, never colour alone (brief 10.2). */
import { Circle, CircleCheck, CircleDashed, CirclePause, CircleX, FileText } from "lucide-react";
import { STAGE_INFO, type CauseStage } from "@/lib/constants";
import { cn } from "@/lib/utils";

const ICONS: Record<CauseStage, React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  new: Circle,
  evidence_in: FileText,
  partly_verified: CircleDashed,
  verified: CircleCheck,
  paused: CirclePause,
  closed: CircleX,
};

const TONES = {
  grey: "bg-[var(--pill-grey-bg)] text-[var(--pill-grey-fg)]",
  amber: "bg-[var(--pill-amber-bg)] text-[var(--pill-amber-fg)]",
  green: "bg-[var(--pill-green-bg)] text-[var(--pill-green-fg)]",
  red: "bg-[var(--pill-red-bg)] text-[var(--pill-red-fg)]",
};

export function StatusPill({ stage, checksDone, checksTotal, className, size = "sm" }: { stage: CauseStage; checksDone?: number; checksTotal?: number; className?: string; size?: "sm" | "md" }) {
  const info = STAGE_INFO[stage];
  const Icon = ICONS[stage];
  const label = stage === "partly_verified" && checksDone !== undefined && checksTotal !== undefined ? `Partly verified, ${checksDone} of ${checksTotal}` : info.label;
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full font-sans font-medium whitespace-nowrap", TONES[info.tone], size === "sm" ? "h-6 px-2 text-[12px]" : "h-8 px-3 text-[14px]", className)}
      data-stage={stage}
    >
      <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden />
      <span>{label}</span>
    </span>
  );
}

/** Generic icon + word + colour pill for other statuses (gift states, outcomes). */
export function Pill({ tone, icon: Icon, children, className }: { tone: keyof typeof TONES; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full h-6 px-2 text-[12px] font-sans font-medium whitespace-nowrap", TONES[tone], className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span>{children}</span>
    </span>
  );
}
