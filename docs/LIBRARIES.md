# Library decisions

## Runtime and workspace

- Bun 1.4.0 is the package manager, builder, script runner and workspace orchestrator. Active server bundles target Node.
- Node 24.21.0 is the pinned production runtime for web, product API, playback and workers. tsx 4.23.15 runs API/playback/worker development.
- Bun's native workspace filtering is sufficient for the current workspaces. Add a build graph or remote cache only when measured build time or dependency ordering requires one.

## Web application

- Next.js 16.3.8 with the App Router and React 19.2.8. The framework and its lint configuration share the patched 16.3 line.
- Tailwind CSS 4.3.3 for token-driven utility styling.
- Web declares TypeScript, Node types, and Vitest directly so its isolated Docker dependency install contains the build and type-check tooling; root tooling versions remain aligned.
- Lucide React 1.39.0 for consistent, typed, tree-shakable interface icons.
- Self-hosted Charter and DejaVu Sans webfonts preserve the design typography without depending on client machines or a remote font service.

## API

- Playback reuses native media, hls.js, and dash.js behind the existing visual player. `@consumit/provider-sdk` provides Zod contracts; no additional player framework is introduced.
- OpenTelemetry API/SDK and OTLP HTTP exporters provide opt-in playback traces and metrics. A separate disposable Valkey instance holds playback sessions, leases, and access caches.
- Playwright with branded Chrome verifies controlled H.264/AAC decoding and touch layouts. k6 supplies a local admission/load scenario. Physical Safari remains a separate release gate; see [PLAYBACK.md](./PLAYBACK.md).

- Fastify 5.12.5 on Node 24.21.0. Zod remains the contract authority; @fastify/swagger 9.9.2 and fastify-type-provider-zod 7.0.0 integrate request/response schemas and OpenAPI. Existing handler errors and refinements remain authoritative.
- `@fastify/cookie`, `@fastify/helmet`, and `@fastify/rate-limit` establish the same-origin HTTP boundary baseline.
- API modules expose an app factory so tests do not need to bind a network port.
- Native `fetch` is the TMDB transport. No provider wrapper is used, keeping retry, timeout, validation, and normalization policy inside the catalog adapter.
- Prisma with its PostgreSQL adapter and `pg` owns durable records through one bounded process pool. `iovalkey` provides separate authentication and disposable playback state. Authentication is application-owned; `hash-wasm` supplies password hashing and native HTTP supplies the email transport.
- BullMQ 6.3.14 with ioredis 6.0.0 runs on a third dedicated Valkey 9.1.1 instance with AOF/noeviction. PostgreSQL outbox intent and domain idempotency recover lost/repeated jobs. The browser entrypoint reuses the existing sandboxed release-check implementation.

## Catalog contracts

- Zod 4 defines the shared public catalog schemas in `@consumit/contracts` and validates every TMDB response before normalization.
- The contracts package owns catalog kinds, summaries, movie and series detail shapes, seasons, pages, structured errors, and canonical route helpers.

## Shared interface

- `class-variance-authority` defines typed visual variants.
- `clsx` and `tailwind-merge` combine caller classes without conflicting utilities.
- Navigation and player panels use the shipped Consumit controls. Unused Radix Dialog and Dropdown Menu dependencies are removed; introduce a primitive only when a named component consumes it.

## Quality

- TypeScript 6 and ESLint 9 remain on their supported conservative lines for the Next.js 16 toolchain.
- Vitest 4 and Testing Library cover behavior through public component and application interfaces.

## Deliberately deferred

Do not add these until a named vertical slice needs them: a client state manager, form framework, Storybook, or monorepo task runner. Database, authentication, Valkey, and telemetry dependencies above are already part of shipped slices.

When shared dependency versions become repetitive across more workspaces, introduce Bun catalogs. When lint or TypeScript configuration needs reuse beyond the root baseline, create explicit config packages rather than duplicating configuration.
