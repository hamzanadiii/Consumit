# Shared component roadmap

This roadmap translates the registry in `design/Consumit_UI_Package/docs/brand-system.md` into buildable families. The design package is the visual authority; this file tracks implementation order and boundaries.

## Rules

- Finish one component and its meaningful states before starting the next.
- Add only variants already demanded by an active design or the immediately selected screen.
- Keep styling specific to Consumit's “cinema after midnight” system: flat dark surfaces, ivory type, restrained signal colors, compact geometry, and editorial typography.
- Use Lucide for interface icons. Use Radix primitives when keyboard behavior, focus management, or ARIA semantics are complex. Do not import a generic shadcn theme; individual patterns may be adapted into Consumit-owned code when useful.
- Every component ships through `@consumit/ui` with its public types, a catalog example, behavioral tests where interaction exists, and responsive/focus verification.

## Cross-screen contracts

These patterns recur across the complete active screen set and should be preserved as components are added:

- **Global shell:** an 84px desktop bar with the Consumit lockup, four primary destinations, universal search, and the member avatar. Active routes use a thin orange underline. Authentication, onboarding, reporting, and Watch / Embed use purpose-specific reduced headers.
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
| 3 | Form foundation | Label, input, search field, textarea, helper/error text, checkbox | Planned |
| 4 | Selection | Tabs, filter chip, segmented control, toggle, issue selector | Planned |
| 5 | Identity | Avatar, avatar group, member byline, service mark | Planned |
| 6 | Signals | Badge, status dot, progress rail, Taste Match meter, rating display | Planned |
| 7 | Media | Artwork frame, poster card, landscape still, empty/missing art | Planned |
| 8 | Content cards | Content card, continue card, trending card, curated-list card | Planned |
| 9 | Editorial | Section heading, editorial feature, mood selector, social proof | Planned |
| 10 | Social | Activity item, trusted reaction, friend/follow row, comment card | Planned |
| 11 | Profile | Profile masthead, compatibility panel, diary row, taste signature | Planned |
| 12 | Title and series | Title masthead, member pulse, cast card, season selector, episode row | Planned |
| 13 | Library and lists | Library toolbar, saved-title card, ordered-title row, curator panel | Planned |
| 14 | Authentication | Auth shell, auth field, social auth button, trust note | Planned |
| 15 | Onboarding | Onboarding header, import option, selectable title, member suggestion | Planned |
| 16 | Settings and support | Settings rail/section, preference row, health summary, dropzone | Planned |
| 17 | Playback shell | Watch header, embed frame, source selector, report, trust note | Blocked by playback decisions |
| 18 | Global finish | Footer, empty/loading/error compositions, responsive refinements | Planned |

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

The component intentionally does not cover the reduced authentication, onboarding, report, Watch, or Embed headers. Those surfaces own purpose-specific navigation, and Watch / Embed omits the global shell entirely.
