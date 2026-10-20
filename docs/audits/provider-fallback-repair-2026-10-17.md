# External fallback and provider production repair — 2026-10-17

The member job is selecting external players separately from Consumit Server and recovering working provider playback in production. The owner clarified that “another server” means a separate fallback choice in the menu, rather than another website.

## Shipped changes

- Web `provider-repair-20261017-v2` admits the fifteen reviewed HTTPS frame origins. The previous production policy allowed only self/gstatic and blocked every configured provider frame, reproducing the reported Vixsrc screenshot. Other CSP restrictions and API source validation remain intact. Frames load directly from their provider.
- The native player menu separates Consumit Server from External players; external rows are named and native providers alone are numbered. The external toolbar has separate selectors. Unavailable-state selection retains the same grouping. The live movie menu contained six native and ten external choices, with Vixsrc only in the external group. Desktop and phone captures were checked.
- A provider pin waits for its roster entry before it is consumed. The original race silently skipped an exact provider requested before roster loading finished. External frames retain manual episode/audio navigation. A policy-blocked frame retains an error even when the browser emits iframe load; no load event is treated as video evidence.
- AnimeKai uses native Web Crypto for P-256 signing and AES-GCM decryption, preserving DER ECDSA signatures and the exact challenge. Live Europe Resolver telemetry recorded `exceededCpu`. Comparing deployed configuration also found the computation secret present without `RESOLVER_COMPUTE_ORIGIN`; the existing bounded proof helper URL is now restored. The independent API and Europe Media Worker relay policies now include the already configured exact Frankfurt media host.
- Explicit provider Worker routes now override the default native-lookup exception. A regression test reproduced the ignored override. YumeZone direct and frame resolution use the existing Europe Resolver after their native/default paths failed and their Europe candidates passed playback checks. Their delivery modes, identity and progress ownership remain unchanged.

## Production acceptance

| Route/sample | Observed evidence |
| --- | --- |
| Vixsrc Frame, movie 550 | Real Watch selected `vixsrcframe`, decoded 1280-wide video and advanced past one second; external controls were checked on desktop and phone. The original production CSP reproduction is now green. |
| AnimeKai, AniList 21 episode 1 SUB | Isolated production-caller canary decoded 1280×720, sought to 60 seconds and resumed; five observed relay requests returned 200. The deployed Watch selected `animekai` and advanced past 19 seconds at 1280×720. |
| YumeZone Direct, AniList 21 episode 1 SUB | Europe candidate decoded 1440×1080, sought to 60 seconds and resumed. The isolated candidate backend issued the exact provider session; production Watch selected `yumezone` and advanced video. |
| YumeZone Frame, same episode | Europe frame candidate decoded and advanced 1440-wide video. The candidate backend issued the exact frame session; production Watch selected `yumezoneframe`, decoded its Flixcloud player and advanced past one second with `paused: false`. |
| Existing media routes | Production-issued first-frame samples passed CookieBakers, Rigel, Mirage, Miami series, AnimeParadise, Meguanime, Banime, Kazora, MegaVid, Anixo, Zoko, KoToTV and AnimeDex. Four explicitly selected LuffyTV lanes decoded on recheck. Purstream decoded through the real Consumit Player. |
| Other external samples | Corrected-policy production-origin checks decoded VsEmbed and CineSrc; VidLink decoded a frame but remained paused in that observation. These checks are separate from native progress and completion. |

The first simple HLS probe falsely flagged Purstream because it lacked the shipped player’s VTT-playlist handling. Its actual Watch check decoded normally; that probe failure is not retained as a provider outage. AnimeKitsu returned a valid session for its configured probe, AniList 172463 episode 1; missing One Piece availability does not establish a provider-wide failure.

## Broad audit and remaining limits

An isolated runtime using production configuration and the production API caller checked 40 enabled registrations, including audio-role sources, against their configured sample or the bounded movie/series/anime fallback sample. In that original pass, 29 returned validated sources and 28 produced sessions; source/session results are not decoded-playback evidence. Targeted repairs and rechecks followed that snapshot.

The remaining failed samples were also tested through the isolated Europe Resolver where applicable. LookMovie remained unavailable; AllAnime, AniClover, FireAnime and NekoWatch returned no validated source for the checked sample; Miruro returned malformed output on the Europe path. No new host scope or unproven route was enabled for them. JustAnime returned candidates, but its tested relay lanes failed segment/native delivery. Zenbu resolved from Europe, but its independent relay canary returned 403 at manifest delivery, so its missing API relay approval and existing route were preserved.

EmbedAPI and VidFast explicitly returned `X-Frame-Options: sameorigin`; APIPlayer showed verification failure in the browser check. MoviesAPI and VidNest loaded player documents without decoded-video evidence, and VidAPI’s browser check remained inconclusive. The reload, separate server choices and explicit new-tab action remain available. Provider pages were not proxied and provider frame restrictions were not stripped.

These are exact-title/episode observations, not a guarantee for every provider, catalog item, browser, region or full-duration session. Physical iPhone/Android, sustained playback and field-load acceptance remain open.

## Release, validation and rollback

The backend API/combined fallback and playback images are `provider-repair-20261017-v1`, built from the previously deployed backend source archive with only `runtime.ts` and `animekai.ts` overlaid. The web was built from its deployed source snapshot with the six reviewed UI/policy files overlaid. This avoids shipping unrelated workspace changes. The existing gateway, general worker, provider roster, Admin overrides/order, member records and 1% playback cohort were preserved. No schema migration ran. An existing off-host incremental database backup and pgBackRest archive check passed before the backend patch.

Automated checks passed: 62 focused web tests, five shared player/menu tests, 147 provider SDK tests, 52 Media/Resolver Worker tests and six playback runtime/app tests (272 total). Web, shared UI, provider SDK, playback and API type checks were run; optimized web/API/playback image builds and isolated candidate readiness/exact-source checks passed. Backend changed-source lint passed. Targeted web lint retains one pre-existing `react-hooks/set-state-in-effect` finding at `watch-playback.tsx`’s subtitle sync-notice reset; the same statement exists in the deployed source baseline and was left outside this provider repair. The design detector reported only the existing 11px family-heading advisory.

The ordinary local API type check encountered an existing invalid Windows dependency reparse point under `packages/media-relay/node_modules`. It passed with a temporary compiler path pointing to the same workspace contracts source; the Worker tests/bundles likewise used explicit workspace source aliases. Compiler checking was retained. Public production smoke verifies readiness/cache policy, catalog, security headers and anonymous member-data isolation; decoded playback acceptance is recorded separately above.

Production Worker rollback versions before this repair were Europe Resolver `12ac6677-934d-4743-9dd4-7bfa79df2623` and Europe Media Relay `c2c14aaa-ccc7-4adc-a409-28771bc6af67`. Protected host release records retain prior images/configuration at `/home/ubuntu/.consumit-provider-repair-20261017-v1`, `/home/ubuntu/.consumit-provider-repair-20261017-v2`, `/home/ubuntu/.consumit-animekai-repair-20261017` and `/home/ubuntu/.consumit-provider-backend-repair-20261017-v1`. The final recorded Worker versions and sanitized probe evidence accompany the audit JSON. Temporary canary Workers/checkpoint containers are removed after acceptance; rollback images and private deployment records are retained.
