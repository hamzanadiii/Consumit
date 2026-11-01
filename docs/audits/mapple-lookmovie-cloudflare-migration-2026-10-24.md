# Mapple and LookMovie Cloudflare migration - 2026-10-24

## Requested outcome

The owner explicitly requests Cloudflare media relay for Mapple and LookMovie instead of the VPS media node. This supersedes the prior preferred delivery destination; switching requires playable Cloudflare delivery. The owner subsequently chose to disable both providers until Cloudflare playback works. Both durable overrides now set enabled=false (configuration revision 131), preserving their existing order and other settings. The VPS route is deactivated as recorded below.

## Checked routes

An isolated temporary Worker used the current relay code, Mapple playlist/MP4 repairs, existing host approvals, and existing relay/resolver signing credentials installed without creating a secret file. It did not fetch through the VPS, change the production relay, or widen host policies. A temporary private API listener on the existing VPS minted candidate sessions; the browser fetched media directly from the Cloudflare Worker. Native versus edge lookup were checked separately. Both default placement and an aws:eu-west-3 placement hint were exercised; a hint does not guarantee a fixed country or common upstream IP.

| Provider / route | Result |
| --- | --- |
| Mapple native lookup -> Cloudflare media, movie/episode 2160p | Session resolves; relay root receives upstream 403; no decoded frame |
| Mapple native lookup -> Cloudflare media, ordinary movie quality | Session resolves; source.jordanblackwell.bid returns 403 with cf-mitigated: challenge |
| Mapple Cloudflare lookup -> Cloudflare media | mapple.fun returns 403 with cf-mitigated: challenge on the first lookup subrequest |
| LookMovie Cloudflare helper, original code | Failed before HTTP: workerd rejects redirect mode error |
| LookMovie Cloudflare helper, corrected code | lmscript.xyz/v1/movies returns upstream 403 |
| LookMovie native lookup -> Cloudflare media, corrected issuer policy | Session resolves; browser relay returns 502 and no frame. Relay diagnostics show manifest-unsupported: the upstream replies 200 with content labeled as a playlist but its body is not HLS, including after trimStart. |

The same provider adapters can resolve/play via the existing VPS route. Neither existing VPS quota nor the API's per-provider request budget explains the isolated Cloudflare failures. No accepted Cloudflare route was established, and no completed migration or large-concurrency capacity is claimed.

## Concrete code repair

packages/media-relay/src/worker.ts: workerLookmovieHttp now requests redirect mode manual instead of error. Cloudflare's fetch implementation rejects error mode with TypeError before performing HTTP. Manual mode allows the existing response status/final-URL validation to reject unexpected redirects without following their destination.

Regression: the authenticated LookMovie fixture emulates workerd rejecting error mode. It reproduced 502 before the repair and passes afterward. A catalog redirect to an unapproved host remains rejected, with no fetch to the redirect target. All 50 relay Worker checks and the relay type check pass. The repair is workspace code plus diagnostic deployment only; production images and Workers remain unchanged in this migration attempt.

## Evidence and cleanup

Ignored reports: tmp/mapple-cloudflare-migration-candidate-20261024.json, tmp/mapple-cloudflare-lookup-and-media-candidate-20261024.json, tmp/mapple-lookmovie-cloudflare-native-lookup-candidate-20261024.json, tmp/lookmovie-corrected-edge-policy-candidate-20261024.json. Diagnostics record status, public hostname, safe classifications and playback outcome, excluding media URLs, grants, provider cookies, and signing credentials.

The temporary Worker consumit-media-relay-migration-canary and private diagnostic listener are removed after these checks. No production provider overrides, route maps, signing keys, VPS counters or services are changed by cleanup. The owner explicitly selected disabling both providers; there is no automatic VPS fallback while edge playback remains blocked.

A supported upstream route that accepts Cloudflare lookup/media requests is required before this migration can pass. Replacing the relay origin alone would convert working playback into an upstream rejection. No challenge bypass or unapproved proxy route is introduced.

## Owner-approved deactivation

Production ProviderOverride writes use the existing revisioned configuration store, record actor system:owner-cloudflare-only-20261024 in ProviderChange, and append configured outbox events in the same transaction. Revision advances from 129 to 131. Mapple movie/series order and LookMovie movie order are retained; neither row is removed permanently.

PLAYBACK_NODE_ENABLED=false and PLAYBACK_NODE_PROVIDERS={} are applied to the product API, combined fallback and Playback service, and their persisted environment/pins. The separate media environment also disables node startup. The media-egress container is stopped, preventing previously issued VPS grants from continuing to fetch upstream video. HTTPS certificates, durable reservation state, images, credentials, resource limits and unrelated provider settings are preserved.

Private rollback/evidence directory: /home/ubuntu/.consumit-disable-vps-providers-20261024. Restoration is an explicit operator action; successful Cloudflare acceptance should enable the providers on an edge route instead of restoring VPS media. Deactivation does not claim the unresolved Cloudflare routes are repaired.

Verification after activation: product API, combined fallback and Playback passed readiness with nodeEnabled=false. The media-egress container reports running=false. Actual public movie and episode provider menus both omit Mapple/LookMovie and retain 13 other choices in each checked menu. No playback or capacity acceptance is inferred for those other choices from menu presence.
