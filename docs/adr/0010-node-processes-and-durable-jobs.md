# ADR 0010: Node processes and durable background jobs

Status: Accepted; product API and durable workers deployed on 2026-10-14, with a 1% playback canary. Full playback promotion requires the rebuild acceptance evidence.

Consumit keeps its web, product API, application-owned authentication, catalog adapters, and Player. Product requests run on Node 24.21.0 while Bun remains the installer and builder. Playback coordination runs in `apps/playback`; scheduling runs in `apps/worker`, with a separate browser entrypoint reusing the sandboxed episode check. This isolates provider latency and browser work from member writes within the existing Compose/VPS deployment.

PostgreSQL owns durable member records, provider configuration, release leases, reminders, and the transactional outbox. A third Valkey instance with AOF and noeviction carries BullMQ jobs. Queue delivery may repeat or disappear; committed outbox rows and existing domain uniqueness rules determine recovery. Authenticated internal commands keep product writes in the API. Existing `/v1` DTOs, cookies, session namespaces and Admin order remain compatible during canary and rollback.

This changes process ownership in ADR 0009: playback selects and validates provider attempts and coordinates Cloudflare Resolver/Media Relay routes, including the reviewed Miami lookup exception from the same VPS. The bounded AnimeKai computation endpoint moves with playback and retains its separate Worker secret. Video bytes stay off the product API. Initial subtitles remain on the existing volume; the S3-compatible file-store implementation is available before multiple playback hosts.

Multiple hosts, coordinated Next caches, database pooling/availability, search engines and paid relay infrastructure require measured demand and separately priced capacity. One million monthly active members is the destination, not a claim about this initial VPS or its 250 MAD allowance.

At the member's explicit deployment request, a 1–5% canary may proceed with the verified Node member flow, restore and measured host/read budgets, on the existing host with no new paid services. Its record must retain deferred device, field-performance and complete-cost checks as incomplete. Full promotion keeps the original gates. Independent application release tags and preserved database/web pins prevent changing unrelated deployment units. During handoff the gateway routes playback through the compatible combined process until the new playback service and worker are ready.
