# apps/web

The causes.sera.cx frontend: Care Share Donate on Sera.cx. React 19, Vite 7,
wouter, Tailwind v4, shadcn new-york primitives, TanStack Query.

This is the forkable layer: rebrand it, restyle it, add features, or replace it.
The only rule is that gifts in a different stablecoin are swapped through
Sera.cx (`packages/sera-settlement`), nothing else.

## Run it

```sh
pnpm install                              # at the repo root
pnpm --filter @sera-causes/web dev        # http://localhost:3100
pnpm --filter @sera-causes/web check      # tsc
pnpm --filter @sera-causes/web test       # vitest
pnpm --filter @sera-causes/web build
```

With `VITE_API_URL` unset the app runs fully standalone on mock data built from
`seed/` at build time (`src/lib/mock`). Sign in is a mock that signs you in as
the demo wallet `0x5e7a…c0de`, which owns cause 1 (Kasih) and cause 14 (Free
Tree Society). Set `VITE_API_URL` to talk to the indexer API instead.

## Layout

- `src/lib/constants.ts`: mirror of `@sera-causes/shared`, swap when it lands.
- `src/lib/api.ts`: typed client for ARCHITECTURE.md section 6, mock or HTTP.
- `src/lib/mock/`: deterministic world from the 44 seeded causes.
- `src/lib/auth.tsx`: `AuthAdapter` with a mock; a Privy adapter drops in later.
- `src/pages/`: one file per route in docs/PLAN.md section 2.5.
- `src/components/GreenField.tsx`: the house style for anything showing numbers.

SSR is not wired yet. Pages avoid `window` at module top level so an Express
SSR entry like sera.cx's `server/ssr.ts` can pre-fetch the home and cause pages.
