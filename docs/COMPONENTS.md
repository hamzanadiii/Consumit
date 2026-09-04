# Shared component roadmap

This roadmap records Consumit’s buildable component families, implementation order, and boundaries. [`DESIGN.md`](../DESIGN.md) is the durable visual authority, and shipped shared components are the executable reference.

## Rules

- Finish one component and its meaningful states before starting the next.
- Add only variants already demanded by an active design or the immediately selected screen.
- Keep styling specific to Consumit's “cinema after midnight” system: flat dark surfaces, ivory type, restrained signal colors, compact geometry, and editorial typography.
- Use Lucide for interface icons. Use Radix primitives when keyboard behavior, focus management, or ARIA semantics are complex. Do not import a generic shadcn theme; individual patterns may be adapted into Consumit-owned code when useful.
- Every component ships through `@consumit/ui` with its public types, a catalog example, behavioral tests where interaction exists, and responsive/focus verification.

## Cross-screen contracts

These patterns recur across the complete active screen set and should be preserved as components are added:

- **Global shell:** an 84px desktop bar with the Consumit lockup, four primary destinations, universal search, and the member avatar. Active routes use a thin orange underline. Authentication, onboarding, reporting, and Watch use purpose-specific reduced headers.
- **Page structure:** a 62px desktop edge, broad editorial hero, warm-white hairline separators, and a main-content/side-rail split for dense decision surfaces. Mobile gets a separate composition rather than a scaled desktop grid.
- **Action hierarchy:** ivory means the confident immediate action (play, view, accept); orange advances a committed flow (submit, continue, create); outlines hold secondary actions; ghost text handles low-emphasis destinations.
- **Semantic signals:** orange marks brand, selection, ratings, and active progress; lilac is reserved for social/taste context; lime is reserved for presence, health, and success.
- **Geometry:** controls and panels stay square to gently rounded at 4–8px. Circles are reserved for people, presence, progress, and recurring celestial artwork.
- **Assets:** reuse the supplied lockup, mark, cinematic backdrop, poster motifs, member avatar treatment, and neutral service identifiers. Do not recreate those assets with generic iconography.
- **Depth:** interface surfaces are flat and separated by tone or border. Shadows belong to artwork separation, not routine controls or panels.

## Build order

| Order | Family | Components | Status |
|---:|---|---|---|
| 1 | Action | Button, icon button, loading and disabled states | Complete |
| 2 | Global shell | Global navigation, nav item, profile trigger, mobile navigation | Complete |
| 3 | Form foundation | Label, input, search field, textarea, helper/error text, checkbox | In progress |
| 4 | Selection | Tabs, filter chip, segmented control, toggle, issue selector | Complete |
| 5 | Identity | Avatar, avatar group, member byline, service mark | Complete |
| 6 | Signals | Badge, status dot, progress rail, Taste Match meter, rating display | Complete |
| 7 | Media | Artwork frame, poster card, landscape still, empty/missing art | Complete |
| 8 | Content cards | Content card, continue card, trending card, curated-list card | Complete |
| 9 | Editorial | Section heading, editorial feature, mood selector, social proof | Complete |
| 10 | Social | Activity item, trusted reaction, friend/follow row, comment card | Complete |
| 11 | Profile | Profile masthead, compatibility panel, diary row, taste signature | Complete |
| 12 | Title and series | Title masthead, member pulse, cast card, season selector, episode row | Complete |
| 13 | Library and lists | Library toolbar, saved-title card, ordered-title row, curator panel | Complete |
| 14 | Authentication | Auth shell, auth field, social auth button, trust note | Complete |
| 15 | Onboarding | Onboarding header, import option, selectable title, member suggestion | Complete |
| 16 | Settings and support | Settings rail/section, preference row, health summary, dropzone | Complete |
| 17 | Playback shell | Watch header, Consumit Player, source selector, report, trust note | Complete (UI shell) |
| 18 | Global finish | Footer, empty/loading/error compositions, responsive refinements | Complete |

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

## Component 02 — Global navigation

Source references: Home / Discover, Search, Movies, Series, Friends, Profile, Settings, and Help Center.

Included behavior:

- Exact 84px desktop shell and sparse 64px brand-and-menu shell
- Supplied Consumit mark, primary destinations, and orange active-route line
- Native GET search form with an accessible search label
- Supplied member portrait with component-owned visual and announced presence state
- Dedicated mobile menu with trapped focus, Escape dismissal, and trigger focus restoration
- Optional sticky positioning and caller-owned route/search/profile destinations
- Reduced-motion handling for the mobile overlay and panel entrance

The component intentionally does not cover the reduced authentication, onboarding, report, or Watch headers. Those surfaces own purpose-specific navigation, and Watch omits the global shell entirely.

## Component 03 — Form foundation

### 03.1 Label + Input

Source references: Create Account, Sign In, Settings, and Report Issue.

Included behavior:

- Persistent uppercase label with caller-owned native association
- 52px text field with the shared field surface and control radius
- Empty, populated, hover, focus, invalid, read-only, and disabled styling
- Native input attributes, autocomplete, validation, and accessible descriptions remain caller-owned
- Autofill, caret, keyboard focus, and reduced-motion treatment match the Consumit palette

Search adornments, password reveal, textarea, shared helper/error text, and checkbox behavior remain intentionally deferred to the next form-foundation slices.

## Component 04 — Selection

Source references: Search / Explore, Friends Activity, List Detail, Settings, and Report Issue.

Included behavior:

- Route tabs with an orange active line and native link semantics
- Compact pressed-state filter chips with optional semantic signal dots
- Native-radio segmented controls and issue selectors with keyboard selection
- Controlled switch semantics for on/off settings, including disabled state
- Visible focus, touch-safe sizing, reduced motion, and horizontal tab overflow

## Component 05 — Identity

Source references: Global Navigation, Friends Activity, Settings, Public Profile, and onboarding.

Included behavior:

- Supplied-image or initials-fallback avatars at four scales
- Online, away, and offline presence with explicit standalone labeling
- Capped avatar groups with a readable overflow count and group summary
- Member bylines with optional profile destination, context, presence, and action
- Service marks with supplied assets, status, and fallback initials

## Component 06 — Signals

Source references: Home, Search / Explore, Profile, List Detail, Settings, and playback support.

Included behavior:

- Compact semantic badges and labeled status dots
- Clamped, accessible progress rails in the reserved signal colors
- Taste Match meter with score, human reason, and optional social detail
- Fractional rating display with a spoken numeric value rather than color-only meaning

## Component 07 — Media

Source references: Home, Search / Explore, Friends Activity, Public Profile, and title detail.

Included behavior:

- Portrait, landscape, square, and wide artwork frames
- Supplied poster assets with title, metadata, badge, and destination support
- Landscape stills with a named continuation action and accessible progress
- A code-native geometric missing-art state that preserves the cinematic composition
- Lazy image loading and reduced-motion artwork response

## Component 08 — Content cards

Source references: Home, Search / Explore, Library, Friends Activity, and Public Profile.

Included behavior:

- Default, saved, and watched poster cards with contextual badges and friend rings
- Continue cards with one explicit playback destination and remaining progress
- Ranked trending cards with member score and completion proof
- Curated-list cards with supplied artwork collage, curator identity, and save count

## Component 09 — Editorial

Source references: Home, Search / Explore, Friends Activity, and List Detail.

Included behavior:

- Editorial section headings with restrained description and optional action
- Cinematic editorial features with context, synopsis, actions, and social proof
- Controlled mood selection with semantic color dots and pressed state
- Compact social proof combining a named member group with human evidence

## Component 10 — Social

Source references: Friends Activity, Title Detail, List Detail, Search / Explore, and onboarding.

Included behavior:

- Activity items combining member context, media, title, rating, commentary, and destination
- Trusted reactions with member identity, numeric rating, quote, and engagement
- Friend and follow rows with clamped overlap, relationship state, and caller-owned action
- Comment cards for member and curator roles, including native disclosure for hidden spoilers

## Component 11 — Profile

Source references: Profile Owner and Public Profile.

Included behavior:

- Cinematic profile masthead with identity, optional presence, biography, member statistics, background artwork, and caller-owned actions
- Clamped compatibility panel with a readable score, human reason, mutual-member proof, and optional detail
- Responsive diary rows that keep date, artwork, rating, note, destination, and action distinct
- Taste signature statement with semantically colored worlds and a supporting comparison detail

## Component 12 — Title and series

Source references: Title Detail and Series Detail.

Included behavior:

- Cinematic title masthead with metadata, synopsis, action hierarchy, Taste Match reason, and social proof
- Member pulse with a single accessible rating label and decorative distribution histogram
- Cast cards with supplied portrait support and a restrained geometric identity fallback
- Native season selection with caller-owned state
- Episode rows for available, continuing, and upcoming states, including optional progress and action

## Component 13 — Library and lists

Source references: My Library and List Detail.

Included behavior:

- Native library search toolbar with caller-owned filters, sort, and view controls
- Saved-title cards with explicit save state, optional progress, signal, badge, and destination
- Ordered title rows with stable rank, artwork, metadata, curator quote, match evidence, and action
- Curator panels with readable ownership, collaborator detail, list description, and tags

## Component 14 — Authentication

Source references: Create Account and Sign In.

Included behavior:

- Responsive auth shell that removes the visual story panel below desktop while preserving the task form
- Reduced-shell content prompts and caller-owned panel sizing for sign-in and account creation
- Caller-owned artwork and overlay treatment, with the dark overlay retained as the safe default
- Persistent auth fields with helper or error association and caller-owned native attributes
- Optional trailing field actions for accessible password visibility controls
- Named provider actions with light and dark action treatments
- Plain-language trust notes using semantic signals without relying on color alone

## Component 15 — Onboarding

Source references: Onboarding History, Favorites, and Circle.

Included behavior:

- Reduced onboarding header with clamped step progress and optional skip destination
- Import and start-fresh options with benefits, state, and caller-owned actions
- Native-checkbox selectable title cards with supplied artwork and visible keyboard state
- Member suggestions with identity, handle, overlap, taste explanation, an ivory Follow action, and an outlined Following state; direct messaging is excluded

## Component 16 — Settings and support

Source references: Settings, Help Center, and Report Issue.

Included behavior:

- Settings rail with member context and semantic current-page navigation
- Settings sections and preference rows that accept the appropriate control rather than assuming every setting is a toggle
- Health summaries with textual healthy, slow, and unavailable states
- Native file dropzone for screenshots and short recordings with caller-owned file constraints

## Component 17 — Playback shell

Source references: Player Screen, playback architecture, and Report Issue.

Included behavior:

- Reduced watch header with explicit back and exit destinations
- First-party Consumit Player with a semantic video surface, poster and unavailable fallbacks, and accessible playback controls
- Native-radio source selection with health, availability detail, and caller-owned switching logic
- Playback recovery destination and an explicit installation-safety warning
- UI scope only: provider ranking, entitlement, health probing, source switching, streaming adapters, and playback business rules remain application logic

## Component 18 — Global finish

Source references: all active screens.

Included behavior:

- Responsive global footer with brand destination, legal/help links, and caller-owned copyright
- Empty composition with a direct activation path
- Reduced-motion loading composition with a live status label
- Alerting error composition that explains impact, recovery, and optional diagnostic detail
