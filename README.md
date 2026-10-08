# Consumit

Consumit is a streaming and personal taste-discovery product for movies, series, and anime: watch, remember what you love, and keep a private library.

## Project status

The project includes the shared interface system, core product screens, TMDB and AniList catalogs, durable member identity and private library records, and configured direct-first playback with an explicitly approved Worker relay tier. Circle, follows, public profiles/list discovery, and review engagement are retired from the active personal product; historical records are retained. See the [product foundation](./docs/PRODUCT.md) for scope and the [current project quality review](./docs/audits/project-quality-2026-10-03.md) for verification status.

## Local development

The independent second frontend runs on port 3080 with `bun run dev:next` or `bun run docker:next`. The original frontend remains available. See [the new frontend guide](./apps/next-web/README.md) and [its experience and delivery note](./docs/FRONTEND-NEXT.md).

Use Bun 1.4.0 and Node 24 LTS (pinned in `.node-version`). The default loop is hybrid: data stores in Docker, app natively on the host for instant reload with no file-sync step and no restart.

```powershell
bun install
bun run dev:infra
```

In a second terminal, point the workspaces at the published stores. Copy the examples once, then set host addresses (Postgres is on 5434, Valkey on 6379, playback Valkey on 6381) and enable playback with the repo path to the local provider file:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env
bun --filter @consumit/api db:migrate:deploy
bun run dev
```

Required in `apps/api/.env`: `TMDB_API_READ_TOKEN`, `AUTH_CODE_PEPPER`, `RESEND_API_KEY`, `AUTH_EMAIL_FROM` (see the root `.env` for working values), plus `APP_ORIGIN=http://localhost:3000`, `DATABASE_URL=postgresql://consumit:consumit-local@127.0.0.1:5434/consumit`, `VALKEY_URL=valkey://127.0.0.1:6379/0`, `PLAYBACK_ENABLED=true`, `PLAYBACK_VALKEY_URL=valkey://127.0.0.1:6381/0`, `PLAYBACK_MEDIA_CONFIG=<absolute-path-to>/infra/playback/providers.local.json`. In `apps/web/.env`: `CONSUMIT_API_URL=http://127.0.0.1:3001`, `NEXT_PUBLIC_SITE_URL=http://localhost:3000`.

Then open `http://localhost:3000` directly — Next.js rewrites `/v1/*` to the API in development, so no gateway is involved. Edits reload instantly: the API watcher runs from the repo root so `apps/api` and the shared `packages/*` are all watched, and Fast Refresh updates the web app. Do not re-copy the `.env.example` files afterwards — that wipes the working values above.

If a stale dev server blocks startup (`Another next dev server is already running`), kill the listed PID and rerun:

```powershell
taskkill /PID <pid> /F
bun run dev
```

Run the complete local quality gate with `bun run check`.
`bun run infra:validate` requires Docker and uses the host Terraform installation or its container fallback. Database integration tests and the k6 playback load scenario require their documented isolated test services. Integration suites truncate fixture tables: use disposable stores, never the running application's database.

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

Production images bake the source in at build time, so edits stay invisible until the next `docker compose up --build`. For development, run the dev overlay instead: it builds the `api` and `web` services from source and runs their watch-mode dev servers, syncing every saved change into the running containers (bind mounts alone are not used because Windows mounts do not reliably emit the file events the dev servers watch for). Edits reach `http://localhost:8080` within seconds, including Next.js hot updates through the gateway. Postgres, Valkey, migrations, and the gateway stay exactly as in production:

```powershell
bun run docker:dev:watch
```

Stop it with `Ctrl+C`, then `docker compose -f compose.yaml -f compose.dev.yaml down`. The dev and production stacks share the same Postgres and Valkey volumes, so run only one at a time. Return to production-like images with `docker compose up --build`. Dependency, Dockerfile, or lockfile changes trigger an automatic image rebuild; anything else syncs live with no restart. For the containerized stack with playback enabled (same watch behavior, API served through the gateway), use `bun run docker:dev:playback` and open `http://localhost:8080` — without the playback file the API boots with zero providers and every `/v1/playback/resolve` returns 503.

## First frontend production release

The production target is `apps/web` at `https://consumit.online`. Run
`bun run production:prepare` to create ignored production configuration and
fresh secrets, then fill the real service settings privately. Run
`bun run production:check`, `bun run production:build`, and
`bun run production:up` on the provisioned VPS. The production wrapper isolates
developer configuration and includes playback and monitoring. Node 24 can run
the same commands directly through `scripts/production.mjs` without Bun.

Before member traffic, verify `bun run production:smoke`, real email, HTTPS
playback, alert delivery, and an offsite restore. See the
[production runbook](./docs/runbooks/cloudflare-production.md) and
[readiness audit](./docs/audits/deployment-readiness-2026-10-08.md).

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

The repository uses Bun workspaces with a Next.js web application, Bun/Fastify API, shared Zod contracts, shared UI, and provider SDK. Postgres stores member data; dedicated Valkey instances hold authentication and optional shared playback state. Watch uses the first-party player with validated browser-direct media. Public embeds remain deferred.
