# Consumit — Project Guide

> Everything about the project in one file: product, language, architecture,
> delivery, decisions, design, and repo map. The source docs stay authoritative
> and are linked from each section; this file synthesizes so a new reader (or
> agent session) can orient in one pass.

| Area | Authority |
|---|---|
| Domain language | [`CONTEXT.md`](./CONTEXT.md) |
| Product scope & flows | [`docs/PRODUCT.md`](./docs/PRODUCT.md) |
| Platform & backend | [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) |
| Delivery sequencing | [`docs/DELIVERY.md`](./docs/DELIVERY.md) |
| Visual system | [`DESIGN.md`](./DESIGN.md) |
| Component registry | [`docs/COMPONENTS.md`](./docs/COMPONENTS.md) |
| Ways of working | [`AGENTS.md`](./AGENTS.md) |

## 1. Product

**Consumit** is a cinematic social streaming and taste-discovery product for
movies and series. Promise: **watch immediately, remember what you love, and
discover through people whose taste you trust.** A media platform with a
social/product layer — not a website organized around provider scrapers. Media
bytes travel directly from a configured provider or CDN to the browser;
Consumit resolves and manages playback.

Four jobs: choose what to watch with confidence · start playback with minimum
friction · preserve history, progress, favorites, ratings, reviews, lists ·
turn trusted people's activity into discovery.

Principles: taste before volume · playback before promotion · people are
discovery signals · progress belongs to the member · provider failure is
normal · privacy has a visible consequence · editorial, human language.

Core loops: `Home/Search/Profile/List → Title → Watch → Progress → Resume` ·
`Watch → History/Diary → Rating/Review → Favorites/Lists → Profile` · circle
activity → title/list/profile → follow/save/watch (async only — no messaging,
no live chat, no co-watching).

Active screens (18 desktop references): Home/Discover, Public Profile,
Profile Owner, Settings, Title Detail, Watch, Series Detail, Search/Explore,
My Library, Friends Activity, List Detail, Sign In, Create Account,
Onboarding ×3 (History, Favorites, Circle), Help Center, Report Issue.

Home order: featured hero → From your circle → Continue watching → editorial
feature → Trending tonight → Lists worth stealing → mood entries → footer.
(Circle + Continue rails temporarily flagged off — see `SHOW_MEMBER_RAILS`.)

Hard scope walls: no watch parties/rooms, no messaging, availability
preferences are not billing connections, dedicated first-party player screen
(no embeds/iframes), every Watch action opens the player route directly,
Taste Match/scores hidden until their logic ships, no global nav inside
playback, mobile composed intentionally, only legally permitted sources. Launch
market is tier-1 (US, UK, CA, AU, DE, FR, NL, ES, IT). Monetization uses
first-class ads with fail-open playback, visibly separate from editorial and
member surfaces.

## 2. Domain language (from CONTEXT.md)

Member (identity/profile/library/history) · Account (private access record) ·
Profile (taste expression) · Circle (trusted one-way discovery follows;
Follow is one-way, never reciprocal, never a chat channel) · Taste (evolving
preference profile) · Taste Match (personalized estimate + human reason) ·
Activity (visible event from watching/rating/reviewing/following/curating).

Title (movie or series) · Episode (one playable installment) · List (ordered,
curated, with notes) · Saved Title (bookmarked for later) vs Favorite
(strong taste statement) · Rating (numeric) vs Review (written) · Watch
History (factual record) vs Diary (member-facing chronology) · Library
(personal home: saved, favorites, history, lists).

Provider (configured external source) · Availability Preference (selected
service for discovery, not a linked account) · Source (provider playback
option) · Playback Session (one member's attempt; keeps progress + recovery
per title, never per URL) · Resolve (find/validate/select a source) ·
Fallback (replacement after failure) · Watch (focused screen with player,
source selection, recovery) · Consumit Player (first-party surface, one
consistent control set).

## 3. Architecture

```text
Cloudflare edge → Web (Next.js) → Public API (Fastify)
  → Product / Social / Playback modules (Resolver → Scheduler → Adapters → Validation)
  → Postgres / Valkey / queues → Telemetry and workers
```

Stack: Bun 1.4 workspaces · Node 24 · Next.js 16 + React 19 + Tailwind 4 ·
Fastify 5 API · shared React UI + Lucide · shared Zod contracts · (later:
managed Postgres, Valkey, Cloudflare, Docker/Hetzner, OTEL/Prometheus/Grafana/
Loki/Sentry, ClickHouse for playback analytics).

Module rules: provider quirks stay inside adapters (`Provider adapter →
contract → Resolver → Playback interface → Web`); product/social consume
stable results; deep modules with small interfaces; seams only where
implementations genuinely vary. New code is created lazily, slice by slice.

Catalog: TMDB is canonical metadata/identifier namespace (en-US, US market,
no adult). Web talks only to the versioned Consumit catalog API; TMDB secrets
never leave Fastify. Injectable `Catalog` interface (fake/TMDB/unavailable);
request coalescing + SWR tiers. A real title may have no configured source —
the player then shows the honest unavailable branch, never a demo or embed.

Playback: resolve creates a session (identity, title/episode, provider,
position, fallback count, errors). Failure → exclude, resolve fallback, seek
to retained position, calm language ("Switching source…"). Consumit owns
controls; adapters supply direct HLS/DASH/native; no iframes/embeds. Progress
is stored by member + title/episode. Hedged starts (~0/120/300/700 ms),
learned ranking (success 30%, TTFF 20%, …), circuit
CLOSED→OPEN→HALF_OPEN→CLOSED. Discovery and expiring-access caches are
separate records; concurrent misses coalesce.

Data: Postgres owns members, credentials, follows, ratings/reviews/
favorites/lists, history/progress, catalog refs, provider config. Valkey arrives
later on measured need (shared cache, coordination, queues); launch-time
sessions live in Postgres. Raw
telemetry moves to ClickHouse later. Strong consistency for identity/privacy;
eventual for rankings/counters.

Telemetry events: RESOLVE_STARTED → PROVIDER_* → MANIFEST_LOADED →
PLAYBACK_STARTED → BUFFER_* → PLAYER_ERROR → SOURCE_SWITCHED →
PLAYBACK_ENDED, one trace id end to end. SLO targets (baselines first):
99.95% API, >99% resolve, cached resolve p95 <100 ms, fresh <1.5 s, playback
start >98%, internal API p95 <250 ms.

Interfaces (`/v1/`): titles discover/search/batch/`/:kind/:id`/series seasons,
`POST playback/resolve`, `POST playback/:session/fallback`,
`POST playback/:session/events`, `PUT /v1/progress`, providers status.
Admin/internal surfaces stay separate.

Security: adapters get minimum access; all external results schema-validated;
independent timeouts; ≤2 retries with backoff + jitter; edge → member →
provider rate limits; SSRF guard on URL-fetching (no loopback/private/
metadata/non-HTTP, prefer allowlists); env-backed secrets with rotation;
public/internal/admin kept apart; configured sources with validation only.

Deployment: simple production → measured horizontal growth → orchestration →
multi-region, each only on measured demand. State never lives only in an API
process.

Backend standards (new modules repeat the catalog module's shape: interface,
route registrar, typed errors, fake + adapters, interface tests): cookie
sessions (never localStorage JWT), validated direct media with no proxy
escape hatch, no rooms/DMs/donations/ads scaffolding, Fastify
registrars, Prisma recommended, localized failure (no global panic), OTEL
over bespoke metrics, Zod-validated env failing fast, Argon2id passwords,
BullMQ only with the first real queue need. Providers resolve directly
from the configured set with hostile-output validation.

## 4. Delivery

Smallest coherent slice per step: foundations → primitives → composed
sections → static screens → behavior → hardening → growth. Foundations and
token/Button/Global-nav/form/selection/identity/signal/media/cards/
editorial/social/profile/title/library/auth/onboarding/settings/playback/
finish families ship in order, each with its states and accessibility, sample
data at the seam, no speculative packages.

Screen build order: auth → Home → Title/Series → Watch → Help/Report →
Search → Profiles → Library → Friends → Lists → Settings → onboarding. SEO
ships with screens: per-route metadata/OG/canonical, title pages as landing
surfaces, sitemap + robots once routes stabilize.
Behavior slices: identity (preview done, backend open) → catalog (TMDB slice
done) → library → social → playback → personalization. Playback hardening
(contract tests, SSRF, timeouts/hedging/breakers, cache discipline, sessions,
dashboard, telemetry) runs after the provider set is decided.

Per-slice checklist: name the member job + domain terms · link the design
reference + states · interface before implementation · deterministic fixtures
· test through caller interfaces · a11y/responsive/failure proportional to
risk · update docs only on real decision changes · finish one slice before
the next.

## 5. Open decisions (blocking order)

1. **Configured provider set** — names, regions, permitted HLS/DASH/
   native delivery in `PLAYBACK_MEDIA_CONFIG`.
2. Privacy defaults across profile/diary/ratings/reviews/lists/follows.
3. Auth methods, import sources, recovery/verification/deletion/export.
4. Launch market decided (tier-1: US, UK, CA, AU, DE, FR, NL, ES, IT); languages, subtitle priorities, age rules incl. ads consent, hosting region open.
5. First-release boundary (inventory > MVP).
6. Success measures beyond playback reliability.
7. Ads details: network, consent, age-gating, frequency ownership, revenue measures (Phase 9 gate).
Resolved: Bun/Next/Fastify/Tailwind/Lucide/CVA/Vitest stack · Node 24 ·
first-party player, no embeds · one-way Follow/Circle, no messaging · TMDB
canonical (en-US/US/no-adult), anime as movie/series · first slice = tokens +
Button in a local catalog.

## 6. Design system ("Cinema After Midnight")

Near-black flat room, warm ivory type, rare signals. Canvas `#09090B` ·
surface `#121215` / raised `#19191E` · ink `#F4F0E8` · muted `#AAA7A1` ·
signal orange `#FF5D38` (brand/selection/progress/commitment only) · social
lilac `#A79CFF` (taste context only) · positive `#B8D86D` (presence/health
only). Display: Bitstream Charter; interface: DejaVu Sans (both self-hosted).
3.5px base, rhythm 7/10/16/21/28/42/56; 50px desktop edge, 68px nav shell;
radius 4–8px (6px controls); flat surfaces, gradients only for artwork
legibility; circles reserved for people/presence/progress.

Named rules: scarce signal · semantic accent · operational status · two
voices (serif tells, sans acts) · flat interface · catalog boundary (TMDB =
metadata/artwork only) · preview honesty (fixture signals disclosed under
the header) · home cadence · rank-behind-poster · social boundary (no
messaging) · single promise per masthead · synchronized watch state · player
ownership (Consumit controls, providers supply media) · honest recovery.

Do: shipped brand assets, ivory = immediate action / orange = committed flow,
visible focus + 38px targets, one finished component at a time, synchronized
playback state, TMDB attribution everywhere. Don't: pills/glass/gradients as
decoration, interchangeable accents, card-grid everything, shrunk-desktop
mobile, fake-live sample data, embeds, provider logic inside UI shell.

## 7. Components (`@consumit/ui`)

Order + status: action Button ✓ · global shell ✓ · form foundation (in
progress) · selection ✓ · identity ✓ · signals ✓ · media ✓ · content cards ✓
· editorial ✓ · social ✓ · profile ✓ · title/series ✓ · library/lists ✓ ·
auth ✓ · onboarding ✓ · settings/support ✓ · playback shell — Watch header,
Consumit Player (full prototype chrome + adapter seam), source selector,
report, trust note — UI-shell-only ✓ · global finish ✓. Lucide icons, Radix
for complex ARIA, no generic theme imports; every component ships with types,
catalog example, interaction tests, responsive/focus verification.

## 8. Repo map & commands

```text
apps/web/            Next.js UI (routes, screens, fixtures)
apps/api/            Fastify API (catalog module done; identity/library/social/playback open)
packages/ui/         shared components + Consumit Player
packages/contracts/  shared Zod schemas + types
design/              reference package (ignored); DESIGN.md + COMPONENTS.md are authority
docs/                PRODUCT / ARCHITECTURE / DELIVERY / COMPONENTS
```

Root: `bun run dev|build|lint|typecheck|test|check` fan out to workspaces.
Per workspace: `bun run {dev,build,lint,typecheck,test}`. Web `test` is
`vitest run`; API `test:tmdb:live` hits the real TMDB API (explicit only).

Working agreement: read CONTEXT/PRODUCT/ARCHITECTURE/DELIVERY/
DESIGN+COMPONENTS per task type · smallest coherent slice · provider code
behind the adapter seam · progress independent of sources · external output
hostile, playback inputs validated · deterministic fixtures until
integration is the slice's purpose · lazy structure · Consumit owns playback
controls · done = states + failure behavior covered, checks pass, docs
updated at their single source of truth.
