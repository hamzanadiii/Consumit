# Free lookup and media locations research — 2026-10-11

This is a hosting assessment, not a provider compatibility certificate. Official provider documentation was checked on 2026-10-11. No account, paid resource, remote agent or new deployment was created for this research.

## Recommendation

Keep the already purchased OVH server and working Direct routes as the production foundation. Oracle Cloud Always Free is the strongest additional free VM candidate for a **small compatibility experiment**, followed by an optional provider-specific lookup node if it passes. Do not move all providers or the primary application to an untested free cloud location. A hosting allowance says nothing about whether Vixsrc accepts its addresses or whether issued links can play from another network.

Strictly zero extra hosting spend is achievable only within accepted free allowances or existing paid capacity. It cannot guarantee every provider or unlimited relayed viewing. For a blocked provider, a free lookup location is useful only if its issued media works across viewer networks; otherwise that same accepted location must carry the media too. This follows the paired network tests and route constraints already recorded in [ADR 0008](../adr/0008-provider-egress-and-media-routing.md).

## Oracle Cloud: best VM experiment

The current Always Free documentation allocates A1 `VM.Standard.A1.Flex` **1,500 OCPU-hours and 9,000 GB-hours per month**, equivalent to **2 OCPUs and 12 GB RAM** for an Always Free tenancy. It also offers two AMD E2.1.Micro instances, each with 1 GB RAM, one public IP and up to 50 Mbps internet networking. Combined boot/block storage allowance is 200 GB. Compute must be in the tenancy's home region. Capacity shortages can prevent creation. Idle instances may be reclaimed when, over seven days, CPU 95th percentile and network utilization are below 20%, plus memory below 20% for A1. A lightweight lookup service is therefore exposed to reclamation. Do not manufacture wasteful load to avoid it. [Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)

Oracle includes the first **10 TB/month of public internet outbound transfer**. This makes it a more plausible small media experiment than tiers offering only a few GB. The allowance is finite and shared with the tenancy's other qualifying traffic; keep headroom and confirm the account's actual meter and service limits. [Network pricing](https://www.oracle.com/cloud/networking/virtual-cloud-network/pricing/)

The separate $300 trial lasts up to 30 days. Most registrations require phone/card verification; Oracle states the card is not charged unless the account is upgraded. Stay on the free account and choose only free resources, including the image. Do not upgrade to Pay As You Go to solve capacity scarcity under a strict no-extra-cost request. Trial resources exceeding the A1 free allotment can be disabled/deleted after the trial. [Free Tier lifecycle](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm)

Free Tier has no SLA; Always Free-only users have community support and cannot raise Oracle Support service requests. Treat this as an optional failure-tolerant route, with immediate fallback to the existing production fleet. [Free Tier FAQ](https://www.oracle.com/cloud/free/faq/)

Planning calculation, not a measured capacity claim: at 5 Mbps, an hour of continuous video transfers approximately 2.25 decimal GB. A nominal 10 decimal TB represents about 4,444 viewer-hours before transport overhead, lookups, other traffic and safety margin. Ten viewers averaging two hours/day consume about 1.35 decimal TB in 30 days. The application must enforce a lower persistent monthly allowance, concurrency and transfer ceilings before enabling media. Network telemetry and the vendor meter are needed; response-body counting alone is not the provider's billing meter.

## Google Cloud: free compute is not free IPv4 hosting

Compute Engine's ongoing Free Tier includes one non-preemptible `e2-micro` worth of monthly hours in `us-west1`, `us-central1` or `us-east1`, 30 GB-months standard persistent disk and **1 GB/month outbound from North America**, excluding China/Australia. A billing account is required. The $300 trial ends at 90 days or exhausted credits; continued access requires a paid billing account, where noncovered usage is charged. [Free program](https://docs.cloud.google.com/free/docs/free-cloud-features)

Current VPC pricing charges **$0.005/hour for an in-use standard-VM external IPv4**, with only **one hour/month free**. A 30-day always-running address therefore costs about **$3.60**, even when compute is covered. External VM IPv6 is uncharged, but IPv6 alone cannot contact an IPv4-only upstream. Cloud NAT adds gateway, processing and IPv4 charges. Standard-tier internet transfer separately has a 200 GiB/month allowance; that does not remove the address charge, and is not the default Premium-tier Compute offer. [Network pricing](https://cloud.google.com/vpc/network-pricing)

Verdict: reject a conventional GCP public-IPv4 VM for the strict $0 experiment. An IPv6-only lookup node could be free in a carefully constrained configuration **only after proving every required lookup hop supports reachable IPv6**. It is not a universal provider route. An alerts-only billing budget does not stop usage or billing; Google now also documents spend-cap budgets where supported, which must be checked per service. [Budget controls](https://docs.cloud.google.com/billing/docs/how-to/budgets)

## AWS: a temporary test, not permanent free compute

New AWS customers can choose a Free account plan with $100 initial credits and up to $100 more earned. The free plan avoids charges but ends after six months or depleted credits, whichever comes first; the account then closes automatically and resource/data access is lost. A Paid plan bills beyond credits. Existing/past AWS customers are ineligible for the new free plan/credits. This project's existing AWS services do not establish eligibility for another free account. [Plan lifecycle](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html), [eligibility FAQ](https://aws.amazon.com/free/free-tier-faqs/)

Verdict: suitable only for an explicitly time-bounded compatibility test by an eligible owner, with removal before expiry. Do not describe EC2 as permanent free hosting or rotate accounts to extend trials.

## Other no-charge execution locations

| Location | Relevant current limitations | Assessment |
| --- | --- | --- |
| Render Free web service | Sleeps after 15 minutes idle; wake takes about a minute. 750 shared instance-hours/month. Filesystem ephemeral; outbound/build overages either bill or suspend when no payment method. Unusually high service-initiated internet traffic can trigger suspension. | Low-volume experiment only; unsuitable as reliable media fallback or persistent local quota store. [Free service docs](https://render.com/docs/free) |
| Koyeb Free web service | One per organization: 512 MB RAM, 0.1 vCPU, 2 GB SSD; Frankfurt or Washington. No volumes/Worker Services. Official docs say it should not serve production applications. Sleeps after one hour; cannot disable that. | Hobby compatibility experiment only. [Instance restrictions](https://www.koyeb.com/docs/reference/instances), [scale-to-zero](https://www.koyeb.com/docs/run-and-scale/scale-to-zero) |
| Koyeb transfer/account | Pricing FAQ currently says outbound is not yet billed; published future allowance is 100 GB/month then $0.04/GB, with advance notice. Card verification uses a $29 temporary hold. | Do not turn a currently unenforced bandwidth charge into an unlimited permanent-free promise. [Pricing FAQ](https://www.koyeb.com/docs/faqs/pricing) |
| Fly.io | New trial is two total machine-hours or seven days; trial machines stop after five minutes. Adding a card ends the trial and starts billed usage. | Not a permanent free node. [Trial documentation](https://docs.fly.io/about/free-trial) |
| Cloudflare Workers Free | 100,000 requests/day and 10 ms CPU/request; lookup success still depends on upstream accepting Cloudflare's egress. | Keep only already validated routes. A Worker does not become the viewer's home connection. [Runtime limits](https://developers.cloudflare.com/workers/platform/limits/) |
| Google Cloud Shell | Interactive environment: 50 hours/week, noninteractive termination after 40 minutes, sessions capped at 12 hours. | Not an always-on production node. [Quotas/restrictions](https://docs.cloud.google.com/shell/docs/quotas-limits) |
| GitHub-hosted Actions runner | Hosted job ends after six hours; private-repository Free plan has 2,000 minutes/month. | CI/testing environment, unsuitable for continuous production delivery. [Actions limits](https://docs.github.com/en/actions/reference/limits) |
| Owner's existing home computer | Existing local network is promising evidence, but availability depends on power, sleep, connection and upstream acceptance; electricity/bandwidth are real resources. | Optional small lookup node if the owner explicitly chooses to operate it. No new hosting subscription, but no guarantee of zero incidental cost. No such agent is installed. |

## Required compatibility gate before any new production route

1. Verify the owner's account is eligible, the selected resources remain free after credits expire, and the exact hostname/IP/network configuration introduces no paid dependencies. Stop if capacity requires a paid upgrade.
2. Resolve at least one movie and one supported series episode from the candidate location using the existing adapter seam and finite transport limits. Log only provider, phase, status, document kind, elapsed time and redacted hostname/fingerprint.
3. Replay the exact issued manifest, variant, init/segment and key/subtitle addresses from both the issuing node and two independent viewer connections. Test `Origin: https://consumit.online` and actual Watch CORS/decoding; HTTP 200 alone is insufficient.
4. Admit **Direct** only after browser frame decoding, advancement, seek, renewal and rendition tests pass across connections without headers the browser cannot supply. A node-valid but viewer-invalid URL is not Direct-compatible.
5. If media requires the same node, enable only a reviewed provider recipe there, with independent signed capabilities, bounded public-host validation, persistent quota, abort/backpressure, TLS, concurrency/transfer limits and fallback on quota exhaustion. Do not forward a network-bound URL to another egress.
6. Repeat after restart, idle periods and over time before making availability claims. Production must fall back cleanly if the free node disappears or limits are reached. Measure full-title playback and more viewers before increasing capacity.

None of these hosting documents promises that Vixsrc, LookMovie or the other third-party providers permit a particular cloud network. The next missing evidence is an actual candidate address and the paired playback experiment, not a larger scraper or the advertised size of a free VM.
