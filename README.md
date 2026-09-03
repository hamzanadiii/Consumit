# Consumit

Consumit is a cinematic social streaming and taste-discovery product for movies and series: watch immediately, remember what you love, and discover through people whose taste you trust.

## Project status

The project is in **shared-interface foundation stage**. The repository contains a Bun monorepo, a Next.js web shell, a Fastify API shell, the first shared UI primitive, project documentation, and the desktop UI reference package.

The current slice is intentionally narrow: establish the visual tokens and build shared components one at a time before composing screens or adding product logic.

## Local development

Use Bun 1.4.0 and Node 24 LTS (pinned in `.node-version`).

```bash
bun install
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

The repository uses Bun workspaces with a Next.js web application, a Bun/Fastify API, and a shared UI package. Postgres, Valkey, authentication, schema tooling, and product integrations remain deferred until a vertical slice requires them.
