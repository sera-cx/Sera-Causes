/**
 * Image URLs in one place. Profile photos are stored as `photos/<slug>.jpg`
 * and served by the API at `/photos/<file>` (uploads at `/uploads/<hash>`).
 * In mock mode the same files come from this app's public/ folder.
 */
import { API_URL } from "./env";

export const HERO_IMAGE_SRC = "photos/hero.jpg";

/** Absolute URLs pass through; relative ones resolve against the API, or against this origin in mock mode. */
export function imageUrl(src: string | null | undefined): string {
  const s = (src ?? "").trim();
  if (!s) return imageUrl(HERO_IMAGE_SRC);
  if (/^(https?:)?\/\//i.test(s) || s.startsWith("data:") || s.startsWith("blob:")) return s;
  const path = s.replace(/^\/+/, "");
  return API_URL ? `${API_URL}/${path}` : `/${path}`;
}

/** The photo for a cause card or hero: the API's resolved photo first, then the profile image, then the hero. */
export function causeImage(cause: { photoUrl?: string | null; name?: string; profile?: { image?: { src: string; alt: string } | undefined } | null }): { src: string; alt: string } {
  const img = cause.profile?.image;
  return { src: cause.photoUrl ? imageUrl(cause.photoUrl) : imageUrl(img?.src), alt: img?.alt ?? cause.name ?? "" };
}
