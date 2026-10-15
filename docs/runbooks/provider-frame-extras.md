# Additional external-player servers

The owner requested all seven options as **additional** frames, preserving their existing Direct servers. Compatible API/playback and both Resolver Workers are deployed. The 2026-10-15 follow-up enables the five new rows (VidAPI, VidFast, MoviesAPI, VidLink and VidNest) within the existing US scope. VidCore/VidRift registrations and all prior Admin restrictions remain intact. The refined web presents one Consumit Server group and separate external choices. See [the deployed refinement record](../audits/interface-refinement-2026-10-15.md).

| Provider | Separate frame recipe | Published player origin | Movie / series path |
| --- | --- | --- | --- |
| VidAPI | `vidapiframe` | `vaplayer.ru` | `/embed/movie/{tmdb}` / `/embed/tv/{tmdb}/{season}/{episode}` |
| VidFast | `vidfastframe` | `vidfast.vc` | `/movie/{tmdb}` / `/tv/{tmdb}/{season}/{episode}` |
| VidCore.io | `vidcoreioframe` | `vidcore.io` | `/movie/{tmdb}` / `/tv/{tmdb}/{season}/{episode}` |
| VidRift | `vidriftframe` | `embed.vidrift.net` | `/embed/movie/{tmdb}` / `/embed/tv/{tmdb}/{season}/{episode}` |
| MoviesAPI | `moviesapiframe` | `moviesapi.to` | `/movie/{tmdb}` / `/tv/{tmdb}/{season}/{episode}` |
| VidLink | `vidlinkframe` | `vidlink.pro` | `/movie/{tmdb}` / `/tv/{tmdb}/{season}/{episode}` |
| VidNest | `vidnestframe` | `vidnest.fun` | `/movie/{tmdb}` / `/tv/{tmdb}/{season}/{episode}` |

The existing frame recipes for VidCore/VidRift and the pending VidFast recipe are reused; four additional recipes cover the others. The frame path does not use MoviesAPI's Direct AES/extractor implementation. These recipes support TMDB movies and exact series episodes. They do not reinterpret AniList IDs or silently select another episode/language.

## Origin evidence

Reviewed on 2026-10-15: [VidAPI documentation](https://vidapi.ru/api) explicitly uses `vaplayer.ru`; [VidFast](https://vidfast.vc/), [MoviesAPI](https://moviesapi.to/), [VidLink](https://vidlink.pro/) and [VidNest](https://vidnest.fun/) publish the paths above. VidCore and VidRift retain their previously implemented canonical frame shapes; the web reader returned no readable VidCore documentation and could not fetch VidRift's homepage during this pass. These are route references, not verified successful playback samples.

VidAPI documents domain allowlisting and CSP restrictions; approve `consumit.online` in its upstream dashboard if required. A provider that rejects the standard sandbox or the embedding origin remains unavailable and retains Reload/another-server/new-tab recovery. No new unsandboxed exception is authorized by these additions.

## Prepare and activate

1. Preserve the active provider file, environment, image pins and durable Admin settings. Use the current off-host backup process before a rollout.
2. Prepare a private proposal: `node scripts/prepare-frame-servers.mjs --input PRIVATE_CURRENT_FILE --output NEW_PRIVATE_PROPOSAL --region US`. Choose the region deliberately; the example is not permission to widen existing serving regions. The helper appends only missing frame IDs, disabled, and preserves existing rows. It rejects conflicting origins, duplicate IDs, an existing output file and a roster above the current 64-row limit. It never writes the active input or prints its contents.
3. Build/deploy compatible API, combined fallback and playback images plus both configured Cloudflare Resolver Worker routes before installing the new row types. Resolver workers import the same configured-provider registry; an old Worker does not understand the new adapter IDs. The Admin web condition also needs the compatible web build. Media Relay workers and paid relay scopes do not change.
4. Review/install only the appended frame rows in the private base configuration, then refresh the applications through the existing deployment process. Preserve existing provider order and overrides. Enable the desired rows through authenticated Admin; existing disable/remove decisions are retained. Do not copy the complete example roster over production.
5. Confirm the extra providers appear in Watch's numbered servers and Manage servers. Personal orders keep their precedence and append unranked eligible servers using the existing default order. Preserve the 1% playback-process canary and its combined fallback during activation.

## Acceptance limits

Check both movie and exact episode resolution on both resolver routes, Admin enable/disable/reset/import boundaries, Ad status Off, malformed output, frame reload/fallback, desktop/touch and actual provider playback before calling a provider working. A returned iframe URL or loaded document is not decoded playback. Keep provider-specific failures and missing languages/resolutions explicit. External audio/subtitles use the provider's controls; Consumit progress synchronization and auto-next remain unavailable under ADR 0006. Existing Direct options retain Consumit's owned controls and progress.

The initial adapter implementation pass recorded build/type/lint evidence only. The subsequent deployed refinement passes 58 relevant web regressions, production builds, desktop/touch UI smoke and 28 authenticated canonical candidate checks across both Resolver routes. Actual decoded provider playback and physical-device checks remain unverified. A valid URL or loaded document must never be reported as successful media playback.
