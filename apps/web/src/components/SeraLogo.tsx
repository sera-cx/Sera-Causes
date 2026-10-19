/* Official sera.cx wordmark from the brand kit (public/brand/wordmark).
   "color": green "sera" + ink ".cx" on light backgrounds.
   "white": single-colour for dark backgrounds.
   "black": single-colour for the Green Field (never the two-tone logo on green). */
import { cn } from "@/lib/utils";

type Variant = "color" | "white" | "black";
const SRC: Record<Variant, string> = {
  color: "/brand/wordmark/sera-wordmark-color.svg",
  white: "/brand/wordmark/sera-wordmark-white.svg",
  black: "/brand/wordmark/sera-wordmark-black.svg",
};

export function SeraLogo({ className, variant = "color" }: { className?: string; variant?: Variant }) {
  return (
    <img
      src={SRC[variant]}
      alt="Sera.cx"
      className={cn("h-[18px] w-auto select-none", variant === "color" && "dark:hidden", className)}
      draggable={false}
      width={88}
      height={18}
      loading="eager"
      decoding="sync"
    />
  );
}

/** Colour wordmark in light mode, white in dark mode. */
export function SeraLogoAuto({ className }: { className?: string }) {
  return (
    <>
      <SeraLogo variant="color" className={className} />
      <SeraLogo variant="white" className={cn("hidden dark:block", className)} />
    </>
  );
}
