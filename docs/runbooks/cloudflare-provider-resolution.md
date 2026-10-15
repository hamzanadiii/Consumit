# Cloudflare provider resolution

The Resolver Worker is a lookup service. The API remains authoritative for provider order, health, sessions, Admin settings, and output validation. Each API-selected provider attempt makes one authenticated Worker request, except the explicitly configured Miami Relay lookup below; an unsuccessful attempt proceeds through the existing API waterfall. Browser-direct media and its segments do not pass through either Worker.

## Deploying the Worker

Build and inspect without publishing:

```powershell
wrangler deploy --dry-run --config infra/cloudflare/provider-resolver.wrangler.jsonc
```

The production Worker is enabled at `https://consumit-provider-resolver.consumit-project.workers.dev`. New environments should keep the resolver disabled until their own canary is ready. Store one high-entropy secret in the private API environment and the Worker secret store; both sides must use the exact same value. When rotating it, update both sides in the same deployment window.

```powershell
wrangler secret put RESOLVER_SECRET --config infra/cloudflare/provider-resolver.wrangler.jsonc
wrangler deploy --config infra/cloudflare/provider-resolver.wrangler.jsonc
```

The API uses the same secret through `PLAYBACK_RESOLVER_SECRET`, plus the Worker's HTTPS origin in `PLAYBACK_RESOLVER_ORIGIN`. Production currently has `PLAYBACK_RESOLVER_ENABLED=true`; the secret is held in the private API environment and Worker secret store. Do not put it in Worker vars, provider configuration, browser settings, or logs.

## Canary checks and rollout

Test the Worker endpoint from the real production API caller using one approved provider row and a canonical test title. A developer-originated invocation can produce a different upstream response. Confirm authentication, bounded request handling, one selected adapter, current Admin config, canonical metadata without TMDB credentials, and API-side source validation. Then test each configured Direct and Embed adapter from the actual Worker egress. Direct checks must include browser playback from the production origin; Embed checks must verify frame behavior and progress semantics. Test each relay row separately for manifests, segments, seeking, captions, renewal, and egress compatibility.

On 2026-10-11 the Resolver Worker canary tested all 48 configured adapter rows: 24 emitted a candidate source (12 Direct, 6 Relay, 6 Embed); the remainder failed or returned an edge error. Vixsrc and LookMovie returned `unavailable`. The API is now connected; a live movie-550 request returned a Direct HLS session after Worker resolution and API source validation. This does not establish browser playback for every provider or complete acceptance of each relay route. The [canary audit](../audits/cloudflare-provider-resolver-canary-2026-10-11.md) lists the results and limits. Do not enable a paid Workers plan automatically.

The Worker allows at most 50 upstream subrequests and 15 seconds per provider invocation. Free-plan CPU exhaustion, daily request exhaustion, upstream blocks, malformed output, timeout, and host-scope failures all count as that provider attempt failing. The API then selects the next provider without an API lookup retry. Each Worker fallback attempt is another incoming Resolver Worker request.

## Regional provider routes and computation (2026-10-12)

The API's private `PLAYBACK_RESOLVER_PROVIDER_ORIGINS` map sends `animekitsu`, `evion`, `rigel`, `animekai`, `reanimeframe`, `megaplayframe` and `rivemirage` to `https://consumit-provider-resolver-europe.consumit-project.workers.dev`. `PLAYBACK_RELAY_PROVIDER_ORIGINS` sends `rigel`, `animekai`, `rivemirage` and `aphrodite` to `https://consumit-media-relay-europe.consumit-project.workers.dev`. Maps accept at most 64 approved ID/exact HTTPS-origin pairs without credentials or paths. An attempt calls only that origin; failure follows normal provider fallback. Region placement is a hint and must be tested from the real API caller.

Regional base configs are `infra/cloudflare/provider-resolver.regional.wrangler.jsonc` and `infra/cloudflare/media-relay.regional.wrangler.jsonc`. Their checked-in enable flags are false. Private production copies enable the tested routes. Set the same existing `RESOLVER_SECRET` on both Resolver deployments and the same `RELAY_SECRET` on both Media deployments (API fields `PLAYBACK_RESOLVER_SECRET` / `PLAYBACK_RELAY_SECRET`). Rotating either key requires updating the API and every active corresponding Worker, not just the default deployment. Preserve the default Media Worker policies and Miami exception.

The regional Media allowlist contains Rigel's exact `api.dlproxy.com` host, AnimeKai's tested `edge1-waw-sprintcdn.r66nv9ed.com` / `edge2-waw-sprintcdn.r66nv9ed.com` hosts, and Mirage's `cine4k.mpddash.workers.dev`, `carwashonline.site`, `nectronincllc.store` and `buswashsolarpanel.click` hosts. Do not widen this from arbitrary source output. `PLAYBACK_RELAY_CONTROL_PROVIDERS='["rigel"]'` makes the API compile only Rigel control playlists fetched by the authenticated Cloudflare Media endpoint. Mirage uses the normal Media Worker rewrite path; its 720p decode/seek/uploaded-caption acceptance does not establish 4K rendering or Free-plan capacity. Video, keys and maps remain Cloudflare requests. Each control playlist fetch also invokes its Media Worker; compiling in the API does not make the upstream read free.

The production roster is a private file at `/opt/consumit/infra/secrets/providers.production.json`, mounted read-only into the API. Atomic replacement must preserve its existing uid/gid/mode (currently 1000/1000/0600), not just file content. Validate readability as the API image's `bun` user before restarting. A root-owned 0600 replacement prevents API startup; rollback must restore ownership as well as the old JSON and environment. Guarded snapshots now include the roster metadata. Append only the reviewed Mirage row and mutate only its override; do not replace the live roster with the developer's older local roster or restore unrelated Admin settings.

Aphrodite's production route uses the default Resolver Worker and Europe Media Relay. The production relay map includes exact hosts `stream.hls.lol`, `iad-01.transcode.cfd`, and `totallyacdn.org`; `PLAYBACK_RELAY_PROVIDER_ORIGINS` pins Aphrodite to `https://consumit-media-relay-europe.consumit-project.workers.dev`. The adapter's recorded `https://atlantic.st/` Referer is preserved across this approved host graph. A raw browser request did not pass the Direct test, and the default Media Worker returned 403; the Europe Relay passed the real 1080p Watch, seek, and continuing-frame canary. Aphrodite does not use the Miami API lookup exception or OVH media.

AnimeKai's regional Resolver sets `RESOLVER_COMPUTE_ORIGIN=https://consumit.online` and holds a separate `RESOLVER_COMPUTE_SECRET`. The API must first run the computation service with `PLAYBACK_RESOLVER_COMPUTE_ENABLED=true` and the identical `PLAYBACK_RESOLVER_COMPUTE_SECRET`. This secret must differ from the Resolver lookup secret; keep it out of vars/logs/provider rows. The fixed `/v1/internal/animekai-pow` endpoint accepts nonce/difficulty only (512 characters, difficulty 0–18), runs at most two isolated jobs, caps jobs at eight seconds and rate-limits the route to 20 requests/minute per its configured limiter. It performs no provider I/O. Worker requests use manual redirect mode and refuse every non-success response; no authentication is forwarded to a redirect destination. The helper callback counts toward the 50-subrequest invocation budget. Saturation returns a provider failure; it does not fall back to OVH lookup.

Deployment order is API helper and key, regional Worker keys, Workers, then API routing maps / tested Relay settings. Disabling a route means removing its map entry and its corresponding Relay policy/settings together; default egress may remain unavailable. To disable computation, first remove `RESOLVER_COMPUTE_ORIGIN` from the regional Worker and redeploy, then disable the API flag and recreate the API. The local solver may exceed Worker CPU, so this is rollback, not equivalent healthy service.

Keep the current plan. Tail outcome, CPU, duration and subrequests alongside real Watch failures; do not log signed URLs or nonce/auth data. After repair, sampled AnimeKai/Rigel invocations still used 14–20 ms CPU while returning `ok`, above the nominal Free CPU allowance. Occasional isolate flexibility is not a stable capacity guarantee. Capacity exhaustion must remain a provider failure and trigger the existing waterfall. See the [repair audit](../audits/provider-repairs-2026-10-12.md) for exact versions, backups and sample limits.

## Reviewed Miami lookup exception

The owner approved `PLAYBACK_RESOLVER_API_PROVIDERS='["wecollege-miami"]'` on 2026-10-12 after API lookup plus Cloudflare media passed browser playback and seeking. This routes only Miami in Relay mode through its captured original API adapter. The normal source validation, scheduler, health, limits and signed Cloudflare media grants still apply. A live Admin delivery-mode change to Direct restores Worker lookup. No other IDs, duplicate entries or malformed values are accepted. `[]` or an absent value disables the exception. Do not widen this list or enable the OVH media node.

Roll back this exception by setting the value to `[]` in the private production environment and recreating only the API with the normal production deployment procedure. Miami then returns to Worker lookup and may be unavailable. The guarded production installation retains prior sources, private environment and image tags for full rollback.

## Media relay

The separate Media Relay Worker is deployed from `infra/cloudflare/media-relay.wrangler.jsonc` and enabled for its existing approved provider map. Add rows only after they pass the complete relay canary. Only explicit relay rows receive signed grants. A direct source, manifest, and its segments continue to travel from the browser to the provider, so direct delivery incurs no Media Relay requests.

The OVH media-node route is disabled in production (`PLAYBACK_NODE_ENABLED=false`) and its media containers are stopped; persistent volumes remain for rollback. The Cloudflare Media Relay remains enabled only for its approved provider map. OVH may continue to host the API/control plane. See the [deployment audit](../audits/cloudflare-provider-resolver-production-2026-10-11.md) and [ADR 0009](../adr/0009-cloudflare-provider-resolution.md).

## Relay recovery status (2026-10-12)

The production Media Relay Worker was refreshed as deployment `36bfdc49-0a84-49bf-b032-1dd85ca9186b` with 16 approved provider IDs. A request from `https://consumit.online` receives CORS preflight 204; malformed/unsigned grants fail closed with 403. The API has the same active allowlist and does not include `lookmovie-relay`. Do not add a provider to either allowlist until its source resolution and browser media flow pass end to end.

The production API health endpoint is `https://consumit.online/health/ready` (200). Miami initially returned `PLAYBACK_UNAVAILABLE` from the Resolver Worker before media relay. The approved API lookup exception now passes real Watch 720p playback and seeking on movies 550 and 680, with all 39 observed Cloudflare media responses returning 200 and an uploaded VTT rendered on movie 550. LookMovie's authenticated Worker lookup returned `network-error` at `lmscript.xyz`; its earlier same-egress OVH media path remains disabled. The relay's CORS response alone does not prove that a source can be resolved, and the media Worker cannot relay bytes without a valid source and signed grant. See the [recovery audit](../audits/cloudflare-media-relay-recovery-2026-10-12.md).
