# Sepolia demo

A live `CauseRegistry` v1.1 on Sepolia, for trying the real chain path.

| | |
| --- | --- |
| Registry | `0x06A0e9D5B2D02847E72aad9eD2fee57244268034` |
| Deployed at block | 11949609 |
| Council, finaliser, steward | `0x31860Cf4C76b99619b7aa124a9876d6C1f7da4bb` |
| Explorer | https://sepolia.etherscan.io/address/0x06A0e9D5B2D02847E72aad9eD2fee57244268034 |

One key holds all three roles, so nothing here is trust-minimised. It is a
testnet demo and nothing more. Six causes are listed; seeding was stopped part
way on purpose.

The deployer key is in `.sepolia-deployer.env` at the repository root, which is
gitignored. It is a throwaway funded from a public faucet. Never reuse it.

## Run the whole thing against it

```bash
# 1. point the indexer at Sepolia (indexer/.env)
RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
REGISTRY_ADDRESS=0x06A0e9D5B2D02847E72aad9eD2fee57244268034
REGISTRY_FROM_BLOCK=11949609
CHAIN_ID=11155111

# 2. rebuild the database purely from chain events
cd indexer
npx prisma migrate reset --force --skip-seed --skip-generate
npx tsx src/api/server.ts      # one shell
npx tsx src/workers/index.ts   # another

# 3. the site, pointed at that API
VITE_API_URL=http://localhost:3001 VITE_CHAIN_ID=11155111 \
  VITE_REGISTRY_ADDRESS=0x06A0e9D5B2D02847E72aad9eD2fee57244268034 \
  PORT=3200 pnpm --filter @sera-causes/web dev
```

Profiles are fetched from each cause's on-chain `uri`. The seeded causes point
at `https://causes.sera.cx/seed/<slug>.json`, which does not exist yet, so
their names stay as placeholders until that host is up. Point `URI_BASE` at a
reachable host when seeding, for example a running API at
`http://localhost:3001/seed/`.

## Add more causes

```bash
cd contracts
KEY=$(grep DEPLOYER_KEY ../.sepolia-deployer.env | cut -d= -f2)
RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \
REGISTRY=0x06A0e9D5B2D02847E72aad9eD2fee57244268034 \
LISTER_KEY=$KEY RESEARCH_KEY=$KEY \
URI_BASE="http://localhost:3001/seed/" \
node scripts/seed.mjs
```

It resumes nothing: every run appends new causes, so a second run duplicates
what is already there.

## Deploy a fresh one

```bash
cd contracts
KEY=$(grep DEPLOYER_KEY ../.sepolia-deployer.env | cut -d= -f2)
ADDR=0x31860Cf4C76b99619b7aa124a9876d6C1f7da4bb
RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \
DEPLOYER_KEY=$KEY COUNCIL=$ADDR FINALISER=$ADDR STEWARD=$ADDR \
node scripts/deploy.mjs
```

The record lands in `deployments/<chainId>.json`.

## Two things a real chain taught us

Both are fixed, and both would have bitten on any public RPC.

- **Nonces.** A provider caches the account nonce briefly, so a long run of
  sends reuses a stale one. Signers now go through a `NonceManager`, with one
  manager per account, since a demo run often points two roles at one key.
- **RPC lag after deployment.** A public endpoint is several nodes behind one
  address, and the one answering next may not have the new contract yet. A role
  call sent into that gap is estimated against an empty account and reverts on
  chain. The deploy script now waits until the RPC can see the code.

## Faucet

The deployer was funded at the Google Cloud Web3 faucet, which gives 0.05 ETH
per day: https://cloud.google.com/application/web3/faucet/ethereum/sepolia
