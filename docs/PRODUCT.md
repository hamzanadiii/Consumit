# Product foundation

## Product definition

Consumit is a cinematic social streaming and taste-discovery product for movies and series. Its promise is: **watch immediately, remember what you love, and discover through people whose taste you trust.**

The product combines four jobs:

1. Help a member confidently choose what to watch.
2. Start playback with as little friction as possible.
3. Preserve history, progress, favorites, ratings, reviews, and lists.
4. Turn trusted people's activity into useful discovery.

## Product principles

- **Taste before volume.** Explain why a recommendation fits instead of presenting an undifferentiated poster wall.
- **Playback before promotion.** The path from a title to a playing source is the primary product path.
- **People are discovery signals.** Profiles, reviews, ratings, diary entries, and lists lead to useful titles and members.
- **Progress belongs to the member.** History and resume position remain stable when the playback source changes.
- **Provider failure is normal.** Recovery should feel like source switching, not a technical error dump.
- **Privacy has a visible consequence.** Public, circle-only, and private choices explain who can see what.
- **Editorial, human language.** Product copy is concise, cinematic, warm, and taste-aware.

## Core experience loops

### Discover and watch

`Home/Search/Profile/List -> Title -> Watch -> Progress -> Resume`

The member sees a confident recommendation, understands the personal or social reason, opens its detail, and starts a valid source. If that source fails, Consumit offers or performs a fallback without losing progress.

### Remember and express taste

`Watch -> History/Diary -> Rating/Review -> Favorites/Lists -> Profile`

Watching is retained independently of the provider. Explicit choices improve the member's profile and future discovery.

### Discover through people

`Circle activity -> Title/List/Profile -> Follow/Save/Watch -> New activity`

Social activity is asynchronous and discovery-led. It does not include private or direct messaging, live chat, or synchronized viewing.

## Active desktop screen inventory

The design manifest defines 18 active desktop references:

1. Home / Discover
2. Public Profile
3. Profile Owner View
4. Settings
5. Title Detail
6. Watch
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

Other screen files may be present in the package. A file becomes active only when added to the manifest; the archived custom-player concept remains historical.

These screens describe the intended product surface, not an automatic first-release commitment. The implementation sequence is in [DELIVERY.md](./DELIVERY.md).

## Home composition

The live catalog Home currently uses this order:

1. Featured hero with a direct Watch action
2. Trending tonight
3. Popular now
4. Top rated
5. Editorial selection
6. Browse by genre
7. Footer

Circle activity, continue-watching progress, and community lists return only when their real backing behavior exists. Live routes never fill those sections with invented member evidence.

## Movies and Series browsing

Movies (`/movies`) and Series (`/series`) help a member choose a title through a current-release rail followed by a filterable catalog. Movies labels its rail “Now playing”; Series uses “On air”. Opening artwork leads to the title detail.

The main catalog starts with Popular and offers genre, year, and Top rated controls. Available genre choices come from the initial current and popular titles; they are not an exhaustive genre directory. A chosen filter queries the catalog beyond the titles already shown, while the current-release rail remains independent. Reset returns to the default Popular catalog.

Scrolling near the end appends another page without duplicate titles. A keyboard-accessible Load more action remains available. Filter changes start a fresh result set; loading announces progress, failed requests offer Try again while retaining previously loaded titles, and stale results are identified. An empty result offers Clear filters; the final page explains that the member has reached the end.

## Confirmed scope constraints

- Watch rooms, co-watching rooms, and watch parties are excluded.
- Private or direct messaging between members is excluded; follows, profiles, reviews, lists, and circle activity carry the social experience.
- Streaming-service choices are availability preferences, not connected billing accounts.
- The active playback design is a dedicated, focused screen owned by the first-party Consumit Player.
- Playback uses authorized direct media sources; iframe and embed delivery are excluded.
- Guests can watch and resume locally. Members additionally sync progress. Playback defaults to adaptive quality, original audio, and English captions when available; explicit track preferences persist. Recovery retains position and playback intent. The provider backend is disabled until approved media is configured; physical iOS and release reliability gates are recorded in [PLAYBACK.md](./PLAYBACK.md).
- Every Watch action opens the dedicated first-party player route directly; the player is the screen, not an embedded panel inside a discovery surface.
- Computed Taste Match, overlap, member scores, and public numeric rating presentation are hidden until their product logic is implemented. A member authors and sees only their own ratings on title detail. Written reviews, catalog metadata, and watch progress remain visible.
- Account creation requires an available Username and verified email before a member session is issued. OAuth is not part of the active identity experience.
- Letterboxd history enters only through a member-uploaded ZIP or CSV with preview, TMDB match review, and explicit confirmation. Six ordered Favorites appear on the profile; Letterboxd likes and deleted exports are skipped.
- Profile, Library, and List screens render stored member records. Unsupported presence, follows, activity, and engagement counts render zero or honest empty states.
- Signed-out navigation keeps public catalog destinations visible and replaces the member avatar with Sign in. A signed-in member sees Friends and the existing profile entry.
- Global navigation, recommendations, reviews, circle activity, and promotions stay out of active playback.
- Mobile layouts will be composed intentionally; desktop screens will not simply be shrunk.
- Monetization uses first-class ads with fail-open playback: ad failure never blocks media, and ads stay visibly separate from editorial and member surfaces.

## Visual direction

The visual thesis is **cinema after midnight**: editorial, intimate, and alive with other people's taste.

| Role | Value |
|---|---|
| Canvas | `#09090B` |
| Surface | `#121215` |
| Raised surface | `#19191E` |
| Primary ink | `#F4F0E8` |
| Muted ink | `#AAA7A1` |
| Signal orange | `#FF5D38` |
| Social lilac | `#A79CFF` |
| Positive | `#B8D86D` |

- Display type: Bitstream Charter
- Interface type: DejaVu Sans
- Base spacing: 4 px; primary rhythm: 8 / 12 / 18 / 24 / 32 / 48 / 64

The durable visual system and page grammar live in [`DESIGN.md`](../DESIGN.md). The shared-component registry and active implementation boundaries live in [`docs/COMPONENTS.md`](./COMPONENTS.md).

## Near-term product gaps

- Notifications and release tracking
- Native diary, review, and list authoring
- Follows and real Circle activity
- Create/edit list flows
- Password recovery and verification states

Account settings and provider preferences already have an active desktop reference, despite also appearing in the package's historical “next” list.
