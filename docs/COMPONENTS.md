# Shared component roadmap

This roadmap records Consumit’s buildable component families, implementation order, and boundaries. [`DESIGN.md`](../DESIGN.md) is the durable visual authority, and shipped shared components are the executable reference.

## Rules

- Finish one component and its meaningful states before starting the next.
- Add only variants already demanded by an active design or the immediately selected screen.
- Preserve Consumit's original Cinema After Midnight system: flat midnight surfaces, warm ivory, rare semantic signals, compact corners, editorial typography, and orange active-route underlines.
- Use Lucide for interface icons. Use Radix primitives when keyboard behavior, focus management, or ARIA semantics are complex. Do not import a generic shadcn theme; individual patterns may be adapted into Consumit-owned code when useful.
- Every component ships through `@consumit/ui` with its public types, a catalog example, behavioral tests where interaction exists, and responsive/focus verification.

## Cross-screen contracts

These patterns recur across the complete active screen set and should be preserved as components are added:

- **Global shell:** the original flat 68px desktop bar with the Consumit lockup, session-aware destinations, outlined search, and member entry. Active routes use an orange baseline. The brand, guest Sign in, and menu shell is 52px below desktop. Authentication, onboarding, reporting, and Watch use purpose-specific reduced headers.
- **Page structure:** a 50px desktop edge, broad editorial hero, warm-white hairline separators, and a main-content/side-rail split for dense decision surfaces. Mobile gets a separate composition rather than a scaled desktop grid.
- **Action hierarchy:** ivory is the shared primary action (Watch, view, accept); orange advances a committed flow (submit, continue, create); outlines hold secondary actions; ghost text handles low-emphasis destinations.
- **Semantic signals:** orange marks brand, selection, ratings, and active progress; lilac is reserved for social/taste context; lime is reserved for presence, health, and success.
- **Geometry:** preserve the original 5px controls, 6px cards, and 3px micro corners across Consumit. Circular shapes identify avatars and established icon affordances.
- **Assets:** reuse the supplied lockup, mark, cinematic backdrop, poster motifs, member avatar treatment, and neutral service identifiers. Do not recreate those assets with generic iconography.
- **Depth:** interface surfaces are flat and separated by tone or border. Shadows belong to artwork separation, not routine controls or panels.

WatchCard captions and catalog metadata stay visible below the poster; bookmark actions appear on hover and keyboard focus and remain visible on touch devices. Home composes its FilScreen shell, featured hero, trending rails, Continue watching, and Circle activity.

## Application composition boundary

Movies and Series browsing composes the shared `ArtworkFrame`, `Button`, and FilScreen shell in `apps/web/src/app/catalog/catalog-browse-content.tsx`. Its native filter selects, landscape rail, and poster grid remain application-specific. `use-catalog-feed.ts` owns query-scoped cancellation, deduplicated page appends, scroll loading, and retry state; `apps/web/src/lib/catalog-browser.ts` validates browser discovery responses. These catalog behaviors do not belong in shared media or selection primitives. The member flow lives in [PRODUCT.md](./PRODUCT.md#movies-and-series-browsing), and its visual composition lives in [DESIGN.md](../DESIGN.md#movies-and-series-browsing).

## Build order

| Order | Family | Components | Status |
|---:|---|---|---|
| 1 | Action | Button, icon button, loading and disabled states | Complete |
| 2 | Global shell | FilScreen shell (sidebar, utility row, theme, search overlay) | Complete |
| 3 | Form foundation | Label, input, search field, textarea, helper/error text, checkbox | In progress |
| 4 | Selection | Tabs, dropdown select, filter chip, segmented control, toggle | Complete |
| 5 | Identity | Avatar, service mark | Complete |
| 6 | Signals | Badge, status dot, progress rail, rating display | Complete |
| 7 | Media | Artwork frame, empty/missing art | Complete |
| 8 | Content cards | Watch card, curated-list card | Complete |
| 9 | Editorial | Section heading, mood selector | Complete |
| 10 | Profile | Diary row | Complete |
| 11 | Title and series | Cast card, season selector | Complete |
| 12 | Library and lists | Saved-title card, ordered-title row | Complete |
| 13 | Authentication | Auth shell, auth field, verification/recovery states | Complete |
| 14 | Onboarding | Onboarding header, selectable title | Complete |
| 15 | Settings and support | Settings rail/section, preference row | Complete |
| 16 | Playback shell | Watch header, Consumit Player | Complete (UI shell) |
| 17 | Global finish | Empty/loading/error compositions, responsive refinements | Complete |

The pre-FilScreen global navigation, session navigation, page footer component, component gallery, social card family, and gallery-only specimens (Trending card, Profile masthead, Title masthead, Episode row, Taste Match, Dropzone, Trust note, Curator panel, Library toolbar, Import option, Member suggestion, Issue selector, Source selector) were deleted once FilScreen owned the shell.

## Component 01 — Button

Source references: Home / Discover, Title Detail, authentication, onboarding, settings, Help Center, and Report Issue.

Included states:

- Primary ivory action
- Signal-orange accent action
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

- Full-page FilScreen shell with sidebar rail, utility row, kind tabs, search overlay, theme switch, and session-aware Sign in / Log out
- Supplied Consumit mark and wordmark on the collapsed or expanded rail
- Active-route presentation for sidebar destinations and kind tabs with `aria-current`
- Device-persisted sidebar collapse and dark/light theme with SSR-safe first paint
- Sign-out with retry-safe error language when the account service is unreachable
- Optional sr-only `pageHeading` for pages that need a document h1
- Catalog credit footer with TMDB / AniList attribution and About links

This shell replaces the retired GlobalNavigation / SessionNavigation / ScreenShell stack and is excluded from reduced authentication, onboarding, report, and Watch headers.

## Component 03 — Form foundation

### 03.1 Label + Input

Source references: Create Account, Sign In, Settings, and Report Issue.

Included behavior:

- Persistent uppercase label with caller-owned native association
- 38px text field with the shared field surface and control radius
- Empty, populated, hover, focus, invalid, read-only, and disabled styling
- Native input attributes, autocomplete, validation, and accessible descriptions remain caller-owned
- Autofill, caret, keyboard focus, and reduced-motion treatment match the Consumit palette

Search adornments, password reveal, textarea, shared helper/error text, and checkbox behavior remain intentionally deferred to the next form-foundation slices.

## Component 04 — Selection

Source references: Search / Explore, Friends Activity, List Detail, Settings, and Report Issue.

Included behavior:

- Route tabs with an orange active line and native link semantics
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

Source references: Home, Search / Explore, Library, and Public Profile.

Included behavior:

- Watch-forward cards with overlaid title, optional year/rating meta, and bookmark slot
- Curated-list cards with supplied artwork collage, curator identity, and save count

## Component 09 — Editorial

Source references: Home, Search / Explore, and List Detail.

Included behavior:

- Editorial section headings with restrained description and optional action
- Controlled mood selection with semantic color dots and pressed state

## Component 10 — Profile

Source references: Profile Owner and Public Profile.

Included behavior:

- Responsive diary rows that keep date, artwork, rating, note, destination, and action distinct

## Component 11 — Title and series

Source references: Title Detail and Series Detail.

Included behavior:

- Cast cards with supplied portrait support and a restrained geometric identity fallback
- Shared dropdown season selection with caller-owned state

## Component 12 — Library and lists

Source references: My Library and List Detail.

Included behavior:

- Saved-title cards with explicit save state, optional progress, signal, badge, and destination
- Ordered title rows with stable rank, artwork, metadata, curator quote, match evidence, and action

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

Source references: Onboarding History, Favorites, and Circle.

Included behavior:

- Reduced onboarding header with clamped step progress and optional skip destination
- Native-checkbox selectable title cards with supplied artwork and visible keyboard state

## Component 15 — Settings and support

Source references: Settings.

Included behavior:

- Settings rail with member context and semantic current-page navigation
- Settings sections and preference rows that accept the appropriate control rather than assuming every setting is a toggle

## Component 16 — Playback shell

Source references: Player Screen and playback architecture.

Included behavior:

- Reduced watch header with explicit back and exit destinations
- First-party Consumit Player with a semantic video surface, poster and unavailable fallbacks, and accessible playback controls
- UI scope only: provider ranking, entitlement, health probing, source switching, streaming adapters, and playback business rules remain application logic

## Component 17 — Global finish

Source references: all active screens.

Included behavior:

- Empty composition with a direct activation path
- Reduced-motion loading composition with a live status label
- Alerting error composition that explains impact, recovery, and optional diagnostic detail

## Personal-space compositions

`apps/web/src/app/library/library-screen.tsx` composes shared artwork, saved-title cards, chips, segmented controls, lists, and diary rows into shelf, grid, and list views. The shelf view uses subtle ledges in existing surface tokens, with captions below the covers. Its local search and kind filter are application concerns; their combination and empty-result recovery are covered by the library screen tests.

`apps/web/src/app/profile/public-profile-screen.tsx` composes the shared FilScreen shell, banner hero with avatar/name/bio/stats, section tabs, six-Favorites exhibition, metadata-derived genre counts, diary, written reviews, and lists. The masthead expands with its content; Favorites have equal size and contrast, and native section links track the current URL hash. Owner editors remain the existing components. Profile and library visual rules live in DESIGN.md; their decorative shelf boards do not become generic card primitives.
