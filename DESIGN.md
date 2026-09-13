---
name: Consumit
description: A cinematic, editorial interface for streaming and social taste.
colors:
  canvas: "#09090b"
  navigation: "#0b0b0e"
  surface: "#121216"
  surface-raised: "#19191e"
  field: "#0d0d10"
  ink: "#f4f0e8"
  copy: "#c9c4bc"
  muted: "#85817c"
  faint: "#67645f"
  signal-orange: "#ff5d38"
  social-lilac: "#a79cff"
  positive-lime: "#b8d86d"
  danger: "#b76d66"
  separator: "rgba(255, 255, 255, 0.10)"
  control-outline: "rgba(244, 240, 232, 0.40)"
typography:
  root: "14px"
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

The original Consumit identity is fixed. Improve clarity, flow, accessibility, and responsiveness within these tokens and shared components; references are interaction inspiration, not permission to replace the brand.

**Creative North Star: "Cinema After Midnight"**

Consumit feels cinematic, editorial, and human: a near-black room lit by warm ivory type and rare signals of color. The interface is intimate rather than glossy, with enough quiet space for artwork, taste, and other people’s perspectives to carry emotional weight.

The system pairs decisive controls with restrained surfaces. It should feel alive with other people’s taste without becoming noisy, gamified, or generically “streaming app.” Generic dashboards and glossy-tech decoration are explicit anti-references.

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

## Layout

Desktop compositions use a 50px content edge and a 68px global navigation shell. The interface root is 14px, so the base unit renders at 3.5px, with the established rhythm progressing through 7, 10, 16, 21, 28, 42, and 56px. Broad editorial openings transition into structured content, often with a main column and a decision-oriented side rail.

The current catalog responds at 640px, 1024px, and 1280px. Below 1024px, global navigation becomes a separate 52px bar containing the supplied brand lockup, a guest Sign in action, and a 38px menu trigger; routes, search, and the member profile move into the drawer. Mobile is composed independently rather than produced by shrinking a desktop grid; controls wrap, section ownership remains obvious, and primary actions retain touch-safe height.

Home keeps its bounded backdrop masthead below the global navigation. Popular and Top rated retain horizontal discovery rails, followed by editorial selection and genre browsing. Persistent poster captions and dedicated carousel controls improve scanning and keyboard access.

Movies and Series use a compact opening within a centered content width (1260px maximum), followed by a landscape rail and a portrait grid. The grid grows from two columns below 640px to three at 640px, four at 1024px, and six at 1280px. The rail retains horizontal scrolling at every width. Below 360px, Genre spans a full control row above Year and sort; wider mobile layouts fit all three controls in one row.

Authentication, onboarding, report, and Watch use purpose-specific reduced shells instead of global navigation. Reduced branded headers keep only the context needed to finish the current job, always use the supplied Consumit mark, and never synthesize the mark with styled text. Onboarding keeps semantic step progress and an optional skip action visible at every width; the mobile skip target remains at least 38px high.

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
- **Follow relationship:** On discovery surfaces, “Follow” uses the warm-ivory primary treatment. Once active, “Following” steps back to the dark outlined secondary treatment and exposes the state with `aria-pressed`.

### Global Navigation

Global navigation is the stable wayfinding shell for catalog and social surfaces, not a universal header for every product flow.

- **Desktop:** Use a 68px flat Navigation Black shell with the exact supplied mark, Home / Movies / Series / Friends, a universal outlined search field, and the supplied member portrait. The active route receives a thin signal-orange baseline.
- **Search:** Submit a GET query named `q`. The destination, initial value, and placeholder may change through the component API, but the field remains a 38px outlined global search rather than a filled or pill-shaped control.
- **Member presence:** The portrait is supplied by the caller; the component alone owns the optional Positive Lime presence dot and keeps its visible and announced online state synchronized.
- **Mobile:** Below 1024px, keep the brand, guest Sign in action, and a 38px menu trigger in the 52px bar. The trigger opens a full-height, flat right-side dialog containing search, the primary routes, and the member profile; do not add standalone search or profile shortcuts to the bar.
- **API:** `activeHref` owns current-route presentation, while `items` defaults to Home / Movies / Series / Friends. Brand, search, and profile destinations and content may be overridden without changing the shell anatomy; `sticky` changes positioning only.
- **Interaction:** Routes use visible inset two-pixel orange focus rings. The dialog traps focus, closes on Escape, and returns focus to its trigger. Keep state changes brief and disable decorative transitions when reduced motion is requested.
- **Scope:** Exclude this shell from Watch and from the reduced authentication, onboarding, and report headers.

### Catalog Transparency

Catalog provenance and prototype honesty are persistent interface chrome, not optional campaign copy.

- **Preview-data notice:** Place one full-width, flat Surface band directly below both the global navigation and the reduced Watch header. Use centered 11px Muted Metadata text, a subtle lower hairline, and `role="note"`; keep it visible at every width.
- **Disclosure scope:** Internal component-gallery specimens name Taste Match, member activity, ratings, and progress as deterministic sample data. Live product routes use real records or empty states and never imply fixture signals came from members.
- **Catalog attribution:** Keep the low-emphasis TMDB attribution band at the application boundary on standard and reduced-shell screens. Link the TMDB wordmark to TMDB and “Catalog credits” to About, where the metadata scope and non-endorsement statement remain readable.
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
- Chips, segmented controls, toggles, and issue selectors use the dedicated control outline; faint separators are never used as interactive boundaries.
- Native radio and checkbox semantics remain intact. Controls and links keep at least a 38px target in both dimensions; compact title and action labels sit inside the larger interactive area instead of growing visually.
- Selected treatments remain legible in every pointer state: dark selections keep warm-ivory text, while ivory selections keep midnight text on hover.

### Identity and Signals

- Avatars identify people once. Decorative portraits are hidden from assistive technology when the adjacent byline already names the member.
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

Home at `/` follows the shipped live-catalog sequence: featured hero; Popular now; Top rated; editorial selection; Browse by genre; footer. The bounded hero remains below the original flat navigation. Official title artwork or a Charter fallback leads, with catalog metadata, tagline, maker byline, synopsis, and the existing Watch / More info actions.

The shared spotlight uses an eight-second cadence and a 300ms opacity crossfade. It has a visible Pause/Start control before slide content in the keyboard order. Hover pauses rotation; focus entering the slide or choosing a title stops it until explicitly restarted. Offscreen content, hidden browser tabs, and reduced-motion preferences also suspend rotation. The original vertical progress rail remains on desktop; mobile puts the same controls in a separate row below the hero. Selector hit areas are 44px. Hidden slides are inert.

Poster captions and year/rating metadata remain visible. Bookmark actions are available on hover, focus, and touch. No page-load movement, camera drift, blur transitions, or poster tilting is added.

**The Home Cadence Rule.** Keep the shipped catalog order and let members control changes to their reading position. Follow the [WAI carousel guidance](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/) for interaction behavior.

### Movies and Series Browsing

- **Opening:** Keep the Movies or Series heading in ivory Charter with its small orange full stop, a brief muted description, and compact native genre, year, and sort controls. Use the established global shell and control geometry.
- **Controls:** Native selects remain 38px high with the control outline, dark surface, readable selected values, and visible orange keyboard focus. Reset is a subordinate ghost action.
- **Artwork:** The landscape rail keeps title and year visible over a legibility gradient. Poster captions stay visible below artwork; hover, keyboard focus, and touch also reveal the artwork overlay. Missing artwork retains the shared geometric fallback and visible title. Artwork loads lazily; reduced motion removes decorative transitions and smooth rail movement.
- **Continuation:** Loading placeholders preserve poster proportions. The result count, loading, recovery, and terminal copy remain quiet supporting information below the compact section heading or grid; Load more and Try again use the shared outlined action.

**The Browse Composition Rule.** Movies and Series pair a compact editorial opening with a landscape rail and responsive poster grid; preserve the Consumit palette, typography, global navigation, and compact geometry throughout.

### Trending Card

This pattern remains an internal gallery component; it is not a current Home section.

- **Signature:** Place the oversized serif rank vertically centered behind and to the left of the poster. Keep the numeral a quiet warm-ivory silhouette with the artwork rather than a competing badge.
- **Evidence:** Keep the member score on the artwork and completion proof below the title; rank, rating, and completion remain separately understandable. Catalog rails add a one-line score meta (★ rating · year · kind) below trending titles.
- **Responsive behavior:** Trending remains a horizontal discovery rail on narrow screens and resolves to the five-card desktop row at the established wide breakpoint.

**The Rank Behind the Poster Rule.** A Trending Card’s oversized rank sits behind the poster at its vertical center; never float it above the artwork or reduce it to an ordinary corner badge.

### Editorial and Social

- Section headings establish a clear editorial opening before controls or grids.
- Taste Match badges, meters, and reasons use Social Lilac consistently. Signal Orange remains the action and active-progress accent; it is not a substitute color for taste semantics.
- Social proof explains why a title matters through named people, reactions, and taste context rather than anonymous engagement totals.
- Deterministic preview reactions, activity, ratings, and progress remain visibly disclosed by the persistent preview-data notice and must not use copy that implies live freshness or verified member behavior.
- Spoilers use native disclosure behavior. Member status and reaction state remain announced independently of their visual treatment.

**The Social Boundary Rule.** Follow and Circle support asynchronous discovery; direct or private member messaging is not part of the product.

### Profile and Taste Surfaces

The profile preserves Consumit's original masthead: a bounded backdrop, flat composition, Charter name, avatar, biography, and factual history counts. The masthead expands for long names or biographies; owner actions wrap rather than overlap content.

Six ordered Favorites use equal size, opacity, and contrast. Desktop shows six columns; tablet and mobile show three. Every cover and caption leads to the title, with one keyboard stop and a visible focus outline. Controls inside a card remain independently usable.

Profile section links are native anchors. The selected location follows the URL hash, including browser Back and Forward. Favorites, diary, reviews, and lists retain their existing owner editors and stored data. Genre counts are derived only from available Favorite metadata.

Diary and authored reviews share two columns on desktop and stack on mobile. Reviews keep the poster, title destination, date, and full text together. Missing catalog metadata preserves stored records and destinations. Empty and private states make no claims of activity that has not happened.

### Title and Series Surfaces

- **Title masthead:** Make one cinematic promise with artwork, context, the official title artwork logo, score-led metadata, the tagline as lede, a maker byline, a three-line constant synopsis, and the shared ivory Watch action with Consumit's compact control corners. The detail hero uses the same bounded, square-edged composition as Home. The logo is the TMDB artwork mark (English preferred, language-free fallback); when no logo exists the serif display title takes its place, and the title stays in the heading for assistive technology either way. The byline names real directors (film) or creators (series) only; the tagline lives in the hero alone, never repeated in the overview. A dark-glass member shelf tops the hero's right column with Watched, Liked, and Saved toggles backed by stored records, interactive Rated stars, an Add-review row opening the watch-log dialog, a copy-link Share row, and a Your activity destination; rows without backing behavior never appear, and there is no separate rating section. Shelf toggles speak in verbs: Watch, Like, and Save at rest become Watched, Liked, and Saved on hover or when set, and hovering a set toggle reads Remove; the watched eye fills with a translucent wash so its shape survives, while heart and bookmark fill solid. Toggling plays a short scale-and-settle motion. Stars render at trio-icon scale with hover preview and a pop on the hovered star, clear by clicking the set value again with no separate clear control, and show the focus ring for keyboard focus only. The log dialog portals to the document body so the shelf glass never traps it, and commits every section to stored records with retry-safe writes. Taste match and named social proof support that promise without competing with it.
- **Catalog identity:** TMDB-backed cards, details, seasons, episodes, and Watch actions preserve their canonical numeric catalog routes while the interface continues to show human titles rather than provider identifiers.
- **Catalog evidence:** Explicitly label TMDB ratings and recommendations. Keep them visually separate from the sample member or Circle evidence governed by the preview-data notice.
- **Detail priority:** Title Detail opens on Overview. Series Detail opens on Episodes and foregrounds season choice, episode state, progress, and the next available action.
- **Responsive evidence:** On narrow screens, supporting evidence follows the content it explains. Cast and related-title collections become horizontal discovery rails instead of compressed grids.
- **Member pulse:** Present the numeric rating and count accessibly; the distribution is secondary evidence and remains decorative to assistive technology.
- **Season and episode choice:** Use a native season select with a visible label. Each episode row gives state first, then title and evidence, then a distinct action; progress is announced independently and never replaces the action label.
- **Cast card:** Preserve the portrait ratio, identify the person once, and keep character or role subordinate to the name.

**The Single Promise Rule.** A title masthead sells one film or series; continuation state, member evidence, and secondary actions clarify the decision without becoming rival heroes.

**The Detail Priority Rule.** Overview leads Title Detail; actionable episode state leads Series Detail. Social evidence remains supporting context at every width.

### Library and List Surfaces

Library retains Consumit's typography, palette, compact corners, and flat controls. A small selection of saved covers introduces the page; a quiet ledge in the existing surface tokens makes the shelf recognizable without turning the whole interface into a cabinet.

- Shelves, Grid, and List are distinct views of the same saved records. Shelf ledges sit directly below cover artwork; captions remain below the ledge.
- Local search and movie/series filters work together. Clear filters recovers from zero matches. An empty library offers Explore movies.
- Native radio semantics identify the selected view. Search has an accessible label, visible focus, and a readable placeholder.
- The section index labels the chronological records as Watch diary, matching the data and count.
- Covers and captions share a title destination while Save remains an independent control.
- Missing catalog metadata preserves records with fallback names and destinations.
- Lists and Diary retain existing ownership and privacy behavior.

**The State, Evidence, Action Rule.** Keep the stored record, its metadata, and the available action clear in every view.

### Authentication and Onboarding

- **Authentication shell:** At large widths, place reference-authored focal artwork and narrative in a dedicated story panel beside the focused form. Below desktop, remove that story panel rather than shrinking it or moving it behind the form. Keep the shell's dark artwork overlay as the safe default; a caller may weaken or remove it only when supplied artwork already preserves content legibility. Ask only for Username, email, and password; OAuth controls are excluded. Place privacy or control language beside the decision it explains.
- **Authentication field:** Keep a persistent label, optional contextual action, native input, and a single associated helper or error line. Validation text uses Warm Copy rather than turning the entire form into an alarm.
- **Onboarding header:** Use the supplied mark, semantic step count, progress rail, and optional skip. The short mobile label may change to “Skip,” but visibility and touch-safe height do not.
- **Onboarding choices:** Import options name what moves, the expected effort, and privacy implications. Selectable titles remain native checkboxes; member suggestions explain overlap and taste before asking for a follow. “Follow” uses the confident ivory primary treatment; “Following” steps back to the outlined secondary treatment.

**The Reduced Shell Rule.** Authentication, onboarding, report, and watch flows remove unrelated global navigation while retaining exact brand identity, clear escape routes, and the context needed to finish the job.

**The Heading Carries the Story Rule.** Authentication story panels use brand, artwork, a headline, description, and optional proof; never add a kicker or eyebrow above the story headline.

### Settings and Support

- **Settings rail:** Keep member identity and durable destinations together; mark the current destination semantically and with the orange selection line.
- **Settings section:** Group preferences by human consequence. Each row pairs a plain label and consequence with one control instead of exposing implementation language.
- **Source health:** Always render a textual health label beside its dot. Healthy uses Positive Lime, slow uses Warm Copy, and unavailable uses Muted Metadata.
- **Diagnostic evidence:** Evidence upload remains an explicit native file choice with accepted formats, size guidance, and visible focus. Diagnostic consent and exact exclusions belong beside the upload or submit decision.

### Playback Shell

Component 17 is UI-shell-only. TMDB may supply its title, metadata, and poster or backdrop, but never a media source. Provider ranking, health determination, entitlement checks, streaming adapters, and switching behavior remain application logic behind the provider-adapter seam.

- **Watch header:** Use the supplied Consumit mark, back destination, title context, active source status, and an explicit exit. Do not restore global navigation inside watch.
- **Consumit Player:** Render a semantic native video surface with first-party play, seek, volume, and fullscreen controls. Configured providers supply direct HLS, DASH, or native-media sources through the later adapter seam; iframe and embed surfaces are excluded.
- **Unavailable state:** When no configured direct-media source exists, keep the first-party player visible with the catalog poster or established missing-art fallback, show an explicit Quiet Danger status, disable unavailable playback controls, and pair the state with a plain-language lock explanation and a route back to the title. Never substitute a demo clip, trailer, iframe, or embed.
- **Source selector:** Render controlled native radio rows only when configured sources exist. The radio owns keyboard focus, the containing row exposes that focus visibly, and selected, health, and detail text remain independently understandable; do not render an empty or invented source list.
- **Composition contract:** The selected source, watch-header status, player status, and active source detail update from the same application state. The no-source branch must say so consistently, and a visual selection must never disagree with the source reported as selected.

**The Player Ownership Rule.** Consumit owns the playback controls and media surface; configured providers may supply direct media through an adapter boundary, while TMDB supplies metadata and artwork only. Neither replaces the interface with an embed.

**The Synchronized Watch State Rule.** Source selection, watch status, player status, and active detail always describe the same application state, including the explicit absence of any configured source.

### Global Finish

- **Empty state:** Name the quiet condition, explain what will appear or change, and offer one relevant next action when recovery is possible.
- **Loading state:** Announce the affected content through a status role, keep placeholders subordinate, and stop spinners and pulses when reduced motion is requested.
- **Error state:** Name what failed, protect the member’s understanding of what remains safe, add useful diagnostic detail, and provide a direct recovery action.
- **Footer:** End standard pages with the supplied Consumit mark and wordmark, support and legal destinations, and copyright; keep every link touch-safe and keyboard-visible.
- **Catalog credit:** End every application page, including reduced Watch, with the quiet TMDB attribution band and its direct path to About catalog credits.

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
- **Don't** put provider ranking, health, entitlement, streaming-adapter, or switching logic inside Component 17, and don't introduce iframe or embed playback.
