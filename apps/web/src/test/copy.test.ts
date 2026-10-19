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
});
