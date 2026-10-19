import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { title: string; description?: string }
>(({ className, children, title, description, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-rule bg-card p-6 shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 max-h-[90vh] overflow-y-auto",
        className,
      )}
      {...props}
    >
      <DialogPrimitive.Title className="font-display text-[22px] font-semibold leading-tight tracking-tight pr-8">{title}</DialogPrimitive.Title>
      {description ? (
        <DialogPrimitive.Description className="mt-1.5 text-[15px] text-ink-muted">{description}</DialogPrimitive.Description>
      ) : (
        <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
      )}
      <div className="mt-5">{children}</div>
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-full p-1.5 text-ink-muted hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-ring" aria-label="Close">
        <X className="h-5 w-5" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = "DialogContent";

export { Dialog, DialogTrigger, DialogClose, DialogContent };
