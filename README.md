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

## Docker stack

The complete application runs behind one local origin with Docker Compose. Compose automatically loads the ignored `apps/api/.env` and `apps/web/.env` files when they exist, while keeping container-only database and Valkey addresses internal:

```bash
docker compose up --build
```

Configure the API secrets in `apps/api/.env`. You may also copy `.env.docker.example` to a root `.env` for Docker-specific overrides such as the public port, origin, or local database password. Then open `http://localhost:8080`. Nginx sends `/v1/*` directly to Fastify and all other requests to Next.js; Postgres and Valkey stay on the private Compose network.

The `migrate` container applies reviewed Prisma migrations before the API becomes healthy. The API itself never runs migrations during startup. Integration-only stores remain opt-in:

```bash
docker compose --profile test up postgres-test valkey-test
```

Build individual Consumit images with `docker build --target api`, `--target web`, or `--target gateway` when a full Compose deployment is not needed.

### Live updates in Docker

Production images bake the source in at build time, so edits stay invisible until the next `docker compose up --build`. For development, run the dev overlay instead: it builds the `api`, `web`, and `letterboxd-worker` services from source and runs their watch-mode dev servers, syncing every saved change into the running containers (bind mounts alone are not used because Windows mounts do not reliably emit the file events the dev servers watch for). Edits reach `http://localhost:8080` within seconds, including Next.js hot updates through the gateway. Postgres, Valkey, migrations, and the gateway stay exactly as in production:

```bash
bun run docker:dev
```

Stop it with `Ctrl+C`, then `docker compose -f compose.yaml -f compose.dev.yaml down`. The dev and production stacks share the same Postgres and Valkey volumes, so run only one at a time. Return to production-like images with `docker compose up --build`. Dependency, Dockerfile, or lockfile changes trigger an automatic image rebuild; anything else syncs live with no restart.

## Project guide

| Document | Purpose |
|---|---|
| [Domain context](./CONTEXT.md) | Canonical product language |
| [Product foundation](./docs/PRODUCT.md) | Promise, experience loops, active surfaces, and scope |
| [Architecture foundation](./docs/ARCHITECTURE.md) | Target modules, playback, data, security, scale, and operations |
| [Delivery strategy](./docs/DELIVERY.md) | Small-modules-to-screens-to-logic implementation order |
| [Library decisions](./docs/LIBRARIES.md) | Installed foundation and deliberately deferred dependencies |
| [Component roadmap](./docs/COMPONENTS.md) | Ordered shared-component inventory and implementation status |
| [Agent working agreement](./AGENTS.md) | Task-specific reading and execution rules |

## Design reference

[`DESIGN.md`](./DESIGN.md) captures the visual system, while [`docs/COMPONENTS.md`](./docs/COMPONENTS.md) records the shared-component registry and implementation boundaries.

- `manifest.json` is the authority for active and deprecated screens.
- `docs/brand-system.md` is the visual and interaction contract.
- `archive/custom-player-concept/` is project history and is not implementation input.

## Implementation foundation

The repository uses Bun workspaces with a Next.js web application, a Bun/Fastify API, shared Zod catalog contracts, and a shared UI package. Postgres, Valkey, authentication, durable member data, and configured playback integrations remain deferred until a vertical slice requires them.
