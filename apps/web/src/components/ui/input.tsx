import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * `min-h-11` is the floor every form control keeps, 44px, so a thumb can hit
 * it. It is a utility rather than a global rule on purpose: these controls
 * also carry `flex`, and the `.flex { min-height: 0 }` guard in index.css
 * sits in the components layer, where it would beat anything written in the
 * base layer. A caller passing `h-10` or `h-9` still only sets `height`, so
 * the floor holds.
 */
const base =
  "flex min-h-11 w-full rounded-md border border-input bg-paper px-3 py-2 text-[15px] text-ink placeholder:text-ink-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:opacity-50";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(base, "h-11", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(base, "min-h-[96px] leading-relaxed", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(base, "h-11 appearance-none pr-9 bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat", className)} style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236B7384' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>\")" }} {...props}>
    {children}
  </select>
));
Select.displayName = "Select";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("block font-sans text-[14px] font-medium text-ink mb-1.5", className)} {...props} />;
}

/** A hint is running prose, so it takes the shared measure even in a wide field. */
export function Hint({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-1.5 measure text-[13px] leading-snug text-ink-muted", className)} {...props} />;
}

export function Field({ label, htmlFor, hint, children, className }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <Hint id={`${htmlFor}-hint`}>{hint}</Hint>}
    </div>
  );
}

/**
 * The label is the tap target, not the box, so it carries the 44px minimum
 * and the box itself only has to be big enough to see.
 */
export function Checkbox({ className, label, id, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode }) {
  return (
    <label htmlFor={id} className={cn("flex min-h-11 items-start gap-3 py-1.5 text-[15px] text-ink", className)}>
      <input id={id} type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#1B7A3F] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" {...props} />
      <span>{label}</span>
    </label>
  );
}
