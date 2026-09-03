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

## Blocking playback work

### 1. Authorized provider set

Name the providers and content rights Consumit may legally and contractually use, including regional restrictions and which direct HLS, DASH, or native-media sources are permitted.

### 2. Catalog identity

Decide the canonical metadata source and identifiers for movies, series, seasons, episodes, people, and anime. Clarify whether anime is a separate title kind or a classification of movies/series.

## Blocking social and account work

### 3. Privacy defaults

The create-account design says private by default, while profiles, diary, lists, and activity support public social discovery. Define defaults and visibility rules for profile, history/diary, ratings, reviews, lists, follows, and activity.

### 4. Authentication and imports

Choose launch authentication methods and permitted sources/formats for history import. Define account recovery, email verification, deletion, and data export expectations.

## Before launch planning

### 5. Initial market and localization

Confirm launch countries, primary language(s), subtitle priorities, age/content requirements, and hosting region. Morocco/Europe and Frankfurt/Amsterdam appear as examples in the architecture brief, not confirmed commitments.

### 6. First-release boundary

The screen inventory is broader than a small MVP. Decide which member loop must be complete for the first release and which screens remain reference-only.

### 7. Success measures

Set the first product measures in addition to playback reliability: for example, time to first useful recommendation, play-through rate, save/favorite conversion, week-one return, and discovery from circle activity.
