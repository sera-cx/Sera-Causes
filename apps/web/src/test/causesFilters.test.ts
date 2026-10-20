/**
 * The category filter on /causes is a group of toggles, and the selection
 * travels in the URL. A link made before it took several categories, such as
 * /causes?cat=turtles, has to keep working.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readCats } from "@/pages/Causes";

const page = readFileSync(join(__dirname, "..", "pages", "Causes.tsx"), "utf8");

describe("reading the cat parameter", () => {
  const read = (search: string) => readCats(new URLSearchParams(search));

  it("reads one category, the way every existing link writes it", () => {
    expect(read("?cat=turtles")).toEqual(["turtles"]);
  });

  it("reads several from one comma separated parameter", () => {
    expect(read("?cat=turtles,marine")).toEqual(["turtles", "marine"]);
  });

  it("also reads a repeated parameter", () => {
    expect(read("?cat=turtles&cat=marine")).toEqual(["turtles", "marine"]);
  });

  it("drops blanks, duplicates and slugs that are not categories", () => {
    expect(read("?cat=turtles,,turtles,nonsense")).toEqual(["turtles"]);
    expect(read("")).toEqual([]);
  });

  it("returns them in the order the categories are declared, so one selection has one URL", () => {
    expect(read("?cat=marine,turtles")).toEqual(read("?cat=turtles,marine"));
  });
});

describe("the categories on the page", () => {
  it("are toggle buttons in a named group, not a listbox", () => {
    expect(page).toContain("<fieldset");
    expect(page).toContain("<legend");
    expect(page).toContain("aria-pressed={on}");
    expect(page).not.toMatch(/<Select id="cat"/);
  });

  it("keeps a 44px tap target and a visible focus ring on each chip", () => {
    expect(page).toContain("min-h-11");
    expect(page).toContain("focus-visible:outline-2");
  });

  it("has no All chip, because nothing chosen already means everything", () => {
    const group = page.slice(page.indexOf("<fieldset"), page.indexOf("</fieldset>"));
    expect(group).toContain("CATEGORIES.map");
    expect(group).not.toMatch(/\bAll\b/);
  });
});
