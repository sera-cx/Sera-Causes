# Deploying causes.sera.cx

The stack is the one already in `docker-compose.yml` at the repository root:
Postgres, a one-shot `migrate`, an optional `seed`, the `api`, the `worker`
and an nginx `web` container serving the built site. The server holds the
checkout and builds the images itself, the same way sera.cx does.

## This is a preview

The first deployment is a public preview on seeded demo data. Settlement,
gSera and KYT run in mock or stub mode, verification is advisory, and no
registry is deployed, so nothing on the site moves real money.

Two things to settle before you share the link.

1. **Deposit addresses.** Seeded causes publish a deposit address and a QR
   code. Those belong to a demo wallet whose private key is in this
   repository, so anyone could take funds sent there. The preview must hide
   them, or the seed must be changed to addresses nobody controls.
2. **The 44 seeded causes are real Malaysian charities** and some carry
   research notes about lapsed tax status or compromised websites. They have
   not been contacted. Label the data plainly as an unverified sample, or
   reduce the set.

## One-time setup on the box

```bash
# 1. Clone next to the other Sera services.
git clone git@github.com:sera-cx/Sera-Causes.git
cd Sera-Causes

# 2. Check the host ports are free. The defaults are 3100 for the site and
#    3001 for the API. sera.cx holds 3000 and gSera holds 80 and 3300.
ss -ltnp | grep -E '3001|3100'

# 3. Create the environment file and fill it in.
cp .env.production.example .env
openssl rand -base64 32          # use for POSTGRES_PASSWORD
$EDITOR .env

# 4. Bring it up. The migrate container runs first and exits.
docker compose up -d --build
docker compose ps
```

### Seed the demo data

The `seed` service is one-shot and is not part of `up` by default.

```bash
docker compose run --rm seed
```

This resets the database and loads the 44 researched causes with demo gifts.
Run it only on the preview, never once real data exists.

## DNS and TLS

Point `causes.sera.cx` at the box through Cloudflare, as the other Sera sites
are. Terminate TLS properly rather than relying on Cloudflare's Flexible mode:
once Privy tokens are flowing, Flexible leaves the Cloudflare-to-origin hop in
the clear. Either a Cloudflare Tunnel or an Origin Certificate with Full
(strict) is fine.

nginx inside the `web` container serves the site and proxies the API paths, so
only one hostname is needed.

## Deploys

The server pulls; CI never reaches the server.

`.github/workflows/checks.yml` runs every package's check and test on a
GitHub-hosted runner, on pushes to `main` and on pull requests. That is all it
does. It has no access to the box and holds no deployment secrets.

Deployment is triggered by a webhook on the server, which runs the same update
by hand or on a push event:

```bash
cd /path/to/Sera-Causes
git fetch origin main
git reset --hard origin/main
docker compose up -d --build
curl -fsS http://127.0.0.1:3001/health
```

### Why there is no self-hosted runner

This repository is public. A self-hosted runner attached to a public
repository lets anyone who opens a pull request run code on that machine, with
whatever credentials it holds, and the runner persists between jobs, so
anything they leave behind stays. GitHub's own guidance is to use self-hosted
runners only with private repositories. The webhook keeps the trigger on the
server's side of the fence.

### Securing the webhook

Whatever receives the hook is a remote code execution endpoint, so treat it as
one:

- Verify GitHub's `X-Hub-Signature-256` HMAC against a webhook secret on every
  request, and compare in constant time. Reject anything unsigned.
- Act only on `push` events whose ref is exactly `refs/heads/main`, and ignore
  every other event and branch.
- Never pass any field from the payload into a shell command. The update is a
  fixed script that takes no arguments.
- Run it as a user that can do the deploy and nothing else, and rate limit it
  so a flood of pushes cannot queue a hundred rebuilds.
- Log every invocation with the commit it deployed.

## Rollback

```bash
docker image ls | grep rollback        # pick a tag
docker image tag sera-causes-api:rollback-<stamp> sera-causes-api:latest
docker compose up -d --no-build
```

Or simply reset the checkout to the previous commit and rebuild.

## Health and logs

```bash
curl -fsS http://127.0.0.1:3001/health   # {"ok":true,...}
docker compose logs -f api
docker compose logs -f worker
docker compose exec db psql -U sera_causes -d sera_causes -c '\dt'
```

## Before a real launch

In rough order:

1. Deploy `CauseRegistry` to Sepolia, then mainnet, and set `REGISTRY_ADDRESS`,
   `RPC_URL` and `REGISTRY_FROM_BLOCK`. An independent security review comes
   before mainnet.
2. Set the Privy variables and add causes.sera.cx to that app's allowed
   origins.
3. Set the Sera.cx API key and secret and switch `SETTLEMENT_MODE=live`.
   Confirm the testnet host with a live `GET /health` first: sera-pay and
   rotor use `api.testnet.sera.cx`, sera-mcp uses `api-testnet.sera.cx`.
4. Merge the gSera partner routes, set `GSERA_HMAC_KEY` and switch
   `GSERA_MODE=live`.
5. Agree the community XP route, then set `COMMUNITY_MODE=live`.
6. Point KYT at the real service and switch `KYT_MODE=live`.
7. Set `RESEND_API_KEY` so notifications send rather than log.
8. Have Malaysian counsel review the rules and terms pages.
