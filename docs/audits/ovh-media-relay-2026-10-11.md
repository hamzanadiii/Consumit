# Bounded LookMovie OVH fallback deployment

Captured 2026-10-11. The member job is Watch playback when LookMovie issues media tied to the resolving OVH network. Browser Direct remains preferred for compatible providers; this slice adds an explicitly approved relay row rather than changing every provider's delivery mode.

## Installed route

Release: `e84060152707-20261011T170313613Z`. Private rollback directory: `/opt/consumit/infra/secrets/media-node-backups/20261011T170313476Z`. The guarded installer verifies prior source and provider hashes, builds immutable images, starts the isolated media project with API activation disabled, and enables the new route after public playback proof. The previous 48 provider override records compare identically after activation; only `lookmovie-relay` is added. No database migration, paid-plan activation or server purchase occurs.

`media.consumit.online` has the operator's DNS-only IPv4 record, no authoritative AAAA record, and a browser-trusted Caddy certificate. Public TCP 80/443 serve only the bounded media route. The site and API retain their Tunnel. The media container has its own signing key and private environment without identity, database or catalog credentials; its Docker network contains no application/database service. Default Caddy and access logs discard request paths to keep signed capabilities out of logs.

The `lookmovie-v1` recipe checks numbered CDN host shapes before discovery. Bounded graph validation derives exact session hosts; the relay validates capabilities and public-DNS pins every upstream socket. The ordinary Worker rejects this node-only recipe. Range and HEAD, abort cleanup, transfer deadlines, aggregate pacing and persistent fail-closed quota accounting share the reviewed transport.

## Measured production behavior

- Public HTTPS Chrome tests for movies 550 and 680 each decode at 1080p and 720p, seek to 60 seconds, and resume. Roots and requested video segments return HTTP 200 with usable media.
- Actual deployed Watch and the owned player decode and seek both titles. The harness only pins the explicit relay provider on the real resolve request; deployed scripts, responses, headers and media remain unchanged.
- Movie 550 switches through the actual Quality menu to 720p, loads provider English caption cues, and renders both uploaded SRT and VTT while keeping each upload selected.
- Both viewers advance for 160 seconds concurrently without a fallback event in the final run. This is a short canary, not a viewer-capacity certification.
- A healthy same-session refresh issues a fresh capability from the same provider and node, and Chrome decodes that capability. This explicitly requested renewal does not certify automatic gapless recovery at token expiry.
- Purstream movie 550 and series 1396 S1E1 still decode, seek and render provider captions through Direct; its uploaded SRT/VTT checks pass again following the API rollout.
- Public root returns 404. A forged media capability returns 403 before upstream media work. TLS verification is enabled in the public checks.

Sanitized ignored reports are `local/production-playback/public-media-report.json`, `lookmovie-watch-report.json` and `production-watch-report.json`. Expected aborted requests during quality replacement and probe cleanup are distinguished from HTTP failures. An initial test harness used the wrong Settings label; it was corrected before the successful final Watch checks.

## Verification and limits

The SDK suite passed 330 tests at the runtime checkpoint, API 518, and media relay 48. Subsequent focused API coverage passed 65 tests, including the new configured-provider routing gates. Runtime package types and lint, production configuration/build and HTTPS smoke pass. Tests cover unrelated-host rejection before discovery, node/Worker key and origin separation, forged grants, request-capacity rejection, cancellation, deadline cleanup, persistence failure and restart-safe quota accounting.

Admission defaults are 16 active HTTP requests, a burst of 60 replenishing at five requests/second, 60-second transfer deadlines, 1,500,000 bytes/second aggregate response-body pacing and an 8,000,000,000-byte UTC daily quota. Quota persists before bytes are released and survives restarts. These are conservative controls; HTTP request concurrency is not viewer count, and response-body accounting excludes protocol overhead and other OVH traffic. Purchased OVH bandwidth entitlement and port capacity remain unverified.

During the sampled two-viewer run the media container used about 47 MiB of its 256 MiB limit, and Caddy about 13 MiB of its 128 MiB limit. Full-title playback, larger concurrency, physical Safari, casting and automatic expiry recovery remain open. No all-title or all-provider claim follows from these movie samples.

Vixsrc still challenges OVH and the tested Worker before returning a source. An accepted always-on lookup location and independent cross-viewer playback proof are needed. No permanent agent is installed on the operator's computer. Other failed providers remain candidates for separate lookup and complete delivery tests.

See [ADR 0008](../adr/0008-provider-egress-and-media-routing.md) and the [media runbook](../runbooks/ovh-media-relay.md) for route boundaries and rollback. Rollback stops only the separate media project and restores the previous API source/configuration/image; it preserves member data, original overrides, certificate volumes and the quota file.
