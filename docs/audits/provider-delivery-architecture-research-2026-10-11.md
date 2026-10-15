# Provider delivery architecture research: 2026-10-11

This is a researched proposal, not a deployed delivery change. No infrastructure was purchased or modified. Official service documentation was checked on 2026-10-11. The installed OVH service's precise plan, region, contracted port speed, traffic allowance and applicable agreement are not established by this research.

## Finding

Keep browser Direct for sources that actually decode and seek from the member's browser. For sources whose access depends on resolving egress, resolve and fetch the entire required media graph through the same stable public egress. A separate media service on the existing OVH VPS is a candidate for LookMovie: the API remains control-only, while an explicitly approved relay service streams video. This is Relay delivery, even if it uses the existing server and avoids Worker request charges.

That recommendation is an inference from Consumit's [production parity audit](./provider-production-parity-2026-10-10.md), which compares identical fresh LookMovie root and sampled segment URLs on OVH and Windows. Only OVH can fetch OVH-issued samples. A lookup-only Worker changes the issuing egress without giving the browser that egress. A new relay must still prove full Watch playback, seek, captions, quality changes and renewal; the paired HTTP evidence alone does not certify it.

Subsequent private experiment: the proposed same-OVH media mechanism decoded 1920×800 LookMovie movie-550 video, sought and resumed in Windows Chrome over a private SSH loopback tunnel. The actual production-issued root and two TS requests returned 200. This is a runnable sample proof, not a public deployment or complete release gate; [proposed ADR 0008](../adr/0008-provider-egress-and-media-routing.md) records the prototype and remaining scope.

Vixsrc fails before a source exists on every tested production egress. A media sidecar on those egresses cannot manufacture that source. Fresh developer-connection lookup and production-origin browser checks pass for movie 550 and series 1396 S1E1, while OVH cannot fetch the locally issued movie root. This supports testing a reviewed always-on lookup node on an accepted connection, with independent Direct delivery compatibility checks and stable same-node delivery only when required. It does not certify the developer laptop as production infrastructure, every viewer IP, or a newly purchased VPS. Provider-approved integration or a compatible published player remain other possible paths. No challenge-solving scraper, rotating proxy pool or forged client IP is proposed.

## Route and service constraints

| Candidate | Verified constraint | Design consequence |
| --- | --- | --- |
| Current public Cloudflare Tunnel | Public hostname traffic traverses Cloudflare's reverse proxy; Tunnel documentation explicitly requires a specific paid service for video and large files on Free, Pro and Business. | Do not attach a high-volume VPS media sidecar to the current Free Tunnel and assume ordinary website delivery covers it. Keep web/API on the existing route. [Tunnel routing](https://developers.cloudflare.com/tunnel/concepts/routing/), [Tunnel FAQ](https://developers.cloudflare.com/cloudflare-one/faq/cloudflare-tunnels-faq/) |
| Ordinary Cloudflare CDN | Current application-service terms require specified paid services for video/large-file delivery and permit limiting the CDN when used without them. | Cache bypass does not by itself establish permission: the text concerns serving as well as caching. [Application-service terms](https://www.cloudflare.com/service-specific-terms-application-services/) |
| Workers Free | 100,000 requests/day/account, 10 ms CPU/invocation, 128 MB memory, 50 external subrequests/invocation and six simultaneous outbound connections. | Maintain a bounded fallback and measure actual quota/CPU consumption. A large rewritten playlist can fail despite available request quota. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) |
| Workers Paid, comparison only | $5/month minimum; 10 million requests and 30 million CPU ms included, then $0.30/million requests and $0.02/million CPU ms. The pricing page states no additional egress or bandwidth charge. | Published pricing is not a commitment to arbitrary volume or stable upstream IP; no upgrade was activated. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) |
| Developer Platform usage | Cloudflare may limit requests/storage for network burden; associated developer documentation and applicable third-party terms still apply. | Cheap published request pricing does not certify the proposed relay's suitability. Preserve the existing trial's unresolved service-approval limits. [Developer Platform terms](https://www.cloudflare.com/service-specific-terms-developer-platform/) |
| Separate DNS-only media hostname | DNS-only records send clients directly to the origin and expose its IP, removing Cloudflare proxy protection and HTTP analytics for that hostname. | A VPS sidecar needs its own public HTTPS listener, abuse controls and host capacity; it cannot inherit the private Tunnel gateway's assumptions. [DNS proxy status](https://developers.cloudflare.com/dns/proxy-status/) |
| TLS on a direct hostname | Direct client connections need a publicly trusted certificate; a Cloudflare Origin CA certificate is trusted only by Cloudflare. | Provision and renew a proper browser-trusted certificate before exposing a media hostname. [DNS-only preparation](https://developers.cloudflare.com/dns/proxy-status/enforce-dns-only/) |

Cloudflare documents dedicated CDN egress separately. Its Workers behavior depends on invocation route, and outbound TCP does not use dedicated CDN egress. This research does not establish that the current Free Worker has stable outbound IP affinity or that a dedicated-egress product is available within the selected budget. [Dedicated egress and other products](https://developers.cloudflare.com/smart-shield/configuration/dedicated-egress-ips/other-products/)

## OVH bandwidth is an account check, not an unlimited-capacity assumption

OVH's current general VPS page advertises unmetered transfer with plan-specific port speed. It explicitly distinguishes Asia-Pacific monthly allowances (1 TB for VPS-1/2, 3 TB for VPS-3/4, 4 TB for VPS-5/6) and 10 Mbps throttling beyond allowance. These are current offer descriptions, not evidence of the already purchased VPS's contract. Confirm its Manager service details and order terms before setting a media budget. [OVH unmetered VPS](https://www.ovhcloud.com/en/vps/unmetered-vps/)

Official agreements vary by contracting entity and date. For example, an older Asia VPS agreement permits excessive-use restriction to 1 Mbps; current US service-specific terms permit restrictions for intensive shared-bandwidth use. Neither is asserted to govern Consumit's account. They demonstrate why marketing copy must be reconciled with the actual service agreement. [OVH Asia VPS agreement](https://www.ovh.com/asia/support/termsofservice/Special_Conditions_for_Virtual_Private_Server_Asia.pdf), [OVH US service-specific terms](https://us.ovhcloud.com/legal/service-specific-terms/)

## Smallest architecture slice to prove

1. Keep existing Direct sessions and independently approved Worker Relay providers unchanged.
2. Prototype one explicit LookMovie OVH relay registration, independent of its Direct row. Resolve through a transport with a known OVH public address, and fetch playlists, segments, maps, keys and required captions through that same address. Verify IPv4/IPv6 behavior instead of assuming the same machine implies the same egress.
3. Run a separate media process with CPU/memory/concurrency and byte budgets. The API issues short-lived session capabilities and manages provider selection; it never becomes the video streaming process. Signed capabilities bind the provider, approved HTTPS graph, session, expiry and permitted operations. Host validation, public DNS pinning, bounded redirects, cancellation and streaming backpressure remain mandatory.
4. Expose only the media listener through a separately reviewed DNS-only HTTPS hostname, or choose a service explicitly suitable for the delivery. Keep API, database, management and normal gateway listeners private. The direct listener needs rate/connection limits, byte accounting, Range support, precise CORS, redacted logs and no arbitrary URL input.
5. Prove one real Watch movie end to end, then quality selection, seek/resume, renewal and simultaneous viewers. Fail closed at the concurrency/byte cap and continue to the existing approved fallback. This changes ADR 0005's Worker-only Relay transport foundation and needs an explicit decision before production activation.

## Cost and capacity model

These are calculations, not observed traffic or server guarantees. At a sustained 4 Mbps, one viewer transfers about 1.8 GB/hour. Twenty simultaneous viewers need approximately 80 Mbps of outbound media capacity and transfer about 36 GB/hour, before overhead and retries. The relay also fetches those bytes upstream. Deduct web/API/backup traffic and retain headroom when choosing a cap; throughput and protection of the shared app are the cost even if the account's transfer volume is included.

For a Worker with six-second HLS segments, video alone is approximately 600 requests per viewer-hour. The 100,000-request Free daily budget then corresponds to roughly 166 viewer-hours/day before playlists, audio, keys, retries and all other account Workers. Actual segment length and separate audio alter this substantially; measure the real graph. A resolver-only Worker is cheap because it moves few bytes, but it cannot solve the demonstrated full-media egress binding.

## Open facts before rollout

- Actual OVH plan, location, allowance, port speed and current agreement.
- Available network/CPU/memory headroom under app, database and backup load.
- Browser-tested stable-egress LookMovie delivery through the proposed service, including renewal and every allowed graph reference.
- Appropriate public media exposure and certificate lifecycle; DNS-only reveals the same VPS IP and reduces the app's origin concealment.
- Any Cloudflare approval/service choice required if video is routed through Cloudflare rather than the direct origin.
- Provider availability remains title/time/region dependent. This design repairs a specific delivery mismatch; it cannot guarantee every challenged provider behaves as on the developer's home connection.
