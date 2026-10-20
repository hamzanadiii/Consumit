# Player modernization — 2026-10-18

## Scope and review status

The finished Watch/Consumit Player extension is available locally at `http://localhost:8080/watch/movie/550` (the route returned HTTP 200). It preserves the current Watch composition while clarifying source-family choice, reducing phone control density, and keeping the player’s approved typography and geometry scoped to its surfaces. The whole-app UI refresh and any visual production deployment await user approval. Provider roster/settings changes were deployed separately before this work; this visual change did not touch production.

The source menu keeps fixed Consumit Server and External players tabs above a scrolling roster. Search and favorite ordering follow the selected family; native choices remain under Consumit controls, while external players retain their own controls and disclose unavailable progress sync and automatic next-episode behavior. The exact configured VidRift movie/series frame can emit bounded provider-reported diagnostics under [ADR 0006](../adr/0006-provider-embed-fallback.md). Those reports are not decoded-playback evidence and do not affect member progress/history. Other frame event protocols remain unsupported.

## Finish checks and limits

The final visual reviewer resolved the radius, direction contract, styled volume overlay, and timeline overlap findings. Captures and check files are under [`tmp/player-modernization-review`](../../tmp/player-modernization-review). Desktop, phone, and landscape checks show zero movement for neighboring controls when the volume overlay opens, no overlay/timeline overlap, and no overflow. Source search returned one matching result without browser errors or overflow in each viewport; external-player and recovery states also showed no overflow.

The Admin comparison contract separates native playback measurements, resolver outcomes, and provider-reported frame events. Startup/stall percentiles use precomputed pooled histograms, regions remain separate, and provider-reported messages do not prove playback or unique viewers. Exact iframe URL/roster checks establish configured availability only; they do not show decoded or advancing playback. See [the direction contract](./player-modernization-direction-2026-10-18.md), [external-player REA](./external-player-rea-2026-10-18.md), [components](../COMPONENTS.md), and [delivery status](../DELIVERY.md).
