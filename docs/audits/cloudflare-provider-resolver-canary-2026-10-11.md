# Cloudflare provider Resolver Worker canary — 2026-10-11

The isolated `consumit-provider-resolver-canary` Worker (version `5c292e75-93d3-49d0-9254-dd9b6dbc581e`) accepted an authenticated static fixture. A one-pass upstream canary then sent all 48 configured provider rows through their compiled adapter from Cloudflare, with four concurrent requests. The test used movie 550/Fight Club, series 1399/Game of Thrones, or anime 20/Naruto as applicable. Provider URLs, query strings, response bodies, and credentials were not recorded. The final canary deployment is version `ba52e135-ea03-404e-9dea-4e6d1b341b7c`; it adds the pre-aborted caller cancellation guard and was not re-run across all 48 rows because it does not change provider dispatch.

| Delivery setting | Configured rows | Adapter returned sources |
| --- | ---: | ---: |
| Direct | 32 | 12 |
| Relay | 8 | 6 |
| Embed | 8 | 6 |

Direct resolution candidates: `kyren`, `castletv`, `animekitsu`, `riveapogee`, `evion`, `rivecitadel`, `rigel`, `purstream`, `vidrift`, `streamvault`, `cookiebakers`, and `kazora`.

Relay resolution candidates: `megavid`, `anixo`, `zoko`, `rivenebula`, `rivezephyr`, and `netoda`.

Embed resolution candidates: `reanimeframe`, `megaplayframe`, `apiplayerframe`, `embedapiframe`, `cinesrcframe`, and `vidriftframe`.

LookMovie and both Vixsrc rows returned an `unavailable` adapter result from Worker egress. Nineteen other rows returned `empty`, `malformed`, or `unavailable`; four invocations returned HTTP 503 and one returned HTTP 502. Those edge errors were not diagnosed further and remain failures. The result list only proves the adapter emitted a candidate source. It does not prove that the API accepts its host/expiry/headers, or that a production browser can play, seek, load captions, or render an Embed. No provider route is production-approved on this audit alone.

At the time of this isolated canary, the production Worker and API were not connected. The subsequent production rollout is recorded in the [production deployment audit](./cloudflare-provider-resolver-production-2026-10-11.md). The canary results remain adapter-candidate evidence only; they do not prove API source acceptance or browser playback. Follow the full browser and relay acceptance steps in the [Cloudflare routing runbook](../runbooks/cloudflare-provider-resolution.md).
