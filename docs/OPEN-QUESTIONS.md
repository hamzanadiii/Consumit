# Open decisions

These questions are intentionally unresolved. They are ordered by how soon they block useful implementation.

## Resolved foundation decisions

- Bun 1.4 workspaces orchestrate `apps/web`, `apps/api`, and `packages/ui`; no additional task runner is needed yet.
- Node 24 LTS is the project runtime line.
- Next.js 16, React 19, Fastify 5, Tailwind CSS 4, Lucide React, CVA, Vitest, and Testing Library form the initial dependency set.
- The design package stays local and ignored; `DESIGN.md`, `docs/COMPONENTS.md`, and the shipped UI are the versioned visual authority.
- The first implementation slice is the visual token layer and shared Button primitive, presented in a local component catalog.
- Playback uses a first-party Consumit Player with authorized direct media sources; iframe and embed delivery are excluded.
- Social relationships use one-way Follow and Circle semantics; reciprocal friend requests and private or direct messaging are excluded.
- TMDB is the canonical metadata source and identifier namespace for movies, series, seasons, episodes, people, and artwork. Anime is classified as a movie or series, not a separate title kind. Catalog metadata uses English (`en-US`), the US market, and excludes adult results.
- Launch market is tier-1: US, UK, CA, AU, DE, FR, NL, ES, and IT.
- Ads are a first-class monetization surface with fail-open playback; network, consent, and age-gating details remain open.
- Launch auth is email + password with verification codes and code-based recovery; OAuth is excluded. An account is created and receives an opaque server session only after verification. Usernames are member-chosen, unique, alias-preserving identifiers with a 30-day change cooldown. Sessions live in Valkey; durable identity and member data live in Postgres. Deletion (tombstone + anonymize + cascade) and self-export ship with identity.
- Letterboxd import accepts a member-uploaded official ZIP or compatible CSV. Consumit stages normalized rows, matches movies through TMDB in a worker, requires review before confirmation, and records provenance. It does not link a Letterboxd account, scrape Letterboxd, restore deleted exports, or import likes.
- Profiles and imported lists are private by default. Unsupported follows, follower counts, presence, and activity render honest zero or empty states until the social slice defines visibility rules.

## Blocking playback work

### 1. Authorized provider set

Name the providers and content rights Consumit may legally and contractually use, including regional restrictions and which direct HLS, DASH, or native-media sources are permitted.

## Blocking social and account work

### 2. Social visibility

Profiles and imported lists now default to private. Before the social slice, define the future visibility rules for history/diary, reviews, lists, follows, and activity. Ratings remain stored but hidden from presentation.

## Before launch planning

### 3. Initial market and localization

Launch countries are decided (tier-1: US, UK, CA, AU, DE, FR, NL, ES, IT). Confirm primary language(s), subtitle priorities, age/content requirements including ads consent and age-gating, and hosting region.

### 4. First-release boundary

The screen inventory is broader than a small MVP. Decide which member loop must be complete for the first release and which screens remain reference-only.

### 5. Success measures

Set the first product measures in addition to playback reliability: for example, time to first useful recommendation, play-through rate, save/favorite conversion, week-one return, and discovery from circle activity.

### 6. Ads and monetization

Ads are in scope with fail-open playback. Decide the ad network, consent handling, age-gating, frequency policy ownership, and revenue measures before Phase 9 work begins.
