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

The design manifest defines 20 active desktop references:

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
12. Lists (the member's own lists with collage cards; discovery stays an honest placeholder until the social slice lands)
13. Sign In
14. Create Account
15. Onboarding — History
16. Onboarding — Favorites
17. Onboarding — Circle
18. Help Center
19. Report Issue
20. Title Reviews (member-review archive per title, reached from title detail for movies, series, and anime)

Other screen files may be present in the package. A file becomes active only when added to the manifest; the archived custom-player concept remains historical.

These screens describe the intended product surface, not an automatic first-release commitment. The implementation sequence is in [DELIVERY.md](./DELIVERY.md).

## Home composition

The live Home at `/` uses the FilScreen world: a full-page shell, dark by default with a member-flippable light theme, with a sidebar (Home, Categories, Favorites, Circle, History, theme switch, Settings, Sign in/Log out), a utility row with compact universal search, kind tabs (New, Series, Movies), Circle entry, and the member avatar, a rotating hero tracking Trending now with direct Watch and title actions, device-local Continue watching (stored progress records resolved through the catalog batch endpoint, with loading, empty, and retry states, last-watched-first ordering, finished-title dropout at 95 percent watched, and per-title removal through its edit action), a Trending Movies rail, a Trending Series rail, and Circle activity, which stays an honest empty state until follows and real activity exist.

Circle activity, community lists, and computed Taste Match return only when their real backing behavior exists. A "Coming soon" rail returns only with an upcoming catalog feed; existing feeds are never relabeled to fake it. Live routes never fill sections with invented member evidence.

## Movies and Series browsing

Movies (`/movies`) and Series (`/series`) help a member choose a title through a rail followed by a filterable catalog. Movies labels its rail “Now playing” (current releases); Series uses “Trending now” (weekly trending). Opening artwork leads to the title detail.

The main catalog starts with Popular and offers genre, year, and Top rated controls. Available genre choices come from the initial current and popular titles; they are not an exhaustive genre directory. A chosen filter queries the catalog beyond the titles already shown, while the rail remains independent. Reset returns to the default Popular catalog.

Scrolling near the end appends another page without duplicate titles. A keyboard-accessible Load more action remains available. Filter changes start a fresh result set; loading announces progress and failed requests offer Try again while retaining previously loaded titles. An empty result offers Clear filters; the final page explains that the member has reached the end.

## Confirmed scope constraints

- Watch rooms, co-watching rooms, and watch parties are excluded.
- Private or direct messaging between members is excluded; follows, profiles, reviews, lists, and circle activity carry the social experience.
- Streaming-service choices are availability preferences, not connected billing accounts.
- The active playback design is a dedicated, focused screen owned by the first-party Consumit Player.
- Playback uses validated configured media sources in the first-party Consumit Player. A configured provider may use the signed Cloudflare media proxy; public third-party sites may embed a separate Consumit player route with `autoplay`, `startAt`, and `lang` query parameters; the framed player posts `PLAYER_EVENT` messages (`play`, `pause`, `seeked`, `ended`, `timeupdate`) to the parent. Provider iframe players remain excluded.
- Guests can watch and resume locally. Members additionally sync progress. Playback defaults to adaptive quality, original audio, and English captions when available; explicit track preferences persist. Recovery retains position and playback intent. The provider backend is disabled until media is configured.
- Every Watch action opens the dedicated first-party player route. The separate public embed route does not replace that member experience.
- Computed Taste Match, overlap, member scores, and public numeric rating presentation are hidden until their product logic is implemented. A member authors and sees only their own ratings on title detail. Written reviews, catalog metadata, and watch progress remain visible.
- Account creation requires an available Username and verified email before a member session is issued. OAuth is not part of the active identity experience.
- Letterboxd history enters only through a member-uploaded ZIP or CSV with preview, TMDB match review, and explicit confirmation. Six ordered Favorites appear on the profile; Letterboxd likes and deleted exports are skipped.
- Profile, Library, and List screens render stored member records. Members follow each other from profiles with live follower counts; unsupported presence, activity, and engagement counts render zero or honest empty states.
- Signed-out navigation keeps public catalog destinations visible and replaces the member avatar with Sign in. A signed-in member sees Friends and the existing profile entry.
- Global navigation, recommendations, reviews, circle activity, and promotions stay out of active playback.
- Mobile layouts will be composed intentionally; desktop screens will not simply be shrunk.
- Monetization uses first-class ads with fail-open playback: ad failure never blocks media, and ads stay visibly separate from editorial and member surfaces.

## Visual direction

The visual thesis remains **Cinema After Midnight**: Consumit's original midnight palette, warm ivory, rare orange signals, Charter display type, DejaVu Sans controls, compact corners, and flat navigation. Improve usability within this identity. Reference websites inform interaction patterns only; they do not replace the product's visual system.

The durable visual tokens, responsive geometry, and page grammar live in [`DESIGN.md`](../DESIGN.md). The shared-component registry and active implementation boundaries live in [`docs/COMPONENTS.md`](./COMPONENTS.md).

## Near-term product gaps

- Notifications and release tracking
- Native diary, review, and list authoring
- Follows and real Circle activity
- Create/edit list flows
- Password recovery and verification states

Account settings and provider preferences already have an active desktop reference, despite also appearing in the package's historical “next” list.

## Personal spaces

The Library presents a member's saved titles on subtle display shelves in the existing visual system, with optional grid and compact list views. Search and movie/series/anime filters operate together on saved records; Clear filters restores the shelf. Missing catalog metadata never removes a stored title or its destination. Lists and diary retain their existing ownership and privacy rules.

The Profile is the central expression of a member's taste: a cinematic identity cover, six ordered Favorites, recurring genres derived from those Favorites, diary entries, authored reviews, and lists. Owner editing controls keep their real backing behavior. Unsupported social controls are omitted.

[Letterboxd's diary, Favorites, watchlist, and list concepts](https://letterboxd.com/about/faq/) inform these personal jobs. Consumit's visual system remains its own. Anime is now a first-class bounded domain with AniList as its metadata source, integrated into the same playback, library, social, and recommendation systems as movies and series. Member records key anime by AniList id under the shared title kind, anime titles carry their own detail, recommendations, and reviews surfaces, and unresolved anime references keep their stored destination the same way missing TMDB metadata does.
