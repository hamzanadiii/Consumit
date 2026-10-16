# ADR 0008: Provider lookup location and stable media delivery

Status: Superseded by [ADR 0009](./0009-cloudflare-provider-resolution.md). The measurements below remain historical evidence; OVH lookup and media relay are no longer the target routing architecture.

## Member and operator jobs

The member wants configured providers to play in production as they do locally, with Consumit's controls, quality, captions and progress. The operator wants browser Direct whenever it works, with relay as a bounded fallback and no automatic paid upgrades.

## Evidence that changes the design

Local versus production differs at two separate steps: which network resolves the source, and which network fetches media. Vixsrc challenges tested production lookup locations before returning a source. LookMovie resolves on OVH, but its OVH-issued playlists and sampled video segments fail from the member connection. AnimeKai and an edge-issued Recloud sample show the same general cross-egress mismatch. Header/CORS repair alone cannot correct bytes denied to another egress.

On 2026-10-11 a throwaway Node media process on OVH consumed the actual production-issued LookMovie movie-550 source. A Windows Chrome browser reached it over a private SSH loopback tunnel. The process fetched and rewrote the bounded HLS graph, using the configured public-DNS-pinned transport for every upstream request. Chrome decoded 1920×800 video, sought to 60 seconds, and resumed. The root and two requested TS segments returned HTTP 200. The process automatically expires after four minutes, accepts only opaque in-memory resources derived from the validated root, and stops when the SSH input closes. No public listener, DNS record, firewall rule, Cloudflare video route or member database change was made. The sanitized report is `local/production-playback/stable-egress-prototype-report.json`.

This proves the delivery mechanism for one sample. It does not certify production TLS, concurrent capacity, all titles, full-duration playback, captions, quality switching or renewal. It supersedes the idea that a lookup-only Worker is sufficient for LookMovie.

The same day's fresh Vixsrc movie-550 and series-1396 S1E1 checks resolve on the developer connection and decode/seek in Chrome from the real production origin. The same locally issued movie root fetched through the OVH transport instead receives a 403 HTML response. This separates a working lookup location from a blocked media-fetch location; it does not prove IP binding or compatibility for every viewer connection. A reviewed accepted lookup node is a concrete candidate, with Direct browser delivery tested independently and same-node relay available only when its own complete delivery test passes. No permanent home agent is installed.

## Routing decision

Keep one provider-adapter seam and the existing Consumit Player. Introduce a provider routing module whose interface is canonical title/episode, viewing capabilities and an explicitly configured provider route. Its implementation chooses a reviewed lookup node, validates adapter output, and issues either a browser Direct source or a source bound to that node's media relay. Callers never choose arbitrary upstream URLs, forwarding headers or destinations.

The two varying implementation choices are lookup location and delivery transport. Represent them explicitly rather than teaching every player or adapter about deployment environments:

| Provider compatibility | Lookup | Delivery |
| --- | --- | --- |
| Browser-compatible URL from OVH | Existing OVH adapter | Browser Direct |
| Lookup blocked on OVH; another reviewed node returns a browser-compatible URL | Adapter on that reviewed node | Browser Direct, after an actual cross-egress browser check |
| Source bound to resolving egress | Adapter on the chosen node | Same node's explicitly approved relay for the entire required graph |
| Required headers cannot be sent by the browser | Adapter on a compatible node | Reviewed relay forwarding only provider-owned public hints |
| No tested compatible lookup node | No source is issued | Continue approved fallback/Embed and report unavailable |

The same-node relay is a separate media process. API remains the session, provider selection and capability control plane; it never streams video. LookMovie's initial relay candidate uses the existing OVH public egress, since resolution already works there. A Vixsrc candidate must first demonstrate successful lookup on a reviewed always-on node; adding it to OVH's media relay cannot fix its lookup rejection. The developer connection is evidence and a canary, not silently turned into permanent infrastructure.

Retain the Direct → approved Relay → Embed waterfall. Each direct/relay provider route is independently configured, with separate health and exclusions. Known environment-incompatible routes fail before a doomed browser attempt, using measured route health and expiring compatibility evidence. Do not report a source as playback-checked after an HTTP lookup alone. A failed Direct row never silently changes delivery mode; the operator explicitly enables the additional relay route.

Resolution, playlist validation, segment delivery and renewal retain one `egressId` for the session. Resolver caches and health keys include provider, route/node and canonical identity. Never share an IP-bound source across nodes. A node IP change invalidates its binding and causes bounded re-resolution; it does not replay a stale token on another node. Choose and verify address family instead of assuming two processes on one machine have identical upstream-visible egress.

## Media route, limits and cost

Use a separate browser-trusted HTTPS media hostname for a public OVH relay. A DNS-only record is a candidate; the normal website/API continue using the current Tunnel. Current Cloudflare public-Tunnel documentation requires a suitable paid service for video and large files on Free/Pro/Business, so the existing Free Tunnel is not the proposed bulk-media path. This changes origin exposure and requires explicit TLS renewal, host firewall, abuse controls and release/rollback configuration. See [the official-source research](../audits/provider-delivery-architecture-research-2026-10-11.md).

Reuse the existing capability and public transport invariants: short expiry, provider/session/origin binding, a verified finite graph and exact per-session hosts; no arbitrary URL endpoint, member/provider credentials, private-network destination, content steering or unbounded redirect. Preserve Range/HEAD, streaming backpressure, cancellation, finite startup/asset deadlines and redacted logs. Required subtitle playlists, keys and maps use the matching bound route. Do not convert or transcode video.

Set concurrency and aggregate bit-rate/byte admission limits before release. Account for app/database/backup headroom. Later operator screenshots identify the existing Canadian VPS-3 2027; OVH's matching current offer lists unlimited traffic and 2 Gbps public bandwidth. This supports reusing the already purchased transfer allowance, but does not certify sustained machine throughput, spare application capacity or the precise account agreement. See the [no-extra-subscription research](../audits/no-extra-cost-provider-plan-2026-10-11.md). At an illustrative 4 Mbps, one viewer consumes roughly 1.8 GB/hour and twenty viewers need about 80 Mbps outbound capacity. Record bytes, request counts, failures and active sessions by provider/node. Reuse included capacity only within its verified limits; no additional server or paid plan is purchased automatically.

## Smallest next release

1. Production-quality separate media process and explicit LookMovie relay route on OVH, disabled by default.
2. Signed-capability validation, hostile graph/DNS tests, cancellation/backpressure and capacity rejection behavior.
3. Browser tests for Watch playback, quality change, seek, captions and healthy renewal, followed by a short concurrent canary. Full-duration and larger concurrency soaks remain required before a capacity claim or expanded rollout.
4. Reviewed public HTTPS exposure and measured OVH headroom, with the current release retained for rollback.
5. Only then enable the route as a fallback. Add other providers one measured route at a time. Validate a Vixsrc lookup node before proposing its rollout or spending money.

The initial implementation uses the existing provider registration/resolver and a small relay issuer dispatching to the fixed OVH origin with its independent key. Provider id plus transport origin/key keeps this route's cache, health, capabilities and renewal separate. A generic `egressId` registry and automatic node failover are deferred until a second proven node exists. Resource limits and lifecycle are specified in [the OVH media runbook](../runbooks/ovh-media-relay.md).

## Alternatives rejected for this slice

- Scraper-only Worker: reaches some lookup APIs but cannot give the browser the issuing IP; live Recloud/Vidrift tests failed after successful edge resolution.
- Global HTTP proxy in the API: combines bulk media with account/session work and breaks the control-only invariant.
- Public media on the existing Free Tunnel: not justified by the current service documentation.
- Purchasing another VPS before testing its egress: no evidence that a different data-center IP will be accepted.
- Treating the developer laptop as permanent infrastructure: network capacity, uptime and operator dependence are unverified.
- Switching every provider to relay: adds avoidable media traffic and removes successful Direct delivery.
