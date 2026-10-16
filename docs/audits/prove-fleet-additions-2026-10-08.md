# PROVE fleet additions: Viduki, Netoda, Purstream, Vidrift, StreamVault, Fabric

Date: 2026-10-08. Status: adapters ported, unit-tested, registered, and live-resolved; direct rows decode in-browser; relay rows resolve but need the Worker redeploy below before edge playback.

The member job is resolving more titles through additional configured sources. Six rows join the local roster from PROVE at the owner's request: Viduki (relay), Netoda (relay), Purstream (direct), Vidrift (direct), StreamVault (direct), and Fabric (relay, the nextgencloudfabric lane already served under the tombstoned zeta row).

## What was ported

- `packages/provider-sdk/src/adapters/{purstream,vidrift,streamvault,netoda,viduki}.ts`, each behind the provider-adapter seam (`adapter()`, `ProviderHttp`, zod-validated hostile input, `ProviderFailure` outcomes, no global fetch).
- Fabric reuses the reviewed vidnest adapter as a `fabric`-scoped row (`servers: ['fabric']`), with the scope added to the server table and to the two `zeta`-gated behaviors (header forwarding, forced original audio).
- Purstream matches by title/year through the server-owned TMDB metadata resolver, like Lookmovie.
- Vidrift reads rung heights into quality hints; lanes arriving as a keyed object (observed live) parse per-lane instead of failing the title.
- StreamVault unwraps the same-origin stream-proxy wrapper and returns the upstream only when the wrapper demands no browser-unsendable headers; header-locked Zoisite lanes stay out (that backend is already covered by the zeta relay row).
- Viduki runs the full anti-automation handshake (altcha proof-of-work capped at 2M iterations, bootstrap nonce, pepper key, server cascade, makima WASM decrypt with mapped export names inside the standard WASM sandbox).
- A live-data find during verification: several upstreams send explicit JSON `null`s where the first port used `.optional()`, which rejects `null`. All five adapters now use `.nullish()` with per-item fallbacks; null-laden fixtures cover the regression.

## Registration and approvals

- SDK exports plus `apps/api/src/playback/configured-providers.ts` wiring (factory branches, `origins` resolution hosts, `siblingHosts` for Vidrift/Viduki validation paths, adapter-id enum).
- `infra/playback/providers.local.json`: six enabled rows (movie+series, movie-550/series-1396 probes); `providers.example.json` carries the disabled counterparts.
- Exact-host relay approvals added to both `apps/api/.env` (`PLAYBACK_RELAY_PROVIDERS`) and `infra/cloudflare/media-relay.local.jsonc` (`RELAY_PROVIDERS`): Viduki `cdn2.boomchick.org` + `sprintspeedlight.lol`, Netoda `netoda.tech` + `astream-11-1.voxzer.org`, Fabric `remoteconsultinggroup.site` + `cache.vdrk.site`.
- Admin "Playback attempt order" hides disabled rows while still saving the complete order including them.

## Evidence

- 269 provider-SDK checks pass (44 new adapter checks plus a Fabric scoping check), API 477 checks pass, web checks pass with lint and type checks.
- Admin probe, movie 550: purstream ok (Fight Club match), streamvault ok (1080p), netoda ok (master decoded), viduki ok (full PoW+WASM decrypt, ~7s), vidrift ok (4 Orion lanes) after the null fix; fabric ok (3 sources, matching PROVE's Fabric card).
- Browser, guest Watch movie 550: manual Server pins decode purstream (1282×534, advancing, captured) and streamvault (readyState 4, advancing); Vidrift lanes are HEVC-only and do not decode in headless Chromium, same codec caveat as PROVE records.
- Admin Control Room shows all six rows with tiers; the attempt-order list carries no Disabled entries.

## Limits and follow-ups

- **Worker redeploy required before relay playback**: run `wrangler deploy --config infra/cloudflare/media-relay.local.jsonc` with the operator's Cloudflare credentials. Until then Viduki/Netoda/Fabric resolve but edge playback fails closed; direct rows are unaffected.
- Netoda's segment host is numbered per title (`astream-11-1.voxzer.org` for movie 550); other titles may use sibling hosts that validation drops until reviewed and added.
- Viduki CDN hosts rotate per title (`cdn2.boomchick.org` observed); same treatment if new hosts appear.
- StreamVault only surfaces header-less unwrapped upstreams on reviewed hosts (`storage2.streamvaultsrc.click`, `img1.hlnom.com`); anything else drops, e.g. Breaking Bad S1E1 returns empty while Fight Club resolves 1080p.
- Purstream series coverage follows its search index (Breaking Bad S1E1 empty in this sample).
- The zeta tombstone is retained; Fabric is a separate row on the same backend by explicit owner request.
- The throwaway `probe-admin@consumit.local` admin member and its sessions were removed after verification.
