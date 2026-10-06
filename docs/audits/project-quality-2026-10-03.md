# Project quality review — 2026-10-03

Requested scope: review the whole project, clean it up, and improve correctness,
performance, caching, security, implementation practices, and operations.

Status: review and local improvements complete. This is a repository-wide review, not a claim that every
source line or production workload has been inspected. Existing uncommitted
work is retained. No schema or production data migrations are part of this review.

## Baseline

Evidence is in ignored `.cache/project-review/` logs. The workspace baseline
fails lint (18 retired imports), type checking, and 17 unit tests:

| Workspace | Baseline tests | Failures |
| --- | ---: | ---: |
| Contracts | 21 | 4 |
| Provider SDK | 204 | 0 |
| Media relay | 47 | 0 |
| UI | 186 | 0 |
| API | 428 | 9 |
| Web | 354 | 4 |

Tests run with two workers to bound local resource use. A failing root command
stops before later workspace gates, so individual workspace results also matter.

## Review coverage and remaining work

| Area | Review focus | Status |
| --- | --- | --- |
| Quality gates and product retirement | Active private contracts, stale tests, unused code | Lint/type checking restored; 1,239 unit tests pass after security updates |
| Public catalog caches | Cache identity, TTL, stale policy, coalescing, bounded storage | Persistent cold-read coalescing and deadline races fixed and measured |
| Member data and database | Owner isolation, exports, pagination, query shape/indexes | Privacy repairs pass 33 isolated integration tests on PostgreSQL 17 and 18; bounded reads and existing owner/date indexes inspected |
| Playback/providers/relay | Host validation, session ownership, expiry, cancellation, bounded recovery | Transport, provider HTTP, resolver, relay grants, state and shared engine seams inspected; existing SDK/relay/UI suites pass |
| API/identity/security | Rate limits, logging, timeouts, CSRF, auth state | Cookie-based credential budget bypass fixed; same-origin and no-store checks pass |
| Frontend performance | Server fetches, client bundles, loading, image handling, request lifetime | Catalog-only five-minute caching, no-store member reads, lazy HLS/DASH and bounded enrichment inspected; no speculative UI rewrite |
| Infrastructure/operations | Build/runtime, health, cache persistence, backups, telemetry | Compose/Terraform validation passes; process pools, separate Valkey policies, non-root images and backup scripts inspected |
| Documentation/dependencies | Canonical scope, version consistency, stale guidance | Duplicate product brief replaced by pointer; stale social/direct-only/deferred-dependency guidance corrected; 38 audit records removed, four tooling records documented |

## Findings being repaired

- Private account exports must normalize legacy stored public profile/list flags
  to the active private response contract without mutating historical rows.
- Owner list archives incorrectly filter out private lists when an old profile
  flag is public. Owner authorization already occurs before the archive query.
- Retired follow/review-like spies and public review fixtures conflict with the
  active personal product. Replace those expectations with route retirement
  and owner-only privacy coverage; preserve the historical database tables.
- Fastify request logger serializer returns optional strings where its typed
  serializer requires settled strings.
- Configured-provider fixture paths must resolve relative to the test module,
  not depend on the command's working directory.
- Embed recovery tests omit the current shared quality-preference reader from
  their UI mock, making initial resolution fail before reaching transport.
- The rate-limit envelope test uses the catalog budget after that budget was
  separated from member traffic. Exercise the member budget explicitly.

## Measured cache improvement

[Raw measurements](./project-quality-cache-2026-10-03.json) compare the prior
StaleCache implementation with the changed implementation against isolated
PostgreSQL 18, a ten-connection pool, and a fixture upstream. Each of three
trials sends 100 simultaneous requests for one uncached key. Connections are
warmed first; trial order alternates. Both versions load upstream and write
persistent data once. Database reads fall from 100 to 1 in every trial.
Median burst p95 across the trials falls from 17.142 ms to 7.855 ms. This is a
local contention measurement, not a production latency or SLO claim.

Freshness now uses the clock after the persistent read. Expired entries are
replaced by refresh or the existing conditional scheduled prune; an asynchronous
unconditional delete can no longer erase a newly refreshed persistent row.

## Dependency security follow-up

The registry audit reports 42 advisory records initially. Compatible updates
are applied to the lockfile, including Next 16.3.6 and Fastify 5.12.5.
The [Next advisory](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j) affects
Node ImageResponse using attacker-controlled SVG. No ImageResponse/next-og
call site was found, but the patched version is still required. The
[CSV advisory](https://github.com/advisories/GHSA-8cw4-87c7-c6xx) involves duplicate
prototype headers with grouped columns. Consumit's parser does not enable grouped
columns; the resolved parser is now 7.0.3 with an import-boundary regression.

The final audit has four remaining records: 38 are removed, without ignores.
`bun why` traces them to tool dependencies:

| Dependency | Remaining records | Path and handling |
| --- | ---: | --- |
| deepmerge-ts 7.1.5 | 1 high | Prisma CLI/config pins it. [The issue](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) requires cyclic object graphs; this repository's trusted Prisma config supplies none. A compatible upstream update remains follow-up work. |
| mysql2 3.15.3 | 1 high, 1 moderate | Prisma CLI pins it; Consumit uses PostgreSQL, not MySQL. [The authentication advisory](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr) and compressed-protocol advisory remain recorded. Do not use the migration tool with untrusted MySQL endpoints. |
| braces 3.0.3 | 1 high | Next's ESLint plugin → fast-glob → micromatch. [The issue](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) concerns nested glob patterns; this repository uses trusted lint patterns. The registry reports no published fix. |

These paths establish local reachability constraints, not a universal safety
claim. Prisma CLI is included in the migration image and remains operator-only.
No major ORM override or advisory suppression was introduced to obtain a clean
audit. Revisit the pins when compatible upstream fixes exist.

## Verification limits

Current evidence includes full unit tests and isolated integration tests.
The root production build passes on Bun/Node on this workstation: API, media
relay, and Next 16.3.6, including its TypeScript check and static generation.
Frozen-lockfile verification passes. Twelve Chrome desktop/touch fixture checks
pass against the updated framework and API: hydration, native decoding and
guest resume, HLS captions, paused recovery, server switching/Auto, list retry,
and failed selection retaining the current stream. These browser checks use
the development fixture server, not deployed production images. Physical
Safari, sustained production traffic, external backup restore and notification
delivery, and upstream Worker CPU limits are separate operational evidence;
configuration validation does not establish them. Live member data and schema
have not been changed by this review.

Changes remain in the local checkout and generated build artifacts. The running
Docker stack retains its existing images; deploying rebuilt images is separate
from this review's local verification.

The post-update API build includes 1,284 inputs. Its Bun build metafile contains
no deepmerge-ts, mysql2, or braces package inputs in the API/worker bundles.
Readiness currently reports configured capabilities, not live dependency probes;
the separate infrastructure and service checks must be considered alongside it.

Verification initially ran integration, unit tests, lint and type checking
together. One identity integration exceeded Vitest's five-second deadline under
that contention. Rerunning integration without the competing compiler/linter
passed all 33 tests, also repeated against PostgreSQL 17 to match deployment.
No application/test timeout was increased to conceal the failure. Resource-heavy
quality gates should run sequentially on this workstation.

## Final verification

| Check | Result |
| --- | --- |
| All workspace lint and TypeScript gates | Pass |
| All workspace unit tests, two workers | 1,239 pass |
| Sequential database/Valkey integration | 33 pass on PostgreSQL 17; also 33 pass on PostgreSQL 18 |
| Root production build | Pass: API, relay, Next |
| Representative Chrome desktop/touch playback | 12 pass |
| Compose and Terraform validation | Pass |
| Frozen lockfile | Pass |
| Dependency registry audit | Four documented tooling advisories remain; 38 removed |
| Changed tracked-file whitespace | Pass |

Disposable PostgreSQL/Valkey containers and temporary repair scripts are removed.
Ignored `.cache/project-review/` retains diagnostic logs, build metadata, and the
controlled cache benchmark. Existing live services remain healthy. No commit,
production deployment, database/schema change, or existing work reset occurred.
