# Architecture foundation

## Status

This document organizes the target direction from the founding architecture brief. The web, API, shared UI, contracts, canonical catalog, identity, member read models, Letterboxd worker, and direct-playback foundation exist. Social relationships remain future work.

## System shape

Consumit resolves playback, manages sessions, ranks providers, and stores member data. The browser fetches validated media directly from configured providers; the API never relays video bytes. See [ADR 0003](./adr/0003-browser-direct-media-only.md).

Public third-party player embeds are deferred. The web `/embed` routes and API `/v1/embed` routes are not mounted; the active playback surface is the member Watch flow.

Public movie, series, and anime title pages are isolated from member identity and use five-minute on-demand ISR over catalog-only data. The root layout does not read cookies; its client session provider restores `/v1/me` after hydration, and member controls/reviews continue to call authenticated, no-store endpoints. On title pages, the stable signed-out prompts render during session bootstrap; they expose no member data or write controls and are replaced by the member shelf after identity resolves. Watch, library, settings, profile, and other personalized routes keep their request-bound server session reads.

The replacement media-element controller is selected per web deployment with `NEXT_PUBLIC_PLAYBACK_CORE=next` (default `legacy`), used by Watch. The player owns HLS/DASH/native engines and controls; the browser coordinator owns refresh, fallback, and manual source switching; the API owns provider eligibility and validated source selection. See [ADR 0001](./adr/0001-canary-player-core.md). Canary routing happens at the edge so one deployment consistently serves one core. Progress and member history stay keyed to the title or episode, never the source.

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

TMDB is the canonical metadata source and identifier namespace for movies, series, seasons, episodes, cast, posters, and backdrops. AniList is the canonical metadata source for anime titles, providing search, details, recommendations, relations, characters, staff, airing schedules, and franchise graphs. Catalog requests use English metadata (`en-US`), the US market, and always exclude adult results.

Next.js page code talks only to the versioned Consumit catalog API. TMDB credentials remain in the Fastify process and never enter Next.js or browser bundles. The catalog module exposes a small injectable interface with fake and TMDB implementations; the TMDB adapter owns authentication, upstream schemas, normalization, image configuration, retry policy, timeouts, and caching.

Catalog metadata and playback availability are independent. A real TMDB title can exist without a configured playback source. In that state, the dedicated first-party player screen identifies the title, loads no demo or embed, disables media controls, and offers return and report actions.

Catalog cache reads use an in-process layer backed by Postgres so validated results survive API restarts and are shared across API instances. Search is fresh for 5 minutes and stale for 1 hour; discovery is fresh for 15 minutes and stale for 24 hours; title details and stable configuration are refreshed every 6–24 hours and retain their last known good value until an upstream refresh succeeds. Anime airing data is fresh for 5 minutes and stale for 1 hour. Finite stale entries are pruned from Postgres; retained title details are not expired.

The web server also revalidates public TMDB and AniList metadata GET responses through Next's Data Cache every 300 seconds. These requests carry only `Accept`, never a member cookie or authorization header; member and playback endpoints remain uncached. This avoids repeated API work without sharing member HTML. Full title-page/CDN caching remains separate because the root layout resolves the member session per request.

## Anime domain

Anime is a first-class bounded domain that plugs into the same playback, library, social, and recommendation systems as movies and series.

The title-kind namespace follows the identifier namespaces: the `CatalogKind` enum (`movie`, `series`, `anime`) is the single kind used by member data — saves, favorites, progress, ratings, reviews, and diary — where `movie`/`series` ids are TMDB ids and `anime` ids are AniList ids, so identical numeric ids in different kinds never collide. The versioned catalog API reflects the split inside its TMDB routes: `GET /v1/titles/batch` serves `anime:` references through the AniList adapter and merges them with TMDB results (upstream AniList output is schema-proven at the seam; an adapter outage surfaces as retryable `CATALOG_UNAVAILABLE`; TMDB metadata carries the response meta when any TMDB reference is present, otherwise the response reports `source: 'anilist'`), and `GET /v1/titles/search?kind=anime` is served the same way instead of being rejected. Title routes stay kind-scoped: `/anime/{id}` and `/anime/{id}/reviews`.

### AniList adapter

The AniList adapter (`apps/api/src/catalog/anilist/`) provides a clean `AnimeCatalog` interface over AniList's GraphQL API. It handles rate limiting (90 req/min), persistent stale-while-revalidate caching of validated catalog results, query normalization, and hostile-output validation. Title details and franchise relations keep their last known good value across outages; search, discovery, and airing data use shorter freshness windows. Adult titles are excluded upstream (`isAdult: false` on search, trending, and seasonal feeds) and filtered again at the adapter seam across lists, relations, recommendations, and batch; a direct adult detail request resolves as not found. AniList tells Consumit what an anime is; Consumit owns identity, episode mapping, playback, progress, provider reliability, subtitles, and taste.

### Episode identity engine

Anime hero-logo enrichment remains separate from episode mapping. Exact TMDB title/year matches are preferred. Missing series logos may resolve an exact parent name after removing season/arc suffixes, requiring one unambiguous TMDB series, Animation metadata, Japanese origin, and a debut no later than the selected title. Same-name adaptations additionally require an airing season within one year of the selected arc, and unresolved ties remain misses. A bounded, cycle-checked walk of at most four canonical AniList prequels can supply earlier artwork. Movies do not inherit a series logo. Parent-artwork matches have a separate cache key and never broaden episode-art identity matching. Franchise queries select complete summary fields on both root and related nodes; manga source nodes are excluded rather than routed as anime.

The episode identity engine (`apps/api/src/anime/episodes/`) maps canonical anime episodes (as defined by AniList) to provider-specific episode numbers. This handles discrepancies in season numbering, split cours, absolute numbering, specials, OVA numbering, and dub numbering. Each mapping carries a confidence score and verification timestamp.

Episode-card metadata first uses the existing ani.zip transport with an exact AniList ID and canonical episode key. Validated English/romanized titles, summaries, air dates, and HTTPS TVDB/TMDB stills are cached as one bounded title record with single-flight reads and persisted stale fallback. Different anime IDs, mismatched episode numbers, specials, unsafe artwork URLs, and malformed dates are rejected. Strict TMDB title/year and MAL-keyed Kitsu reads fill missing fields or recover from an unavailable mapping; a failed fallback cannot discard known metadata. This enrichment changes neither playback mapping nor member progress identity.

### Franchise graph

The franchise graph (`apps/api/src/anime/franchise/`) builds directed graphs from AniList relation edges (PREQUEL, SEQUEL, SIDE_STORY, SPIN_OFF, ADAPTATION, SOURCE). It supports watch order recommendations, related-title discovery, and franchise browsing.

### Provider episode mapping

Provider-specific episode mappings are stored per anime title per provider per audio language. Once a mapping is verified, it is not re-discovered on every watch. This reduces upstream load and improves reliability.

### Anime providers

The active anime provider roster is Kyren, AnimeParadise, AnimeKai, and AnimeKitsu. They resolve episodes by canonical AniList identity and a server-owned title resolver, with exact episode matching. AnimeKai uses the native mfw09 attestation implementation; upstream programs never execute server-side. AnimeKitsu offers direct native media without captions. The anime Watch route shares the first-party player and retains canonical episode identity and SUB/DUB preference.

### SUB/DUB as variants

SUB (original audio with subtitles) and DUB (translated audio) are playback variants of one canonical anime, never separate catalog entries. The resolver selects the best variant based on member audio preferences.

## Identity and import boundaries

The browser authenticates through one same-origin opaque `HttpOnly` session cookie. Only its SHA-256 token hash is stored in Valkey; no authentication token is written to browser storage. PostgreSQL owns durable members, Argon2id credentials, profiles, permanent username aliases, library data, and import records. A verified email is required before the durable account and first session are issued.

Letterboxd upload handling is one deep module: ZIP/CSV parsing, resource limits, normalization, provenance, TMDB matching, review state, idempotent confirmation, and imported-data deletion stay behind the importer interface. Uploaded archive bytes are discarded after normalized staging. The worker claims PostgreSQL jobs with `FOR UPDATE SKIP LOCKED`; TMDB remains the title metadata authority and Letterboxd URLs are provenance keys only.

## Canonical provider contract

Every provider adapter exposes the same conceptual input and result.

### Input

- Title kind: movie, series episode, or anime episode.
- Stable catalog identifier (TMDB for movies/series, AniList for anime).
- Title and release year as fallback identification.
- Season and episode for series; canonical episode number for anime.
- Context required for region, language, and safe provider selection.

### Result

- Provider identity.
- Zero or more validated sources.
- Subtitle tracks when available.
- Expiration time for temporary access.
- Resolution latency and structured failure information.

A source describes its direct delivery type, URL, quality, and language. External output is untrusted and schema-validated at the adapter seam.

### Alias rows

One adapter may serve several menu rows: a config entry id must equal its adapter or extend it with a `-suffix` (`wecollege-phoenix` scopes that city, `cinehd-hindi` filters that audio). Aliases carry independent regions, health, and fallback groups; the suffix selects the scope. Source languages use codes (`en`, `hi`) so resolve-time audio matching prefers the requested language, and the watch flow forwards the member's stored audio preference (explicit per-title choices win).

## Resolve lifecycle

```text
Authenticate and rate-limit
  -> Normalize title identity
  -> Check process-memory cache
  -> Check shared cache
  -> Return a known valid source when available
  -> Select provider candidates
  -> Run the bounded eligible-provider waterfall
  -> Validate results
  -> Rank valid candidates
  -> Cache discovery separately from expiring access
  -> Create a playback session
  -> Return the selected source and fallback capability
```

### Bounded resolution

The media transport coalesces concurrent DNS lookups, caches only validated public addresses for 60 seconds with a 128-host cap, and pins the selected address to each socket. Aborted callers stop waiting immediately; the OS lookup may finish independently. DNS waiting is bounded at three seconds and the provider attempt deadline still caps total work.

The resolver tries eligible providers in configured order and stops at the first validated source. Each attempt is bounded by its provider-specific budget (3 seconds by default, up to 15 seconds when explicitly configured); the total resolution deadline defaults to 20 seconds. Per-provider concurrency and request limits still cap overlapping work across different members.

Do not contact every provider on every click. A bounded hedge is a future option only if production-like measurements show the waterfall misses the startup budget and the additional upstream requests fit provider and cost limits. A slow or overloaded provider cannot hold the whole request open.

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

Repeated failures open the circuit and stop normal traffic. After a cooling period—60 seconds for transient stalls, five minutes for definitive ones (gone-class sources, blocked direct paths)—a small number of probes determines whether normal traffic resumes.

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

The Consumit Player owns the playback controls and native media surface. A playback controller loads configured HLS, DASH, or direct media sources through adapters while keeping source resolution, failover, and progress outside the visual component. Provider iframe adapters are excluded. Public third-party player embeds are deferred; the web `/embed` routes and API `/v1/embed` routes are not mounted. First-party member playback continues through Watch.

Renewal metadata, captions, and signed URLs can change while the attached stream remains healthy. Watch retains the attached local source independently of the session's latest lease: a renewed URL from the same provider, media type, and delivery path waits for recovery instead of clearing buffered frames. If the attached stream fails, Watch uses that latest unexpired URL once at the retained position and play state, then resumes normal recovery if it also fails. A failure during an in-flight renewal attaches its result immediately. Provider, media-type, and delivery-path changes, explicit switches, and cast renewals still attach the replacement immediately. The player also avoids rebuilding its engine for unchanged URLs and types.

Delivery uses validated browser-direct HTTPS media. Admin saves an exact provider attempt order per title kind; disabled, deleted, incompatible, or cooling providers are skipped. Refresh renews the selected provider; fallback advances to another eligible direct provider while retaining position, captions, and playback intent. Header-blocked media skips pointless same-provider renewal in the browser coordinator. Recognizable relay-wrapped URLs, credentials, expired access, unsupported byte transforms, and off-allowlist hosts are rejected. Consumit has no media Worker or signed relay grants.

Provider operations use a durable Postgres override row per configured adapter, a single revision row polled by each API replica, and an actor/time/before/after audit record in the same transaction as each edit. A database lock serializes the one-time import from the legacy override file. Every configured adapter is registered, including disabled rows, so Admin can enable or disable it without a restart. Deleting a provider writes an audited tombstone: new resolves, order lists, health probes, and tests exclude it; the configured adapter and member progress remain. Restoration keeps the provider disabled until an admin enables it. Region overrides must stay within the base configuration. The admin-only provider endpoint returns live configured, enabled, and deleted counts. Timestamped synthetic probe results and bounded retest claims live in shared playback Valkey; they establish resolution health only. A cycle probes up to four configured regions per provider and title kind; unprobed regions remain unknown. Viewer playback events and provider selection counters export through OpenTelemetry to the opt-in collector and Prometheus, where the admin-only operations endpoints read fixed, bounded aggregates by region. The resolver circuit is shared across regions for each provider and title kind. No media URLs or member tokens enter these metrics. Prometheus rule state appears in admin; an alert receiver remains a deployment requirement for external notifications.

The single exception is first-party caption files: the subtitles module (`apps/api/src/subtitles/`) is a standalone subsystem decoupled from video providers. Its discovery stream emits a cached language snapshot, then independent status and count updates from the thirteen configured providers; a paged language endpoint returns opaque candidate IDs. Raw provider URLs stay in the API store. Preparing a selected candidate validates, downloads, converts, and serves first-party WebVTT from `GET /v1/subtitles/file/:key` (per-member sync shifts via `?offsetMs=`, originals via `GET /v1/subtitles/original/:key`). Cached catalog entries are checked against file storage before display. Converted files live on VPS disk under content-keyed paths when `SUBTITLES_DIR` is set (Valkey/memory otherwise, 7-day TTL); durable track metadata lives in Postgres (`SubtitleTrack`), keyed by title/episode. Preferred languages rank tracks without suppressing other available languages. The Watch subtitle menu groups languages with counts and pages, and local SRT/VTT uploads live only in the current browser viewing session. Admin subtitle diagnostics expose configuration requirements and bounded provider outcomes without URLs or member data. Per-member sync corrections persist in Postgres (`UserSubtitlePreference`).

Subtitle discovery merges provider candidates with saved files using the engine's shared file key. A subtitle adapter may supply a stable file identity for rotating download signatures; the fetch still uses its validated signed URL, and provider-specific normalization stays in that adapter. RiveSubs strips only recognized CloudFront authorization fields, retains content selectors, and deduplicates matching files across its sub-providers. Selection reuses the already-attached track ID for a prepared file. Distinct files and releases remain separate choices, and old discovery snapshots are replaced without removing durable subtitle files.

## Data ownership

### Postgres

- Members, credentials, and profiles
- Follows/circle relationships
- Ratings, reviews, favorites, owned lists, and saved public-list references
- Member-authored Diary entries, with season and episode stored as zero-valued sentinels for title-level logs and exact identity for episodic logs
- Watch history and progress
- Private completion events use a per-attempt UUID unique to member and exact title/episode. The progress write and completion insert share a transaction; the event retains no provider or media URL. History reads are member-scoped and paged, exports include it, and account tombstoning deletes it with progress.
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

Circle activity is a read model over the existing Follow, DiaryEntry, Review, and MemberList tables. Each page reads a bounded recent slice from followed active public profiles, merges those rows by timestamp, and returns a stable cursor. Public lists are required even when their author is public; private profiles are excluded from search and activity. This avoids a second event store while volume is small. Member diary/review create times and list update times have matching member/time indexes.

Profile archives are bounded reads over the existing WatchedTitle, DiaryEntry, Review, TitleLike, MemberList, Follow, and tag-array records. `/v1/profiles/:username/archives/:collection` returns typed cursor pages for Activity, Films, Diary, Reviews, Lists, Likes, and Network; Tags is a bounded aggregate over diary/review tag arrays. Every response is `private, no-store`. Archive authorization follows the profile visibility rule: public profiles are readable, and a member can read their own private profile. Network results include public active profiles only. SavedTitle has no profile-archive collection; its owner-only Library endpoints remain the only reads for Watchlist records. Individual title ratings are read only through authenticated `GET /v1/me/ratings`, filtered by rating value and paginated with owner-bound cursors; public profile responses continue to expose aggregate bins only.

Diary owner screens enrich each bounded archive page through authenticated, no-store `/v1/me/ratings/lookup`, using at most 50 title references. Visitor routes and pagination skip this read entirely. The enrichment shows current title scores; DiaryEntry remains the date/episode/rewatch/tag record and stores no historical rating snapshot. A failed lookup is distinct from an unrated title and disables rating choices; Reset returns to the unfiltered logs.

Native lists use the existing MemberList and ordered ListItem tables. Creation is idempotent on a member-scoped request key; title order, notes, description, name, and visibility update in one database transaction. SavedMemberList stores a member's reference to another owner's public list, with cascading cleanup when either account/list is removed. Discovery is a bounded query over followed active public profiles, and saved-list reads recheck current list/profile visibility. Member list endpoints are private/no-store so viewer-specific ownership and saved state cannot enter shared caches.

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

Collect only the member data required for product and operations. Browser Web Vitals use a separate anonymous, bounded intake: fixed route groups and CLS/FCP/INP/LCP/TTFB values only, with no raw URL, referrer, member identifier, or database persistence. Browser requests omit credentials; OpenTelemetry exports aggregated histograms when the opt-in collector is configured. Carry one trace identifier from web to API, resolver, adapter, validator, and playback telemetry.

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
- Provider configuration is an allowlist, not a discovery mechanism. The base configuration defines adapters, region and title-kind scope, and exact permitted media hosts. Admin's durable enabled setting controls whether a configured adapter can resolve playback; the resolver also enforces region, kind, and source validation. Never allow a wildcard rooted at a shared-hosting tenant domain such as `*.workers.dev`; list the specific tenant host instead.

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
- Resolver discipline for playback: tiered candidates, bounded sequential waterfall, dedupe, observed-quality ranking, health quarantine (Stage 6).
- Subtitle enrichment is implemented: the subtitles module aggregates YIFY, TVSubtitles, CastleSubs, NxshaSubs, SubSource, VDRK, VDRK v2, RiveSubs, Natsuki, SubDL, Jimaku, OpenSubtitles, and AnimeTosho behind its adapter seam (keyed providers skip without credentials), converts archives (including XZ-compressed singles) to cached first-party VTT with originals kept, and merges direct upstream WebVTT untouched. Canonical anime episodes resolve to TMDB identity through the keyless ani.zip bridge, so the TMDB-keyed providers answer anime queries alongside the AniList-keyed AnimeTosho and Jimaku. A 9s overall budget returns partial rank-ordered results instead of failing cold searches; converted files are cache-checked before any refetch. Durable metadata (`SubtitleTrack`) and per-member sync corrections (`UserSubtitlePreference`) live in Postgres; files live on VPS disk when configured. Playback sessions additionally carry each streaming adapter's own direct WebVTT tracks.
- Non-blocking work in queues with separate worker entry points; request-serving processes stay stateless.

### Deliberately different this time

1. **Cookie sessions, never localStorage JWT.** Sessions are opaque identifiers in `HttpOnly`, `Secure`, `SameSite=Lax` cookies backed by Valkey, with rotation on privilege change and origin checks on cookie-authenticated mutations. Browser storage never holds authentication authority.
2. **Validated browser-direct media.** Provider output is hostile until validated. Every source must be playable directly by the browser and remain inside the configured media-host allowlist. Credential-bearing and relay-wrapped sources are unavailable.
3. **No rooms, DMs, watch parties, donations, checkout, or ad-serving module in the active release scope.** Do not scaffold these without a new product decision. The watch-and-journal loop comes first, and playback remains member-controlled.
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
2. The API does not relay media; the browser fetches validated sources directly from configured providers.
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
