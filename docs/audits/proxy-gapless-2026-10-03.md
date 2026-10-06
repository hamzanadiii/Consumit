# Buffered proxy renewal on movie 522406

The member rejected merely moving the five-minute interruption to thirty minutes: healthy access renewal should remain invisible for the whole movie. The earlier TTL correction remains, but does not solve already-attached HLS fragment capabilities expiring.

## Reproduction

`bun run --cwd packages/ui test src/playback/media-engine-renewal.test.ts` failed with `Expired capability`: the real media-engine attachment seam kept requesting an original segment even though the caller had a fresh matching lease. The minimized case contains one VOD playlist and one expired segment. After the fix it crosses two successive lease generations with exactly one HLS `loadSource`, one attachment and no engine destruction before explicit teardown.

A private Chromium diagnostic also forces a real Worker grant to expire after ninety seconds, preserving its approved source, headers, provider, origin and ownership. Background refresh uses the real owned API session and deployed Worker. On the old optimized web build, renewal succeeds but subsequent media requests still return errors: eight failed media responses, zero fresh asset capabilities. The independently checked expired capability returns 403. [Before evidence](./proxy-gapless-before-2026-10-03.json).

## Change

Watch holds a memoized source with an internal latest-lease getter. Same source identity, provider, media type and delivery can renew without changing that object. Relay renewal starts sixty seconds early. The existing XHR media loader resolves stable old fragment URLs against fresh control documents rather than reloading the engine or seeking the video. The original VOD graph remains canonical, avoiding accumulating per-renewal fragment addresses or corrupting existing HLS metadata.

Matching checks cover the full non-URI playlist layout: duration, media sequence, discontinuity, codec/rendition attributes, encryption IV and byte range. AES-128 bytes already cached by the engine must match the fresh key before renewed segments are accepted. Control reads omit credentials and are capped at twelve seconds, 2 MiB per document, eight documents, depth five, 2,000 references per document and sixty-four key checks. Engine teardown cancels control reads. Incompatible recordings and actual upstream failures use normal recovery. Unsupported/live encryption, native HLS/native files and cast retain their prior paths. Grants are still origin-bound, immutable and expiring; provider/DNS/host policies and Free plan are unchanged.

## Browser evidence

The final optimized web build plays the same real movie 522406 continuously for 150 wall seconds at 2160×1080, decoding 3,611 frames. The diagnostic issues a ninety-second initial capability, then shortens the first real owned API renewal to another ninety seconds; the second owned renewal uses the normal lifetime. The player completes both background renewals, requests current fresh assets and crosses both old capability expiries with zero video reloads, pauses, stalls, media-element errors, media HTTP failures, provider fallbacks or page errors. Capabilities from both expired generations separately return 403. No seek/time skipping is used. [Zephyr boundary evidence](./proxy-gapless-rivezephyr-2026-10-03.json).

This verifies a genuine capability expiry boundary without waiting thirty minutes and tests repeated renewals deterministically. It is not a full-movie endurance measurement or a guarantee against provider/Free quota outages. The diagnostic intercepts only initial source choice and non-media writes/telemetry, retains actual owned refresh, decodes real media and denies fallback to prevent a false pass. No remote media is downloaded into an artifact. Reports omit cookies, grants, upstream URLs and secrets; private temporary diagnostics are removed.

## Automated verification

All 140 UI playback tests and 47 Watch/coordinator tests pass after the AES-128 correction. Seventeen focused engine/lease tests cover matching nested video/audio, repeated renewals, incompatible durations/sequences/IVs/ranges/discontinuities/renditions, changed keys, transient control errors, input bounds, credential omission and cancellation. Watch/coordinator tests cover stable source identity, fresh getter visibility, fallback behavior and renewal lead time. UI type checking, changed-file lint, whitespace checks and the final optimized web build (including web TypeScript) pass. The rebuilt web container is deployed locally; API/Worker/provider registrations and plan remain unchanged.

Storm Boron also crosses a forced ninety-second expiry on movie 522406 through its real first-party control route and Worker assets, with no reloads, pauses, errors, failed media requests or fallbacks. That separate 121-second run decodes 2,802 frames and records one early buffering event while adaptive rendition changes occur; this is not a zero-buffering claim. It does adopt fresh asset capabilities and the expired original is denied. [Boron boundary evidence](./proxy-gapless-stormboron-2026-10-03.json).
