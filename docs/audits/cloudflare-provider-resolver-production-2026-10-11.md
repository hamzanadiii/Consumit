# Cloudflare provider resolver production deployment

Date: 2026-10-11  
Status: deployed and API smoke-tested

## What changed

- Published Resolver Worker `consumit-provider-resolver` at `https://consumit-provider-resolver.consumit-project.workers.dev`, version `e8f4fba7-22f2-4ab5-ad6a-aa2e3f226b74`, with `RESOLVER_ENABLED=true`.
- Connected the production API image `consumit-api:e84060152707-20261011T212711214Z` using `PLAYBACK_RESOLVER_ENABLED=true`. The shared secret is stored only in the Worker secret store and the root-owned `/opt/consumit/.env.production` on the VPS.
- Every configured API provider attempt now goes to the Resolver Worker. The API still owns scheduling, health, sessions, Admin settings and source validation. Resolver failures continue through the API waterfall.
- Set `PLAYBACK_NODE_ENABLED=false`, removed its origin, secret and provider map from the API's active environment, and stopped the separate OVH media containers. Their persistent volumes and a private pre-change configuration copy remain available for rollback. The existing Cloudflare Media Relay stays enabled for its approved provider map.

## Verification

- Production configuration preflight passed before and after the change.
- A physical PostgreSQL backup and encrypted configuration backup completed before the API update.
- The API image build, API health check and production HTTPS smoke check passed.
- A real `POST /v1/playback/resolve` request for movie 550 returned HTTP 200 with a session and a Direct HLS source. A sampled Cloudflare Worker tail recorded provider attempts from the API's OVH address, confirming the live API-to-Worker request path.
- After disabling the OVH node route and stopping its containers, another movie-550 request returned HTTP 200 with a Direct HLS session. The API container remained healthy with Resolver enabled, OVH node disabled, and Cloudflare relay enabled.
- The Worker-only 48-row canary produced candidates for 12 Direct, 6 Relay, and 6 Embed rows. Vixsrc and LookMovie returned unavailable. This is adapter-resolution evidence, not browser playback acceptance or full relay validation.

## Limits and rollback

The live API request confirms a source can pass Worker resolution and API validation; it does not prove that source plays in every browser or that every provider works. Test playback in the production Watch page, including captions and seeking. Keep provider fallback behavior enabled for routes that fail.

The DNS-only `media.consumit.online` record still resolves to the VPS address, but the OVH media containers are stopped and the API no longer has their signing credentials. DNS cleanup is separate from playback routing.

Private rollback files are under `/opt/consumit/infra/secrets/provider-resolver-backups/20261011212636839`. To restore the prior API configuration, restore the backed-up source and `.env.production`, then recreate only the API with its prior image tag. The OVH media project can be recreated from its retained configuration and named volumes if explicitly needed; do not enable it as a normal fallback.
