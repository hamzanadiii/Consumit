# Complete application rollout — October 13, 2026

Status: deployed and healthy at [consumit.online](https://consumit.online).

Release `all-20261013T005336654Z` ships the verified workspace differences over the live production source. This includes analytics build wiring, the VidLink ID-encryption request, provider examples and the latest delivery records. It carries forward the previously deployed uploaded-caption persistence, subtitle styling, iOS native fullscreen captions, distinct owner/visitor profiles and Network screen repair. The private provider roster was hash-checked and preserved byte for byte.

## Runtime and recovery

| Component | Active version |
| --- | --- |
| API and SES feedback | `consumit-api:all-20261013T005336654Z` |
| Web | `consumit-web:all-20261013T005336654Z` |
| Gateway | `consumit-gateway:all-20261013T005336654Z` |
| Default Resolver | `f1cdcc03-5c2f-4d88-88e9-5c6044530a7a` |
| Europe Resolver | `3ceb1a61-8c0a-4725-a611-6a793e86a10a` |
| PostgreSQL | Existing image and running container |
| Media Relay Workers | Existing versions; this release changed no relay source |

The default and Europe Resolver binding sets match their pre-release versions, including the enabled regional route and secret bindings. A temporary first upload applied the regional config's stale disabled value; the final release corrected the regional config and the binding comparison passed. No credentials are recorded here.

The verified physical database backup completed before installation. Source, private configuration and previous image references are retained in `/opt/consumit/infra/secrets/full-release-backups/20261013T005313479Z`. PostgreSQL, Valkey, Tunnel and monitoring were not restarted. No schema migration was needed or run.

## Checks

- All seven workspace lint and type checks passed.
- All 1,768 workspace tests passed: API 550, contracts 25, Media Relay 63, provider SDK 364, release worker 18, UI 247 and web 501. All 19 deployment script tests passed.
- Both Resolver Worker dry-run builds passed.
- API, web and gateway images built; API, web, gateway and SES feedback containers report healthy.
- Internal production and public HTTPS smoke checks passed.
- The deployed web bundle contains the uploaded-subtitle row, caption appearance preview, analytics prompt setting and audio settings label.

Browser/API-shim tests cover the iOS native caption-track handoff and synchronized cue timing. A physical iPhone fullscreen session was not part of this rollout. Worker versions, build logs and verification summaries are retained in ignored `local/all-release-20261012/`.

## Analytics banner correction

The production environment lacked `NEXT_PUBLIC_GA_PROMPT`. Compose therefore used its `on` default, so the Allow/Decline banner remained visible even though the local production file specified `off`. The follow-up writes `off` explicitly and builds with the Compose-resolved setting asserted before building.

Active web image: `consumit-web:analytics-off-20261013T010152726Z`. The API container remained unchanged; the previous web image and production environment are preserved at `/opt/consumit/infra/secrets/analytics-backups/analytics-off-20261013T010152726Z`. Internal and public HTTPS smoke checks pass. Fresh live Chromium sessions at 1440×960 and 390×844 returned HTTP 200, found no analytics prompt region or heading after hydration, and reported no page errors.
