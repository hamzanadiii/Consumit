# Architecture foundation

## Status

This document organizes the target direction from the founding architecture brief. The web, API, and shared-UI workspace shells now exist; the product, data, playback, and operations systems described here do not. Resolve the relevant items in [OPEN-QUESTIONS.md](./OPEN-QUESTIONS.md) before implementing those areas.

## System shape

Consumit resolves playback, manages sessions, ranks providers, and stores member data. It avoids proxying media bytes unless there is a deliberate, authorized reason to do so.

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

The longer-term direction remains:

- Postgres, initially a managed option such as Neon
- Valkey for shared cache, coordination, rate limits, sessions, and initial queues
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

## Canonical provider contract

Every provider adapter exposes the same conceptual input and result.

### Input

- Title kind: movie or series episode; anime classification remains an open catalog decision.
- Stable catalog identifiers when available, such as TMDB, IMDb, or AniList.
- Title and release year as fallback identification.
- Season and episode for episodic playback.
- Context required for region, language, and safe provider selection.

### Result

- Provider identity.
- Zero or more validated sources.
- Subtitle tracks when available.
- Expiration time for temporary access.
- Resolution latency and structured failure information.

A source describes its delivery type, URL or embed reference, quality, and language. External output is untrusted and schema-validated at the adapter seam.

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

Do not race every provider on every miss. Start the best candidate, then begin backups only if the request remains unresolved. The founding example uses roughly 0 ms, 120 ms, 300 ms, and 700 ms start offsets; production values come from telemetry.

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
| Valkey | Main shared resolver cache | 5–30 minutes when the source permits |
| Negative cache | Known provider/title misses | 30 seconds–5 minutes |

Provider discovery and temporary playback access are separate cache records. Expiring access uses its provider expiry minus a 30–120 second safety margin.

Use single-flight/request coalescing so one resolver refresh serves concurrent misses for the same title. Serve slightly stale safe results within a stale-while-revalidate window while a worker refreshes them. Warm popular titles and episodes in the background.

## Background work

Keep non-user-blocking work out of HTTP requests. An initial Valkey-backed queue can run:

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

The founding brief describes a generalized playback controller with HLS, DASH, native video, and iframe adapters. The active design package currently commits to a Watch / Embed shell with provider-owned controls. This conflict is intentionally unresolved in [OPEN-QUESTIONS.md](./OPEN-QUESTIONS.md).

## Data ownership

### Postgres

- Members, credentials, and profiles
- Follows/circle relationships
- Ratings, reviews, favorites, lists, and list collaboration
- Watch history and progress
- Stable catalog references
- Playback-session history when durable retention is needed
- Provider configuration and aggregates

### Valkey

- Resolution and negative caches
- Distributed locks and single-flight coordination
- Short-lived playback sessions
- Rate limits
- Provider health and hot scores
- Queues

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
GET  /v1/titles/:id
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
- Direct playback or embeds must be authorized; system quality does not remove copyright, contract, or regional obligations.

## Deployment progression

### Stage 1: simple production

Cloudflare fronts a small deployment running the web app, API, resolver workers, and telemetry worker; managed Postgres and Valkey provide shared state; Docker provides repeatable operation. Named vendors are candidates, not mandatory commitments.

### Stage 2: measured horizontal growth

Add multiple stateless API instances, dedicated worker pools, managed/shared cache, Postgres pooling, a load balancer, CI/CD, and an analytics store when traffic justifies them.

### Stage 3: orchestration

Adopt container orchestration, autoscaling, regional resolver pools, read replicas, distributed tracing, and centralized logs only after operational demand appears.

### Stage 4: multi-region

Add global traffic steering, regional caches, disaster recovery, and automated failover only when user geography and availability goals justify the complexity.

Important state never lives only in an API process. Scale API servers, resolver workers, telemetry consumers, and metadata workers horizontally. Autoscaling considers queue depth, active requests, latency, memory, and event-loop lag in addition to CPU.

## Verification and operations

Every provider adapter needs contract tests and fixtures for movies, episodes, special-character titles, missing titles, timeouts, and malformed output. Synthetic checks regularly exercise authorized known titles before members discover an outage.

Load tests cover cache hits and misses, provider outage, cache outage, database latency, worker crashes, slow DNS, and hot-title stampedes. Canary changes through small traffic percentages and roll back on degraded playback measures.

The intended delivery pipeline is lint, typecheck, unit tests, provider contract tests, integration tests, build, staging, smoke test, and production canary. Feature flags isolate risky provider, resolver, scoring, and failover changes.

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
