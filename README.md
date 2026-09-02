# Consumit

Consumit is a cinematic social streaming and taste-discovery product for movies and series: watch immediately, remember what you love, and discover through people whose taste you trust.

## Project status

The project is in **foundation stage**. The repository intentionally contains documentation and the desktop UI reference package, with no application scaffold or product implementation yet.

Before coding, resolve the workspace foundation, first implementation slice, design-package versioning, and playback scope in [Open decisions](./docs/OPEN-QUESTIONS.md).

## Project guide

| Document | Purpose |
|---|---|
| [Domain context](./CONTEXT.md) | Canonical product language |
| [Product foundation](./docs/PRODUCT.md) | Promise, experience loops, active surfaces, and scope |
| [Architecture foundation](./docs/ARCHITECTURE.md) | Target modules, playback, data, security, scale, and operations |
| [Delivery strategy](./docs/DELIVERY.md) | Small-modules-to-screens-to-logic implementation order |
| [Open decisions](./docs/OPEN-QUESTIONS.md) | Questions that must not be guessed away |
| [Agent working agreement](./AGENTS.md) | Task-specific reading and execution rules |

## Design reference

`design/Consumit_UI_Package/` contains active desktop PNG/SVG screens, brand assets, CSS tokens, the module registry, and page grammar.

- `manifest.json` is the authority for active and deprecated screens.
- `docs/brand-system.md` is the visual and interaction contract.
- `archive/custom-player-concept/` is project history and is not implementation input.

## Intended implementation direction

The founding direction is a monorepo with a Next.js web application, Bun/Fastify API, Postgres, and Valkey. The workspace will be scaffolded lazily after the first slice and tooling decisions are confirmed.
