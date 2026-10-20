# PROVE fleet additions: Cinecat, Aether, Fmfau, StreamingUnity

Date: 2026-10-15. Status: adapters ported, unit-tested, registered, and roster/relay config wired; all four rows now resolve against live upstreams (verified 2026-10-18); relay rows still need the Worker redeploy below before edge playback.

The member job is resolving more titles through additional configured sources. Four rows join the roster from PROVE at the owner's request: Cinecat (relay), Aether (relay), Fmfau (relay — see policy note), StreamingUnity (direct).

## What was ported

- `packages/provider-sdk/src/adapters/{cinecat,aether,fmfau,streamingunity}.ts`, each behind the provider-adapter seam (`adapter()`, `ProviderHttp`, zod-validated hostile input, `ProviderFailure` outcomes, no global fetch), plus 41 new unit checks in matching test files.
- **Cinecat** (`cdn.hls.lol/content/{movie|tv}/{id}`): signs each request through `cinecat-gate.ts`, a native implementation of the x-az anti-bot gate reverse-engineered from cinecat.eu's own player (WebCrypto capture: `K1 = SHA-256("aphrodite.z.v2" ‖ salt)`, challenge `POST /content/index {c:"z",ts,n,s}` with `s = HMAC(K1, "v2:z:{ts}:{n}")`, session blob `d = IV ‖ AES-GCM(seal, {exp,now,sid,skey})` with `seal = HMAC(K1, "aphrodite-seal-v2|{ts}|{n}")`, and `x-az-tag = HMAC(K2, "v2:{sid}:{path}:{ts}:{nonce}")`). The 30-minute session is cached and dropped on a 401/403. The atlantic.st-vendored `aphrodite-gate.ts` speaks the retired `c:"a"` dialect and is rejected with 403, so Cinecat no longer uses it. The adapter gates on a resolved title, enforces a ≥600s duration floor on the first variant (decoy lane), resolves `sub.vdrk.site` subtitles, and records `https://cinecat.eu/` as the playback referer.
- **Aether** (`lul.aether.cx/...`): the LUL API returns a workers.dev URL; the adapter's DNS-pinned transport follows the 302 to the settled tnmr host (`cdn1018.cdn-tnmr.org` observed; regex accepts any `*.tnmr.org`), asserts `#EXTM3U`, and gates every candidate on tnmr-host + `allowedMediaUrl` + `isRelayMediaUrl` (malformed otherwise). Subtitles from `sub.vdrk.site`.
- **Fmfau** (`fmfau.com/api/sources/...`): single-call DIRECT recipe that returns DASH/MP4 lanes through the provider's ACAO:* wrapper (`hahaevilcraft.site/proxy?u=…`). The adapter maps the `dash` media kind explicitly (the shared `mediaType` helper only understands hls/mp4 hints), dedupes candidates, and emits verified playback sources.
- **StreamingUnity** (`streamingunity.fun`): full Inertia SPA handshake — cached version, 409→refresh retry, `data-page` JSON envelopes, title search with normalized-title ranking, season-page episode lookup for TV (`?e=` carries the internal episode id, distinct from the human-readable number), iframe→vixcloud embed, and `window.masterPlaylist` assembly (`token`/`expires` params, `h=1` when the embed permits full HD, quality from `masterVariantHeights`).

## Delivery-mode and platform-policy notes

- **Fmfau ships as `relay`, not direct as PROVE labels it.** Its only playable URLs are proxy-named paths (`…/proxy?u=…`), and Consumit's `validatedSources` (index.ts:245) rejects proxy-named URLs on direct rows so header-locked proxy media cannot play cross-origin without the Worker grant path. The Worker fetches the wrapper server-side and streams to the browser; the wrapper answers ACAO:* to the Worker's fetch, so no special headers are needed. Unlike poseidon (which unwraps `?u=` to raw CORS-open origins), fmfau's raw origins are not CORS-open — unwrapping would break playback.
- Cinecat and Aether are relay per the PROVE recipes (header-gated media hosts).
- StreamingUnity is direct: vixcloud embeds are browser-playable as-is.
- No `media-relay` `mediaHeaders` recipe was needed: every nested hop for cinecat (totallyacdn.org), aether (tnmr), and fmfau (single URL, no nested hops) is same-host, so the shared-hosting passthrough (`host === headerHost → hints`) carries the recorded referer.

## Registration and approvals

- SDK barrel exports plus `apps/api/src/playback/configured-providers.ts` wiring (factory branches — StreamingUnity gets the server-owned TMDB metadata resolver like the other title-matching adapters — origins resolution hosts, siblingHosts for Aether's workers.dev validation path, adapter-id enum).
- `infra/playback/providers.local.json`: four enabled rows (movie+series, movie-550 probes); `providers.example.json` carries the disabled counterparts. Aether carries `mediaHostPatterns: ['^[a-z0-9.-]+[-.]tnmr\\.org$']` so its rotating CDN hosts pass the DNS pin (verified against shared-hosting/generic guards).
- Exact-host relay approvals added to both `.env.production`(+example) `PLAYBACK_RELAY_PROVIDERS` and the four `infra/cloudflare/media-relay.*.jsonc` maps: Cinecat `totallyacdn.org`, Aether `cdn1018.cdn-tnmr.org`, Fmfau `hahaevilcraft.site`.

## Evidence

- Provider-SDK: 45 adapter checks pass (Cinecat 13 incl. 4 gate checks reproducing a captured production exchange byte-for-byte, Aether 10, Fmfau 10, StreamingUnity 12); full suite 553/557 (the 4 failures are pre-existing kototv checks from an unrelated in-flight change). API 597 checks pass, including the registration test covering all four rows plus the full-roster schema pass. Typecheck clean across provider-sdk and api.
- Live verification (2026-10-18, via `apps/api/src/playback/bench-live.ts`, 63 providers × 2 rounds, concurrency 6): **all four rows resolve**. Cinecat signed movie-550 returns the titled payload (variant ladder 8348s / 802 segments) in ~1.3–1.7s; aether resolves after the `cflul.bx5.workers.dev` sibling-host rotation fix (~3.0–4.1s); streamingunity ~0.8–1.3s; fmfau ~3.3–9.5s (3 sources). Aphrodite and 43 other rows also pass; 17 pre-existing failures are unrelated to this slice.
- Live speed ranking among true resolvers (mean): rivezephyr 97ms, reanimeframe 148ms, megavid 193ms, zoko 296ms, streamvault 302ms, netoda 310ms, rivenebula 313ms, cookiebakers 327ms, vidrift 348ms, vidlink 417ms; frame rows construct embed URLs with no network hop (0–6ms). Cinecat 1490ms, streamingunity 1062ms, aether 3508ms, fmfau 6400ms.
- StreamingUnity TV flow was traced end-to-end against a deterministic fixture chain (version → search → titles → season → watch?e= → iframe → vixcloud → masterPlaylist) to verify the internal-id/episode-number split.
- Repair note: two dangling workspace junctions under `packages/media-relay/node_modules` (`@consumit/contracts`, `zod`) — collateral from a concurrent install — were rebuilt to unblock the API suite (`media-egress.test.ts`).

## Limits and follow-ups

- **Worker redeploy required before relay playback**: run `wrangler deploy --config infra/cloudflare/media-relay.production.wrangler.jsonc` (and the local/canary configs as applicable) with the operator's Cloudflare credentials. Until then Cinecat/Aether/Fmfau resolve but edge playback fails closed; StreamingUnity is unaffected.
- Aether's tnmr host rotates (`cdn1018.cdn-tnmr.org` observed) and its LUL worker host rotates too (`cflul.bw1` → `cflul.bx5.workers.dev`, added to `siblingHosts`); the roster pattern covers new `*.tnmr.org` hosts for the DNS pin, but the relay grant is exact-host — add newly observed hosts to `RELAY_PROVIDERS`/`PLAYBACK_RELAY_PROVIDERS` after review.
- Cinecat's gate constants (`aphrodite.z.v2` salt, `c:"z"` dialect) are captured production values; a future rotation upstream will surface as challenge 403s → `unavailable`. Re-capture from the site's player (hook `crypto.subtle`) to refresh.
- All four rows resolve live as of 2026-10-18 (movie-550); re-run `bun src/playback/bench-live.ts` from `apps/api` to re-verify after upstream or roster changes.
