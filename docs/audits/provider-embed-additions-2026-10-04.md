# Requested provider additions and frame playback

The owner requested ten providers: two Direct, three Relay and five Embed. They are installed and enabled locally, with durable Admin settings and independent exact-host API/Worker approval for the Relay rows. The existing Worker stays on Free. Watch tries Direct, Relay, then Embed; its Server selection can switch between those tiers while retaining the exact canonical title and episode. Public Consumit embed endpoints remain deferred. [ADR 0006](../adr/0006-provider-embed-fallback.md) records the changed playback boundary.

## Live evidence

Native samples use the real local production Watch application, owned playback sessions and provider-switch API, current provider output, and the deployed Worker for Relay. Resolution responses are intercepted only to isolate each chosen real session; progress and playback-event submissions are blocked in the browser diagnostic. Screenshots confirm actual episode imagery rather than an upstream error clip. These short samples establish startup and seeking, not full-title reliability.

| Provider | Delivery / identity | Observed result |
|---|---|---|
| Rive Citadel | Direct; Devil May Cry, TMDB 235930 S1E1 | 1280×720, 102 decoded frames, duration 1800.125 seconds, seek to 60 seconds passed. An obsolete saved IN region excluded the new US configuration; only that row's region was corrected through the audited settings store. |
| Rigel | Direct; same episode | 640×360, 125 decoded frames, duration 1800.083 seconds, seek passed. This is the standalone Movish Rigel recipe, distinct from Rive Rigel. |
| Vidnest | Relay; same episode | 1920×1080, 119 decoded frames, duration 1800.042 seconds, seek passed. Exact p19/p16 TikTok segment hosts were added to both independent policies after validating the provider's HLS graph. Other sampled Vidnest lanes still returned edge 403/502. |
| StigStream | Relay; same episode | Earlier selections returned 503. The final real switch succeeds; 1920×1080, 100 decoded frames, duration 1800.042 seconds, seek passed. The aggregate adapter tries at most six reviewed original-audio lanes and filters source hosts before accepting a lane. |
| VaPlayer | Relay; same episode | Resolves validated HLS. The local upstream root/variants return 200, but the deployed edge returns 403. Browser playback is not established. |
| ReAnime Frame | Embed; One Piece, AniList 21 episode 1, SUB | FlixCloud frame plays: 1440×1080, 109 decoded frames, duration 1477.977 seconds, seek to 60 passed. Its dual-audio language must be chosen inside the player. |
| MegaPlay Frame | Embed; same anime identity | Published Koto SUB frame resolves, but both published player variants reject an iframe sandbox; allowing pop-ups alone also fails. The explicit new-tab link loads a video element without sandbox rejection and with no opener. Separate-tab decoding was not established. |
| APIPlayer Frame | Embed; Devil May Cry S1E1 | Page resolves, but the Chrome sample shows Verification Failed and an upstream challenge request returns 401. No decoded video. |
| EmbedAPI Frame | Embed; same episode | Adapter page check resolves; the browser frame returns upstream 520 and refuses connection. No decoded video. |
| VsEmbed Frame | Embed; same episode | The provider returns 403 with an explicit refusal of sandboxed frames. The separate-tab sample also does not establish playback. |

Frames are not treated as decoded playback simply because their HTML loads. Provider verification screens and sandbox refusals remain visible; Reload, another Server, and an explicit `noopener noreferrer` new-tab link remain available outside the frame. Pop-ups and top navigation stay blocked inside Watch. Consumit cannot observe provider controls without a reviewed event protocol, so frames do not write watch progress, emit viewing events, claim resume, auto-next, cast, or supply native quality/subtitle controls. Existing native checkpoints remain independent of providers.

## Validation and deployment

- 190 playback/Admin/Worker/frame-adapter checks pass across 18 files, including exact identity, cross-tier owned switching, fallback ordering, frame validation and exclusion from relay grants.
- 119 general adapter checks and 19 focused frame/relay/Rive checks pass. Web Watch/Admin/coordinator/events/management checks pass: 66 cases; shared frame recovery adds two passing cases for a slow document, reload, fallback, and truthful loaded-state copy.
- Workspace lint and type checking pass. The final additional shared-frame test file passes lint. The optimized web image builds and is deployed; local API, web and gateway report healthy.
- Desktop and 390-pixel mobile frame captures were inspected. The outside title, Server selector, recovery controls and new-tab action fit without horizontal page overflow; the mobile title has its own row. Frame samples write zero progress and viewing events. App page-error collections are empty. The bundled visual detector exited zero and returned no annotations.
- The deployed Worker uses the updated finite policies. Manifest/variant/first-segment checks pass for the working Vidnest and StigStream paths. No generic rotating-host discovery recipe was introduced for these additions.

Only metadata and outcomes are recorded here. Owner cookies, provider credentials, signed media URLs and relay grants are not included. External availability remains title-, region-, browser- and time-dependent; the unsuccessful samples above are unresolved provider/delivery limitations, not successful integrations inferred from an Admin source list.
