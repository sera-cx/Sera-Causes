import { useScrollToTop } from "@/hooks/useScrollToTop";
import { Footer } from "./Footer";
import { Nav } from "./Nav";

export function Layout({ children }: { children: React.ReactNode }) {
  useScrollToTop();
  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}
