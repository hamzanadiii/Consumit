# Shared component roadmap

Unified player deck authority (2026-10-18; locally verified): the approved [direction contract](./audits/unified-player-deck-direction-2026-10-18.md) supersedes older conflicting player composition in this registry. Desktop transport sits left and labeled Sources/Captions/Episodes/Settings sit right; phones retain stable transport and destination rows. All destinations share the same right drawer or phone sheet. This is a presentation change: player props, callbacks, media engines, source validation, Admin order, progress/history, preferences and provider behavior retain their ownership. Browsing retains its existing system. [The local audit](./audits/unified-player-deck-2026-10-18.md) records local acceptance and the scoped finish review.

Player sizing refinement (2026-10-18): the shared header uses the 56px token with 44px Close/Back targets; caption tools occupy 53px including their border. Right drawers use height-aware clearance in short desktop windows, preserving typography and useful language rows. Captions puts available languages before nonblocking availability guidance and provider rediscovery. Preparation status follows the lower picture edge; portrait masking and the blank reserved deck follow measured control height. Visibly labeled destinations keep their accessible names without redundant native title tooltips. See [sizing evidence](./audits/player-sizing-2026-10-18.md).

This roadmap records Consumit’s buildable component families, implementation order, and boundaries. [`DESIGN.md`](../DESIGN.md) is the durable visual authority, and shipped shared components are the executable reference.

Optional separate audio (ADR 0004) joins the shared Audio drawer's single alphabetized language list. Canonical language codes merge duplicate stream and separate tracks, remove upstream numbering and hide provider provenance from members. The current stream's rendition is preferred when it supplies that language; failed stream activation can try the same language's separate candidates in order. Known regional, commentary and audio-description variants stay distinct. Track identities remain internal so selected, preparing, failed and restored states map to the single row even when deduplicated. Playing HLS switches use the installed hls.js `nextAudioTrack` buffered API; paused switches use the immediate `audioTrack` setter. Stream selection commits only after activation succeeds; separate selection keeps the prior sound until a validated recording is ready, and saves the language only after successful activation (or successful Enable audio). Failed candidates retain current audio and show local feedback. Audio sync appears only for active separate audio. The shared player owns the independent audio element; Watch supplies validated direct or independently approved relay candidates and preparation. Title/episode or provider replacement cancels separate audio; the same-provider continuity key retains it across rendition changes and healthy lease replacement. Existing keyboard dismissal, focus return, stage containment, volume/mute and boost controls retain their behavior.

## Rules

Account help and recovery links occupy their own wrapping layout space with explicit 44px targets, independent of the 14px interface root. Username checks discard stale responses. Verification and resend actions exclude one another and show bounded loading/error states while retaining entered details. Route failures use shared ErrorState, a framework retry action, Home navigation, and a safe reference; root-layout failures render a standalone reload surface without shell/session dependencies.

Native player chrome stays visible while a keyboard-focused control is operated, including playback start and pointer movement. Mouse-only focus does not prevent the normal fade; leaving keyboard focus restores automatic hiding. The browser's `:focus-visible` state distinguishes the two.

Watch's initial unavailable state retains Try again and Return to title and adds a shared Choose another server action. It opens a labeled native Server select with Auto, disabled unavailable choices, loading, retry and empty states. Selection remains busy until resolution ends, survives a failed startup retry, and retains the canonical title/episode and native checkpoint. No session is required to request the configured provider snapshot.

`shared/ProviderFrame` remains the Watch/Admin surface for validated embeds under ADR 0006. Its compact Back/title/mark header, charcoal deck and Sources/Episodes destinations share the native player presentation. The external frame keeps a brand-forward compact header, explicit connection state, quiet capability-limit chips and a grouped responsive action row. It consumes exported `PlayerPanel` from `@consumit/ui`; wrapper panels restore their opening trigger focus and retain fixed headers and scrollable bodies. Reload, Try another server, explicit new-tab access and honest loading/slow/failure states remain available. The iframe keeps its own controls, permissions, referrer policy and plain-frame behavior without a sandbox attribute. Consumit does not synthesize progress, decoded playback, completion, quality, Cast, subtitles or auto-next from document loading. Requested anime audio guidance still points inside the frame. The wrapper explicitly explains unsupported progress sync and automatic next episode; provider popup/navigation behavior remains provider/browser owned.

`shared/AdSlot` is no longer mounted by active product screens (2026-10-15). Home, Movies/Series/Anime catalogs, all title details, Watch and the owner's Profile overview omit display banners, their imports, wrappers and reserved layout space. Wide detail layouts omit the former 300px ad column. The unused component implementation remains available in source; it is not an active surface. Profile backdrop artwork and community cards remain product content.

`shared/AdStatus` lives in Settings → Browsing & advertising, reusing `PreferenceRow` and `Toggle` with a visible On / Off / Loading value. FilScreen navigation contains only the Settings destination. Anonymous Settings renders `GuestSettingsScreen` so opting out never requires an account; authenticated Settings retains its existing profile/privacy/playback sections and adds the same advertising control. On is the default. `useAdStatus` fails closed until device and experience preferences load and whenever account preferences cannot load. Same-document and storage events apply Off across tabs immediately; if a browse document already loaded the pop-under script, it reloads to clear its handlers. Failed account sync retains the device choice and Retry sync. Watch never reloads for this choice. `shared/PopunderAd` loads the owner-supplied publisher script on public browse routes, with at most four injections per rolling 30-minute window and at least five minutes between injections per device; Web Locks serialize claims across tabs when available. Settings, Admin, authentication, onboarding and Watch are excluded. The separate display `AdSlot` remains unmounted, so display banners and reserved space stay absent. Ad status controls Consumit browsing ads only and does not exclude provider frames or reject playback attempts; external providers control their own advertising. `adsEnabled` also rides along on playback preference requests.

Desktop and tablet Admin composes Dashboard, Providers, Test Lab, Diagnostics and Access in the FilScreen shell. Internal navigation preserves provider drafts and test evidence after visiting a section; inactive benches abort runs and unmount preview media. Dashboard uses partial service snapshots, compact per-kind selection, a filtered fleet table, attention/service summaries and recent changes. Provider rows and dashboard health rows open Test Lab with the selected provider and title kind preselected. Test Lab uses a target panel with sample-title shortcuts, exact catalog search, and exact episode inputs, followed by compact evidence counts and filterable provider result cards. Configured testing and reviewed Scout candidates share ProviderBench: it can select all compatible providers currently shown or any individual subset, runs them sequentially with per-provider progress and stop controls, supports local browser checks, and exports partial results. Shared buttons, inputs, selections, status dots, loading/empty states and Consumit Player controls retain the current visual authority. Source resolution and browser evidence remain separately labeled, and diagnostic exports use an explicit safe projection.

`ProviderComparisons` keeps native measurements, resolver outcomes, and provider-reported events as separate evidence classes. Startup and stall p50/p95 values come from precomputed histogram samples; the UI never averages percentiles. Region rows stay separate, resolver rows appear only when browser and delivery filters are both unfiltered, and manual debugger/scout runs remain outside production playback comparisons. Provider-reported iframe events are message counts, not decoded playback, unique viewers, or member history.

`ProvidersTab` adds a Video delivery column using the existing native form-select styling: Direct / Proxy, staged alongside role and limits. An unapproved Proxy draft says Awaiting Worker approval; this assignment does not register hosts. Audio-only rows disable the video selector and report whether added audio is browser-direct or uses an independently approved audio-only Worker capability. The wider desktop table scrolls within its container. Provider order and health rows display the saved Direct/Proxy mode instead of a hardcoded Direct label. Draft row changes say Save to apply; the order list reflects saved settings. Configured diagnostic previews identify Direct or Proxy and exported evidence retains that path without signed source URLs.

- Finish one component and its meaningful states before starting the next.
- Add only variants already demanded by an active design or the immediately selected screen.
- Preserve Cinema After Midnight: near-black surfaces, warm editorial type, signal-orange actions, scarce lilac and lime signals, and compact corners.
- Use Lucide for interface icons. Use Radix primitives when keyboard behavior, focus management, or ARIA semantics are complex. Do not import a generic shadcn theme; individual patterns may be adapted into Consumit-owned code when useful.
- Every component ships through `@consumit/ui` with its public types, a catalog example, behavioral tests where interaction exists, and responsive/focus verification.

## Cross-screen contracts

`ConsumitPlayer` composes `PlayerPanel`, `PlayerSettingRow` and `PlayerAdjustment`. `PlayerPanel` is an exported presentation primitive reused by the external wrapper; existing ConsumitPlayer props and callbacks remain intact. It supplies a shared fixed header, trigger-anchored compact placement, focus containment, nested Back, Close/Escape and an independently scrolling body; callers retain destination state and focus return. Sources, Captions, Episodes and Settings use the same 8px-above-trigger card on desktop and phones. Cards clamp to 12px viewport margins and to available space above the trigger, capped at `min(62dvh, 520px)`. Clicking an active destination toggles its card closed, including from a nested view. Captions owns track choice, appearance, sync and upload; Settings groups quality/audio and playback adjustments, viewing options, and route-owned Watch preferences. The current `player-server-menu.tsx`, `player-subtitle-menu.tsx`, media event hooks, skip-segment hooks and local preference storage retain their boundaries. Sliders retain speed, brightness and 1–3× gain; unsupported activation retains normal audio. Panels preserve the attached video DOM identity and never initiate provider work.

Watch exposes source selection through the Sources deck destination, rather than a duplicate Settings link or outside server strip. `PlayerServerMenu` opens on All, showing Consumit Server and External players in separate groups above one scrolling roster; category tabs filter that same roster. Search and favorites follow the visible choices without changing automatic order. Direct/Relay choices remain grouped and external choices retain readable names and limitations. Manual choices keep the canonical title/episode, position and play intent; busy switches disable selection and failure retains media or explains fallback. Auto follows eligible Admin order across delivery modes, ignores legacy personal orders and retains current media when reselected. The current provider remains available when discovery fails or omits it. Quality and Anime SUB/DUB remain independent; there are no member provider-reorder controls.

`WatchPlayback` uses the owned attempt/continue/cancel flow for automatic startup and fallback. Checked X of Y servers reports real attempt progress; Cancel search aborts the active attempt and retains current playback or offers server selection when no session exists. Exhaustion says every compatible server was tried, with retry and server choice. The strip, notices and existing unavailable panel retain recovery context without moving provider work into shared UI. Enabled next-episode autoplay, off by default, shows a ten-second countdown with Play now and Cancel after completion when an exact next destination exists; external frames never start it.

These patterns recur across the complete active screen set and should be preserved as components are added:

Subtitle appearance uses its own `PlayerPanel`, entered through the persistent Appearance tool in Captions. It defaults to Large, Subtle, Bottom, Classic and ivory text. Size, style, position, three script-aware font families (Classic/Charter, DejaVu Sans, and Inter), and four saved text-color choices keep their stored/controlled behavior while leaving the track list free of appearance controls. All fonts use a bold default and Arabic-capable fallback stacks; the live caption and appearance preview share the chosen family, weight, and color. Back returns to Captions without another discovery request; Close restores the opening toolbar control's focus.

`player-subtitle-menu.tsx` owns the Captions browser behind title-scoped model/actions; `ConsumitPlayer` retains lifecycle and subtitle operations. Off, search and language groups scroll independently of the fixed header and Appearance / Sync / Upload footer within the shared 380px desktop drawer or phone sheet. Discovery retains successful partial results, per-language pagination/retry and local track selection. Open languages refresh after discovery; search matches local labels, native names and codes while preserving regional distinctions and text direction. Quiet limitation text omits credentials. Preparing another file retains usable current cues until replacement succeeds. Load failure offers retry or another track while video continues. Files, deliberate selection/Off and sync stay title-scoped across recovery, and generation guards reject stale discovery/preparation results.

- **Global shell:** a desktop icon rail and a phone modal navigation sheet carry Home, Watchlist, Likes, Watched, History, and Lists for members and guests, plus theme, Settings, and account actions. Member shortcuts open profile archives and highlight exact or nested matching routes; Watched and History remain owner-only while other visitor sections follow their visibility controls. Guest shortcuts pass their intended destination through the sign-in screen, which also offers account creation. Collapsed links keep accessible names and tooltips. Universal search replaces a separate Categories destination. The catalog row carries New / Series / Movies / Anime and the member avatar or neutral Guest avatar beside Search; guests open a guest profile carrying the shared guest character with a sign-in path to the full experience. Authentication, onboarding, reporting, and Watch retain purpose-specific reduced headers.
- **Page structure:** artwork-led hero and rails organize Home discovery; other routes use the composition that fits their member task. Mobile uses deliberate stacked layouts.
- **Action hierarchy:** signal orange marks committed actions and active routes; warm ivory supports confident primary and secondary actions; outlines hold reversible options; muted text handles low-emphasis destinations.
- **Semantic signals:** signal orange marks selection, decisions, ratings, and active progress; lilac is reserved for social/taste context; lime is reserved for presence, health, and success.
- **Geometry:** preserve the original 5px controls, 6px cards, and 3px micro corners across Consumit. Circular shapes identify avatars and established icon affordances.
- **Assets:** reuse the supplied lockup, mark, cinematic backdrop, poster motifs, member avatar treatment, and neutral service identifiers. Do not recreate those assets with generic iconography.
- **Depth:** interface surfaces are flat and separated by tone or border. Shadows belong to artwork separation, not routine controls or panels.

`TitleCard` is the app-level universal portrait card, backed by the shared UI `WatchCard`. It preserves the original Home card: the title and year/type appear over the poster on hover or keyboard focus, with an optional rating, orange frame, and screen-specific Save action. The same card is reused by Home and Anime rails, catalog and search grids, Watchlist, profile Favorites, Recent Activity, and Watched/Likes archives. Save controls remain available on touch. Featured landscape cards, Continue watching, diary/activity rows, and empty Favorite frames keep their purpose-specific layouts. Home composes the shared FilScreen shell, rotating cinematic hero, Continue watching, and trending and curated title rails. Continue watching owns its section wrapper and spacing, rendering only after at least one stored in-progress title resolves; loading, empty and failed loads render nothing without deleting stored progress.

`PosterStack` is the shared collection-preview composition used by the profile Watchlist, recent lists, list collages, and `CuratedListCard`. It renders at most five overlapping portrait covers with fixed layout geometry, supplied destinations and accessible names, a missing-art fallback, and independent keyboard focus for linked covers. `SectionHeading` owns the ruled editorial header and its compact sidebar variant; its `id` identifies the actual heading so section names exclude actions and descriptions. An optional heading icon (for example the Trending flame) sits beside the title text, never in the action row with navigation links. Shared poster edges, metadata contrast, and quiet navigation feedback carry the same finish across discovery, profiles, settings, support, and Admin.

`ContinueRail` keeps landscape cards at a consistent size and brightness while scrolling. Its local CSS module owns restrained shadows, a 3px hover/focus lift, artwork-only zoom, and a short reveal for Save/details actions. Text, time, and progress stay fixed; progress has no looping shimmer. Touch actions stay visible and reduced motion removes card/image movement. `lib/continue-watching.ts` merges only current-owner device and private account progress, includes anime, and resolves an aired next episode after completion only with catalog confirmation. Edit hides a title from the shelf without deleting progress or history; member hides sync privately, with an inline error if sync fails. Guest hides remain device-only. Later progress can restore the title. Account changes suppress old rows; failed account reads retain owned device records. The entire section stays hidden until a destination resolves.

`home/BecauseYouWatchedRail` reuses `TitleRail` and `TitleCard` for signed-in members. `lib/recommendations.ts` merges actual private Watch History with owned completed device progress, resolves up to twenty recent unique movie, series and anime seeds, and fetches catalog recommendations from the eight freshest resolved seeds. Weighted reciprocal-rank fusion rewards recent watches and cross-seed agreement; genre affinity and a restrained format/genre diversity pass improve ordering without presenting a Taste Match score. Known watched titles, duplicates and account-synced Not interested choices are excluded. Each card offers an accessible poster-corner Not interested action; Undo and Reset hidden appear only after a dismissal. The heading, short provenance line and one poster row replace the prior seed/type/sort controls. Account identity gates results and writes. Loading, empty and retry states stay within the section; no watched evidence hides it.

## Application composition boundary

`shared/google-analytics` mounts once in the root and owns a non-modal, bottom-edge analytics prompt using the existing `Button`, surface, typography and focus tokens. It appears only on allowed public surfaces while no choice exists and the prompt is enabled (`NEXT_PUBLIC_GA_PROMPT` is not `off`); its compact desktop row stacks on phones and accounts for the bottom safe area. With the prompt hidden, an unset device choice collects as accepted. `AnalyticsPreferences` appears in Privacy Policy section 7 to allow or decline later, with an announced current state. Consent gates grouped public page views, title-open events, successful playback start/30-second events and verified email sign-ups; Watch and sign-up omit page views. Event payloads carry only bounded content type, player type or method values, and group page context to `/watch` or `/sign-up`. Google loading and failures never block product controls. The privacy projection and device choice store stay in `lib/google-analytics`.

`shared/EpisodeCard` owns the shared Anime-derived episode presentation for Series and Anime. Callers provide exact Watch destinations, episode metadata and availability. It uses clean landscape artwork, compact corners, bold titles, a solid orange Play episode action and a noninteractive Upcoming state. When an episode still fails to load, it tries the supplied title artwork; if both images fail it renders the shared labeled MissingArtwork treatment instead of a broken image. Series season selection/paging and Anime metadata batches/airing rules stay in their respective sections.

Movies, Series and Anime featured landscape rails use the documented Continue watching shadow values for rest, hover and keyboard focus. Insets within their horizontal scroll area preserve the soft shadow fade and focus frame without changing card destinations or poster-grid styling.

`apps/web/src/app/catalog/title-play-action.tsx` owns the shared title-detail playback action used by movie, series, and anime heroes. It keeps the existing orange link styling and computes Play, Continue watching, or Watch again with `titlePlayDestination`. `readTitleProgress` selects the newest validated guest- or member-scoped device record and, for members, authenticated private account progress; failed account reads retain local progress. Partial watches open the saved exact episode. Completed episodic watches advance only through known episode/season metadata; completed movies, known final episodes, and unknown next-episode metadata replay the saved destination. Progress remains independent of providers. Session identity gates saved results, and storage, focus, and progress events refresh the action.

Provider management keeps its shared table, controls, and state feedback. Each row adds a native, labeled role select so its options escape the scrolling table. Save/Discard/Reset use the existing staged mutation flow; audio-only rows leave the video order editor after Save. Enabled embed rows in Playback attempt order also expose a direct Disable action that applies the existing Admin enabled override and removes the embed from Watch choices/order; it remains available in the provider table to re-enable. Capability text distinguishes separate audio verification, untested audio health, and declared languages.

The player controller snapshot separates selected quality from retained resolution preference. Source changes remap rendition identifiers, explain a known downgrade inside the Quality panel, and retain the requested resolution. The player header does not show a quality fallback notice. Audio matches canonical language (including ISO aliases) across different track indices. Preferences pass through a shared callback to Watch/embed recovery without changing watch history or the player design.

`FilScreenHeroRotator` owns Home's featured selection and progress clock. Desktop styling remains local to `hero-rotator.module.css` at 1024px and above and preserves the shared shell, fonts, controls, and title destinations. The hero has no Pause / Resume control. Mouse hover over links or buttons, keyboard focus, offscreen content, hidden tabs, and reduced motion stop the animation-frame loop; resuming retains its elapsed progress. Touch and retained mouse focus do not latch a pause. Shrinking the candidate set keeps the active index within the remaining slides. Single-slide and reduced-motion presentations never auto-advance. Inactive slides remain inert and hidden from assistive technology, with secondary artwork lazily loaded.

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
- Footer within the flexible content column, beside the sticky expanded or collapsed desktop sidebar; brand and About / Help center / Terms / Privacy / DMCA / Catalog credits navigation sit above muted copyright and TMDB / AniList metadata attribution, with stacked mobile rows, inherited dark/light themes, visible keyboard focus, and reduced-motion behavior

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
- App-wide themed dropdown Select: use the shared custom listbox for every web dropdown; it replaces the OS-rendered native popup with a token-aware trigger, rotating chevron, grouped options, selected check, full keyboard support, outside dismissal, disabled state, and hidden form-input posting
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
- Public-by-default list creation and private/public editing are retry-safe; title-page add-to-list appends without changing order or notes on existing rows
- The Lists archive pairs Your Lists with private Saved Lists; saved bookmarks follow the original list and become removable unavailable references after privacy changes or deletion
- Public list detail groups a real cover collage, curator, title count, and description above ordered title rows, with clear Share and Save actions and no collaborative editing
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

Source references: the shipped Welcome Guide Viewing Preferences, Favorites and Ready screens.

Included behavior:

- Reduced onboarding header with clamped step progress and optional skip destination
- Native-checkbox selectable title cards with supplied artwork and visible keyboard state
- App-owned guide routes compose those shared primitives, the shared preference editor and community links; no new shared visual theme is introduced

## Component 15 — Settings and support

Source references: Settings, Help Center, and Report Issue.

Included behavior:

- Settings rail with member context and semantic current-section navigation; the screen tracks the section at the reading line during scroll, resize, and anchor changes, including the final section at page end. Account links to `#account` on the same page.
- Settings sections and preference rows that accept the appropriate control rather than assuming every setting is a toggle
- Profile visibility uses eight independent section controls; anonymous viewing trends use a separate off-by-default Toggle with copy that distinguishes it from profile visibility
- The shared `experience/PreferenceEditor` owns Viewing Preferences in Streaming & playback and the guide. Subtitle priority uses an ordered list of up to three numbered rows, direction-isolated native names, shared ghost Buttons for Move up and Remove with language-specific accessible names and explicit 44px targets, and the shared Select to add an unselected language. The first row cannot move up; Add becomes a quiet limit message at three choices. Empty guidance stays beside Add. Add/remove/reorder edit a draft, committed with Save viewing preferences or Save and continue; Language & subtitles links to this editor. Removing a row focuses a remaining Remove control, or Add when empty. Adding the third language focuses its Remove control; promoting a language keeps focus on that row's Remove control.
- Help answers use native disclosure controls, factual service behavior, and routes to the matching member task
- Issue reports collect a category, title, description and optional reply address. Playback reports can explicitly include a previewed diagnostic projection from the current session's recent failure: exact title/episode, provider, browser, delivery path and failure category. The checkbox starts off; no cookies, credentials, media URLs, Watch History or page activity are attached. A configured support inbox opens an editable email draft for the member to review and send; missing configuration has an honest unavailable state.

## Component 16 — Playback shell

Source references: Player Screen and playback architecture.

Included behavior:

- One compact Back/title/episode header inside the player boundary; phone inline context remains above the picture.
- First-party Consumit Player with a semantic video surface, poster and unavailable fallbacks, and accessible playback controls
- Its Sources panel defaults to All with separate Consumit Server and External players groups in one scrollable roster. Category tabs and search filter that same list; native rows describe Consumit controls and direct/relay delivery, while external rows state their own-control and progress-sync/auto-next limits. The YumeZone anime frame is labeled AniPM in Watch.
- Fullscreen prefers the complete player's container API. Apple's video-only API enters true native fullscreen with `native-fullscreen-captions.ts` presenting the selected external file as a default showing TextTrack. Parsed cues carry the existing sync offset; asynchronous file loading and track reconciliation reapply it, and both controllers retain showing mode during native fullscreen. Only one selected file shows; Off disables captions. Native-mode CSS permits browser cues and hides the duplicate DOM overlay. Exit restores hidden external tracks and Consumit's overlay. Native controls and caption appearance belong to iOS; stored inline appearance is retained. Native denial keeps playback inline and offers retry. Browsers with neither API retain the viewport fallback, which locks background scrolling and restores prior styles, scroll, focus and inert state on exit/Escape/unmount.
- Consumit-rendered bottom captions overlay the space above the time/chapter row while controls are visible. The time, seek rail and transport keep their positions across cue gaps, line-count changes and subtitle toggles. Top-position captions and hidden-control bottom captions retain their overlays. Small non-fullscreen stages keep the same minimum height with subtitles on or off.
- Subtitle groups and local/discovered/search track rows display canonical native language names in direction-isolated, untracked text. Provider, release and accessibility details remain secondary; original labels are retained in tooltips. On desktop the volume slider stays collapsed until its speaker group is hovered or receives keyboard focus. Phones omit the volume action in both orientations and use system volume controls. Volume changes, source selection and progress remain independent.
- Watch supplies cached first-party poster URLs while the video retains anonymous media CORS. Seeking events reach Watch immediately so pending positions survive source recovery.
- Desktop timing/timeline sit above transport on the left and labeled Sources, Captions, Episodes and Settings on the right, followed by fullscreen. Exact neighboring episode actions remain accessible header icons when available; movies omit Episodes. Destinations use shared PlayerPanel drawers with fixed headers and scrolling bodies. Caption changes and the desktop floating volume overlay retain deck positions. Dismissible progress/recovery toasts preserve device progress.
- At player widths up to 600px, a contained 16:9 inline picture sits above timing/timeline, a stable transport/fullscreen row and a separate labeled destination row. At 320px the episodic deck still retains all four destinations. Actions have at least 44px targets and Play has 48px. Fullscreen and short landscape retain compact safe-area-aware overlays. Touch double-tap seeking and phone caption minimums retain their behavior.
- `watch-surface.tsx` and its CSS module retain shared episode/browser and legacy supporting composition styles. Active Watch is a focused player viewport; it does not mount the former outside details/side-rail/footer layout, so theater mode is already active and its toggle is omitted. Compositions with surrounding details, episode rail or footer may expose the toggle. Movies omit Episodes. The shared episode browser is passed into the player or external wrapper without moving route-owned identity, filtering, paging or preferences into presentation.
- `EpisodeRail` renders compact landscape rows inside the shared Episodes drawer/sheet, with episode badges, titles, orange current selection and disabled upcoming rows. Descriptions, runtime and dates are omitted from player rows. Season controls, filtering, paging and Anime SUB/DUB remain route-owned. Filtering uses the same known/cached title precedence as rows; it does not promise search of unloaded details. Empty matches offer Clear filter and failed enrichment retains title-art fallback. Filter/page controls keep 44px targets and visible focus.
- `ConsumitPlayer` receives Watch's pending resolution through existing `preparing` and optional `preparationMeta` props. It owns the preparation-to-playing presentation from media state. Catalog artwork distinguishes resolution from initial buffering with honest indeterminate stage marks; the compact Back action remains reachable. Paused preload and autoplay gesture recovery keep controls available. Exact previous/next actions remain in the header when available. Later buffering is compact after the first playing event for the attached media URL. Callbacks still reach Watch, and presentation never initiates provider work.
- Preparation reuses Watch's catalog artwork supplied through `pauseLogoUrl`. Logos keep their intrinsic proportions and bounded desktop dimensions, with accessible title text and separate episode metadata. Missing or failed artwork shows the text title, including images that failed before hydration; a different logo URL can load after an earlier failure.
- UI scope only: provider ranking, entitlement, health probing, source switching, streaming adapters, and playback business rules remain application logic

Only the exact configured VidRift movie/series frame may send the bounded immediate-parent reports reviewed in [ADR 0006](./adr/0006-provider-embed-fallback.md). These reports are provider-reported diagnostics only; they do not establish decoded playback or update member progress/history. Vixsrc forwarding and anime frame protocols remain unsupported.

## Component 17 — Global finish

Source references: all active screens.

Included behavior:

- Empty composition with a direct activation path
- Reduced-motion loading composition with a live status label
- Alerting error composition that explains impact, recovery, and optional diagnostic detail

## Personal-space compositions

Member portraits across the shell, profile/archive headers, Settings, search results, member rows and review surfaces use `lib/avatar.ts`'s `memberAvatarSrc` with the public identity object. A chosen `avatarUrl` wins; otherwise the public username supplies one consistent generated portrait. Callers cannot choose a separate member-ID fallback. Guest identity and neutral private-member placeholders retain their existing treatments.

The standalone Library, Watchlist, and Lists landing screens are retired. Their old URLs redirect to the authenticated owner's profile History, Watchlist, and Lists sections, respectively, so existing bookmarks keep a destination. Individual list detail and editing routes remain `/lists/{slug}`.

`apps/web/src/app/profile/public-profile-screen.tsx` composes the shared FilScreen shell, a cinematic identity hero, compact factual member stats, owner editing actions, route-based archive tabs, and a journal-style two-column overview. The main column shows four ordered universal title cards, a four-card Recent Activity strip captioned with stored watch / rewatch / review actions and dates, recent review excerpts. Activity keeps exact episode identity when present and never exposes per-title ratings; the supporting rail shows real Diary entries, recent lists, a count-only rating histogram, metadata-derived taste notes, and the owner's Watchlist preview using the same title card. Only the owner can select populated rating bars to open a paginated rating-filtered Watched archive; this overview is owner-only; visitor profiles use a separate safe projection. Diary, Reviews, and Lists remain concise previews rather than repeated full archives. The owner Watchlist preview comes from the private Library snapshot; visitors can read their own section-gated Watchlist archive. Every View all and supported member stat opens its archive destination.

`apps/web/src/app/profile/profile-archive-screen.tsx` renders the paginated owner archive family. Watched, Diary, Reviews, Lists, Likes, Tags, and Activity each use their matching stored records. Watched and Watchlist share the compact `TitleCollectionFilters` menus for decade, genre, rating, and sorting; personal rating filters are owner-only. Rating lookup is authenticated, bounded to 50 references, and no-store; visitors never receive individual scores. Genre, decade, search, and sort apply to loaded pages, while pagination reaches older records. Owner archive reads are private. Visitor archives use separate no-store reads that enforce section visibility, including direct routes. Diary keeps episode identity and owner actions, list rows keep their cover collages and privacy labels, visitor Tags aggregate visible Review tags only when the Reviews section is public, and title artwork is an optional enrichment rather than a prerequisite to show a record. `/profile/profile-watchlist-screen.tsx` keeps the authenticated owner's saved-title search, filters, sorting, and pagination inside the same identity header and section tabs; visitor access follows the Watchlist section setting. The owner's full list-management surface lives in `/profile/{username}/lists`. Profile and library visual rules live in DESIGN.md; decorative shelf boards do not become generic card primitives.

`apps/web/src/app/profile/watchlist-collection.tsx` is the private saved-title collection inside the profile Watchlist archive. It retains server ordering for recent saves, supports title search, movie/series/anime, genre, decade, and personal-rating filters, release-year/title sorting, and poster or horizontal Shelf views. Posters use the Home `TitleCard` without a footer or Save action: title, metadata, and optional catalog rating reveal over the artwork on hover or focus. Shelf rows retain visible captions, private personal ratings, and removal through the shared Save action. The collection pages saved titles with retry feedback. Catalog lookup failure leaves title references and their routes available; rating lookup failure disables rating choices that need the missing data. Service filters wait until the catalog models availability. `profile-history-screen.tsx` pages private completed watches separately from Diary and preserves Watch again and Log to diary actions.

`apps/web/src/app/profile/profile-archive-shell.tsx` composes the compact shared identity header and route tabs for every archive. `profile-lists-screen.tsx` adds `apps/web/src/app/lists/lists-collection.tsx` for the owner's lists and inline creation rail. Editorial list cards pair overlapping five-poster artwork with title, curator, count, description, and privacy. Local name search and sort controls, and paginated loading stay attached to real records. Visitor access to the owner archive is rejected; public list details use their separate shareable route. Create and edit actions continue through the existing list flows.

`TitleCollectionFilters` uses the shared `Select` toolbar variant for text triggers and themed listboxes. The field variant remains the default for forms and season selection. Applied choices display their actual values, Reset delegates to the collection to clear its complete filter state, and unavailable personal-rating options remain disabled. Genre and decade choices derive from loaded catalog details; missing years do not receive a fabricated decade. The Watchlist toolbar also owns compact kind buttons and native poster/Shelf buttons with pressed state.

Watched renders the Home `TitleCard` without a footer and with an explicit null rating, keeping only title and metadata inside the hover/focus overlay. Personal-rating filters remain available to the owner. Likes retains its captions. Visitors receive no private per-title rating in either archive.

`shared/rating-filter.tsx` owns the themed star-range popover used by Watched, Watchlist, and Diary. Pointer clicks choose exact half-star ratings; dragging selects inclusive bounds. Keyboard users edit two native range controls and apply them. Escape cancels a draft, dismissal restores focus after selection, and unavailable scores cannot be selected. The pure `rating-filter-value.ts` parser translates valid 1–10 exact/range values consistently on the server and client. Watched range URLs load watched-title pages and filter their private enrichment, with an honest loaded-result count and preserved pagination; existing exact-score URLs retain their dedicated rating archive.

Anime details place a single Related anime section after Episodes, using shared `TitleCard` posters with relationship and format labels. Canonical self-links and duplicates are omitted. Earlier seasons, sequels, and connected films keep their AniList destinations; failed relation reads show recovery copy. The Staff section and tab are removed, while characters, reviews, synopsis, airing, and recommendations remain.

`profile/diary-collection.tsx` composes the Diary archive as chronological month groups with portrait `ArtworkFrame` covers, watch days, exact episode links, tags, release years, and rewatch markers. Its toolbar reuses `Select` for watched year, release decade, genre, owner-only current rating, watch type, and sorting, with complete Reset and honest loaded-entry counts. `RatingDisplay` shows current title ratings privately, never a historical score attached to a particular watch. `DiaryEntryActions` has a compact mode with labeled icon buttons, a full-row editor and delete confirmation, focus restoration, retry errors, and success callbacks that update the archive before server refresh. Shared overview `DiaryRow` previews retain their existing layout.

Friends Activity and public-list discovery search remain retired, and the retired Circle-style Network feed stays retired. Profile Network uses `ProfileArchiveShell` for a compact identity header and one Network heading, with Edit profile for the owner or a deliberate Follow action for a visitor. Owner and visitor data remain discriminated by the API response; owner data never enters `VisitorProfileScreen`. `profile-network-screen.tsx` reuses the shared Tabs component for counted Followers/Following views, keeps a shareable view query, and delegates paginated member rows to `public-collection.tsx`. The collection remounts when username or view changes, resetting pages, cursor and errors. Shared profile navigation reveals its active section on arrival and viewport resize, without moving the page vertically. Owner Ratings also uses the compact archive shell and known count projections.


Player quality controls distinguish the requested rendition from decoded playback. Settings and rendition choices use standard tiers: 144p, 240p, 360p, 480p, 720p, 1080p, 1440p, 2160p and 4320p when available. Cropped widescreen video uses its equivalent 16:9 raster tier (1921 × 802 becomes 1080p; 1280 × 534 becomes 720p). Quality retains the exact decoded width × height as diagnostic text. Observations correct only the playing rendition, without relabeling untouched levels from stale frames. Auto is an actual adaptive engine choice; fixed-playlist sources expose only their available renditions. Manual selection retains the underlying engine identity, while observed decoding supplies the playing-resolution label. This replaces the earlier exact-height label rule at the member’s request.

Cast remains visible and opens a connection panel even before a TV is discovered. The panel checks the runtime, offers retry and opens the native device picker only on Choose TV. Missing receiver setup and unavailable browsers have explicit guidance. Connection keeps the sender’s position and play intent; failures keep local playback. A configured receiver and actual device are still required. Subtitle sync uses a timing icon instead of a wand. Subtitle appearance uses compact flat rows for Size, Style, Position, Font and Text color; its preview mirrors playback, with bold captions by default, script-aware Arabic fallbacks, and saved ivory/warm/sky/mint choices. The uploaded file has a direct session-labeled row, without duplication in language groups, and replacement uploads show reading feedback. Sync keeps the offset, fine adjustment toolbar and selectable cue list in one panel; changing appearance or sync preserves position and saved preferences.

The visible desktop player header keeps its title at 24px across loading and playback. Narrow inline players hide this header; narrow fullscreen retains compact 18px title context. Watch passes the anime name as `title` and the episode number/title as `topMeta`; quality remains in its dedicated control. A hidden top bar retains the preparation fallback.

Subtitle language groups canonicalize ISO aliases and language names while preserving regional variants. Discovery requests retain each original code and cursor; one visible group can page multiple aliases without dropping tracks. Optional exact skip metadata is requested only after the current media source loads its runtime. Source ranges take precedence, responses are canceled and invalidated across title/source/runtime changes, and missing metadata leaves the button hidden. Paused playback offers the exact manual skip even when auto-skip is enabled.

Automatic intro/outro skip is opt-in and defaults Off unless a viewer saved it On. Exact intro and outro ranges remain visible on the seek rail with separate orange and lilac markers; manual skip actions identify the matching range and seek to its exact end.

## New episodes and notification compositions

`home/NewEpisodesRail` follows Continue watching for authenticated members. It reuses `SectionHeading` and `shared/EpisodeCard` inside a horizontal rail, with the Settings reminder link in the heading. The shared card now accepts caller-owned action labels, accessible link labels and status content; title-specific episode identity, release dates and check evidence stay in the caller. A current check offers Play episode to the exact Watch route. An aired episode without current evidence offers View episodes to the title's episode section. Landscape artwork, missing-art treatment, compact card corners, orange actions, theme tokens and keyboard focus retain the existing presentation. The whole section, including heading and spacing, stays absent until at least one episode is loaded. Empty tracking, no recent episodes and failed initial loads remain hidden; background polling continues, and partial or failed refreshes retain known episodes with local retry.

`notifications/NotificationBell` sits beside Search in the existing FilScreen utility row and disappears for guests. A Lucide bell exposes the full unread count in its accessible name and a compact visual count capped at 99+. Its nonmodal, labeled preview receives focus on open, scrolls within its viewport bound, closes on outside pointer or Escape, and restores trigger focus after Escape. Desktop anchors it beside the trigger; narrow screens use a viewport-bounded panel. The preview contains five recent reminders, Mark all read and View all notifications, with explicit loading, empty and retry states.

`NotificationRows` is shared by the bell and protected `/notifications` inbox. Each flat, hairline-separated row keeps title, exact episode, historical Playback checked label, notification time and changing-availability guidance together. Long titles wrap; unread dots reinforce read state without supplying its only meaning. Individual Mark read and episode opening share `useNotificationActions`: failed writes retain the row and offer retry, and an episode opens only after its read write succeeds. The inbox composes the existing shell, editorial heading, All/Unread controls and Previous/Next cursor navigation; the authenticated server route redirects guests to sign-in while retaining its destination.

`settings/NotificationPreference` composes the shipped `PreferenceRow`, `Toggle` and recovery `Button` in the existing Notifications section. It starts off, disables changes until loaded or while saving, and retains an explicit retry for failed reads/writes. `useReleaseResource` owns member/key-scoped cancellation and retained data during same-member refresh failure; resources that poll refresh each minute only while visible and on focus, visibility or notification-change events. Session changes abort writes and hide stale member results. The app-level compositions add no shared visual tokens or replacement theme; `DESIGN.md` and `.impeccable/design.json` remain the incumbent system for this ordinary extension.

## Public profile and member-search compositions

`visitor-profile-screen.tsx` reuses the cinematic masthead, shared Avatar, profile typography, FavoritesShelf, ProfileSectionNavigation and ShareProfile for visible taste. Its masthead follower/following stat links open the matching Network views. Visitor archive routes render safe paginated Ratings, Reviews, public Lists, Likes, Tags, Watchlist and member relationships only when the matching section is public. `profile-network-screen.tsx` groups member relationships behind the Network tab with a shared Tabs Followers/Following switch. `member-rows.tsx` composes avatar, identity link and `follow-button.tsx`; relationship rows remain private when the owner's Network section is hidden. FollowButton handles sign-in return links, busy writes, errors and outgoing unfollow without automatically following after login.

`people-search-screen.tsx` extends the existing Search page with member rows and cursor pagination. FilScreenSearchOverlay adds People while retaining debounce, AbortController cancellation, request-id protection and keyboard selection. Browser member helpers and server reads parse visitor-specific contracts and always use no-store. Owner profile and list helpers preserve their original private DTOs. Settings and list editors use explicit Public/Private controls and preserve failed drafts.

## Welcome Guide and Viewing Preferences compositions

`experience/WelcomeDialog` is a native modal in the FilScreen shell on eligible browsing routes. Its first-visit introduction is remembered per device and explains Consumit's movies, series, anime, member library sync and limited pop-under ads, with a Settings path to turn ads off. One Share Consumit action invokes native sharing where available and otherwise reveals Facebook, WhatsApp, X, Reddit and Telegram. Copy uses the canonical site URL and offers a selectable URL if clipboard access fails. Native share cancellation leaves the dialog open. A centered heart mark keeps the modal focused on sharing. `experience/BrowsingNotifications` presents the ad-settings and feedback messages separately, after the modal closes: one polite, nonmodal notice at a time, with an explicit dismiss control and destination link. A 1.5-second pause separates notices; device dismissal survives reload and is received across tabs. They wait for preference readiness and never appear on Watch. The optional preferences-guide prompt remains separately controlled by `NEXT_PUBLIC_CONSUMIT_WELCOME_ENABLED`; Personalize my experience enters the guide, while Start exploring and Escape dismiss the current dialog. It waits for owner-scoped preference readiness, restores focus on close and is absent from direct Watch.

`experience/PreferenceFields` and `PreferenceEditor` are the single app-owned form used by the first guide step and Settings. Shared Selects edit movie/series audio, anime SUB/DUB and quality; shared Toggles edit subtitles and next-episode autoplay. Subtitle priority uses native ordered-list semantics, direction-isolated language names and keyboard-operable add/remove/reorder controls. Fields form two columns when space permits and stack on narrow screens; flat separators organize groups. Drafts survive failed saves, with busy, loading, saved, storage-denied and retry states. Use device choices is offered only to an unconfigured member account and edits the draft before a separate Save.

`onboarding/GuideFrame` reuses the branded `OnboardingHeader` with three steps, an always-available Skip and a Back destination. Viewing Preferences advances after Save; Favorites uses the shipped `Input`, `FilterChip` and native-checkbox `SelectableTitle` with a four-title limit and adjacent selection summary. Search is debounced/cancelable, keeps selections during failure and exposes retry. Member-scoped session-storage drafts retain deliberate Favorites across Back; saved Favorites or guide completion clear them. Failed existing-Favorites reads disable the replacement write. Guests receive account creation or continue-without-account destinations. Ready uses flat instructional rows and optional community cards; completion failure keeps Retry and Skip usable.

`experience/CommunityCards` composes the supplied Discord/Reddit destinations as a compact editorial banner with platform SVG marks, social-lilac Discord and action-orange Reddit accents, explicit join actions, Lucide outgoing arrows, readable new-tab labels and visible keyboard focus. Theme-aware flat cards sit beside the Charter introduction when the section has enough space; narrower sections put the introduction above the pair, and mobile stacks the cards. Home supplies a quiet independent hide/retry control, while Ready shows the optional joining choices without requiring dismissal. No community iframe, chat surface or automatic membership is created.

`WatchPlayback` and the anime Watch composition consume hydrated Viewing Preferences before playback resolution. Enabled subtitles launch discovery when a direct session becomes ready; disabled subtitles retain menu-triggered discovery. Title-scoped discovery survives direct source/lease replacements and cancels on teardown. The existing Player receives its opening semantic defaults and reports later changes through application callbacks, retaining its media engine, panels and controls. Automatic preparation searches preferred languages ahead of an existing fallback; late external tracks reconcile that priority while preserving a selected release within the same language and manual Off. A failed preference sync appears as localized retry feedback while video continues. These app compositions introduce no new shared color, type, motion or shape vocabulary; root `DESIGN.md` and `.impeccable/design.json` are preserved for this ordinary extension.


Phone interface (2026-10-12, refined 2026-10-13): `FilScreenShell` owns the closed-by-default native navigation dialog and its focus/scroll/dismissal behavior; the same destination composition renders inside the desktop rail and phone sheet. `FilScreenSearchOverlay` owns the full-height phone search, visible close control and focus loop. `WatchCard` shows phone artwork without a title caption underneath, while keeping the title as the accessible link name and retaining desktop hover/focus title overlays. Shared `Button`, `Input`, `Select`, filter chips and segmented controls provide explicit touch sizing; Select contains and flips its popup according to available viewport space. `RatingInput` keeps the ten native radios and clear-on-reselection behavior while displaying numbered touch targets on phones and stars on desktop. Player playback ownership stays unchanged; its touch controls now adapt to portrait and short landscape viewports.

Historical mobile-player refinement (2026-10-15): the unified player deck authority above replaces this entry's page-level Back, hidden inline header and three-column action layout. Active phones keep compact title/episode context, the contained picture and stable transport/destination rows with 44px targets and a 48px Play target. Short landscape and fullscreen retain overlays. Media engine, provider/session contracts, progress and preferences retain their ownership.

Server selector refinement (2026-10-15, superseded by the later owner-confirmed grouping): `watch/ServerStrip` initially rendered a wrapping numbered grid. The current Consumit Server disclosure and separate external-player controls are described above. Orange outline/check marks selection. The later Admin-order change removes Manage servers and its reorder/reset controls; manual selection and finite recovery remain available. This ordinary extension preserves DESIGN.md and its sidecar.


## Anime Watch audio placement

Anime SUB/DUB stays route-owned and appears at the top of the Consumit Player's Settings Playback group, with an Anime audio label, a brief Original audio or English dub explanation, and the shared SegmentedControl. This keeps it immediately visible after opening Settings and out of the lower Watch preferences group or the page around the player. The same selection remains reachable for external players and anime with no next/previous episode. Unsupported native toggles stay hidden on external players; the current language and exact episode navigation retain their existing behavior.


## Complete player compositions

ConsumitPlayer accepts optional episodePanel, watchSettings and watchStatus presentation content, plus recordingKey and controlled theater state. The web application owns catalog lookup, navigation, source resolution, progress and preferences. Shared player panels own presentation, dismissal, bounded scrolling and focus restoration. Episodes and keyboard help use dialog semantics. Audio, quality and caption-track choices use actual native radio inputs through `PlayerRadioGroup` and `PlayerRadioOption`, retaining browser arrow selection and one tab stop for the checked option. Sources remains a set of action buttons exposing `aria-pressed`, with favorite actions independent of source selection.

`EpisodeBrowser` and `useEpisodeBrowser` retain shared route-owned episode/filter/page state. Inside Watch, compact artwork rows appear within the shared anchored Episodes card, with season selection, artwork, episode badges, current/upcoming states, search and paging. Player destination actions remain labeled; previous/next episode header icons keep accessible names. Season lookup retains cancellation/loading/retry without starting an episode. `PlayerShortcuts` provides the same help to Watch and the in-player panel using the transport seek constant.

Owner refinement (2026-10-18): `ConsumitPlayer` retains the unified deck destinations and restores the larger earlier playback treatment: 56px desktop Play, 26px desktop transport/menu marks, 48px desktop Consumit mark, title artwork and progress grouped as one bottom-left preparation stack, and vertically centered left-side artwork with paused facts and synopsis grouped beneath. Phone portrait uses 50px Play and 22–23px marks, shows compact centered-left title artwork/facts on pause, uses a 36px Consumit mark, omits volume in portrait and short landscape, and spaces Play, seek and fullscreen evenly across four 44px-minimum slots. Caption bytes from Arabic VTT sources and local uploads are decoded as Windows-1256 when UTF-8 is invalid; provider normalization failures preserve a selectable direct-track fallback. Preparation remains anchored to the picture edge with reserved phone deck paint. The CSS presentation is shared with `ProviderFrame`; volume is first-party-only.

Within a title, WatchPlayback and ConsumitPlayer retain DOM identity during episode changes. A canonical recording key scopes sessions, provider rosters, requests, completion writes, subtitles and cast status. The first-party fullscreen boundary contains recovery and continuation controls. External frames keep their existing composition and unsupported capabilities.

## Home list discovery and title quick actions

`home/PublicListRail` composes `SectionHeading` with the shared `CuratedListCard` and `PosterStack`, rendering recent Network lists or privacy-filtered popular public lists only when real data exists. It shows curator, title and ordered-cover artwork, and the list's title count; phone cards scroll horizontally and desktop shows three across. The universal app-level `TitleCard` pairs its existing screen action with an accessible overflow trigger: a theme-colored 34px disc inside a 44px hit target, with a quiet orange hover/focus response. Its compact portaled quick-action panel stays above horizontal rails, flips above low cards, and uses hairline dividers and a theme-aware raised surface. Action rows stay 44px on phones and compact at desktop widths. Watchlist, Watched, and Likes remain direct one-tap choices. Add to a list closes the quick-action panel and opens the standalone, title-aware `AddTitleToListDialog`, which lets members choose a list or create a public-by-default list without nesting the workflow inside the menu. Title-detail and Watch actions remain navigation. Guests get a sign-in path for member-only actions.
