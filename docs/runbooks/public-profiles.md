# Public profiles and lists rollout

Release migration `20261019160000_lists_public_taste`, API and web together. No separate search or social subscription is required; these operations use existing PostgreSQL, authentication, rate limiting and observability.

1. Take and verify a named PostgreSQL backup and retain the current API/web images.
2. Confirm the migration role can create the trusted `pg_trgm` extension. Inspect pending migrations and the API/web release manifest before running `prisma migrate deploy`; that command applies every pending migration in its directory. Use a verified release-specific migration directory when unrelated work is pending. This migration sets active profiles to public section defaults, preserves each list's existing Public/Private value, snapshots saved-list metadata so bookmarks survive source deletion, removes profile location, and replaces the visibility-filtered search indexes. Verify the migration with data containing active profiles, private and public lists, existing saved-list bookmarks, and location values before release.
3. Start compatible API/web builds together. Profile identity stays public; the eight taste sections are independently controlled in Settings. New lists default to Public and a list is readable only when it and the owner's Lists section are public. Anonymous viewing trends remain a separate opt-in that starts off.
4. Smoke guest/owner/signed-in visitor reads, aliases, deleted/missing/hidden-section 404 equivalence, no-store, section privacy, public list combinations, saved-list update/unavailable/remove behavior, search, follow/unfollow, trend opt-in/opt-out and Home's empty/loaded row behavior. Confirm noindex on profile/list pages and no member identity or count in trend JSON.
5. Monitor search latency, database connections/CPU/query load, and follow write failures. Check real traffic before changing infrastructure.

The API records `consumit.members.search.duration` in seconds with outcome and `consumit.members.follow.writes` with operation/outcome. Queries, usernames and member identifiers are never metric labels. Prometheus-exported names replace dots with underscores; inspect `/metrics` in the telemetry pipeline for suffixes. Suggested initial investigation thresholds are search p95 above 500 ms over 15 minutes, sustained database connection saturation, or follow failure rate above 5% with at least ten writes. These are operational starting points, not capacity promises. Existing general API rate-limit and error conventions apply.

The migration drops the legacy profile-location columns and the saved-list foreign key. After it completes, do not start a pre-migration API image by itself: its Prisma client still selects the removed profile columns. If rollback is needed after migration, restore the verified pre-release database snapshot through the established recovery runbook before starting the retained API/web images; that restore discards member changes made after the backup. A failure before migration can use the retained images without restoring the database. Re-enabling this release must not run legacy normalization a second time.

Verification uses isolated `postgres-test`/`valkey-test` services, API contract and database tests, and web interaction checks with deterministic fixtures. Those fixtures are test-only and do not seed the live member database.

This release excludes feeds, messaging, follow requests, social follow notifications and public-list discovery search.

## Workspace release status (2026-10-09)

The public-member migration has been verified in disposable PostgreSQL only. The managed database and running API/web have not received this slice. The shared checkout also contains first-visit preferences that require `20261009180000_experience_preferences`; deploying the current source while applying only the public-member migration would leave that separate feature incompatible. Release a verified compatible migration/API/web bundle, preserving the active episode-release worker and its ignored local configuration. Do not infer deployment from a fixture build or browser pass.
