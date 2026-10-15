# Free provider lookup-node candidates

Checked 2026-10-11 against official documentation. The operator wants a separate always-on lookup location without buying an untested server. This is research, not provisioning or a production route approval. No free cloud network has been tested against the configured providers.

| Candidate | Current documented offer | Implication for Consumit |
| --- | --- | --- |
| Oracle Cloud Always Free | Up to two AMD micro VMs, or ARM A1 allowance equivalent to 2 OCPUs and 12 GB RAM; 200 GB combined boot/block storage; 10 TB monthly outbound transfer | Strongest candidate to test a lookup node and potentially bounded same-node media. Free regional capacity can be unavailable; idle instances may be reclaimed. |
| Google Cloud Compute Engine Free Tier | One eligible US-region e2-micro, 30 GB standard disk and 1 GB eligible outbound transfer per month | Possible small lookup test; this VM allowance is insufficient for ongoing video relay. Account networking charges require separate review. |
| AWS new-customer Free plan | Up to six months or exhaustion of available credits, whichever comes first | Temporary test environment rather than a permanent free provider node. |

Sources: [Oracle Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm), [Google Free Tier](https://docs.cloud.google.com/free/docs/free-cloud-features), [AWS account plans](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html).

The recommendation is to test an available Oracle Always Free Ubuntu instance first, retaining the existing OVH application and proven LookMovie fallback. Inspect the account's actual Always Free eligibility and limits before creating resources. ARM images/builds need compatibility verification; the present deployed x86 image cannot simply be assumed portable.

Successful provider lookup is the first gate. Next, issue fresh movie and episode sources and test real Chrome playback from another network, including playlist, sampled segments, seeking and renewal. A returned URL or HTTP 200 alone is insufficient. Keep browser-compatible sources Direct. If a source is bound to the resolving network, complete delivery must use that node's separately reviewed and budgeted relay. Existing approved Worker rows keep their own route.

A single VPS can host multiple adapters, but that does not establish that every provider accepts its data-center IP or that all viewers can consume its issued URLs. Oracle acceptance, uptime and actual capacity are unproven. Do not migrate all providers or promise local parity before these tests.
