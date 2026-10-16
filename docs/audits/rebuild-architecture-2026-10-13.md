# Rebuild architecture implementation and evidence — 2026-10-13–14

## Scope and status

The migration implements the approved architecture incrementally, with existing screens, URLs, application-owned authentication, member records and Consumit Player retained. Admin order remains authoritative. Friend activity, rooms, chat, redesigns, automatic ranking and a dedicated search engine are outside this change.

Following the member's explicit deployment request, the Node product API, durable worker and queue are live on the existing VPS. Playback runs as a 1% canary with a compatible combined Node fallback. The existing web and PostgreSQL images, authentication secrets, provider configuration/order, session namespaces and subtitle volume remain in use. Full playback promotion is pending physical Android/Safari checks, field playback/Web Vitals evidence, actual recurring-cost confirmation and a representative workload/headroom assessment. Deferred checks are recorded as incomplete. One million monthly active members remains a destination; no test here establishes that capacity.

## Preservation and live baseline

- Local initial worktree: `local/rebuild-baseline-2026-10-13T14-41-02.064Z`, including staged/unstaged patches, original changed/untracked files and their hashes. Existing edits were preserved.
- Protected host snapshot: `/home/ubuntu/.consumit-rebuild-baseline-20261013`; source archive SHA-256 `722f16a9ee55cfd700e2706700474ec96959f50619a626fb0bae8354f3ae8c89`.
- SSH connection verified as `ubuntu@15.235.95.53` using the existing key. Host: six vCores, approximately 11.4 GiB RAM; 9.4 GiB available and 71 GB free disk at inventory.
- Existing web: `consumit-web:web-20261013T040120029Z`, Node 24.21.0. Existing API: `consumit-api:all-20261013T005336654Z`, Bun 1.4.0, image ID `sha256:bc6885a91672e5ca56a52b876d6e3f583c2f35a041b453a091e24fd4a1b4b1d6`.
- Existing PostgreSQL: `consumit-postgres:e84060152707-20261012T045819613Z`. Database approximately 34 MB, six members, 28 completed migrations, eight observed connections against a maximum of 100. This is an early dataset.
- Reported VPS bill: $15/month. Currency conversion, tax treatment, backup/monitoring bills, credit expiry and relay charges must be recorded before declaring the complete recurring total within 250 MAD. New processes share the existing host; no paid delivery/storage was activated.

Low-rate warm baseline, measured inside the existing API with ten successful warm samples per route:

| Route | Warm p95 | Status |
| --- | ---: | --- |
| Movie discovery | 11.18 ms | 11/11 requests succeeded, including cold sample |
| Search `Dune` | 4.04 ms | 11/11 succeeded |
| Movie detail 693134 | 3.67 ms | 11/11 succeeded |

These samples exclude workstation/Cloudflare transit and do not establish peak capacity. The initial measurement's `process.version` was Bun's Node compatibility string; the actual runtime was independently checked with `bun --version`.

## Implemented boundaries

- Node 24.21.0 images and Node server bundles; tsx development; Bun 1.4.0 dependency/build tooling. `.node-version`, engines and CI align.
- `apps/playback` owns resolution/session coordination, source validation, shared provider health, relay capabilities, captions and bounded computation. Existing provider/subtitle modules remain shared implementation code during extraction. Playback has no member database dependency in production configuration.
- `apps/worker` owns general scheduling/outbox dispatch, with a separate sandboxed Chromium entrypoint reusing the existing check. General and browser workers have independent readiness and bounded resources/shutdown.
- Product API owns member progress/history/preferences, canonical metadata and durable provider configuration. Authenticated bounded internal commands cover metadata, revisioned snapshots, captions, diagnostics and jobs. Stable snapshots retry concurrent revisions.
- Gateway routes existing playback/caption paths to the selected process, preserves preference routes in the API, blocks private interfaces and retains the exact separately authenticated AnimeKai exception. Compatible combined mode and shared session namespaces permit routing rollback.
- BullMQ 6.3.14/ioredis 6.0.0 run against separate Valkey 9.1.1 AOF/noeviction storage. PostgreSQL outbox writes share product transactions; fencing, idempotent handlers, retries, terminal retention, explicit replay and queue/scheduler reconciliation preserve committed intent.
- `BACKGROUND_JOBS_ENABLED` transfers scheduling and outbox ownership together after additive migrations. With it disabled, the initial combined Node checkpoint can run before outbox activation.
- Zod remains authoritative. Fastify integration/OpenAPI use pinned compatible dependencies; existing handler refinements/errors and response privacy remain. Public specs are `/v1/openapi.json` and `/v1/playback/openapi.json`; private/admin operations are hidden.
- Disk captions remain the initial store. S3-compatible storage is implemented behind the file-store interface, with explicit credentials, bounded bytes/deadlines, expiry metadata and first-party URLs. Cross-host activation also requires bucket lifecycle/copy/restore verification.
- W3C context crosses HTTP and durable outbox intent. Sampled traces use bounded rotating local files; aggregate metrics cover queue age/failure/readiness, pools, lag, playback and Web Vitals. Browser errors contain only fixed categories and never exception messages, stack, source URLs or member identity.

## Verification recorded

- Workspace lint and type checks ran; subsequent changed-package checks and final verification logs are retained in `local/rebuild-*`.
- API unit run: 554 passed. API PostgreSQL integration run: 50 passed. Worker real PostgreSQL/Valkey integration: seven passed, including an actual killed process and natural three-minute lease expiry. Updated final counts belong to the final verification record.
- Web: 506 passed; shared UI: 247 passed; provider SDK: 364 passed; relay: 63 passed; release worker: 18 passed; contracts: 25 passed; playback: four passed; private client: three passed. One web assertion timed out under concurrent build/test load; its entire 45-case file and the complete 506-test suite passed on rerun.
- Complete browse → sign in → decoded watch → persisted resume → save passed on desktop and Pixel touch emulation against real Linux Node 24.21.0 API/playback images and Nginx, using PostgreSQL and controlled media. Emulation does not replace physical devices.
- AOF forced crash drill: acknowledged marker survived SIGKILL/restart of the isolated queue; recovery measured 3.33 seconds.
- Off-host encrypted physical restore succeeded in an isolated database in 26.52 seconds. Requested UTC point: `2026-10-13T20:40:03.539Z`; last replayed transaction: `2026-10-13T20:39:14.059406Z`. Restored six members, 62 progress rows, 14 saves and 51 provider overrides; orphan/migration invariants passed and archiving was off. This proves this drill, not an ongoing recovery guarantee.
- Restore tooling now accepts independently recorded PostgreSQL/backup image tags and converts ISO UTC to the pgBackRest SQL timestamp syntax. The drill exposed both assumptions before traffic changes.
- Pinned collector configuration validates; Prometheus validates ten playback/service rules. The VPS collector observed API, playback and worker spans in the same controlled outbox trace. Aggregate evidence is retained in `local/rebuild-vps-trace-evidence.json`; raw spans were not printed.
- Canary template validation covers 1% and 100% cohorts; private paths have fixture request checks. Compose preflight shows no public API/playback/worker/queue ports and bounded process memory/CPU.
- Complete workspace builds passed, including production Next output and Node bundles. The final changed worker build is also included in the immutable images below. Never deploy a tag that was rebuilt in place.
- The actual Node 24.21.0 browser image launched Chromium 153.0.8010.12 with its sandbox enabled on the VPS under the reviewed seccomp profile, non-root user, read-only filesystem and bounded resources. This check used `about:blank`; it is not live-provider or physical-phone evidence.
- The staged queue was cleared after verifying its Compose project label. PostgreSQL provider intent completed once, with one attempt and no terminal failure. Both recurring schedules returned after worker restart. Graceful general-worker shutdown took one second, exited 0 and reported no OOM. Private gateway paths returned 404; the computation helper was disabled in the controlled fixture.
- Deleting the catalog scheduler from the staged queue while the worker stayed running was repaired by periodic reconciliation. A routing drill resolved a session on playback, routed to the compatible combined Node process, refreshed that same session with its original cookie, restored split routing and refreshed it again. Both refreshes returned 200 with the same title/session. The worker remained the sole scheduler owner. This is a controlled routing/session drill, not a live-provider rollback certification.
- Final outbox integration rerun: five passed. Complete workspace lint and type checking and 23 script checks are recorded independently from the larger suite checkpoints.

### First immutable candidate images

Release `rebuild-20261013-v3` was built locally and loaded onto the VPS. API, playback and worker runtime checks reported Node 24.21.0. The browser sandbox check independently reported the same version. The gateway is Nginx.

| Image | ID |
| --- | --- |
| `consumit-api` | `sha256:a7b249d846e62097b45b54681b97a53047147d4980299968e6b76b8dc7135bb8` |
| `consumit-playback` | `sha256:221b858a1a668434e8e7e5bd41af0b100803227c1ed0ad537278a2e3de5ddb40` |
| `consumit-worker` | `sha256:f7aba3b5e8faa40b3ef297d7fb694a9e9a7ab234035b34343e2786661c8cf3ed` |
| `consumit-worker-browser` | `sha256:2b223ec19d6ffb8b2fdeff661284f2d4bed4f9971e84123f33ac65dd7631cd0b` |
| `consumit-gateway-rebuild` | `sha256:caa7a4ffb3699fc181df1427da90aae9c33a776007e10b532ea8accd57c43799` |

### Final candidate — 2026-10-14

`rebuild-20261014-v4` supersedes v3. A fixture-wide shutdown initially stopped PostgreSQL and the collector before applications. That exposed an unhandled idle PostgreSQL pool error and exporter shutdown failure in Node. Shared database clients now handle idle errors with a fixed redacted event; telemetry shutdown records a fixed event if its exporter cannot drain. Explicit fixture dependencies and production rollback/browser-worker dependencies keep required services available while consumers stop. Regression tests cover both cases. Application/worker/collector Docker logs rotate at 10 MB with three files per service.

| Image | ID |
| --- | --- |
| `consumit-api` | `sha256:4ef45d4c455ae703b0768b2dbcdfad1a70886fdbcce4136eee747c2784e2a37e` |
| `consumit-playback` | `sha256:e4570ad502e655b160195656897305e72ff5af857aa34c9707a25d2a424b6d90` |
| `consumit-worker` | `sha256:da69215de06af198af8383dd0017beb7532fac500f911e4eb9a5ba689c8ae1fd` |
| `consumit-worker-browser` | `sha256:28017691ce8e93db1157157f4750dca890885f4d7434e357202420ce1f1e9178` |
| `consumit-gateway-rebuild` | `sha256:c7e40429ea509c7ade1eeb1b7cf870c3c7ae27893646b0a2611a19925e6f3290` |

- Final source checks: all 555 API tests, 50 PostgreSQL integration tests, the database pool regression, complete workspace lint and complete type checks passed. Earlier unaffected package checkpoints remain listed above.
- Desktop and touch-emulation member flows passed on v4 in 36.1 seconds. An initial image-flow run failed sign-in because intervening database integration tests had removed the fictional member. A guarded reusable fixture seed now supports both source and image runs; the rerun used the real authentication implementation.
- The v4 routing/session drill passed in both directions. An actual staged PostgreSQL stop produced readiness 503; after recovery it returned 200. API and worker survived without restarting. The follow-up provider outbox event completed in one attempt with no terminal failure and linked worker, playback and API spans. Readiness polling respects the existing one-second health cache.
- Ordered whole-stack shutdown completed in one second. Product API, playback, worker and combined rollback process all exited 0 with no OOM. Candidate containers and the successful restore clone are stopped; their images, volumes and protected evidence remain available.
- The v4 browser image independently launched Node 24.21.0 and sandboxed Chromium 153.0.8010.12 on the VPS. This remains an `about:blank` sandbox check.
- Production API retained its original image ID and returned readiness 200. No production outbox migration or routing promotion was performed: the database still has 28 completed migrations. A later read observed eight members, compared with six at the baseline; production continued receiving normal activity. After fixture shutdown the host had 9,437 MiB available RAM.

## Controlled load evidence

Initial local Docker-to-fixture run: five VUs, twenty seconds, warm controlled catalog, real member library/progress writes. Delivered successes are counted separately from HTTP 429:

| State | Delivered requests | Rate limited | Other failures | Read p95 | Search p95 | Progress p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Playback running | 290 | 20 | 0 | 67.28 ms | 12.25 ms | 136.02 ms |
| Playback process stopped | 290 | 20 | 0 | 43.75 ms | 13.08 ms | 80.43 ms |

Delivered throughput was approximately fourteen requests/second. The rate limits remain enforced. These results prove this fixture and failure isolation at this workload; they do not prove 500 RPS, 5,000 watches or one million monthly active members.

### Existing VPS candidate checkpoint

The private `consumit-rebuild-stage` stack used the actual immutable API/playback/worker/gateway images, an isolated PostgreSQL fixture database, separate authentication/session/queue Valkey processes, and the configured collector. It was accessible only through loopback port 18592. Tests used five VUs for twenty seconds with controlled warm catalog responses; media delivery was excluded. Authentication in test setup, 80 successful library reads and 20 successful progress writes were observed in each run.

| State | Delivered requests | Rate limited | Other failures | Read p95 | Search p95 | Progress p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Playback running | 300 | 25 | 0 | 29.05 ms | 17.79 ms | 69.60 ms |
| Playback process stopped | 300 | 25 | 0 | 33.13 ms | 16.20 ms | 59.62 ms |

Delivered throughput was 14.17 and 14.40 successful requests/second respectively. HTTP 429 responses are excluded from delivered capacity. The playback process returned to healthy after the failure check. Logs are `local/rebuild-vps-load.log` and `local/rebuild-vps-playback-down.log`.

With production, the candidate and the isolated recovery clone running, the host reported 9,050 MiB available RAM, no swap and 68 GiB free disk. One post-check process snapshot measured API 125.1 MiB, playback 58.0 MiB, general worker 82.4 MiB and collector 33.7 MiB. These are observations at this workload, not peak memory reservations or a long-duration saturation test. The fixture database is small; repeat representative catalog/member traffic and independent media-route measurements before forecasting production headroom.

The v4 repeat used the same five-VU, twenty-second workload:

| State | Delivered requests | Rate limited | Other failures | Read p95 | Search p95 | Progress p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Playback running | 300 | 25 | 0 | 44.51 ms | 34.08 ms | 66.19 ms |
| Playback process stopped | 300 | 25 | 0 | 17.44 ms | 7.80 ms | 52.03 ms |

Each run again included 80 successful library reads and 20 progress writes. Delivered throughput was 14.19 and 14.41 requests/second. Evidence is in `local/rebuild-vps-load-v4.log` and `local/rebuild-vps-playback-down-v4.log`; the earlier v3 observations are retained separately.

## Production canary activation — 2026-10-14

- Explicit authorization: the member requested deployment after the earlier summary identified deferred checks. The protected deployment record is `/home/ubuntu/.consumit-rebuild-deploy-20261014`; original container configurations and the original environment/Compose files are retained there. `.env.production` remains unchanged; `.env.rebuild` adopts the live configuration and adds dedicated internal secrets.
- Fresh encrypted off-host backup `20261014-161000F` was verified before migrations. All 28 applied migration checksums matched source, accounting for line endings. Only the two outbox migrations were applied through the existing TLS migration role/helper; 30 migrations are now complete.
- API, combined fallback, general worker and gateway use `rebuild-20261014-v4`. Playback uses `consumit-playback:rebuild-20261014-v7`, ID `sha256:bb5f237f21d0e76dd16232cf5122c4c8b89a1d67e9cd86ee3c53229c2676a158`. Web and PostgreSQL retained their recorded image IDs. No new public service ports or paid delivery/storage were activated.
- Deployment exposed an inherited Bun health command and catalog-dependent adapter constructors. API health now explicitly uses Node. Playback injects product API title/IMDb resolvers; FilmU variants honor that seam too. The final regression initializes twelve catalog-dependent adapters without a catalog credential and checks series IMDb RPC behavior. Five playback tests and 33 configured-provider/resolver tests passed, with affected lint/type checks. All 25 script checks passed. Unpromoted playback v5/v6 builds are retained as intermediate artifacts; v7 is the active patch.
- The first activation's Docker health failure was recovered by restoring the original compatible API. Subsequent handoffs kept playback on the combined process until split readiness passed. The final product API, playback, combined fallback, queue and worker are healthy; gateway configuration is 1% playback and 99% combined fallback. The computation exception reaches the primary playback service with its separate secret.
- Live Node checkpoint and post-deployment product checks passed sign-in, member reads, Save, progress, resume and private library responses. They used a temporary private diagnostic account with no verification email; its sessions were revoked and its records removed. Final data checks found eight members, zero diagnostic members, two processed outbox rows, zero pending rows and zero terminal failures.
- Existing release checks were disabled before deployment and remain disabled. Their browser-worker image/entrypoint is available; no reminders were enabled. API/combined background timers are disabled and the general worker owns release/cleanup/probe schedules. Queue AOF and `noeviction` were independently checked. The temporary runtime checkpoint was stopped.
- Public HTTPS smoke passed the homepage/security headers, readiness, discovery/search caching, anonymous member rejection/private responses and private-interface 404. The compiled production smoke also passed. A localhost-only Prometheus reload endpoint rejected HTTP reload; SIGHUP loaded the validated rules. All ten service/playback rules and seventeen production rules reported healthy evaluation. Notification delivery remains unverified.
- Live resolution through the new playback process returned matching canonical refs, private responses and direct HLS for movie 693134 (`cookiebakers`, 684 ms), series 1396 season 1 episode 1 (`cookiebakers`, 469 ms), and anime 21 episode 1 (`kazora`, 105 ms) on the warm repeat. These are source-resolution checks, not decoded-frame or physical-device certification.
- Desktop and touch-emulation browse/sign-in/decode/resume/save passed again against the v7 playback image in 37.7 seconds using controlled media. The public production web release was preserved; the new frontend error observer still requires a compatible web release. Its receiving API/metrics are present.
- Available host RAM after activation was 9,391 MiB. Low-rate live Node measurements recorded 11/11 successful requests per route, with warm p95 discovery 37.58 ms, search 4.91 ms and detail 5.64 ms. Workstation-to-public measurements included approximately 352–723 ms of end-to-end time and are not interchangeable with internal API timing. These observations establish this workload only.

Evidence: `local/rebuild-deployed-summary.json`, `local/rebuild-live-node-baseline.json`, `local/rebuild-live-public-smoke.json`, `local/rebuild-live-provider-smoke.jsonl`, `local/rebuild-live-activation-v7.log` and `local/rebuild-v7-browser.log`. The protected acceptance record retains phone/field/full-cost checks as false/null; it does not certify full promotion.

## Growth assumptions and remaining gates

`scripts/forecast-rebuild.mjs` models 100,000 DAU, four million ordinary requests/day, 20,000 one-hour watches/day, 500 peak ordinary RPS and 5,000 simultaneous watches. The existing 25-second periodic progress interval adds approximately 2.88 million writes/day and 200 peak writes/second, excluding pause/seek/exit/completion. Combined peak product demand is therefore about 700 RPS under these assumptions.

At an illustrative 3 Mbps and 10% relay share, media relay demand is approximately 1.5 Gbps at peak and 2.7 TB/day, excluding overhead. This is demand modeling, not a priced service or delivered-capacity claim. Direct delivery and each relay region require separate evidence. Larger hosts, database pooling/availability, coordinated Next caches, remote captions and paid relay usage need a separately priced growth stage.

Still required for promotion: representative workload/headroom and full recurring cost; physical Android and Safari/iOS; provider-specific start/fallback/caption/audio/casting results; LCP/INP/CLS field percentiles; eligible start denominator and ≥98% success; first frame p75 ≤3 s/p95 ≤8 s; alert delivery; a real-provider canary rollback checkpoint. Search adapters remain unchanged; multilingual/indexed-query benchmarks precede any dedicated search decision. See [the migration runbook](../runbooks/rebuild-migration.md).
