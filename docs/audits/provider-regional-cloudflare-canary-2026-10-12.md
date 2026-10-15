# Regional Cloudflare provider canary — 2026-10-12

## Result

The owner's Windows shim result was reproduced, then compared with the actual `createResolverWorker` implementation, the live Resolver Worker, and isolated placement/relay canaries. Kyren and Recloud have a measured Cloudflare-only delivery candidate: lookup through a Worker with a European placement hint, followed by a separately placed Cloudflare Media Relay. Both decoded One Piece episode 1 at 1080p, sought to 60 seconds, resumed, and loaded provider VTT cues. These are isolated canaries, not changes to production provider routing. Miami's working production path remains unchanged.

## Reference and shim corrections

The owner's `tmp/worker-shim-replay.ts` runs on Windows and uses a hand-copied transport. Its actual deadline is 20 seconds, not the deployed Worker's 15 seconds, and it lacks the deployed 50-subrequest counter. It provides hard-coded canonical metadata. TMDB series 1396 is Breaking Bad; the script supplies Dark metadata for that reference and therefore resolves Dark under the wrong identity. The corrected Dark sample uses [TMDB 70523](https://www.themoviedb.org/tv/70523-dark/cast?language=en-gb). The script also supplies The Matrix's IMDb identifier for its Fight Club metadata; Vidrift's ID-keyed boot does not use that identifier. Production keeps metadata prepared by the API.

Fresh local execution reproduced all five lookup successes and the supplied media-header matrix. Executing the actual Worker factory locally with its 15-second deadline and 50-subrequest cap also produced sources for all five corrected samples. Local process CPU measurements are not Cloudflare CPU measurements and must not be used as evidence of a specific Cloudflare quota failure. Cloudflare documents a [10 ms Free-plan CPU limit and 50 subrequests](https://developers.cloudflare.com/workers/platform/limits/); a generic edge 503 alone does not prove CPU exhaustion.

## Caller and placement comparison

The production Worker returned candidates for Kyren, Recloud, Vidrift and AnimeKai when invoked from Windows. API-container calls to the same production Worker failed. An isolated resolver canary was deployed with `placement.region: "aws:eu-west-3"` and the same compiled adapters. With the hint, API-originated calls returned validated sources for those four providers; KissKH's first `kisskh.do` hop remained 403. Removing only the hint from that same canary reproduced Kyren/Recloud/Vidrift upstream 403s and an AnimeKai edge 503. Restoring the hint restored candidate resolution.

This controlled comparison supports placement-dependent upstream reachability. It does not identify the exact upstream rule or prove fixed public-IP egress. The canary's entry colo was YYZ and its observed `cf-placement` request header was absent; neither field is evidence of the execution colo. [Cloudflare's placement documentation](https://developers.cloudflare.com/workers/configuration/placement/) describes a region hint as selecting a nearby Cloudflare data center, with placement subject to change. No paid plan was activated or CPU/subrequest bounds increased.

## Browser delivery evidence

| Provider | Corrected sample | Evidence | Status |
| --- | --- | --- | --- |
| Kyren | AniList 21, episode 1, SUB | Placed Cloudflare lookup from the real API; separate placed relay; 1440×1080 decode, seek/resume past 63 seconds; 285 VTT cues; latest 8 observed responses all 200 | Tested regional Relay candidate |
| Recloud | AniList 21, episode 1, SUB | Local lookup followed by production-origin Direct playback decoded and sought successfully. A Cloudflare-issued source returned 400 in that browser. Placed lookup plus placed relay then decoded 1440×1080, sought/resumed and loaded captions; a repeat observed 12 responses all 200 and 256 cues | Tested regional Relay candidate; CF-issued Direct is not accepted |
| KissKH | Dark, TMDB 70523, S1E1 | Local actual Worker returned a source; browser loaded its manifest but failed video fragment loading. The Cloudflare lookup's first upstream hop returned 403 | Not accepted for production Direct or Relay |
| Vidrift | Fight Club, TMDB 550 | Placed lookup returned four candidates. A relay master initially returned 200, but child video/audio playlists failed. The latest signed-relay attempt observed `mb.vidrift.net` 429 while forwarding `Origin: https://embed.vidrift.net` | Not accepted; Origin forwarding alone is insufficient |
| AnimeKai | AniList 21, episode 1, SUB | Local and some placed/Windows-originated Cloudflare calls returned a validated source; a later API canary lookup produced an invalid response, so delivery acceptance remains incomplete | No production route accepted |

The browser canary serves only the diagnostic video shell at `https://consumit.online` and uses the real hls.js implementation, CORS, media bytes and decoder. The lookup call runs in the real production API container. Source URLs and signed grants are kept only in temporary private files and are not printed. Media and caption grants expire after two minutes, allow only the reviewed provider/exact host scopes, and use a separate canary secret. Existing production routes and secrets are unchanged.

One earlier Recloud playback/seek sample included a 502 followed by recovery. Subsequent repeats passed with all observed responses 200. Normal seek cancellation produced `ERR_ABORTED` and nonfatal buffering events; it was not counted as an unsuccessful resumed seek. These short samples do not certify whole-title reliability, renewal, every title/audio lane, concurrent viewers, physical Safari, or permanently stable egress.

## Next implementation slice

To connect only accepted routes, add explicit per-provider Resolver and Media Relay origin selection for the reviewed Kyren/Recloud routes, retaining current default Workers for every other provider. Keep API ordering, health, session ownership and output validation authoritative. These two Cloudflare-issued routes need Relay delivery settings; retaining Direct cannot repair the measured CORS/egress failures. Issue caption grants through the same selected relay and preserve normal source/capability expiry and renewal. Calls should go directly to the selected regional Worker rather than adding a forwarding Worker invocation to every media request. Current Admin settings remain live and can disable a route without a Worker redeploy.

Before production activation, run the existing Worker/API security and fallback checks and genuine Watch tests for both providers, including seeking, provider/uploaded captions and renewal, then recheck Miami. Leave KissKH, Vidrift and AnimeKai on their existing failure/fallback behavior until their own complete route passes. Regional placement is a measured compatibility choice, not a promise that every provider or egress-bound link works. OVH remains the control plane only; the Miami lookup exception is unchanged and no OVH video route is enabled.

Temporary Workers `consumit-provider-resolver-placement-canary` and `consumit-media-relay-validation-canary`, their diagnostic secrets and private capability files are removed after the audit. Reproduction harnesses remain in the ignored diagnostic directory; recreating a canary must configure a fresh secret before enabling it. The production provider maps and settings were not changed.
