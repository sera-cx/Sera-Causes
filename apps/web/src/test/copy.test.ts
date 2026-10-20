/* Copy rules from the brief: no em dashes, "Sera.cx" not "Sera", never "no fee". */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css|html)$/.test(p) && !p.includes("/test/")) out.push(p);
  }
  return out;
}

const files = walk(join(__dirname, ".."));

describe("copy rules", () => {
  it("has no em dashes anywhere", () => {
    const hits = files.filter((f) => readFileSync(f, "utf8").includes("—"));
    expect(hits).toEqual([]);
  });
  it("never says no fee", () => {
    const hits = files.filter((f) => /no fee/i.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
  it("writes Sera.cx, not Sera, in visible copy", () => {
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // Visible text only: inside JSX text or string literals, "Sera" followed by a space or punctuation.
      const m = src.match(/[>"'`]\s*[^<"'`]*\bSera(?!\.cx|\s*Causes|-causes|Protocol)\b[^<"'`]*/g);
      if (m) bad.push(`${f}: ${m[0].slice(0, 80)}`);
    }
    expect(bad).toEqual([]);
  });
  it("uses British spelling for the words we use most", () => {
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // "Organization" is allowed only where schema.org or an HTTP header
      // fixes the spelling for us.
      for (const m of src.matchAll(/\b\w*(organiz|recogniz|apolog(?:ize|ized)|summariz)\w*\b/g)) {
        const line = src.slice(Math.max(0, m.index - 80), m.index + 80);
        if (/schema\.org|Organization|organizationSchema/.test(line)) continue;
        bad.push(`${f}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

/**
 * Organisations list themselves. The old flow assumed a third party listing a
 * charity they knew, and that framing is wrong, so the phrases it used are
 * banned outright: a regression here would quietly put it back.
 */
describe("the add-a-cause framing", () => {
  const add = readFileSync(join(__dirname, "..", "pages", "Add.tsx"), "utf8");
  const all = files.map((f) => readFileSync(f, "utf8")).join("\n");

  it("asks the organisation to list itself", () => {
    expect(add).toContain("List your cause.");
    expect(add).toContain("Add your organisation");
    expect(add).not.toContain("List a cause you know");
  });

  it("defaults the relationship to running the organisation, and keeps a path for listing on their behalf", () => {
    expect(add).toMatch(/relationship: "runs"/);
    expect(add).toContain("I run this organisation");
    expect(add).toContain("I am listing it for the organisation");
  });

  it("says plainly that whoever lists a cause sets the receiving wallet", () => {
    expect(add).toContain("Whoever lists a cause sets the wallet that receives the gifts");
  });

  it("drops the phrases that assumed a stranger was listing somebody else's charity", () => {
    for (const phrase of ["Anyone with a wallet can add", "cause you know", "Introduce us to whoever runs", "Leave blank if you do not run the cause"]) {
      expect(all, phrase).not.toContain(phrase);
    }
  });

  it("tells a giver the deposit wallet belongs to the organisation", () => {
    const cause = readFileSync(join(__dirname, "..", "pages", "Cause.tsx"), "utf8");
    expect(cause).toContain("The organisation listed itself and set that address");
  });
});

/** Line length is set in one place and used through a shared class. */
describe("the measure", () => {
  const css = readFileSync(join(__dirname, "..", "index.css"), "utf8");

  it("defines the measure once as a custom property", () => {
    expect(css).toMatch(/--measure:\s*\d+ch/);
    expect(css).toMatch(/--measure-lede:\s*\d+ch/);
  });

  /* A standfirst is one to three lines under a big headline, scanned rather
     than read, so it may run wider than body copy. It used to be narrower,
     which wrapped a short page introduction early and left a hole beside it. */
  it("gives the lede a wider cap than the body", () => {
    const body = Number(/--measure:\s*(\d+)ch/.exec(css)?.[1]);
    const lede = Number(/--measure-lede:\s*(\d+)ch/.exec(css)?.[1]);
    expect(lede).toBeGreaterThan(body);
  });

  it("exposes it as utilities rather than a per-page max-width", () => {
    expect(css).toContain("@utility measure");
    expect(css).toContain("@utility measure-lede");
    expect(css).toContain("max-width: var(--measure)");
  });

  it("leaves no ad-hoc character-width cap on prose in a page", () => {
    const bad: string[] = [];
    for (const f of files) {
      if (!f.includes("/pages/")) continue;
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/max-w-\[(\d+)ch\]/g)) {
        // A cap of 36ch or less narrows display type on purpose. Anything
        // wider is running prose, and belongs to the shared utility.
        if (Number(m[1]) <= 36) continue;
        bad.push(`${f}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

/**
 * One page spine. Readability is capped on the text, never by shrinking the
 * container, so the nav, the hero and the body all start on the same left
 * edge on every route.
 */
describe("the page container", () => {
  const css = readFileSync(join(__dirname, "..", "index.css"), "utf8");

  it("defines one container width and no narrower variants", () => {
    expect(css).toContain("@utility container {");
    expect(css).not.toMatch(/@utility container-\w+/);
    expect(css).not.toContain("--container-max");
  });

  it("is never narrowed at a call site", () => {
    const bad: string[] = [];
    for (const f of files) {
      if (!/\.tsx$/.test(f)) continue;
      for (const m of readFileSync(f, "utf8").matchAll(/\bcontainer-[a-z]+\b/g)) bad.push(`${f}: ${m[0]}`);
    }
    expect(bad).toEqual([]);
  });
});

/** The scope of the first run is written once and shown in the right places. */
describe("the trial scope", () => {
  it("names the stablecoins and the country in the footer, the home page, the give sheet and the rules", () => {
    const constants = readFileSync(join(__dirname, "..", "lib", "constants.ts"), "utf8");
    expect(constants).toMatch(/TRIAL = \{/);
    for (const token of ["MYRT", "XSGD", "Malaysia", "2027"]) expect(constants, token).toContain(token);
    expect(readFileSync(join(__dirname, "..", "components", "Footer.tsx"), "utf8")).toContain("TRIAL.footer");
    // The hero splits the scope in two so the YouApp mark can sit beside MYRT.
    // It still has to come from TRIAL, not be retyped into the page.
    const home = readFileSync(join(__dirname, "..", "pages", "Home.tsx"), "utf8");
    expect(home).toMatch(/TRIAL\.(home|heroWhy)/);
    expect(home).toContain("TRIAL.heroCurrenciesAfterMyrt");
    expect(readFileSync(join(__dirname, "..", "pages", "Give.tsx"), "utf8")).toContain("TRIAL.give");
    expect(readFileSync(join(__dirname, "..", "pages", "Rules.tsx"), "utf8")).toContain("TRIAL.rules");
  });
});
