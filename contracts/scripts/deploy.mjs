// Deploys CauseRegistry to a real network and records the address in deployments/<chainId>.json.
//
//   RPC_URL=https://sepolia.infura.io/v3/<key> DEPLOYER_KEY=0x... COUNCIL=0x... pnpm deploy
//
// Optional, applied only when the deployer is the council:
//   FINALISER=0x...   address to set as finaliser
//   STEWARD=0x...     address to set as steward
import { ethers } from "ethers";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const { RPC_URL, DEPLOYER_KEY, COUNCIL, FINALISER, STEWARD } = process.env;
if (!RPC_URL || !DEPLOYER_KEY || !COUNCIL) {
  console.error("Set RPC_URL, DEPLOYER_KEY and COUNCIL");
  process.exit(1);
}
if (!ethers.isAddress(COUNCIL)) { console.error("COUNCIL is not an address"); process.exit(1); }

const art = JSON.parse(readFileSync(new URL("../build/CauseRegistry.json", import.meta.url)));
const provider = new ethers.JsonRpcProvider(RPC_URL);
const deployer = new ethers.NonceManager(new ethers.Wallet(DEPLOYER_KEY, provider));
const { chainId } = await provider.getNetwork();
const deployerAddress = await deployer.getAddress();
console.error(`chain ${chainId}, deployer ${deployerAddress}, council ${COUNCIL}`);

const factory = new ethers.ContractFactory(art.abi, art.bytecode, deployer);
const reg = await factory.deploy(COUNCIL);
const receipt = await reg.deploymentTransaction().wait();
const address = await reg.getAddress();
console.error(`CauseRegistry at ${address}, block ${receipt.blockNumber}`);

// A public endpoint is usually several nodes behind one address, and the one
// that answers next may not have the new contract yet. Sending a role call
// into that gap gets it estimated against an empty account and reverted on
// chain. Wait until this RPC can actually see the code.
for (let i = 1; (await provider.getCode(address)) === "0x"; i++) {
  if (i > 30) { console.error("the RPC still cannot see the contract; set the roles separately"); break; }
  await new Promise((r) => setTimeout(r, 2000));
}

if (deployerAddress.toLowerCase() === COUNCIL.toLowerCase()) {
  if (FINALISER) { await (await reg.setFinaliser(FINALISER, true)).wait(); console.error(`finaliser ${FINALISER}`); }
  if (STEWARD) { await (await reg.setSteward(STEWARD, true)).wait(); console.error(`steward ${STEWARD}`); }
} else if (FINALISER || STEWARD) {
  console.error("deployer is not the council; set roles from the council multisig");
}

const record = {
  address,
  block: receipt.blockNumber,
  council: COUNCIL,
  deployedAt: new Date().toISOString(),
  deployer: deployerAddress,
  tx: receipt.hash,
  contract: "CauseRegistry",
  version: "1.1",
};
const dir = new URL("../deployments/", import.meta.url);
mkdirSync(dir, { recursive: true });
const file = new URL(`${chainId}.json`, dir);
writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
console.log(JSON.stringify(record, null, 2));
