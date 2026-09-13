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

Identity and the first durable member-data slice are implemented: verified email/password registration requires a chosen Username, opaque sessions live in Valkey, profiles and aliases live in Postgres, Settings performs real account mutations, and protected screens are server-authorized. Letterboxd ZIP/CSV imports are staged, matched through TMDB by a separate worker, reviewed, confirmed idempotently, and surfaced through real Profile, Library, and List screens. Unsupported social evidence renders zero or empty rather than fixtures.

1. Identity: create account, verification, sign in, secure server session, recovery, profile, export, and deletion. **Implemented.**
2. Catalog: title identity, search, movie and series details. **Implemented for the TMDB metadata slice.**
3. Library: native saves and Favorites plus imported watchlist, history, diary, ratings, reviews, and lists. **Durable import/read slice implemented; native authoring (diary/list/review edits, ratings), Top-6 favorites editing, profile/banner/avatar customization, and member-keyed playback progress with resume are implemented.** Playback-driven history and the native player remain.
4. Social: follow, activity, public reviews, and list collaboration. **Not implemented; product screens use honest empty states.**
5. Playback: resolve, session, source selection, reporting, fallback.
6. Personalization: Taste Match, circle signals, ranking, onboarding seeds.

Each slice defines its interface, fixtures/fakes, persistence, errors, telemetry, and acceptance path. Introduce an adapter seam when a real second adapter exists or isolation is required.

Exit criterion: one complete member job works through the interface and its failure states, with appropriate automated checks.

## Stage 6 — playback hardening

Playback is strict browser-direct HTTPS. Every enabled provider in the configured set resolves directly; hostile-output validation still applies at the adapter seam. The API never serves, proxies, leases, rewrites, or transforms media, manifests, keys, audio, or subtitles. Member playback bytes always travel browser-to-provider. Stellar/Aphrodite adapters are ported as browser-direct integrations.

Hardening scope:

- Provider contract and contract tests
- Schema validation and SSRF controls
- Timeouts, concurrency limits, hedged resolution, and circuit breakers
- Cache expiry, negative cache, single-flight, and stale refresh
- Playback sessions, progress, reporting, and source fallback
- Provider dashboard, health probes, and playback telemetry

Exit criterion: the configured test catalog meets the agreed playback success and latency baseline under normal and provider-failure scenarios.

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
