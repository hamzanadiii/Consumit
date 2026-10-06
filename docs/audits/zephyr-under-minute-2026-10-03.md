# Zephyr failure after startup

The owner confirms the screenshot is Admin Browser check and fails in under a minute. It records first-frame decoding, confirmed seeking, two stalls and `Browser failure: media`. This is a different observed stage from a manifest/network failure; the generic label cannot identify its exact segment, codec, append error or relay outcome. Do not attribute this screenshot to CPU exhaustion without correlated request/runtime evidence.

Admin deliberately ends its isolated preview on a fatal player error. It has a separate 60-second normal stop and does not perform Watch's provider waterfall or save member history. Its relay grant is capped at 90 seconds from resolution; this screenshot alone cannot prove expiry, and the owner describes failure before the normal preview stop.

Fresh movie 550 attempts could not reach this media-stage repro. The final isolated Chromium attempt received HTTP 200 from provider inspection with `ok: false`, code `empty` and no media requests; [sanitized evidence](./zephyr-under-minute-2026-10-03.json) is retained. Earlier immediate retries also encountered the intended 20-second inspection conflict guard; those were not classified as provider playback failures. The diagnostic used an expiring Admin session removed after testing, without changing provider settings, relay routing, plan or playback code.

The earlier [local comparison](./relay-movie550-local-comparison-2026-10-03.md) confirms startup and seeking on a sampled Zephyr stream, not continuous playback or this subsequent fatal media failure. The exact under-minute failure remains unisolated until a fresh playable source permits capturing the failing request and decoder detail. No speculative player recovery or relay patch was applied.
