# Production provider recheck — 2026-10-20

The member reports that many providers fail in production. This recheck follows the 2026-10-20 provider promotion and the `provider-fixes-20261020-v5` API/playback release.

## Shipped resolver correction

The API previously did not request canonical TMDB title metadata for AuroraScreen, MovieNight, and StreamingUnity. Their adapters need canonical names (and, for AuroraScreen, the release year) to search correctly. The resolver now supplies that metadata, and AuroraScreen/MovieNight use it in their documented lookup requests. Both production Resolver Workers were refreshed:

- Default Resolver: `24f7f527-f904-4ab1-b7c2-c28c528d38af`
- Europe Resolver: `2dacac5f-9bb7-4b87-a937-1c6ce5da5880`
- API, API legacy, and playback image: `provider-fixes-20261020-v5`

Provider SDK checks (21), API checks (40), and Resolver Worker checks (10) passed; API, provider SDK, and playback type checks passed. Production containers passed their health checks. This change corrects the request metadata but does not grant access when an upstream rejects production network traffic.

## Live sample results

The bounded public-production matrix checked 31 pinned provider/title combinations and confirmed 17 source plus first-media-prefix successes. The passing samples included WeCollege Miami, CookieBakers, Purstream, FMFAU, VidLink series, MegaVid, AnimeParadise, Kazora, MeguAnime, AnimeKitsu, Anixo, Zoko, and AniClover. This checks source and media response shape; it is not a full-title decode or universal catalog guarantee.

Failures vary by title. VidLink resolved the alternate movie sample after the first movie sample returned no source. Cinecat resolved an alternate series sample after the initial movie sample failed. KoToTV resolved Naruto episode 1 while the One Piece sample returned no source. Direct Resolver checks also returned a valid source for MegaVid and Anixo on the One Piece sample. These rows are not globally broken based on those misses.

The production API container independently requested the documented lookup endpoints for AuroraScreen, MovieNight, and StreamingUnity. Each returned HTTP 403 from the production VPS. Their Resolver Worker requests also failed across the sampled movie and series references. The upstream response bodies were not retained. Since both production egress paths are denied, changing title matching or moving requests between those same paths cannot restore them; no access-control bypass or new proxy was introduced.

Rigel and Aether returned no source for the sampled movie and series on the production Resolver route. The current evidence does not identify a safe production-compatible lookup route for them. Aether has also had title- and edge-specific media 403 results in earlier production checks. Keep these failures visible in operator diagnostics and use working fallback providers; do not treat an enabled roster entry or a healthy HTTP response as playback proof.

## Remaining work

Several enabled providers remain intermittently available or title/episode-specific. Recheck an exact title, season, episode, region, and provider when a member reports a failure; broad catalog-wide guarantees are not supported by this matrix. AuroraScreen, MovieNight, and StreamingUnity need an upstream-supported production route before they can be restored reliably.
