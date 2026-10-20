# External-player roster rollout — 2026-10-18

The owner requested removing VidNest, MoviesAPI and VidFast embeds and adding VidCore and VidRift to both localhost and `consumit.online`. This is a configuration rollout through the existing Admin-owned provider settings; no player redesign or application image change was required.

## Applied state

| Embed registration | Effective setting |
| --- | --- |
| `vidnestframe` | Removed, disabled |
| `moviesapiframe` | Removed, disabled |
| `vidfastframe` | Removed, disabled |
| `vidcoreioframe` | Enabled, not removed |
| `vidriftframe` | Enabled, not removed |

Production already contained both requested adapters and reviewed exact frame origins. Their saved Admin overrides disabled them. The rollout updates only those five registrations in each environment's durable provider settings, preserving every other override and each existing movie/series order. Removed entries retain tombstones and saved positions for explicit recovery. Direct registrations with similar names remain unchanged.

Each transaction checks the complete override preimage under a table lock, writes provider-change audit records, advances the configuration revision and records the existing outbox event. Post-commit comparison verifies that no unrelated override changed. The API, combined fallback and playback process refresh from the existing revision mechanism; no container restart, migration, Worker deployment, media-host expansion or cohort change occurred.

## Verification

- Local and public production movie 550 and series 1399 season 1 episode 1 roster requests return 200, include both additions and exclude all three removals.
- All eight exact-provider resolution samples (two environments × two providers × movie/exact episode) return 200 and select the requested iframe provider, with the configured canonical origin and exact movie/episode path.
- Live Chrome Watch server menus confirm VidCore and VidRift in External players and none of the three removed choices. Local lists six external choices; production lists nine. Consumit Server remains a separate group.
- Explicit requests for each removed embed are rejected with `400 BAD_REQUEST` in both environments; no replacement-provider session is silently returned. Both public readiness checks return 200.
- The production combined API fallback and separate playback process each independently return the updated movie roster. The production application images remain on the previously accepted provider-repair releases.
- A REA capture of the actual production Watch page selected VidRift, displayed movie footage inside its provider iframe and recorded successful fragmented-MP4 delivery. Evidence `ev_f8675e1a16d7aa84b6d6cc5fa191165ad0c613d6b79c9a8ab5c8a8894e862361` and the viewed `tmp/external-player-rea-2026-10-18/vidrift-production-playing.png` establish a working browser sample; they do not establish full-duration or all-device playback.
- A production off-host incremental physical backup and pgBackRest archive check completed before the settings write. Private local and VPS preimages retain rollback data at `local/external-player-roster-20261018-local` and `/home/ubuntu/.consumit-external-player-roster-20261018` respectively. Rollback must merge only these five prior entries into the current settings and advance the revision; wholesale replacement could discard later Admin changes.

The sanitized API/menu evidence is retained in `tmp/external-roster-public-proof.json`, `tmp/frame-roster-acceptance.json`, `tmp/frame-roster-session-proof.json` and `tmp/frame-roster-removed-proof.json`; browser captures are `tmp/frame-roster-local.png` and `tmp/frame-roster-production.png`. Provider settings are private runtime configuration and are not copied into this tracked report.

These checks establish deployment, menu and validated-source behavior, not universal decoded playback. The separate [REA investigation](./external-player-rea-2026-10-18.md) records real browser observations, visual/engineering recommendations and provider-specific limits. In particular, VidCore returned a Cloudflare block in its sampled browser run; its enabled menu entry does not establish availability.
