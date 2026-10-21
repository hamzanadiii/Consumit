---
name: Consumit
description: A cinematic, editorial interface for streaming and personal taste.
colors:
  canvas: "#09090b"
  navigation: "#0b0b0e"
  surface: "#121216"
  surface-raised: "#19191e"
  field: "#0d0d10"
  ink: "#f4f0e8"
  copy: "#c9c4bc"
  muted: "#9b968e"
  faint: "#67645f"
  signal-orange: "#ff5d38"
  social-lilac: "#a79cff"
  positive-lime: "#b8d86d"
  danger: "#b76d66"
  separator: "rgba(255, 255, 255, 0.10)"
  control-outline: "rgba(244, 240, 232, 0.40)"
  player-canvas: "#101013"
  player-surface: "#17171c"
  player-surface-raised: "#24242b"
typography:
  root: "14px"
  player-micro:
    fontFamily: "'Inter Variable', 'DejaVu Sans', sans-serif"
    fontSize: "11px"
    lineHeight: 1.5
  player-timing:
    fontFamily: "'Inter Variable', 'DejaVu Sans', sans-serif"
    fontSize: "12px"
    lineHeight: 1.5
  player-control:
    fontFamily: "'Inter Variable', 'DejaVu Sans', sans-serif"
    fontSize: "13px"
    fontWeight: 500
  player-body:
    fontFamily: "'Inter Variable', 'DejaVu Sans', sans-serif"
    fontSize: "14px"
    lineHeight: 1.5
  player-heading:
    fontFamily: "'Inter Variable', 'DejaVu Sans', sans-serif"
    fontSize: "16px"
    fontWeight: 600
    letterSpacing: "-0.02em"
  player-title:
    fontFamily: "'Inter Variable', 'DejaVu Sans', sans-serif"
    fontSize: "20px"
    fontWeight: 550
    lineHeight: 1.4
    letterSpacing: "-0.02em"
  display:
    fontFamily: "Charter, 'Bitstream Charter', Georgia, serif"
    fontSize: "clamp(2.5rem, 6vw, 5rem)"
    fontWeight: 400
    lineHeight: 0.95
    letterSpacing: "-0.025em"
  body:
    fontFamily: "'DejaVu Sans', Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: "'DejaVu Sans', Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0.12em"
  control:
    fontFamily: "'DejaVu Sans', Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.01em"
rounded:
  micro: "3px"
  control: "5px"
  card: "6px"
spacing:
  base: "3.5px"
  compact: "7px"
  small: "10px"
  medium: "16px"
  control: "21px"
  section: "28px"
  large: "42px"
  hero: "56px"
components:
  player-destination:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.player-control}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "44px"
  player-panel:
    backgroundColor: "{colors.player-surface}"
    textColor: "{colors.ink}"
    typography: "{typography.player-body}"
    rounded: "{rounded.card}"
    width: "380px"
  player-panel-header:
    backgroundColor: "{colors.player-surface}"
    textColor: "{colors.ink}"
    typography: "{typography.player-heading}"
    padding: "5px 8px 5px 16px"
    height: "56px"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "38px"
  button-accent:
    backgroundColor: "{colors.signal-orange}"
    textColor: "{colors.canvas}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "38px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "38px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.copy}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "38px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "38px"
  global-navigation:
    backgroundColor: "{colors.navigation}"
    textColor: "{colors.copy}"
    typography: "{typography.control}"
    height: "68px"
---

# Design System: Consumit

## Overview

Watch and discovery refinement (2026-10-15): the owner chose one Consumit Server group that opens its individual Direct/Relay providers, with external players as separate named choices. Use a quiet full-width summary with a small play mark, an orange selected state and a disclosure chevron; expanded providers use compact ruled rows, and external players use wrapping 44px text controls. Manage servers keeps the full personal order across tiers. Episodic Autoplay, Auto Skip, Auto Next and Shortcuts sit immediately after the picture, before reporting and servers. Recommendations lead with their serif heading, one ruled filter bar and poster-corner Not interested actions; titles remain visible on phones. The first-visit dialog takes the supplied share/support references: centered heart mark, one orange Share Consumit action, copy, progressively disclosed social choices, separate dismissible ad-settings/feedback notifications and a full-width dismissal. Retain the existing palette, typography and shared controls; no backup-domain claims or new artwork are introduced.

Admin retains the midnight/ivory/orange world. Its desktop and tablet control room uses five internal sections: Dashboard, Providers, Test Lab, Diagnostics and Access. Keep compact sans headings, ruled evidence summaries and dense tables with contained horizontal scrolling. Orange marks the selected section and primary test action; health uses the shared semantic signals. No invented trend charts or optimistic health decoration appear. Provider and health rows lead directly to a preselected Test Lab run. Its target panel pairs common exact-title samples with catalog search and episode inputs; ruled evidence counts and filterable provider cards keep resolution results easy to scan. Source validation stays visually distinct from browser decoding and seeking. The debugger embeds the existing Consumit Player only on request. A phone-specific composition remains deferred.

Audio uses one compact, alphabetized language list with tonal selected rows and existing range controls. Merge duplicate languages across stream and separate tracks; omit provider names, upstream numbering and separate-source headings. Known regional and accessibility variants remain distinct. Loading and failed preparation stay inside the panel; a recording-length warning and Audio sync adjustment appear with the selected separate track. The video composition and control hierarchy remain unchanged.

Provider roles extend the existing Admin table with the shared Consumit dropdown and quiet capability text. No new visual theme is introduced. Player quality preferences remain separate from each source's available rendition: a known downgrade is explained inside the Quality panel, using the existing copy colors and type scale. The player header omits the fallback notice. The desired resolution stays retained for the next source.

Unified player deck — current player authority (2026-10-20; locally verified): this approved extension supersedes conflicting player-specific layout guidance below and in the earlier modernization direction. It applies only to Watch and shared player presentation. Preserve the supplied Consumit mark, signal orange, warm ink, bundled Inter and compact geometry. Desktop transport sits left; labeled Sources, Captions, Episodes and Settings sit right, followed by fullscreen. A compact Cast shortcut sits at the desktop header’s upper right; it opens the native picker when a device is available and the existing connection guidance otherwise. Phones keep stable transport and destination rows beneath the picture, with Cast available through Settings. Every destination uses the same right drawer or phone sheet. Browsing retains its existing design system. The [direction contract](docs/audits/unified-player-deck-direction-2026-10-18.md) defines scope; the [local review record](docs/audits/unified-player-deck-2026-10-18.md) records local verification and review scope; no deployment is included.

The original Consumit identity is fixed. Improve clarity, flow, accessibility, and responsiveness within these tokens and shared components; references are interaction inspiration, not permission to replace the brand.

**Creative North Star: "Cinema After Midnight"**

Consumit feels cinematic, editorial, and human: a near-black room lit by warm ivory type and rare signals of color. The interface is intimate rather than glossy, with enough quiet space for artwork, taste, and other people’s perspectives to carry emotional weight.

The system pairs decisive controls with restrained surfaces. It should feel alive with other people’s taste without becoming noisy, gamified, or generically “streaming app.” Generic dashboards and glossy-tech decoration are explicit anti-references everywhere except Home, which the pinned FilScreen world owns outright.

**Key Characteristics:**

- Near-black, flat surfaces with warm editorial contrast
- Charter display type paired with compact DejaVu Sans controls
- Square-to-gently-rounded geometry and warm-white hairlines
- Rare orange action signals with semantically reserved lilac and lime
- Visible provenance for external catalog data and visibly labeled prototype-only member signals
- Purposeful composition that becomes distinct on mobile

## Colors

The palette is a midnight neutral field with warm ivory content and three deliberately scarce signals.

### Primary

- **Signal Orange:** Brand marks, committed actions, active routes, ratings, and progress.

### Secondary

- **Social Lilac:** Taste Match, taste overlap, and social context only.

### Tertiary

- **Positive Lime:** Presence and healthy status only.
- **Quiet Danger:** Destructive actions, invalid fields, and first-party playback states blocked by the absence of a configured source.

### Neutral

- **Midnight Canvas:** The application background.
- **Navigation Black:** Stable global-shell background.
- **Quiet Surface / Raised Surface:** Tonal panel separation and selected states.
- **Player Canvas / Player Surface / Player Surface Raised:** Scoped charcoal deck, drawer/sheet and hover surfaces from the `player-*` frontmatter tokens. Apply only within native player and external-wrapper boundaries; browsing palette tokens remain authoritative elsewhere.
- **Warm Ink / Copy / Muted / Faint:** A descending hierarchy from primary content to low-emphasis decoration.
- **Separator / Control Outline:** Separators stay subtle; interactive boundaries remain independently perceptible.

### Named Rules

**The Scarce Signal Rule.** Orange communicates brand, selection, progress, or commitment; it is never ambient decoration.

**The Semantic Accent Rule.** Lilac means social or taste context, and lime means presence or health. Do not swap their jobs for variety.

**The Operational Status Rule.** Orange marks selection, commitment, and progress; Warm Copy marks checking or slow states; Positive Lime means healthy or present; Quiet Danger marks a blocked first-party task, not routine metadata absence.

## Typography

**Display Font:** Charter with Bitstream Charter and Georgia fallbacks

**Body Font:** DejaVu Sans with Arial fallback

**Character:** Charter brings film-poster warmth and editorial authority. DejaVu Sans keeps navigation, controls, and metadata compact and direct. Both shipped webfonts are self-hosted.

### Hierarchy

- **Display:** Regular, tightly tracked, and near-solid leading for hero statements and major page titles.
- **Headline:** Regular Charter for section openings and card-led editorial statements.
- **Body:** Regular DejaVu Sans with generous leading and a readable maximum line length around 68 characters.
- **Label:** Compact DejaVu Sans for metadata and controls; persistent form labels may use the established uppercase tracking. Do not turn ornamental eyebrows into a reusable pattern.
- **Control:** Medium-weight DejaVu Sans with tight leading and subtle negative tracking for direct actions.

### Named Rules

**The Two Voices Rule.** Serif type tells the story; sans-serif type helps the member act.

**Player scope:** Bundled Inter Variable owns player/wrapper interface text through `player-micro`, `player-timing`, `player-control`, `player-body`, `player-heading` and `player-title`. These roles cover compact destination labels and badges, timing, desktop destinations, panel copy, panel/search text and title context respectively. Search fields keep the heading-size minimum; phone title context uses that role too. This scoped scale does not replace browsing typography or catalog artwork logos.

## Layout

Desktop compositions use a 50px content edge and a 68px global navigation shell. The interface root is 14px, so the base unit renders at 3.5px, with the established rhythm progressing through 7, 10, 16, 21, 28, 42, and 56px. Broad editorial openings transition into structured content, often with a main column and a decision-oriented side rail.

The current catalog responds at 640px, 1024px, and 1280px. Below 1024px, the FilScreen shell uses a compact utility row with the supplied mark, Search, notifications when signed in, the profile avatar, and a navigation trigger. Personal and account destinations open in a native modal navigation sheet; catalog kind tabs remain in their own row on phones. Mobile is composed independently rather than produced by shrinking a desktop grid; controls wrap, section ownership remains obvious, and primary actions retain touch-safe height.

Home keeps its bounded backdrop masthead below the global navigation. Popular and Top rated retain horizontal discovery rails, followed by editorial selection and genre browsing. Phone portrait cards show artwork without title captions underneath; accessible link names and dedicated carousel controls retain keyboard access. Desktop titles retain their poster hover and focus treatment.

Movies, Series and Anime open with a bounded artwork masthead inside the centered content width (1260px maximum): a quiet backdrop-tile collage carries the mood behind the Charter heading with its orange full stop and a muted one-line description. The masthead is followed by the landscape rail, then a hairline filter bar — Genre, Year, and (for Anime) Format controls on the left with Reset and sort on the right — then the portrait poster grid. The grid grows from two columns below 640px to three at 640px, four at 1024px, and six at 1280px. The rail retains horizontal scrolling at every width. Below 360px, filter controls wrap to their own rows while sort stays reachable.

Authentication, onboarding, report, and Watch use purpose-specific reduced shells instead of global navigation. Reduced branded headers keep only the context needed to finish the current job, always use the supplied Consumit mark, and never synthesize the mark with styled text. Onboarding keeps semantic step progress and an optional skip action visible at every width; the mobile skip target remains at least 38px high.

Watch uses the unified deck composition documented under Playback Shell. Its container breakpoints are independent of browsing: compact destination labels below 900px, stable phone rows and sheets up to 600px, and compact short-landscape overlays at viewport heights up to 520px.

Document scrolling uses one root Lenis instance on the browser window. Wheel and trackpad input use restrained easing while touch remains browser-native. Dialogs, drawers, rails and player panels retain independent scrolling; sticky positioning stays in document flow, and in-page anchors use the same smooth scroll. Route navigation clears leftover inertia. `prefers-reduced-motion` disables easing and makes programmatic scroll immediate.

## Elevation & Depth

The interface is flat by default. Depth comes from tonal surfaces, hairline boundaries, artwork gradients, and occasional cinematic imagery—not routine control or panel shadows.

**The Flat Interface Rule.** Shadows may separate artwork, but ordinary controls and content panels remain flat.

## Shapes

Controls and panels are square to gently rounded, using a tight 3–6px range. The 5px control radius is the default interactive shape. Circles are reserved for people, presence, progress, and the recurring celestial artwork language.

## Components

### Buttons

Buttons are compact, direct, and consequence-aware.

- **Shape:** Gently squared controls with a 5px radius; default and icon controls are 38px tall.
- **Primary:** Warm ivory fill with midnight text for the confident immediate action, such as Play or View.
- **Accent:** Signal-orange fill for committed flow progression, such as Create, Continue, or Submit.
- **Secondary:** Transparent fill with a dedicated accessible control outline; never reuse the faint separator as its boundary.
- **Ghost:** Transparent, low-emphasis destinations that gain a tonal surface on hover.
- **Danger:** Muted destructive fill with warm-ivory text.
- **Hover / Active:** Short 150ms color or brightness transitions; disabled actions use reduced opacity and no pointer affordance.
- **Focus:** A two-pixel signal-orange ring with a canvas offset remains visible on every variant.
- **Loading:** Preserve the label, prepend a spinning status glyph, expose `aria-busy`, and block repeat activation. Respect reduced-motion preferences.

### Global Navigation

Global navigation is now the FilScreen shell (`FilScreenShell`): a full-page sidebar plus utility-row wayfinding surface for catalog and personal screens, not a universal header for every product flow.

- **Desktop:** Sidebar holds the supplied Consumit mark, Home, Watchlist, Likes, Watched, History, and Lists shortcuts for members and guests, theme switch, Settings, and session-aware Sign in or Log out. Each shortcut opens its existing personal archive; the utility-row avatar opens Profile. Kind tabs (New, Series, Movies, Anime) sit beside compact search and a member or neutral Guest avatar. Guest archive shortcuts open the sign-in screen with an account-creation choice, while the guest avatar opens a guest profile carrying the shared guest character with a sign-in path to the full experience; member shortcuts open their private archives. Active destinations use orange selection treatment, including nested archive routes; collapsed shortcuts retain accessible labels and icon tooltips.
- **Search:** Compact outlined trigger opens the FilScreen search overlay; Cmd/Ctrl+K and `/` are keyboard shortcuts.
- **Member presence:** The portrait is supplied by the session; the shell alone owns presentation.
- **Mobile:** Below 1024px, the sidebar becomes a labeled modal navigation sheet opened from the utility row. It starts closed on every page, contains focus, locks background scrolling, closes with its visible Close action, backdrop or Escape, and restores trigger focus. Home, all personal archives, theme, Settings and session actions stay reachable. Phone catalog tabs share an evenly spaced row below Search/profile/menu; controls have at least 44px targets and safe-area padding. Desktop retains the 76px icon rail.
- **Interaction:** Focus uses the FilScreen focus ring. Theme and sidebar collapse persist on the device; the server render stays dark so the default never flashes.
- **Footer:** Keep the footer inside the flexible content column so the sticky desktop sidebar remains beside it, including when collapsed. A flat, hairline-separated opening pairs the supplied orange mark and Charter promise, “Remember what you love.”, with DejaVu Sans links to About, Help center, Terms, Privacy, DMCA, and Catalog credits. A quieter lower row carries copyright and metadata attribution. Both rows stack on small screens and inherit the shell's dark/light colors, focus ring, and reduced-motion behavior.
- **Scope:** Exclude this shell from Watch and from the reduced authentication, onboarding, and report headers.

The retired flat 68px GlobalNavigation / SessionNavigation / ScreenShell stack and the standalone Footer component are deleted.

### Catalog Transparency

Catalog provenance and prototype honesty are persistent interface chrome, not optional campaign copy.

- **Preview-data notice:** Place one full-width, flat Surface band directly below both the global navigation and the reduced Watch header. Use centered 11px Muted Metadata text, a subtle lower hairline, and `role="note"`; keep it visible at every width.
- **Disclosure scope:** Internal component-gallery specimens name Taste Match, member activity, ratings, and progress as deterministic sample data. Live product routes use real records or empty states and never imply fixture signals came from members.
- **Catalog attribution:** Standard FilScreen pages identify movie and series metadata from TMDB and anime metadata from AniList in the footer's muted lower row, with separate external source links. Catalog credits opens the catalog-credit section of About, where the metadata scope and non-endorsement statement remain readable. Reduced-shell screens retain their existing low-emphasis TMDB attribution treatment.
- **Source labels:** Label source-specific catalog evidence in place—for example, “TMDB ratings” and TMDB recommendations—so it cannot be mistaken for Consumit member evidence.

**The Catalog Boundary Rule.** TMDB supplies title metadata and artwork only; it never supplies Taste Match, member or social evidence, progress, product actions, or playback.

**The Preview Honesty Rule.** Deterministic member-facing signals belong only in the internal component gallery and tests. Product routes show stored member data or an explicit empty state; a polished composition never makes fixture evidence pass as live activity.

### Label and Input

Labels and inputs form one quiet, native-first control contract while remaining independently composable.

- **Label:** Keep context visible above the field in 10px, 700-weight uppercase DejaVu Sans with `0.12em` tracking and Warm Copy color. The caller owns `htmlFor` / `id` association.
- **Input:** Use a native input at exactly 38px high with the shared control radius, Input Field surface, Warm Ink text, and the perceptible control outline.
- **Focus:** Keyboard focus changes the boundary to Signal Orange and adds a visible two-pixel orange ring separated from the field by the Midnight Canvas. Remove the transition for reduced motion.
- **Invalid:** `aria-invalid="true"` changes the boundary and focus ring to Quiet Danger. The caller owns validation, `aria-describedby`, and message content.
- **Read-only / Disabled:** Read-only fields move to Quiet Surface while preserving legibility. Disabled fields use the same surface with muted text, reduced opacity, and an unavailable cursor.
- **Native behavior:** Preserve caller-owned input types, values, autocomplete, and other native attributes. Normalize browser autofill to the Input Field, Warm Ink, and Signal Orange caret palette.
- **Scope:** Search adornments, password reveal, textarea, shared helper or error text, and checkbox behavior remain separate form-foundation components.

### Selection and Filters

- Tabs own horizontal overflow so narrow layouts keep one readable row without widening the page.
- Dropdowns use the shared Select listbox with a visible label, full arrow/Home/End/Enter/Escape keyboard support, and a hidden form input when they post inside a native form. The native select popup is never used: it renders OS chrome that cannot honor the palette, focus ring, or reduced-motion contract.
- Chips, segmented controls, and toggles use the dedicated control outline; faint separators are never used as interactive boundaries.
- Native radio and checkbox semantics remain intact. Controls and links keep at least a 38px target in both dimensions; compact title and action labels sit inside the larger interactive area instead of growing visually.
- Selected treatments remain legible in every pointer state: dark selections keep warm-ivory text, while ivory selections keep midnight text on hover.

### Identity and Signals

- Avatars identify people once. Decorative portraits are hidden from assistive technology when the adjacent byline already names the member.
- Use the same portrait for a member in the header, profile, archives, Settings, search and reviews. A chosen portrait takes precedence; a generated fallback uses the current public username consistently on every surface.
- A member may pick a generated portrait from random seeds or keep a geometric initials tile (dusk, dawn, noir, halo). Portrait addresses must be http(s); seeds must never be emails or other private identifiers. A portrait that fails to load falls back to initials.
- Presence, save state, status, rank, and compatibility always include explicit text for assistive technology; color and iconography only reinforce that meaning.
- Lilac is reserved for taste overlap and social affinity. Lime remains reserved for presence and healthy states.

### Media and Content Cards

- Supplied and TMDB catalog artwork leads the composition. Poster, landscape, missing-art, and editorial frames preserve deliberate aspect ratios rather than stretching media.
- When a catalog record has no artwork, keep the existing geometric missing-art state inside the requested aspect ratio with an accessible title-specific label. Do not substitute a TMDB logo, a blank rectangle, or a new placeholder style.
- Treat external titles, names, descriptions, and image URLs as untrusted variable content: contain them inside Consumit-owned typography and media frames, preserve the surrounding hierarchy, and never allow catalog content to inject markup, controls, or styling.
- Card APIs separate image, metadata, social context, progress, and action content so screens can compose the right density without duplicating card internals.
- Gradients belong to artwork legibility only; ordinary card surfaces stay flat.

### Home Composition

Two restrained editorial list rows extend the Home rails: `New from your network` uses recent public lists from followed members, and `Popular with members` uses the privacy-filtered aggregate of at least five distinct outside bookmarks. Use the shared five-cover `PosterStack`, curator line, list title, and title count. The rows disappear when no eligible list exists; do not show bookmarker identity or counts. On phones, keep the cards horizontally scrollable; wider screens show three cards across.

Shared title cards use a warm, theme-aware ellipsis disc with a 44px touch target and a small orange response on hover or focus. Its quick-action popover is a compact, flat raised surface with hairline dividers and short action rows. Keep touch rows at least 44px on phones and use tighter rows at desktop widths; let the popover flip above its card when the viewport needs room. Multi-step actions close the popover and open a separate, title-aware Consumit dialog; one-tap choices remain immediate in the menu.

Home at `/` is owned by the FilScreen world: a fullscreen edge-to-edge shell arranged as sidebar nav plus a center column where one utility row leads hero plus rails plus Continue watching. Home ships two themes from one token set, dark by default: dark returns to the Consumit room with a `#09090b` ground, a `#0b0b0e` shell, `#f4f0e8` ink, and `#ff5d38` accents; light pairs warm ivory with a paper shell, near-black ink, and burnt-orange accents. Both keep amber TMDB stars, 16–20px artwork, tabular numerals, and hairline seams. The member flips themes from the sidebar; the choice persists on the device and the server render stays dark so the default never flashes. Real TMDB backdrop, logo, and poster art leads inside the frames, with the established geometric missing-art fallback whenever artwork is absent.

The sidebar holds Home, Watchlist, Likes, Watched, History, and Lists shortcuts for members and guests, Settings, and a session-aware Sign in or Log out under the supplied Consumit mark with the CONSUMIT wordmark, which never expands on desktop: the rail stays a permanent icon column whose brand mark links home, while the wordmark and show/hide control serve the mobile strip alone; it stays pinned while the page scrolls, persists its mobile choice on the device, and collapses to horizontal scroll rows below desktop. Kind tabs (New, Series, Movies) link to their routes with `aria-current` on New. The Dune hero pairs the artwork logo or serif display title, an inline facts row (TMDB ★ rating, year, runtime or seasons, genres, content-rating badge), a serif tagline lede, byline, synopsis, and the ivory Watch action with a title-details heart inside a square-edged bounded frame. The hero rotates through up to five backdropped titles drawn from Trending now on a four-second cadence: backdrops crossfade without moving the reading position while the incoming copy arrives as one block; desktop keeps the vertical selector rail, while phones put horizontal selectors beneath a fixed-height frame and fill their orange progress from left to right. Phone slide copy enters from the left. Rotation pauses on hover, focus, offscreen, hidden tabs, and reduced motion. Each slide dresses its title in gallery-picked TMDB banner art — titled key art first, community votes deciding inside each group — instead of repeating the default catalog backdrop. Trending, Popular, Search, Watchlist, and profile title grids share the Home portrait card: poster art with title, year, and optional rating revealed over a legibility gradient on hover, an orange frame on hover or keyboard focus, and a corner Save action where saving is available. A utility row holds compact universal search, the kind tabs and a member or Guest avatar on one line. Device-local Continue watching (loading, empty, populated with resume destinations, and retry states) is a snap rail of landscape stills: cards keep consistent size and brightness while scrolling. Pointer hover and keyboard focus reveal save and details actions with a gentle 3px lift and an artwork-only 2.5% push-in; titles, time and progress stay fixed. Touch keeps actions visible, and reduced motion removes spatial movement. A shell footer carries copyright, the TMDB wordmark link, and Catalog credits to About.

For your next watch follows Continue watching as one quiet poster row. The heading and a short history-provenance line lead directly into shared portrait cards; there are no seed, type, or sort controls. Each card retains its accessible Not interested action, while Undo and Reset hidden appear only after a dismissal. The row combines catalog suggestions from recent completed watches with recency-weighted reciprocal-rank fusion, overlap across multiple watched titles, genre continuity, and gentle format/genre variety. It keeps the FilScreen tokens and shared card language, with explicit loading, empty, retry, and account-private states.

**The Home Cadence Rule.** Keep the shipped order — kind tabs, hero, Continue watching, Because you watched, existing discovery shelves — and let members control changes to their reading position.

**Display banner removal (2026-10-15).** Home, Movies/Series/Anime catalogs, title details, Watch and the owner's Profile overview compose no display advertisements, Advertisement labels or reserved banner/rectangle space. Wide detail layouts no longer retain an empty ad column. Profile backdrop artwork and optional community cards remain part of the product composition; Home omits the advertising support card.

**Pop-under advertising.** Browse surfaces (Home, catalogs, details, search, profiles, lists) load the owner-supplied publisher script with a cap of four injections per rolling 30 minutes and at least five minutes between injections per device, tracked in Consumit's local storage. Each script injection claims one pop-under; a blocked or failed load may spend a slot without showing a popup. Watch, Settings, Admin, authentication and onboarding never receive one. Privacy discloses the format, partner and frequency. This separate integration is unchanged by display banner removal.

**Desktop Home refinement (2026-10-02).** Preserve the FilScreen world. At widths of 1024px and above, the hero uses a bounded 392–588px minimum height, a 720px maximum copy column, and 32–56px inset spacing. The artwork scrim keeps the copy side dark and opens toward the image; the Charter tagline scales from 24 to 32px as a local lede treatment. Metadata and bylines recede beneath the title and tagline. Featured selectors retain their vertical progress bars and gain compact current/hover frames. The hero has no Pause / Resume button; rotation suspends while pointing at links or buttons, during keyboard focus, offscreen, in hidden tabs, and for reduced motion. Black scrim opacities are local artwork-legibility treatments rather than new palette tokens. Appearance changes in this slice are desktop-scoped; mobile design work is deferred.

**Phone Home hero refinement (2026-10-21).** The phone hero keeps the desktop's large cinematic presence at a stable 500–588px viewport-scaled frame across featured titles. Horizontal selectors beneath it fill from left to right, and incoming title copy enters from the left. This supersedes only the 360–480px Home hero bound in the 2026-10-12 phone refinement; its other guidance remains current.

### Movies and Series Browsing

- **Opening:** Each browse screen opens on a bounded artwork masthead: a quiet collage of catalog backdrops under a legibility scrim, the Movies, Series, or Anime heading in ivory Charter with its small orange full stop, and a brief muted description. Use the established global shell and control geometry; the masthead stays a bounded frame inside the content width rather than a full-bleed banner.
- **Controls:** A hairline filter bar sits between the featured rail and the grid: Genre, Year, and (for Anime) Format shared Selects on the left, with Reset and the sort Select on the right. Selects remain 38px high with the control outline, dark surface, readable selected values, and visible orange keyboard focus. Reset is a subordinate ghost action.
- **Artwork:** The landscape rail keeps title and year visible over a legibility gradient. Featured cards across Movies, Series and Anime use the same restrained shadows as Continue watching: `0 2px 6px rgba(0,0,0,0.06)` at rest and `0 6px 16px rgba(0,0,0,0.12)` on hover or keyboard focus. Scroll rails reserve space around their edges for shadow fade, lift and focus frames. The poster grid reuses the shared Home portrait title card, revealing title, year/type, and optional rating over the poster on hover or keyboard focus. Missing artwork retains the shared geometric fallback and visible title. Artwork loads lazily; reduced motion removes decorative transitions and smooth rail movement.
- **Continuation:** Loading placeholders preserve poster proportions. The result count, loading, recovery, and terminal copy remain quiet supporting information below the compact section heading or grid; Load more and Try again use the shared outlined action.

**The Browse Composition Rule.** Movies, Series and Anime pair a bounded artwork masthead with a landscape rail, a hairline filter bar, and a responsive portrait poster grid; preserve the Consumit palette, typography, global navigation, and compact geometry throughout.

### Trending Presentation

Trending is presented as portrait title rails on Home and catalog surfaces using the shared Home title card (title, year/type, and optional rating over the poster on hover or focus, with an orange frame). Rails own their own ranking presentation.

### Editorial and Social

- Section headings establish a clear editorial opening before controls or grids.
- Taste Match badges, meters, and reasons use Social Lilac consistently. Signal Orange remains the action and active-progress accent; it is not a substitute color for taste semantics.
- Social proof explains why a title matters through named people, reactions, and taste context rather than anonymous engagement totals.
- Deterministic preview reactions, activity, ratings, and progress remain visibly disclosed by the persistent preview-data notice and must not use copy that implies live freshness or verified member behavior.
- Spoilers use native disclosure behavior. Member status and reaction state remain announced independently of their visual treatment.

**The Publishing Boundary Rule.** Profile identity is public. Favorites, Ratings, Reviews, Lists, Network, Likes, Tags, and Watchlist are visible by default and independently controlled in Settings. Watched, Diary, History, active playback, resume progress, and account data stay private. Public lists require both a public list choice and a visible Lists section. Anonymous viewing trends require their own opt-in and never expose members or counts. Profile location is not collected. Circle feeds, messaging, and follow notifications remain outside the active product.

### Profile and Taste Surfaces

The profile is a cinematic member page inside the FilScreen shell. A compact banner hero carries the backdrop, avatar, Charter name, @username · Joined year meta, biography, public-section statistics, and owner editing actions.

- **Section tabs:** Overview, Activity, Watched, Diary, owner-only History, Reviews, owner-only Watchlist, Lists, Likes and Tags navigate within the `/profile/{username}` archive layout with accessible current-page state. Watchlist keeps its saved-title controls in that profile layout; the profile preview's View all action opens `/profile/{username}/watchlist`. History keeps completed watches separate from the authored Diary. Never add visitor Watchlist or History links. Favorites stay featured on the overview as the member's four defining titles.
- **Overview:** Use a journal-like two-column layout with Favorite covers, recent activity, and recent review excerpts in the main column. Recent Activity is a compact four-poster strip using the universal title card; captions add the stored watch / rewatch / review action and date, with exact episode identity when present. Do not expose title ratings here. The supporting rail holds the owner's private Watchlist preview using the same title cards, five real Diary entries, recent lists, a rating histogram derived only from stored 1–10 rating records, and a quiet taste summary derived only from available Favorite metadata. The owner can select a populated histogram bar to open the matching personal rating archive. Visitors see the distribution and a See all ratings link to the published Ratings collection; private personal archives remain owner-only. Keep the overview concise; Diary, Reviews, and Lists never repeat as full archives below it. Every View all action opens its dedicated archive. Activity merges stored diary and review records; do not fill gaps with fixture activity.
- **Member stats:** Show titles watched, diary entries, reviews, and lists. Make each statistic open its matching personal archive. Do not calculate a “this year” count from the capped recent-diary response.
- **Rating histogram:** Show actual counts grouped by rating value only when Ratings is visible. Hidden ratings and bins stay owner-only. Do not derive or imply an average if that value is not part of the product surface.
- **Favorites:** Four ordered universal title cards with equal poster proportions. Desktop shows four columns; tablet and mobile show two. Title details use the Home hover-overlay treatment, owners can remove titles from the card, and empty favorite slots remain clear add actions. Genre counts derive only from available Favorite metadata.
- **Profile archives:** Watched and Likes use the universal title card for stored titles; Watched has genre and release-date sorting, plus personal rating filters (including unrated); Diary preserves dates, exact episodic destinations, tags, and owner actions; Reviews keep poster, title destination, date, and text together; Lists retain collage covers, name search, and local sorting; visitor Tags use only source records visible to that visitor; Activity paginates watches and reviews. Filters apply to loaded titles, with pagination for older records. Disclose honest empty and partial-art states. Owners retain access to hidden sections; visitors receive no section data through direct archive routes.
- **Diary, reviews, and lists:** Keep the overview sections as previews and make View all open the corresponding archive. Missing catalog metadata preserves stored records and destinations. The owner's full list-management surface remains available at `/profile/{username}/lists`.
- **Watchlist:** Give the owner a Watchlist archive at `/profile/{username}/watchlist`, with the profile identity header and tabs kept in place. Its visitor read follows the independent Watchlist section setting; Watched and History remain private. Search, type, genre, decade, and personal-rating filters work together on loaded records; recently saved preserves server order, release-date and alphabetical sorting label only the loaded set, and pagination exposes later saves. Rating filters use the owner’s private rating records. Do not show a service filter until title availability is modeled. Keep the selected privacy state visible in the section controls.
- **Lists section:** Keep creation and management inside the owner's profile Lists tab. The archive separates Your Lists from private Saved Lists. Personal lists use editorial collection cards: five overlapping covers above the title, curator, count, description, and privacy. Local search and sort controls accompany a quiet create-list rail. The owner edits from list detail; owners manage all their lists; visitors read a list only when the list and its owner's Lists section are public.
- **Saved Titles:** Keep the personal Saved Titles shelf private. Only the authenticated owner gets a small Watchlist preview and a link to `/profile/{username}/watchlist`; never include saved records or counts in a visitor's profile response or profile archive API.

**The Profile Truth Rule.** Profile summaries show only stored member records; never pad the layout with fixture activity, reactions, or ratings.

### Title and Series Surfaces

- **Title masthead:** Make one cinematic promise with artwork, context, the official title artwork logo, score-led metadata, the tagline as lede, a maker byline, a three-line constant synopsis, and the shared ivory Watch action with Consumit's compact control corners. The detail hero uses the same bounded, square-edged composition as Home. The logo is the TMDB artwork mark (English preferred, language-free fallback); when no logo exists the serif display title takes its place, and the title stays in the heading for assistive technology either way. The byline names real directors (film) or creators (series) only; the tagline lives in the hero alone, never repeated in the overview. The masthead and dark-glass member shelf stay on Consumit's midnight palette in both light and dark themes. The shelf sits at the hero's right with Watched, Liked, and Saved toggles backed by stored records, interactive Rated stars, an Add-review row opening the watch-log dialog, a copy-link Share row, and a Your activity destination; rows without backing behavior never appear, and there is no separate rating section. Shelf toggles speak in verbs: Watch, Like, and Save at rest become Watched, Liked, and Saved on hover or when set, and hovering a set toggle reads Remove; the watched eye fills with a translucent wash so its shape survives, while heart and bookmark fill solid. Toggling plays a short scale-and-settle motion. Stars render at trio-icon scale with hover preview and a pop on the hovered star, clear by clicking the set value again with no separate clear control, and show the focus ring for keyboard focus only. The log dialog portals to the document body so the shelf glass never traps it, and commits every section to stored records with retry-safe writes. Computed taste evidence stays hidden until its backing logic is implemented.
- **Catalog identity:** TMDB-backed cards, details, seasons, episodes, and Watch actions preserve their canonical numeric catalog routes while the interface continues to show human titles rather than provider identifiers.
- **Title playback action:** The shared `TitlePlayAction` retains the detail hero's signal-orange fill, compact corners, Play icon, and existing hover/focus treatment. Its label follows saved progress: Play for an untouched title, Continue watching for a partial watch or a known next episode, and Watch again after completion when no next episode is known. Longer labels keep the same action hierarchy.
- **Catalog evidence:** Explicitly label TMDB ratings and recommendations. Keep them visually separate from the member’s personal ratings and stored records.
- **Detail priority:** Title Detail opens on Overview. Series Detail opens on Episodes and foregrounds season choice, episode state, progress, and the next available action.
- **Responsive evidence:** On narrow screens, supporting evidence follows the content it explains. Cast and related-title collections become horizontal discovery rails instead of compressed grids.
- **Member pulse:** Present the numeric rating and count accessibly; the distribution is secondary evidence and remains decorative to assistive technology.
- **Season and episode choice:** Use the shared dropdown Select with a visible label; the OS-rendered native select popup cannot be themed, so the custom listbox carries the Consumit palette, focus ring, and reduced-motion behavior instead. Each episode row gives state first, then title and evidence, then a distinct action; progress is announced independently and never replaces the action label.
- **Cast card:** Preserve the portrait ratio, identify the person once, and keep character or role subordinate to the name.
- **Shared episode card:** Series and Anime use the same Anime-derived card: landscape still, compact card corners, orange episode label, bold interface title, muted date/runtime and a two-line summary, followed by the solid orange Play episode action. The existing Anime label's 0.6875rem size and 10px artwork/airing annotations remain local exceptions to preserve the selected reference. Cards keep still artwork and flat borders on hover, with no lift, overlay play circle or external shadow. Title artwork fallbacks are labelled; upcoming episodes show their state without playback links. Exact Series season/episode and Anime canonical episode destinations remain owned by their callers.

**The Single Promise Rule.** A title masthead sells one film or series; continuation state, member evidence, and secondary actions clarify the decision without becoming rival heroes.

**The Detail Priority Rule.** Overview leads Title Detail; actionable episode state leads Series Detail. Social evidence remains supporting context at every width.

### Personal Archives and Lists

Collection previews use a shared overlapping `PosterStack` with up to five upright 2:3 covers. The leading cover stays in front; individually linked covers rise on hover or keyboard focus, and reduced motion keeps them still. Empty and incomplete collections retain honest missing-art states. Profile Watchlist previews show the latest five saved titles and explicitly indicate additional records rather than inventing a total.

Artwork uses a crisp tonal edge and restrained downward shadow. Continue watching uses a small `0 2px 6px rgba(0,0,0,0.06)` resting shadow and `0 6px 16px rgba(0,0,0,0.12)` hover/focus shadow in both themes. Series and Anime episode cards use the flat shared presentation described above. Poster images stay still during ordinary hover; information, Save actions, and a visible focus frame supply feedback. Ruled editorial section headings and compact uppercase sidebar headings establish hierarchy. Archive headers, ordered title rows, and settings groups use flat seams instead of nested panels. The global shell keeps compact controls and restrained navigation feedback; mobile catalog tabs occupy a complete row below search. Muted metadata is brighter in dark mode (`#9b968e`) and darker in light mode (`#70695d`) for readability.

The profile owns private Watched, Diary, and Watch History records, while Favorites, Ratings, Reviews, Lists, Network, Likes, Tags, and Watchlist can be hidden independently. All archives share a compact identity header, one section title, and the route tabs. Owners keep access to hidden sections; visitors receive no section data through direct archive routes. The Lists archive pairs Your Lists with private Saved Lists. A saved entry follows its original curator's edits and becomes an unavailable reference if the source is hidden or deleted.

List detail uses an editorial cover collage of real ordered titles, with curator identity, title count, description, ordered title rows and notes. Share and Save actions sit near the title and work with keyboard and touch. Public links remain useful when a visitor is signed out; saving requires sign-in. List visibility stays on each create/edit form, defaults to Public, and can be set to Private. Phone layouts retain a full-width collage and readable numbered order without a wide table.

Home may add a `Trending with members` title rail when actual qualifying data resolves. The quiet row shares the existing poster and rail language, appears only with title results, and never displays member names, viewer counts, or live status. Empty or failed trends do not reserve a gap.

Watched, Watchlist, and Diary filtering uses a quiet editorial toolbar: inline search and text-menu triggers, with active values in orange. The private rating menu has Any rating, No rating, and five stars in half-star steps: click for one rating or drag for an inclusive range. Exact ratings fill up to the chosen star; ranges highlight their selected band. Two keyboard-accessible range controls and Apply rating offer the same selection without dragging. The existing 1–10 member scale remains explicit. Failed lookups disable unavailable choices. Other filters use the shared Select toolbar variant for keyboard navigation, disabled choices, and dismissal. Reset clears search and filter choices together; applied filters show an honest count from loaded records. Decades derive from available release years, and unknown years stay visible until a decade is selected. Watchlist kind choices and poster/Shelf view controls remain compact and independently operable.

- The Watchlist owns saved-title search, type filters, sort, pagination, and removal controls. Desktop poster grids show eight columns using the Home portrait card: title, year/type, and optional catalog rating appear over the artwork on hover or keyboard focus, without a second caption underneath or a Save icon over already-saved posters. Shelf uses compact horizontal rows with visible metadata, private personal ratings, and removal controls. A compact privacy/count line precedes the controls. Missing catalog details keep saved references and destinations available, with an explicit artwork retry.
- Watched uses the same poster-only Home card, with no external caption. Only title and year/type reveal on hover or keyboard focus; ratings stay out of the cards.
- Watch History remains private at `/profile/{username}/history` and links to exact title/episode destinations with Watch again and deliberate Log to diary actions.
- Diary is a month-grouped journal with a quiet month/year rail, prominent watch-day numerals, compact portrait posters, Charter title links, release years, and rewatch markers. The owner's current title ratings and compact edit/delete controls align in separate columns; visitors receive neither. Editing and delete confirmation expand across the full row, with focus and failure recovery. Search, watched year, release decade, genre, current rating, and watch-type filters combine on loaded entries. Watch-date sorting controls month chronology; alphabetical sorting orders titles inside each month. Never imply a historical per-watch rating or add unbacked like, review, or service columns. Keep exact episodic destinations, tags, chosen dates, and pagination intact.
- Missing catalog metadata preserves records with fallback names and destinations.
- Lists and Diary retain existing ownership and privacy behavior.

**The State, Evidence, Action Rule.** Keep the stored record, its metadata, and the available action clear in every view.

### Authentication and Onboarding

- **Authentication shell:** At large widths, place reference-authored focal artwork and narrative in a dedicated story panel beside the focused form. Below desktop, remove that story panel rather than shrinking it or moving it behind the form. The shell follows the FilScreen dual theme from the member's stored preference with no toggle on auth itself; the story panel keeps a theme-aware shell scrim so headline and description stay legible over artwork in both themes. Ask only for Username, email, and password; OAuth controls are excluded. Place privacy or control language beside the decision it explains.
- **Authentication field:** Keep a persistent label, optional contextual action, native input, and a single associated helper or error line. Validation text uses Warm Copy rather than turning the entire form into an alarm.
- **Onboarding header:** Use the supplied mark, semantic step count, progress rail, and optional skip. The short mobile label may change to “Skip,” but visibility and touch-safe height do not.
- **Onboarding choices:** Import options name what moves, the expected effort, and privacy implications. Selectable titles remain native checkboxes; onboarding collects history and Favorites without social suggestions.

**The Reduced Shell Rule.** Authentication, onboarding, report, and watch flows remove unrelated global navigation while retaining exact brand identity, clear escape routes, and the context needed to finish the job.

**The Heading Carries the Story Rule.** Authentication story panels use brand, artwork, a headline, description, and optional proof; never add a kicker or eyebrow above the story headline.

### Settings and Support

- **Settings rail:** Keep member identity and durable destinations together; mark the current destination semantically and with the orange selection line.
- **Settings section:** Group preferences by human consequence. Each row pairs a plain label and consequence with one control instead of exposing implementation language.
- **Source health:** Always render a textual health label beside its dot. Healthy uses Positive Lime, slow uses Warm Copy, and unavailable uses Muted Metadata.
- **Diagnostic evidence:** Evidence upload remains an explicit native file choice with accepted formats, size guidance, and visible focus. Diagnostic consent and exact exclusions belong beside the upload or submit decision.
- **Legal documents:** Terms, Privacy, and DMCA are FilScreen pages carrying a centered Charter display title, a muted �?oLast updated�?? stamp, and one readable column of numbered Charter sections with ivory body copy. A signal-orange left rule marks the crucial notice; contact paths link in orange to the report form. The footer keeps all three reachable from every shell page.

### Playback Shell

Component 17 is UI-shell-only. TMDB may supply its title, metadata, and poster or backdrop, but never a media source. Provider ranking, health determination, entitlement checks, streaming adapters, and switching behavior remain application logic behind the provider-adapter seam.

- **Watch composition (2026-10-17):** Use a full-viewport, near-black canvas containing only the Consumit Player or configured Provider Embed. Keep the page header, title synopsis/details, episode rail, and footer off this surface. Source selection, recovery, episode browsing/navigation, Anime audio, and player preferences remain within the player controls and panels. Browser Back returns to the title page. Preserve the incumbent typography, controls, artwork-led preparation, and responsive player behavior; no new artwork or visual theme is introduced.
- **Watch header:** Inside the player boundary, keep one compact Back action, title/episode context and the supplied Consumit mark. The same context remains above the inline phone picture. Preserve intrinsic mark proportions and omit global browsing navigation.
- **Consumit Player:** Render a semantic native video surface with first-party play, seek, volume, and fullscreen controls. Do not draw a focus frame around the player surface itself; keep keyboard focus cues on actionable controls. Configured providers supply direct HLS, DASH, or native-media sources through the later adapter seam; provider frames are composed separately by Watch under ADR 0006.
- **Caption appearance and placement:** With controls visible, Consumit-rendered bottom captions overlay the space above the time/chapter row and seek rail. Captions never add height to the controls: the time, rail and transport stay fixed as captions turn on/off or change line count. Top-position captions keep their existing overlay; hidden controls use the bottom overlay. Small non-fullscreen stages retain the same minimum height with captions on or off. Captions default to bold and a warm ivory color for reliable contrast; Appearance lets viewers choose size, style, position, Classic/Charter, DejaVu Sans or Inter, and ivory, warm yellow, sky blue or mint text. Every family has Arabic-capable fallback fonts, and the preview matches live captions. Save choices on the device and apply the selected color/weight/family to the native fullscreen caption renderer when the platform supports cue styling.
- **Subtitle labels and volume:** Language groups and track names use canonical native names with isolated direction and normal tracking, including Arabic. Provider/release details remain secondary. On desktop, the volume range floats above the speaker group on hover or focus without moving adjacent actions or covering the seek rail. Phones omit the volume action in both orientations and use their system volume controls.
- **Unified control deck (2026-10-18):** Timing and timeline sit above one stable desktop row: transport left; labeled Sources, Captions, Episodes and Settings right; fullscreen last. Destinations use the frontmatter player control token and at least 44px targets; Play uses a 56px desktop and 50px phone target. In phone portrait, Play, both seek buttons and fullscreen share four equal-width control slots; menu destinations stay on their own row. Exact neighboring episode actions remain accessible icon controls in the header and are omitted when unavailable. Movies omit Episodes. Caption changes and the desktop floating volume slider never move timing, transport or adjacent destinations.
- **Skip timing and preference (2026-10-18):** Exact available intro and outro ranges appear as distinct landmarks on the seek rail: Consumit orange for intros and lilac for outros. A visible Skip intro/Skip outro action uses the matching accent. Automatic skipping starts Off unless the viewer has explicitly saved it On; the preference covers both intros and outros. Unknown timing never creates a skip affordance, and auto-skip never changes source selection or provider order.
- **Playback preparation and pause:** Keep the compact title/context in the header. During preparation, group the supplied title artwork, three restrained orange/charcoal progress strokes, and plain Preparing playback or Finding your stream status as one bottom-left stack, clear of the picture edge and safe area. The active stage animates as a short horizontal sweep and settles for reduced-motion preferences. Scale preparation artwork to 560px wide/164px high on desktop and 280px wide/76px high on phones; contain it without cropping. During pause, center the artwork vertically on the left side of the picture, with facts and short synopsis grouped directly beneath it. Phones use compact centered-left artwork/facts and omit synopsis; inline overlays end at the picture edge above the control deck. The compact Back action remains available. Missing or failed logos keep a readable text title. Paused preload and autoplay gesture recovery leave controls available; after the attached media has played, later buffering uses a compact indicator. Preparation is presentation only and never initiates provider work.
- **Phone and short landscape:** At player widths up to 600px, retain compact header context, a contained 16:9 inline picture, timing and timeline, then a stable transport/fullscreen row and a separate labeled destination row. Keep all four destinations for episodic titles even at 320px; movies omit Episodes. Actions retain at least 44px targets, a 50px Play target and 23px destination/seek icons. Hide the volume action on phones in either orientation; volume remains available on desktop and through the operating system. Use the supplied Consumit mark at 36px on phones and 48px on desktop. The sheet respects safe areas and bounds its scrolling body. Short landscape and fullscreen retain compact overlays with safe-area clearance. This replaces the older hidden-header and three-column phone compositions.
- **Unified player panels:** Sources, Captions, Episodes and Settings open as compact cards centered above the destination that was clicked, with an 8px gap and 12px viewport margins. The 380px desktop width is capped by available width; panel height is capped by the space above its trigger and `min(62dvh, 520px)`, while its body scrolls independently under a fixed header. This same anchored layout applies to desktop, portrait phone, narrow phone and short landscape. Tapping the active destination closes its card from root and nested views; another destination switches cards. Back returns to the parent view; Close or Escape restores focus, and Escape closes the panel before viewport fullscreen. Tone and fine borders supply depth without glass or ornamental shadow. Captions owns Off, language/search, upload, appearance and sync. Settings groups playback (quality, audio and adjustments), viewing (theater when surrounding content can be hidden, Cast, PiP and shortcuts), and Watch preferences; it does not duplicate Sources, Captions or Episodes. On the dedicated full-viewport Watch canvas, theater mode is already active and its toggle is omitted. Existing values, route-owned preferences and capability explanations retain their behavior. Opening panels preserves the attached video element.
- **Captions browser:** Off, search and language groups scroll independently beneath the shared fixed header. Available languages precede nonblocking availability notices and provider rediscovery, so short windows expose useful choices immediately. The tools footer retains 44px actions with 4px vertical inset. Appearance / Sync / Upload remain reachable in the tools footer. Use the same drawer or phone sheet as every other destination; there is no separate 360px subtitle-panel size. Track/tool rows retain at least 44px targets. Per-language loading and retry stay local while usable tracks remain selectable; one quiet unavailable-track notice omits server credential details. Search includes local tracks, and direction-isolated native names preserve regional distinctions.
- **Unavailable state:** When no configured direct-media source exists, keep the first-party player visible with the catalog poster or established missing-art fallback, show an explicit Quiet Danger status, disable unavailable playback controls, and pair the state with a plain-language lock explanation and a route back to the title. Never substitute a demo clip or trailer. Only a validated configured Provider Embed may follow exhausted media tiers under ADR 0006.
- **Source selector:** Use the shared fixed family tabs and keyboard-operable source action rows. Each source button exposes its selected state with `aria-pressed`; its separate favorite action retains independent state and focus. Tabs retain arrow/Home/End navigation. Audio, quality and caption-track choices use actual native radio inputs inside `PlayerRadioGroup`, with browser arrow selection and one tab stop for the selected option. Source buttons retain their separate pressed-state contract. Selected, health and detail copy stay independently understandable; empty/loading/retry states describe the configured roster without inventing choices.
- **Composition contract:** The selected source, watch-header status, player status, and active source detail update from the same application state. The no-source branch must say so consistently, and a visual selection must never disagree with the source reported as selected.

**The Player Ownership Rule.** Consumit owns the playback controls and media surface for validated direct/relay media through the existing adapter boundary. Configured Provider Embeds retain their own iframe controls under ADR 0006. Only their surrounding header, deck and Sources/Episodes panels share Consumit presentation; progress sync and automatic next episode remain explicitly unavailable.

**Provider Frame Surroundings (2026-10-18).** Keep the provider iframe mounted as the dominant viewing surface and leave its controls provider-owned. Consumit's frame chrome uses a compact brand/title header, a clear connection state, quietly grouped capability limits, and a deliberate row of Sources/Episodes/Reload/fallback/new-tab actions. Failure keeps direct recovery visible. Do not imply that document load proves playback or that Consumit can synchronize provider progress, captions or episode transitions.

Fullscreen prefers the complete Consumit player. When iOS offers native video fullscreen, enter that true fullscreen surface and show the selected subtitle file through the native caption renderer, retaining its sync offset. iOS supplies controls and caption appearance there; exit returns to Consumit's styled overlay. Do not substitute viewport expansion for an available native fullscreen API. A refused native request keeps inline playback with retry guidance. Browsers without either API retain the viewport fallback and its page/focus restoration.

**The Synchronized Watch State Rule.** Source selection, watch status, player status, and active detail always describe the same application state, including the explicit absence of any configured source.

### Global Finish

- **Empty state:** Name the quiet condition, explain what will appear or change, and offer one relevant next action when recovery is possible.
- **Loading state:** Announce the affected content through a status role, keep placeholders subordinate, and stop spinners and pulses when reduced motion is requested.
- **Error state:** Name what failed, protect the member’s understanding of what remains safe, add useful diagnostic detail, and provide a direct recovery action.
- **Shell footer:** The FilScreen shell ends pages with copyright, TMDB and AniList attribution, Catalog credits, About, Help center, Terms, Privacy, and DMCA; keep every link touch-safe and keyboard-visible.
- **Catalog credit:** Keep the quiet TMDB attribution reachable from the shell footer on every application page, including reduced Watch.

**The Honest Recovery Rule.** Empty, loading, and error states name the affected content, its impact, and the next available recovery without implying data loss that did not occur.

## Do's and Don'ts

### Do:

- **Do** use the supplied brand and artwork assets instead of recreating them with generic icons.
- **Do** keep ivory as the shared primary action and orange for committed progression and cinematic Watch actions.
- **Do** preserve visible keyboard focus, 38px targets for compact controls and links, and readable metadata contrast.
- **Do** finish each shared component and its states before composing the next screen.
- **Do** keep Home’s section order and responsive discovery rails specific to Home.
- **Do** keep playback selection, header status, player status, and active source detail synchronized from one application state.
- **Do** explain empty, loading, and error states in terms of member impact and the next useful recovery.
- **Do** keep the preview-data notice directly below global and Watch headers, and keep TMDB attribution and About credits globally reachable.
- **Do** label TMDB-derived evidence and preserve the established geometric fallback whenever its artwork is missing.

### Don't:

- **Don't** spread artwork gradients, poster shadows, or the detail member shelf's glass treatment into routine controls and panels.
- **Don't** use orange, lilac, or lime as interchangeable decoration.
- **Don't** reduce every surface to a rounded card grid.
- **Don't** treat mobile as a scaled-down desktop composition.
- **Don't** reuse Home’s editorial cadence as a universal page template.
- **Don't** synthesize the Consumit mark with styled text in reduced branded headers or hide onboarding skip on mobile.
- **Don't** present deterministic Taste Match, member activity, ratings, reviews, or progress as live member data.
- **Don't** let TMDB attribution imply endorsement or treat catalog metadata and artwork as permission to play a title.
- **Don't** put provider ranking, health, entitlement, streaming-adapter, or switching logic inside Component 17, and keep provider frames outside Component 17; Watch composes them through ProviderFrame under ADR 0006.

The Watch player header remains visible in inline and fullscreen use: 22px desktop title, 18px phone title, compact metadata, episode context and the supplied Consumit mark. Anime shows its name and episode identity in the same header; long names truncate without resizing. Preparation keeps this compact context and may also show the supplied title artwork prominently at lower left. Pause returns the title artwork, facts and synopsis to the upper left on desktop, with a compact phone treatment.

Player refinements (2026-10-09): retain the active Consumit Player surfaces. Subtitle aliases occupy one language row with preserved regional distinctions. Quality controls show familiar standard tiers, with exact decoded dimensions as subordinate diagnostic text. Skip intro uses the existing compact action only during an exact available range, including paused playback; unknown timing has no visible fallback. Anime browse retains its catalog composition without display banner placements.

### Public profiles and People

Extend the incumbent Cinema After Midnight world with the same cinematic profile masthead, serif display scale, shared Avatar, Tabs, favorites shelf, controls and Share action. Keep the owner overview and editing affordances. Visitor navigation omits Activity, Watched, Diary, and History; Favorites, Ratings, Reviews, Lists, Network, Likes, Tags, and Watchlist follow their section controls. Follow/Following gives a clear busy state and retryable inline failure; guests get a sign-in link returning to that profile. Hiding Network affects visitor counts and archive access, while the owner retains their relationships.

People search uses editorial member rows: shared avatar, display name, username, profile destination and follow control. Keep the global 200 ms debounce, cancel stale requests, and keyboard navigation. On the full Search page, retain loading, three-character guidance, empty, retry and load-more states. Settings explains the full publishing boundary beside Public/Private; list editors carry a separate visibility choice. Desktop and mobile preserve the existing tokens and shared components.

Network tab (2026-10-09, refined 2026-10-12): the separate Followers and Following profile tabs merge into one Network tab. Network uses the compact shared archive identity header, with one Network heading and the owner Edit profile or visitor Follow action. Counted Followers/Following tabs sit directly above the existing member rows and honest empty/retry states, retaining a shareable view query. The selected profile section remains visible within horizontally scrolling navigation on phones. This supersedes the earlier two-tab rule; the profile masthead's follower/following stat links open the matching Network views.


Phone refinement (2026-10-12): retain the current palette, fonts and Consumit Player. Below 640px, the Home hero is bounded to 360–480px according to the viewport, with actions across the lower edge and featured selectors in a horizontal row beneath it. Search fills the dynamic viewport with a visible Close action, separate scope/query rows, independent result scrolling and contained keyboard focus. Inputs use 16px text to avoid mobile focus zoom. Shared touch buttons, options and filter chips have 44px targets. Select popups stay inside viewport edges and open above low triggers when appropriate. Touch phones rate with ten explicit numbered radio choices rather than narrow half-star targets; selection and clear-on-reselection retain the original semantics.


### Anime Watch audio placement

Anime SUB/DUB remains route-owned inside the player. In Settings, surface the Anime audio label and compact selector at the top of Playback with a short Original audio or English dub explanation so the choice is visible immediately after opening Settings. Keep it out of Watch preferences and outside the title/synopsis area. External players keep their wrapper-supplied audio preference; the provider frame owns actual track selection. Unsupported native toggles remain hidden for external playback. This placement supersedes the older below-picture preference row and the earlier Watch preferences placement.


### Complete player refinement — 2026-10-16

Historical complete-player guidance: the unified deck authority above supersedes this entry wherever its player composition conflicts. Retain the established theater mode, fullscreen control lock, source recovery and progress ownership. Episodes uses the shared right drawer or phone sheet with compact landscape rows, orange current selection, search and paging. Video continues while panels are open; viewing options remain in Settings.

Theater mode uses the existing Watch width and hides adjacent supporting material until exit. Fullscreen Lock controls hides interactive chrome while retaining a clear 44px Unlock action and captions. Restore focus to the opening control when dismissing a panel. Source recovery, progress notices and next-episode actions use quiet existing surfaces inside the player boundary. Progress-sync notices use a clear two-line hierarchy and a 44px dismiss target; dismissing the notice does not affect local progress.

The light browsing refinement preserves Home's hero/section order and title-detail layouts. Hero actions receive reliable dark contrast over bright artwork; long synopsis text is bounded. Continue watching allows two-line titles and wraps episode/time metadata. Title-detail playback actions gain a quiet separator and touch-safe spacing. No new visual identity or artwork is introduced.
