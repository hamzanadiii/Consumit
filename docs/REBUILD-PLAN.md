# Consumit product and architecture rebuild plan

> Active full-product experience redesign, member scope proposal, and ordered UI implementation slices now live in [`REDESIGN-PLAN.md`](./REDESIGN-PLAN.md). That plan supersedes this document's earlier recommendation to keep the existing visual world fixed; playback and platform decisions below remain the technical baseline unless a measured requirement changes them.

This plan turns the rebuild brief into a product direction and an incremental delivery roadmap. The target is a Letterboxd-like movie journal and social discovery experience with first-party playback for movies, TV, and anime. Consumit keeps its own product language and visual identity.

Repository snapshot: 2026-09-27. The current implementation lives in `apps/web`, `apps/api`, `packages/{contracts,provider-sdk,ui}`, `worker/`, and `infra/`.

## Recommendation

Treat this as a product rebuild, not a codebase rewrite. Keep the working catalog, identity, data, provider-adapter, and player foundations; redesign the member experience around a clear film-and-TV journal; then complete the missing social and playback paths in small releases. Replacing the whole stack would delay the product work and discard infrastructure that already matches the goal.

North star: **a member can choose something through trusted taste, press Play once, and keep watching while Consumit quietly recovers from provider failures.**

## Product target

Use Letterboxd as a feature reference for the jobs members expect, while keeping Consumit's brand, interaction design, copy, and implementation original.

- **Catalog:** movies, TV series and episodes, and anime, with the existing TMDB and AniList identity boundaries.
- **Personal journal:** mark a title watched, record dates and rewatches, rate it, write or edit a review, keep a watchlist, and choose profile favorites.
- **Profiles:** show a member's identity, watched diary, reviews, favorites, and public lists, with clear privacy controls and useful activity links.
- **People:** follow members, browse a Circle activity feed, and discover titles through their watches, reviews, and lists. Use familiar following/follower behavior; mutual follows can be shown as friends. Keep private messaging and watch parties out of scope.
- **Lists:** create, edit, order, annotate, publish, and save lists. Preserve authorship and visibility rules.
- **Playback:** the first-party Consumit Player is the only viewing surface. A member sees one Play action and calm recovery language, never provider internals or source errors unless they open an optional diagnostic view.
- **Visual design:** establish an original, recognizable Consumit design system for the social journal and viewing room. Use the current active design as the implementation baseline, and refresh it through deliberate screen references rather than copying Letterboxd screens.

The social loop and the watch loop must feel like one product: `discover → title → play → diary → review/list → profile → friends discover`.

## Direct playback policy

The product requirement is **direct media first, signed proxy only as a fallback**:

1. A configured provider adapter must return a validated direct media URL (HLS, DASH, or a supported file) from an approved media host. Provider iframe/player pages and third-party proxy/relay URLs do not qualify as direct sources.
2. Try eligible direct sources before any proxy delivery. Keep resolution bounded: use saved provider order and measured reliability, stop at the first validated source, and do not contact every provider on every click. Consider hedging only if production-like measurements show the sequential waterfall misses its startup budget and the extra upstream load is acceptable.
3. Use the signed Consumit Worker only when a direct attempt fails for a delivery problem it can fix, such as browser CORS or required safe headers. Never use it to bypass DRM, authentication, a provider restriction, or a source that failed because it is missing, expired, malformed, or incompatible.
4. If proxy fallback cannot start playback, move to the next eligible direct provider and retain position, play intent, audio, and captions. Keep progress keyed to the title or episode, never the source URL.
5. Keep provider, server, retry, and proxy details out of the normal viewer flow. Record structured failure cause, proxy share, startup time, rebuffering, and recovery outcome for operations.

The current `deliveryMode` options include proxy-required and direct-preferred behavior. The first Press Play slice now enforces direct-before-proxy and only permits a reasoned Proxy retry for `direct-preferred` rows. Release acceptance still depends on provider-by-provider source and browser-delivery verification; Admin controls which configured adapters are enabled.

Current local-config implication: enabled rows that omit `proxy` inherit `true` and resolve as `proxy-required`. The latest 2026-09-28 local configuration snapshot has 62 rows and 35 enabled: 11 Direct, 2 direct-preferred, and 22 proxy-required rows. The regenerated source-only audit reflects 62 configured rows, 35 enabled rows, and 49 adapter entries; VixSrc has controlled-fixture evidence, the other 31 enabled adapter identities lack browser-playback evidence, and live resolve latency is unmeasured. Admin's saved enabled state now controls playback eligibility for every configured row. This slice preserves current delivery classifications.

## What exists today (do not re-litigate without measurement)

| Layer | Current (shipped) | Rebuild brief | Decision |
|---|---|---|---|
| Runtime | Bun 1.4 workspaces, Node 24 LTS (`package.json`) | Fastify 5 + Node 24 LTS | **KEEP.** Already matches the brief. No structural change. |
| Web | Next.js 16.3.4 + React 19.2.8 + Tailwind 4.3.3 (`apps/web/package.json`) | Next.js 16.x + React 19.3 + Tailwind v4 | **KEEP.** 19.2.8 → 19.3 is a routine bump, not a rebuild. |
| API | Fastify 5.12.1 on Bun (`apps/api/package.json`) | Fastify 5 | **KEEP.** Already there. |
| DB | Postgres 17 via Prisma, `cuid()` ids (`apps/api/prisma/schema.prisma`, `compose.yaml`) | Postgres 18 + native `uuidv7()` | **DEFER.** PG 18 / uuidv7 is an upgrade task, not a plan prerequisite. No schema rewrite. |
| Cache | Valkey 9.1.1 ×2 (auth `noeviction` + playback LRU) (`compose.yaml`) | Low-cost sessions and playback state | **KEEP.** Do not merge the two Valkeys. |
| Player engines | native + `hls.js` 1.7.2 + `dashjs` 5.2.1 behind `ConsumitPlayer` in `@consumit/ui` | Shaka Player + `player-core` / `player-ui` packages | **DEFER / GATE.** See §3. Shaka is a *future* migration candidate, not step one. |
| Resolver | sequential eligible-provider waterfall, per-provider attempt limits, 20 s total deadline, concurrency/RPM limits, CLOSED→OPEN→HALF_OPEN circuits, playback sessions + fallback (`apps/api/src/playback/resolver.ts`, `state.ts`, `transport.ts`, `telemetry.ts`) | Bounded resolution, reliable start, quiet recovery | **KEEP + EVOLVE.** Preserve the waterfall and session model; enforce global direct-before-proxy behavior in §4. Gate hedging on measured playback latency and provider-load evidence. |
| Provider SDK | `packages/provider-sdk` — 49 adapter identities / 62 configured rows, 35 enabled in the latest local snapshot (`infra/playback/providers.local.json`, `docs/provider-rebuild-audit.json`) | Isolated provider adapters returning playable direct media | **KEEP + AUDIT.** Enable only adapters that return validated direct sources and pass the permission and host review. Adapter count is not a product goal. |
| Proxy | `worker/` Cloudflare Worker: signed grants (`signed-grant-v1`), allowlisted hosts, per-location rate limit, HLS child signing; API never relays bytes (`worker/index.ts`, `wrangler.toml`) | Signed proxy used only when direct delivery cannot play | **KEEP + AUDIT.** Retain as a bounded fallback, never the normal primary path. Verify the delivery and cost constraints in §6. |
| Catalog | TMDB (movies/series) + AniList (anime), injectable adapters, SWR + single-flight (`apps/api/src/catalog/`, `apps/api/src/anime/`) | CDN-cached title pages, static + dynamic split | **KEEP.** Add CDN/cache headers per-page (§2), not a new catalog. |
| Auth | Opaque `HttpOnly` cookie, SHA-256 hash in Valkey, Argon2id, verified email + username (`apps/api/src/identity/`) | (not specified) | **KEEP.** Do not touch. |
| Subtitles | Standalone subsystem: 12 providers, first-party WebVTT, Postgres metadata + per-member sync (`apps/api/src/subtitles/`) | Captions owned by Consumit Player | **KEEP.** Keep subtitle failures independent from video playback. |
| Infra | Docker Compose on Hetzner, Cloudflare edge, OTEL→Prometheus opt-in overlay, `docs/COST-MODEL.md` scenario | Low-cost VPS, edge delivery, no premature cluster | **KEEP.** No Kubernetes or extra services without measured need. |
| Design | Cinema After Midnight + FilScreen shell + `@consumit/ui` registry (`DESIGN.md`, `docs/COMPONENTS.md`) | Distinctive, original social journal and viewing experience | **EVOLVE.** Use the existing design system as the starting point; make the visual rebuild deliberate and specific to Consumit. |

## Keep out of the first rebuild (conflicts with product scope or cost goals)

1. **Realtime rooms / presence / chat / NATS-first gateway.** `docs/PRODUCT.md` excludes
   watch rooms, co-watching, watch parties, DMs, live chat, synchronized viewing.
   Social = async Circle activity, follows, reviews, lists. Do not scaffold NATS,
   WebSocket gateway, or room state. If event volume ever demands it,
   NATS JetStream is a *Stage-7* option per `ARCHITECTURE.md` — not now.
2. **"Rebuild from zero" framing.** Per `docs/DELIVERY.md`, unit of progress is the
   smallest coherent slice. Rewrite violates every exit criterion.
3. **New state/animation/data libs by default.** No Zustand, TanStack Query, Motion,
   Drizzle/Kysely, BullMQ, ClickHouse, search index, S3/R2, Terraform module sprawl
   until a slice proves need. `docs/LIBRARIES.md` defers all of these explicitly.
   Web state today (React + `lib/playback-*` + device-local prefs) is intentional.
4. **Proxy-by-default or open proxy.** Already rejected in code: signed provider-scoped
   grants only, no `?url=` passthrough, API never carries bytes (invariants §2, §9).
5. **Circumvention architecture.** The rebuild brief flags this; repo policy is stricter:
   allowlisted configured providers only, permission basis reviewed before enabling,
   no `*.workers.dev` wildcard, DRM/auth respected (`ARCHITECTURE.md` §Security).
6. **Monorepo reshape now.** `apps/{resolver,realtime,worker,admin}`,
   `packages/{player-core,player-ui,…}`, `services/*`, `providers/` top-level —
   **deferred by rule** ("create only the parts demanded by a slice"). Admin stays
   at `apps/web/src/app/admin` + `apps/api/src/admin`. Worker stays at `worker/`.

## What to CHANGE (deltas from the rebuild brief)

### 1. Stack bumps (routine, not structural)
- React 19.2.8 → 19.3.x when Next 16 toolchain allows; Valkey 9.1.1 → 9.1.x patch line.
- Postgres 17 → 18 + `uuidv7()` only as a deliberate migration slice with rollback plan.
  Until then `cuid()` stays; do not mix id schemes mid-table.

### 2. Frontend: static/dynamic split per page (no framework change)
- A CDN-friendly title page is useful and cheap: keep Next.js App Router, add
  per-section cache policy (poster/backdrop/cast = long CDN; progress/rating/
  watchlist/circle = streamed islands). Measure LCP ≤2.5 s / INP ≤200 ms / CLS ≤0.1
  before and after; internal targets (TTFB <100 ms cached, player UI <50 ms) are
  engineering goals, not launch claims.
- Discovery rails: replace generic "Trending/Popular/Hot" walls with intent rails
  (Continue Watching exists; add "90 min or less", "Because you loved X", "Hidden gems")
  only when Taste Match + circle signals land. Never relabel existing feeds to fake it
  (`PRODUCT.md` §Home).

### 3. Player: finish the canary before even discussing Shaka
- Current gate (`docs/PLAYER-REBUILD.md`, ADR 0001): `NEXT_PUBLIC_PLAYBACK_CORE=next`
  vs `legacy`, cutover needs ≥20% controlled-fixture p95 first-frame gain + no
  reliability regression + macOS/iOS Safari HLS verification. The final-code
  remeasure after the playback-rate change pooled 54 warm samples per core at
  p95 852 ms canary vs 888 ms legacy (4% gain). Its paired batch p95s were
  1,325 / 680 / 877 ms canary and 1,531 / 930 / 811 ms legacy: the result is
  mixed and does not meet the gate. All 114 warm starts reached a frame. Keep
  legacy as default pending a stable-runner comparison. Both optimized cores
  pass 10/10 Chrome playback scenarios, and the focused renewal test passes in
  Windows Chrome and WebKit. macOS/iOS Safari verification remains open.
- The L0–L6 recovery ladder already exists in the browser coordinator
  (`apps/web/src/lib/playback-coordinator.ts`: refresh-before-fallback, 410 handling,
  expiry timers) and API fallback. Preserve position and play intent; retain audio
  and caption preferences across a source change. Quality can be selected again for
  the replacement source.
- Shaka decision: only after canary gates pass AND a slice proves hls.js/dash.js
  cannot meet a named requirement (e.g., licensed DRM/EME, low-latency live).
  Shaka would replace engines *behind* the existing `ConsumitPlayer` seam —
  never leak provider logic into `/watch/page.tsx` (already true: `watch-playback.tsx`
  talks to coordinator + contracts only).

### 4. Resolver 2.0 deltas (evolve `apps/api/src/playback/`, don't rewrite)
- [x] Simplify runtime delivery policy so all ordinary candidates are attempted
  Direct first; proxy is a bounded, signed fallback only after a compatible Direct
  failure. Legacy `proxy-required` rows remain readable for configuration migration,
  but are excluded from normal automatic playback and member source selection.
- [deferred] Split health into per-path scores `{ resolveScore, directScore, proxyScore,
  startupP50, rebufferRate }` segmented by provider × country × kind
  (today: one weighted score — Success 30 / TTFF 20 / latency 15 / buffering 10 /
  fatal 10 / quality 5 / subs 5 / recent 5). Keep existing provider × kind × deployment-region
  aggregates and Direct/Proxy share telemetry. Defer country-level scores and dynamic
  path scores until a useful viewer-location signal and privacy review exist.
- [x] Route by **Direct first, then reliability within the Direct tier**. Only enter
  the Proxy fallback tier after a failure reason that the Worker can fix. The saved
  provider order remains the deterministic operator control within the Direct tier;
  automatic health-based reordering is deferred until representative production data exists.
- [x] Validate candidate shape, HTTPS, approved host, manifest format, expiry, and
  browser delivery type without fetching every segment on the Play hot path. Use
  playback evidence and bounded health probes for deeper reachability checks.
- [x] Keep the current waterfall within per-provider and overall deadlines. Avoid
  contacting every provider on every click; add a bounded hedge only if the
  startup SLO requires it and measured provider load supports it.

### 5. Sessions, telemetry, budgets (extend, don't invent)
- Session retains id/title-episode/provider/start/position/quality/fallbacks/errors —
  already in `state.ts`. The recovery path retains position, play intent, audio, and
  caption preferences; quality is reselected for the replacement source. Confirm
  these behaviors stay consistent in Watch and embeds.
- Emit the 12 lifecycle events (`RESOLVE_STARTED` … `PLAYBACK_ENDED`) with one trace id —
  exists via `telemetry.ts` + OTEL. Keep the admin Operations view focused on provider
  health and playback evidence. The Alertmanager path is configured; actual delivery
  to an operator endpoint still needs a live verification.
- Budgets: cached resolve p95 <100 ms, fresh <1.5 s, startup <1.5 s broadband target,
  fatal <1%, rebuffer <0.5% — all as SLO targets with baselines first
  (`ARCHITECTURE.md` §Telemetry).

### 6. Worker delivery and cost
- The Worker already uses signed provider-scoped grants, streams upstream bodies,
  forwards range requests, signs nested HLS resources, and rejects unapproved
  destinations. Do not add a public arbitrary-URL proxy.
- Proxy reason and Direct/Proxy selection telemetry exist. Keep the Worker fallback
  rate visible and reduce use when a provider's Direct path is healthy.
- Before launch, verify the chosen providers' permission basis and confirm an approved
  Cloudflare video-delivery path. Request charges alone do not establish that relaying
  third-party video is permitted. See [`COST-MODEL.md`](./COST-MODEL.md).

### 7. Data: no new stores
- Postgres stays source of truth for members/catalog refs/library/sessions/config.
  Raw playback events go to analytics store (ClickHouse *later*) via queue
  (BullMQ/NATS *later*) — today: OTEL + bounded Postgres aggregates. Never turn
  primary Postgres into an event landfill.
- Keep auth-Valkey vs playback-Valkey separation. Shared resolver cache only on
  measured multi-instance need.

## Product delivery roadmap

Audit each slice against the current application before rebuilding it; several foundations and screens already exist. The goal is complete member journeys, not replacing files or recreating shipped behavior.

| Order | Member outcome | Ship when |
|---:|---|---|
| 0. Visual direction | The app has a recognizable Consumit look across discovery, title detail, journal, profile, and Watch. | A small set of active screen references defines typography, color, spacing, poster treatment, responsive behavior, and the player room. The design reads as Consumit rather than a Letterboxd skin. |
| 1. Press Play | A member or guest can start a movie or episode, resume it, and recover from a broken source without understanding providers. | Direct-first resolution is enforced across eligible providers; signed Proxy fallback only runs for compatible delivery failures; progress and playback preferences survive renewal and provider changes; no-source state is honest and actionable. |
| 2. Keep a diary | A member can record a watch, date, rewatch, rating, and review, then find it on their profile and diary. | Movie, series, episode, and anime identities remain stable; writes are idempotent; privacy and edit/delete behavior work; records survive source changes and missing catalog metadata. |
| 3. Find your people | A member can find and follow people, see a useful Circle feed, and open the titles, reviews, and lists behind each activity. | The feed is paginated and built from real member events; follow state and visibility rules are consistent across profile and feed; empty and failure states are real. |
| 4. Curate and share | A member can make ordered lists, add notes, control visibility, and save other members' lists. | Create/edit/reorder, ownership, privacy, and shareable list routes work across all catalog kinds. |
| 5. Make taste useful | Search, profile history, friends' activity, and lists help a member decide what to watch. | Each recommendation names its evidence; only implemented member signals appear; feed and public pages stay cache-safe. |
| 6. Release with confidence | Playback stays reliable and affordable as real traffic arrives. | Production-like player measurements, provider review, cost and delivery approval, alerts, backups, restore, and a rollback path are verified. Add capacity only when measurements demand it. |

**Current delivery note (2026-09-28):** Outcomes 1–5 have implementation in the current workspace, including private playback-driven Watch History, a retry-safe member-authored Diary that preserves exact series/anime episode identity when logged from history, Circle activity, native list authoring/saving, and a Home Circle picks rail that groups followed members' public watches/reviews and states that evidence. Anonymous Web Vitals intake and Prometheus histogram queries are implemented locally; representative production traffic is still needed for the p75 baseline. Movie, series, and anime title pages now have verified five-minute on-demand ISR, with member session state kept out of the shared HTML. Taste Match and personalized ranking are deliberately excluded until their signal model is reviewed. Outcome 6 still has production and operator gates recorded in `DELIVERY.md`, `COST-MODEL.md`, and the playback/backup runbooks; these cannot be declared complete from local code alone.

### Low-cost architecture to keep

Keep the modular monolith: Next.js web, Fastify API, PostgreSQL for durable product data, Valkey for short-lived sessions and playback state, and the signed Cloudflare Worker only for eligible Proxy fallback. Keep the current native/HLS/DASH playback engines behind the Consumit Player until measured evidence or a real requirement justifies replacing them. Use CDN caching for public catalog data and static assets; keep member-specific data out of shared caches. Add queues, analytics databases, search infrastructure, and service splits only when observed volume or an operational need requires them.

This favors mature, already-integrated tools over a stack migration. Direct delivery also limits Consumit's video transfer costs; Worker pricing and Cloudflare's video-delivery terms remain launch checks in [`COST-MODEL.md`](./COST-MODEL.md).

## What to REMOVE / not carry forward

- Delete nothing in `apps/`, `packages/`, `worker/`, `infra/` for this plan. The last
  cleanup (pre-FilScreen nav, footer, gallery specimens — `COMPONENTS.md`) is done.
- Remove from consideration (not from disk): Shaka migration, NATS/BullMQ/ClickHouse,
  Zustand/TanStack/Motion, Drizzle/Kysely, `services/*` + `apps/{resolver,realtime}`,
  PG18 rewrite, K8s/service-mesh, S3/R2 pipeline, realtime presence/chat/rooms.
- Sunset path (gated, not now): `legacy` playback core only after canary gates pass;
  `PLAYBACK_EMBED_SESSIONS=0` compat JSON path only after iframe-session rollout
  completes (`DELIVERY.md` §Stage 6).

## Technical work already completed or still open

1. **Delivery-path routing groundwork** — IMPLEMENTED AND COVERED BY AUTOMATED SUITES.
   `deliveryMode` rows, delivery ranking, and proxy-reason logging now enforce
   Direct before Proxy even when saved order changes. `direct-preferred` rows resolve
   directly and may retry through the signed Worker after a classified browser delivery
   failure; proxy-only rows cannot win automatic first play. Provider identities are
   hidden from normal Watch and embed controls.
2. **Recovery ladder formalization** — DONE. L0 engine retry → L1 manifest refresh →
   L2 same-URL reload → L3 same-provider lease renewal → L4 provider fallback (+
   member-initiated server switches outside the budget) → L5 embed-safe recovery
   (same ladder over bearer-token sessions; provider iframes stay excluded) → L6
   honest failure UI. Position/play-intent retention pinned at coordinator,
   controller, caller (Watch/embed resume props), and browser levels; subtitle
   and audio preferences survive switches, quality deliberately re-solves per
   source. Native teardown no longer inserts an empty `load()`, and both
   controllers preserve the chosen playback rate through source renewal. The
   focused production fixture passes on legacy and canary Windows WebKit; see
   `docs/PLAYER-REBUILD.md` for the measured results and remaining Safari gate.
3. **Validation at the seam** — DONE (first slice). The strict HLS tokenizer moved
   from `apps/api/src/playback/hls.ts` to `packages/provider-sdk/src/manifest.ts`
   with `assertHlsManifest` (master/media classification, fail-closed on error
   pages, empty playlists, steering/DEFINE/IMPORT, unquoted/off-allowlist URI
   attrs); the shared `verifiedPlaybackSources` seam and the VixSrc adapter
   validate through it; moved + new contract tests green. Duration-plausibility
   helpers moved along but stay unenforced (the seam lacks expected runtimes).
   DEFERRED with rationale: pre-validated `fallbacks[]` in the session payload
   would require per-resolve provider fan-out, contradicting the deliberate
   no-fan-out waterfall (lazy fallback already meets the success/latency
   targets — revisit with measurements, and it needs an ADR first); segment
   reachability probes on every resolve (fetch cost on the hot path; circuits
   already demote dead providers); per-source codec reporting across 42
   adapters (the client already filters by delivery type + native capability).
4. **Worker audit + caching** — DONE (audit, no code changes needed). Verified by
   test: signed grants, stream-never-buffer passthrough with the 512 MB guard,
   Range → upstream with 206/Content-Range/Content-Length preserved, nested
   playlist/key/segment child-signing with fail-closed destinations and
   redirects, per-IP rate limiting, HEAD framing, upstream error passthrough,
   and SRT/ASS→VTT conversion. Caching tiers confirmed deliberate: playlists
   `no-cache` (live safety), media `public, max-age=86400` (within-session
   seeks), subtitles `public, max-age=3600`. Per-session child tokens make
   cross-viewer edge sharing impossible, so fancier playlist TTLs would buy
   nothing — recorded here instead of built. Video-delivery policy confirmation
   with Cloudflare remains open per `docs/COST-MODEL.md` before relaying
   third-party video at scale.
5. **CDN page split + budgets** — PARTIAL. Alert receiver DONE: Alertmanager joins
   the playback overlay (`infra/observability/alertmanager.yml`, Prometheus
   `alerting` block, compose service + volume, `infra:validate` covers the
   overlay, `docs/runbooks/playback-alerts.md` documents meaning/response/
   receiver connection/delivery verification). Configs verified with real
   binaries (Alertmanager loads, promtool valid, overlay compose renders).
   `bun run infra:validate` also passed both Compose profiles and Terraform
   format, init, and validation through the pinned official
   `hashicorp/terraform:1.8.5` container fallback; no plan or apply was run.
   Delivery verification against a live endpoint stays an operator step per
   the runbook.
   Public TMDB and AniList requests use the bounded five-minute Next Data
   Cache only when a title-detail route explicitly requests public data;
   discovery, search, watch, and other request-bound reads remain `no-store`.
   Movie, series, and anime detail routes now use 300-second on-demand ISR. The
   root layout no longer reads the session cookie; the browser restores `/v1/me`
   after hydration, while member controls, ratings, and review-audience state
   remain on member endpoints. Neutral loading states avoid showing guest
   actions before that lookup settles. An optimized standalone build served all
   three routes with `s-maxage=300`, then returned `x-nextjs-cache: HIT` on the
   second request. Production CDN propagation, freshness behavior under real
   catalog updates, and representative p75/TTFB measurements still need a
   deployed run.
   Browser Web Vitals now flow through anonymous bounded intake into OTEL
   histograms and Prometheus; see [`runbooks/web-vitals.md`](./runbooks/web-vitals.md).
   The production RUM baseline and budget assessment remain deferred until
   deployment receives representative traffic. Playback SLOs also flow
   through OTEL→Prometheus with admin alert state.
6. **Regional scoring + demotion loop** — DONE (automatic leg). Playback failures
   demote by cause: transient stalls cool 60 s, definitive ones (gone-class
   `unsupported`, `forbidden` direct paths that survived via proxy) cool 5 min,
   so traffic shifts to healthy providers without manual intervention
   (`failureCause` in `playback.ts`, tiered `recordFailure` in `resolver.ts`,
   circuit note in `ARCHITECTURE.md`). NOT built: per-viewer-country scoring —
    the deployment knows only its own region, and country signals need edge
   GeoIP with a privacy review first; admin metrics already aggregate per
   provider × kind × region for the human loop. Shaka re-evaluation: NOT
   warranted — recorded as [ADR 0002](./adr/0002-keep-first-party-player-engines.md);
   revisit only when a licensed-DRM, live low-latency, or Chromecast slice lands.

Each phase: name the member job, link the design reference, define interface first,
deterministic fixtures, same-interface tests, a11y + failure states, docs updated only
when the decision changes (`DELIVERY.md` per-slice checklist).

## File map (where each change lands)

- `apps/api/src/playback/resolver.ts`, `state.ts`, `transport.ts`, `configured-providers.ts`,
  `telemetry.ts`, `probe.ts` — delivery modes, path scores, sessions, ladder.
- `infra/playback/providers.local.json` + provider-operations migration — rows, overrides, revision.
- `worker/index.ts`, `wrangler.toml` — audit Range/streaming/playlist/TTL; no new endpoints.
- `apps/web/src/app/watch/*`, `apps/web/src/lib/playback-{browser,coordinator,events,progress}.ts`,
  `packages/ui/src/*player*` — ladder UI ("Switching source…"), retention, budgets.
- `apps/web/src/app/{home,movies,series,anime}/*` — page cache split + intent rails (when signals exist).
- `infra/observability/*`, admin Operations tab — dashboards, alerts, proxy-share rules.
- `docs/{ARCHITECTURE,PRODUCT,DELIVERY}.md`, `CONTEXT.md`, ADR — update only on decision change.
- Do not create: `apps/resolver`, `apps/realtime`, `services/*`, `packages/player-*`,
  `providers/` top-level, NATS/BullMQ/ClickHouse/Terraform scaffolding.
