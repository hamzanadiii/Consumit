# Architecture foundation

## Status

This document organizes the target direction from the founding architecture brief. The web, API, shared UI, contracts, canonical catalog, identity, member read models, Letterboxd worker, and direct-playback foundation exist. Social relationships remain future work.

## System shape

Consumit resolves playback, manages sessions, ranks providers, and stores member data. It avoids proxying media bytes.

```text
Cloudflare edge
  -> Web application
  -> Public API
      -> Product modules
      -> Social modules
      -> Playback modules
          -> Resolver
          -> Provider scheduler
          -> Provider adapters
          -> Validation
      -> Postgres / Valkey / queues
      -> Telemetry and workers
```

Start as a monorepo and a modular system. Split deployment units only when load, security isolation, or operational ownership makes the seam real.

## Target stack

The selected foundation is:

- Bun 1.4 workspaces and Node 24 LTS
- Next.js 16 web application with React 19 and Tailwind CSS 4
- Bun/Fastify 5 API
- Shared React UI package with Lucide icons and typed variants
- Shared Zod application contracts consumed by Fastify and Next.js

The longer-term direction remains:

- PostgreSQL 17 for durable members, credentials, profiles, aliases, library records, lists, and import staging
- Valkey 9 for opaque sessions, temporary authentication challenges, username reservations, and rate-limit state
- Cloudflare for DNS, WAF, CDN, and edge rate limiting
- A simple Docker-based deployment on infrastructure such as Hetzner
- OpenTelemetry, Prometheus, Grafana, Loki, and Sentry for initial observability
- ClickHouse later for high-volume playback analytics

Dependency rationale and deferred choices are recorded in [LIBRARIES.md](./LIBRARIES.md). Data, infrastructure, and deployment vendors are selected only when a product slice requires them.

## Planned workspace shape

Create only the parts demanded by an implementation slice. The current tree begins with `apps/web`, `apps/api`, and `packages/ui`; the following remains a destination:

```text
apps/
  web/
  api/
  admin/
services/
  resolver-worker/
  telemetry-worker/
  metadata-worker/
  scheduler-worker/
packages/
  provider-sdk/
  playback-sdk/
  player/
  db/
  cache/
  contracts/
  telemetry/
providers/
infra/
  docker/
  nginx/
  terraform/
  monitoring/
  scripts/
```

The tree is a destination, not a request for empty packages.

## Module and dependency rules

The provider contract is the external seam for playback integrations. Provider-specific parsing, identifiers, errors, and quirks remain behind each adapter.

```text
Provider adapter
  -> Provider contract
  -> Resolver
  -> Playback interface
  -> Web experience
```

Product and social modules consume stable title and playback results; they do not reach into provider implementations. Page code does not query provider sites or the database directly.

Prefer deep modules with small interfaces that hide scheduling, validation, expiry, and recovery. Create a seam when implementations genuinely vary, not only because they might vary someday.

## Canonical catalog

TMDB is the canonical metadata source and identifier namespace for movies, series, seasons, episodes, cast, posters, and backdrops. Anime remains a movie or series classification rather than a separate catalog kind. Catalog requests use English metadata (`en-US`), the US market, and always exclude adult results.

Next.js page code talks only to the versioned Consumit catalog API. TMDB credentials remain in the Fastify process and never enter Next.js or browser bundles. The catalog module exposes a small injectable interface with fake and TMDB implementations; the TMDB adapter owns authentication, upstream schemas, normalization, image configuration, retry policy, timeouts, and caching.

Catalog metadata and playback availability are independent. A real TMDB title can exist without a configured playback source. In that state, the dedicated first-party player screen identifies the title, loads no demo or embed, disables media controls, and offers return and report actions.

The current in-process catalog cache uses request coalescing and stale-while-revalidate. Search is fresh for 5 minutes and stale for 1 hour; discovery is fresh for 15 minutes and stale for 24 hours; details and seasons are fresh for 6 hours and stale for 7 days; TMDB image configuration is fresh for 24 hours and stale for 7 days. A shared cache becomes necessary only when multiple API instances require consistent catalog reuse.

## Identity and import boundaries

The browser authenticates through one same-origin opaque `HttpOnly` session cookie. Only its SHA-256 token hash is stored in Valkey; no authentication token is written to browser storage. PostgreSQL owns durable members, Argon2id credentials, profiles, permanent username aliases, library data, and import records. A verified email is required before the durable account and first session are issued.

Letterboxd upload handling is one deep module: ZIP/CSV parsing, resource limits, normalization, provenance, TMDB matching, review state, idempotent confirmation, and imported-data deletion stay behind the importer interface. Uploaded archive bytes are discarded after normalized staging. The worker claims PostgreSQL jobs with `FOR UPDATE SKIP LOCKED`; TMDB remains the title metadata authority and Letterboxd URLs are provenance keys only.

## Canonical provider contract

Every provider adapter exposes the same conceptual input and result.

### Input

- Title kind: movie or series episode; anime follows the underlying movie or series kind.
- Stable TMDB catalog identifier.
- Title and release year as fallback identification.
- Season and episode for episodic playback.
- Context required for region, language, and safe provider selection.

### Result

- Provider identity.
- Zero or more validated sources.
- Subtitle tracks when available.
- Expiration time for temporary access.
- Resolution latency and structured failure information.

A source describes its direct delivery type, URL, quality, and language. External output is untrusted and schema-validated at the adapter seam.

## Resolve lifecycle

```text
Authenticate and rate-limit
  -> Normalize title identity
  -> Check process-memory cache
  -> Check shared cache
  -> Return a known valid source when available
  -> Select provider candidates
  -> Run hedged provider attempts
  -> Validate results
  -> Rank valid candidates
  -> Cache discovery separately from expiring access
  -> Create a playback session
  -> Return the selected source and fallback capability
```

### Hedged execution

Do not race every provider on every miss. The initial scheduler starts the best candidate, hedges after 600ms, permits at most two simultaneous attempts and three independent candidate groups, and stops within eight seconds.

Each adapter has a hard timeout, concurrency ceiling, requests-per-second limit, burst limit, and bounded queue. A slow or overloaded provider cannot hold the whole request open.

### Dynamic ranking

Provider order is learned rather than hardcoded. The initial proposed score is:

| Signal | Weight |
|---|---:|
| Success rate | 30% |
| Time to first frame | 20% |
| Resolver latency | 15% |
| Buffering rate | 10% |
| Fatal error rate | 10% |
| Stream quality | 5% |
| Subtitle availability | 5% |
| Recent health | 5% |

Scores are segmented by provider, country, and title kind; ISP/ASN is an optional later dimension. Exponentially weighted recent performance prevents old success from hiding a current outage.

### Circuit breaker

Each provider moves through:

```text
CLOSED -> OPEN -> HALF_OPEN -> CLOSED
```

Repeated failures open the circuit and stop normal traffic. After a cooling period—60 seconds in the founding example—a small number of probes determines whether normal traffic resumes.

## Caching and hot paths

The cache path is browser/edge, process memory, shared Valkey, then resolver.

| Layer | Purpose | Initial guidance |
|---|---|---|
| Browser/edge | Publicly safe responses and static assets | Policy depends on privacy and expiry |
| Process memory | Extremely hot resolution data | 10–60 seconds |
| Valkey-cache (later) | Optional shared resolver cache | 5–30 minutes when measured need and source policy permit |
| Negative cache | Known provider/title misses | 30 seconds–5 minutes |

Provider discovery and temporary playback access are separate cache records. Expiring access uses its provider expiry minus a 30–120 second safety margin.

Use single-flight/request coalescing so one resolver refresh serves concurrent misses for the same title. Serve slightly stale safe results within a stale-while-revalidate window while a worker refreshes them. Warm only a bounded hot-title set (views, title opens, watch intent, playback demand) in the background — never every detail view, and never through unbounded provider fan-out.

## Background work

Keep non-user-blocking work out of HTTP requests. The active Letterboxd worker claims durable
Postgres jobs directly. A later shared queue may run:

- Resolver refresh jobs
- Metadata synchronization
- Telemetry ingestion and aggregation
- Hot-title warming
- Provider health probes
- Notification/release work when that product surface exists

Kafka, Redpanda, or NATS JetStream are later options only if measured event volume or delivery semantics require them.

## Playback model

A resolve result creates a playback session rather than returning only a URL. The session retains:

- Session identity
- Stable title or episode identity
- Current provider and source
- Start time and last position
- Country and selected quality when relevant
- Fallback count and structured errors

Progress is stored by member and title/episode, never by provider URL.

When the active source fails, the playback flow excludes that source/provider, resolves a validated fallback, reloads it, seeks to the retained position when the delivery mode permits, and resumes with calm product language such as “Switching source…”.

The Consumit Player owns the playback controls and native media surface. A playback controller will load configured HLS, DASH, or direct media sources through adapters while keeping source resolution, failover, and progress outside the visual component. Iframe and embed adapters are excluded from the product direction.

Delivery is strictly browser-direct. Validated HTTPS media travels from a configured provider CDN to the member's browser; Consumit never proxies, leases, rewrites, or transforms media bytes. Unknown, expired, header-locked, cookie-bearing, or DASH sources are unavailable.

## Data ownership

### Postgres

- Members, credentials, and profiles
- Follows/circle relationships
- Ratings, reviews, favorites, lists, and list collaboration
- Watch history and progress
- Stable catalog references
- Playback-session history when durable retention is needed
- Provider configuration and aggregates

### Valkey authentication state

A dedicated Valkey instance or namespace owns opaque sessions, verification and recovery
challenges, pending Username reservations, and authentication rate-limit state. It runs with
`noeviction`, AOF every second, and no catalog-cache mixing. Total loss safely logs members out
and invalidates pending codes without removing durable member data. Shared catalog/resolver cache
remains a later, separate reliability class introduced only on measured need.

### Analytics store, later

High-volume raw playback telemetry belongs in an analytics-oriented store such as ClickHouse instead of becoming a query workload on primary Postgres.

Use strong consistency for identity, access, privacy, and security-sensitive changes. Provider rankings, analytics, counters, and trending data may be eventually consistent.

## Telemetry and reliability targets

Playback emits structured lifecycle events such as:

- `RESOLVE_STARTED`
- `PROVIDER_STARTED`
- `PROVIDER_SUCCESS`
- `PROVIDER_FAILED`
- `MANIFEST_LOADED`
- `PLAYBACK_STARTED`
- `BUFFER_STARTED`
- `BUFFER_ENDED`
- `PLAYER_ERROR`
- `SOURCE_SWITCHED`
- `PLAYBACK_ENDED`

Collect only the member data required for product and operations. Carry one trace identifier from web to API, resolver, adapter, validator, and telemetry.

Primary measures are playback success, time to first frame, provider resolution latency, cache-hit ratio, rebuffer ratio, fallback rate, and fatal playback rate. Inspect p50, p95, and p99, not only averages.

Longer-term targets from the founding brief:

| Measure | Target |
|---|---:|
| API availability | 99.95%+ |
| Resolve success | >99% |
| Cached resolve p95 | <100 ms |
| Fresh resolve p95 | <1.5 s |
| Playback-start success | >98% |
| Internal API p95 | <250 ms |

These are target SLOs, not launch claims. Establish baselines before treating them as commitments.

## Interface inventory

Candidate public routes from the founding brief:

```text
GET  /v1/titles/discover
GET  /v1/titles/search
GET  /v1/titles/batch
GET  /v1/titles/:kind/:id
GET  /v1/titles/series/:id/seasons/:season
POST /v1/playback/resolve
POST /v1/playback/:session/fallback
POST /v1/playback/:session/events
PUT  /v1/progress
GET  /v1/progress/:title
GET  /v1/providers/status
```

Internal and admin capabilities include provider health, resolver refresh, provider scores, provider enable/disable, circuit reset, source tests, playback errors, cache inspection, and incidents. Internal and admin interfaces do not share the public exposure surface. Public interfaces are versioned from the first release.

This is an interface inventory, not route-level implementation approval. Contract naming follows [the domain glossary](../CONTEXT.md).

## Security baseline

- Provider adapters receive only the secrets, cache/queue access, and telemetry access required for resolution—not member credentials or social data.
- Validate all external results at the seam.
- Bound connection, request, resolution, and manifest time independently.
- Retry at most one or two times with exponential backoff and jitter; prevent retry storms.
- Rate-limit at the edge, per member/session in the API, and per provider in the resolver.
- Protect URL-fetching paths from SSRF. Block loopback, private networks, metadata endpoints, internal DNS, and non-HTTP protocols; prefer explicit domain allowlists.
- Keep secrets in environment-backed secret storage initially and rotate them. Move to a dedicated secret manager as operations mature.
- Keep public, internal, and admin interfaces separate.
- Direct playback sources come from the configured provider set; system quality does not remove copyright, contract, or regional obligations.

## Deployment progression

### Stage 1: simple production

Cloudflare fronts one small VPS running the web app, API, resolver, and Letterboxd worker; managed
Postgres with backups provides durable member/product truth, and dedicated Valkey provides
authentication state. Bounded process memory covers disposable cache and single-flight. Docker
provides repeatable operation. Additional worker capacity and shared disposable cache arrive on
measured need. Named infrastructure vendors remain candidates, not mandatory commitments.

### Stage 2: measured horizontal growth

Add multiple stateless API instances, dedicated worker pools, managed/shared cache, Postgres pooling, a load balancer, CI/CD, and an analytics store when traffic justifies them.

### Stage 3: orchestration

Adopt container orchestration, autoscaling, regional resolver pools, read replicas, distributed tracing, and centralized logs only after operational demand appears.

### Stage 4: multi-region

Add global traffic steering, regional caches, disaster recovery, and automated failover only when user geography and availability goals justify the complexity.

Important state never lives only in an API process. Scale API servers, resolver workers, telemetry consumers, and metadata workers horizontally. Autoscaling considers queue depth, active requests, latency, memory, and event-loop lag in addition to CPU.

## Verification and operations

Every provider adapter needs contract tests and fixtures for movies, episodes, special-character titles, missing titles, timeouts, and malformed output. Synthetic checks regularly exercise configured known titles before members discover an outage.

Load tests cover cache hits and misses, provider outage, cache outage, database latency, worker crashes, slow DNS, and hot-title stampedes. Canary changes through small traffic percentages and roll back on degraded playback measures.

The intended delivery pipeline is lint, typecheck, unit tests, provider contract tests, integration tests, build, staging, smoke test, and production canary. Feature flags isolate risky provider, resolver, scoring, and failover changes.

## Backend standards

These standards generalize the catalog module's established shape (`apps/api/src/catalog/`: injectable interface, route registrar, typed errors, fake/real adapters, interface-level tests) and fold in the lessons of the previous Consumit backend. Every new module — identity, library, social, playback — repeats this pattern instead of inventing its own.

### Kept from the previous backend

- Small injectable module interfaces with deterministic fakes beside the real adapters.
- JSON error envelope `{ error: { code, message, retryable } }`, typed domain errors carrying status codes, plain-language 400s.
- Zod validation at the route boundary; shared schemas live in `@consumit/contracts`.
- Per-route rate limits layered under edge and per-provider limits.
- Stale-while-revalidate plus single-flight coalescing, bounded in-process caches, and a timeout on every external call. One provider failure never crashes a request.
- Resolver discipline for playback: tiered candidates, hedged starts, dedupe, observed-quality ranking, health quarantine (Stage 6).
- DB-first subtitle enrichment remains a future slice; current playback exposes only direct HTTPS WebVTT tracks.
- Non-blocking work in queues with separate worker entry points; request-serving processes stay stateless.

### Deliberately different this time

1. **Cookie sessions, never localStorage JWT.** Sessions are opaque identifiers in `HttpOnly`, `Secure`, `SameSite=Lax` cookies backed by Valkey, with rotation on privilege change and origin checks on cookie-authenticated mutations. Browser storage never holds authentication authority.
2. **Validated browser-direct media, without an escape hatch.** Provider output is hostile until validated. Anything requiring custom browser-forbidden headers, cookies, rewriting, transformation, or server-side media fetching is unavailable.
3. **No rooms, DMs, watch parties, donations, or checkout.** That scope is excluded; do not scaffold it. Ads arrive as their own module in Phase 9 with fail-open playback (ad failure never blocks media).
4. **Fastify module registrars.** Each module exposes `register<Module>Routes(app, deps)`; routes validate and translate, business rules live behind the module interface.
5. **Prisma + Postgres recommended** for the first persistence slice (team familiarity, disciplined migrations). Schema and migration changes still require explicit approval.
6. **Localized failure.** No global API-down panic: auth/catalog/playback failures stay in their surface with retry or fallback, as the web shell already expects.
7. **OpenTelemetry over bespoke metrics.** Trace identifiers already travel web to adapter; add OTEL spans for resolve, adapter, and validation work plus `/health` dependency checks before building custom metric singletons.

### Module layout

```text
apps/api/src/<module>/
  <module>.ts        # injectable interface — the only thing callers program to
  routes.ts          # register<Module>Routes(app, deps): validation, status codes, headers
  errors.ts          # typed domain error + codes (codes also declared in contracts)
  fake-<module>.ts   # deterministic fake for tests and web fixtures
  <adapter>.ts       # real implementation (postgres, upstream, provider SDK)
  *.test.ts          # interface-level tests, network-independent
```

Adapters own secrets, upstream schemas, retry policy, timeouts, and caching. Page and worker code never imports an adapter directly. Provider adapters additionally live behind the `packages/provider-sdk/` seam with contract tests and fixtures.

### Request lifecycle

Authenticate → rate-limit → validate (Zod, 400 with plain language) → authorize (ownership enforced inside the query, never via client-supplied member ids) → coalesced cached-or-fresh read or bounded write → envelope response → telemetry event with the trace id. GETs set `cache-control` plus a stale marker following the catalog precedent.

### Configuration

Environment is Zod-validated at boot and fails fast in production when `DATABASE_URL`,
`VALKEY_URL`, `APP_ORIGIN`, `AUTH_CODE_PEPPER`, `RESEND_API_KEY`, `AUTH_EMAIL_FROM`, or required
catalog settings are missing. `.env.example` stays current. Browser API traffic is same-origin;
CORS is disabled and mutations require the exact configured Origin plus valid Fetch Metadata when
present. Secrets never enter logs, responses, or client bundles. General bodies stay tightly
bounded while the Letterboxd multipart route permits a 25 MiB archive under parser-level expanded
size and row limits.

### Sensitive endpoints

Login, register, verify, reset, and import routes get the strictest rate limits and identical responses for existing and non-existing accounts (no enumeration). Pending email codes live in Valkey with short expiry and bounded attempts. Passwords hash with Argon2id via the Bun runtime.

### Background work

The Letterboxd import worker is an active separate entry point and claims durable Postgres jobs
with `FOR UPDATE SKIP LOCKED`, ownership checks, and lease renewal. BullMQ remains deferred until a
different shared queue need such as resolver warming or telemetry ingestion is measured.

### Still enabled

The provider SDK, injectable playback backend, dedicated playback Valkey, and headless media controller are implemented. Provider adapters use an injected, bounded DNS-pinned HTTP client only for resolution; member media bytes never cross the API. Deployment activates the providers listed in `PLAYBACK_MEDIA_CONFIG` with hostile-output validation at the adapter seam.

## Architectural invariants

1. Provider-specific behavior remains inside its adapter.
2. Consumit does not proxy media by default.
3. Cache entries respect source expiry.
4. Concurrent misses are coalesced.
5. Every external request is bounded.
6. Every provider has health scoring, capacity limits, and a circuit breaker.
7. Provider choice uses observed playback quality.
8. Progress survives source changes.
9. Request-serving processes are stateless.
10. Non-blocking work moves to queues.
11. Provider failure is a designed operating state.
12. Operational complexity follows measured demand.
