// Compiles contracts/ with solc-js (no network needed) into build/*.json.
// Output per contract: { abi, bytecode }. Settings match what we deploy: optimizer on, 200 runs, paris.
import solc from "solc";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    statSync(p).isDirectory() ? walk(p) : f.endsWith(".sol") && files.push(p);
  }
})(join(root, "contracts"));

const sources = Object.fromEntries(files.map(p => [relative(root, p), { content: readFileSync(p, "utf8") }]));
const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "paris",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
  },
};
const out = JSON.parse(solc.compile(JSON.stringify(input)));
const errs = (out.errors || []).filter(e => e.severity === "error");
for (const e of out.errors || []) console.error(e.formattedMessage);
if (errs.length) process.exit(1);

mkdirSync(join(root, "build"), { recursive: true });
for (const [, cs] of Object.entries(out.contracts)) {
  for (const [name, c] of Object.entries(cs)) {
    writeFileSync(join(root, "build", name + ".json"),
      JSON.stringify({ contractName: name, abi: c.abi, bytecode: "0x" + c.evm.bytecode.object }, null, 1));
    console.log("compiled", name, (c.evm.deployedBytecode.object.length / 2) + " bytes deployed, " + (c.evm.bytecode.object.length / 2) + " bytes creation");
  }
}
