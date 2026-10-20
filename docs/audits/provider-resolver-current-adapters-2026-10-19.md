# Provider Resolver refresh and PROVE adapter check — 2026-10-19

The owner asked to repair BingeBang YMovies, Aether, Cinecat and StreamingUnity because their adapters resolve in PROVE. The first production sweep ran through stale Cloudflare Resolver Workers and returned `unavailable` for all four. The current Resolver Worker source already includes the PROVE-derived adapter implementations, so both production Resolver Workers were refreshed:

- Default Worker: `1edc1b40-7ae8-4161-bec3-7e9ef7f91728`
- Europe Worker: `930624fd-eaad-4e19-bc6a-a7a0686258a6`

Targeted provider tests passed (35 Provider SDK tests, 30 API configured-provider tests, and 10 Resolver Worker tests). After deployment, production Worker checks resolved Aether for the sampled movie and series, but its TNMR media URLs returned HTTP 403 from the member network. BingeBang YMovies, Cinecat and StreamingUnity still return unavailable from both production Resolver Workers.

The same rows resolve from the developer egress using the current adapters. Cinecat and StreamingUnity media URLs returned HTTP 200 with CORS enabled. BingeBang's sample media returned HTTP 200 only with provider request headers and would need its approved relay path. Aether media returned HTTP 403. Production-origin smoke checks through the refreshed Worker still resolved Filmu movie/series, Movy movie and CineJoyLisbon series, with media HTTP 200.

No provider rows were added or enabled by this check. BingeBang is already enabled in the production roster; its current endpoint remains unavailable from production resolver egress. The other three remain candidates. No source passed a production-origin browser first-frame check, so no playback success is claimed. Upstream access differs by egress: BingeBang and StreamingUnity returned HTTP 403 from the production VPS as well as the Resolver Workers. Their successful PROVE/local result therefore does not establish production availability. Further promotion requires a production-compatible lookup and media route with a real playback check; do not weaken host validation or claim a URL lookup as playback.
