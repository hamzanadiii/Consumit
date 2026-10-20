# Production provider promotion and fleet probe — 2026-10-19

Release: `provider-promotion-20261019-v1`  
Status: promoted and healthy.

## Promoted providers

The production provider roster grew from 71 to 73 rows. The original roster was backed up before the atomic config update; existing provider rows, including VidRock Frame, were preserved. API, combined API fallback and playback reloaded the configuration and remained healthy. No application image or database migration was required. New providers append to the configured order, which is derived from the provider roster and existing Admin overrides.

| Provider | Enabled scope | Delivery | Production acceptance |
| --- | --- | --- | --- |
| Movy | US movies | Direct, video-only | TMDB movie 550 resolved to validated HLS; media returned HTTP 200 with production-origin CORS; Chrome decoded a first frame twice. |
| CineJoy Lisbon | US series | Direct, video-only | TMDB series 1399, S1E1 resolved to validated HLS; media returned HTTP 200 with production-origin CORS; Chrome decoded a first frame twice. |

CineJoy Lisbon's movie 550 probe returned unavailable, so its enabled row is limited to series. Movy's separate-audio capability is not enabled in the operator role; this probe establishes the video path only.

## Other new candidates tested

Candidate tests used the production Cloudflare Resolver with the production site as browser origin. Only the following additional candidates were absent from the previous production roster:

- `kyren-jett` and `kyren-neon`: no source for One Piece episode 1.
- `vidapi`, `moviesapi`, `streamingunity`, `aether`, `cinecat` and `fmfau`: no source for the sampled movie/series routes.
- `vidlink`: source resolution succeeded, but the sampled media was rate-limited and failed the production-origin CORS check.
- CineJoy Lisbon: series passed; movie did not resolve.
- Movy: movie passed.

The failed candidates were left out. These are title-specific samples; the result does not establish that a provider is globally down or available for every title.

## Full enabled-roster probe

After promotion, a bounded production-Resolver sweep covered 72 enabled provider rows and 111 configured media-kind checks. It used one source per route, fetched sample media outside the browser, and did not perform a browser first-frame test for every existing source. Results: 68 checks returned a validated source; 31 media fetches returned HTTP 200; 26 checks returned iframe sources; six additional media fetches failed; one source was blocked by the production-origin CORS check; and 43 checks returned no source. Embed document playback, all-title availability, and source stability are not established by this sweep. The two new rows separately passed the Chrome first-frame check above.

Post-reload API, fallback, playback and worker readiness passed, as did public smoke, private gateway boundaries and both playback-attempt routes. `https://consumit.online/` and `/anime` returned HTTP 200. The production config now contains 73 rows with `movy` enabled for movies and `cinejoylisbon` enabled for series.

## Bee anime server

The configured Miruro adapter returned four One Piece episode 1 servers; none was named Bee, and the sampled media required headers unavailable to browser playback. The only separate Bee integration found was the public MiruroAPI project, whose README says its hosted service is for testing and explicitly excludes commercial use. Its hosted API is also described as potentially paused. It was not wired into Consumit's production path. A provider-owned or otherwise production-authorized Bee endpoint is needed before this can be safely tested and added.
