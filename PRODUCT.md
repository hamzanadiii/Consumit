# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Members — people with a Consumit identity, profile, library, and activity history. Primary job on Home: confidently choose what to watch or read next (movies, series, anime, manga), resume in-progress titles, and use trusted Circle activity for discovery. Guests can browse catalog and watch/resume locally; members additionally sync progress and history.

## Product Purpose

Watch and read immediately, remember what you love, and discover through people whose taste you trust.

Success means: member sees a confident recommendation with a human reason → opens Title detail → starts a valid source in the dedicated Watch/Read route → progress and history are retained → Circle activity turns that history into useful discovery.

## Positioning

Taste before volume, playback before promotion, people as discovery signals. Progress belongs to the member and stays stable when the source changes. Provider failure is normal — recovery feels like source switching, not an error dump. A neighboring catalog app cannot truthfully copy the combination of Circle-led discovery plus a first-party Player/Reader that owns controls behind a provider-adapter seam with TMDB/AniList kept metadata-only.

## Operating Context

Core loops: Discover-and-watch (`Home/Search/Profile/List -> Title -> Watch -> Progress -> Resume`), Discover-and-read (Manga `-> Read -> Resume`), Remember-and-express (`Watch -> History/Diary -> Rating/Review -> Favorites/Lists -> Profile`), Discover-through-people (`Circle activity -> Title/List/Profile -> Follow/Save/Watch -> New activity`). Social is asynchronous and discovery-led. No private/direct messaging, no live chat, no watch parties or co-watching rooms. Streaming-service choices are availability preferences, not billing connections. Every Watch/Read action opens its dedicated route directly — the player/reader is the screen, never an embedded panel.

## Capabilities and Constraints

Confirmed and preserved for this redesign:

- Dedicated focused Watch screen owned by first-party Consumit Player; configured direct media (HLS/DASH/native) only, hostile-output validation; iframe/embed excluded. Same ownership for manga reader.
- Watch progress and member history independent of playback sources; defaults to adaptive quality, original audio, English captions when available; recovery retains position and intent.
- Subbed/dubbed never split into separate catalog entries.
- Computed Taste Match, overlap, member scores, and public numeric ratings hidden until product logic exists; member authors and sees only their own ratings on title detail. Reviews, catalog metadata, and watch progress remain visible.
- Account creation requires available Username plus verified email before member session; no OAuth.
- Letterboxd history only via member-uploaded ZIP/CSV with preview, TMDB match review, explicit confirmation. Six ordered Favorites on profile.
- Live routes render stored member records or honest empty states; never fill Circle activity, continue-watching, or lists with invented member evidence. Fixtures belong only in internal gallery/tests.
- TMDB supplies title metadata/artwork only; AniList supplies anime/manga metadata; neither supplies Taste Match, social evidence, progress, actions, or playback. TMDB attribution band stays globally reachable with About catalog credits.
- Signed-out nav keeps public catalog visible with Sign in; signed-in sees Friends plus profile entry. Global nav, recommendations, reviews, circle activity, and promotions stay out of playback.
- Ads are first-class with fail-open playback and stay separate from editorial/member surfaces.
- Mobile composed intentionally, not shrunk desktop.

Redesign scope (confirmed 2026-09-13, integrated 2026-09-13): the FilScreen composition owns Home at `/` — supplied-mark sidebar nav, kind tabs, rotating trending hero, device-local Continue watching, Trending now, Popular now, honest-empty Circle activity — dressed in the Consumit midnight-and-orange identity (redirected 2026-09-13; the lavender drafts are discarded). "Coming soon" stays out until an upcoming-feed slice backs the claim; no feed may be relabeled to fake it.

Undecided: whether the FilScreen light world extends beyond Home; that decision follows Home, it does not ride along now.

## Brand Commitments

Name Consumit. Incumbent identity "Cinema After Midnight" (midnight canvas, warm ivory, Charter + DejaVu Sans, compact corners) remains the authority everywhere except the Home remake currently in flight.

User-pinned binding reference for Home only: FilScreen 3-column Home screenshot supplied 2026-09-13 (sidebar nav / hero + Trending + Coming soon / Continue watching + Friends activity). Recorded here as scope constraint; visual expansion happens in new-work/DESIGN.md, not here. Home ships dark by default with a member-flippable light theme; the choice persists on the device.

Terminology follows CONTEXT.md: Member (not User), Circle (not Friend list), Follow one-way (not Friend request), Title/Movie/Series/Anime/Manga/Episode/Chapter, Saved Title vs Favorite, Rating vs Score, Review, Watch History vs Diary, Library, Provider vs Source, Resolve, Watch screen, Consumit Player, Read screen.

## Evidence on Hand

Real: live TMDB movie/series catalog via `apps/web/src/app/page.tsx` + `lib/catalog-api`; AniList anime/manga metadata and franchise links; stored member records where implemented. Prior product truth in `docs/PRODUCT.md`, visual authority in `DESIGN.md`, component boundaries in `docs/COMPONENTS.md`, domain language in `CONTEXT.md`.

Absences future work must not fabricate: no live Circle follows/activity, no computed Taste Match, no public rating counts, no configured playback sources (resolve reports no source honestly). Do not present deterministic sample reactions, activity, ratings, or progress as live member behavior.

## Product Principles

- Taste before volume — explain why a title fits, never a bare poster wall.
- Playback before promotion — the Title-to-playing-source path is the primary path.
- Progress belongs to the member — history and resume survive source changes.
- Provider failure is normal — switching sources is routine recovery.
- Privacy has a visible consequence — public, circle-only, and private choices say who sees what.
