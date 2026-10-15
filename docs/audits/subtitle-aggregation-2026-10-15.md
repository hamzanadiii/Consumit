# Broader subtitle discovery and recovery — 2026-10-15

## Member job and report

Find and display usable subtitles for the exact movie or episode across browsers, while keeping the current Consumit Player and subtitle menu. The member reports that most browsers show no tracks, sometimes only the streaming provider's English track. The specific failure on the member's brother's PC has not been reproduced. This slice broadens discovery and improves recovery; it does not claim a reproduced or universally fixed browser-specific root cause.

Read-only live baseline discovery for Dune (TMDB 693134) and anime 16498 episode 1 returned many languages. Some providers failed, timed out or required credentials that were not configured. Baseline results establish available samples, not language coverage for every title, episode, region or device.

## Implementation and boundaries

`apps/api/src/subtitles/streaming.ts` bridges the enabled, region-approved non-Embed configured streaming adapters into the existing subtitle fleet, wired by the playback runtime. It retains exact canonical identity and adapter-owned episode mapping. Subtitle-only inspection does not select video, reorder providers, write provider health or mutate member history/progress.

The bridge shares provider admission with playback and allows at most six active streaming inspections. Per-registration query caches are bounded to 64 entries and up to 60 seconds for populated or 10 seconds for empty results, shortened by source expiry with a five-second margin. Declared files and HLS master SUBTITLES renditions pass configured source/host validation. Master inspection examines at most two representations and two levels with a 1.5-second bound and downloads no video bytes. Sensitive headers are stripped when following a different host.

Candidates preserve BCP47 regional language variants and readable provider names. Authority binds relevant provider configuration, enabled/region status and signed-source lifetime. Discovery listings and preparation remove disabled, expired or configuration-stale streaming candidates; stream-derived rows are not reused through the durable subtitle catalog without that authority. Optional metadata/title mapping has an independent 2.5-second bound; its failure leaves ID-based discovery available.

`apps/api/src/subtitles/hls.ts` exports supported finite, unencrypted VOD WebVTT playlists through the existing first-party normalization/file store. Limits are 512 segments, four concurrent file fetches, 5 MiB input, 512 KiB output, a 24-hour timeline and 50,000 cues. Encryption, initialization maps, discontinuities, byte ranges, unsafe references and unsupported unmapped relative segment timing are rejected. Supported timestamp maps handle the VOD clock and MPEG wrap; unsupported timing is not guessed.

The browser validates the existing bounded NDJSON event contract and makes one fallback request to the same GET discovery endpoint with `format=json` after a non-canceled failure. The normal JSON response uses the same validated events. HTTP 429 receives no automatic retry; cancellation owns both requests. Search providers again explicitly refreshes discovery. Generation checks keep late language pages and searches from replacing refreshed results.

The subtitle menu retains Off, language groups, search, Appearance/Sync/Upload and its desktop/mobile geometry. File cue validation prevents unusable selection; load failures show an announced error with Retry this track and permit choosing another track. Partial provider failure keeps known tracks usable. Clock-driven captions and native fallback retain their ownership, as do video sources, watch progress and saved preferences.

## States and validation

Required browser evidence covers populated and empty discovery, partial provider failure, interrupted NDJSON with JSON recovery, rate-limit behavior, explicit refresh, stale page protection, invalid/failed file cues with retry or another-track choice, and visible captions during playback/seeking. Relevant desktop and narrow-player menu presentation must preserve the current visual world. Final browser capture paths and measured results are pending.

API, UI, web and playback type checks passed at the implementation checkpoint. Final lint, optimized builds and independent finish review remain pending. No tests were run for this slice. No deployment, physical-device certification or universal provider/language availability is claimed. The reported brother's PC issue remains unreproduced.

## Documentation and visual authority

Current behavior and boundaries are recorded in PRODUCT.md, ARCHITECTURE.md, COMPONENTS.md and DELIVERY.md. Root DESIGN.md, design tokens and `.impeccable/design.json` are preserved because the existing palette, type, geometry, notices and menu rows already accommodate these states. Prior mobile-player/banner decisions and dated audits retain their scope and evidence. No unrelated visual drift is canonized or repaired.
