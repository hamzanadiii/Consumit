# Consumit interface redesign study

**Status:** Research and implementation brief  
**Updated:** 2026-09-29

## Research access

The Mobbin connector was available, but its screen-search endpoint returned “Mobbin MCP requires a paid plan” for each requested search. No Mobbin screens were returned or used as evidence. The design pass therefore uses inspectable public product pages and first-party product documentation. Re-run Mobbin discovery research if the account gains access; this limitation does not block the redesign.

## Product references

### BingeBang — entertainment discovery and Play path

The public homepage exposes Home, Movies, Series, Calendar, Explore, and My Space destinations. Its lead title puts synopsis, score, metadata, Play, and watchlist action together. The page then separates continuation, trending movies, trending series, new releases, service-based browsing, and popular series into distinct discovery sections. Its search spans movies and television.

**Apply to Consumit:** keep format-aware destinations, make Play immediately obvious on the featured title, and give each discovery section a clear reason to exist. Keep the useful title-to-Play path while limiting the number of competing rails above the fold. Treat the live site's source/search implementation as out of scope for visual inspiration; it does not establish permission, reliability, or an architecture to copy.

Source: [BingeBang public homepage](https://bingebang.st/).

### Letterboxd — identity, diary, and social discovery

Letterboxd explains a connected set of member actions: mark something watched, optionally rate or review it, log a dated diary entry, keep a watchlist, follow people, and discover through their activity and lists. It explicitly distinguishes the single-purpose watchlist from member-authored lists.

**Apply to Consumit:** make the difference between “save for later,” “watched,” and “write in my diary” visually legible. Keep those actions quick at the title and episode level, then give the resulting diary/review/list activity a readable profile and Circle destination. Borrow the strength of that information architecture, not its layout, copy, logos, or color system.

Sources: [How Letterboxd works](https://letterboxd.com/welcome/), [watchlist vs. lists](https://letterboxd.zendesk.com/hc/en-us/articles/15179261056143-What-s-the-difference-between-my-lists-and-my-watchlist).

### MUBI — editorial discovery

MUBI makes curation browsable through collection groupings such as Spotlight, Director Focus, Awards & Festivals, Decade, and Region. Its help page describes the homepage as a set of editorial spotlights and thematic collections, with search as the direct path when a member has a specific title in mind.

**Apply to Consumit:** balance personalized and popular shelves with purposeful editorial entry points. Use compact mood, era, genre, and format filters to help members explore without requiring them to understand the catalog taxonomy first. Keep each shelf's heading and short description explicit so browsing feels guided rather than endless.

Sources: [MUBI collections](https://mubi.com/en/collections), [MUBI discovery guidance](https://help.mubi.com/article/261-how-do-i-find-what-to-watch).

## Design findings for Consumit

1. **One screen should suggest a next step.** Each title surface should present Play/Resume as its primary action; social and library actions remain findable without competing for the same emphasis.
2. **Exploration needs more than poster rails.** Give the member a distinct entry into mood and taste exploration, then use shelves, grids, editorial picks, and Circle evidence where each structure fits its content.
3. **Use the social graph as proof, not decoration.** A “friends watched this” cue must come from real visible activity and lead to the people or review behind it.
4. **Make memory actions explicit.** Save, mark watched, rate/review, and diary-log have different outcomes; controls and success feedback should name the result.
5. **Redesign the whole route system.** A token swap cannot fix stale composition. Shared components and every active route need the same new interface contract, while task-specific pages keep their own hierarchy.
6. **Keep the orange brand signal.** Preserve Consumit's existing orange `#ff5d38` and black/charcoal/cinema-paper foundation. Rebuild typography, geometry, spacing, navigation, cards, page compositions, motion, and responsive behavior around that pinned palette.
7. **Make the Player its own focused environment.** Preserve first-party playback controls and behavior, but redesign surrounding title selection, player shell, episode navigation, loading, source recovery, and error states as one coherent watch experience.

## Implementation audit scope

The rebuild covers the responsive programme shell, global search/navigation, and these route families:

- Discovery: Home, Search, Movies, Series, Anime.
- Title and discussion: movie detail and review pages, series detail and review pages, anime detail and review pages, episodes, and title actions.
- Personal library: Library, profile and profile sections, diary, favorites, reviews, and list pages/detail/edit states.
- Social: Circle/Friends activity, member discovery, follow states, and social empty/error states.
- Account: sign-in, sign-up, verification, password recovery/reset, onboarding steps, and Letterboxd import.
- Product support: Settings, Help, issue reporting, About, API information, and admin surfaces.
- Playback: movie, series, and anime Watch routes and reduced embed routes.
- Shared components: buttons, inputs, selection, identity, media/artwork, cards, editorial composition, signals, profile/library/list rows, settings, onboarding, auth, finish states, and the first-party player presentation.

Business logic, provider adapters, validated source behavior, saved records, privacy rules, accessibility semantics, and player reliability contracts stay intact unless a concrete screen defect requires a behavior change. All catalog and member evidence remains real or deterministic test data; the new design must not imply playback availability or social proof that the service has not verified.

## Review gate

Review a representative desktop and phone capture after the shared visual system and route families are implemented. Fix the issues from that bounded pass, then confirm the same representative routes once more. Also run the targeted UI checks and full workspace validation required by `AGENTS.md` before calling the redesign complete.
