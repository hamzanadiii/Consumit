# Direct provider audit — 2026-10-01

The audit covered all 62 configured rows, including disabled rows, using two title sets and focused repair/recheck passes in Windows Chrome from http://localhost:8080. Nine rows remain and 53 are removed from the active configuration. Each retained row produced an actual decoded first frame on at least one sampled title; VixSrc's Italian row remains disabled by default. CastleTV is enabled after its CDN configuration repair. The example config contains the same nine rows, disabled until configured for a deployment.

Lookmovie's narrow CDN pattern now covers srv-numbered hosts on superoled.site. CastleTV explicitly allows img1.hlnom.com and img1.klnwm.com. Both changed from rejected sources to browser-direct first frames. NineAnime's configured/runtime ID mismatch is repaired, but its unsuccessful delivery checks still remove its configured row. DNS waiting now cancels promptly, concurrent lookups coalesce, and validated public IPs are reused for a bounded 60 seconds and pinned to sockets. A failed DNS lookup is not proof that an upstream is permanently dead.

The playback path, source schema, resolver, failure contract, admin settings, metrics, environment examples, and deployment workspaces now support direct media only. The media Worker, grant minting, Worker health checks, obsolete embed relay routes, and relay-share alerts are deleted. Browser header gates fall back immediately. Existing progress, captions, history, operator limits, ordering, and deletion audit records remain independent of sources.

Samples use TMDB movies 550/272, series 1399/1396 season 1 episode 1, and configured anime fixtures or AniList 7785 episode 1. AnimeKai passed AniList 7785 episode 1. A pass proves startup for that sample and browser; it does not certify every title, region, codec, Safari, or a full-episode soak. Misses on a different title remain visible in the record. Removed rows include unavailable, invalid, relay-wrapped, browser-failing, and inconsistent sources rather than permanent-death claims.

After deployment, guest sessions through the running gateway also returned direct sources and decoded first frames for movie 550 through VixSrc and anime 7785 episode 1 through Kyren. Kyren's earlier catalog miss was transient. The deployed roster applies existing Admin overrides: the movie list exposed VixSrc and Lookmovie; the anime list exposed AnimeParadise, Kyren, AnimeKai, and AnimeKitsu. Retaining a row in configuration does not override an operator's saved disabled choice.

Workspace lint and type checks passed, as did all 967 suite tests. Three additional stored-session regression cases passed after closing the legacy relay-session return path. Four Chrome fixture scenarios passed for direct HLS, captions, source fallback, unchanged-URL renewal, repeated renewal, and paused position. A deterministic 1440px desktop review covered provider rows, six settings columns, absence of retired delivery UI, empty search, delete cancellation, and failed refresh with retained data. Optimized API and web builds passed. Full-episode, regional, and Safari playback remain unverified.

Run the diagnostic against the current direct roster with Node 24 and the local app running:

`node --env-file=.env --experimental-transform-types scripts/diagnose-providers.ts --out=tmp/provider-diagnostics.json`

Use `--alternate` for the second set and `--ids=provider-a,provider-b` for a focused recheck. The diagnostic tries up to four validated renditions per kind for a bounded first-frame check. It never stores media URLs, headers, credentials, or raw provider responses. Detailed sanitized evidence is in [the JSON record](./provider-direct-playback-2026-10-01.json).

| Provider row | Decision | Direct first-frame evidence | Other observed outcomes |
|---|---|---|---|
| vixsrc-it | Keep | movie, series | Passed sampled checks |
| vixsrc | Keep | movie, series | Passed sampled checks |
| nhdapi | Removed from roster | None in these checks | unavailable |
| mapple | Removed from roster | None in these checks | unavailable |
| vaplayer | Removed from roster | None in these checks | hls-networkError,hls-networkError,hls-networkError; unavailable |
| wecollege-phoenix | Removed from roster | None in these checks | empty; unavailable |
| wecollege-miami | Removed from roster | None in these checks | empty; unavailable |
| wecollege-seattle | Removed from roster | None in these checks | empty; unavailable |
| wecollege-portland | Removed from roster | None in these checks | unavailable |
| wecollege-paris | Removed from roster | None in these checks | unavailable |
| wecollege-boise | Removed from roster | None in these checks | unavailable |
| wecollege-atlanta | Removed from roster | None in these checks | unavailable |
| wecollege | Removed from roster | movie | unavailable |
| wecollege-austin | Removed from roster | None in these checks | unavailable |
| wecollege-berlin | Removed from roster | None in these checks | unavailable |
| wecollege-tampa | Removed from roster | None in these checks | unavailable |
| perses | Removed from roster | None in these checks | unavailable |
| rivestream-citadel | Removed from roster | None in these checks | no-validated-sources; empty |
| riveapex | Removed from roster | None in these checks | hls-networkError; empty |
| rivevanguard | Removed from roster | None in these checks | no-validated-sources; empty |
| riveaura | Removed from roster | None in these checks | no-validated-sources; empty |
| rivestream | Removed from roster | None in these checks | hls-networkError; empty |
| riveapogee | Removed from roster | movie | empty; hls-networkError |
| riverigel | Removed from roster | None in these checks | relay-source; empty |
| riveapollo | Removed from roster | None in these checks | malformed; unavailable |
| rivecitadel | Removed from roster | None in these checks | no-validated-sources; empty |
| catflix | Removed from roster | None in these checks | no-validated-sources; hls-networkError |
| poseidon | Removed from roster | None in these checks | empty |
| aphrodite | Keep | movie, series | unavailable; empty |
| vidapi | Removed from roster | None in these checks | hls-networkError,hls-networkError,hls-networkError; no-validated-sources |
| stellar | Removed from roster | None in these checks | no-validated-sources; unavailable |
| videasy | Removed from roster | None in these checks | empty |
| vidlux | Removed from roster | None in these checks | empty |
| vidrock-nova | Removed from roster | None in these checks | hls-networkError; empty |
| vidsrc | Removed from roster | None in these checks | malformed |
| modiplay | Removed from roster | None in these checks | unavailable |
| cinehd-hindi | Removed from roster | None in these checks | unavailable; no-validated-sources |
| cinehd-english | Removed from roster | None in these checks | unavailable; no-validated-sources |
| anixo | Removed from roster | None in these checks | hls-networkError,hls-networkError,hls-networkError |
| kyren | Keep | anime | empty |
| anime123 | Removed from roster | None in these checks | unavailable; empty |
| zoko | Removed from roster | None in these checks | no-validated-sources |
| nineanime | Removed from roster | None in these checks | hls-networkError; no-validated-sources |
| anibd | Removed from roster | None in these checks | empty |
| nagare | Removed from roster | None in these checks | empty |
| vidcore | Removed from roster | None in these checks | no-validated-sources; first-frame-timeout |
| vidcore-movy | Removed from roster | None in these checks | no-validated-sources; empty |
| vidsrcbuzz | Removed from roster | None in these checks | timeout; empty; unavailable |
| filmuainary | Removed from roster | None in these checks | empty |
| filmu | Removed from roster | None in these checks | empty |
| vidzen | Removed from roster | None in these checks | malformed |
| stignebula | Removed from roster | None in these checks | unavailable; malformed |
| lookmovie | Keep | movie | no-validated-sources; unavailable |
| castletv | Keep | movie, series | no-validated-sources; empty; unavailable |
| stigorion | Removed from roster | None in these checks | hls-networkError; malformed; first-frame-timeout |
| vidlink | Removed from roster | None in these checks | empty |
| vidstorm | Removed from roster | None in these checks | unavailable |
| nxsha | Removed from roster | None in these checks | no-validated-sources; first-frame-timeout; unavailable |
| animeparadise | Keep | anime | unavailable; empty |
| animekai | Keep | anime | unavailable |
| animekitsu | Keep | anime | unavailable; empty |
| vidnest | Removed from roster | None in these checks | first-frame-timeout,hls-networkError,hls-networkError,hls-networkError; hls-networkError,hls-networkError,hls-networkError,hls-networkError; hls-networkError,hls-networkError,first-frame-timeout; hls-networkError,hls-networkError,hls-networkError |
