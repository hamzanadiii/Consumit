# Consumit

Consumit is a cinematic social streaming and taste-discovery product for movies and series: watch immediately, remember what you love, and discover through people whose taste you trust.

## Project status

The project now includes the shared interface system, core product screens, and a TMDB-backed catalog slice. TMDB is the canonical source for movie and series metadata; Consumit-owned ratings, progress, Taste Match, and Circle activity remain deterministic preview data until member persistence is introduced.

## Local development

Use Bun 1.4.0 and Node 24 LTS (pinned in `.node-version`).

```bash
bun install
bun run dev
```

Before starting the catalog locally, copy the two committed examples to ignored local files:

```bash
cp apps/api/.env.example apps/api/.env.local
cp apps/web/.env.example apps/web/.env.local
```

Set `TMDB_API_READ_TOKEN` in `apps/api/.env.local` to a TMDB API Read Access Token. Keep it server-only; the web application talks to the Consumit API and never calls TMDB directly. Bun does not automatically load a package-level `.env.local` from the monorepo root, so either start each workspace from its package directory or export the variables in your shell before `bun run dev`.

For PowerShell from the repository root:

```powershell
$env:TMDB_API_READ_TOKEN = '<your-read-access-token>'
$env:TMDB_LANGUAGE = 'en-US'
$env:TMDB_REGION = 'US'
bun run dev
```

Run the complete local quality gate with `bun run check`.

## Project guide

| Document | Purpose |
|---|---|
| [Domain context](./CONTEXT.md) | Canonical product language |
| [Product foundation](./docs/PRODUCT.md) | Promise, experience loops, active surfaces, and scope |
| [Architecture foundation](./docs/ARCHITECTURE.md) | Target modules, playback, data, security, scale, and operations |
| [Delivery strategy](./docs/DELIVERY.md) | Small-modules-to-screens-to-logic implementation order |
| [Library decisions](./docs/LIBRARIES.md) | Installed foundation and deliberately deferred dependencies |
| [Component roadmap](./docs/COMPONENTS.md) | Ordered shared-component inventory and implementation status |
| [Open decisions](./docs/OPEN-QUESTIONS.md) | Questions that must not be guessed away |
| [Agent working agreement](./AGENTS.md) | Task-specific reading and execution rules |

## Design reference

[`DESIGN.md`](./DESIGN.md) captures the visual system, while [`docs/COMPONENTS.md`](./docs/COMPONENTS.md) records the shared-component registry and implementation boundaries.

- `manifest.json` is the authority for active and deprecated screens.
- `docs/brand-system.md` is the visual and interaction contract.
- `archive/custom-player-concept/` is project history and is not implementation input.

## Implementation foundation

The repository uses Bun workspaces with a Next.js web application, a Bun/Fastify API, shared Zod catalog contracts, and a shared UI package. Postgres, Valkey, authentication, durable member data, and authorized playback integrations remain deferred until a vertical slice requires them.
