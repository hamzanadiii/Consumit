# Verified application release — 2026-10-12

Status: deployed to https://consumit.online.

The verified source snapshot ships uploaded subtitle continuity, consistent member portraits, phone navigation/search/cards/controls, and the current API/provider/relay corrections. It contains 116 source/document/configuration files differing from production. Scratch diagnostics and private local settings were excluded. A later concurrent Analytics release was layered onto the web after this bundle completed; the final active source retains the subtitle, avatar and phone changes.

## Release and retained recovery state

The guarded application release is `e84060152707-20261012T193249986Z`. API, web, gateway and SES feedback were rebuilt and restarted after production compilation and preflight. PostgreSQL, caches, Tunnel and monitoring retained their running containers; no schema migration was necessary or executed. The original private provider roster remains byte-identical. Worker bindings, including provider maps and secret bindings, remain identical to their previous versions.

| Component | Deployed version |
| --- | --- |
| API / SES feedback | `consumit-api:e84060152707-20261012T193249986Z` |
| Web from this release | `consumit-web:e84060152707-20261012T193249986Z` |
| Final observed web after the separate Analytics rollout | `consumit-web:analytics-20261012T193851257Z` |
| Gateway | `consumit-gateway:e84060152707-20261012T193249986Z` |
| Default Resolver | `a1da5aa5-ee19-4b31-8f41-dd90bd674cfd` |
| Europe Resolver | `bc097310-6825-4898-8fe6-bde706891262` |
| Default production Media Relay | `4f1a0a2e-8367-4945-8cf7-34aa0fa3924c` |
| Europe Media Relay | `57ae4296-adbd-4bc1-addf-79e1c22621c8` |

The verified pre-release physical backup is `20261012-193226F`. Private source, configuration and image snapshots are retained at `/opt/consumit/infra/secrets/full-release-backups/20261012T193225838Z`. The frozen source manifest digest is `68cf802b4325872ed93e784c79ba20bd279b7265f748e76a8044b24265b4ba4e`. The preceding application images and all preceding Worker versions remain available.

The first preflight rejected a missing explicit `PLAYBACK_ENABLED` environment value under the stricter deployment validator. The running Compose API already had playback enabled. Source/configuration rollback completed before any live container restart. The successful retry records that same intent explicitly as `PLAYBACK_ENABLED=true`; it preserves all other existing private values except the new release tag. The first rollback snapshot is retained separately at `20261012T192954108Z` for the deployment trace.

Later recovery must account for the separate Analytics web rollout. Do not restore this release's older complete environment over later approved settings. Choose compatible retained service images and preserve the current roster, Worker secret alignment and newer settings; use the named physical backup only if data recovery is actually required.

## Verification

- All seven workspace lint and TypeScript checks passed.
- The full sequential test run passed 1,727 workspace tests: API 550, contracts 25, relay 63, provider SDK 364, release worker 18, shared UI 236 and web 471; all 19 script checks also passed. The first API run encountered two five-second timeouts while lint/types competed for resources; the subsequent complete run passed without changing those tests.
- Production image builds passed API bundling and Next.js compilation, TypeScript and static generation. Deployed application containers report healthy; PostgreSQL remains healthy on its previous image.
- Both gateway-side production smoke and public HTTPS smoke passed readiness/cache behavior, catalog contracts, security headers and anonymous private-route rejection.
- Cloudflare's deployed-version metadata confirms unchanged plain-text and secret bindings for all four Workers. Dry-run compilation preceded deployment. Prior active versions are retained in the ignored deployment evidence.
- Live Direct checks passed Purstream and CookieBakers; live Europe Relay checks passed AnimeKai and Rigel. Each sample decoded, advanced, sought and continued decoding on its requested provider.
- A real Watch check resolved Miami, uploaded VTT, switched to Mirage and uploaded a replacement SRT. The replacement remained selected while playback advanced, showed later cues after forward seeking, exposed the uploaded-file row and appearance preview, and respected Off. The saved Arabic/English language order stayed intact. The final check against the Analytics web image observed 27 successful media responses and decoded 1280×720 with 234 frames recorded. Cue windows cover the actual playback timeline, including the provider's automatic intro skip; the harness lets startup reach playing before pausing through the video element.
- The final phone Home capture at 390×844 exposes the shipped navigation sheet trigger and has no horizontal overflow. Desktop/mobile avatar consistency and distinct visitor/member identities were covered by the pre-release browser/component regressions.

Ignored evidence is retained under `local/full-release/`, including the guarded manifest, source preimages, Worker metadata, live browser report/captures and final service status. Four additional provider playback reports are in `local/production-playback/full-release-providers.json`. These are controlled samples, not full-title, every-provider, physical-device or all-browser certification.
