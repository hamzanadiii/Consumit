# OVH media fallback

Status: retired from production on 2026-10-11 under [ADR 0009](../adr/0009-cloudflare-provider-resolution.md). This is a historical deployment record, not the active routing runbook. `PLAYBACK_NODE_ENABLED=false`; the OVH media containers are stopped and their persistent volumes are retained for rollback. The DNS-only `media.consumit.online` record still resolves to the VPS; DNS cleanup is separate. Use the [Cloudflare routing runbook](./cloudflare-provider-resolution.md). Vixsrc and LookMovie remain unavailable from Cloudflare, so those routes may fall through to Embed or unavailable until separately verified.

The member job is reliable Watch playback when a provider issues media that only the resolving network can fetch. ADR 0008 approves a separate media process on the existing OVH server. The API issues opaque capabilities and never streams video.

## Routes

Browser-compatible rows stay Direct. Independently approved Cloudflare Worker rows keep the Worker route. The first same-egress OVH row is `lookmovie-relay`, separate from `lookmovie` Direct, with independent health, exclusions and the reviewed `lookmovie-v1` discovery recipe. Lookup, bounded graph validation, media and renewal use the same OVH transport and deployment image. Node origin and signing key define this initial fixed route; no generic multi-node registry is shipped.

The numbered LookMovie CDN hostname shape is checked before discovery requests. The complete finite playlist graph supplies at most eight exact hosts for signed capabilities; the media process verifies and pins public DNS for every socket. Private/reserved addresses, unrelated hosts, redirects outside the signed scope, content steering, credentials and arbitrary URL parameters fail closed. Existing Worker deployments do not accept the LookMovie recipe.

## Exposure and configuration

`consumit.online` and its API stay proxied behind their existing Tunnel. Only `media.consumit.online` has a DNS-only A record pointing to `15.235.95.53`, with no authoritative AAAA record. The separate `compose.media.yaml` project exposes TCP 80/443 through Caddy, automatically obtains a browser-trusted certificate and persists renewal data in named volumes. It only forwards `/media/*` GET/HEAD/OPTIONS to the private media container. The media network has no API/database services. Public access/debug logs are disabled so signed paths never enter logs.

Production API activation requires `PLAYBACK_NODE_ENABLED=true`, `PLAYBACK_NODE_ORIGIN=https://media.consumit.online`, an independent `PLAYBACK_NODE_SECRET`, and exact `PLAYBACK_NODE_PROVIDERS` for `lookmovie-relay`. Defaults stay disabled in the example environment. The separate root-readable `.env.media-egress` contains only its own configuration, app origin and built image release; it has no identity, database or catalog credentials.

## Initial resource limits

The media daemon allows 16 active HTTP requests, a global 60-request admission burst replenished at five requests/second, 60-second transfer deadlines and 1,500,000 bytes/second aggregate outbound pacing (12 Mbps). Its initial daily ceiling is 8,000,000,000 bytes, resetting at UTC midnight. These are conservative admission controls, not a certified viewer capacity or a statement of the purchased OVH allowance. Parallel HLS requests mean the active-request limit is not a viewer count.

This counter and pacing cover relay response bodies. TLS/IP overhead and other application traffic are outside that counter; it is not an exact network bill meter.

The daily quota lives in `infra/secrets/media-budget/budget.json`, owned by the container's uid 1000. A global reservation of up to 1 MiB is atomically persisted before releasing bytes; restarting loses unused credit rather than resetting the quota. A corrupt state, failed write or backwards date fails closed. Do not delete this file to restart playback. Capacity rejection returns 429; exhausted quota or an asset deadline fails the transfer so the player can use its existing recovery flow. Quota exhaustion can interrupt an active stream.

The daemon is capped at 256 MiB RAM and 0.5 CPU, and Caddy at 128 MiB and 0.25 CPU. No paid service or extra VPS is provisioned. Verify the purchased OVH bandwidth policy and application headroom before raising any limit. Periodic daemon telemetry contains only active request count, UTC day, reserved bytes and byte ceiling; it never contains tokens or provider URLs.

## Verification and rollback

Verify public DNS, trusted TLS and wrong-host/path/method/capability rejection before activation. Then use actual deployed Watch playback, seeking, quality change, subtitle rendering and healthy renewal. Confirm browser requests go to the chosen media origin, unchanged Direct rows still work, and original provider controls remain identical. A short browser sample is not a full-duration or high-concurrency certification; retain that distinction in the deployment audit.

The private installer under `local/production-playback/install-media-node.mjs` verifies source hashes and provider-state hashes, saves previous source/environment/provider configuration under `infra/secrets/media-node-backups`, builds immutable images, starts media with API activation disabled, and adds only the explicit relay row after a public browser test. The `rollback` phase stops only the separate media project, restores previous source/configuration and API image, and removes the added relay override. Existing member data and original provider overrides are preserved. Caddy certificate volumes and daily quota survive rollback; never run volume deletion as part of this procedure.

Vixsrc remains a separate lookup-location issue: an OVH media process cannot repair a 403 received before any link is returned. Add another provider only after its actual lookup and complete delivery path pass, keeping successful browser Direct routes unchanged.
