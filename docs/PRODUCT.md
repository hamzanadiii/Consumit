# Product foundation

On the Watch page, matching HLS proxy movies renew access privately while the movie and its controls keep playing in the same buffered player. A healthy renewal does not visibly reload or reset playback. Actual delivery failures or a changed recording still use the existing recovery experience; native/cast/live playback retains its current behavior.

When a configured server supplies multiple fixed renditions, members select their resolution in the existing player Quality menu without adding server rows. Miami exposes its available 2160p, 1080p, 720p and 480p playlists this way; LookMovie exposes its available movie resolutions under one server, including 1080p, 720p and 480p on checked titles; Citadel exposes its 720p and 480p renditions under one server. Switching retains position and play intent; failure keeps the current stream with a notice. Fixed playlist choices do not imply adaptive Auto quality.

## Product definition

If automatic startup cannot create a playback session, Watch offers Choose another server in its existing error panel. Server discovery is lazy and retryable; selecting a configured server starts that exact source with the same title or episode and saved native position. A failed choice remains selected for Try again, while Auto restores the normal delivery waterfall. External frames retain their existing progress limitations.

Consumit is a cinematic streaming and personal taste-discovery product for movies, series, and anime. Its promise is: **watch immediately and remember what you love.**

The active product combines three jobs:

1. Help a member confidently choose what to watch.
2. Start playback with as little friction as possible.
3. Preserve history, progress, favorites, ratings, reviews, and lists.

## Product principles

- **Taste before volume.** Explain why a recommendation fits instead of presenting an undifferentiated poster wall.
- **Playback before promotion.** The path from a title to a playing source is the primary product path.
- **Progress belongs to the member.** History and resume position remain stable when the playback source changes.
- **Provider failure is normal.** Recovery should feel like source switching, not a technical error dump.
- **Personal collections stay private.** Profiles, watch history, diary, reviews, and lists belong to their member.
- **Editorial, human language.** Product copy is concise, cinematic, warm, and taste-aware.

## Core experience loops

### Discover and watch

`Home/Search/Profile/List -> Title -> Watch -> Progress -> Resume`

The member sees a confident recommendation, opens its detail, and starts a valid source. If that source fails, Consumit offers or performs a fallback without losing progress.

### Remember and express taste

`Watch -> History/Diary -> Rating/Review -> Favorites/Lists -> Profile`

Watching is retained independently of the provider. Explicit choices improve the member's profile and future discovery.

### Retired social surfaces

Friends/Circle, profile Network tabs, follower/following statistics and archives, follow actions, shared-list discovery, and public profile/list visibility are outside the active product. Their old links do not remain in navigation. Stored member records are preserved; removing these surfaces does not delete history, diary, ratings, reviews, or lists.

## Active desktop screen inventory

The active desktop references cover these personal streaming surfaces:

1. Home / Discover
2. Personal Profile
3. Settings
4. Title Detail
5. Watch
6. Series Detail
7. Search / Explore
8. Private List Detail (ordered titles; owners edit, reorder, annotate, and delete)
9. Personal Lists
10. Sign In
11. Create Account
12. Onboarding — History
13. Onboarding — Favorites
14. Help Center
15. Report Issue
16. Title Reviews
17. Personal Profile Archives (Activity, Watched, Diary, Reviews, Watchlist, History, Lists, Likes, and Tags)

Other screen files may be present in the package. A file becomes active only when added to the manifest; the archived custom-player concept remains historical.

These screens describe the intended product surface, not an automatic first-release commitment. The implementation sequence is in [DELIVERY.md](./DELIVERY.md).

## Home composition

Sidebar navigation shows Watchlist, Likes, Watched, History, and Lists to both members and guests. Signed-in choices open the existing private profile archives. Guest choices ask the visitor to sign in or create an account; sign-in retains the requested collection through `/library?section=…`. The top row beside Search shows the member avatar or a neutral Guest avatar. Members open Profile; guests open the same authentication entry with Profile retained as the destination. No guest account or member collection data is implied. The hero retains featured-title selection and automatic rotation without a Pause / Resume button.

Home at `/` keeps the FilScreen design: a near-black shell, collapsible left sidebar, compact catalog tabs (New, Series, Movies, Anime), search and member avatar. The backdrop hero rotates through enriched trending and popular titles, with Watch and title-detail actions. Continue watching is followed by Trending Movies, Trending Series, Trending Anime, Top Rated Movies, Top Rated Series, Award Winning Shows, and Mindf*ck Movies. Continue watching reads validated local progress, resolves titles in a bounded catalog batch, orders last-watched first, drops items at 95 percent completion, and offers per-title removal; it retains loading, empty, retry, and populated states. The server home builds curated shelves from real catalog feeds or explicit catalog-title batches. Computed Taste Match and personalized ranking return only when their signals and explanation are implemented. Live routes never fill sections with invented member evidence.

Computed Taste Match and personalized ranking return only when their signals and explanation are implemented. Live routes never fill sections with invented member evidence.

## Movies and Series browsing

Movies (`/movies`) and Series (`/series`) help a member choose a title through a rail followed by a filterable catalog. Movies labels its rail “Now playing” (current releases); Series uses “Trending now” (weekly trending). Opening artwork leads to the title detail.

The main catalog starts with Popular and offers genre, year, and Top rated controls. Available genre choices come from the initial current and popular titles; they are not an exhaustive genre directory. A chosen filter queries the catalog beyond the titles already shown, while the rail remains independent. Reset returns to the default Popular catalog.

Scrolling near the end appends another page without duplicate titles. A keyboard-accessible Load more action remains available. Filter changes start a fresh result set; loading announces progress and failed requests offer Try again while retaining previously loaded titles. An empty result offers Clear filters; the final page explains that the member has reached the end.

## Confirmed scope constraints

Title-detail Play actions use the latest saved progress for that title. An untouched movie, series, or anime shows Play. A partial watch shows Continue watching and opens the saved movie or exact episode; Watch restores its position. After a completed episode, Continue watching opens the next episode or series season only when catalog metadata confirms it. Completed movies, known final episodes, and completed episodes with unknown next-episode metadata show Watch again and reopen the saved destination. Guests use local progress; members use the newest of their own device and private account progress, retaining device progress when the account read fails. This continuation follows title and episode identity independently of the playback provider.

With player controls visible, bottom subtitles appear below the seek bar and above transport controls. The player reserves that space while bottom subtitles are on, including gaps between cues. The Top position preference stays available, and subtitles remain visible over the picture when controls hide. Small inline players keep enough height to contain subtitles and controls.

Desktop Watch uses Consumit's existing cinematic identity with larger open icon controls and an artwork-led preparation screen. Loading prefers the real catalog title logo with episode details underneath; missing or failed logos keep a readable text title. Loading distinguishes finding a stream from preparing playback without fabricated percentages. Back remains available during preparation; playback, gesture recovery, and failure leave that state. Buffering after playback starts stays compact. Neighboring episode controls use the exact Watch destinations: header arrows appear only in browser fullscreen, while the episode bar offers the same arrows outside fullscreen. This changes presentation without changing provider selection or progress ownership.

Catalog failure keeps the existing cinematic error panel and Retry catalog action. Rate-limited reads explain that too many requests arrived and suggest waiting before retry; other retryable outages describe temporary unavailability without claiming a timeout. The screen uses plain member-facing language and never substitutes invented titles for unavailable metadata.

Anime title pages help members continue a story through Related anime: earlier seasons, sequels, and connected films from AniList appear after Episodes. Staff is not an active title-page section. Logos prefer the selected title's artwork and may fall back to a verified parent series or a canonical prequel, while the selected season's title, dates, episodes, and playback identity remain intact.

Private personal-rating filters in Watched, Watchlist, and Diary support Any rating, No rating, exact half-star choices, and inclusive star ranges on the existing 1–10 scale. Ranges apply to loaded records with honest counts and pagination. Existing exact-score Watched archives still include the member's paginated rated titles. Visitors cannot access these personal-rating choices.

- The first-release product is movies, series and episodes, and anime. A manga reader is outside this product's current focus; it would need its own reader, content model, and licensing plan.
- The first-release loop is discovery, one-tap Watch, personal viewing history/diary, reviews, and private collections. Keep the existing Letterboxd import as an optional migration path.
- Ads and ad-serving infrastructure are deferred. Home, Movies/Series catalogs, title details, the owner's Profile overview, and Series/Anime Watch currently show layout-only advertisement placeholders for placement review, explicitly labelled Preview; these contain no advertising, scripts or tracking. Profile uses one 300×250 rectangle above the Watchlist preview in the highlights rail; Series/Anime Watch uses one banner above the player in the player column, leaving episode cards and playback controls untouched. Movie Watch and collection archives remain clear. Do not add an ad system to the Watch flow or make playback depend on an ad decision.
- Watch rooms, co-watching rooms, and watch parties are excluded.
- Private or direct messaging, follows, and circle activity are excluded.
- Streaming-service choices are availability preferences, not connected billing accounts.
- The active playback design is a dedicated, focused screen owned by the first-party Consumit Player.
- Public player embeds and their third-party API are deferred. The `/api` documentation, `/embed` pages, and `/v1/embed` endpoints are not part of the active product surface; member playback stays in the first-party Watch flow.
- Admin provider operations show every configured adapter and its enabled state. Admins can enable, disable, delete, and restore a provider; deletion is a durable, audited removal from new playback attempts, while restoration leaves it disabled until explicitly enabled. Admins save an exact attempt order per title kind, set request limits within configured region scope, retest a provider, and reset its circuit. Changes are stored as durable overrides and applied to playback without restarting the API. The base media configuration defines adapter identities and allowed hosts; admins cannot create adapter code or media hosts in the browser. Member progress and history remain independent of provider removal.
- Desktop Admin opens on a playback dashboard with movie, series and anime rosters, resolution probes, circuits, 15-minute playback measurements, service availability, firing alerts and recent changes. Unknown health, missing measurements and partial failures remain explicit. Refresh is bounded; optional 30-second polling runs while the dashboard is visible. Provider drafts and test results survive section changes.
- Providers has a staged Video delivery choice: Direct or Proxy for media providers, and Embed for frame providers (stored as `direct`/`relay`/`embed`). Save applies it to new resolution, manual selection, renewal and fallback without restarting the API; Discard and Reset retain their existing meaning. Existing rows remain Direct. Classification does not approve Worker traffic: a Proxy row needs independent API/Worker provider and exact-host approval, otherwise it stays out of playback. Added audio stays direct. Configured-provider debugging and Scout honor an installed provider’s saved path; uninstalled Scout candidates use their reviewed recipe. Proxy previews require independent Worker approval.
- Playback debug and Provider scout test an exact title against one to three selected providers, sequentially, with a 15-second adapter deadline and shared cooldowns. Scout is a finite catalog of reviewed, shipped recipes isolated from live playback. Results distinguish validated sources from actual browser decoding, startup, seeking and stalls. User-started, 60-second media checks use the Consumit Player without watch-history writes; frame previews use the sandboxed external player and report page resolution separately from playback evidence. Evidence exports omit signed URLs and tokens. Successful candidates offer a disabled recipe for operator review in the base configuration; testing never installs, enables, restores or reorders a provider. A passing sample does not establish full-title reliability.
- Playback starts with validated browser-direct media in the first-party Consumit Player. Saved provider order determines attempts; automatic recovery tries the direct provider waterfall first, then separately configured relay providers with approved Worker hosts, preserving progress and controls under [ADR 0005](./adr/0005-direct-first-worker-relay.md). Watch starts with Auto source selection and automatic recovery. Server in player settings offers configured alternatives on demand and identifies the current server. A manual choice preserves the exact movie/episode, latest position and play intent, and does not disable recovery. Failed selection explains when another source takes over or keeps the current playback with a notice. Returning to Auto keeps the current stream; each Watch screen starts in Auto. Server-list loading, failure/retry and no-alternative states remain in the existing panel. Quality and anime SUB/DUB stay separate. Configured provider embeds form the final recovery tier under [ADR 0006](./adr/0006-provider-embed-fallback.md). External controls stay inside the frame; title, Server, reload/fallback and manual episode navigation stay in Watch. Without a verified playback-event protocol, frames do not save progress/completion or support Consumit quality, subtitles, cast, separate audio or automatic episode advancement. Requested anime audio must exist, and dual-audio frames explicitly ask the member to select it inside the external player. Optional P2P on popular streams with matching media/renditions remains a later measured supplement. Exhausting all three tiers shows the existing unavailable/retry state; a loaded frame may independently show a verification or provider failure, with outside reload/server choices retained. The relay infrastructure uses Workers Free with thirteen explicitly configured relay providers. Vixsrc stays direct. The integration audit distinguishes working samples from remaining upstream edge failures.
- Admin assigns Video source, Audio source, or Both to each configured provider. Existing rows default to Video source. Audio source rows stay out of video attempts, manual switches, playback order, video health probes, and video tests. Roles do not verify capabilities; provider-wide audio health is untested. Apogee uses one Both row for movies and TV, supplying video and optional added audio through the bounded experiment. Tracks are validated on demand for the current title, including wrapper playlists used by movies. Declared audio languages are labeled as declarations, not verified title availability.
- The member's chosen resolution survives source changes and is stored on the device. Each replacement maps the preference to its own rendition identifiers. If that resolution is unavailable, the player selects the best lower known rendition (or the lowest available when all are higher), explains the actual selection, and retains the original preference for later sources. Unknown resolutions are described as unreported. Audio language preferences are matched by canonical language rather than source-specific track indices; recovery requests carry the latest language and resolution intent. Anime's explicit SUB/DUB selection still controls recovery audio. The added-audio experiment requires an explicit track selection and checks the audio timeline before attachment; failures retain ordinary video audio.
- Desktop Audio presents stream and separate languages in one list under [ADR 0004](./adr/0004-opt-in-separate-audio.md). Duplicate language choices are merged without provider labels or separate-source sections. The stream's own track is preferred when available; missing languages may use explicitly selected separate audio. Known regional and accessibility variants stay distinct. Separate audio retains the current picture and quality, follows pause/seek/speed/volume/mute, and offers per-selection audio sync. Large recording-length mismatches are rejected; smaller differences show guidance without claiming dialogue alignment. Failure restores the stream's own sound. Anime, casting and native-only HLS retain their existing audio behavior.
- Casting sends the active Watch session to the TV receiver through Chromecast. The sender keeps the session, progress, history, and telemetry; the receiver only plays media and reports status, and disconnect resumes the phone at the TV's position. Server switches and renewals reload cast media at the retained position.
- A completed Watch stream creates one private Watch History event for the exact movie or series/Anime episode. A replay creates another event; retries and source recovery reuse the same completion attempt. Movie completion also marks the title watched. The member authors Diary entries deliberately; automatic completions do not publish a Diary entry or review. From a completed history row, a member can deliberately create an exact-episode Diary entry using its completion date; title ratings and reviews remain attached to the series or anime. The personal Profile preserves the episode identity and link to that Watch episode. The owner profile shows paged Watch History separately from Diary, and account export includes both records.
- Guests can watch and resume locally. Members additionally sync progress. Playback defaults to adaptive quality, English audio for movies and series and original audio with subtitles for anime, and English captions when available; explicit track preferences persist. Opening captions discovers available languages across the configured subtitle providers, shows counts and paged tracks per language, and prepares the selected file on demand. Search, upload of a local SRT/VTT file for the current viewing session, and subtitle sync sit in that menu. Missing credentials, no matches, and subtitle failures remain distinct states; a subtitle failure does not stop video. A healthy source renewal retains position, play state, captions, and sync offset. A failed source renews or advances through eligible direct providers; header-blocked media advances immediately. Recovery keeps provider details hidden and retains member progress. The provider backend is disabled until media is configured.
- Every Watch action opens the dedicated first-party player route.
- Anime SUB selects original audio and DUB selects English audio. For external frames, choose the requested audio inside the provider player. DUB does not silently substitute SUB when the requested episode has no usable dub. Sub-only adapters stay eligible for SUB and are excluded from DUB attempts and diagnostic rosters. If no dub resolves, Watch explains that it could not load an English dub and offers retry or choosing SUB; the existing toggle remains available.
- Series and Anime episode lists show the known title, summary, air date, runtime, and episode still. Anime details load for the visible episode page through a bounded batch; when no trusted episode still exists, the card labels its title-art fallback. The anime Watch pause overlay shows the matched title logo when available, with a text fallback, episode facts, and synopsis. Small screens keep the logo and episode context in the player header so the controls remain clear.
- Computed Taste Match, overlap, and member scores stay hidden until their product logic is implemented. Personal profiles show real 1–10 rating bins and title-by-title ratings only to their owner.
- Account creation requires an available Username and verified email before a member session is issued. OAuth is not part of the active identity experience.
- Letterboxd history enters only through a member-uploaded ZIP or CSV with preview, TMDB match review, and explicit confirmation. Four ordered Favorites appear on the profile; Letterboxd likes and deleted exports are skipped.
- Profile and List screens render stored member records. Profiles and lists are private; unsupported activity and engagement evidence stays hidden.
- Signed-out navigation keeps public catalog destinations visible and replaces the member avatar with Sign in. A signed-in member sees their personal profile and account controls.
- Global navigation, recommendations, reviews and promotions stay out of active playback.
- Desktop player Settings opens a dedicated Playback settings panel for speed, brightness, and optional volume boost up to 3×. Boost starts Off for each mounted player, preserves native volume and mute, and explains unavailable browser support while retaining normal audio. Quality, audio, subtitles, and subtitle sync retain dedicated panels with consistent navigation.
- Subtitle size, style, position, and font live in a dedicated Subtitle appearance panel opened from Subtitles. Returning to the track list retains these device-local choices without requesting discovery again; track selection, preferred languages, and timing remain in their existing subtitle controls.
- Subtitle rows show readable native language names, including Arabic, with provider/release details kept secondary. Bottom captions do not move the time display or seek bar when enabled or when their text changes. The volume slider appears on speaker-control hover or keyboard focus, with a tap/focus fallback on touch.
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

The Profile is the home for private Watchlist, Watch History, and personal taste archives. The owner opens saved titles at `/profile/{username}/watchlist` and completed watches at `/profile/{username}/history`; both retain the profile identity header and tabs. Watch History lets the owner watch again or deliberately log an exact movie or series/anime episode into Diary. The owner’s `/profile/{username}/lists` section contains list creation and private collections. Visitor access is rejected. The old `/watchlist`, `/library`, and `/lists` entry points redirect to the corresponding owner profile sections for existing bookmarks. Individual lists keep their `/lists/{slug}` detail and editing routes.

The personal Profile combines a cinematic identity cover, four ordered Favorites, recurring genres derived from those Favorites, recent watches, reviews, and stored member archives. Its overview pairs Favorite artwork and activity with Diary, Watchlist, and recent-list previews. Owner-only, cursor-paginated routes expose Activity, Watched, Diary, Reviews, Watchlist, History, Lists, Likes, and Tags. Watched supports genre and decade filters, release-date sorting, and personal-rating filters. Watchlist supports search, type, genre, decade, personal-rating filters, sorting, and pagination within the profile archive layout. History pages private completed watches separately from the authored Diary. Filters apply to loaded records, with pagination for earlier titles. Lists support name search and local sorting. Owner editing controls retain their backing behavior. Rating histograms use stored rating bins; selecting a non-empty bin opens private, paginated titles at that rating through an authenticated no-store endpoint. Service availability is not modeled as catalog data, so profile filters do not offer a service selector.

The Diary archive groups logs by watched month and year, keeping the member's chosen date, exact episode, tags, and rewatch state visible. Loaded entries can be narrowed by title search, watched year, release decade, genre, watch type, and owner-only current title rating, then sorted by watched date or alphabetically within each month. Owners edit dates, tags, and rewatch state or delete a log through an explicit confirmation; successful changes update the visible journal. Ratings describe the owner's current title score, not a historical score for that watch. Diary records and editing controls are available only to the owner. Pagination reaches earlier entries, and missing catalog details retain stored references and destinations.

[Letterboxd's diary, Favorites, watchlist, and list concepts](https://letterboxd.com/about/faq/) inform these personal jobs. Consumit's visual system remains its own. Anime is now a first-class bounded domain with AniList as its metadata source, integrated into the same playback, library, and recommendation systems as movies and series. Member records key anime by AniList id under the shared title kind, anime titles carry their own detail, recommendations, and reviews surfaces, and unresolved anime references keep their stored destination the same way missing TMDB metadata does.
