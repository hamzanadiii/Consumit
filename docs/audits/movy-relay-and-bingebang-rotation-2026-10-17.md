# Movy relay delivery + BingeBang YMovies rotating media host

Date: 2026-10-17. Status: adapter, roster, and playback changes unit-tested; live probes verify the Movy origin pin and the BingeBang host rotation.

The member jobs: keep Movy's multi-language HLS audio lanes playable in the separate-audio menu, and keep BingeBang YMovies resolving after its media edge rotated to a new host (verified in the PROVE provider tester: ONLINE, resolved HLS 2160p on `reliablephonerepairs.website`).

## Movy: direct is impossible against an origin-pinned edge

- Live probes on 2026-10-17: the Movy media CDN `img.rousav.tech` serves masters and video variants (`tiles.m3u8`) for any/no `Origin`, but every audio (`track_*.m3u8`) and subtitle playlist answers **200 only for `Origin: https://www.movy.sx`** and 404 for any other origin (probed: no origin, `https://consumit.app`, `https://example.com`, with and without the api key). Titles 550 and 155 additionally lack track files entirely (per-title content gaps; discovery degrades to no lanes).
- The masters declare video-only variants (`AUDIO="aac"`) with a `DEFAULT=YES` audio rendition, so hls.js must fetch the origin-pinned track even for plain video playback. A browser-direct row can therefore never play with audio: the browser always sends our app origin.
- The `movy` row in `infra/playback/providers.example.json` and `providers.local.json` now sets `deliveryMode: 'relay'` (role stays `both`). The relay worker re-sends the adapter's pinned `origin: https://www.movy.sx` header on every upstream fetch (grants accept an `origin` header; `media-relay` tests cover header pass-through), which satisfies the CDN for masters, variants, audio tracks, and segments.
- Relay approvals recorded in-repo: `PLAYBACK_RELAY_PROVIDERS='{"movy":["img.rousav.tech"]}'` in `.env.production` and `.env.production.example`, and the `RELAY_PROVIDERS` worker maps in `infra/cloudflare/media-relay.production.wrangler.jsonc` plus the production/local/canary `.local.jsonc` deploy copies now carry `movy` and the new BingeBang host. The worker must be redeployed for the edge policy to accept them.
- `apps/api/src/playback/separate-audio.ts`: audio discovery and preparation now keep an **adapter-pinned `origin`** instead of overriding it with the app origin. Sources without a pinned origin keep the previous app-origin behavior (the single-language-wrapper guard). This is what lets discovery read Movy's audio lanes server-side through the same headers the relay will send.

## BingeBang YMovies: the media edge rotates hosts

- The adapter `packages/provider-sdk/src/adapters/bingebangymovies.ts` hard-rejected anything but `os.bingebangstream.online`, so the current `reliablephonerepairs.website` stream resolved to malformed. PROVE's own fleet history shows the edge rotating (`os.bingebangstream.online` → `wowstreamingsofast.lol` → `reliablephonerepairs.website`).
- The adapter now validates the resolved media URL against the roster's `mediaHosts` (`allowedMediaUrl`), keeping the https + `type: hls` requirements; the factory passes `{ mediaHosts: entry.mediaHosts }` like other configured adapters. Fail-closed coverage: an unlisted host and a suffix-spoofed host both resolve malformed.
- `reliablephonerepairs.website` was added to `mediaHosts` in both config files (previous hosts kept for rotation rollback). The row stays `relay` (PROVE classifies YMovies relay; direct fetches of this edge 403 outside the player session).

## Evidence

- Full workspace suite green (`bun run test`, TEST_EXIT=0; typecheck and lint clean), including new checks: BingeBang approved-host acceptance/rotation fail-closed, separate-audio pinned-origin discovery, and the roster assertions for both rows.
- Live: `api.movy.lol` movie resolve (550, 27205, 155) and CDN probe matrix above; PROVE tester screenshot for BingeBang YMovies (reliablephonerepairs.website, HLS 2160p, 1176ms).
