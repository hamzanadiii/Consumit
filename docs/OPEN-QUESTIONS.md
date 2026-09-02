# Open decisions

These questions are intentionally unresolved. They are ordered by how soon they block useful implementation.

## Resolved foundation decisions

- Bun 1.4 workspaces orchestrate `apps/web`, `apps/api`, and `packages/ui`; no additional task runner is needed yet.
- Node 24 LTS is the project runtime line.
- Next.js 16, React 19, Fastify 5, Tailwind CSS 4, Lucide React, CVA, Vitest, and Testing Library form the initial dependency set.
- The design package is versioned in this repository.
- The first implementation slice is the visual token layer and shared Button primitive, presented in a local component catalog.

## Blocking the first composed screen

### 1. First screen slice

The design package has 18 active screens. Select one small path so the first primitives are demanded by real composition rather than built speculatively.

Suggested choice: Sign In for form foundations, or the Home hero for the core cinematic identity.

The manifest and design README mark `consumit-watch-embed` as active and `consumit-player-screen` as deprecated, but the current folders contain the Watch / Embed files only under `archive/custom-player-concept/` and the player-screen files under active `screens/`. Reconcile those files before using either playback mockup as implementation input.

## Blocking playback work

### 2. Authorized provider set

Name the providers and content rights Consumit may legally and contractually use, including regional restrictions and whether embedding, direct HLS/DASH access, or both are permitted.

### 3. Playback delivery scope

The active UI package defines an iframe Watch / Embed shell and retires the custom player. The founding architecture also proposes HLS, DASH, native video, and iframe adapters with automatic mid-stream failover.

Decision needed: iframe-only for the initial product, or a generalized player. This changes controls, telemetry, fallback, accessibility, and provider contracts.

### 4. Catalog identity

Decide the canonical metadata source and identifiers for movies, series, seasons, episodes, people, and anime. Clarify whether anime is a separate title kind or a classification of movies/series.

## Blocking social and account work

### 5. Relationship semantics

The design language mixes “friends,” “follow,” and “circle.” The current glossary treats Follow as one-way and Circle as the trusted discovery set. Confirm whether any reciprocal friendship/request model exists.

### 6. Privacy defaults

The create-account design says private by default, while profiles, diary, lists, and activity support public social discovery. Define defaults and visibility rules for profile, history/diary, ratings, reviews, lists, follows, and activity.

### 7. Authentication and imports

Choose launch authentication methods and permitted sources/formats for history import. Define account recovery, email verification, deletion, and data export expectations.

## Before launch planning

### 8. Initial market and localization

Confirm launch countries, primary language(s), subtitle priorities, age/content requirements, and hosting region. Morocco/Europe and Frankfurt/Amsterdam appear as examples in the architecture brief, not confirmed commitments.

### 9. First-release boundary

The screen inventory is broader than a small MVP. Decide which member loop must be complete for the first release and which screens remain reference-only.

### 10. Success measures

Set the first product measures in addition to playback reliability: for example, time to first useful recommendation, play-through rate, save/favorite conversion, week-one return, and discovery from circle activity.
