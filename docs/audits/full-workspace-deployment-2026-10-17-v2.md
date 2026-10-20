# Full workspace deployment — 2026-10-17 v2

Release: `rebuild-20261017-everything-v2`  
Status: deployed and healthy.

## Release scope and safeguards

The frozen workspace snapshot was built on the production host into immutable API, playback, worker, gateway, migrator and web images. The candidate API readiness check passed before activation. A full physical database backup and pgBackRest archive check passed. The production migration gate found no pending changes, and no migration ran. The existing playback routing canary remains at 1%.

All six application units are active and healthy on the v2 images. The API and combined API fallback share the v2 API image. The database, authentication, playback and queue data stores, monitoring, Cloudflare tunnel and unrelated production services remain in place. The previous image set and original private provider configuration are retained for rollback. The deployment helper's rollback path restores the provider file with runtime-readable ownership and permissions.

## Production provider configuration

The private Anime provider roster was extended from 56 to 60 rows by adding four enabled Direct choices: `meguanime`, `luffytv`, `yumezone` and `banime`. Existing rows and the 56 database provider overrides were preserved. Candidate configuration validation passed, and all provider API services returned healthy after activation. The active private configuration is root-owned, readable by the API runtime group, and its recorded SHA-256 matches the release state.

The production Watch selector lists all 13 Anime providers, including the four additions. A live attempt to play AniList title 16498, episode 1, through each new source fell back to an existing server. The page then played successfully from the fallback source. This is evidence that the new choices are deployed and selectable, but it does not establish that the four sources can independently deliver decoded video from production. The earlier local exact-episode first-frame checks are not production egress acceptance. Keep provider-wide decoded-playback verification open.

## Runtime and data verification

- API, combined API fallback, playback, worker, gateway and web containers are healthy on their v2 images.
- Public HTTPS smoke and private gateway boundary checks passed; Watch routes and both playback-attempt routes responded as expected.
- The movie 550 production Watch page loaded video; after starting playback, current time advanced from 2:01 to 2:04.
- Attack on Titan, AniList 16498 episode 1, played and advanced from an existing source after the new-source attempts fell back.
- Database aggregate counts matched the predeployment snapshot: 21 members, 105 playback-progress rows, 1 watch-history row, 33 saved titles and 56 provider overrides.
- No database migration ran. Full backup and archive verification passed before activation.
- The temporary private candidate checkpoint was removed after verification.

The Watch checks demonstrate playback for these observed sessions only. They do not certify every provider, title, episode, browser or physical device. Android/iPhone acceptance, release-wide decoded-provider coverage, field-performance percentiles and complete recurring-cost evidence remain open. No broad provider availability or capacity claim is made.

## Release image IDs

| Unit | Image | Image ID |
| --- | --- | --- |
| API and combined fallback | `consumit-api:rebuild-20261017-everything-v2` | `sha256:dbc753080d2d1a1f9d1a6ab705524814cca94592aee1a4f57f18c54f6b6fc1d7` |
| Playback | `consumit-playback:rebuild-20261017-everything-v2` | `sha256:d0de7b3cd9dcb82bdb3d033f3f36bfbf0931fd52d445021770e7054f2d1e880a` |
| General worker | `consumit-worker:rebuild-20261017-everything-v2` | `sha256:ef4262e6636bfdd1655ed9b4f14ad35eaef10471ff9dd4a163e87532e89dd956` |
| Gateway | `consumit-gateway-rebuild:rebuild-20261017-everything-v2` | `sha256:83ead32539591aefedecedf20578531fcc67f19540ff7da1a2759856d77430ec` |
| Migrator | `consumit-migrate:rebuild-20261017-everything-v2` | `sha256:87ed36d977d2d8e2355ce2624c8263e30ec73ed86990ab268e2d0b4d61e3804e` |
| Web | `consumit-web:rebuild-20261017-everything-v2` | `sha256:c865c1548fd07271ce5f7224e4fc8e5bfb68c3cac2d92e4c9a3f04779d927d29` |

The earlier `rebuild-20261017-everything-v1` rollback and its incident record remain in [the first deployment audit](./full-workspace-deployment-2026-10-17.md). V2 used a new release identity after confirming v1 was fully rolled back.
