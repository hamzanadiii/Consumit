# Provider matrix

Source: `provider_example/`. Rebuild with `node scripts/audit-providers.mjs`. Full dependency, host, provenance hashes, and missing-import evidence are in [provider-audit.json](./provider-audit.json).

All 26 handoff directories remain excluded from runtime imports. Twenty-three are registered by the example service. Its TypeScript alias supplies `@omss/framework`; the old `providers/registry.ts` and legacy wrappers still contain broken imports. Consumit has separate ports of VixSrc, VidRock, NHD API, VAPlayer, and VidCore Cineplay; activation remains gated. See [PROVIDERS.md](./PROVIDERS.md) for current integration and live diagnostic evidence. No license/provenance grant was supplied for adoption.

Delivery classification reflects explicit source headers/proxy calls, not proven necessity. Resolution Referer alone is not evidence that media requires a relay. No integration currently qualifies as verified direct-compatible. VidFast iframe output is excluded. Other incomplete entries require repair before probes.

Historical “ok/checks” below are undated URL probes, not playback success rates, episode coverage, browser compatibility, or approval. Zero checks means no evidence. Expiry and caller cancellation are missing across the shared contract; VixSrc alone parses explicit token expiry. Language values are claims, not verified tracks.

| Identity | Delivery | Movie/episode support | Formats | Audio evidence | Historical ok/checks | Gaps |
| --- | --- | --- | --- | --- | --- | --- |
| archive | relay-required (declared; unverified) | Unreviewed | Unknown | Unknown | 0/0 | New provider requires manual review. |
| cinehd | relay-required (declared; unverified) | Movie + episode | HLS | Server labels; verify language | 2/29 | HTML/CSRF playlist handshake; dynamic play origin. |
| cuevana | relay-required (declared; unverified) | Movie only; episode method rejects | MP4 | LAT/Spanish | 0/0 | Title search and Streamtape helper; metadata module. |
| insertunit | incomplete | Movie + episode claimed; unsafe fallback | HLS | English/Russian/multi | 0/0 | Evaluates untrusted makePlayer JavaScript; wrong-episode fallback; discards subtitles; embedded TMDB credential must be replaced. |
| mapple | relay-required (declared; unverified) | Unreviewed | Unknown | Unknown | 0/0 | New provider requires manual review. |
| modiplay | relay-required (declared; unverified) | Movie + episode | HLS/MP4 | Original claimed | 0/0 | HTML parsing and second player fetch; SRT/VTT subtitles. |
| netmirror | relay-required (declared; unverified) | Movie + episode | HLS/MP4 | Original claimed | 0/0 | videodownloader.site and net27.cc; metadata lookup; multiple platform APIs. |
| nflix | relay-required (declared; unverified) | Movie + episode | HLS/MP4 | Server labels | 0/30 | nflixmovies.app aggregator; source-specific Referer; 30s request exceeds budget. |
| nhdapi | relay-required (declared; unverified) | Movie + episode | HLS/MP4 | Server labels | 6/50 | nhdapi.com aggregator; dynamic delivery headers; 30s request exceeds budget. |
| nxsha | relay-required (declared; unverified) | Movie + episode | HLS/MP4 | Server labels | 50/155 | Encrypted multi-server API; local 20s abort; ASS requires unsupported conversion. |
| onetouchtv | relay-required (declared; unverified) | Movie + episode | HLS/MP4 | Original claimed | 0/0 | api3.devcorp.me helper; metadata and crypto. |
| perses | relay-required (declared; unverified) | Movie + episode | HLS/MP4 | Upstream labels | 0/0 | streamguide.cfd aggregator; shares upstream with VidCore. |
| rivestream | relay-required (declared; unverified) | Movie + episode | HLS/MP4 | English/French/Hindi/multi | 0/0 | scrapper.rivestream.app; multiple upstreams; nextgencloudfabric overlap with VaPlayer. |
| screenscape | relay-required (declared; unverified) | Unreviewed | Unknown | Unknown | 0/0 | New provider requires manual review. |
| stellar | direct (CORS-open) | Movie + episode | HLS/MP4 | Original claimed | 0/0 | maybeoneday.ch APIs, atlantic.st delivery headers, sub.vdrk.site subtitles. |
| stigstream | relay-required (declared; unverified) | Unreviewed | Unknown | Unknown | 0/0 | New provider requires manual review. |
| vaplayer | relay-required (declared; unverified) | Movie + episode | HLS/MP4 | Original claimed | 0/0 | streamdata.vaplayer.ru, nextgencloudfabric.com; metadata dependency. |
| vidapi | relay-required (declared; unverified) | Unreviewed | Unknown | Unknown | 0/0 | New provider requires manual review. |
| vidcore | relay-required (declared; unverified) | Movie + episode | HLS/MP4 | Upstream labels | 0/0 | Multi-aggregator fanout; embedded key; Perses/streamguide overlap. |
| vidcoreio | relay-required (declared; unverified) | Movie + episode | HLS/MP4 | Original claimed | 0/0 | HTML/crypto POST handshake; not registered by the supplied service. Distinct from vidcore.org. |
| videasy | relay-required (declared; unverified) | Movie + episode | HLS/MP4 | Original claimed | 0/0 | Keep API implementation separate from broken legacy class; enc-dec.app and speedracelight helpers. |
| vidfast | incomplete | Movie + episode claimed | HLS + iframe fallback | Unspecified | 0/0 | Regex HLS extraction; always appends iframe. Embed output excluded; no direct success evidence. |
| vidlink | relay-required (declared; unverified) | Movie + episode | HLS/MP4 | Original claimed | 0/0 | enc-dec.app token helper and full-handshake retry; SRT/VTT. |
| vidlove | relay-required (declared; unverified) | Movie + episode | HLS/MP4 | Original claimed | 0/0 | tungtungtungtungsahur.app helper; player.vidlove.cc delivery Referer. |
| vidnest | relay-required (declared; unverified) | Unreviewed | Unknown | Unknown | 0/0 | New provider requires manual review. |
| vidrock | relay-required (declared; unverified) | Movie + episode | HLS | Upstream language field | 0/0 | Node crypto and encrypted API; duplicate wrapper in vidsrc directory. |
| vidsrc | incomplete | Movie + episode wrappers | Delegated | English request | 0/0 | Legacy wrappers delegate to Videasy/VidRock with broken relative paths; not an independent fallback. |
| vidsrcomss | relay-required (declared; unverified) | Movie + episode | HLS | English claimed | 0/0 | vsembed.ru/cloudnestra HTML chain; not registered by the supplied service. |
| vidstorm | relay-required (declared; unverified) | Movie + episode | HLS/MP4 | Quality mislabeled as language | 0/36 | Node crypto, sub.vdrk.site; probes first bytes using delivery headers. |
| vidvault | relay-required (declared; unverified) | Movie + episode | HLS/MP4 | Original claimed | 0/0 | 25s API request; SRT/VTT output. |
| vixsrc | relay-required (declared; unverified) | Movie + episode | HLS | Manifest audio languages | 0/0 | API -> HTML token -> master playlist. Explicit expiry; consolidate root and nested legacy wrappers. |
| wecollege | relay-required (declared; unverified) | Unreviewed | Unknown | Unknown | 0/0 | New provider requires manual review. |
| zxcstreams | relay-required (declared; unverified) | Movie + episode | HLS/MP4 | Original claimed | 0/0 | Metadata, crypto and rotating zxc hosts; no end-to-end cancellation. |

## Pilot recommendation

Evaluate VixSrc first for its explicit expiry and manifest audio, VidRock second for its small API/crypto boundary, and NHD API third because its supplied artifact contains successful URL probes. This is an evaluation order, not a claim that any provider is stable or permitted. NHD needs a much smaller request budget and upstream correlation mapping. All three require permission, region, provenance, fresh movie/episode probes, codec/CORS checks, and delivery-header experiments before enablement.

Avoid InsertUnit until untrusted script evaluation and wrong-episode fallback are removed. Avoid VidFast unless direct HLS delivery is demonstrated. Do not count VidSrc wrappers as independent providers. Consolidate VixSrc root/nested wrappers into the vixsrc identity and VidRock wrappers into vidrock; keep vidcore.org and vidcore.io distinct but investigate upstream overlap. Retired implementations remain excluded.

## Approval record required before activation

Record permitted media/catalog, license/provenance, authorized countries, resolution hosts, media/CDN hosts, resolution headers versus media headers, expiry source, codec/CORS measurements, upstream group, and an owner. No credentials or signed playback URLs belong in audit artifacts.
