# Product foundation

## Product definition

Consumit is a cinematic social streaming and taste-discovery product for movies, series, and anime. Its promise is: **watch immediately, remember what you love, and discover through people whose taste you trust.**

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
9. Friends Activity
10. List Detail (ordered public/private titles; owners edit, reorder, annotate, change visibility, and delete; members can save another public list)
11. Lists (the member's lists, saved public collections, and public lists from followed members)
12. Sign In
13. Create Account
14. Onboarding — History
15. Onboarding — Favorites
16. Onboarding — Circle
17. Help Center
18. Report Issue
19. Title Reviews (member-review archive per title, reached from title detail for movies, series, and anime)
20. Member Profile Archives (paginated Activity, Films, Diary, Reviews, owner-only Watchlist and History, Lists, Likes, Tags, and public Network sections)

Other screen files may be present in the package. A file becomes active only when added to the manifest; the archived custom-player concept remains historical.

These screens describe the intended product surface, not an automatic first-release commitment. The implementation sequence is in [DELIVERY.md](./DELIVERY.md).

## Home composition

Home at `/` keeps the FilScreen design: a near-black shell, collapsible left sidebar, compact catalog tabs (New, Series, Movies, Anime), search, Circle entry, and member avatar. The backdrop hero rotates through enriched trending and popular titles, with Watch and title-detail actions. Continue watching is followed by Trending Movies, Trending Series, Trending Anime, Top Rated Movies, Top Rated Series, Award Winning Shows, Mindf*ck Movies, and Circle activity. Continue watching reads validated local progress, resolves titles in a bounded catalog batch, orders last-watched first, drops items at 95 percent completion, and offers per-title removal; it retains loading, empty, retry, and populated states. Circle activity links real public diary, review, and list events to their author and underlying title or list, with honest unavailable and empty states. The server home builds curated shelves from real catalog feeds or explicit catalog-title batches; it resolves Circle title labels only when recent activity needs them. Computed Taste Match and personalized ranking return only when their signals and explanation are implemented. Live routes never fill sections with invented member evidence.

Circle activity and public-list discovery use real member data. Computed Taste Match and personalized ranking return only when their signals and explanation are implemented. Live routes never fill sections with invented member evidence.

## Movies and Series browsing

Movies (`/movies`) and Series (`/series`) help a member choose a title through a rail followed by a filterable catalog. Movies labels its rail “Now playing” (current releases); Series uses “Trending now” (weekly trending). Opening artwork leads to the title detail.

The main catalog starts with Popular and offers genre, year, and Top rated controls. Available genre choices come from the initial current and popular titles; they are not an exhaustive genre directory. A chosen filter queries the catalog beyond the titles already shown, while the rail remains independent. Reset returns to the default Popular catalog.

Scrolling near the end appends another page without duplicate titles. A keyboard-accessible Load more action remains available. Filter changes start a fresh result set; loading announces progress and failed requests offer Try again while retaining previously loaded titles. An empty result offers Clear filters; the final page explains that the member has reached the end.

## Confirmed scope constraints

Anime title pages help members continue a story through Related anime: earlier seasons, sequels, and connected films from AniList appear after Episodes. Staff is not an active title-page section. Logos prefer the selected title's artwork and may fall back to a verified parent series or a canonical prequel, while the selected season's title, dates, episodes, and playback identity remain intact.

Private personal-rating filters in Films, Watchlist, and Diary support Any rating, No rating, exact half-star choices, and inclusive star ranges on the existing 1–10 scale. Ranges apply to loaded records with honest counts and pagination. Existing exact-score Films archives still include the member's paginated rated titles. Visitors cannot access these personal-rating choices.

- The first-release product is movies, series and episodes, and anime. A manga reader is outside this product's current focus; it would need its own reader, content model, and licensing plan.
- The first-release loop is discovery, one-tap Watch, personal viewing history/diary, and social taste through profiles, Circle, reviews, and lists. Keep the existing Letterboxd import as an optional migration path.
- Ads and ad-serving infrastructure are deferred. Do not add an ad system to the Watch flow or make playback depend on an ad decision.
- Watch rooms, co-watching rooms, and watch parties are excluded.
- Private or direct messaging between members is excluded; follows, profiles, reviews, lists, and circle activity carry the social experience.
- Streaming-service choices are availability preferences, not connected billing accounts.
- The active playback design is a dedicated, focused screen owned by the first-party Consumit Player.
- Public player embeds and their third-party API are deferred. The `/api` documentation, `/embed` pages, and `/v1/embed` endpoints are not part of the active product surface; member playback stays in the first-party Watch flow.
- Admin provider operations show every configured adapter and its enabled state. Admins can enable, disable, delete, and restore a provider; deletion is a durable, audited removal from new playback attempts, while restoration leaves it disabled until explicitly enabled. Admins save an exact attempt order per title kind, set request limits within configured region scope, retest a provider, and reset its circuit. Changes are stored as durable overrides and applied to playback without restarting the API. The base media configuration defines adapter identities and allowed hosts; admins cannot create adapter code or media hosts in the browser. Member progress and history remain independent of provider removal.
- Playback uses validated browser-direct media in the first-party Consumit Player. Saved provider order determines attempts, and failed playback falls back to another direct provider while preserving progress. The Watch screen hides provider and source identities and says only when playback is switching or needs attention. Provider iframe players remain excluded.
- Casting sends the active Watch session to the TV receiver through Chromecast. The sender keeps the session, progress, history, and telemetry; the receiver only plays media and reports status, and disconnect resumes the phone at the TV's position. Server switches and renewals reload cast media at the retained position.
- A completed Watch stream creates one private Watch History event for the exact movie or series/Anime episode. A replay creates another event; retries and source recovery reuse the same completion attempt. Movie completion also marks the title watched. The member authors Diary entries deliberately; automatic completions do not publish a Diary entry, review, or Circle activity. From a completed history row, a member can deliberately create an exact-episode Diary entry using its completion date; title ratings and reviews remain attached to the series or anime. Profile and Circle preserve the episode identity and link to that Watch episode. The owner profile shows paged Watch History separately from Diary, and account export includes both records.
- Guests can watch and resume locally. Members additionally sync progress. Playback defaults to adaptive quality, English audio for movies and series and original audio with subtitles for anime, and English captions when available; explicit track preferences persist. Opening captions discovers available languages across the configured subtitle providers, shows counts and paged tracks per language, and prepares the selected file on demand. Search, upload of a local SRT/VTT file for the current viewing session, and subtitle sync sit in that menu. Missing credentials, no matches, and subtitle failures remain distinct states; a subtitle failure does not stop video. A healthy source renewal retains position, play state, captions, and sync offset. A failed source renews or advances through eligible direct providers; header-blocked media advances immediately. Recovery keeps provider details hidden and retains member progress. The provider backend is disabled until media is configured.
- Every Watch action opens the dedicated first-party player route.
- Series and Anime episode lists show the known title, summary, air date, runtime, and episode still. Anime details load for the visible episode page through a bounded batch; when no trusted episode still exists, the card labels its title-art fallback. The anime Watch pause overlay shows the matched title logo when available, with a text fallback, episode facts, and synopsis. Small screens keep the logo and episode context in the player header so the controls remain clear.
- Computed Taste Match, overlap, and member scores stay hidden until their product logic is implemented. Public profiles may show a histogram of real 1–10 rating bins; the individual title-by-title ratings remain visible only to their author.
- Account creation requires an available Username and verified email before a member session is issued. OAuth is not part of the active identity experience.
- Letterboxd history enters only through a member-uploaded ZIP or CSV with preview, TMDB match review, and explicit confirmation. Four ordered Favorites appear on the profile; Letterboxd likes and deleted exports are skipped.
- Profile and List screens render stored member records. Members follow each other from profiles with live follower counts; unsupported presence, activity, and engagement counts render zero or honest empty states.
- Signed-out navigation keeps public catalog destinations visible and replaces the member avatar with Sign in. A signed-in member sees Friends and the existing profile entry.
- Global navigation, recommendations, reviews, circle activity, and promotions stay out of active playback.
- Mobile layouts will be composed intentionally; desktop screens will not simply be shrunk.
- If monetization is reconsidered after the core watch-and-journal loop is validated, it requires a new product decision and must preserve an uninterrupted member-controlled Watch experience.

## Visual direction

The active visual direction is **Cinema After Midnight**: Consumit's near-black surfaces, warm ivory type, rare signal-orange actions, Charter display type, and compact geometry. The user's current-app screenshot confirms this design as the target. The surface contract and tokens are documented in `DESIGN.md`; active screens keep their task-specific layouts within this shared visual language.

The durable visual tokens, responsive geometry, and page grammar live in [`DESIGN.md`](../DESIGN.md). The shared-component registry and active implementation boundaries live in [`docs/COMPONENTS.md`](./COMPONENTS.md).

## Near-term product gaps

- Notifications and release tracking
- A reviewed Taste Match signal model for personalized ranking
- Production `SUPPORT_EMAIL` configuration for Report Issue email drafts

## Help and issue reporting

Help Center answers describe shipped account, catalog, library, and playback behavior and link to the related member task. Report Issue asks for a category, short summary, what happened, and an optional reply address. It never adds watch history, provider identity, page activity, passwords, or payment details. When the operator configures `SUPPORT_EMAIL`, the member can prepare an editable email draft and review and send it in their email app. Consumit does not persist or send the report. Without a valid address, the page explains that reporting is unavailable and links back to Help.

Account settings and provider preferences already have an active desktop reference, despite also appearing in the package's historical “next” list.

## Personal spaces

The Profile is the home for private Watchlist and Watch History alongside public taste archives. The owner opens saved titles at `/profile/{username}/watchlist` and completed watches at `/profile/{username}/history`; both retain the profile identity header and tabs. Watch History stays private and lets the owner watch again or deliberately log an exact movie or series/anime episode into Diary. The owner's `/profile/{username}/lists` section contains list creation, owned collections, saved public lists, and discovery from their Circle. Visitors see only public lists. The old `/watchlist`, `/library`, and `/lists` entry points redirect to the corresponding owner profile sections for existing bookmarks. Individual lists keep their `/lists/{slug}` detail and editing routes.

The Profile is the central expression of a member's taste: a cinematic identity cover, four ordered Favorites, recurring genres derived from those Favorites, recent watches and review excerpts, and real member archives. Its concise overview pairs Favorite artwork and activity with Diary, private Watchlist, recent-list, and public Following previews. Dedicated, cursor-paginated profile routes expose Activity, Films, Diary, Reviews, owner-only Watchlist and History, Lists, Likes, Tags, and public Network records; Films supports genre and decade filters, release-date sorting, and owner-only personal-rating filters, while Watchlist stays inside the profile archive layout with search, type, genre, decade, personal-rating filters, sorting, and pagination. History pages private completed watches separately from the authored Diary. Filters apply to loaded records, with pagination for earlier titles. Lists archives support search, owner visibility filters, and local sorting. Saved Titles never enter visitor profile responses or archive APIs. Owner editing controls keep their real backing behavior. Rating histograms use stored rating bins only; owners can select a non-empty bin to open their private, paginated titles at that rating through an authenticated no-store endpoint. Visitors see grouped counts only, never per-title ratings. Service availability is not yet modeled as catalog data, so profile filters do not offer a service selector.

The Diary archive groups logs by watched month and year, keeping the member's chosen date, exact episode, tags, and rewatch state visible. Loaded entries can be narrowed by title search, watched year, release decade, genre, watch type, and owner-only current title rating, then sorted by watched date or alphabetically within each month. Owners edit dates, tags, and rewatch state or delete a log through an explicit confirmation; successful changes update the visible journal. Ratings describe the owner's current title score, not a historical score for that watch. Visitors see public logs without individual ratings or editing controls. Pagination reaches earlier entries, and missing catalog details retain stored references and destinations.

[Letterboxd's diary, Favorites, watchlist, and list concepts](https://letterboxd.com/about/faq/) inform these personal jobs. Consumit's visual system remains its own. Anime is now a first-class bounded domain with AniList as its metadata source, integrated into the same playback, library, social, and recommendation systems as movies and series. Member records key anime by AniList id under the shared title kind, anime titles carry their own detail, recommendations, and reviews surfaces, and unresolved anime references keep their stored destination the same way missing TMDB metadata does.
