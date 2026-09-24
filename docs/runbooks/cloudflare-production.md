# Cloudflare production edge

Consumit keeps Next.js and Fastify on one origin and exposes only a Cloudflare Tunnel. Member authentication remains same-origin; Cloudflare never caches private or playback responses.

## Provision

1. Create a scoped Cloudflare API token that can manage the target zone, DNS, rulesets, and tunnels.
2. Copy `infra/cloudflare/terraform.tfvars.example` to an ignored `.tfvars` file and export `TF_VAR_cloudflare_api_token`.
3. Run `terraform -chdir=infra/cloudflare init`, `plan`, and `apply`.
4. Export the sensitive `tunnel_token` output as `CLOUDFLARE_TUNNEL_TOKEN` on the VPS.
5. Start `docker compose -f compose.yaml -f compose.production.yaml up -d --build`.
6. Run `bun run smoke:production` with `CONSUMIT_SMOKE_URL` set to the public HTTPS origin.

Never commit `.tfstate`, `.tfvars`, tunnel tokens, or provider credentials. Rotate a tunnel by replacing it through Terraform, updating the VPS token, verifying the new connector, and only then destroying the previous connector.

## Cache and rollback

Only immutable Next.js assets and cookie-free public catalog GETs are eligible for edge caching. Identity, member, import, progress, playback, cookies, and every non-GET request bypass cache.

## Media Worker rollout

The public embed endpoint and regular Watch route may both return Cloudflare media Worker URLs for a configured provider with `proxy: true`. Public embeds accept any site; Referer and the retired domain list grant no authority. Every Worker media request needs a signed provider-scoped grant. The Worker rate-limit binding is configured in `worker/wrangler.toml` and requires Wrangler 4.36 or newer.

1. Set the same 32-character-or-longer `HMAC_SECRET` on a **new Worker hostname** and `EMBED_HMAC_SECRET` on the API. Keep the old Worker available for existing sessions until their media URLs expire.
2. Run `bun run --filter consumit-worker build` and deploy the new Worker. Check `GET /health`, missing-token 403, and a controlled playback fixture through the new hostname.
3. Set `WORKER_URL` to that HTTPS hostname, redeploy the API, then verify regular Watch and public movie/series embeds, HLS child requests, and fallback. Watch the Worker 429 and 502 rates and API resolve failures.
4. Roll back by restoring the previous API `WORKER_URL` and image while the old Worker remains live. Retire the old Worker after its issued URLs have expired. Rotating the HMAC secret requires the same overlap procedure.

The old `?url=` proxy URLs and token format are intentionally incompatible with this Worker. Do not update an existing Worker hostname in place while old API instances are serving traffic.

For rollback, revert the Terraform change, apply, purge affected catalog/static URLs, redeploy the prior application image, and repeat smoke checks. Never enable a broad “cache everything” rule.
