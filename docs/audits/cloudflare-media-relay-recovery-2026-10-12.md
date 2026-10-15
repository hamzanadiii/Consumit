# Cloudflare Media Relay recovery check — 2026-10-12

## Result

The production Media Relay Worker is online and running the current repository implementation as deployment `36bfdc49-0a84-49bf-b032-1dd85ca9186b`, with 16 approved provider policies. Its production-origin `OPTIONS /media/probe` returns 204 with `Access-Control-Allow-Origin: https://consumit.online`; an invalid media grant returns 403. The full Worker test suite passes: 102 tests across three files.

The main production API is healthy at `https://consumit.online/health/ready` (200). The separate `api.consumit.online` hostname returned Cloudflare 1033 during diagnosis, but it is not the configured API origin and the application routes its API under `consumit.online/v1`.

Initial failures occurred before the Media Relay received media:

- A production movie-550 resolve explicitly selecting `wecollege-miami` returns HTTP 503 `PLAYBACK_UNAVAILABLE`. A direct authenticated request to the Resolver Worker for the same provider/title returns HTTP 200 with `ok: false`, `code: unavailable`, and zero sources.
- The authenticated production Media Relay LookMovie resolver returns HTTP 502 `unavailable`; its diagnostic header identifies `lmscript.xyz/v1/movies:network-error` as the first failed hop.
- The API and Worker Cloudflare media allowlists contain the same 16 provider IDs and omit `lookmovie-relay`. The separate OVH media route is disabled.

This evidence separates Worker health and CORS from source availability. Those initial sampled failures happened during lookup, before a signed media grant existed; changing manifest CORS or the media streaming implementation cannot repair those upstream lookups. Keep LookMovie out of the active API/Worker media policy until its Cloudflare lookup returns a validated source and manifest, segment, seeking, captions, renewal, and real browser playback all pass. Do not restore the OVH media route.

## Recovery deployed

API image `consumit-api:e84060152707-20261012T011431612Z` is live and healthy. The owner explicitly approved API lookup for Miami while keeping video on Cloudflare. `PLAYBACK_RESOLVER_API_PROVIDERS='["wecollege-miami"]'` permits only the original Miami adapter in Relay mode. API ordering, source validation, health, session state and budgets remain authoritative. Miami in Direct mode and all other providers still use the Resolver Worker. No generic OVH lookup fallback or OVH video relay was enabled. The private rollback snapshot is `/opt/consumit/infra/secrets/miami-lookup-backups/20261012T011431437Z`.

Actual deployed Watch canaries pin only the requested provider on the real API request; deployed scripts, responses, controls and media remain genuine:

| Title | API result | Browser playback | Seek and resume | Cloudflare media |
| --- | --- | --- | --- | --- |
| Fight Club, movie 550 | 200, Miami Relay, 720p | 1280×720 | reached 64 seconds after seeking to 60 | 17 responses, all 200 |
| Pulp Fiction, movie 680 | 200, Miami Relay, 720p | 1280×720 | reached 63 seconds after seeking to 60 | 22 responses, all 200 |

An uploaded VTT stayed selected and rendered on Fight Club. Miami's signed first-party control playlist is served under `consumit.online`; its video segments use `consumit-media-relay-production.consumit-project.workers.dev`. These are sampled playback, seek and upload checks, not full-title, renewal or concurrency certification. The earlier isolated browser canary also passed API lookup plus Cloudflare media before authorization.

The Resolver Worker is now deployment `8aac1c9b-c929-4bbd-b610-973be827d766`. Canonical movie/series Embed adapters no longer gate published exact-host iframe paths on a server-side page fetch. Anime frames still require their exact identity/audio mapping. All seven movie/series frame candidates now return live API sessions; that establishes dispatch, not decoded playback. The real Vixsrc Embed Watch sample decoded 1280×720 and advanced. EmbedAPI's sampled upstream frame returned 520/refused to connect; ApiPlayer displayed verification failure. Those failures remain visible and are not marked fixed.

The prior API deployment `e84060152707-20261012T005051047Z` also corrected explicit server retry after an automatic circuit cooldown. A fresh, explicit eligible provider choice can retry while concurrency and request budgets remain enforced; automatic selection retains its cooldown behavior. Its private rollback snapshot is `/opt/consumit/infra/secrets/manual-retry-backups/20261012T005050911Z`.

Validation: 112 API checks across configuration, Worker proxy, resolution, relay, delivery and routes pass; 22 configuration/proxy checks pass again after the final boundary assertion. Embed adapter checks (20), Resolver Worker checks (9), SDK/Worker type checks and changed runtime lint pass. Production configuration, build and HTTPS smoke pass. Existing provider settings were not rewritten.

## Why the previous canary overestimated availability

Authenticated Worker calls from Windows and from the production API did not produce the same upstream results. In paired diagnostics, ApiPlayer's page answered 200 from a Windows-originated Worker invocation but 403 from an API-originated invocation. Miami's Worker seed hop returned 429 when invoked from the production API, while native API lookup returned validated media sources. The experiment proves a caller-dependent lookup result; it does not identify the provider's exact filtering mechanism. Production canaries must originate through the actual API path.

ReAnime's `reanime.to` and MegaPlay's `anikage.cc` identity mapping returned 403, including sampled API-native checks. Removing their final page probe cannot fix missing identity mapping. LookMovie and Vixsrc Direct remain blocked from the tested Cloudflare path.

Zephyr, Storm Boron and Boise were already disabled in the October 10 provider-settings import, before the Resolver switch; later Admin edits preserved those flags. They were not silently enabled during recovery. Zephyr's isolated media sample decoded 4K but failed the seek check, so it remains unverified. Removed providers remain removed.

## Additional Direct route recheck

After the owner confirmed Miami playback, the proposed missing-Worker fix for Kyren, Recloud, KissKH and Vidrift was checked against live production. The Resolver Worker and API origin/secret are already deployed and connected. Read-only database inspection confirms all five requested providers, including AnimeKai, are enabled and configured Direct; their saved overrides change order only. No provider settings or production deployments were changed in this recheck.

| Provider | Canonical sample | Live Worker result from the API container | Real Watch result |
| --- | --- | --- | --- |
| Kyren | One Piece, AniList 21, episode 1, SUB | HTTP 200, `empty`, zero sources | 503 `PLAYBACK_UNAVAILABLE` |
| Recloud | Attack on Titan, AniList 16498, episode 1, SUB | HTTP 200, `unavailable`, zero sources | 503 `PLAYBACK_UNAVAILABLE` |
| KissKH | Inception, TMDB 27205 | HTTP 200, `empty`, zero sources | 503 `PLAYBACK_UNAVAILABLE` |
| Vidrift | Fight Club, TMDB 550 | HTTP 200, `unavailable`, zero sources | 503 `PLAYBACK_UNAVAILABLE` |
| AnimeKai | One Piece, AniList 21, episode 1, SUB | HTTP 503, non-JSON edge response | 503 `PLAYBACK_UNAVAILABLE` |

Watch also returned unavailable for Kyren's Naruto episode 1 and KissKH's Breaking Bad S1E1. These samples prove current source failure, not universal catalogue unavailability or a specific upstream filtering mechanism. `empty` alone cannot distinguish a catalogue miss from an adapter rejecting an unavailable lane; AnimeKai's edge 503 alone does not establish whether CPU, network or another Worker limit caused it.

The historical isolated Cloudflare lookup emitted Recloud and Vidrift candidates, but the corresponding production-origin browser report failed media: Recloud's issued manifest returned 400/non-HLS; Vidrift's returned Orion lanes failed before a decoded frame. Thus normal-network lookup success is not proof of Direct delivery compatibility. Vidrift's adapter already supplies its provider Origin hint and the Media Relay supports Origin grants, but a new policy still requires a working lookup, approved exact graph hosts and a successful real browser relay check. No unverified policy was activated.

The proposed same-OVH AnimeKai video route conflicts with the owner's active Cloudflare-only media decision. It remains disabled; the Miami exception permits API lookup only and does not authorize OVH video for another provider. A future Cloudflare AnimeKai relay still needs compatible lookup/delivery egress and browser evidence. Separate Worker deployments do not guarantee that compatibility.

### Owner-supplied shim evidence

The owner subsequently supplied a fresh comparison reporting one source each for Kyren, Recloud, KissKH and AnimeKai, and four for Vidrift. Reported media reads show Kyren 200 without ACAO, Recloud/KissKH 206 with ACAO `*`, Vidrift 403 without or with the production Origin but a 200 playlist with `Origin: https://embed.vidrift.net`, and AnimeKai 200 with ACAO `*` on the issuing egress. This supports separate lookup and delivery requirements: Kyren needs a browser-readable media path for the sampled missing-CORS resource; Vidrift requires its recorded provider Origin on the gated graph; Recloud and KissKH are Direct candidates; AnimeKai requires an egress-compatible delivery path.

The shim location, implementation, title/episode and exact graph coverage were not supplied with that table. These reported results are not yet reproduced through the production Cloudflare lookup path. A 200/206 media response and ACAO alone do not establish valid playlists, matching segments/keys/maps, browser codec support or seek success. Keep the reported evidence separate from the preceding real API/Watch failures until the same source and runtime can be compared. The Vidrift adapter's misleading comments claiming any nonempty Origin passes are corrected; its existing recorded Origin and runtime behavior are unchanged. No new production policy is enabled by this evidence alone.

The owner then identified `tmp/worker-shim-replay.ts` on Windows and supplied its references. The [regional Cloudflare canary audit](./provider-regional-cloudflare-canary-2026-10-12.md) supersedes that missing-detail status: the local result was reproduced, a canonical Dark identity mismatch was corrected, and a controlled placement comparison found an API-originated Cloudflare lookup path. Kyren and Recloud passed isolated regional Cloudflare relay playback, seeking and caption checks; production routing remains unchanged. KissKH, Vidrift and AnimeKai have not passed complete delivery acceptance.

## Reproduction checks

From PowerShell, check the actual API origin and relay CORS boundary:

```powershell
curl.exe -i https://consumit.online/health/ready
curl.exe -i -X OPTIONS https://consumit-media-relay-production.consumit-project.workers.dev/media/probe -H "Origin: https://consumit.online"
```

The production Worker probe used the existing API relay secret inside the API container; no credentials or signed media URLs were printed. It posted a movie-550 canonical reference to `/v1/lookmovie/resolve` and retained only the status, result code, and diagnostic host/hop. The API's authenticated playback canary selected `wecollege-miami` for movie 550 and returned the structured `PLAYBACK_UNAVAILABLE` response.
