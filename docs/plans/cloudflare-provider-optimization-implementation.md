# Cloudflare provider migration implementation

Owner request: 2026-10-24. Production baseline: `rebuild-20261024-streamvault-native-v3` (API/Playback), `rebuild-20261024-provider-reliability-v1` (web). Preserve unrelated workspace edits and provider ordering.

## Acceptance ledger

- [ ] Versioned Cloudflare-only route registry and enforced VPS provider egress boundary.
- [ ] Edge coordination for admission, lookup cache, coalescing and circuits.
- [ ] Dedicated subtitle Worker, SQLite Durable Objects and verified R2 files.
- [ ] Bounded discovery, expanded search, ranking and duplicate replacement.
- [ ] Recording/file-scoped corrections for members and guests, preserving legacy data.
- [ ] Reproducible project baselines and measured improvements across changed workflows.
- [ ] Regression, browser, native-HLS/casting where available and budget acceptance.
- [ ] Reviewed production overlay, staged rollout and disable-only rollback.

Production activation remains gated: the existing OAuth token received HTTP 403 for R2 bucket access; included quotas and scoped R2 access must be verified. Mapple and LookMovie remain disabled. No production readiness or viewer-capacity claim follows from fixture checks.

## Implementation checkpoint (workspace only)

- Added shared caption selection policy, primary-language grouping, bounded reserve, batched discovery, explicit client continuation, one-hour positive/five-minute empty caches and stale fallback.
- Added compiled subtitle provider roster and injectable edge HTTP transport. Removed shell XZ conversion; unsupported XZ results have an explicit status. Fixed ASS detection when a provider incorrectly declares VTT.
- Added subtitle Worker, per-recording search Durable Objects, independently shared generic provider-search Durable Objects, SQLite expiry alarms, R2 storage and immutable content-addressed prepared files. Credential-bearing files bypass shared edge caching.
- Added trusted private playback context from owned sessions; attached captions rank first. Generic searches remain shared across different recordings. Release-proof metadata is available for ranking, while all matching candidates remain selectable.
- Added opaque recording versions, additive correction table/migration, exact member/guest correction keys and recording-change caption resets. Legacy preference rows remain intact.
- Added route registry with explicit provider/kind/region/delivery tuples, matching resolver policy hashes, Cloudflare provider admission/cache/coalescing/circuits, edge audio inspection, native transport denial and production native-browser/media entry-point guards.
- Added shared catalog refresh leases using existing Valkey and identical progress-flush coalescing without changing the 25-second cadence.

### Evidence collected so far

- Earlier local **workerd**, actual SQLite Durable Objects and emulated R2 results were measured before the owner follow-up below: 25 identical discoveries produced three upstream calls; warm requests produced zero; ten English choices; VTT/SRT/ASS/ZIP preparation and delivery passed; recording isolation and generic discovery reuse across recordings passed. The ten-choice result describes the superseded cap. Reproduce with the build command and `scripts/verify-edge-subtitles.mjs`.
- Provider coordinator SQLite fixture: 25 identical lookups charge one admission; a restarted coordinator reuses persisted cache.
- Controlled 30-instance catalog fixture: upstream calls and persistent writes fall from 30 to one with a shared lease. Four identical overlapping lifecycle writes fall to one, retaining a separate keepalive write when an ordinary write is pending. See `scripts/benchmark-provider-optimization.ts` and its JSON evidence. These are synthetic measurements, not production API capacity.
- Most recent broad API run: 417/418 checks passed; the remaining assertion was a compatibility expectation for an optional false config field and has been repaired. Rerun after current edits. Earlier focused worker, UI and API checks passed; later code still needs the full final checks.
- Production disk inspection: 96 GiB total, 74 GiB used, 23 GiB available. Docker reports 50.91 GB build cache (46.77 GB reclaimable) and 20.49 GB images with shared layers. Nothing deleted.

### Work still required

Complete final regressions/type/lint/build checks, real Cloudflare VidBolt/StreamVault candidates and scoped route acceptance, R2 account activation/access/lifecycle verification, deployment configuration and operational docs. Prepare a surgical overlay against the frozen production baseline; never deploy the dirty workspace wholesale. Verify browser movie/series/anime behavior, native HLS/casting where available, and production measurements before promotion. Audit remaining workflows and preserve working pagination, visible-page polling, database pool bounds and scheduling ownership.

Owner says they will enable R2. Their follow-up questions about R2 allowance and VPS disk usage were answered; they have not yet confirmed R2 activation.

## Owner follow-up — 2026-10-25

The owner asked to restore broader subtitle choices and remove SubF2M. Discovery now searches twelve providers per batch, returns uncapped language/search results in pages of twenty, and allows the prior automatic fallback across matching candidates. SubF2M is removed from the compiled roster and its old cached results are retired. The earlier ten-choice workerd measurement no longer describes current behavior; rerun the subtitle fixture before recording updated evidence.
