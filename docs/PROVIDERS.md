# Provider adoption plan (PROVE → Consumit)

How the provider integrations in `PROVE/` become Consumit playback sources.
Authority: [`ARCHITECTURE.md`](./ARCHITECTURE.md) (backend standards, resolve
lifecycle, invariants) and [`OPEN-QUESTIONS.md`](./OPEN-QUESTIONS.md) item 1
(authorized provider set). This file is the execution plan, not a second
source of architectural truth.

## Ground rules

- Only integrations Consumit is legally and contractually permitted to expose
  may ship. The set below is technical input; rights and regions still need
  explicit confirmation (OPEN-QUESTIONS.md item 1).
- Take **providers only** from `PROVE/`. No app routes, embed pages, proxy or
  tester UI, audit scripts, databases, or dependencies move over.
- Every adapter output is hostile until Zod-validated at the seam.
- Provider-specific behavior stays inside its adapter (invariant 1). Page and
  resolver code never imports site-parsing logic.

## Source inventory (read 2026-09-06)

`PROVE/` is a standalone provider-research app:

- `providers/`: ~25 active integrations (videasy, vixsrc, vidrock, vidlink,
  vidfast, vidlove, vidstorm, vidcore, vaplayer, stellar, rivestream, perses,
  nxsha, nhdapi, nflix, netmirror, insertunit, cuevana, cinehd, onetouchtv,
  vidsrc, vidsrcomss, zxcstreams, plus `hosts/` helpers and a root
  `VixSrcProvider.ts`), ~20 retired integrations under `providers/_retired/`,
  a `_template/` scaffold, `base/` shared types, and a `framework/` mapping
  layer.
- Its own Next.js frontend (`src/app`, embed pages, HLS tester UI),
  stream/proxy/telemetry API routes, audit and `tmp-*` scripts, a Prisma
  `dev.db`, and `node_modules`. None of this moves.
- **Warning: `providers/registry.ts` is stale.** It imports paths that do not
  exist (e.g. `./providers/icefy/...`) while the real `icefy` lives in
  `_retired/`. The true working set must be re-derived from audit results and
  probes in Phase 0, never trusted from the registry.

## Take list

- Active `providers/<name>/` sources confirmed working in Phase 0.
- `providers/base/` types and `framework/adapter.ts` **as reference only** for
  shaping our contract — adapted, not copied.
- `_template/template.ts` and `scripts/scaffold-provider.mjs` as reference
  for how future adapters get written.

## Leave list

App routes, embed pages, proxy/stream/tester endpoints and UI, audit and
`tmp-*` scripts, `prisma/dev.db`, `node_modules`, all of `_retired/`.

## Phase 0 — Triage (before any porting)

1. Re-derive the working set from `scripts/audit-results.json`,
   `audit-movies.json`, and `probe-candidates.ts` output. Retired stays retired.
2. Classify each survivor by delivery type:
   - **Direct** (HLS/MP4 URLs playable as-is) — ideal, maps straight to the
     player seam.
   - **Header-locked** (needs custom Referer/Origin/cookies) — allowed only
     through the lease-scoped fetch-proxy escape hatch (ARCHITECTURE.md,
     backend standards §2).
   - **Embed-only** — dropped. Iframe/embed delivery is excluded from the
     product direction.
3. Record each adapter's dependency footprint (parsers, crypto, fetch
   helpers) to size `packages/provider-sdk/` dependencies.
4. Pick **2–3 pilot providers** (one primary + backups). The rest follow in
   small batches after the seam is proven.

## Phase 1 — Contract first (`packages/contracts`)

```text
Input:  kind (movie | episode) · TMDB id · title + year · season/episode ·
        region · language
Result: provider id · sources[] (delivery: hls | dash | native · url ·
        quality · language · needsProxy) · subtitles[] · expiresAt ·
        latencyMs · failure { code, retryable }
```

- Zod schemas, shared by API and adapters.
- Source ids are deterministic (`<provider>:<stable-hash>`), never random.
- Upstream failures are structured data (`PROVIDER_TIMEOUT`,
  `PROVIDER_MALFORMED`, `PROVIDER_EMPTY`, …), never thrown raw across the seam.

## Phase 2 — SDK seam (`packages/provider-sdk`)

```text
packages/provider-sdk/
  adapter.ts        # ProviderAdapter interface: resolve(input, signal),
                    # capabilities(), health(), hard timeout guarantee
  errors.ts         # typed adapter errors mapped to contract failure codes
  <name>/           # one ported adapter per directory, deps declared locally
  <name>/*.test.ts  # contract tests + fixtures (Phase 3)
```

Porting rules (mechanical, per adapter):

| PROVE habit | Ported form |
|---|---|
| `any` payloads | Zod validation at the seam; typed internals |
| `Math.random()` ids | Deterministic stable ids |
| `console.log` | Structured diagnostics returned in the result |
| Flat 15 s timeout | Per-adapter timeout + concurrency/RPS/queue caps, `AbortSignal` |
| `proxy-lease://` coupling | `needsProxy` flag + headers; our backend mints leases |
| In-adapter TMDB id repair | Deleted; the catalog module owns identity |
| Hardcoded health / quarantine stubs | Real scoring via resolver telemetry (Stage 6) |

Keep the site-specific extraction logic; replace everything around it.

## Phase 3 — Contract tests (per adapter, required to merge)

Fixture-driven, recorded responses, zero live network in CI:

- Movie resolve, episode resolve (S/E mapping).
- Special-character and non-ASCII titles.
- Unknown/missing title → structured empty, not an exception.
- Upstream timeout → `PROVIDER_TIMEOUT`, retryable.
- Malformed upstream (bad JSON, missing fields, expired URLs) → validated out.
- Header-locked sources assert `needsProxy: true` with headers preserved.

## Phase 4 — Resolver (`apps/api` playback module)

Per ARCHITECTURE.md (resolve lifecycle, ranking weights, circuit breaker):

- Tiers with hedged starts (~0/120/300/700 ms offsets, tuned by telemetry).
- Dedupe, observed-quality ranking, per-provider circuit breaker.
- Valkey cache split (discovery vs expiring access), single-flight coalescing.
- Playback sessions keyed by member + title/episode; progress never by URL.
- Endpoints from the interface inventory (`resolve`, `fallback`, `events`,
  providers `status`). No resolve/fallback endpoints land before OPEN-QUESTIONS
  item 1 resolves — contract + fake may exist earlier.

## Phase 5 — Player mapping

- Direct HLS/DASH/native → existing `DirectMediaSource` seam (`@consumit/ui`
  `media-source.ts`; engines already lazy-load).
- Header-locked → lease proxy escape hatch only.
- Embed-only → excluded, no adapter written.

## Sequencing

1. Contract + SDK skeleton + **one pilot adapter** with full fixtures (proves
   the seam end to end, no resolver yet).
2. Second and third adapters (gives ranking something real to choose between).
3. Resolver + session endpoints behind the playback module pattern.
4. Remaining adapters in small batches, ordered by triage health.
5. Synthetic health checks over authorized known titles; provider dashboard.

## Decisions needed (at kickoff, not now)

- The 2–3 pilot providers.
- Launch regions and subtitle/audio language priorities.
- Confirmation that embed-only integrations are dropped.
- Rights confirmation to close OPEN-QUESTIONS.md item 1 (names from triage,
  rights and regions from you).
