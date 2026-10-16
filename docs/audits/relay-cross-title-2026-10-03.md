# Cross-title relay correction

The owner reports movie 1032863 still failing after the earlier 1101383 fix. In the running API container, Storm Boron returns nucleardaydream.lol and fails static validation; WeCollege Miami decrypts four valid moon.zenoak.top renditions whose segments use proudhawk.top, then filters them to empty. Neither host was in the earlier per-title policies. This reproduces the reported validation failure before browser delivery.

## Change

Only the three reviewed Boron / Miami / Boise adapter recipes can validate a bounded graph and lease exact public hosts for a session. The adapter registration, API issuer and Worker each opt in independently. Public DNS is pinned in API transport, independently checked at the Worker for nonstatic hosts, and private destinations, credentials, unsupported formats, redirects outside scope, excessive nesting and oversized graphs fail closed. Scope is at most eight hosts, eight playlists and depth three; references are capped at 2,000 per playlist. WeCollege roots retain static approval. No new title-specific hosts were added to global policy.

Initial cross-title playback exposed another Free runtime `exceededCpu` outcome while the edge still compiled long playlists. HLS for these opted-in providers now uses the signed app-origin control route, compiling nested playlists in the API and sending all segment/key/map bytes to Worker capabilities. A 1,200-segment regression verifies this separation. The route rejects asset grants, altered capabilities, caller URL parameters and wrong origins, with finite time/body/depth bounds and no-store output. The player admits only the exact same-origin signed control path for local HTTP. Other providers and native media retain their existing routes.

Verified TS segments also use native workerd piping after bounded byte verification. The consumed prefix is written back once, then the untouched remainder streams natively; known lengths, cancellation and the 60-second asset deadline remain enforced. Actual HTML remains rejected. The failed-before/passed-after regression catches the prior per-chunk timer path. Whole native video retains idle bounds.

## Live evidence

Tests use real guest playback sessions, actual Consumit Player rendering and deployed Worker media. Isolated contexts intercept only session selection, history/progress writes, telemetry and automatic provider fallback, so a pass belongs to the selected provider. Complete media responses decode frames; each short check plays beyond five seconds and seeks from zero to 90 seconds, then advances beyond 94 seconds. Reports contain no capability, cookie, secret or upstream URL.

| Movie | Storm Boron | Miami |
| --- | --- | --- |
| 1032863 | Decode + seek pass | Decode + seek pass |
| 1101383 | Decode + seek pass | Decode + seek pass |
| 550 | Decode + seek pass | Decode + seek pass |
| 1022789 | Initial seek failure; repeated checks and final soak pass | Decode + seek pass |
| 1084242 | Upstream root 403; unavailable | Decode + seek pass |

The final Boron 1022789 soak advances from 90 to 214 seconds, decodes 7,810 frames at 1920×802, and records no failed media response or browser page error. One aborted request in the final 1032863 Boron short check occurred during seeking without preventing success. Tail sampling during the final soak records 22 outcomes, all `ok`; it includes concurrent traffic and is not a complete account CPU audit. Earlier evidence is retained, including the intermittent failure and CPU outcomes; no full-title reliability guarantee follows from these short samples.

- [Initial graph-discovery playback](./relay-discovery-initial-2026-10-03.json)
- [Initial control-route cross-title checks](./relay-discovery-control-initial-2026-10-03.json)
- [Control-route repeat](./relay-discovery-control-repeat-2026-10-03.json)
- [Final deployed decode/seek checks](./relay-cross-title-final-2026-10-03.json)
- [Final soak](./relay-cross-title-soak-2026-10-03.json)
- [Final sampled edge outcomes](./relay-cross-title-tail-2026-10-03.json)

SDK adapter/discovery, API relay/routes/transport/config/resolver/Admin inspection, Worker/public-DNS and player URL/engine suites pass. Scoped API and package type checks, changed-file lint, Worker build and optimized web build pass. Broad unrelated API failures are outside this result. The deployed Free Worker version is `846e170a-901c-4402-8401-bc3650fee9d9`; the running API and web contain the correction.

## Limits

The account remains Free. Playlist signing adds API CPU and control-document transfer; segment and account request limits still apply. BingeBang, Zeta and Nebula retain earlier independent upstream/edge failures and were not fixed by this host-rotation change. Boron's 1084242 root returns 403 through public API transport; no arbitrary alternate fetch path is activated. Boise's durable disabled Admin setting is preserved. Full episodes, Safari/native HLS, seven-day costs and upstream permission remain unverified. Direct-first order, player controls, Miami quality choices and source-independent history remain intact.
