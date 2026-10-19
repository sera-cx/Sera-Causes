/* No signing material may ship. This builds the app for production exactly as
   `pnpm build` does, with VITE_DEV_PRIVATE_KEY deliberately set, and greps the
   output for all three things that could leak: the public test mnemonic, the
   key it derives, and the override key the build was given. It also checks the
   demo address the mock world is written against is still the one the mnemonic
   derives, since the two are no longer the same import. */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { mnemonicToAccount } from "viem/accounts";
import { afterAll, describe, expect, it } from "vitest";
import { DEMO_WALLET as DEV_ADDRESS } from "@/lib/devWallet";
import { DEMO_WALLET } from "@/lib/mock/state";

/** Ganache's published default mnemonic, repeated here so the test is independent of the module it checks. */
const PUBLIC_TEST_MNEMONIC = "myth like bonus scare over problem client lizard pioneer submit female collect";
/** A throwaway key handed to the build, to prove an override cannot be inlined either. */
const OVERRIDE_KEY = `0x${"deadbeef".repeat(8)}`;

const webRoot = resolve(__dirname, "..", "..");
const out = mkdtempSync(join(tmpdir(), "csd-prod-build-"));

function files(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, acc);
    else acc.push(p);
  }
  return acc;
}

afterAll(() => rmSync(out, { recursive: true, force: true }));

describe("the dev signer", () => {
  it("derives the wallet the mock world is built around, with no key in the repository", () => {
    const derived = mnemonicToAccount(PUBLIC_TEST_MNEMONIC, { addressIndex: 5 });
    expect(derived.address.toLowerCase()).toBe("0x95ced938f7991cd0dfcb48f0a06a40fa1af46ebc");
    expect(DEV_ADDRESS).toBe(derived.address.toLowerCase());
    expect(DEMO_WALLET).toBe(DEV_ADDRESS);
  });

  it("leaves no signing material in a production build", () => {
    execFileSync("node", [resolve(webRoot, "node_modules/vite/bin/vite.js"), "build", "--mode", "production", "--outDir", out, "--emptyOutDir", "--logLevel", "warn"], {
      cwd: webRoot,
      stdio: "pipe",
      env: { ...process.env, NODE_ENV: "production", VITE_DEV_PRIVATE_KEY: OVERRIDE_KEY },
    });

    const privateKey = mnemonicToAccount(PUBLIC_TEST_MNEMONIC, { addressIndex: 5 }).getHdKey().privateKey;
    expect(privateKey).not.toBeNull();
    const derivedKeyHex = Buffer.from(privateKey!).toString("hex");

    const built = files(out);
    expect(built.length).toBeGreaterThan(0);
    for (const [what, needle] of [
      ["the public test mnemonic", PUBLIC_TEST_MNEMONIC],
      ["the key it derives", derivedKeyHex],
      ["the VITE_DEV_PRIVATE_KEY override", OVERRIDE_KEY.slice(2)],
    ] as const) {
      const leaks = built.filter((f) => readFileSync(f, "utf8").includes(needle));
      expect(leaks, `${what} reached dist/`).toEqual([]);
    }
  }, 300_000);
});
