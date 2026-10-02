# Playback alerts

Firing state for every rule below is visible in the admin Operations tab
(`ADMIN_METRICS_URL` must point at Prometheus). Unattended paging additionally
needs the Alertmanager receiver connected — see "Connect a receiver".

## What fires

| Alert | Meaning | First response |
|---|---|---|
| `ProviderPlaybackFailure` (≥10 errors and >50% failure for a provider × kind × region over 15m) | One provider is failing for real viewers in one region. | Check the provider status/probes in admin; reset its circuit only after the upstream recovers, otherwise it re-opens. |

Provider failures call for repairing or disabling the affected provider.

## Connect a receiver

1. Edit `infra/observability/alertmanager.yml`: replace the placeholder
   `ops-webhook` URL with the team's live endpoint (chat webhook, PagerDuty,
   or any HTTP sink for the Alertmanager JSON payload).
2. Recreate the overlay: `docker compose -f compose.yaml -f compose.playback.yaml --profile playback up -d alertmanager prometheus`.
3. Verify delivery (below). Until step 3 passes, paging is not claimed —
   rule state in admin is monitoring, not notification.

## Verify delivery

1. `bun run infra:validate` — compose configs (including the playback
   overlay) must render, and Cloudflare Terraform must validate.
2. In Prometheus (`:9090`), check Status → Runtime & Build Information shows
   no config errors, and Alerts lists ProviderPlaybackFailure with its state.
3. Trigger a test notification: post a firing test alert to Alertmanager
   (`POST /api/v1/alerts` on `:9093`) and confirm it arrives at the
   configured endpoint.
4. Confirm `/-/healthy` on `:9093` and resolved notifications (`send_resolved: true`) arrive when the condition clears.

## Silence and maintenance

- Planned provider work: silence `ProviderPlaybackFailure` for that provider
  in Alertmanager (`POST /api/v1/silences`) instead of disabling rules.
- Alertmanager silences and notification log live in the
  `consumit-alertmanager` volume; Prometheus keeps 7 days of metrics.
