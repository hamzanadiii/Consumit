# Shared component roadmap

This roadmap records Consumit’s buildable component families, implementation order, and boundaries. [`DESIGN.md`](../DESIGN.md) is the durable visual authority, and shipped shared components are the executable reference.

Optional separate audio (ADR 0004) joins the existing 300px Audio panel's single alphabetized language list. Canonical language codes merge duplicate stream and separate tracks, remove upstream numbering and hide provider provenance from members. The current stream's rendition is preferred when it supplies that language; otherwise the row selects a validated separate track. Known regional, commentary and audio-description variants stay distinct. All member IDs remain internal so selected, preparing, failed and restored states map to the single row even when its underlying track was deduplicated. Audio sync appears only for active separate audio. The shared player owns the independent audio element; Watch supplies validated candidates and preparation. Source replacement cancels separate audio. Existing keyboard dismissal, focus return, stage containment, volume/mute and boost controls retain their behavior.

## Rules

Native player chrome stays visible while a keyboard-focused control is operated, including playback start and pointer movement. Mouse-only focus does not prevent the normal fade; leaving keyboard focus restores automatic hiding. The browser's `:focus-visible` state distinguishes the two.

Watch's initial unavailable state retains Try again and Return to title and adds a shared Choose another server action. It opens a labeled native Server select with Auto, disabled unavailable choices, loading, retry and empty states. Selection remains busy until resolution ends, survives a failed startup retry, and retains the canonical title/episode and native checkpoint. No session is required to request the configured provider snapshot.

`shared/ProviderFrame` is the Watch/Admin surface for validated provider embeds under ADR 0006. It preserves the dark player stage, compact shared buttons, loading/slow/error/reload states and an outside keyboard-accessible Server select. Mobile lets the title occupy its own row. The frame keeps its own playback controls; Consumit does not synthesize progress, decoded playback, completion, quality, cast, subtitles or auto-next. Popup/top navigation remains sandboxed. An explicit new-tab link uses `noopener noreferrer` for providers that reject frames. Requested anime audio guidance explains that it must be chosen inside a dual-audio frame. Existing native controls and episode-room preferences retain their media-only behavior.

`shared/AdPlaceholder` previews a planned advertisement slot without a script, request, link or tracking. Its container queries choose exact 728×90, 468×60 or 320×50 banners, or a 300×250 rectangle; slots that cannot fit remain hidden. Its early/middle/late position attribute identifies preview locations. Home has up to three banners after Continue watching, Trending Series and Top Rated Series, omitting the latter breaks when their shelves are absent. Catalogs have an early banner below a populated featured rail and one visible slot after two complete rows on wider layouts or four rows on mobile; short/empty results omit the grid slot. Title details have a banner below the hero plus a rectangle beside Overview on wide layouts or a banner before Related on narrower layouts. The owner's Profile overview composes one 300×250 rectangle above the Watchlist preview in the highlights rail. Series/Anime Watch composes one banner above the player across the full content width, centered on the page rather than inside the player column. The Preview label, muted dashed boundary and page tokens distinguish the empty slot from catalog content. Movie/fullscreen Watch, collection archives and authentication surfaces do not compose it.

Desktop Admin composes `OperationsDashboard`, the existing durable `ProvidersTab`, and a lazily loaded `ProviderBench` in the FilScreen shell. Internal navigation preserves provider drafts and test evidence after visiting a section; inactive benches abort runs and unmount preview media. The overview uses partial service snapshots, compact per-kind selection, a filtered fleet table, attention/service summaries and recent changes. Debug keeps the selected provider and title kind. Shared buttons, inputs, selections, status dots, loading/empty states and Consumit Player controls retain the current visual authority. Source resolution and browser evidence remain separately labeled, and diagnostic exports use an explicit safe projection.

`ProvidersTab` adds a Video delivery column using the existing native form-select styling: Direct / Proxy, staged alongside role and limits. An unapproved Proxy draft says Awaiting Worker approval; this assignment does not register hosts. Audio-only rows disable the video selector and explain that added audio stays direct. The wider desktop table scrolls within its container. Provider order and health rows display the saved Direct/Proxy mode instead of a hardcoded Direct label. Draft row changes say Save to apply; the order list reflects saved settings. Configured diagnostic previews identify Direct or Proxy and exported evidence retains that path without signed source URLs.

- Finish one component and its meaningful states before starting the next.
- Add only variants already demanded by an active design or the immediately selected screen.
- Preserve Cinema After Midnight: near-black surfaces, warm editorial type, signal-orange actions, scarce lilac and lime signals, and compact corners.
- Use Lucide for interface icons. Use Radix primitives when keyboard behavior, focus management, or ARIA semantics are complex. Do not import a generic shadcn theme; individual patterns may be adapted into Consumit-owned code when useful.
- Every component ships through `@consumit/ui` with its public types, a catalog example, behavioral tests where interaction exists, and responsive/focus verification.

## Cross-screen contracts

`ConsumitPlayer` composes shared internal `PlayerPanel`, `PlayerSettingRow`, and `PlayerAdjustment` primitives. Desktop Quality, Server, Audio, Subtitles, Subtitle sync, Settings, and Playback settings share their header, close/back controls, focus return, bounded scrolling, and selection treatment. Settings links to Playback settings rather than displaying inline speed buttons. Playback settings contains keyboard-operable native sliders for configured speed steps, brightness, and 1–3× audio gain. Unsupported audio activation shows a normal-volume fallback; boost is local to the mounted media element and does not change provider selection or watch history. Existing subtitle discovery, upload, sync, appearance, and server health/favorite behavior stay available.

Watch exposes Server through the existing Settings row, without adding a transport-toolbar icon. ConsumitPlayer presents a controlled Auto choice, current server, lazy discovery/loading/retry states, and provider options; Watch owns discovery, validated switching and recovery. Auto is the default for each Watch screen and returning to it retains the current stream. Manual choices retain the latest position and play intent; failed choices explain fallback or retain the current media. Busy switches disable selection. Quality and anime SUB/DUB remain independent. The current provider stays in the menu when discovery fails or omits it.

These patterns recur across the complete active screen set and should be preserved as components are added:

Subtitle appearance uses its own `PlayerPanel`, entered through a named row in Subtitles. Size, style, position, and font controls keep their stored/controlled behavior while leaving the track list free of appearance controls. Back returns to Subtitles without another discovery request; Close restores the opening toolbar control's focus.

- **Global shell:** a collapsible left sidebar carries Home, Watchlist, Likes, Watched, History, and Lists for members and guests, plus theme, Settings, and account actions. Member shortcuts open the existing private profile archives and highlight exact or nested matching routes. Guest shortcuts pass their intended destination through the sign-in screen, which also offers account creation. Collapsed links keep accessible names and tooltips. Universal search replaces a separate Categories destination. The catalog row carries New / Series / Movies / Anime and the member avatar or neutral Guest avatar beside Search; the latter asks for authentication before opening Profile. Authentication, onboarding, reporting, and Watch retain purpose-specific reduced headers.
- **Page structure:** artwork-led hero and rails organize Home discovery; other routes use the composition that fits their member task. Mobile uses deliberate stacked layouts.
- **Action hierarchy:** signal orange marks committed actions and active routes; warm ivory supports confident primary and secondary actions; outlines hold reversible options; muted text handles low-emphasis destinations.
- **Semantic signals:** signal orange marks selection, decisions, ratings, and active progress; lilac is reserved for social/taste context; lime is reserved for presence, health, and success.
- **Geometry:** preserve the original 5px controls, 6px cards, and 3px micro corners across Consumit. Circular shapes identify avatars and established icon affordances.
- **Assets:** reuse the supplied lockup, mark, cinematic backdrop, poster motifs, member avatar treatment, and neutral service identifiers. Do not recreate those assets with generic iconography.
- **Depth:** interface surfaces are flat and separated by tone or border. Shadows belong to artwork separation, not routine controls or panels.

`TitleCard` is the app-level universal portrait card, backed by the shared UI `WatchCard`. It preserves the original Home card: the title and year/type appear over the poster on hover or keyboard focus, with an optional rating, orange frame, and screen-specific Save action. The same card is reused by Home and Anime rails, catalog and search grids, Watchlist, profile Favorites, Recent Activity, and Watched/Likes archives. Save controls remain available on touch. Featured landscape cards, Continue watching, diary/activity rows, and empty Favorite frames keep their purpose-specific layouts. Home composes the shared FilScreen shell, rotating cinematic hero, Continue watching, trending and curated title rails, .

`PosterStack` is the shared collection-preview composition used by the profile Watchlist, recent lists, list collages, and `CuratedListCard`. It renders at most five overlapping portrait covers with fixed layout geometry, supplied destinations and accessible names, a missing-art fallback, and independent keyboard focus for linked covers. `SectionHeading` owns the ruled editorial header and its compact sidebar variant; its `id` identifies the actual heading so section names exclude actions and descriptions. Shared poster edges, metadata contrast, and quiet navigation feedback carry the same finish across discovery, profiles, settings, support, and Admin.

`ContinueRail` keeps landscape cards at a consistent size and brightness while scrolling. Its local CSS module owns restrained shadows, a 3px hover/focus lift, artwork-only zoom, and a short reveal for Save/details actions. Text, time, and progress stay fixed; progress has no looping shimmer. Touch actions stay visible and reduced motion removes card/image movement. Resume destinations, loading/error states, and device-local removal remain owned by the existing rail.

## Application composition boundary

`shared/EpisodeCard` owns the shared Anime-derived episode presentation for Series and Anime. Callers provide exact Watch destinations, episode metadata and availability. It uses clean landscape artwork, compact corners, bold titles, a solid orange Play episode action and a noninteractive Upcoming state. Series season selection/paging and Anime metadata batches/airing rules stay in their respective sections.

Movies, Series and Anime featured landscape rails use the documented Continue watching shadow values for rest, hover and keyboard focus. Insets within their horizontal scroll area preserve the soft shadow fade and focus frame without changing card destinations or poster-grid styling.

`apps/web/src/app/catalog/title-play-action.tsx` owns the shared title-detail playback action used by movie, series, and anime heroes. It keeps the existing orange link styling and computes Play, Continue watching, or Watch again with `titlePlayDestination`. `readTitleProgress` selects the newest validated guest- or member-scoped device record and, for members, authenticated private account progress; failed account reads retain local progress. Partial watches open the saved exact episode. Completed episodic watches advance only through known episode/season metadata; completed movies, known final episodes, and unknown next-episode metadata replay the saved destination. Progress remains independent of providers. Session identity gates saved results, and storage, focus, and progress events refresh the action.

Provider management keeps its shared table, controls, and state feedback. Each row adds a native, labeled role select so its options escape the scrolling table. Save/Discard/Reset use the existing staged mutation flow; audio-only rows leave the video order editor after Save. Capability text distinguishes separate audio verification, untested audio health, and declared languages.

The player controller snapshot separates selected quality from retained resolution preference. Source changes remap rendition identifiers, explain a known downgrade inside the Quality panel, and retain the requested resolution. The player header does not show a quality fallback notice. Audio matches canonical language (including ISO aliases) across different track indices. Preferences pass through a shared callback to Watch/embed recovery without changing watch history or the player design.

`FilScreenHeroRotator` owns Home's featured selection and progress clock. Desktop styling remains local to `hero-rotator.module.css` at 1024px and above and preserves the shared shell, fonts, controls, and title destinations. The hero has no Pause / Resume control. Hover, focus, intersection, document visibility, and reduced motion stop the animation-frame loop; resuming retains its elapsed progress. Single-slide and reduced-motion presentations never auto-advance. Inactive slides remain inert and hidden from assistive technology, with secondary artwork lazily loaded.

Movies, Series and Anime browsing composes the shared `BrowseHero` masthead, `TitleCard` poster grid, `Button`, `Select`, and FilScreen shell in `apps/web/src/app/catalog/catalog-browse-content.tsx` and `apps/web/src/app/anime/anime-browse-content.tsx`. Its hairline filter bar, landscape feature rail, and catalog feed remain application-specific. `use-catalog-feed.ts` owns query-scoped cancellation, deduplicated page appends, scroll loading, and retry state; `apps/web/src/lib/catalog-browser.ts` validates browser discovery responses. These catalog behaviors do not belong in shared media or selection primitives. The member flow lives in [PRODUCT.md](./PRODUCT.md#movies-and-series-browsing), and its visual composition lives in [DESIGN.md](../DESIGN.md#movies-and-series-browsing).

## Build order

| Order | Family | Components | Status |
|---:|---|---|---|
| 1 | Action | Button, icon button, loading and disabled states | Complete |
| 2 | Global shell | FilScreen sidebar, catalog tabs, theme, search overlay | Complete |
| 3 | Form foundation | Label, input, search field, textarea, helper/error text, checkbox | Complete |
| 4 | Selection | Tabs, dropdown select, filter chip, segmented control, toggle | Complete |
| 5 | Identity | Avatar, service mark | Complete |
| 6 | Signals | Badge, status dot, progress rail, rating display | Complete |
| 7 | Media | Artwork frame, empty/missing art | Complete |
| 8 | Content cards | Watch card, curated-list card | Complete |
| 9 | Editorial | Section heading | Complete |
| 10 | Profile | Diary row | Complete |
| 11 | Title and series | Cast card, season selector | Complete |
| 12 | Personal archives and lists | Saved-title card, ordered-title row | Complete |
| 13 | Authentication | Auth shell, auth field, verification/recovery states | Complete |
| 14 | Onboarding | Onboarding header, selectable title | Complete |
| 15 | Settings and support | Settings rail/section, preference row | Complete |
| 16 | Playback shell | Watch header, Consumit Player | Complete (UI shell) |
| 17 | Global finish | Empty/loading/error compositions, responsive refinements | Complete |

The pre-FilScreen global navigation, session navigation, page footer component, component gallery, social card family, and gallery-only specimens (Trending card, Profile masthead, Title masthead, Episode row, Taste Match, Dropzone, Trust note, Curator panel, Library toolbar, Import option, Member suggestion, Issue selector, Source selector) were deleted once FilScreen owned the shell.

## Component 01 — Button

Source references: Home / Discover, Title Detail, authentication, onboarding, settings, Help Center, and Report Issue.

Included states:

- Signal-orange primary action
- Signal-orange flow-commit action
- Secondary outlined action
- Ghost action
- Destructive action
- Small, default, large, and icon sizes
- Disabled and loading behavior
- Visible keyboard focus and reduced-motion handling

The Button establishes shared control height, radius, icon rhythm, type weight, focus treatment, action hierarchy, and safe default form behavior.

## Component 02 — FilScreen shell

Source references: Home / Discover, Search, Movies, Series, Anime, Profile, Settings, and About.

Included behavior:

- Collapsible sidebar with desktop destinations and account actions
- Catalog tabs with active route state
- Supplied Consumit mark and wordmark
- Search overlay with Cmd/Ctrl+K and `/` shortcuts, theme switch, and session-aware Sign in / Log out
- Active-route presentation with `aria-current`
- Device-persisted dark/light theme with SSR-safe first paint
- Sign-out with retry-safe error language when the account service is unreachable
- Optional sr-only `pageHeading` for pages that need a document h1
- Footer within the flexible content column, beside the sticky expanded or collapsed desktop sidebar; brand and About / Help center / Catalog credits navigation sit above muted copyright and TMDB / AniList metadata attribution, with stacked mobile rows, inherited dark/light themes, visible keyboard focus, and reduced-motion behavior

This shell is used by discovery, catalog, profiles, library, lists, settings, and About. Reduced authentication, onboarding, report, and Watch headers stay focused on their task.

## Component 03 — Form foundation

### 03.1 Label + Input

Source references: Create Account, Sign In, Settings, and Report Issue.

Included behavior:

- Persistent uppercase label with caller-owned native association
- 38px text field with the shared field surface and control radius
- Empty, populated, hover, focus, invalid, read-only, and disabled styling
- Native input attributes, autocomplete, validation, and accessible descriptions remain caller-owned
- Autofill, caret, keyboard focus, and reduced-motion treatment match the Consumit palette

Search adornments, password reveal, textarea, shared helper/error text, and checkbox behavior follow the same accessible field contract in their active product screens.

## Component 04 — Selection

Source references: Search / Explore, List Detail, Settings, and Report Issue.

Included behavior:

- Route tabs with a signal-orange active state and native link semantics
- Themed dropdown Select: custom listbox popup (the native select popup is OS chrome and cannot be styled) with trigger, rotating chevron, selected check, full keyboard support, outside dismissal, disabled state, and hidden form-input posting
- Compact pressed-state filter chips with optional semantic signal dots
- Native-radio segmented controls with keyboard selection
- Controlled switch semantics for on/off settings, including disabled state
- Visible focus, touch-safe sizing, reduced motion, and horizontal tab overflow

## Component 05 — Identity

Source references: FilScreen shell, Favorites shelf, Settings, Public Profile, and onboarding.

Included behavior:

- Supplied-image or initials-fallback avatars at four scales
- Member-chosen generated portraits (Notionists addresses with random seeds, http(s) only) with initials-tile fallback; member-chosen geometric tile treatments (dusk, dawn, noir, halo) frame the fallback, defaulting to dusk
- Online, away, and offline presence with explicit standalone labeling
- Service marks with supplied assets, status, and fallback initials

## Component 06 — Signals

Source references: Home, Search / Explore, Profile, List Detail, Settings, and playback support.

Included behavior:

- Compact semantic badges and labeled status dots
- Clamped, accessible progress rails in the reserved signal colors
- Fractional rating display with a spoken numeric value rather than color-only meaning

## Component 07 — Media

Source references: Home, Search / Explore, Public Profile, and title detail.

Included behavior:

- Portrait, landscape, square, and wide artwork frames
- A code-native geometric missing-art state that preserves the cinematic composition
- Lazy image loading and reduced-motion artwork response

## Component 08 — Content cards

Source references: Home, Search / Explore, Profile Watchlist, and Public Profile.

Included behavior:

- Watch-forward cards with overlaid title, optional year/rating meta, and bookmark slot
- Curated-list cards with supplied artwork collage, curator identity, and save count

## Component 09 — Editorial

Source references: Home, Search / Explore, and List Detail.

Included behavior:

- Editorial section headings with restrained description and optional action

## Component 10 — Profile

Source references: Profile Owner and Public Profile.

Included behavior:

- Responsive diary rows that keep date, artwork, rating, note, destination, and action distinct
- Exact episode labels and watch destinations for episodic diary entries

## Component 11 — Title and series

Source references: Title Detail and Series Detail.

Included behavior:

- Cast cards with supplied portrait support and a restrained geometric identity fallback
- Shared dropdown season selection with caller-owned state

## Component 12 — Personal archives and lists

Source references: Profile Watchlist, Profile History, and List Detail.

Included behavior:

- Saved-title cards with explicit save state, optional progress, signal, badge, and destination
- Profile Watch History reuses the chronological row with exact movie/episode identity, Watch again and deliberate Log to diary actions, private pagination, and retry feedback; member-authored Diary remains a separate section
- Ordered title rows with stable rank, artwork, metadata, curator quote, match evidence, and action
- List cards show real ordered-title collage art, owner and item count
- List authoring supports catalog search across movies, series, and anime, add/remove, move up/down, per-title notes and one atomic save
- Private-list creation and editing are retry-safe; the Lists shelf contains the owner’s collections
- Empty, unavailable, duplicate-title, 500-title limit, save-failure, and owner-only delete states have clear feedback

## Component 13 — Authentication

Source references: Create Account and Sign In.

Included behavior:

- Responsive auth shell that removes the visual story panel below desktop while preserving the task form
- Reduced-shell content prompts and caller-owned panel sizing for sign-in and account creation
- Caller-owned artwork and overlay treatment, with the dark overlay retained as the safe default
- Persistent auth fields with helper or error association and caller-owned native attributes
- Optional trailing field actions for accessible password visibility controls
- Email/password fields, verification, and recovery actions without OAuth/provider controls

## Component 14 — Onboarding

Source references: Onboarding History and Favorites.

Included behavior:

- Reduced onboarding header with clamped step progress and optional skip destination
- Native-checkbox selectable title cards with supplied artwork and visible keyboard state

## Component 15 — Settings and support

Source references: Settings, Help Center, and Report Issue.

Included behavior:

- Settings rail with member context and semantic current-page navigation
- Settings sections and preference rows that accept the appropriate control rather than assuming every setting is a toggle
- Help answers use native disclosure controls, factual service behavior, and routes to the matching member task
- Issue reports collect only a category, title, description, and optional reply address; a configured support inbox opens as an editable email draft, while missing configuration has an honest unavailable state

## Component 16 — Playback shell

Source references: Player Screen and playback architecture.

Included behavior:

- Reduced watch header with explicit back and exit destinations
- First-party Consumit Player with a semantic video surface, poster and unavailable fallbacks, and accessible playback controls
- Consumit-rendered bottom captions overlay the space above the time/chapter row while controls are visible. The time, seek rail and transport keep their positions across cue gaps, line-count changes and subtitle toggles. Top-position captions and hidden-control bottom captions retain their overlays. Small non-fullscreen stages keep the same minimum height with subtitles on or off.
- Subtitle groups and local/discovered/search track rows display canonical native language names in direction-isolated, untracked text. Provider, release and accessibility details remain secondary; original labels are retained in tooltips. The volume slider is collapsed until its speaker group is hovered or receives keyboard focus; touch can reveal it through tapping/focus. Mute, volume changes, source selection and progress remain independent.
- Watch supplies cached first-party poster URLs while the video retains anonymous media CORS. Seeking events reach Watch immediately so pending positions survive source recovery.
- Desktop controls share a restrained ivory/orange treatment across both media cores, with larger transport targets in wide players. Route-owned previous/next episode arrows appear in the header only in browser fullscreen; outside fullscreen, the episode bar supplies matching icon-only links with accessible names, tooltips, and 44px targets. The bar wraps when needed, keeping both arrows together and visible in bounded desktop players. The existing menus, keyboard controls, and recovery actions remain first-party.
- `ConsumitPlayer` receives Watch's pending resolution through `preparing` and optional `preparationMeta`; it owns the preparation-to-playing presentation from media state. An artwork-led desktop screen distinguishes pending resolution from initial autoplay buffering, retaining Back and honest indeterminate stage marks. Paused preload and autoplay gesture recovery keep controls available. After a first playing event for the attached media URL, later buffering uses the compact indicator. Media callbacks still reach Watch, and UI presentation never initiates provider work.
- Preparation reuses Watch's catalog artwork supplied through `pauseLogoUrl`. Logos keep their intrinsic proportions and bounded desktop dimensions, with accessible title text and separate episode metadata. Missing or failed artwork shows the text title, including images that failed before hydration; a different logo URL can load after an earlier failure.
- UI scope only: provider ranking, entitlement, health probing, source switching, streaming adapters, and playback business rules remain application logic

## Component 17 — Global finish

Source references: all active screens.

Included behavior:

- Empty composition with a direct activation path
- Reduced-motion loading composition with a live status label
- Alerting error composition that explains impact, recovery, and optional diagnostic detail

## Personal-space compositions

The standalone Library, Watchlist, and Lists landing screens are retired. Their old URLs redirect to the authenticated owner's profile History, Watchlist, and Lists sections, respectively, so existing bookmarks keep a destination. Individual list detail and editing routes remain `/lists/{slug}`.

`apps/web/src/app/profile/public-profile-screen.tsx` composes the shared FilScreen shell, a cinematic identity hero, compact factual member stats, owner editing actions, route-based archive tabs, and a journal-style two-column overview. The main column shows four ordered universal title cards, a four-card Recent Activity strip captioned with stored watch / rewatch / review actions and dates, recent review excerpts. Activity keeps exact episode identity when present and never exposes per-title ratings; the supporting rail shows real Diary entries, recent lists, a count-only rating histogram, metadata-derived taste notes, and the owner's private Watchlist preview using the same title card. Only the owner can select populated rating bars to open a paginated rating-filtered Watched archive; profiles remain owner-only. Diary, Reviews, and Lists remain concise previews rather than repeated full archives. The Watchlist preview comes from the private Library snapshot and opens `/profile/{username}/watchlist`; saved records never reach visitor profiles. Every View all and supported member stat opens its archive destination.

`apps/web/src/app/profile/profile-archive-screen.tsx` renders the paginated profile archive family. Watched, Diary, Reviews, Lists, Likes, Tags, and Activity each use their matching stored records. Watched and Watchlist share the compact `TitleCollectionFilters` menus for decade, genre, rating, and sorting; personal rating filters are owner-only. Rating lookup is authenticated, bounded to 50 references, and no-store; visitors never receive individual scores. Genre, decade, search, and sort apply to loaded pages, while pagination reaches older records. The route loads profile/archive pages from `/v1/profiles/:username/archives/:collection`; the API validates cursors, enforces authenticated owner access, and has no saved-title archive. Diary keeps episode identity and owner actions, list rows keep their cover collages and privacy labels, tag counts come from stored diary/review tags, and title artwork is an optional enrichment rather than a prerequisite to show a record. `/profile/profile-watchlist-screen.tsx` keeps the authenticated owner's private saved-title search, filters, sorting, and pagination inside the same identity header and section tabs used by profile archives. The owner's full list-management surface lives in `/profile/{username}/lists`. Profile and library visual rules live in DESIGN.md; decorative shelf boards do not become generic card primitives.

`apps/web/src/app/profile/watchlist-collection.tsx` is the private saved-title collection inside the profile Watchlist archive. It retains server ordering for recent saves, supports title search, movie/series/anime, genre, decade, and personal-rating filters, release-year/title sorting, and poster or horizontal Shelf views. Posters use the Home `TitleCard` without a footer or Save action: title, metadata, and optional catalog rating reveal over the artwork on hover or focus. Shelf rows retain visible captions, private personal ratings, and removal through the shared Save action. The collection pages saved titles with retry feedback. Catalog lookup failure leaves title references and their routes available; rating lookup failure disables rating choices that need the missing data. Service filters wait until the catalog models availability. `profile-history-screen.tsx` pages private completed watches separately from Diary and preserves Watch again and Log to diary actions.

`apps/web/src/app/profile/profile-archive-shell.tsx` composes the compact shared identity header and route tabs for every archive. `profile-lists-screen.tsx` adds `apps/web/src/app/lists/lists-collection.tsx` for the owner's private collections and inline creation rail. Editorial list cards pair overlapping five-poster artwork with title, curator, count, description, and privacy. Local name search and sort controls, and paginated loading stay attached to real records. Visitor access is rejected. Create and edit actions continue through the existing list flows.

`TitleCollectionFilters` uses the shared `Select` toolbar variant for text triggers and themed listboxes. The field variant remains the default for forms and season selection. Applied choices display their actual values, Reset delegates to the collection to clear its complete filter state, and unavailable personal-rating options remain disabled. Genre and decade choices derive from loaded catalog details; missing years do not receive a fabricated decade. The Watchlist toolbar also owns compact kind buttons and native poster/Shelf buttons with pressed state.

Watched renders the Home `TitleCard` without a footer and with an explicit null rating, keeping only title and metadata inside the hover/focus overlay. Personal-rating filters remain available to the owner. Likes retains its captions. Visitors receive no private per-title rating in either archive.

`shared/rating-filter.tsx` owns the themed star-range popover used by Watched, Watchlist, and Diary. Pointer clicks choose exact half-star ratings; dragging selects inclusive bounds. Keyboard users edit two native range controls and apply them. Escape cancels a draft, dismissal restores focus after selection, and unavailable scores cannot be selected. The pure `rating-filter-value.ts` parser translates valid 1–10 exact/range values consistently on the server and client. Watched range URLs load watched-title pages and filter their private enrichment, with an honest loaded-result count and preserved pagination; existing exact-score URLs retain their dedicated rating archive.

Anime details place a single Related anime section after Episodes, using shared `TitleCard` posters with relationship and format labels. Canonical self-links and duplicates are omitted. Earlier seasons, sequels, and connected films keep their AniList destinations; failed relation reads show recovery copy. The Staff section and tab are removed, while characters, reviews, synopsis, airing, and recommendations remain.

`profile/diary-collection.tsx` composes the Diary archive as chronological month groups with portrait `ArtworkFrame` covers, watch days, exact episode links, tags, release years, and rewatch markers. Its toolbar reuses `Select` for watched year, release decade, genre, owner-only current rating, watch type, and sorting, with complete Reset and honest loaded-entry counts. `RatingDisplay` shows current title ratings privately, never a historical score attached to a particular watch. `DiaryEntryActions` has a compact mode with labeled icon buttons, a full-row editor and delete confirmation, focus restoration, retry errors, and success callbacks that update the archive before server refresh. Shared overview `DiaryRow` previews retain their existing layout.

Friends Activity, Network, follower/following previews, shared-list discovery, and follow actions are retired and have no active navigation or screen composition.
