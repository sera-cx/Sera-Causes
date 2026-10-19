# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# deps: install the pnpm workspace so every later stage shares one node_modules
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS deps
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

# Prisma needs to detect OpenSSL to pick the right engine binary.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

# Workspace manifests first, for a cached install layer.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/sera-settlement/package.json ./packages/sera-settlement/package.json
COPY packages/gsera-client/package.json ./packages/gsera-client/package.json
COPY contracts/package.json ./contracts/package.json
COPY indexer/package.json ./indexer/package.json

RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# build: compile the workspace packages the services import, plus the services
# ---------------------------------------------------------------------------
FROM deps AS build
WORKDIR /app
COPY . .

# Vite reads VITE_* at build time; empty values behave like "unset" (mock mode).
ARG VITE_API_URL
ARG VITE_PRIVY_APP_ID
ARG VITE_CHAIN_ID
ARG VITE_REGISTRY_ADDRESS
ENV VITE_API_URL=$VITE_API_URL \
    VITE_PRIVY_APP_ID=$VITE_PRIVY_APP_ID \
    VITE_CHAIN_ID=$VITE_CHAIN_ID \
    VITE_REGISTRY_ADDRESS=$VITE_REGISTRY_ADDRESS

# Prisma client must be generated before the indexer type-checks/builds.
RUN pnpm --filter @sera-causes/indexer db:generate \
 && pnpm --filter @sera-causes/shared build \
 && pnpm --filter @sera-causes/sera-settlement build \
 && pnpm --filter @sera-causes/gsera-client build \
 && pnpm --filter @sera-causes/indexer build \
 && pnpm --filter @sera-causes/web build

# ---------------------------------------------------------------------------
# indexer runtime: the API and the worker share this image
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS indexer
ENV NODE_ENV=production

# OpenSSL for Prisma's engine detection and runtime queries.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Full node_modules plus the built workspace so every relative symlink resolves.
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY --from=build /app/pnpm-lock.yaml /app/pnpm-lock.yaml
COPY --from=build /app/packages /app/packages
COPY --from=build /app/indexer /app/indexer
COPY --from=build /app/seed /app/seed
COPY --from=build /app/contracts /app/contracts

# Writable dirs for uploads and the published snapshot/results.
RUN mkdir -p /app/indexer/uploads /app/indexer/public

WORKDIR /app/indexer
EXPOSE 3001
CMD ["node", "dist/api/server.js"]

# ---------------------------------------------------------------------------
# web runtime: nginx serves the SPA and proxies the API (same-origin optional)
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS web
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
