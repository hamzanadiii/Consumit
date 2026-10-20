# Anime provider gap — 2026-10-17

## Findings

The Docker/API picker initially exposed 13 anime rows because the private local roster had 52 total rows. The example roster has 76 rows, including 14 additional anime rows (13 provider adapters plus YumeZone Frame) and two Kyren mirror rows. Production Watch currently exposes 7 Consumit Server providers and 2 external players for Attack on Titan; none of the newly added provider candidates are live.

The 2026-10-17 full-workspace release was rolled back after video failed to start in production. The production provider roster was preserved, and the cause of the playback-start regression remains unisolated. See the [deployment audit](./full-workspace-deployment-2026-10-17.md).

## Local provider checks

The feedback loop was `bun scripts/diagnose-providers.ts` with `providers.example.json` and the local Docker origin. It resolves each provider against AniList 21, episode 1 (or the provider's configured probe) and checks a real browser first frame. Output excludes source URLs and headers.

New direct candidates that passed the sample first-frame check: Meguanime, LuffyTV, YumeZone and Banime. They were added as enabled rows to the ignored local provider roster. The Watch menu now exposes 17 choices, and manually switching to Meguanime produced advancing playback at 0:14.

The other tested new rows did not pass that sample: Miruro returned malformed data; AllAnime, Zenbu and AniDex produced no validated sources; KotoTV returned unavailable; FireAnime and NekoWatch returned empty; JustAnime's manifest failed in the browser; AniClover resolved a relay-style source and needs its production relay path; Kyren Jett and Neon returned empty results. YumeZone Frame was not included in the media-element check and needs a separate external-frame acceptance pass.

The same local diagnostic checked the 13 currently configured anime rows. AnimeKai, AnimeKitsu, AnimeParadise, MegaVid, Anixo, Recloud and Kazora passed first-frame playback. Kyren, 9Anime and AniWave returned empty/unavailable; Zoko resolved a source but failed browser delivery on this run. ReAnime Frame and MegaPlay Frame require separate frame checks; a media-element check is not valid evidence for an iframe provider.

These are title, episode, browser and network samples. They do not guarantee other episodes, audio lanes, production egress or future upstream availability.

## Production status and gates

## Production rollout — 2026-10-17

The stale production Resolver Worker and API image were updated. The production private provider roster now has 70 rows and exposes all 14 Anime rows added in this rollout; the production Attack on Titan Watch server menu showed all 23 current server choices. The API pair returned healthy readiness after restart. The production relay allowlist was expanded with exact observed hosts for AniClover, NekoWatch, JustAnime and AniDex; no wildcard host permissions were added.

Production acceptance was performed on Attack on Titan (AniList 16498), episode 1, in the production browser. Banime produced advancing playback. The existing AnimeParadise fallback also continued advancing after attempts to switch to experimental sources. LuffyTV had previously passed a production first-frame/playback check on One Piece. These checks confirm the adapter and delivery path for those title samples, not every episode or audio lane.

Other providers resolve candidates but do not all have confirmed production playback. JustAnime's playlist was fetched and rewritten by the production relay, while its media CDN returned HTTP 403 for segments, even after forwarding the canonical JustAnime Referer and Origin. AniClover's relay path was observed returning upstream 502 for media. MeguAnime and AniDex were not confirmed playable in production; AniDex was marked degraded on the Attack on Titan menu. Several direct adapters returned empty or unavailable results for this sampled title. These require provider-specific source/egress diagnosis and cannot be represented as working merely because their rows are visible.

The API Resolver Worker was deployed as version `7a838530-f738-43e6-b470-f17f9b05b9ba`; the production media relay is version `ac093174-da08-450b-aade-b825cc155514`. The relay suite passes 65 tests. The API Cloudflare-resolver suite passed 7 tests in the earlier rollout. Production health/readiness returned 200. The full release's separate playback-start regression remains unisolated, so the production update was restricted to the API/provider and relay components.

## Playback follow-up — 2026-10-17

Public Watch requests use `api-legacy`; it had retained a stale `PLAYBACK_RELAY_PROVIDERS` environment value after the host configuration changed. Recreating that active container loaded the full AniDex host policy. On One Piece episode 1, an AniDex relay switch then returned an HLS source and its timeline advanced. This resolves the stale configuration incident for AniDex, though the server health label should be rechecked after fresh health observations.

Live relay logs exposed two additional host changes. JustAnime's playlist referenced `vault-95.rundowncdn.top` while its configured list only allowed `vault-92.rundowncdn.top`; the exact observed host was added to the API and relay allowlists. AniClover referenced `curly-poetry-b4f4.kvofjofh11.workers.dev` while the configured host was `misty-thistle-2c17.kvofjofh103.workers.dev`; the exact observed host was added as well. The production relay is now `aa8eba8c-bff5-43a9-b82d-76a4b093118f`, with the matching API configuration reloaded into the active public container. The immediately repeated One Piece samples still failed upstream: JustAnime media returned HTTP 403 and AniClover media returned HTTP 429. Host authorization alone does not make either upstream source playable from production egress.

The production relay was subsequently deployed as `225a99b1-8e31-467d-b9b3-de14e423adc6` after the JustAnime host update; the later deployment `aa8eba8c-bff5-43a9-b82d-76a4b093118f` includes both exact observed host additions. Public readiness returned 200. Local relay tests pass 42/42, and configured-provider tests pass 28/28. Full provider coverage remains open: empty results and upstream 403/429 responses require provider-specific fixes or a verified alternate server route; they are not counted as working.

## Multi-server adapter rollout — 2026-10-17

The bounded multi-server changes for JustAnime, AniDex, and NekoWatch were built into API image `consumit-api:rebuild-20261017-server-failover-v1` and deployed to the public `api-legacy` service. The previous image remains available for rollback. `https://consumit.online/health/ready` returned 200 and the recreated container reported healthy.

Production Watch inspection showed all 23 configured anime provider rows. Providers with multiple validated choices are surfaced individually in the player's server menu: Anixo has Sora/Cat/Zexy, LuffyTV has anipm/anv/aniwaves, and BAnime has reanime/anikoto. On the sampled Attack on Titan and One Piece episodes, AniDex still returned no compatible source and playback fell back to the existing working server. This deployment delivers the new adapter aggregation but does not establish that all providers work; JustAnime's observed media 403, AniClover's 429, and empty/unavailable provider results remain open upstream-specific failures.

## Resolver metadata and egress follow-up — 2026-10-17

Production Admin inspection uncovered a shared configuration failure: the internal provider-state contract allowed at most 64 overrides while the private roster contained 70. The API rejected its own snapshot, returned 500, and playback repeatedly restarted against invalid state. The limit is now 96; the internal configuration endpoint returned HTTP 200 with revision 48 and all 70 overrides after the hotfix.

The production API image also had stale anime metadata-provider routing, so newly added adapters were called without canonical titles and aliases. The API was rebuilt and deployed to both `api` and `api-legacy` with updated title/alias routing. The resolver Worker was refreshed with version `454890bb-663b-4a3c-a5aa-35411b74852c`. Default and Europe Media Relay policies were updated with exact hosts observed for AnimeKai, AniDex and Aphrodite; no broad wildcard was added. After these changes the production Admin inspection for Attack on Titan (AniList 16498), episode 1 returned three validated AllAnime choices (`repackager.wixmp.com`, `streamsb.net`, and `ok.ru`), plus resolved AnimeKai and MeguAnime choices.

Worker egress still rejected or stalled for a bounded list of anime providers. Those IDs now use the playback service's existing DNS-pinned transport with the same adapters, configured host scope and API validation: Kyren, ReCloud, 9Anime, AniWave, Miruro, AllAnime, KotoTV, YumeZone, Zenbu and FireAnime. This is a lookup-route change only; it does not certify provider media playback. YumeZone's lane calls were also changed from parallel fan-out to sequential requests matching the PROVE recipe. On the sampled One Piece episode, that request-shape change still returned no source.

After rollout, readiness returned `ok`. The live Attack on Titan episode 1 inspection still reported Miruro unavailable, KotoTV timed out, FireAnime and YumeZone empty, and ReCloud/Kyren/Zenbu/9Anime/AniWave unavailable or empty. Provider output is title/episode/audio-specific; the earlier One Piece sample confirms AllAnime and MeguAnime resolution, not broad coverage. These remain open failures. JustAnime's segment 403, AniClover's 429, and AniDex's empty result also remain open. A ready API or resolved manifest is not decoded playback proof, so no all-provider success claim is made.

## Five-provider follow-up — 2026-10-17

The FireAnime Connect-RPC `GetAnime` response wraps the AniList identity and season list in `data`. The old parser validated the envelope as if it were the anime record, applying default values and rejecting every candidate as the wrong title. It now unwraps that field. The exact `voe.sx` hop, its currently observed mirror `megankiddifference.com`, and the provider's 18-character CloudWindow HLS host family are separately scoped; no arbitrary external-host wildcard was added.

KoToTV's `player.kototv.to` watch route now starts at its observed canonical redirect destination, `kototv.to`, so the DNS-pinned transport no longer rejects the host transition. Zenbu direct media fails from the production page origin; its provider example now selects Relay, with a policy limited to the two observed `edge.vidcdn-904.workers.dev` / `edge.vidcache.workers.dev` hosts. MegaVid's fresh direct source decoded in a browser using the production page origin; Anixo still fails Direct there and stays Relay.

The local Docker roster includes FireAnime, KoToTV and Zenbu for operator testing. Its rebuilt API container is healthy. Separately, the workstation-side adapter diagnostic loaded the same local roster and current catalog metadata; all five returned a validated source and decoded a first frame at `http://localhost:8080`. Using `https://consumit.online` as the browser origin, FireAnime, KoToTV and MegaVid decoded Direct, while Anixo and Zenbu Direct did not. The latter two production-origin failures agree with their Relay delivery modes. These are one-title startup samples from workstation-generated sources, not proof of live production API resolution or sustained playback.

## Production deployment — `rebuild-20261017-anime-provider-v1`

The provider and player workspace was deployed to the existing production host. The API, API fallback, playback, worker, gateway and web containers report healthy on the immutable release images; `https://consumit.online/health/ready` returned success. The production playback routing canary remains at 1%. A fresh full PostgreSQL backup and pgBackRest archive check passed before activation, no database migration was pending, and the backend smoke passed public readiness, private-route boundaries and both playback-attempt contracts. Member, progress, history, saved-title and provider-override counts matched before and after activation: `23 / 123 / 2 / 33 / 70`.

The five existing enabled provider rows were preserved. Their production configuration was updated from the reviewed example for delivery mode and exact host scope: FireAnime Direct, KoToTV Direct, Zenbu Relay, Anixo Relay and MegaVid Direct. The original private provider file is retained at `/home/ubuntu/.consumit-anime-provider-20261017-v1/providers.production.before.json` with root-only permissions. This records the deploy state and config correction; a decoded production playback sample for each provider remains unverified.

The production-only Admin provider inspection switch is now explicitly configurable in `compose.rebuild.yaml` and enabled in the private production environment. Both the product API and combined fallback were recreated healthy with `PROVIDER_INSPECT_ENABLED=true`, so authorized Admin users can run source inspection instead of seeing the disabled-deployment message. The switch remains false by default for other deployments.

Release image IDs: API `sha256:648e1dd6788b6b6d97bb6eed203d5302ee3e57ce77af5f75b1baf75f2a7e288a`; playback `sha256:543069d293f8ad50c1a2fac9905868b8338b1d05cb014cd1f037babd199175fc`; worker `sha256:9838311e9a36b93247c930ef9918fb318b8102dc3cde7e050fe2a6fc9840227e`; gateway `sha256:055d4d45453a23659a1c7fa314f8413d18b49eb967af3b7b65846cfc4f8b7189`; web `sha256:89f56ac0a088f62327549bea322475ff5b8eb9d1b964c247a835c60368cdcbca`.

Cloudflare Media Relay was not redeployed in this release. The production Wrangler dry run could not bundle the workspace-linked `@consumit/contracts` package from Windows. The reviewed production relay configuration contains the two exact Zenbu edge hosts, but their active Worker version was not independently verified in this rollout. Do not treat the app release or an enabled Admin row as proof that every upstream is currently returning playable media.
