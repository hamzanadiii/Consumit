# Movie 550 local relay comparison

The current Consumit provider integration can decode and seek movie 550 through all six previously failing movie relay providers when the identical relay code executes locally. This isolates an execution/network difference in the deployed Cloudflare path; it does not establish that the Free Worker is fixed or that a paid plan would fix upstream responses.

The isolated Chromium context drove the deployed Admin Browser check and actual Consumit Player. Only requests to the configured Worker media origin were intercepted. Each intercepted request, with its original encrypted grant and browser headers, was passed to `createRelayWorker` using the current secret, application origin and exact provider policy. The interceptor read the complete response body before fulfilling the request. Provider resolution, manifest rewriting, public header recipes, validation and player behavior were unchanged. There was no replacement player, prefix-only response or simulated media.

| Provider | Decoded dimensions | First-frame startup | Seek to 90 seconds and resume past 94 seconds |
| --- | --- | --- | --- |
| Rive Nebula | 1920×1080 | 2069 ms | Passed |
| BingeBang YMovies | 853×480 | 1961 ms | Passed |
| Zeta | 1920×800 | 1653 ms | Passed |
| WeCollege Miami | 3840×2160 | 1740 ms | Passed |
| WeCollege Boise | 3840×2160 | 1258 ms | Passed |
| Rive Zephyr | 1280×720 | 1092 ms | Passed |

All six decoded more than 120 frames and played past five seconds before seeking. Completed relay responses were HTTP 200. Each player reported one observed stall; this is a startup/seek comparison, not a full-title reliability or buffering soak. Body-byte totals in [the sanitized evidence](./relay-movie550-local-comparison-2026-10-03.json) include manifests and complete requested media segments. Late completed responses can increment totals after the per-provider console summary, so the final file is the aggregate evidence.

The earlier [deployed Worker recheck](./relay-movie550-recheck-2026-10-03.md) records CPU-limit outcomes and separate upstream 403/502 responses. Cloudflare's [current limits](https://developers.cloudflare.com/workers/platform/limits/) specify 10 ms CPU per Free HTTP invocation and termination for repeated overruns. PROVE's local gateway has a different execution budget and outbound network. The local comparison supports delivery environment as the remaining cause; it does not identify why every upstream rejects or fails edge requests. The previously corrected WeCollege public Referer recipe remains necessary.

No application relay origin, provider settings, account plan or Docker service was changed for this comparison. Authentication used an expiring diagnostic session removed after the run; no member progress/history was written. Raw upstream URLs, capabilities and secrets are omitted. A separate local relay would preserve direct-first provider selection, Consumit's player and encrypted grant boundary, while placing relay bandwidth on the host server. That deployment choice remains pending owner direction; the active relay is still Workers Free.
