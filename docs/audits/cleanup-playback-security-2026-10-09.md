# Cleanup and playback authorization — local verification

The release is prepared in `codex/cleanup-playback-security`, based on `e56cb0d`. The original checkout's uncommitted UI/provider work and local member data were left in place. Both frontend designs, controller modes, guest watching, direct-first provider order and the OVH/AWS release remain supported. No SQL migration, provisioning, account upgrade or deployment was performed.

## Implemented boundaries

- `playback-core` owns media engines, controller lifetime, renewal, subtitles, separate audio, preferences and state behavior. The original UI packages retain their different player presentations.
- `ui-core` owns identical primitives, player panels and presentation helpers. App layouts, styling and preference namespaces remain in their existing packages.
- `web-core` owns browser/server API clients, identity, catalog, progress, casting and Watch coordination. Watch server discovery and Cast loading have separate seams; apps inject their actual presentation components. Cast receiver assets have one source and are prepared before development/build.
- API and Worker share relay policy/grant primitives while each enforces authorization independently. Version-two encrypted grants bind owner, playback-session UUID, browser/cast audience, origin and expiry. Worker and API manifest requests require matching cookie proof. Cross-site requests, wrong origins, copied links, tampering, expired and legacy grants fail closed. Credentials never travel upstream; media/control responses stay private and uncached.
- Guest resolution requires successful Turnstile verification before provider work. Hostname/action matching, a five-second deadline and four-hour Valkey proof apply; validated members use account sessions. Production rejects public test keys and isolates the private Turnstile secret from inherited development settings.
- Cast uses a sixty-second single-use handoff, consumed atomically with Valkey `GETDEL`. A separate receiver cookie authorizes cast media without browser/member authority. Sender renewal and source switching create fresh handoffs while preserving position, intent and sender-owned progress.

The cleanup removes identical implementations and their duplicate unit suites, retaining integration coverage in both applications. Only demonstrated redundant files were removed, including the two now-unused app ad-placeholder stylesheets. Historical migrations and provider adapters remain. Optional telemetry/cache/reader-cleanup failures were reviewed as best-effort paths; authorization and verification store failures are not silently swallowed. External SDK structural interfaces remain confined to their SDK seams, while API/provider/grant inputs use validated schemas. The retained legacy embed metadata loader is also shared: its former unchecked JSON cast is replaced with a bounded schema that rejects malformed sources, private/credential URLs and credential headers. A five-second request deadline preserves its honest empty/fallback state; public embed APIs remain deferred.

## Local checks

| Check | Result |
| --- | --- |
| Standard `bun run test` | Passed: 1,796 workspace checks and 19 script checks at the standard-suite snapshot; later changes received the targeted checks below. Consolidated unit coverage explains the reduced duplicate count. |
| Latest targeted regressions | Passed: production API settings, shared media URL validation, both Watch integrations, shared verification/Cast loading, and receiver VM checks. All 20 script checks pass after the environment-isolation regression. Eight shared legacy embed boundary checks and seventeen embed/SEO integration checks in each frontend also pass. |
| Workspace lint and type checks | Passed, including latest shared Watch changes. |
| Both frontend builds, API and Worker builds | Passed. |
| Final Docker images | Passed: `consumit-cleanup-api:local`, `consumit-cleanup-web:local` and `consumit-cleanup-next-web:local`. Both standalone frontend images also booted in disposable containers with networking disabled, served the protected Cast receiver and rendered the shared Watch unavailable fallback. Those checks exercised no API/database and established no live playback claim. Smoke containers were removed. |
| Infrastructure validation | Passed: Compose configuration, both Nginx configurations, Cloudflare/AWS Terraform format/validation and fourteen production alert rules. No Terraform apply occurred. |
| Import/duplication guard | Passed across 680 production TypeScript files. Negative probes confirmed rejection of exact duplicated implementations and a transitive browser → app alias → Node built-in import. Exceptions document route wrappers and differing presentation composition. |
| Browser playback fixtures | Original frontend: 20 general checks passed, 3 explicitly optional checks skipped. Second frontend: 28 startup/playback/visual checks passed. Original visual desktop/touch recheck: 2 passed; representative captures from both designs were inspected. |
| Protected relay browser fixtures | 8 passed across both frontends, desktop and touch: real version-two HLS/native decode, seek, authorized requests, copied-link rejection, foreign-origin rejection, private caching and native Range responses. |

The protected fixtures exposed and fixed rejection of loopback first-party relay URLs in development. HTTP remains limited to loopback development/explicit fixture mode and a bounded grant path; unrelated HTTP/private provider URLs remain rejected. The fixture server now accepts long encrypted grant paths without weakening production routing. A fresh isolated Next development output directory resolved stale route-cache startup during the test run.

## Launch gates and limits

Real HTTPS Turnstile, guest/member playback, subtitles, separate audio, saved progress and renewal require the provisioned VPS and private settings. Actual Chromecast hardware must verify cookie support, nonce pairing, replay rejection, source changes, renewal, position and playback intent. The fifty-session, ten-minute baseline remains pending (warm page/API p95 below two seconds and under 1% unexpected server errors). Real SES delivery, S3 restoration and Telegram/external-outage alerts remain gates in the existing production runbook.

Copied Consumit relay links require authorization. Direct provider URLs remain visible, and authorized viewers can capture or retransmit media. This release does not claim DRM or eliminate provider/Cloudflare Free capacity limits.

Use the [protected playback rollout](../runbooks/protected-playback.md) for private settings and coordinated API/frontend/Worker cutover. Reject version-one grants after cutover and require existing playback to renew. Keep the existing deployment recovery procedures and previous application images.
