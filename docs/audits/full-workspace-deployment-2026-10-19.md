# Full workspace deployment — 2026-10-19

Release: `rebuild-20261019-everything-v1`  
Status: deployed and healthy.

## Release scope and safeguards

The frozen workspace snapshot was built on the production host into immutable API, playback, worker, gateway, migrator and web images. The candidate API readiness check returned HTTP 200 with database, identity, rate-limit and schema dependencies ready. A full physical database backup and pgBackRest archive check passed before activation. The migration gate found no pending changes, so no database migration ran. The existing playback routing canary remains at 1%.

All six application units are active and healthy on the release images. The API, combined API fallback, playback, worker, gateway and web were activated in order, with a live backend smoke check before web activation. Existing database, cache, queue, monitoring and tunnel services stayed in place. The previous images and original private provider configuration are retained by the release rollback state.

## Next-watch recommendations

The home surface now uses one simple poster row. Ranking combines results from up to eight recent completed or 95%-watched titles with recency-decayed reciprocal-rank fusion, rewards cross-title consensus, uses genre overlap as a tie-breaker and lightly diversifies genre and format. It excludes watched, duplicate and privately dismissed titles. The interface removes the seed/type/sort controls; dismiss and undo/reset remain available without adding a second row of controls. Recommendations use bounded catalog signals and do not claim learned taste matching.

The full workspace lint, type checks, tests and optimized production build passed before rollout. Recommendation ranking and row tests passed, and the Impeccable detector returned no findings for the changed surface.

## VidRock embed

The private production provider roster was extended from 70 to 71 entries with the existing `vidrockframe` adapter configured for US movie and series embeds at `vidrock.to`. All previous entries were preserved. The active API loaded the new row after the API/playback restart. Direct checks of the configured VidRock movie and episode routes returned HTTP 200 before rollout; this confirms route availability, not decoded playback quality or coverage for every title.

## Live verification and limits

- API, combined API fallback, playback, worker, gateway and web are healthy on `rebuild-20261019-everything-v1` images.
- Post-deploy backend smoke passed readiness for API, fallback, playback and worker; public smoke, private gateway boundaries and both playback-attempt routes passed.
- `https://consumit.online/` and `/anime` returned HTTP 200 after web activation.
- Candidate readiness, physical backup and archive verification passed; no migration ran.
- The temporary candidate checkpoint was removed after verification. A prior checkpoint container from the 2026-10-17 release was stopped and retained under a renamed container name.

These checks do not establish provider-wide decoded playback, physical Android/iPhone acceptance, the Brother PC reproduction, field-load latency percentiles, full recurring-cost evidence or million-member capacity. The release remains on the existing 1% playback canary, and those checks stay open.
