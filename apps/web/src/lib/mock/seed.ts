/**
 * Loads the 44 seeded causes at build time. Ids are 1 to 44 in
 * seed/index.json order. Photos are served from public/photos/.
 */
import type { CauseProfile } from "@sera-causes/shared";
import index from "../../../../../seed/index.json";

interface SeedIndex {
  causes: string[];
  attest: Record<string, { kind: string; text: string }>;
}

const files = import.meta.glob("../../../../../seed/causes/*.json", {
  eager: true,
  import: "default",
}) as Record<string, CauseProfile>;

const seedIndex = index as SeedIndex;

export const SEED_ORDER: readonly string[] = seedIndex.causes;
export const SEED_ATTEST: Readonly<Record<string, { kind: string; text: string }>> = seedIndex.attest;

export const SEED_PROFILES: readonly CauseProfile[] = SEED_ORDER.map((slug) => {
  const key = Object.keys(files).find((k) => k.endsWith(`/${slug}.json`));
  if (!key) throw new Error(`seed cause missing: ${slug}`);
  return files[key];
});
