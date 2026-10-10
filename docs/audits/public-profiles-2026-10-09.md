# Public profiles, following and people search

The member job is publishing taste deliberately and finding other members to follow. This extends Cinema After Midnight and the current profile/settings/search compositions; it does not introduce an activity feed or a new visual system.

## Publishing boundary

Profile visibility defaults to private. Explicit publication shares display name, username, avatar/banner, bio, Favorites, all ratings and all reviews. Public lists require a public profile as well as their own public flag. Location, private collections/statistics, tags, import metadata, history, progress and account details stay in owner responses. Visitor DTOs are separately selected and parsed. Private/deleted/missing profiles have the same unavailable response, aliases resolve to canonical usernames, and profile/list pages retain noindex. Related reads are no-store.

Following uses the existing unique relationship and indexes, authenticated origin-protected idempotent PUT/DELETE, and concurrent INSERT ON CONFLICT. Private relationships survive visibility changes, appear only as neutral owner placeholders, and are excluded from public counts and lists. The outgoing owner can unfollow them. Guest sign-in returns to the profile without automatically following.

People search uses PostgreSQL substring matching and partial pg_trgm GIN indexes. It requires 3–100 characters, ranks exact usernames first and provides scoped cursor pagination with 20 results by default and 50 maximum. The overlay retains 200 ms debounce, cancellation and keyboard navigation. People-only requests do not call either catalog.

## Evidence

- 500 API unit tests passed; API lint, type checking and bundling passed.
- 22 contract tests passed, including defensive stripping of private profile, review and list fields.
- 57 profile/search/list frontend tests and two publishing save/retry tests passed. Stale People responses are cancelled and ignored.
- Eleven existing member-data database tests and five public-member database tests passed. These cover visibility combinations, aliases/deletion, retained/private relationships, concurrent/idempotent writes, scoped pagination, exact-first search and a PostgreSQL GIN query plan with deterministic data. Legacy normalization preserves member content and follows.
- The database fixture was moved to the disposable `consumit_social_test` database on postgres-test to avoid concurrent truncation by other work. It never targets the managed member database.
- Optimized web compilation, TypeScript and static-page generation passed. The browser fixture uses an isolated production build and existing local artwork.

All three deterministic Chrome browser scenarios passed, including guest return without auto-follow, desktop/mobile publishing/search/follow/share and failure recovery. The matrix passed again for list-editor captures using the same production build. The finish reviewer scored its three fixes resolved and returned ship at that fix-list scope. Final documentation and rollout disposition are recorded in DELIVERY. Concurrent first-visit guide work is also present in the shared checkout; validation statements here apply to the observed checks and do not certify that separate feature. No managed-database migration or runtime rollout is claimed by this evidence.

## Release

The one-time migration normalizes legacy profile/list flags to private before enabling public reads and installs pg_trgm indexes. Ship compatible migration/API/web together after a named verified backup. Search latency and follow outcomes have low-cardinality OpenTelemetry measurements; queries and member identities are not labels. See the [public-profile runbook](../runbooks/public-profiles.md). No additional paid service is required; existing infrastructure still bears database and API load.
