# Provider reliability and Mapple 4K — 2026-10-24

## Scope and reproduced failures

Repair the screenshot providers without changing the Consumit Player layout, member progress, saved provider order, or media host approvals. Existing unrelated workspace changes were excluded from deployment: images were built from the previous production source plus reviewed playback changes.

The first movie sweep passed CookieBakers and NontonFlix, failed lookup for VidBolt/StreamVault/WeCollege, and resolved Mapple/LookMovie without playable delivery. Raw HLS diagnostics also failed PurStream subtitles, but the existing production VTT loader already handles that provider; a raw HLS run was insufficient evidence of a player defect.

## Repairs

- **Shared media quota:** the persistent node counter reached exactly 8,000,000,000 bytes. Error response bodies were charged against that exhausted quota, causing EOF and Caddy 502 without readable CORS headers. Errors now remain readable, and an already exhausted allowance returns CORS-readable 503 with Retry-After to the UTC rollover. Reservations survive restarts; a transfer that exhausts its allowance after headers were sent can still terminate early.
- **Bounded headroom:** production explicitly sets 64,000,000,000 bytes/day and 6,000,000 bytes/second aggregate (48 Mbps) on the existing VPS. The prior 8 GB reservation was retained. Compose defaults remain 8 GB/day and 12 Mbps; environment overrides are now honored. Active transfers remain 16, memory 256 MB, CPU 0.5; the existing HTTPS daemon and certificates remain unchanged. This is limited relay headroom, not capacity acceptance for many concurrent viewers.
- **Mapple discovery and latency:** add the current public primary `s25` alongside `mapple`, `s10`, and `s2`. Source lanes have independent 6.5-second deadlines and manifest checks have 1.8-second deadlines. A stalled lane no longer consumes the entire outer attempt and discards valid siblings. Proof calculation yields periodically so cancellation and other requests can run. Invalid manifests are discarded rather than returned as unverified Auto sources.
- **Mapple 4K playlists:** the measured 2160p child is 531,099 bytes with 1,392 segments, above the generic 512 KiB bound. Only Mapple gets a 2 MiB manifest allowance; generic limits and manifest reference limits stay unchanged.
- **Mapple segment validation:** approved Mapple hosts mislabel fragmented MP4 as HTML. The relay now verifies MP4 box structure before returning video/mp4; existing TS sync verification remains. Actual HTML and malformed boxes still fail. This applies only to the two existing approved Mapple hosts, without a new proxy, cookie scope, or destination approval.
- **VidBolt fallback:** filter recognized hosts against the configured provider host policy before accepting a lane. A first lane containing only an unapproved host no longer prevents trying an approved later lane. Host policies are not expanded.
- **Optional captions:** a fatal embedded subtitle error disables the failed caption track and resumes valid video/audio once per failed track. It cannot repeatedly restart playback or report healthy video as a fatal provider delivery failure. PurStream's pre-existing full-VTT playlist compatibility remains in use.

## Browser evidence

Checks use Chrome, decoded first frame, and seek/resume through the actual public route unless explicitly labeled as a candidate. They do not establish full-movie, device-wide, regional, or load reliability. Timings below separate API resolution from media startup.

| Provider / sample | Outcome | Resolution | Media first frame |
| --- | --- | --- | --- |
| Mapple / movie 550 / requested 2160 | 3840×2160, seek passed | 4,249 ms | 10,556 ms |
| Mapple / series 1396 S1E1 / requested 2160 | 3840×2160, seek passed | 2,931 ms | 20,553 ms |
| Mapple / movie 550 / default quality | 1920×800, seek passed | 4,062 ms | 4,095 ms |
| VidBolt / movie 550 | 1280×720, seek passed | 836 ms | 1,728 ms |
| VidBolt / series 1396 S1E1 | 1920×1080, seek passed | 443 ms | 1,185 ms |
| PurStream / movie 550 | 1282×534, seek passed | 977 ms | 751 ms |
| PurStream / series 1396 S1E1 | 1280×720, seek passed | 857 ms | 938 ms |
| LookMovie / movie 550 | 1920×800, seek passed | 1,993 ms | 2,576 ms |
| CookieBakers / movie 550 | 1280×720, seek passed | 712 ms | 1,731 ms |

Intermediate Mapple attempts also returned PLAYBACK_UNAVAILABLE; success is not universal. 4K startup is materially slower than ordinary quality. The existing player quality menu uses validated quality siblings; no separate fake 4K provider row was added.

## Remaining failures

- WeCollege Miami still receives native upstream HTTP 403. Earlier default and Europe Cloudflare checks received upstream 429. Adding VPS capacity does not establish an accepted upstream lookup route.
- NontonFlix passed earlier that day, including a 4K movie sample, but the latest public movie and episode lookups returned PLAYBACK_UNAVAILABLE. A direct authenticated call to its dedicated Resolver also returned an unavailable provider result. Its previously accepted route remains intermittent; no current stable repair is claimed.
- CookieBakers movie passes; the episode lookup failed. A later native lookup received upstream 403. No additional retries or host-policy expansion was applied.
- StreamVault native movie lookup returned a validated source at storage2.streamvaultsrc.click and passed decoded frame/seek through public Direct media. The corresponding episode returned no source. The production Cloudflare lookup had failed both samples. After the native route rollout, the public movie check passed at 1920x800 (760 ms resolution, 1,600 ms first frame); the episode remained unavailable. The selected route is native lookup with no automatic edge fallback; it does not make header-locked wrapper sources browser-direct.
- LookMovie remains movie-only. An episode request returns BAD_REQUEST by contract.
- The earlier VixSrc and EmbedMaster upstream blocking findings remain unresolved; this slice does not claim repairs for those providers.

## Checks and release records

Focused checks: 167 provider SDK tests, 49 relay Worker tests, 40 API media-egress/configured-provider tests, 20 player engine/VTT loader tests, and 10 Playback runtime-routing tests. Provider SDK, relay, UI, API and Playback type checks pass. The added tests cover a stalled Mapple lane retaining a valid 4K sibling, configured VidBolt host fallback, oversized Mapple manifests, fragmented MP4 versus HTML, readable quota errors, and subtitle failure recovery.

Production record directories (private, secrets excluded from this audit):

- /home/ubuntu/.consumit-media-headroom-20261024: original quota configuration and unchanged reservation evidence.
- /home/ubuntu/.consumit-provider-reliability-20261024 and .consumit-provider-reliability-rollout-20261024: frozen release source and v1 rollback state.
- /home/ubuntu/.consumit-mapple-mp4-20261024: bounded Mapple MP4 validation release and preceding media environment/image.

Web runs rebuild-20261024-provider-reliability-v1. API, combined fallback, Playback and media run rebuild-20261024-streamvault-native-v3; their rollout preserved the running environments, mount graph, resource ceilings and durable media counter. All recreated control services passed readiness. Final route source and rollback records live at /home/ubuntu/.consumit-streamvault-native-20261024 and /home/ubuntu/.consumit-streamvault-native-rollout-20261024. The one-line route change leaves Mapple delivery identical to the accepted MP4 release. No database migrations or member-state changes are part of this slice. Restore the saved pins and environment using the matching rollout script for rollback; keep the persistent media reservation file intact. Resetting the counter is not a rollback step.

Ignored diagnostic reports include tmp/provider-reliability-public-after-20261024.json, tmp/mapple-4k-public-final-movie-20261024.json, tmp/mapple-4k-public-final-series-20261024.json, tmp/mapple-default-public-after-20261024.json, and tmp/streamvault-native-candidate-20261024.json and tmp/provider-route-final-public-20261024.json. Reports contain statuses, timings, dimensions and public hostnames, never signed media URLs, relay grants, cookies or keys.
