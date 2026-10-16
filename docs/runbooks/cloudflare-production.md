# Cloudflare production edge

The current release follows the [OVH + AWS production runbook](./ovh-aws-production.md)
and [ADR 0007](../adr/0007-ovh-aws-production.md). These replace the earlier managed
PostgreSQL/Resend/Storage Box setup.

Cloudflare Free exposes only the private Nginx gateway through Tunnel. The
original frontend and API share https://consumit.online. Immutable assets and
cookie-free catalog GETs may cache; private/mutable/playback APIs and readiness
bypass cache. API readiness is proxied through /health/ready with no-store.

The Free plan has one authentication rate rule targeting /v1/auth/: ten requests
per IP/colo over ten seconds with a ten-second block. Application Valkey budgets
and gateway body/request protections remain active. A separate WAF registration
gate defaults closed except configured tester IPs and opens only after launch
verification. The first-party player, direct media and Free relay remain intact.

Terraform requires a scoped private API token and ignored state/tfvars. Runtime
Tunnel credentials use a private token file. The independent outage monitor is
infra/uptime/worker.mjs; its KV state and private Telegram secrets live outside
OVH. Follow the main runbook for setup, verification and rollback.
