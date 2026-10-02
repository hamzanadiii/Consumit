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

## Public embeds (deferred)

The public `/embed` player pages and `/v1/embed` API routes are not mounted. Do not advertise iframe playback, source JSON responses, or a `PLAYER_EVENT` contract. Revisit this section only after the product and release plan explicitly bring public embeds back into scope.

The opt-in playback Compose overlay provisions an OpenTelemetry collector and Prometheus with provider playback-failure alerts. Connect and verify an alert receiver before declaring notifications live. Media travels directly from the configured provider to the browser; Cloudflare fronts the app and API only.

For rollback, revert the Terraform change, apply, purge affected catalog/static URLs, redeploy the prior application image, and repeat smoke checks. Never enable a broad “cache everything” rule.
