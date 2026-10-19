import { cn } from "@/lib/utils";

export function Switch({ checked, onCheckedChange, id, label, disabled, className }: { checked: boolean; onCheckedChange: (v: boolean) => void; id?: string; label: string; disabled?: boolean; className?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50",
        checked ? "bg-sera-deep" : "bg-ink/25",
        className,
      )}
    >
      <span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-6" : "translate-x-1")} />
    </button>
  );
}
