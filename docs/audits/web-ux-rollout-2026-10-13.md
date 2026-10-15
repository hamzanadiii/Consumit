# Web UX rollout — October 13, 2026

Status: deployed and healthy at [consumit.online](https://consumit.online).

## Release

Web image `consumit-web:web-20261013T040120029Z` is active. It applies 27 reviewed source/documentation files over the previous production source. The release includes Home-to-catalog feed continuity, poster-only phone cards, watch/player refinements, and the desktop sidebar label correction.

The previous web image, `consumit-web:analytics-off-20261013T010152726Z`, remains available. The production source preimages, manifest and `.env.production` snapshot are retained at `/opt/consumit/infra/secrets/web-release-backups/web-20261013T040120029Z`.

## Preserved services and settings

The API, gateway, SES feedback, PostgreSQL, provider roster and Worker versions were unchanged. The verified install updated only `CONSUMIT_WEB_RELEASE`; no database migration ran. All production containers report running and healthy where health checks are configured.

## Verification

- Seven workspace lint and type checks passed.
- 1,772 workspace tests and 19 deployment-script checks passed.
- Optimized workspace builds and infrastructure validation passed.
- The web image built successfully and the internal production smoke passed.
- The public HTTPS production smoke passed against `https://consumit.online`.

No physical phone or iPhone session was part of this rollout.
