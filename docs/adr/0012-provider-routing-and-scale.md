# ADR 0012: Provider routing and measured playback capacity

Status: Accepted; production rollout remains gated by generated Worker policies and route-specific playback evidence.

## Context

Provider lookup and media delivery use separate paths, but their routing policy has been spread across resolver origin maps, Relay host maps, accepted route tuples, and provider registrations. That makes local, regional, and production rosters easy to drift. One million monthly active members is a product destination, not evidence that the current single-host and Worker configuration can carry an unknown peak.

## Decision

Use `PLAYBACK_EDGE_ACCEPTED_ROUTES` as the reviewed route tuple list and compile it through the versioned Provider Route Registry keyed by provider ID, title kind, region, purpose (video/audio), and delivery tier. A route ending in `:audio` explicitly approves audio-purpose lookup separately. `bun run providers:routes` emits the matching Resolver policy, Relay route policy/version, route tuples, and exact Relay host map after checking API host policy. The Resolver rejects absent or mismatched policy for versioned requests; Relay grants bind the route tuple and Worker policy checks the version, tuple, origin, and exact host map. Admin settings continue to control provider enablement, role, order, limits, and delivery tier; they cannot change network egress. Direct media remains browser-to-provider, approved Relay media remains on its configured Cloudflare route, and Embed remains an external player. The API continues to own provider eligibility, order, sessions, and hostile-output validation. Every provider lookup runs on Cloudflare; the VPS does not make provider requests. A route failure follows the existing provider waterfall; there is no generic retry through another egress path.

Compile the registry into the Playback service and matching Resolver/Relay policy checks, and report its version with bounded provider diagnostics. Keep exact host approvals independent for source validation, API relay issuance, and each Worker. A new origin or host becomes eligible only after the corresponding route passes source resolution, first-frame, seek/resume, and recovery checks.

Keep lookup health separate from media delivery health. Health becomes playable only after the browser reports a first frame, at least five seconds of timeline advance, a completed seek, and resumed playback on the same provider/kind/region/delivery/version tuple. Video and separate-audio lookup probes are keyed separately; audio remains unverified until its own browser delivery evidence exists. Diagnostics record provider ID, title kind, route version, lookup/delivery/playback stage, last successful playback time, bounded latency, and a safe failure category, while excluding signed URLs, grants, cookies, and member identity. Upstream 403 blocks and 429 rate limits retain distinct categories; 429 `Retry-After` values are bounded and feed route-specific circuit backoff.

Playback may add replicas only with shared session/attempt state, shared upstream admission budgets, consistent provider circuits, bounded database pools, and measured readiness. Resolver Durable Objects keep route admission windows, circuit state, and lookup cache in SQLite so instances in the same Worker deployment share them. Each Worker deployment has its own Durable Object namespace; route policies pin a route to one lookup origin. Direct video bytes do not use Consumit bandwidth. Relay and Durable Object usage are measured separately before traffic grows.

Capacity planning uses observed peak starts, concurrency, ordinary API traffic, progress writes, provider quotas, and relay bytes. The existing rebuild runbook's load gates are the minimum acceptance baseline and must be updated with field measurements before full promotion. Do not claim million-member or million-concurrent capacity from provider smoke checks.

## Consequences

The registry and policy compiler are implemented in code. Deploy the generated Resolver and Relay policies to the canary Workers first, then deploy the API that sends the compiled route version. Keep routes dark until the browser acceptance evidence passes; promote in 1% canaries and provider cohorts, retaining the previous generated registry for rollback. A provider may remain unavailable when its upstream blocks or withdraws access; that state is reported honestly and does not weaken host validation or move media bytes into the product API.
