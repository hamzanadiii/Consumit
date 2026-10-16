# PROVE relay integration and Admin playback diagnosis

Correction after owner feedback: [the movie 550 recheck](./relay-movie550-recheck-2026-10-03.md) drives the actual Consumit Player and still observes Free CPU exceptions, WeCollege startup failures, intermittent Zephyr resolution and a Storm seek timeout. The earlier samples below prove only those particular short runs; they do not establish reliable movie playback or a complete CPU fix.

The owner selected direct providers first, then separate relay providers, with embeds and optional matching-stream P2P deferred. Vixsrc stays direct. All twelve requested rows are enabled locally as relay video providers. Reusable example rows stay disabled. Both WeCollege cities are relay-only by explicit owner choice. 9Anime contains only hd-2; its duplicate AniWave route is excluded.

The Worker remains on Free. Latest deployed version: `cab1343c-70ec-436f-9007-19878214131b`. This audit records short samples, not full-title or production reliability. Sanitized evidence is in [the JSON artifact](./prove-relay-providers-2026-10-03.json); signed URLs, tokens, private identifiers and credential values are omitted.

## Fixed causes

- Admin order and operations status previously hardcoded “Direct” for enabled providers. They now read the saved delivery mode. On/Off and mode edits are staged until Save; pending rows explicitly say “Save to apply”. Chromium verified enable/Save, both mode directions, reload persistence and the effective playback roster. Saved changes apply to new attempts; an existing source continues until a new attempt, switch or recovery.
- Provider Scout previously forced direct previews even for installed relay providers. Inspection now prefers the installed, saved registration; otherwise it uses the reviewed candidate recipe. Missing relay approval returns `proxy_unavailable` without substituting Direct or enabling the provider.
- Long VOD playlists generated enough repeated grant encoding work to exceed Free Worker CPU. Wrangler tail reported `exceededCpu` and “Worker exceeded CPU time limit” for Storm variants, Zephyr variants and a WeCollege root. Compact encrypted grant payloads and native base64 encoding reduce that work while preserving URL/provider/origin/header/expiry binding. Old object-format grants remain readable until expiry.
- Storm and Zeta serve MPEG-TS segments with `text/html` content types. The fixed recipe verifies transport sync bytes at offsets 0, 188 and 376 before streaming unchanged bytes as TS. It applies only to Storm’s two reviewed hosts and Zeta’s reviewed media host. Actual HTML and unrelated providers remain rejected.
- TV uses additional exact hosts: Storm Boron resolves `moonfirekeeper.lol`, while WeCollege TV references `emberwave.top`. The previous movie-only policy rejected the Storm source and caused WeCollege’s manifest containment filter to return empty. Both independent API/Worker policies now include these measured TV hosts.

## Provider policies and sampled outcomes

| Provider | Reviewed media hosts | Sample evidence |
| --- | --- | --- |
| Megavid | cdnx.aniwatchtv.site, hls.dramahot.top | Earlier edge root, variant and media returned 200 |
| 9Anime, hd-2 only | megap.shiora.top, hd3x5.stellarfrontier.world | Resolution succeeds; sampled variant failed |
| Anixo | anixo.buzz | Earlier edge root, variant and media returned 200 |
| Zoko | hls.dramahot.top, hls1.drama1.cfd | Edge media 206 after fixed split-host hints |
| AniWave | ru-ri-cdn3.echovideo.to, px.roburnt10.store | Earlier approved chain passed; rotating hosts outside policy remain denied |
| BingeBang YMovies | os.bingebangstream.online, scrapemaster.net | Local relay root/variant 200 and media 206; edge root 403 |
| Storm Boron | celestialdreamer.lol, moonfirekeeper.lol, sub.vdrk.site, cache.vdrk.site | Movie edge chain passes; TV browser decodes and seeks |
| Zeta | remoteconsultinggroup.site, cache.vdrk.site | Local relay chain passes after TS verification; edge root 403 |
| Rive Nebula | nebula.bright67.online | Local relay root/variant 200 and media 206; edge root 502 |
| Rive Zephyr | zcdn.bluevelvet.space | Edge chain and movie browser decoding/seeking pass; resolution remains intermittent |
| WeCollege Miami | moon.zenoak.top, ultramoss.top, emberwave.top | Movie edge media 206; TV browser decodes 2160p and seeks |
| WeCollege Boise | moon.zenoak.top, ultramoss.top, emberwave.top | TV browser decodes 2160p and seeks after fixes; earlier movie samples included both a pass and a timeout |

BingeBang uses a fixed provider/host-scoped manifest decoder and `.m3u8` → `.jpg` fetch mapping; its manifest cap is 1 MiB. Zoko uses fixed public hints only on its reviewed split segment host. Other cross-host hints remain stripped. Destinations and redirects are checked independently; no wildcard or shared-host permission is added.

## Browser evidence after fixes

Authenticated Scout requests now return relay previews for the installed rows. A temporary same-origin Chromium diagnostic used the shipped HLS engine, requested only Worker media, decoded more than 50 frames, and resumed after seeking to 60 seconds:

- Rive Zephyr: TMDB movie 550, decoded 853×480, 12 Worker requests.
- Storm Boron: TMDB series 1399, season 1 episode 1, decoded 640×360, 9 Worker requests.
- WeCollege Miami: the same TV episode, decoded 3840×2160, 6 Worker requests.
- WeCollege Boise: the same TV episode, decoded 3840×2160, 7 Worker requests.

No raw upstream media requests occurred. BingeBang, Nebula and Zeta still fail their edge manifest checks. PROVE’s local server and a local invocation of the same Consumit relay code can deliver their sampled chains. That does not establish compatibility with Cloudflare’s outbound network. Keeping Worker code unchanged while switching local/edge execution reproduces this difference. No challenge bypass or additional paid relay was installed.

## Automated validation and limits

195 focused adapter, configured-provider, Worker, inspection and relay tests pass. Worker and provider SDK TypeScript checks, the focused API TypeScript check and changed-file lint pass. The optimized web build, eight focused Admin UI tests and live Admin Save check passed during integration. Regression tests cover Scout mode selection/approval, HTML-versus-TS validation and old grant compatibility, alongside provider namespace, exact episode, host, transform, range, cancellation and failure boundaries.

The API was recreated with the expanded policies and the Free Worker was redeployed. Browser frames and seeks demonstrate only the sampled paths. Safari/native HLS, full-title soaks and seven-day request/CPU/viewing measurements remain untested. Remaining upstream edge failures still require a compatible upstream or a separately reviewed relay deployment with different outbound networking; they are not resolved by labelling the source Proxy.
