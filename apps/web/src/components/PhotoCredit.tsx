import type { CauseImage } from "@sera-causes/shared";
import { cn } from "@/lib/utils";

export function PhotoCredit({ image, className, light }: { image?: CauseImage; className?: string; light?: boolean }) {
  if (!image?.credit) return null;
  const text = `Photo: ${image.credit}${image.licence ? `, ${image.licence}` : ""}${image.illustrative ? ". Illustrative" : ""}`;
  return (
    <p className={cn("font-mono text-[10.5px] leading-snug", light ? "text-white/70" : "text-ink-subtle", className)}>
      {image.sourceUrl ? (
        <a href={image.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
          {text}
        </a>
      ) : (
        text
      )}
    </p>
  );
}
