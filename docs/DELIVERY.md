# Delivery strategy

## Working method

Consumit is built in small, reviewable increments: foundations, primitives, component details, composed sections, static screens, then behavior and platform logic. Each increment leaves a visible and verifiable result without prematurely creating the full target workspace.

The unit of progress is the **smallest coherent slice**, not the smallest possible file. A slice includes the states and accessibility needed to judge it in context.

## Stage 0 — foundation

Completed for the initial workspace.

- Agree on product language and scope.
- Index active design references and deprecated concepts.
- Select Bun workspaces, Next.js web, Bun/Fastify API, and the shared UI boundary.
- Pin supported runtime and toolchain lines.
- Keep data stores, integrations, and speculative packages out until a slice demands them.

Exit criterion: the workspace installs, lints, type-checks, tests, and builds from one root command.

## Stage 1 — visual foundations

Current stage, paired with the first Stage 2 primitive.

Implement only the foundations exercised by the first slice:

- Color, type, spacing, radius, border, and motion tokens
- Page canvas and content container
- Focus, hover, disabled, loading, empty, and error conventions
- Icons and image treatment
- Responsive breakpoints derived from an actual composition

Exit criterion: tokens and base styles reproduce the selected reference's visual grammar without screen-specific values leaking into primitives.

## Stage 2 — primitives and small modules

Suggested first groups:

1. Text, icon, button, link, input, label, badge, divider, avatar, and progress primitives.
2. Poster/image frame, rating display, Taste Match signal, friend presence, and source-health indicator.
3. Form field, segmented control, filter chip, navigation item, tab, and compact action group.

For every module, define only the variants present in an active screen. Include keyboard behavior, focus visibility, text overflow, missing art, loading, disabled, and error states where relevant.

Exit criterion: modules can be reviewed in isolation and are already demanded by a named composed section.

## Stage 3 — composed sections

Compose primitives into deep, reusable product modules:

- Global navigation
- Content and continue cards
- Editorial feature
- Activity item/feed card
- Profile masthead
- Title masthead
- Episode row
- Search result and filter rail
- List row and curator panel
- Authentication form
- Watch header, Consumit Player, source selector, and playback report

Build only sections required by the next screen. Keep sample data at the section seam so visual work does not depend on production systems.

Exit criterion: each section handles its meaningful visual states and can be placed into a screen without duplicating its rules.

## Stage 4 — static screens

Assemble screens with deterministic local fixtures before wiring application logic. A practical order that maximizes reuse is:

1. Sign In and Create Account
2. Home / Discover
3. Title Detail and Series Detail
4. Watch
5. Help Center and Report Issue
6. Search / Explore
7. Public Profile and Profile Owner View
8. My Library
9. Friends Activity
10. List Detail
11. Settings
12. Three-step onboarding

This order is a proposal. Select the first screen after the technical foundation and first product slice are confirmed.

For each screen, verify the reference viewport, a narrow desktop/tablet width, keyboard navigation, long copy, empty/loading/error states, and responsive intent. Mobile receives a separate composition decision. Each screen also ships its SEO contract: route metadata (title, description, canonical), Open Graph/Twitter cards, and noindex where member-specific. Title and Series detail pages are landing surfaces with TMDB-driven metadata, JSON-LD, and crawlable overviews; sitemap and robots land once public routes stabilize.

Exit criterion: the screen is visually reviewable end to end with local fixtures and no production integration required.

## Stage 5 — product behavior by vertical slice

Add logic in user-valuable slices instead of wiring every backend at once:

The canonical catalog slice is implemented: real TMDB discovery, search, movie and series detail, seasons and episodes, normalized artwork, numeric routes, and explicit unavailable playback. Computed Taste Match, overlap, member scores, and numeric ratings stay hidden until their backing behavior is implemented. Every Watch action opens the dedicated first-party player route. The slice uses an injectable Fastify adapter, shared contracts, bounded upstream work, and deterministic network-independent tests.

Identity and the first durable member-data slice are implemented: verified email/password registration requires a chosen Username, opaque sessions live in Valkey, profiles and aliases live in Postgres, Settings performs real account mutations, and protected screens are server-authorized. Letterboxd ZIP/CSV imports are staged, matched through TMDB by a separate worker, reviewed, confirmed idempotently, and surfaced through real Profile, Library, and List screens. Unsupported social evidence renders zero or empty rather than fixtures. Member records cover the anime kind alongside TMDB movie/series ids — an additive `CatalogKind` migration stores AniList ids as `anime`, and progress, ratings, watched, favorites, diary, and title-review reads are proven across kinds whose numeric ids collide.

1. Identity: create account, verification, sign in, secure server session, recovery, profile, export, and deletion. **Implemented.**
2. Catalog: title identity, search, movie and series details. **Implemented for the TMDB metadata slice; `batch` and `search` now serve anime references through the AniList adapter inside the same versioned routes, and anime detail pages recommend titles from AniList instead of listing external site links.**
3. Library: native saves and Favorites plus imported watchlist, history, diary, ratings, reviews, and lists. **Durable import/read slice implemented; native diary creation, exact episodic diary identity, edit/delete, retry-safe writes, list/review edits, ratings, Top-4 favorites editing, profile/banner/avatar customization, and member-keyed playback progress with resume are implemented.** Playback completion creates a private, idempotent, exact-title-or-episode Watch History event in the same database transaction as progress. A member can deliberately copy a completed episode into Diary; Profile and Circle preserve and link its episode identity. Library pages Watch History separately from member-authored Diary, and account export includes both. Apply the diary, native/saved-list, watch-history, and diary-episode migrations before deploying the corresponding API.
4. Social: follow, activity, public reviews, and shared lists. **Member search, follow/unfollow, live follower counts, and a cursor-paginated Circle feed of public diary entries, reviews, and lists are implemented. Title pages show paged recent/popular/circle reviews from public profiles with author ratings and member review likes, plus a dedicated per-title reviews archive for movies, series, and anime. Members can create lists idempotently, edit title order and notes atomically, set visibility, delete owned lists, discover public lists from followed public profiles, and save/unsave another member's public list.**
5. Playback: resolve, session, source selection, reporting, fallback.
6. Personalization: **the Home Circle picks rail groups recent public watches/reviews by title and explains the followed-member evidence without a fabricated score.** Computed Taste Match, personalized ranking, and onboarding seeds remain unimplemented pending a reviewed signal model.

Each slice defines its interface, fixtures/fakes, persistence, errors, telemetry, and acceptance path. Introduce an adapter seam when a real second adapter exists or isolation is required.

Exit criterion: one complete member job works through the interface and its failure states, with appropriate automated checks.

Catalog-backed server pages use the versioned 24-reference batch contract through a shared deduplicating loader. A render enriches at most 120 unique title references and uses bounded parallel batches; large libraries and lists keep every member record and title route while rendering stable ID fallbacks for references outside that enrichment window. This prevents an imported history from turning one page request into unbounded catalog fan-out.

Public server-side TMDB and AniList metadata fetches use a five-minute Next Data Cache revalidation, matching the public catalog cache horizon while carrying no member credentials. Member HTML remains request-specific because the root layout reads the session; full route/CDN page caching is still deferred until that personalized shell is separated.

## Stage 6 — playback hardening

Playback accepts only validated browser-direct HTTPS media. Admin saves one exact order per title kind; automatic recovery advances through eligible direct providers within bounded deadlines. The API never relays video and member progress survives source changes. Public third-party embeds remain deferred.

The player-core rebuild is separately canaried with `NEXT_PUBLIC_PLAYBACK_CORE=next` on an edge-routed web deployment; `legacy` is the rollback value. Watch uses the same core in each deployment. Controlled browser tests must pass on the new path before canary traffic. Compare p95 first-frame time, playback-start success, buffering, fatal errors, and recovery success against the legacy deployment; the cutover requires at least 20% better controlled-fixture p95 first-frame time and no reliability regression. Keep the legacy build available until production comparison and Safari HLS verification are complete.

The provider operations slice stores overrides, revisions, and actor changes in Postgres. Apply the provider-operations migration before starting upgraded API replicas; the first replica imports the legacy override file under a database lock, then every replica polls the revision and applies effective settings. The opt-in playback Compose overlay starts an OpenTelemetry collector and Prometheus. Its alert rules and admin Operations tab show provider-failure conditions; connect an alert receiver and verify delivery before claiming unattended paging. Probe success means resolution succeeded, while viewer events establish playback health.

Hardening scope:

- Provider contract and contract tests
- Schema validation and SSRF controls
- Timeouts, concurrency limits, bounded provider waterfall, and circuit breakers
- Cache expiry, negative cache, single-flight, and stale refresh
- Playback sessions, progress, reporting, and source fallback
- Provider dashboard, health probes, and playback telemetry

Exit criterion: the configured test catalog meets the agreed playback success and latency baseline under normal and provider-failure scenarios.

### Stage 6 release closeout (2026-09-27)

Local checks pass: on 2026-09-28, `bun run check` completed workspace lint, typecheck, all 877 tests across 133 files, and optimized API/web builds. `bun run infra:validate` also passes both Compose configurations plus Terraform format, init, and validation with the pinned official `hashicorp/terraform:1.8.5` container fallback. The active Help Center and Report Issue routes use the reduced dual-theme shell, factual answers and recovery links, and a privacy-bounded report form. The user-provided public support inbox is configured in the local web and Compose environments; production must set the same `SUPPORT_EMAIL` value.

Validation follow-up (2026-09-28): a web jsdom screen test exceeded Vitest's five-second default under load. The web timeout is now 10 seconds; the web package rerun passed 255/255 tests, and the complete root `bun run check` then passed.

Watch History follow-up (2026-09-28): the completion-to-history slice passed contract, API, UI, and Watch checks. An isolated PostgreSQL 17 database was snapshotted before all 21 migrations and then passed 21 member-data/identity integration tests, including completion retries, rewatches, owner isolation, export, and tombstone deletion. Current package suites pass 883 tests across 133 files; workspace lint/typecheck stages and optimized API/web builds pass. The aggregate `bun run check` was interrupted by two stale playback fixture expectations, now corrected, and one load-sensitive five-second UI timeout; the affected case and full UI package passed on an isolated rerun.

Episodic Diary follow-up (2026-09-28): exact series/anime episode identity now flows from deliberate Watch History logging through the Diary API, Postgres, account export, public Profile, and Circle. The full root `bun run check` passed lint, typecheck, all 886 tests across 134 files, and optimized API/web builds. A disposable PostgreSQL 17 database was snapshotted to `consumit-diary-episode-pre-migration-20260928.dump` before applying all 22 migrations; 23 member-data and identity integration tests passed against it. No existing database was migrated. The additive `20260928030000_diary_episode_identity` migration still requires a named production snapshot before rollout.

The 2026-09-28 source audit and activation experiments are superseded by the current Admin activation controls and [2026-10-01 browser-direct audit](./audits/provider-direct-playback-2026-10-01.md). Current configured/enabled totals come from durable operator overrides; live browser evidence determines the retained roster.

Admin provider control supersedes the permission-review activation gate (2026-09-30): all configured rows, including disabled rows, enter the registry so Admin can enable or disable them. The loader no longer requires a `permissionReview` record; `/v1/admin/providers` reports live configured and enabled totals after durable overrides. Admin changes hot-apply across API replicas through the existing revision poll. The base configuration still supplies adapter identities, region/title-kind scope, and media-host allowlists; the resolver continues to validate sources and enforce delivery limits.

Web Vitals follow-up (2026-09-28): a small Next.js client component now reports CLS/FCP/INP/LCP/TTFB using the first-party `useReportWebVitals` hook. The browser sends only metric/value and one fixed page group, with credentials omitted; the strict API contract rejects extra fields and records bounded OpenTelemetry histograms without database storage. Prometheus p75 queries and bucket units are documented in `runbooks/web-vitals.md`. The complete root `bun run check` passed workspace lint, typecheck, all 908 tests across 139 files, and optimized API/web builds. Production p75 baselines remain open until representative deployed traffic arrives.

Public title ISR follow-up (2026-09-28): movie, series, and anime detail routes now render catalog-only HTML with a 300-second on-demand route cache. The root layout no longer reads member cookies; the client restores `/v1/me`, while title actions and reviews remain authenticated client reads. Search, discovery, and Watch catalog requests retain request-bound `no-store` behavior. The standalone production build returned `s-maxage=300` and `x-nextjs-cache: HIT` on the second request for each detail route. Web lint/typecheck passed and the six touched session/title-control test files passed 36/36. Production CDN propagation, catalog-change freshness, and deployed TTFB remain open for operator verification.

Player renewal follow-up (2026-09-28): Windows WebKit trace evidence showed source replacement resetting playback speed on both cores; the short fixture could then reach its end before a renewal assertion. The player now sends selected-speed changes directly to both controllers, which restore it at metadata, canplay, play completion, and delayed WebKit seek checks. Controller regression tests pass 24/24, full optimized Chrome playback suites pass 10/10 per core, and the focused repeated-lease/caption/paused-position scenario passes on both cores in Windows Chrome and WebKit. A final-code alternating Chrome benchmark produced 54 warm samples per core: p95 was 852 ms canary vs 888 ms legacy (4% faster), with all 114 warm starts reaching a frame. Paired p95s varied (1,325 / 680 / 877 ms canary; 1,531 / 930 / 811 ms legacy), so the 20% cutover gate is not met. Repeat on a stable runner; actual macOS/iOS Safari HLS remains unverified.

Library pagination follow-up (2026-09-28): replaced silent collection caps with bounded 30-row snapshots and stable owner-scoped keyset pages for saved titles, diary entries, owned lists, and saved lists. Per-title saved/watched state now uses the title-state read; save/watch mutations return 204 instead of re-sending the library. Library and Lists expose load-more/retry states, and saved-title search states that it covers currently loaded records. The last full `bun run check` passed lint, typecheck, 893 tests across 136 files, and optimized API/web builds. After that aggregate run, API route tests passed 22/22, the Library screen test file passed 8/8, and API typecheck passed. The API integration suite passed 36 tests across 7 files on isolated PostgreSQL 17 and Valkey containers; all 23 migrations, including `20260928040000_library_pagination_indexes`, applied after the named temporary dump `consumit-library-pagination-cursor-pre-migration-20260928.dump`. Existing databases were not touched. The index migration remains open for production rollout until operators take a named snapshot of the production database.

Personal-archive consolidation (2026-09-30): the standalone `/watchlist` and `/library` screens are retired. Saved titles stay in the owner-only profile Watchlist archive; completed Watch History now has an owner-only profile section with pagination, Watch again, and deliberate Log to diary. The sidebar and title activity links lead to profile sections. Old URLs redirect authenticated members to the corresponding profile sections, preserving bookmarks. Lists management remains at `/lists`; data endpoints and member records remain intact.

| Gate | State | Evidence needed to close |
|---|---|---|
| Player-core performance | **Open** | Both optimized cores pass the same 10/10 Chrome scenarios and the focused renewal scenario in Windows Chrome and WebKit. The latest pooled current-branch comparison before removing the redundant Watch session request used 54 warm samples per core: p95 854 ms canary vs 995 ms legacy (14% faster), p50 510 vs 559 ms. Batch p95s were 818 / 796 / 1,745 ms canary and 1,278 / 773 / 746 ms legacy; tails moved between pre-loadstart and media startup. A post-removal one-batch comparison is recorded in `PLAYER-REBUILD.md`; its tail and fixture telemetry resets make it inconclusive. The 20% cutover gate remains open. Remeasure alternating batches on a quiet runner and verify macOS/iOS Safari HLS before canary rollout. |
| Provider readiness | **Locally checked, production open** | The 2026-10-01 live browser audit covered all 62 configured rows on two sample sets and focused rechecks. Nine direct rows remain; each produced a Chrome first frame on a tested title. Lookmovie and CastleTV CDN allowlists were repaired. Catalog completeness, long-session reliability, region differences, and Safari remain unverified. See `audits/provider-direct-playback-2026-10-01.md`. |
| Direct media delivery | **Implemented locally** | Media is fetched by the browser. The relay service, grant protocol, delivery controls, settings, and relay-only alerts are retired under ADR 0003. Provider reliability and VPS sizing still need production measurements. |
| Alert delivery | **Open** | Configure a real receiver and verify a test alert reaches the operator; configured rules without a receiver do not provide paging. |
| Database migrations | **Open before rollout** | Take the named pre-migration snapshot, then apply `20260924010000_provider_operations`, `20260927010000_diary_idempotency`, `20260927020000_circle_activity_indexes`, `20260927030000_native_and_saved_lists`, `20260928010000_catalog_cache`, `20260928020000_watch_history`, `20260928030000_diary_episode_identity`, and `20260928040000_library_pagination_indexes` before upgraded API replicas. |
| Backups and restore | **Synthetic encrypted drill passed; production gate open** | A synthetic custom-format dump was sent to a loopback SFTP Restic repository, checked with 100% data reads, restored into a second disposable PostgreSQL 17 instance, and verified with migration status (23/23 up to date), one linked Member/Credential/Profile row, and a secret-free member export. The drill fixed fractional-second freshness parsing and host scoping, and exposed/fixed retention grouping by random temp path; backups now group by host/tag and default to 14 daily, 4 weekly, and 6 monthly snapshots. Repeating three same-day runs proved the intermediate snapshot is pruned. The running local sidecar reports successful local-volume dumps, which are not offsite or encrypted. Still verify a real Storage Box snapshot restore, seven-day provider PITR, separate-failure-domain retention, and production recovery duration before accepting members; measured local restore times are recorded in `postgres-recovery.md` and are not production RTO. |
| Infrastructure validation | **Closed locally** | `bun run infra:validate` passed both Compose profiles and `terraform fmt -check`, `terraform init -backend=false`, and `terraform validate` through the official `hashicorp/terraform:1.8.5` container fallback. No plan or apply was run. |
| Core Web Vitals baseline | **Instrumentation configured; baseline open** | Collect representative production traffic and inspect p75 LCP, INP, and CLS by bounded page group using [`web-vitals.md`](./runbooks/web-vitals.md). |
| Public title HTML cache | **Verified locally; deployed edge behavior open** | The optimized build and standalone server verify five-minute cache headers and repeat-request hits for movie, series, and anime title routes. Confirm the deployed CDN preserves this policy and measure representative title-page TTFB/LCP; member-specific endpoints must remain no-store. |
| Member support destination | **Configured locally** | `SUPPORT_EMAIL` is set to the user-provided public inbox in local web/Compose environments and tracked examples. Verify the deployed environment carries the same value; reports only open a member-reviewed email draft. |
| Canary and rollback | **Ready to exercise** | Keep the `legacy` player build and iframe JSON compatibility path available. Canary the session/core flags only after local test suites and the player gates pass; compare the documented startup/recovery metrics before widening. |

These are the remaining release criteria; they require controlled browser runs, deployment access, provider/Cloudflare review, or operator-owned recovery systems and cannot be inferred from a successful local build.

Full workspace verification follow-up (2026-09-28): after the session bootstrap, Watch session seed, duplicate Watch root-session-request suppression, and title-cache boundary changes, `bun run check` passed workspace lint, typecheck, all 912 tests across 140 files, and optimized API and web builds. Next classified the three title detail routes as generated SSG routes with on-demand params; standalone requests returned five-minute shared-cache headers and cache hits. The custom build directory was isolated, and the existing `.next-build-probe` reference in `apps/web/next-env.d.ts` was restored after the build.

Post-session playback measurement follow-up (2026-09-28): both optimized cores completed one 18-sample Watch batch after the root session-request suppression; every warm start decoded a frame. Legacy p50/p95 was 375 / 791 ms and canary was 483 / 2,154 ms. The canary tail was 2,060 ms before media `loadstart`, and fixture telemetry requests logged `ECONNRESET`. The benchmark harness now handles the canary's auto-started playback without waiting for a Play button that has become Pause. This single sequential pair is too noisy to change the player gate; repeat alternating batches on a quiet runner.

Historical redesign pass (2026-09-29): a Film Society Programme variant was applied across Home and member-facing routes, and local checks were recorded as passing. The user later confirmed the existing Cinema After Midnight screen as the visual authority; this pass is superseded. Active design rules live in `DESIGN.md`, and the Home, shell, shared palette, and visible title/profile actions are aligned to that dark/orange system. Production gates below remain open: local checks do not verify provider permissions, deployed delivery policy, real alerts, production migrations, offsite restore, Safari HLS, or production Core Web Vitals.

Provider control and playback reliability follow-up (2026-09-30): Admin can search and filter providers, edit bounded region/request limits, delete a configured provider from new playback attempts, and restore it disabled. The deletion is an audited Postgres tombstone, applied across replicas by the existing revision poll; it keeps adapter configuration and member history intact. Resolver cache keys include effective region and delivery configuration, requested audio wins over original-language fallback, repeated provider-local timeouts open its circuit, and fallback exclusions expire after their window. The first-party player reports a startup stall when metadata or first playback never arrives. Search no longer presents mood or surprise actions without backing behavior. `bun run check` passed workspace lint/typecheck, all 912 tests, and optimized API/web builds. The controlled Chrome Watch fixture suite passed all nine active scenarios, including real HLS decode, fallback, recovery, subtitle selection, and source renewal; its benchmark and visual capture cases remained explicitly skipped. Retired public-embed assertions were removed from that suite because the embed route tree intentionally returns 404. The production performance, provider-readiness, and Safari gates remain open.

Anime renewal interruption follow-up (2026-09-30): the shared player rebuilt its media engine whenever a source object changed, including a healthy renewal that only extended expiry for the same URL. Providers without an explicit upstream expiry use a conservative five-minute refresh deadline, so that metadata refresh could repeatedly interrupt an episode. Attachment now compares URL and media type and preserves the current engine while healthy; failed-engine retries and actual source changes still reload. The regression failed before the fix and passes afterward. The focused player/controller suite passed 69 tests, UI lint/typecheck passed, and the three attachment cases passed on the canary core too. Four targeted Chrome scenarios passed: unchanged-URL renewal with zero media reloads and continued playback, changed-URL renewal, paused recovery, and real HLS decode.

Rotating-URL renewal follow-up (2026-09-30): live Tatami Galaxy episode 1 on Kyren reproduced a second media load during healthy renewal because each resolve minted a different HLS URL. The same-URL guard did not cover this case. Watch now retains its attached local stream separately from the latest session lease and only consumes a renewed URL when the stream fails; provider/type/delivery changes and casting still switch immediately. A failure during renewal is retained and uses the returned lease. The Watch regression and controlled Chrome renewal scenario failed before the change and pass afterward; the browser scenario covers repeated rotating leases without reloads, captions, paused position, and using the latest URL after a real media error. Validation passed 35 Watch/coordinator tests, four targeted Chrome scenarios, lint, typecheck, and the optimized web build. On the rebuilt local app, the real Kyren episode completed two accelerated renewals with different URLs, one initial media load, zero reloads, continuous playback, and one document navigation; this is a short live-provider check, not a full-episode soak test.

Subtitle duplication follow-up (2026-09-30): Tatami Galaxy episode 1 reproduced eight Arabic rows: a saved VdrkV2 file plus its raw candidate, three RiveSubs signed copies, and three Urdu copies mislabeled as Arabic. Discovery now merges saved/raw file identities, RiveSubs deduplicates rotating signatures while retaining distinct content selectors, native Urdu/French/Bengali labels resolve correctly, and Watch selection reuses an attached file's existing track ID. All three regressions failed before their fixes. The live API now returns two Arabic choices, one each from VdrkV2 and RiveSubs; 106 subtitle tests and 27 Watch tests pass. API/web lint and type checks and the optimized web build pass. Chrome checked the real subtitle discovery against controlled local media on the rebuilt app: selecting the saved Arabic track, reopening the menu, and reloading the same browser retained two Arabic choices, one attached file, one checked option, and zero browser downloads.

Visual consistency follow-up (2026-10-01): the member job is scanning titles and collections comfortably across discovery and personal archives. The active Cinema After Midnight identity remains the authority, with the supplied Letterboxd screenshot informing compact overlapping collection covers. A shared PosterStack replaces the profile Watchlist's three isolated posters and both list collage implementations, showing up to five real records without fabricated totals. Shared artwork edges, stationary poster imagery, ruled headings, readable metadata, compact navigation, complete mobile catalog tabs, flatter archive/list/settings compositions, and dark profile-masthead controls in light mode finish the cross-screen system. Deterministic Profile, catalog-card, Lists, and settings compositions were checked at 1440px and 390px; Profile and settings were also checked in light mode. The bounded confirmation round found no horizontal overflow or missing fixture images, with all five preview links independently focusable. The temporary visual route and capture script were removed before the production build.

Desktop is the priority for this visual pass, per the member's follow-up. Validation passed 135 shared UI tests and 73 relevant web-screen tests, UI/web lint and type checks, and the optimized web build. A final source check also preserved artwork click-through on curated-list previews by keeping their decorative cover layer out of pointer hit testing.

Profile collection consolidation (2026-10-01): the member job is finding and curating personal collections from the profile sections in the supplied desktop screenshot. Every archive now uses a compact shared identity header and one section title, without repeating overview statistics above the collection. Watchlist, Films, and Likes have denser captioned poster grids; Watchlist also has horizontal Shelf rows and a catalog-artwork retry. Known saved records avoid per-card title-state requests, and successful removal updates the visible card and count while failed writes retain the record. Lists management now lives in the owner's profile Lists tab, with overlapping collection artwork, combined name/privacy filters, sorting, creation, saved public lists, and Circle discovery. Visitors retain the public-only archive. Legacy Watchlist, Library, and Lists landing compositions and sidebar shortcuts are retired; their URLs redirect to the owner's matching profile sections. Individual list detail/edit routes stay available.

Deterministic desktop compositions were checked at 1440px and 1920px, including Watchlist, Shelf, missing artwork, empty collections, Lists creation, Films, Reviews, History, and light-mode Lists. The bounded confirmation found no horizontal overflow, missing fixture images, duplicate main headings, or browser page errors, and keyboard Shelf selection and type filtering passed. The temporary route and capture script were removed before the production build. Validation passed 83 relevant web tests across 15 files, web lint, and web type checking, including legacy redirects, visitor privacy, failed artwork retry, successful/failed removal, and combined list search/privacy filtering.

The optimized web build passed and the local web container was recreated. API and web report healthy; the live web serves the updated list-search, artwork-retry, and saved-change code, and the temporary preview route returns 404.

Collection filtering refinement (2026-10-01): the member job is narrowing Films and Watchlist without letting controls compete with the artwork. The supplied compact Letterboxd toolbar informs density, while Cinema After Midnight remains the visual authority. Inline search, text menu triggers, orange selected values, a single Reset action, and quieter title-type and view controls replace the boxed filter row. Decades derive from real release years; unknown years remain in the unfiltered collection. Genre, decade, search, and sorting operate on loaded records, with honest result counts and load-more guidance. Personal rating controls remain owner-only, and unavailable options stay disabled. The shared Select adds a toolbar variant while preserving the field variant and keyboard, dismissal, and focus behavior.

Deterministic desktop states were inspected at 1280px, 1440px, and 1920px, including open menus, long selected genres, combined filters, empty results, unavailable ratings, and light mode. Default toolbars measured 50px high; long active selections wrap to a second row at 1280px without overflow. The bounded confirmation found no horizontal overflow, clipped menus, missing fixture images, or browser page errors, and keyboard view selection and Reset restored the expected collection. Validation passed 135 shared UI tests and 32 relevant web tests across eight files, UI/web lint and type checks, and the source whitespace check. The temporary route and capture script were removed before the optimized production build.

The optimized web build passed and the local web container was recreated. API and web report healthy; the rebuilt assets contain the decade menus, inline title search, compact toolbar, and Reset action. The gateway serves About successfully, and the temporary filter preview route returns 404.

Watchlist card alignment (2026-10-01): the member asked for the Home card treatment in Watchlist. Its poster view now uses the shared `TitleCard` without an extra footer or rating override, so title, year/type, catalog rating, and the saved-title action reveal over the artwork on hover or keyboard focus. Shelf keeps visible metadata and private personal ratings. Filtering, saved-record destinations, successful removal, retry states, and pagination remain intact. Deterministic dark and light desktop states were inspected at 1440px and 1920px, including hover, keyboard focus, long titles, and missing artwork; cards matched their artwork height without outside captions or horizontal overflow. Browser removal and Shelf switching passed without page errors. All nine Watchlist and Save action tests, web lint, web type checking, and the source whitespace check passed. Temporary visual files were removed before the production build.

The Watchlist card production build passed and the web container was recreated. API and web report healthy, the gateway serves About successfully, and the temporary card preview route is absent from the production manifest and returns 404.

Diary journal refinement (2026-10-01): the member job is revisiting and curating dated watches comfortably on desktop. The supplied Diary reference informs aligned columns and grouped months; Cinema After Midnight remains the visual authority. The dedicated Diary collection now pairs month/year headings and watch-day numerals with portrait covers, Charter titles, exact episode links, tags, release years, rewatch markers, and compact owner edit/delete controls. Its quiet menus combine title search, watched year, release decade, genre, watch type, and private current-title ratings. Watch-date sorting orders month groups; title sorting alphabetizes within each month. Failed rating reads are distinct from unrated titles, and visitor routes and pagination never fetch or render private ratings. Successful edit/delete callbacks update the visible journal before the existing server refresh; failed writes retain the log and open recovery panel.

Deterministic desktop states were inspected at 1280px, 1440px, and 1920px, covering month/year boundaries, long titles, repeated dates, missing artwork, owner/visitor views, empty journals, combined filters, no results, rating failure, edit errors, delete confirmation, and light mode. One refinement batch improved star readability, visitor empty copy, and save/delete contrast. The bounded confirmation found no horizontal overflow, clipped menus, or browser page errors. All 33 relevant web tests across four files passed, including exact episode destinations, month changes after edits, confirmed deletion, failed-write recovery, focus restoration, server-side owner gating, and pagination that keeps repeated watches separate. Temporary visual files were removed before the production build.

Films card alignment (2026-10-01): the member asked for cards only in Films. Its shared Home title cards now omit the external title/year/rating footer; hover and keyboard focus retain details and the owner's optional private score. Likes keeps its existing captions. A deterministic desktop inspection at 1440px confirmed eight cards equal their artwork height, details reveal on hover and focus, missing artwork remains usable, and no horizontal overflow or browser page errors occur. The 20 Diary and profile-route tests passed after this change. Temporary preview files were removed before the production build.

The combined Diary and Films optimized web build passed, along with web lint, type checking, and the source whitespace check. The local web container was recreated; API and web report healthy, the gateway serves About successfully, and the built assets include the new Diary. Both temporary preview routes are absent from the production manifest and return 404.

Films rating removal (2026-10-01): at the member's request, Films cards now explicitly suppress the rating and star while retaining title and year/type on hover or focus. Owner rating filters keep their behavior. A deterministic owner card with a selected 9/10 filter was inspected at 1440px and retained its metadata without a rating or star. All nine profile-route tests, web lint, type checking, and the optimized web build passed. The temporary preview route was removed before the build and returns 404. The web container was recreated; API and web report healthy and the gateway serves About successfully.

Anime continuation and rating filters (2026-10-01): the member job is continuing an anime across seasons and connected films, keeping official logo art where it exists, and narrowing personal archives by rating. The two supplied anime URLs reproduced missing logos; the relation endpoints also failed with invalid metadata. The AniList relation query now selects complete summary fields for root and related nodes, excludes manga source nodes, and versions its raw-query cache. Hero-logo enrichment follows bounded canonical prequels and supports an exact, unambiguous Japanese animated parent-series match for season/arc names. Parent-artwork matches use a separate cache and never broaden episode identity. The origin guard handles both `JP` and `Japan`; unavailable artwork still uses the existing text fallback.

Anime details now place one Related anime section after Episodes with deduplicated canonical links and previous/next season, film, and relationship labels. The Staff section and tab are removed. Films, Watchlist, and Diary replace numeric rating menus with a shared five-star picker: half-star clicks, pointer-drag ranges, Any rating, No rating, keyboard-accessible bounds, Apply, cancellation, and disabled lookup-failure states. Films range URLs filter loaded watched records with private enrichment and honest counts; exact-score archives keep their existing pagination. Films cards continue to suppress ratings.

All 41 relevant web tests and 28 anime/API tests passed across ten files, covering inclusive ranges, invalid/visitor range URLs, focus recovery, combined filtering, duplicate related links, Staff removal, logo inheritance, cyclic relations, movie separation, strict episode matching, and same-name adaptations distinguished by airing season. Web/API lint and type checking passed. Deterministic desktop states were inspected at 1280px, 1440px, and 1920px, covering related-title and failed-relation states, pointer and keyboard selection, unrated/Any recovery, unavailable ratings, and dark/light popovers. One refinement batch made exact ratings fill to their value while ranges highlight a band; the bounded confirmation passed. Temporary preview files were removed before final builds.

The API source image and optimized web image built successfully and both containers were recreated and report healthy. Gateway pages for anime 210482 and 213805 returned 200 with logo artwork, canonical related-title links, and no Staff section. About returned 200. The temporary review route is absent from the production manifest and returns 404.

Anime episode metadata recovery (2026-10-01): Tokyo Revengers Season 2 (AniList 142853) reproduced missing episode titles and stills through the live episode endpoint. AniList catalogs the season separately; TMDB retains the parent name and combines the current run in one season, while Kitsu was unavailable. Episode cards now use exact AniList-keyed ani.zip records before the existing metadata fallbacks. One validated mapping fetch serves the visible batch; last-known metadata survives upstream failure. The regression route first returned 404 and now passes, with coverage for separate-season numbering, identity mismatch, missing episodes, malformed output, unsafe artwork, partial fields, and outage recovery.

All 38 relevant API tests passed across the episode adapter, routes, TMDB artwork, logo inheritance, and Kitsu files. API lint, type checking, and the production bundle passed. The live API was restarted and both API/web report healthy. At 1440px, the running anime page displayed all 13 real episode titles and stills across two pages; visible images loaded and no page errors occurred. No web rebuild was needed because the existing cards consume the enriched episode API.

Direct provider cleanup (2026-10-01): the member job is reliable playback through browser-direct sources and a provider dashboard without media-relay controls. All 62 configured rows were audited with 261 bounded checks. Nine rows remain in the local roster and example; 53 unavailable, invalid, relay-wrapped, failing, or inconsistent rows are removed. Lookmovie and CastleTV received narrow CDN allowlist repairs. DNS wait cancellation, coalescing, and bounded public-address reuse reduce wasted adapter work; relay-shaped sources and obsolete stored sessions fail closed. The media Worker, signed grants, relay routes, delivery settings, metrics, environment fields, and package workspace are removed under [ADR 0003](./adr/0003-browser-direct-media-only.md). Admin deletion, restoration, limits, saved order, and durable audit history remain.

Workspace lint and type checks, 967 full-suite tests, three additional stored-session regression cases, four desktop Chrome playback scenarios, and optimized API/web builds passed. Deterministic provider UI checks covered normal, empty, delete-cancellation, and failed-refresh states at 1440px. The running gateway decoded direct first frames for movie 550 and the member's anime 7785 episode 1; operator enable/disable overrides remain in effect. Detailed outcomes and startup-only limits are in the [provider audit](./audits/provider-direct-playback-2026-10-01.md). Full-episode soak, regional coverage, and Safari verification remain open.

The final optimized web image and development API source image built successfully and both services were recreated and report healthy. An isolated image check confirmed the retired media Worker directory is absent from the API image; Docker contexts also exclude local override settings. API health and the gateway's About page returned 200. The deployed anime provider list contains only direct rows.

## Stage 7 — operational growth

Add queues, worker separation, analytics storage, multiple instances, canaries, orchestration, and regions only against observed traffic or an explicit reliability requirement. The stages in [ARCHITECTURE.md](./ARCHITECTURE.md) are the trigger guide.

## Per-slice checklist

- Name the member job and canonical domain terms.
- Link the active design reference and list required states.
- Define the module interface before its implementation details.
- Use deterministic fixtures until integration is the purpose of the slice.
- Test through the same interface used by callers.
- Verify accessibility, responsiveness, and failure behavior in proportion to risk.
- Update product, domain, or architecture docs only when the underlying decision changes.
- Finish one coherent slice before expanding the next.
