import { cn } from "@/lib/utils";

export function Eyebrow({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("eyebrow", className)}>{children}</div>;
}
