# Cloudflare media delivery and zero-added-cost constraints: 2026-10-11

Read-only research against current first-party documentation and the shipped relay source. No deployment, account upgrade, cloud purchase or traffic-routing change was made. This note does not establish the installed OVH account's allowance or individual providers' permission to redistribute or cache their media.

## Finding

Preserve browser Direct wherever the browser demonstrably plays the complete required graph. Keep existing independently approved Worker fallback routes bounded and measured. Use the already implemented same-OVH media route for its reviewed LookMovie fallback rather than moving that traffic behind the site's public Tunnel. There is no evidence that a lookup-only Worker fixes LookMovie's demonstrated egress binding, or that Cloudflare can resolve Vixsrc from the already rejected tested egress. These conclusions follow from [Consumit's parity evidence](./provider-production-parity-2026-10-10.md) and [OVH delivery audit](./ovh-media-relay-2026-10-11.md), not Cloudflare marketing.

Cloudflare's free compute quota can reduce additional monetary spend for compatible routes. It cannot guarantee all-provider availability, stable upstream egress, unlimited successful playback or zero use of the existing server's capacity.

## Workers Free facts

Current limits: 100,000 incoming requests per account per UTC day, 10 ms CPU per invocation, 128 MB memory per isolate, 50 external subrequests per invocation and six simultaneous outgoing connections waiting for response headers. Redirect hops count as subrequests. Waiting for network I/O is excluded from CPU time. HTTP response streaming has no fixed wall-clock limit while the client remains connected, although runtime updates may interrupt long requests. There is no enforced response-body size ceiling. Quota exhaustion produces error 1027; CPU exhaustion produces error 1102. Streaming instead of buffering protects memory. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

The pricing table includes a Free tier and no duration charge. Workers Standard starts at $5/month, includes 10 million requests and 30 million CPU milliseconds, and bills excess requests/CPU; the page states no additional data-transfer or bandwidth charges. Subrequests are not separately billed as incoming Worker requests. Cache hits in the newer Workers Caching feature still count as requests. This research proposes no Paid upgrade. Published absence of a per-GB charge is not a guarantee that any workload or volume will be accepted. Containers have separate egress billing and must not be conflated with Workers. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

## Worker, ordinary CDN and Tunnel are different service paths

The current application-service terms require a specified paid service for video and large-file delivery via ordinary Free/Pro/Business CDN service; Cloudflare can limit that CDN use without the relevant service. Cache bypass alone does not resolve this condition. [Application-service terms, CDN section](https://www.cloudflare.com/service-specific-terms-application-services/)

The Tunnel FAQ explicitly applies that requirement to public-hostname routes through Cloudflare's reverse proxy. Private-network routes have a different condition and need client/network access; they are not public browser playback for arbitrary Consumit members. Consequently, publishing the OVH media sidecar through the existing public Free Tunnel is not the recommended zero-added-cost path. [Tunnel FAQ, large-file and streaming traffic](https://developers.cloudflare.com/cloudflare-one/faq/cloudflare-tunnels-faq/)

Do not turn that rule into a blanket assertion that all video over Workers is banned. Developer Platform terms separately permit hosting content, allow limits for undue network burden, and require associated documentation and applicable third-party terms. [Developer Platform terms](https://www.cloudflare.com/service-specific-terms-developer-platform/)

Cloudflare's own 2023 explanation says its content restriction applies to CDN use and distinguishes Developer Platform services. That historical explanation does not explicitly approve every present-day Free Worker external-origin video proxy; current service-specific terms and route remain controlling. The safest evidence-based description is **bounded Workers Free fallback under applicable terms**, not **unlimited free CDN for all providers**. [Cloudflare's terms explanation](https://blog.cloudflare.com/updated-tos/)

## Illustrative consumption, not measurements

Assume one multiplexed video/audio rendition at a sustained 4 Mbps, six-second HLS segments, no retries and one incoming Worker request per segment. This gives 3,600 / 6 = 600 segment requests and 4,000,000 × 3,600 / 8 = 1.8 GB per viewer-hour, using decimal GB. Segment duration and bitrate are assumptions; they are not asserted for any Consumit provider.

| Viewing scenario | Viewer-hours/day | Video segment requests/day | Media payload/day |
| --- | ---: | ---: | ---: |
| 2 viewers watching 2 hours each | 4 | 2,400 | 7.2 GB |
| 10 viewers watching 2 hours each | 20 | 12,000 | 36 GB |
| 5 viewers continuously active for 24 hours | 120 | 72,000 | 216 GB |
| 7 viewers continuously active for 24 hours | 168 | 100,800 | 302.4 GB |

All figures omit manifests, separate audio/subtitles, encryption keys, preflights, seeks, retries, startup buffering, abuse and other Workers sharing the account quota. Separate six-second audio segments approximately double segment request counts. The mathematical video-only maximum is about 166.7 viewer-hours/day, or 6.94 continuously active viewers; it is not an operational capacity claim. A two-second video segment assumption alone triples request counts. CPU failures can occur well below daily quota.

These byte calculations also describe media the OVH fallback would have to carry. They do not prove that amount is included in the actual OVH bill or contract.

## What the shipped implementation already does

- `packages/media-relay/src/worker.ts` authenticates short-lived opaque grants before upstream reads, enforces provider/exact-host policies, handles GET/HEAD/OPTIONS and bounded Range syntax, caps redirects at three, rejects HTML/JSON media, and emits `Cache-Control: no-store`.
- Its manifest read ceiling is 512 KiB, with a specific 1 MiB reviewed BingeBang recipe. HLS asset piping uses native workerd streams where available, with a 60-second transfer deadline. Whole native media retains the separate idle-bounded streaming path. Small per-request public-DNS checks may add subrequests for discovered hosts.
- `infra/cloudflare/media-relay.wrangler.jsonc` has reusable relay activation disabled by default. No account's private production secrets were read for this note. Saved configuration alone is not proof of the deployed account's plan or remaining quota.
- [ADR 0005](../adr/0005-direct-first-worker-relay.md) and the existing relay audits already record real Free Worker CPU failures and the move of long-playlist control/signing to the API for reviewed recipes. Passing samples do not override those known limits.

## Caching is an optional measured optimization

The Cache API is local to a data center, does not replicate entries globally, respects response cache directives, rejects storing 206 partial responses, and does not cache Set-Cookie responses by default. It differs from Workers Caching. [Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/)

Design inference: authenticated requests could potentially share immutable media bytes only after proving identical asset/rendition identity and provider authorization. Validate the requesting grant before any hit; preserve expiry/revocation and the selected egress. Do not cache personalized signed playlists, remove token parameters to force cross-session hits, expose encryption keys publicly, or serve a cache entry before checking authorization. A cache filled through a working OVH route does not make the initial fetch work from Cloudflare or guarantee requests will hit the same edge cache. Current no-store behavior should remain until a distinct measured recipe proves benefit and correctness. Cache-hit request accounting also means caching is not an escape from the Free daily quota.

## Corrections and unresolved facts

The existing architecture's scoped public-Tunnel warning is supported. Any wording suggesting Cloudflare universally bans Worker media should be corrected to distinguish ordinary CDN/public Tunnel from Developer Platform. Conversely, a claim that Workers Free provides unlimited, expressly approved external-origin video delivery is unsupported by the checked sources. Independent provider permission, exact account plan, quotas and production delivery must still be established; this note makes no accusation or legal determination about a provider.

Best current zero-added-subscription route: existing browser Direct first, existing tested Worker fallback where compatible, and the bounded DNS-only OVH LookMovie fallback. That is a selection among verified transports, not a single new free proxy that fixes every provider.

## Live LookMovie Cloudflare canary (2026-10-11)

An authenticated canary endpoint was deployed to `consumit-media-relay-canary.consumit-project.workers.dev` and tested against LookMovie's catalog. The endpoint performs provider resolution, HLS graph discovery, and media delivery from Worker egress so a signed link cannot silently cross egresses. The live request failed on the first catalog hop: `lmscript.xyz/v1/movies` returned a Worker-side `network-error`. Windows/Bun can fetch that same catalog successfully, but Cloudflare Worker egress could not. The source and focused tests pass; this is an upstream reachability blocker, not a manifest rewrite or browser CORS failure.

Production was not switched to the canary. The production API and OVH media route remain unchanged. Without LookMovie making its catalog and issued media usable from Cloudflare egress, or an authorized alternate egress, a Cloudflare-only relay cannot issue and serve a working LookMovie link. The canary route should remain isolated and must not be added to production provider routing based on deployment success alone.
