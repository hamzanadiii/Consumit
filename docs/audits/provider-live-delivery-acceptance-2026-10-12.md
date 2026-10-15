# Production Direct and Relay acceptance — 2026-10-12

## Live result

At 2026-10-12 15:54 UTC, all 15 enabled video routes completed the production Watch flow, produced a decoded frame, sought to about 63 seconds, and continued decoding. This is one real title/sample per enabled provider, not a guarantee for every catalog item or future upstream state.

| Provider | Production delivery | Sample | Decoded size | Relay Worker requests observed |
| --- | --- | --- | ---: | ---: |
| Aphrodite | Cloudflare Relay (Europe) | Fight Club, TMDB 550 | 1920×1080 | 60 |
| AnimeKai | Cloudflare Relay (Europe) | One Piece, AniList 21 E1 | 1280×720 | 19 |
| AnimeParadise | Direct | AniList 21 E21 | 1440×1080 | 0 |
| AnimeKitsu | Direct | AniList 172463 E1 | 1280×720 | 0 |
| Evion | Direct | TMDB 1399 S1E1 | 1280×720 | 0 |
| Megavid | Cloudflare Relay | AniList 21 E1 | 1440×1080 | 32 |
| Anixo | Cloudflare Relay | AniList 21 E1 | 1440×1080 | 36 |
| Zoko | Cloudflare Relay | AniList 21 E1 | 1440×1080 | 41 |
| WeCollege Miami | Cloudflare Relay | Fight Club, TMDB 550 | 1280×720 | 17 |
| RiveCitadel | Direct | Fight Club, TMDB 550 | 852×480 | 0 |
| Purstream | Direct | Fight Club, TMDB 550 | 1282×534 | 0 |
| Rigel | Cloudflare Relay (Europe) | Fight Club, TMDB 550 | 1280×534 | 23 |
| CookieBakers | Direct | Fight Club, TMDB 550 | 1280×720 | 0 |
| Kazora | Direct | AniList 19 E1 | 720×540 | 0 |
| RiveMirage | Cloudflare Relay (Europe) | Fight Club, TMDB 550 | 1280×720 | 33 |

Direct sources and their segments went from the browser to the provider; those routes made no Media Relay Worker requests. Relay counts above are the requests observed during each short startup/seek/resume canary. They are not a full-title or per-user monthly average.

## Which Relay routes can be Direct?

I took a fresh source for each enabled Relay provider and tested its media chain from a Chrome page on `https://consumit.online`, with browser CORS and Origin behavior. None of the eight cleared a complete playable Direct chain, so no route was switched to Direct. This is the measured result for the chosen sample at this time.

| Provider | Direct probe result | Recommendation |
| --- | --- | --- |
| Aphrodite | Browser could not fetch the raw HLS source; the API adapter's Atlantic Referer is required. Default Media Worker returned 403; Europe relay returned 200 for master and segment and the Watch page passed at 1080p. | Keep Relay on Europe. |
| AnimeKai | Raw source failed in the browser; the Europe relay passed the production Watch sample. | Keep Relay on Europe. |
| Megavid | Raw browser response was `image/jpeg`, not playable media. | Keep Relay; investigate alternate source selection only if seeking a Direct route is worth a fresh provider-specific canary. |
| Anixo | Root and child manifests returned with CORS, but the next response was `image/png`, not a media segment. Relayed playback passed. | Keep Relay; source graph needs an adapter fix before reconsidering Direct. |
| Zoko | Browser request returned 403 HTML without CORS. | Keep Relay; browser cannot supply the required provider context. |
| Rigel | Browser request returned 403 JSON without CORS. Its approved Cloudflare path also handles the large/control playlist separately. | Keep Relay. |
| WeCollege Miami | Browser request returned 403 HTML without CORS. Its configured lookup remains the single explicit API lookup exception; media is Cloudflare Relay. | Keep Relay. |
| RiveMirage | The isolated raw-source probe returned no source for this diagnostic invocation; the actual production Relay route passed. This does not prove Direct availability. | Keep Relay; do not claim Direct until a matching direct source can be captured and tested. |

The current enabled Direct routes are AnimeParadise, AnimeKitsu, Evion, RiveCitadel, Purstream, CookieBakers and Kazora. Citadel's earlier API source rejection was fixed by adding only the two hosts actually returned by the provider (`img1.hloncm.com`, `img1.klnwm.com`). CookieBakers, AnimeKitsu and Evion passed fresh browser playback in this run.

## Fixability of known disabled routes

The live run above covers every enabled video Direct/Relay route. Disabled, removed, audio-only and Embed rows are not represented as passes.

- **Kyren and Recloud:** the 2026-10-12 regional canary produced full 1080p Relay playback, seek/resume and captions. Their current production rows are disabled; Recloud's Cloudflare-issued Direct link failed in the browser, and Kyren media lacked browser CORS. These are realistic Relay candidates after refreshing the route canary and checking current Free-plan CPU use.
- **LookMovie:** lookup can work, but rotating media hosts and browser delivery fail. It needs a bounded host-discovery recipe and a complete same-egress-compatible relay canary before activation. No OVH media route is approved.
- **Vixsrc:** upstream returned a challenge/403 during lookup from the tested OVH and Cloudflare paths. Adapter changes cannot remove an upstream egress/IP block. Leave unavailable or Embed until a permitted egress works.
- **KissKH:** the upstream's first lookup hop returned 403 in the regional test; no Direct or Relay route passed.
- **Vidrift:** its host is origin-gated and a relayed child request returned 429 even when the provider Origin was forwarded. The full graph remains unaccepted.
- **Vidzen:** its documented loopback-origin hotlink rule rejects the production context. A Relay implementation can carry approved headers, but it still needs a new complete upstream and browser canary.
- Other disabled/removed providers (including FilmU, StreamVault, VidNest, Netoda, Viduki and Fabric) were not tested in this live run. Their saved mode is configuration, not proof of current availability.

## Aphrodite production change

Aphrodite is now enabled from the existing Consumit adapter that matches the PROVE integration. It resolves through the default Cloudflare Resolver, then uses the Europe Cloudflare Media Relay through the existing per-provider route map. The private production row adds only the tested hosts `stream.hls.lol` and `iad-01.transcode.cfd` to its prior approved hosts; the static Relay policy is exactly `stream.hls.lol`, `iad-01.transcode.cfd`, and `totallyacdn.org`. The relay preserves the adapter's `https://atlantic.st/` Referer across that graph. No API lookup exception or OVH media route was added. The production API became ready after the provider settings, private roster and relay route were applied.

The production Media Worker policy was deployed as version `699a4791-98dc-4dae-b72b-efe8e960872d`; the Europe policy was deployed as version `41f58673-ee34-4065-a386-c1efd9599329`. The production Watch check used Fight Club (TMDB 550): 1080p decoded, seek completed, frames advanced after seek, and all 60 sampled Europe Relay requests returned 200. Production config backups remain on the VPS under `/opt/consumit/infra/secrets/` with root-restricted permissions.

## Cost at 100,000 monthly viewers

“100,000 users” is not enough by itself to produce a bill: the key drivers are monthly watch sessions, what share uses Relay, and actual HLS segment cadence. The estimate below assumes **100,000 viewers each watch one two-hour title per month**, 1.2 Resolver attempts per title (120,000 incoming Resolver requests), 1,200–2,400 Media Relay requests per two-hour relayed title, and the standard Workers Paid usage model. The request range represents roughly 6-second segments, one or two media tracks, and playlist/key/map requests; measure a full watch session before treating it as a forecast.

Cloudflare currently lists Workers Paid at a $5/month account minimum, 10 million incoming requests and 30 million CPU milliseconds included monthly, then $0.30 per additional million requests and $0.02 per additional million CPU milliseconds. Worker subrequests are not billed separately, and standard Workers pricing lists no data-transfer/egress fee. These totals assume the account's other Workers consume none of the included allowance; existing account usage reduces the remaining allowance. See [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

| Share of 100k viewers using Relay | Total Worker requests/month, including 120k lookups | Estimated monthly Workers total at 1–5 ms CPU/request |
| ---: | ---: | ---: |
| 10% | 12.12–24.12 million | **about $5.64–$11.05** |
| 25% | 30.12–60.12 million | **about $11.04–$25.45** |
| 100% | 120.12–240.12 million | **about $39.84–$97.45** |

At 10 ms CPU/request, the same scenarios are about $7.46–$13.46, $16.46–$31.46 and $61.46–$121.46 respectively. Actual CPU has not yet been measured over a month; use Worker billing/observability after rollout to replace this sensitivity range. Resolver calls are a small part of these totals; relayed manifests, segments, keys and maps dominate. Direct playback skips those Media Worker requests. If all 100,000 members only have accounts and, for example, 10,000 watch one title each, divide the session-driven portion by ten.

The Free plan allows 100,000 Worker requests per day, shared across Workers in the account. Even 10,000 relayed two-hour sessions per month imply about 400,000–800,000 Relay calls/day when spread evenly, above that limit; the Paid estimate is the practical basis for that scenario. This estimate excludes the existing OVH API/database costs, domain/zone charges, and any separately billed Cloudflare products. The request/CPU amounts are usage estimates, not a guarantee that every upstream remains reachable.

## Reproduction artifacts

The redacted result table is from `local/production-playback/live-all-direct-relay-final-2026-10-12.json`; the raw Direct browser comparison is `local/production-playback/relay-direct-browser-report.json`. The direct-source candidate file contains short-lived signed URLs and is kept only in the ignored local diagnostic directory; remove it after review. Test titles are representative samples, not broad catalog coverage.
