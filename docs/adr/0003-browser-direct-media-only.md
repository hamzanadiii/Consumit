# Serve browser-direct media only

Status: superseded for approved relay trials by [ADR 0005](./0005-direct-first-worker-relay.md) on 2026-10-03. The original direct-only cleanup below remains historical.

On 2026-10-01 the product owner chose a smaller direct-playback provider roster and removal of the media relay. Consumit resolves validated HTTPS media and the browser fetches it directly; a failed source renews or falls back to another direct provider while retaining member progress and playback intent. The media Worker, signed relay grants, delivery-mode controls, relay metrics, and relay deployment settings are removed rather than kept as a hidden fallback.

This trades some provider coverage for a simpler delivery path and removes Consumit's video bandwidth dependency. A resolution success alone does not establish playback compatibility: adding or repairing a configured row requires browser first-frame evidence from the Consumit origin. CDN host allowlists remain narrow, relay-wrapped URLs and credentials are rejected, and provider output never executes as server-side code. Independent caption preparation and the web/API gateway remain part of the platform.
