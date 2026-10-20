import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useSeo } from "@/hooks/useSeo";
import { ROUTE_SEO } from "@/lib/seo";

export function NotFoundPage() {
  useSeo(ROUTE_SEO.notFound);
  return (
    <div className="container py-20 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-3 font-display text-[34px] font-semibold tracking-tight">We could not find that page.</h1>
      <p className="mt-3 measure mx-auto text-[16px] text-ink-muted">The cause may have moved, or the link may have a typo in it. Try the full list instead.</p>
      <div className="mt-6 flex justify-center gap-3">
        <Button asChild>
          <Link href="/causes">Browse causes</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Home</Link>
        </Button>
      </div>
    </div>
  );
}
