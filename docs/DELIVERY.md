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
- Watch header, embed frame, source selector, and playback report

Build only sections required by the next screen. Keep sample data at the section seam so visual work does not depend on production systems.

Exit criterion: each section handles its meaningful visual states and can be placed into a screen without duplicating its rules.

## Stage 4 — static screens

Assemble screens with deterministic local fixtures before wiring application logic. A practical order that maximizes reuse is:

1. Sign In and Create Account
2. Home / Discover
3. Title Detail and Series Detail
4. Watch / Embed
5. Help Center and Report Issue
6. Search / Explore
7. Public Profile and Profile Owner View
8. My Library
9. Friends Activity
10. List Detail
11. Settings
12. Three-step onboarding

This order is a proposal. Select the first screen after the technical foundation and first product slice are confirmed.

For each screen, verify the reference viewport, a narrow desktop/tablet width, keyboard navigation, long copy, empty/loading/error states, and responsive intent. Mobile receives a separate composition decision.

Exit criterion: the screen is visually reviewable end to end with local fixtures and no production integration required.

## Stage 5 — product behavior by vertical slice

Add logic in user-valuable slices instead of wiring every backend at once:

1. Identity: create account, sign in, session, profile shell.
2. Catalog: title identity, search, movie and series details.
3. Library: save, favorite, history, progress, resume.
4. Social: follow, activity, profile taste, ratings, reviews, lists.
5. Playback: resolve, session, source selection, reporting, fallback.
6. Personalization: Taste Match, circle signals, ranking, onboarding seeds.

Each slice defines its interface, fixtures/fakes, persistence, errors, telemetry, and acceptance path. Introduce an adapter seam when a real second adapter exists or isolation is required.

Exit criterion: one complete member job works through the interface and its failure states, with appropriate automated checks.

## Stage 6 — playback hardening

After the legal provider set and playback delivery modes are decided:

- Provider contract and contract tests
- Schema validation and SSRF controls
- Timeouts, concurrency limits, hedged resolution, and circuit breakers
- Cache expiry, negative cache, single-flight, and stale refresh
- Playback sessions, progress, reporting, and source fallback
- Provider dashboard, health probes, and playback telemetry

Exit criterion: the authorized test catalog meets the agreed playback success and latency baseline under normal and provider-failure scenarios.

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
