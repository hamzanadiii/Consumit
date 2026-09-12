# Library decisions

## Runtime and workspace

- Bun 1.4.0 is the package manager, script runner, API runtime, and workspace orchestrator.
- Node 24 LTS is the supported Node.js line for framework tooling and ecosystem compatibility.
- Bun's native workspace filtering is sufficient for the current three workspaces. Add a build graph or remote cache only when measured build time or dependency ordering requires one.

## Web application

- Next.js 16.3.4 with the App Router and React 19.2.8.
- Tailwind CSS 4.3.3 for token-driven utility styling.
- Lucide React 1.39.0 for consistent, typed, tree-shakable interface icons.
- Self-hosted Charter and DejaVu Sans webfonts preserve the design typography without depending on client machines or a remote font service.

## API

- Playback reuses native media, hls.js, and dash.js behind the existing visual player. `@consumit/provider-sdk` provides Zod contracts; no additional player framework is introduced.
- OpenTelemetry API/SDK and OTLP HTTP exporters provide opt-in playback traces and metrics. A separate disposable Valkey instance holds playback sessions, leases, and access caches.
- Playwright with branded Chrome verifies controlled H.264/AAC decoding and touch layouts. k6 supplies a local admission/load scenario. Physical Safari remains a separate release gate; see [PLAYBACK.md](./PLAYBACK.md).

- Fastify 5.12.1 on Bun.
- `@fastify/cors`, `@fastify/helmet`, and `@fastify/rate-limit` establish the HTTP boundary baseline.
- API modules expose an app factory so tests do not need to bind a network port.
- Native `fetch` is the TMDB transport. No provider wrapper is used, keeping retry, timeout, validation, and normalization policy inside the catalog adapter.

## Catalog contracts

- Zod 4 defines the shared public catalog schemas in `@consumit/contracts` and validates every TMDB response before normalization.
- The contracts package owns catalog kinds, summaries, movie and series detail shapes, seasons, pages, structured errors, and canonical route helpers.

## Shared interface

- `class-variance-authority` defines typed visual variants.
- `clsx` and `tailwind-merge` combine caller classes without conflicting utilities.
- Radix Dialog 1.1.23 provides focus management, Escape dismissal, focus restoration, and modal semantics for the global navigation's mobile panel. Other Radix primitives remain deferred until a named component needs them.

## Quality

- TypeScript 6 and ESLint 9 remain on their supported conservative lines for the Next.js 16 toolchain.
- Vitest 4 and Testing Library cover behavior through public component and application interfaces.

## Deliberately deferred

Do not add these until a named vertical slice needs them: database ORM, Postgres client, Valkey client, authentication, state manager, forms, queues, telemetry SDKs, Storybook, and monorepo task runners.

When shared dependency versions become repetitive across more workspaces, introduce Bun catalogs. When lint or TypeScript configuration needs reuse beyond the root baseline, create explicit config packages rather than duplicating configuration.
