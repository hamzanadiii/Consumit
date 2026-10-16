# Production provider inventory — 2026-10-12

## Current result

This document preserves the earlier inventory snapshots below. The latest production Watch acceptance is [provider-live-delivery-acceptance-2026-10-12](./provider-live-delivery-acceptance-2026-10-12.md): after Aphrodite was enabled, all 15 currently enabled video Direct/Relay routes passed a decoded-frame, seek, and post-seek-frame check (7 Direct, 8 Relay). Do not use the historical counts below as the current roster.

This inventory is the pre-repair snapshot. A later same-day rollout changes AnimeKai and Rigel from Direct to tested Cloudflare Relay and repairs CookieBakers, AnimeKitsu and Evion. The current configured totals are therefore 22 Direct, 19 Relay and 9 Embed; enabled video Direct/Relay counts move from 16/7 to 14/9. AnimeKitsu's season-3 decode must not be read as season-1 availability: the subsequent wrong-season correction rejects the missing Jujutsu Kaisen season 1. See the [later repair audit](./provider-repairs-2026-10-12.md) for current evidence and limits. The original table below remains the historical sweep.

The subsequent Mirage installation appends one movie Relay row: configured totals become 51 rows (22 Direct, 20 Relay, 9 Embed). A later read-only snapshot records 8 enabled Direct (one audio-only), 7 enabled Relay and 7 enabled Embed rows. These enable counts reflect current live Admin settings, rather than restoration of the earlier sweep. ReAnime Frame and MegaPlay Frame are enabled and their actual source clicks now play the correct Jujutsu Kaisen episode through regional lookup. Mirage is enabled and passes the tested movie route; see the repair audit for delivery limits.

Read the mounted production roster and all saved ProviderOverride settings through a read-only database query. There are 50 configured rows: 24 Direct, 17 Relay and 9 Embed. Of these, 33 rows are enabled: 17 Direct (including one audio-only row), 7 Relay and 9 Embed. No Admin settings, delivery modes, policies or deployments were changed.

The sweep covered all 23 enabled Direct/Relay video rows. LookMovie Relay was classified without an upstream attempt because its active Cloudflare grant policy is absent. Nine other rows decoded and advanced in the first Watch sweep; repeat checks retained seven passing rows. In the repeats, resumed playback must show both advancing playback time and newly decoded frames for more than three seconds after seek settlement. A restored position or automatic intro skip can change the seek landing time; the checks require actual subsequent playback rather than treating a time jump as successful playback.

Passing Direct samples in both sweeps: AnimeParadise (AniList 21, episode 21, SUB), Kazora (AniList 19, episode 1, SUB), StreamVault (movie 550). Passing Cloudflare Relay samples in both sweeps: MegaVid, Anixo and Zoko (AniList 21, episode 1, SUB), WeCollege Miami (movie 550). CookieBakers and Rive Citadel decoded the movie in the first sweep but returned unavailable on the fresh repeat; they are intermittent. Purstream passed older pre-Resolver tests but returned unavailable in this sweep and is not described as currently passing.

These are canonical title/episode samples through the real deployed Watch, not guarantees for every title, audio lane, browser, full-title duration or future upstream availability. The test only pins the requested provider/audio on the real API request; deployed scripts, responses and media remain genuine. If recovery changes to a different provider, the requested provider cannot receive a passing result. Quality preference is 720p; reported dimensions reflect the actual decoder.

## All 50 configured rows

| Provider ID | Delivery setting | Configured title kinds | Role | Current setting | Latest evidence |
| --- | --- | --- | --- | --- | --- |
| vixsrc-it | direct | movie, series | video | removed | Removed in saved settings; not tested |
| vixsrc | direct | movie, series | both | enabled | Current sampled source resolution unavailable |
| aphrodite | direct | movie, series | video | removed | Removed in saved settings; not tested |
| kyren | direct | anime | video | enabled | Current Direct lookup unavailable; regional Relay canary passed but is not live |
| vidzen | direct | movie, series | video | disabled | Disabled in saved settings; not tested |
| lookmovie | direct | movie | video | enabled | Current sampled source resolution unavailable |
| castletv | direct | movie, series | video | removed | Removed in saved settings; not tested |
| animeparadise | direct | anime | video | enabled | Playback and advancing decoded frames after seeking passed in repeat |
| animekai | direct | anime | video | enabled | Current sampled source resolution unavailable |
| animekitsu | direct | anime | video | enabled | Current sampled source resolution unavailable |
| riveapogee | direct | movie, series | audio | enabled | Audio-only; not a main video provider; not tested here |
| recloud | direct | anime | video | enabled | Current Direct lookup unavailable; regional Relay canary passed but is not live |
| evion | direct | series | video | enabled | Current sampled source resolution unavailable |
| megavid | relay | anime | video | enabled | Playback and advancing decoded frames after seeking passed in repeat |
| 9anime | relay | anime | video | enabled | Current sampled source resolution unavailable |
| anixo | relay | anime | video | enabled | Playback and advancing decoded frames after seeking passed in repeat |
| zoko | relay | anime | video | enabled | Playback and advancing decoded frames after seeking passed in repeat |
| aniwave | relay | anime | video | enabled | Current sampled source resolution unavailable |
| bingebangymovies | relay | movie, series | video | removed | Removed in saved settings; not tested |
| stormboron | relay | movie, series | video | disabled | Disabled in saved settings; not tested |
| zeta | relay | movie, series | video | removed | Removed in saved settings; not tested |
| rivenebula | relay | movie, series | video | removed | Removed in saved settings; not tested |
| rivezephyr | relay | movie, series | video | disabled | Disabled in saved settings; not tested |
| wecollege-miami | relay | movie, series | video | enabled | Playback and advancing decoded frames after seeking passed in repeat |
| wecollege-boise | relay | movie, series | video | disabled | Disabled in saved settings; not tested |
| rivecitadel | direct | movie, series | video | enabled | Intermittent: played in first sweep; repeat lookup returned unavailable |
| rigel | direct | movie, series | video | enabled | Current sampled source resolution unavailable |
| vidnest | direct | movie, series | video | disabled | Disabled in saved settings; not tested |
| stigstream | relay | movie, series | video | disabled | Disabled in saved settings; not tested |
| vaplayer | direct | movie, series | video | disabled | Disabled in saved settings; not tested |
| filmu | direct | movie, series | both | disabled | Disabled in saved settings; not tested |
| reanimeframe | embed | anime | video | enabled | Latest mapping lookup failed |
| megaplayframe | embed | anime | video | enabled | Latest mapping lookup failed |
| apiplayerframe | embed | movie, series | video | enabled | Candidate issued; sampled browser verification failed |
| embedapiframe | embed | movie, series | video | enabled | Candidate issued; sampled browser frame refused/520 |
| vsembedframe | embed | movie, series | video | enabled | Candidate dispatch verified earlier; browser playback not verified |
| vidcoreioframe | embed | movie, series | video | enabled | Candidate dispatch verified earlier; browser playback not verified |
| cinesrcframe | embed | movie, series | video | enabled | Candidate dispatch verified earlier; browser playback not verified |
| vidriftframe | embed | movie, series | video | enabled | Candidate dispatch verified earlier; browser playback not verified |
| purstream | direct | movie, series | both | enabled | Current sampled source resolution unavailable |
| vidrift | direct | movie, series | video | enabled | Current sampled source resolution unavailable |
| streamvault | direct | movie, series | video | enabled | Playback and advancing decoded frames after seeking passed in repeat |
| netoda | relay | movie, series | video | disabled | Disabled in saved settings; not tested |
| viduki | relay | movie, series | video | disabled | Disabled in saved settings; not tested |
| fabric | relay | movie, series | video | disabled | Disabled in saved settings; not tested |
| cookiebakers | direct | movie, series | video | enabled | Intermittent: played in first sweep; repeat lookup returned unavailable |
| kazora | direct | anime | video | enabled | Playback and advancing decoded frames after seeking passed in repeat |
| kisskh | direct | movie, series | video | enabled | Current sampled source resolution unavailable |
| lookmovie-relay | relay | movie | video | enabled | No approved Cloudflare media policy; OVH media route remains off |
| vixsrcframe | embed | movie, series | video | enabled | Prior real Watch decode/advancement passed; not retested in this sweep |

## Measured evidence and routing limits

[Regional canary audit](./provider-regional-cloudflare-canary-2026-10-12.md): Kyren/Recloud passed isolated regional Cloudflare Relay checks; those temporary routes were removed and are not part of the current provider menu. Vidrift still failed the complete canary media chain; KissKH and AnimeKai lack an accepted production route.

[Production recovery audit](./cloudflare-media-relay-recovery-2026-10-12.md): Miami uses its approved API lookup exception and Cloudflare video delivery. Every other configured lookup remains on the production Resolver Worker. OVH video remains disabled.

The saved delivery setting alone is not playback proof. A Relay row additionally needs its approved grant policy; an Embed candidate only proves dispatch and requires independent frame playback evidence. The audio-only Rive Apogee row is excluded from main-video results.

Sanitized reports are retained in the ignored diagnostic directory: production-inventory.json, production-inventory-watch-report.json and production-inventory-verified-watch-report.json. They contain statuses and public configuration metadata, not credentials or media grants. The remote read-only helper and temporary roster copy were removed.
