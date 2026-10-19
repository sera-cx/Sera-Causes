import ganache from "ganache";
const server = ganache.server({
  logging: { quiet: true },
  wallet: { mnemonic: "myth like bonus scare over problem client lizard pioneer submit female collect", totalAccounts: 10, defaultBalance: 1000 },
  chain: { hardfork: "merge", chainId: 1337 },
  miner: { blockTime: 0 },
});
await server.listen(8545);
console.log("ganache listening on 8545");
