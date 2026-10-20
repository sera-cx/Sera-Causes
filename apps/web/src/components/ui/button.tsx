import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-sans font-semibold transition-colors [@media(pointer:coarse)]:min-h-11 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  {
    variants: {
      variant: {
        default: "bg-ink text-paper hover:opacity-90",
        sera: "bg-sera text-[#06120C] hover:bg-[#00E676]",
        give: "bg-give text-give-foreground hover:opacity-90",
        outline: "border border-ink/30 bg-transparent text-ink hover:bg-ink/5",
        ghost: "bg-transparent text-ink hover:bg-ink/5",
        // A link is a run of text, not a pill, so it may wrap. A long one
        // ("All the sharing tools, the website button and the poster") ran
        // off the side of a 360px screen while the pill variants, which are
        // short by design, keep their nowrap.
        link: "text-sera-text underline-offset-4 hover:underline rounded-none px-0 h-auto whitespace-normal text-left",
      },
      size: {
        default: "h-11 px-5 text-[15px]",
        sm: "h-9 px-4 text-[13px]",
        lg: "h-12 px-6 text-[16px]",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, type, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} type={asChild ? undefined : (type ?? "button")} {...props} />;
});
Button.displayName = "Button";

export { Button, buttonVariants };
