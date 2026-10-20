# Full workspace deployment — 2026-10-17

Release: `rebuild-20261017-everything-v1`  
Status: rolled back after a production playback-start regression. The previous API, playback, worker, gateway, and web images are active; the separate playback process remains on the existing 1% canary.

## Scope and preservation

The release snapshot contained 157 source-file differences from the production checkout. It shipped the current Watch/player, web, API, shared UI and provider SDK work, including the complete player and focused polish, Admin-owned playback order, plain external-player frames, anime adapter support and subtitle updates.

API, combined API fallback, playback, general worker, gateway and web use immutable release images. PostgreSQL, authentication and playback Valkey, queue Valkey, SES feedback, monitoring, Cloudflare Workers, secrets and the private production provider roster were preserved. The production provider file hash and the member/provider counts matched the pre-release snapshot. No provider was enabled by changing production configuration.

All 31 source migrations were already applied in production. The predeployment gate found no pending migration, so no schema change ran. A fresh full physical backup and pgBackRest archive check passed before activation. The protected rollback and source record is at `/home/ubuntu/.consumit-everything-20261017`.

## Release images

| Unit | Image | Image ID |
| --- | --- | --- |
| API and combined fallback | `consumit-api:rebuild-20261017-everything-v1` | `sha256:8e55f67a5b2e878a2338b6d060acf64a331189eb13f883de30999059d1ed726b` |
| Playback | `consumit-playback:rebuild-20261017-everything-v1` | `sha256:bf10916058df3994136bad0c77185ba3d7ee00dfa0a13b14bdf2072b732644ea` |
| General worker | `consumit-worker:rebuild-20261017-everything-v1` | `sha256:6ed75aef332b1fce20f2b8ce22e63a88efb5473fee290bc8026ba5c502774b38` |
| Gateway | `consumit-gateway-rebuild:rebuild-20261017-everything-v1` | `sha256:0213803ec119bcff36eda149183ffee4cb91b817af8e3e0f75736357f6183c14` |
| Web | `consumit-web:rebuild-20261017-everything-v1` | `sha256:48e0f0ee33665db76c655f89bd346eb769d1e71b0da1884c8c544804d7690bb6` |

The migrator image also built (`sha256:23057a105cd2acd01b3668ad46d09ccff4952ef97b6cbf5de30cd4a2aed0bf37`) and was not run. The release-check worker remains disabled under the existing production setting.

## Verification

- All six release images built successfully from the frozen 13 MB source context.
- The isolated candidate API returned readiness `200`, member data `401` and internal playback route `404`.
- After activation, API, combined fallback, playback, general worker, gateway and web were healthy. Node services reported version `24.21.0`.
- The production HTTPS smoke passed. Settings and movie, series and anime Watch routes each returned `200`; private member and internal-route boundaries passed, as did both playback-attempt endpoints.
- Database counts before and after matched: 20 members, 103 playback progress rows, 1 watch-history row, 33 saved titles and 56 provider overrides.
- Gateway configuration still routes 1% of playback requests to the separate playback process. The production provider roster hash is unchanged.
- The temporary candidate checkpoint was stopped and removed after the checks.

The optimized builds and production smoke verified deployment readiness and route behavior, but not playback. The full workspace test suite was not repeated, no postdeployment visual browser matrix ran, and none of the changed provider routes had decoded-playback evidence before activation.

## Incident and rollback

After activation, a real browser Watch check returned HTTP 200 for the movie page and HTTP 200/204 for provider discovery, playback-attempt, relay-manifest and event requests, but playback did not start: the player repeatedly retried source attempts and no advancing video element was observed. The gateway was forwarding these requests; those status codes alone did not establish a usable source or decoded media.

The entire image set was rolled back to the saved previous image IDs. The production browser check after rollback decoded and advanced video (`currentTime` passed 1 second, `paused: false`, `readyState: 4`, no media error); the page and readiness endpoint returned 200 and all restored containers were healthy. The failure while the candidate was active and success after rollback strongly implicate the candidate release, but this was not a controlled same-source comparison: external provider availability can change between runs. Because API, playback, worker, web, and gateway images were rolled back together, the responsible image/change is not isolated. The exact code-level cause remains open.

The rollback restored the previous environment and routing configuration. Additive database migrations were retained; all 31 were already applied before this release, and no migration ran during deployment. Production provider configuration and provider counts remain unchanged. New provider recipes in code were not enabled by this release.

The release also had acceptance gaps that allowed the observed failure to go undetected: no postdeployment playback decode/start check, no postdeployment browser matrix, and no full workspace test-suite rerun. Physical Android and Safari/iPhone, the brother-PC reproduction, field/controlled load percentiles, full decoded-provider coverage, and complete recurring-cost evidence also remain unverified. These are open checks, not additional confirmed regressions.

## Remaining acceptance

Physical Android and Safari/iPhone checks, the reported brother-PC reproduction, field-performance percentiles, complete recurring-cost evidence and release-wide decoded-provider coverage remain open. No full playback promotion or million-member capacity claim is made. Existing release gates and rollback procedure remain in [the rebuild runbook](../runbooks/rebuild-migration.md).
