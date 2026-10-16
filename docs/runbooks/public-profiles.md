# Public profiles rollout

Release migration `20261009170000_public_member_discovery`, API and web together. No separate search or social subscription is required; these operations use existing PostgreSQL, authentication, rate limiting and observability.

1. Take and verify a named PostgreSQL backup and retain the current API/web images.
2. Confirm the migration role can create the trusted `pg_trgm` extension. Inspect pending migrations and the API/web release manifest before running `prisma migrate deploy`; that command applies every pending migration in its directory. Use a verified release-specific migration directory when unrelated work is pending. Apply the public-member migration before serving the new API. It resets legacy profile/list visibility to private, preserves content and follows, and adds two partial trigram indexes. Do not rerun its UPDATE statements after members begin publishing.
3. Start compatible API/web builds together. Private profiles remain private until an explicit Settings save; public lists require both public flags.
4. Smoke guest/owner/signed-in visitor reads, aliases, deleted/missing/private 404 equivalence, no-store, publication/retraction, public list combinations, search and follow/unfollow. Confirm noindex on profile/list pages and no private fields in visitor JSON.
5. Monitor search latency, database connections/CPU/query load, and follow write failures. Check real traffic before changing infrastructure.

The API records `consumit.members.search.duration` in seconds with outcome and `consumit.members.follow.writes` with operation/outcome. Queries, usernames and member identifiers are never metric labels. Prometheus-exported names replace dots with underscores; inspect `/metrics` in the telemetry pipeline for suffixes. Suggested initial investigation thresholds are search p95 above 500 ms over 15 minutes, sustained database connection saturation, or follow failure rate above 5% with at least ten writes. These are operational starting points, not capacity promises. Existing general API rate-limit and error conventions apply.

For rollback, stop the new API/web together and start the retained compatible images. Leave the additive extension/indexes and preserved content/follows in place. Restore a database snapshot only through the established recovery runbook; restoring it would discard post-backup member changes. Re-enabling this release must not run legacy normalization a second time.

Verification uses the isolated `postgres-test`/`valkey-test` services, API contract and database tests, web interaction tests, and `tests/social/playwright.config.ts` with deterministic fixtures. Those fixtures are test-only and do not seed the live member database.

This release excludes feeds, messaging, follow requests, social follow notifications and public-list discovery search.

## Workspace release status (2026-10-09)

The public-member migration has been verified in disposable PostgreSQL only. The managed database and running API/web have not received this slice. The shared checkout also contains first-visit preferences that require `20261009180000_experience_preferences`; deploying the current source while applying only the public-member migration would leave that separate feature incompatible. Release a verified compatible migration/API/web bundle, preserving the active episode-release worker and its ignored local configuration. Do not infer deployment from a fixture build or browser pass.
