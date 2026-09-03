# Consumit UI Package

Complete desktop design package for Consumit, a cinematic streaming and social-taste product.

## Active screens

1. Home / Discover
2. Public Profile
3. Profile Owner View
4. Settings
5. Title Detail
6. Consumit Player
7. Series Detail
8. Search / Explore
9. My Library
10. Friends Activity
11. List Detail
12. Sign In
13. Create Account
14. Onboarding — History
15. Onboarding — Favorites
16. Onboarding — Circle
17. Help Center
18. Report Issue

Every active screen is available as a presentation-ready PNG and an editable SVG source.

## Folder structure

- `screens/png/` — full-resolution design mockups
- `screens/svg/` — editable vector screen sources
- `assets/brand/` — mark, lockup, and cinematic backdrop
- `assets/avatars/` — shared profile avatar treatment
- `assets/posters/` — reusable abstract title-art motifs
- `assets/services/` — neutral service-identification marks
- `assets/tokens/` — implementation-ready CSS variables
- `docs/brand-system.md` — complete design contract, component registry, and screen inventory
- `archive/custom-player-concept/` — obsolete provider-embed proposal, retained only for project history

## Important product decisions

- The active playback experience is `Consumit Player`. Consumit owns the accessible playback controls and media surface.
- Authorized providers supply direct media through adapters; iframe and embed playback must not be implemented.
- Consumit has no rooms, co-watching rooms, or watch-party features.
- Streaming services such as Netflix and Shahid are availability preferences, not connected billing accounts.
- The visual system is original: editorial cinema, human social proof, flat dark surfaces, and restrained orange/lilac/lime signals.
