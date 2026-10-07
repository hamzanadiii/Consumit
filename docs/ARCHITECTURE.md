# Architecture foundation

[ADR 0006](./adr/0006-provider-embed-fallback.md) activates configured provider frames as the final Watch tier after Direct and Relay. SDK and browser contracts distinguish `iframe`/`embed` from media formats and reject delivery mismatches. An independent resolver, cache and circuit scope handles Embed; owned sessions and manual switching retain canonical title/episode identity. No frame enters the native media engine or Worker grant path. Watch and Admin share the bounded sandboxed ProviderFrame surface. Document loading never becomes playback, progress, completion, viewing telemetry or cast evidence. Dual-audio frames expose requested-language guidance inside the external player boundary. Movie/series frames are TMDB keyed and anime frame lookup requires exact AniList identity.

The Watch-page relay HLS engine accepts an internal stable lease getter, separate from the public playback contract. Background same-source renewal updates that getter while retaining the existing engine, controls and buffered movie. The XHR byte loader translates original fragment addresses through the newest bounded, verified VOD playlist graph. Complete non-URI timeline/rendition metadata and cached AES-128 key bytes must agree; incompatible recordings use ordinary recovery. Control reads omit credentials and retain finite size/time/document/reference limits. Capability expiry, provider adapters, progress ownership and the direct-first waterfall remain intact. Native/cast/live delivery retains its prior renewal behavior. [ADR 0005](./adr/0005-direct-first-worker-relay.md) and the [boundary audit](./audits/proxy-gapless-2026-10-03.md) record scope and verification.

Source freshness and relay capability lifetime differ when an adapter cannot determine upstream expiry. Internal `expiryEstimated` metadata preserves the five-minute SDK validation/cache deadline while allowing member relay capabilities up to the existing thirty-minute maximum. Known expiries and unmarked sources remain authoritative; direct playback keeps its prior deadline. The browser sees the capability's actual expiry. This prevents an estimated freshness timer from producing five-minute Worker segment denials. Old grants remain immutable and normal renewal/recovery still applies under ADR 0005.

Storm Boron and WeCollege Miami/Boise have explicit, adapter-owned rotating-host recipes under ADR 0005. Only matching API registration, issuer and Worker opt-ins can lease a verified per-session scope of up to eight exact public hosts. The API validates a finite playlist graph through DNS-pinned public transport; the edge independently checks public DNS for nonstatic destinations. This replaces per-title host additions for those recipes. Every other provider keeps its configured static allowlist. Opted-in HLS playlists are compiled by the signed first-party control route; segments, maps and keys remain Worker traffic. This avoids bulk playlist signing in the Free Worker while adding measured API control-document work. See [the cross-title audit](./audits/relay-cross-title-2026-10-03.md).

Fixed HLS renditions can share an adapter-declared quality group. The resolver publishes only validated, capability-eligible siblings with matching group, format and audio; cached siblings are revalidated against current configuration. Playback exposes height choices rather than sibling URLs. Watch selects a height by re-resolving the same provider in the same session, retaining position and play intent. Failed manual quality changes retain the current stream. Independent fixed playlists are manual choices, not an adaptive master. WeCollege groups renditions by city; LookMovie groups the current movie's resolutions under its one provider row; Citadel groups its 720p and 480p renditions under its one provider row. LookMovie remains movie-only and browser-direct, with configured CDN rules limited to numbered `srv` hosts on its reviewed domains, including `excentionses.cyou` after the 2026-10-04 live check, `cromning.site` after the 2026-10-05 sweep, and `tormisted.cyou` after the 2026-10-05 live view check. The `.cyou` flux rotates domains within days (`tormisted` → `ancender` → `choosed` across 2026-10-05/06, all serving CORS-open manifests), so the numbered-`srv` shape rule `^srv[0-9]+\.[a-z-]+\.cyou$` now covers the family instead of enumerating each rotation; bare domains, subdomain prefixes and suffix escapes still fail closed. Stable `.site` domains stay enumerated. Its catalog search falls back through progressively shorter title prefixes (at most four reads) when full-title search misses, per the PROVE recipe. VidZen resolves direct movie and series sources through its keyless source API, with `vidzen.fun` and `free.finepulfe.xyz` media hosts. Rigel skips slow `/v1/vs/` nested masters per the 2026-10-05 operator request and verifies `/v1/play/` chains in parallel with short per-leg timeouts.

HLS assets can use workerd's native identity/fixed-length piping to avoid per-chunk JavaScript overhead, with a 60-second total asset-transfer deadline and request cancellation. Known lengths are enforced; completion metadata identifies unmeasured native bytes explicitly. Whole native-video sources retain idle-bounded streaming. Verified TS assets restore their checked prefix once, then stream natively. The prior Consumit proxy was also a Cloudflare Worker, so local-versus-edge probes alone do not justify a migration. See [the previous-proxy streaming audit](./audits/previous-proxy-streaming-2026-10-03.md) for the corrected movie 550 repro and remaining limits.

The reviewed WeCollege Worker recipe forwards fixed public movy.sx Referer only from moon.zenoak.top to independently approved ultramoss.top/emberwave.top/rapidmesa.top for the two city relay rows. Origin and arbitrary cross-host hints remain stripped. The movie 550 recheck still exposes Free CPU/runtime limits; prior short samples do not establish reliable delivery.

The movie/TV relay integration uses compact opaque grants to reduce Free Worker CPU during long-playlist rewriting, with compatibility for unexpired object-format grants. Reviewed Storm/Zeta/Vidnest/VaPlayer hosts can supply TS segments with misleading HTML content types only after transport sync verification. TV-only Storm/WeCollege media hosts are explicit in the API and edge policies. Installed-provider Scout previews use saved registrations. See [the relay integration audit](./audits/prove-relay-providers-2026-10-03.md) for the sampled paths and remaining edge failures.

## Status

This document organizes the target direction from the founding architecture brief. The web, API, shared UI, contracts, canonical catalog, identity, member read models, Letterboxd worker, and direct-first playback foundation exist. The active personal product keeps profiles, lists, and reviews private. Social relationship tables are retained for historical data; their routes and product surfaces are retired.

## System shape

Consumit resolves playback, manages sessions, ranks providers, and stores member data. Playback starts with validated browser-direct media; the direct provider waterfall is exhausted before separately declared relay providers with approved Worker hosts are tried, followed by configured provider embeds. The API never relays video bytes. [ADR 0005](./adr/0005-direct-first-worker-relay.md) supersedes the direct-only restriction in ADR 0003; the [trial runbook](./runbooks/worker-relay-trial.md) defines activation and measurement.

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

The web server revalidates public TMDB and AniList metadata GET responses through Next's Data Cache every 300 seconds, including metadata used by request-bound Home and Watch renders. These requests carry only `Accept`, never a member cookie or authorization header; member and playback endpoints remain uncached. This avoids repeated API work without sharing member HTML. Metadata reads have a bounded 12-second web deadline so the API's 10-second AniList request can finish. Public title-page ISR and private request-bound HTML retain their separate policies.

Public GETs under `/v1/titles/` and `/v1/anime/` share a separate 600/minute metadata budget, keyed by session hash when present and client IP otherwise. SSR requests arrive from the web server's shared IP, so metadata fan-out must not consume the general 100/minute member-request bucket. Credential routes retain their tighter limits. Cached catalog results and the adapter's upstream limiter still control upstream work; this read budget is not an upstream quota. Actual API rate-limit responses remain 429 with `RATE_LIMITED` and `Retry-After`.

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

The active anime provider roster is Kyren, AnimeParadise, AnimeKai, AnimeKitsu, and Recloud. Recloud accepts canonical AniList IDs and exact episode numbers directly; the other adapters use canonical identity with a server-owned title resolver. AnimeKai uses the native mfw09 attestation implementation; upstream programs never execute server-side. AnimeKitsu offers direct native media without captions. The anime Watch route shares the first-party player and retains canonical episode identity and SUB/DUB preference.

Recloud's adapter ports the PROVE `providers/anime/recloud.ts` control flow: requested SUB/DUB embed lane, same-origin `/stream/getSources`, then signed HLS on `cdn.4animo.xyz`. It never evaluates page scripts, follows an unapproved media host, or crosses from a missing DUB lane to SUB. Playlist references and a bounded segment prefix are checked without provider playback headers before selection. Captions and intro/outro ranges join the existing player contract. The local row is enabled; the committed example remains disabled for explicit operator activation. Availability varies by episode and upstream health; failed requests retain ordinary direct fallback and canonical member progress.

### SUB/DUB as variants

SUB (original audio with subtitles) and DUB (translated audio) are playback variants of one canonical anime, never separate catalog entries. The resolver selects the best variant based on member audio preferences.

## Identity and import boundaries

The browser authenticates through one same-origin opaque `HttpOnly` session cookie. Only its SHA-256 token hash is stored in Valkey; no authentication token is written to browser storage. PostgreSQL owns durable members, Argon2id credentials, profiles, permanent username aliases, library data, and import records. A verified email is required before the durable account and first session are issued.

The active personal-profile response contract reports `private` visibility. Profile overview and identity profile mappers normalize legacy stored `public` values at the response boundary without rewriting member records. Profile overview and archive routes retain authenticated owner checks; compatibility with older rows does not grant visitor access.

Owner profile responses retain optional `social` follower/following counts for compatibility with deployed web builds from before the personal-profile consolidation. The API derives those counts from stored relations in the existing profile query; the current frontend does not consume them. This response compatibility does not restore social routes or visitor access. Rebuild the web image after shared contract changes: restarting an existing production container retains its compiled validators.

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

CineJoy Lisbon (`cinejoylisbon`) is excluded from the active local and example rosters at the member's request. Its available adapter resolves only the Lisbon and Scout direct chips. The v2 control handshake uses native P-256 ECDH, HKDF-SHA256, and authenticated AES-GCM behind the provider adapter; it never downloads or runs upstream WASM. The DNS-pinned transport preserves binary control envelopes with a 64 KiB request cap and 1 MiB response cap. Before returning a source, the adapter checks the approved root, nested playlist references, and a bounded segment prefix without provider playback headers. Failed or foreign-host chains yield no source. Apogee's scoped adapter resolves exact movies and series episodes; it stays out of the combined Rivestream roster so its configured role controls eligibility. One Both row permits main video and optional separate audio. Added-audio discovery follows at most three master playlist levels, validates every reference before following one variant, and preserves adapter header hints plus the configured application origin for server-side manifest checks. Using the browser origin obtains the same multi-audio representation; the API never forwards a caller-controlled origin to a provider. Declared eligibility does not guarantee a usable track for a title. Movie and series audio retain separately approved CDN hosts. Its availability and seeking remain inconsistent across titles, so browser recovery and fallback still apply. Neither integration relays media or changes member progress ownership.

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

Optional volume boost belongs to the player media-element lifetime. It lazily creates one Web Audio media-element source and GainNode after an explicit adjustment, resumes the context before rerouting audio, and retains the graph across source renewals. Gain ranges from unity (Off) to 3× independently of native volume and mute. The graph closes when the element detaches; effect cleanup with a retained element does not reconnect it. Missing browser support, failed activation, or cross-origin media without CORS leave normal playback intact. No new provider request, media relay, or persistent member setting is introduced. The [Web Audio specification](https://www.w3.org/TR/webaudio/#MediaElementAudioSourceNode) defines native media behavior and CORS requirements for this graph.

HLS uses the stable XHR loader, a 60-second forward-buffer target, the existing byte cap, and adaptive/device quality limits. Progressive FetchLoader decoding was rolled back after cancellation during recovery leaked unhandled AbortError rejections in the deployed browser. Playback does not wait for the reserve to fill. Both player cores watch playing seeks for an eight-second lack of advancement. HLS retries from the element's current seek destination, and Watch records seeking immediately rather than waiting for a decoded frame's time update. A delivery timeout then advances to another direct provider without spending time renewing the struggling CDN's lease. Paused seeks do not trigger automatic recovery; resumed playback cancels the watchdog.

Watch posters use the existing first-party Next image optimizer and cache. The video retains anonymous CORS for direct media and captions; an artwork CDN without media-style CORS headers no longer blocks the poster.

Manual provider selection restarts the fallback order without treating earlier providers as failed. This private session state survives same-provider refresh and is consumed after a successful fallback. The failed selection's upstream group is still excluded, and the existing recovery budgets and cooling windows apply. Automatic ordered resolution continues to exclude earlier misses.

After bounded engine recovery, unusable manifests and browser CORS failures advance through the remaining direct providers before entering the approved Worker relay tier. A newly signed upstream URL is not proof that the same provider's media endpoint works: same-provider renewal must not keep restarting a blocked-manifest loop. Healthy expiry renewal and ordinary segment/network recovery retain their existing renewal path. Anime uses this same recovery policy without changing its canonical episode identity.

Anime audio selection is a constraint on provider resolution rather than a ranking preference. Adapters may declare known audio languages behind the provider seam; unknown declarations still require a matching returned source language. AnimeParadise and AnimeKitsu's current extraction paths declare original audio only (`ja` for the SUB request) and return empty for DUB without upstream work. Kyren and AnimeKai support SUB and English DUB, subject to episode availability. AnimeKai never substitutes the other variant when the requested server is missing. Kyren rejects explicit upstream audio labels that disagree with the requested variant. The resolver and shared access-cache reads require English-labelled anime sources for DUB; original audio is eligible only for SUB. Diagnostic lists use the same adapter capabilities. Refresh, fallback, and manual switches retain the session's requested language and canonical episode identity; unavailable dubs fail honestly. Movie and series audio remain preferences under their existing policy.

Renewal metadata, captions, and signed URLs can change while the attached stream remains healthy. Watch retains the attached local source independently of the session's latest lease: a renewed URL from the same provider, media type, and delivery path waits for recovery instead of clearing buffered frames. If the attached stream fails, Watch uses that latest unexpired URL once at the retained position and play state, then resumes normal recovery if it also fails. A failure during an in-flight renewal attaches its result immediately. Provider, media-type, and delivery-path changes, explicit switches, and cast renewals still attach the replacement immediately. The player also avoids rebuilding its engine for unchanged URLs and types.

Delivery starts with validated browser-direct HTTPS media. Admin saves an exact provider attempt order per title kind; disabled, deleted, incompatible, or cooling providers are skipped. After the bounded direct waterfall is exhausted, an optional Worker carries approved HLS/native traffic in a separate relay waterfall. Relay failures advance through relay candidates without returning automatically to direct. Each delivery tier has independent health/exclusions and a twenty-second discovery deadline. The rolling ten-minute switch budget covers the eligible direct plus relay pool, capped at 128; direct-only configurations retain the three-switch limit. Refresh retains the active delivery path. The API issues encrypted URL-bound capabilities and the edge independently checks exact approved provider hosts, every redirect and every playlist reference. Reusable relay configuration is disabled by default; the local Worker uses Free with thirteen explicitly authorized relay rows (the twelve PROVE rows plus StigStream) and separately reviewed exact media policies (see the trial runbook). Base registrations default deliveryMode to direct, including Vixsrc; only explicit relay rows enter the relay resolver. Direct failures never change a provider's declared tier. Free account-wide daily request and per-invocation CPU limits still apply. DASH and separate audio remain direct, and provider-supplied relay wrappers, credentials, unsupported byte transforms and off-allowlist hosts remain rejected. A fixed BingeBang YMovies manifest decoder is confined to os.bingebangstream.online; native media remains untouched. Zoko has a fixed noncredential header recipe for hls1.drama1.cfd after independent destination approval. Progress, captions and play intent survive delivery changes. See ADR 0005 and its seven-day trial runbook.

Provider operations use a durable Postgres override row per configured adapter, a single revision row polled by each API replica, and an actor/time/before/after audit record in the same transaction as each edit. A database lock serializes the one-time import from the legacy override file. Every configured adapter is registered, including disabled rows, so Admin can enable or disable it without a restart. Deleting a provider writes an audited tombstone: new resolves, order lists, health probes, and tests exclude it; the configured adapter and member progress remain. Restoration keeps the provider disabled until an admin enables it. Region overrides must stay within the base configuration. The admin-only provider endpoint returns live configured, enabled, and deleted counts. Timestamped synthetic probe results and bounded retest claims live in shared playback Valkey; they establish resolution health only. A cycle probes up to four configured regions per provider and title kind; unprobed regions remain unknown. Viewer playback events and provider selection counters export through OpenTelemetry to the opt-in collector and Prometheus, where the admin-only operations endpoints read fixed, bounded aggregates by region. The resolver circuit is shared across regions for each provider and title kind. No media URLs or member tokens enter these metrics. Prometheus rule state appears in admin; an alert receiver remains a deployment requirement for external notifications.

The single exception is first-party caption files: the subtitles module (`apps/api/src/subtitles/`) is a standalone subsystem decoupled from video providers. Its discovery stream emits a cached language snapshot, then independent status and count updates from the thirteen configured providers; a paged language endpoint returns opaque candidate IDs. Raw provider URLs stay in the API store. Preparing a selected candidate validates, downloads, converts, and serves first-party WebVTT from `GET /v1/subtitles/file/:key` (per-member sync shifts via `?offsetMs=`, originals via `GET /v1/subtitles/original/:key`). Cached catalog entries are checked against file storage before display. Converted files live on VPS disk under content-keyed paths when `SUBTITLES_DIR` is set (Valkey/memory otherwise, 7-day TTL); durable track metadata lives in Postgres (`SubtitleTrack`), keyed by title/episode. Preferred languages rank tracks without suppressing other available languages. The Watch subtitle menu groups languages with counts and pages, and local SRT/VTT uploads live only in the current browser viewing session. Admin subtitle diagnostics expose configuration requirements and bounded provider outcomes without URLs or member data. Per-member sync corrections persist in Postgres (`UserSubtitlePreference`).

Subtitle discovery merges provider candidates with saved files using the engine's shared file key. A subtitle adapter may supply a stable file identity for rotating download signatures; the fetch still uses its validated signed URL, and provider-specific normalization stays in that adapter. RiveSubs strips only recognized CloudFront authorization fields, retains content selectors, and deduplicates matching files across its sub-providers. Selection reuses the already-attached track ID for a prepared file. Distinct files and releases remain separate choices, and old discovery snapshots are replaced without removing durable subtitle files.

Subtitle adapters recognize exact native language names before falling back to shared-script heuristics, preventing Ukrainian, Bulgarian and Serbian from being classified as Russian. CastleSubs recognizes both language names and codes in subtitle filenames before trusting conflicting provider fields; opaque filenames never override metadata. The player derives visible native names from canonical language codes and isolates text direction rather than displaying provider translations as language names. Original labels and release details remain available without changing track identity or caption files.

## Data ownership

Admin inspection (`apps/api/src/admin/inspection.ts`) authorizes administrators and guards origin before accepting a strict provider ID, scope, exact title and audio code. Its lazy scout catalog instantiates finite reviewed recipes through `configuredProviders`, with the existing DNS-pinned transport and media validation; it does not enter the live roster. Inspection is limited to six requests per minute, a shared per-provider 20-second cooldown, an exclusive upstream-group claim and a 15-second deadline. Configured-region and video-role gates apply. Disconnects abort adapter work. Only validated upstream media, delivered according to the saved policy, can enter a private, no-store preview; exported reports project metadata explicitly and omit signed sources, source keys and raw errors. Browser checks remain local to Admin and never call progress/history or viewer-telemetry endpoints. Adapter tests leave probe and circuit state untouched. Health and metrics requests coalesce one fixed Prometheus query batch and cache success or unavailability for 15 seconds. Reviewed recipe downloads remain disabled; installing a candidate still requires an operator's base-config review.

Admin's `deliveryMode` override uses the existing Direct/relay contract. The UI labels relay as Proxy. File and Postgres stores preserve valid values, revision propagation and actor/before/after audit; obsolete proxy-required values remain discarded. All delivery resolver instances retain the shared provider registrations and apply dynamic per-tier eligibility before attempts, after resolution and when reading shared caches. Their cache identity includes delivery mode. A mode change therefore cannot reuse a winner from the other tier or require an API restart. Saving a session rechecks the current assignment, and same-provider manual switching compares delivery as well as provider identity. Proxy approval remains an independent Worker configuration boundary. Configured Admin previews issue short private Worker grants for Proxy rows, including isolated tests of disabled rows; missing approval returns `proxy_unavailable` without substituting a direct preview. Scout uses the saved registration for installed rows and the reviewed recipe for uninstalled candidates. Relay previews in either scope require independent Worker approval.

### Postgres

- Members, credentials, and profiles
- Historical follows/circle relationships and saved public-list references, without active social routes
- Private ratings, reviews, favorites, and owned lists; legacy public flags normalize to private at response boundaries without changing stored historical rows
- Member-authored Diary entries, with season and episode stored as zero-valued sentinels for title-level logs and exact identity for episodic logs
- Watch history and progress
- `GET /v1/progress/:kind/:id` without episode coordinates returns the member's newest episode record for a series or anime; coordinates retain an exact Watch lookup. Reads remain authenticated and private with no shared caching. Title actions merge validated member-scoped device progress with account progress by update time; playback sources never participate in the identity or destination.
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

Historical Follow and SavedMemberList rows remain stored without active Circle, follow, review-like, shared-list discovery, or saved-public-list routes. Personal activity is a bounded owner-only read model over diary and review records. Retiring social surfaces does not delete those records.

Profile archives are bounded reads over WatchedTitle, DiaryEntry, Review, TitleLike, MemberList, and tag-array records. `/v1/profiles/:username/archives/:collection` returns typed cursor pages for Activity, Films, Diary, Reviews, Lists, and Likes; Tags is a bounded aggregate over diary/review tag arrays. Every response is `private, no-store`, requires authentication, and is readable only by the owner, including records with legacy public visibility. Network is retired. SavedTitle has no profile-archive collection; owner-only Library endpoints read Watchlist records. Individual title ratings are read through authenticated `GET /v1/me/ratings`, filtered by rating value and paginated with owner-bound cursors; personal profile responses expose aggregate bins.

Diary owner screens enrich each bounded archive page through authenticated, no-store `/v1/me/ratings/lookup`, using at most 50 title references. Visitor routes and pagination skip this read entirely. The enrichment shows current title scores; DiaryEntry remains the date/episode/rewatch/tag record and stores no historical rating snapshot. A failed lookup is distinct from an unrated title and disables rating choices; Reset returns to the unfiltered logs.

Native lists use MemberList and ordered ListItem tables. Creation is idempotent on a member-scoped request key; title order, notes, description, and name update in one database transaction. Active lists are private; legacy public flags normalize at read boundaries. Member list endpoints require owner authorization and are private/no-store. SavedMemberList retains historical references with cascading account/list cleanup; its former public discovery and save routes are unmounted.

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
- Provider configuration defaults to an exact allowlist. The base configuration defines adapters, region and title-kind scope, and permitted media hosts. Only the explicit ADR 0005 adapter recipes may validate and lease bounded exact public destinations for one session. Admin's durable enabled setting controls whether a configured adapter can resolve playback; the resolver also enforces region, kind, and source validation. Never allow a wildcard rooted at a shared-hosting tenant domain such as `*.workers.dev`; list the specific tenant host instead.

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
2. **Validated direct-first media.** Provider output is hostile until validated and must remain inside the configured media-host allowlist or an explicitly enabled, bounded ADR 0005 session host scope. Browser delivery starts direct; Consumit's optional approved Worker fallback is issued after validation. Credential-bearing and provider-supplied relay-wrapped sources remain unavailable.
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

Provider roles are validated configuration and audited Postgres overrides: `video` (the compatibility default), `audio`, or `both`. The resolver excludes audio-only registrations, including cached winners and explicit switches; role changes invalidate access-cache configuration keys. Video order, probes, health, and diagnostic tests use the same eligibility boundary. This adds no media relay or alternate player. Under [ADR 0004](./adr/0004-opt-in-separate-audio.md), an Audio source or Both registration with reviewed adapter-owned separate-audio discovery can supply optional added audio. Assigning a role alone does not create that capability.

Playback preferences are semantic resolution height (nullable for Auto) and canonical audio language, never engine track indices. Watch and public embeds send the latest intent on refresh, fallback, and manual switches; the API retains it in the source-independent session input. Both player cores reselect each source's own quality and audio identifiers. Missing quality retains the preference while choosing a known lower rendition and reporting the selection; unknown resolution stays explicitly unknown. Exact availability is title-specific. Added audio requires an explicit track selection, owned session/source checks and prepared allowlisted VOD media. Audio-only decoding is guarded in the browser; substantial duration mismatches and delivery failures restore primary sound. Smaller duration differences expose a bounded sync adjustment. Clock alignment is measured independently of dialogue/cut identity, which remains unverified. Provider-wide audio verification and health remain unverified/untested in Admin.

1. Provider-specific behavior remains inside its adapter.
2. The API does not relay video bytes; it may compile signed control playlists for explicitly approved ADR 0005 recipes. The browser starts direct and may use an approved Worker fallback.
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
