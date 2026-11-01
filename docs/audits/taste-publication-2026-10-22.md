# Taste publication acceptance — 2026-10-22

Workspace implementation of the approved personal-publication direction. This is
local acceptance, not a production release or production database migration.

## Delivered member jobs

- Express taste through a selected cover, statement, four Favorites, featured work
  and reordered profile sections, with a visitor preview and concise navigation.
- Author chaptered collections with notes, genre tags, presets, invited editors,
  private drafts, revision-safe saves, duplication, bookmarks and watched markers.
- Rate, write a review and log a watch deliberately, with spoiler disclosure,
  durable episode-specific drafts and atomic retry-safe publication.
- Publish a monthly edition with three explained picks, retaining a separate draft
  and published snapshot; compare exact shared taste without invented scores.
- Export public-safe square/story artwork and explore authored Community work.
- Discuss reviews/lists, manage update subscriptions and reply muting independently,
  block/report members and inspect/audit moderation decisions.

## Verification evidence

The isolated PostgreSQL acceptance suite passes seven transaction tests covering
concurrent retries, review edits without extra watches, stale revisions, exact title
kind and episode identity, private drafts, edition snapshots, live privacy, spoiler
sharing, preserved duplicate-list presentation, collaboration permissions, reply
depth, notifications/muting, blocking, removal and publishing restriction/restoration.

Four HTTP tests cover authentication, no-store private responses, cross-site write
rejection and admin moderation access. Twenty-four affected legacy API route tests
pass. The contract tests cover publication completeness and episode identity.
Focused web tests cover composer intents and recovery, persisted subscriptions,
sharing, archive navigation and existing profile controls. The five browser flows
pass: customization/visitor projection, collection-draft reopening and save,
square/story image download, spoiler discussion and restored subscriptions, and
phone navigation/overflow.

API and web type checks and the optimized web build pass. Changed UI lint and API
lint pass. Migration deployment succeeded against isolated test databases. Prisma's
schema comparison reports no new Taste or collection-genre drift; it still lists
pre-existing release/experience foreign-key and archive/search-index differences,
which this slice does not repair.

Reproduction: `tests/taste/README.md` and `bun run test:taste`. Fixture titles use
the supplied local geometric artwork and fake identity with real PostgreSQL member
repositories. Production screens resolve real catalog artwork and member records.
Captures and transient logs are in ignored `local/taste/`.

## Design finish record

The incumbent midnight canvas, warm ivory Charter display, sans-serif controls,
orange actions, shared FilScreen shell and FavoritesShelf remain the authority.
The responsive publication pairs cover and identity on desktop and stacks them on
phone. Reordered authored sections follow; chaptered reading remains flat and ruled.
The existing token sidecar is preserved. Its older global-navigation example is
pre-existing drift, not a new pattern for this slice.

The design detector ran once and returned 20 advisory color/type-ramp findings and
no mandatory findings. New one-off tints and fluid text sizes were not promoted into
global tokens merely to clear those advisories.

Independent visual review initially required settled replacement captures, then
identified duplicate collection sharing and outdated profile composition guidance.
Both were corrected. Its final disposition is **ship for those two scored fixes**;
the verdict is not an unrestricted claim about every application surface.

Independent standards review caught durable-review revision, episode-scope and
remount retry-key issues. All three were fixed, covered by regression tests and
verified by the reviewer. The initial standards reviewer and documenter hit their
usage limit; standards review was replaced independently, and documentation review
was completed inline against the shipped code and incumbent design system.

## Rollout boundary

Subsequent local activation on 2026-10-23 deployed the current workspace to
`http://localhost:8080` and applied all three additive migrations to the existing
local database. A backup restore and before/after member-data counts passed;
provider hashes matched at initial activation. At the final recheck, database overrides still match, while the local provider file has newer changes and playback progress has one additional record; both were preserved. Live route, service-health and
desktop/phone browser checks passed. Two additional regression tests cover
missing portrait and cover artwork. Local evidence and rollback images are
recorded in ignored `local/deploy-taste-20261022/`; see the local activation entry
in `docs/DELIVERY.md`. The earlier restart rejection below describes the original
fixture acceptance session, before the user explicitly requested local deployment.

At the time of this acceptance pass, production activation still required the
publication, collection-genre and independent-social-preference migrations and the
matching API/web release. Local service restart/start attempts were rejected by
automatic approval review with only “blocked by policy”; the existing fixture
preview was retained instead.

## Production activation follow-up — 2026-10-26

The six additive migrations, including taste recommendations, were applied to
production. The first API/web activation attempt rolled back because the new
startup validation required Cloudflare-only provider execution in the split product
API. That API forwards playback to the separate playback service; it does not run
provider resolution. Validation now applies egress requirements only to
provider-executing processes. The fixed API image and matching Community web image
are healthy in production. Community discovery and taste routes are live;
unauthenticated recommendations remain private. API legacy and playback images,
provider routing, member records, and analytics configuration were unchanged.

