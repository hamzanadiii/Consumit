# Browser-direct playback capacity model

Architecture updated 2026-10-01 under [ADR 0003](./adr/0003-browser-direct-media-only.md). Consumit hosts the application, API, member data, metadata, and prepared captions. Video travels directly from a configured provider to the browser. There is no media relay service to deploy or budget.

An illustrative million playback starts averaging 30 minutes at 2 Mbit/s transfers roughly 450 TB from media providers to viewers. Those bytes do not pass through Consumit's VPS. This is arithmetic from assumptions, not measured demand, a bill, or a provider-capacity promise.

At the existing 25-second progress cadence, a fully signed-in 30-minute play can produce about 72 progress writes. One million such plays could produce 72 million writes. Measure member share, peak concurrency, database latency, resolver load, provider quotas, and subtitle storage before choosing server capacity. Published infrastructure pricing must be checked when selecting a deployment; this document no longer includes the retired relay's request and CPU estimates.

The API exports provider attempts, source selections, recoveries, subtitle outcomes, startup, and stall measurements through OpenTelemetry when configured. Admin Operations reads bounded Prometheus aggregates. The playback-failure alert requires a connected and verified receiver before unattended notification can be claimed. Domain, email, backups, monitoring, provider charges, and content permissions remain deployment inputs.
