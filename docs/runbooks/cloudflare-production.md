# Cloudflare production edge

Consumit keeps Next.js and Fastify on one origin and exposes only a Cloudflare Tunnel. Member authentication remains same-origin; Cloudflare never caches private or playback responses.

## Provision

1. Create a scoped Cloudflare API token that can manage the target zone, DNS, rulesets, and tunnels.
2. Copy `infra/cloudflare/terraform.tfvars.example` to an ignored `.tfvars` file and export `TF_VAR_cloudflare_api_token`.
3. Run `terraform -chdir=infra/cloudflare init`, `plan`, and `apply`.
4. Install Docker Compose and Node 24 on the VPS and check out the reviewed release. Run `node scripts/production.mjs prepare` from `/opt/consumit`. This creates the ignored `.env.production` with both origins set to `https://consumit.online`, a fresh authentication pepper and local-container password, and private backup/alert files under `infra/secrets`. Repeating preparation preserves existing files and secrets. Keep a recovery copy of the Restic password outside the VPS.
5. Privately fill `.env.production`: Terraform's sensitive `tunnel_token` output as `CLOUDFLARE_TUNNEL_TOKEN`, the reviewed production database's direct connection URL with `sslmode=verify-full` and a publicly trusted certificate, `RESEND_API_KEY`, the verified `AUTH_EMAIL_FROM`, and `TMDB_API_READ_TOKEN`. Configure offsite backup and alert destinations using their runbooks, and install the reviewed provider file selected by `CONSUMIT_PROVIDER_CONFIG`. Any optional Worker relay requires matching approved origins, credentials and host policies.
6. Run `node scripts/production.mjs check`, then `node scripts/production.mjs build`. These commands select only production settings; developer `.env` files and inherited integration settings do not supply missing values. Production forces `NODE_ENV=production` and `DATABASE_SSL_MODE=require`; the plain local Postgres fallback is not a production database. Example authentication peppers are rejected at startup. Production requires the shared Valkey request-limit store; an outage does not bypass limits.
7. Start the restricted release with `node scripts/production.mjs up`. The wrapper combines base, playback, then production overlays, enables playback/monitoring, and exposes the gateway only through the Tunnel. It rejects incomplete required configuration before starting containers.
8. Run `node scripts/production.mjs smoke` against the public HTTPS origin. Exercise real registration/email verification, recovery, revocation, private reads/writes, a movie and exact series/anime episodes, fallback, saved progress, alert delivery and offsite restoration before opening traffic. Configuration preflight does not verify these integrations.

Equivalent repository commands are `bun run production:prepare`, `production:check`, `production:build`, `production:up`, and `production:smoke`. Bun is optional on the VPS; the systemd backup service invokes Node directly.

Never commit `.tfstate`, `.tfvars`, tunnel tokens, or provider credentials. Rotate a tunnel by replacing it through Terraform, updating the VPS token, verifying the new connector, and only then destroying the previous connector.

## Cache and rollback

Only immutable Next.js assets and cookie-free public title/anime catalog GETs are eligible for edge caching. Other `/v1/` routes, session-bearing API requests and every non-GET request bypass cache. The strict edge authentication rule targets `/v1/auth/`, matching the account routes.

## Public embeds (deferred)

The public `/embed` player pages and `/v1/embed` API routes are not mounted. Do not advertise iframe playback, source JSON responses, or a `PLAYER_EVENT` contract. Revisit this section only after the product and release plan explicitly bring public embeds back into scope.

The opt-in playback Compose overlay provisions an OpenTelemetry collector and Prometheus with provider playback-failure alerts. Connect and verify an alert receiver before declaring notifications live. Media travels directly from the configured provider to the browser; Cloudflare fronts the app and API only.

For rollback, revert the Terraform change, apply, purge affected catalog/static URLs, redeploy the prior application image, and repeat smoke checks. Never enable a broad “cache everything” rule.
