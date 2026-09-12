# ADR 0002: Certified browser-direct playback

- Status: accepted (supersedes every relay-era draft)
- Date: 2026-09-12

## Context

Consumit must not carry provider media bytes. Provider configuration alone is insufficient evidence that a browser can safely and reliably consume a source.

## Decision

Playback is browser-direct HTTPS only. The API resolves small JSON plans and never serves, proxies, leases, rewrites, transforms, or caches video, audio, manifests, segments, keys, or subtitles.

A provider is active only when it is explicitly operator-approved and has a valid, unexpired, configuration-bound certification artifact for the deployment region. Certification is an operator activity and may perform bounded fetches; those fetches are not member playback. Unknown or unsupported capabilities fail closed.

Cookies, provider-supplied authorization headers, DASH, byte transformations, unapproved hosts, and sources that need server-side headers or rewriting are unsupported. Capability persistence uses the `delivery:v2` namespace so older records cannot authorize playback.

The resolver preserves operator priority as a hard tier and uses persistent provider health only inside equal-priority tiers. Valkey outages and corrupt health records degrade to neutral in-memory ranking, never to media proxying.

## Consequences

- Some providers and titles will return no playable source.
- The player refreshes or switches among independently certified direct sources.
- Provider coverage is expanded through authorization and certification, not through a media fallback.
- Stellar/Aphrodite adapters are ported browser-direct; activation is gated by independent operator authorization and certification.
