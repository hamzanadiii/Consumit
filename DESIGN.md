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
  danger: "#8e5450"
  separator: "rgba(255, 255, 255, 0.10)"
  control-outline: "rgba(244, 240, 232, 0.40)"
typography:
  display:
    fontFamily: "Charter, 'Bitstream Charter', Georgia, serif"
    fontSize: "clamp(2.75rem, 7vw, 5.5rem)"
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
  micro: "4px"
  control: "6px"
  card: "8px"
spacing:
  base: "4px"
  compact: "8px"
  small: "12px"
  medium: "18px"
  control: "24px"
  section: "32px"
  large: "48px"
  hero: "64px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-accent:
    backgroundColor: "{colors.signal-orange}"
    textColor: "{colors.canvas}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.copy}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  global-navigation:
    backgroundColor: "{colors.navigation}"
    textColor: "{colors.copy}"
    typography: "{typography.control}"
    height: "84px"
---

# Design System: Consumit

## Overview

**Creative North Star: "Cinema After Midnight"**

Consumit feels cinematic, editorial, and human: a near-black room lit by warm ivory type and rare signals of color. The interface is intimate rather than glossy, with enough quiet space for artwork, taste, and other people’s perspectives to carry emotional weight.

The system pairs decisive controls with restrained surfaces. It should feel alive with other people’s taste without becoming noisy, gamified, or generically “streaming app.” Generic dashboards and glossy-tech decoration are explicit anti-references.

**Key Characteristics:**

- Near-black, flat surfaces with warm editorial contrast
- Charter display type paired with compact DejaVu Sans controls
- Square-to-gently-rounded geometry and warm-white hairlines
- Rare orange action signals with semantically reserved lilac and lime
- Purposeful composition that becomes distinct on mobile

## Colors

The palette is a midnight neutral field with warm ivory content and three deliberately scarce signals.

### Primary

- **Signal Orange:** Brand marks, committed actions, active routes, ratings, and progress.

### Secondary

- **Social Lilac:** Taste overlap and social context only.

### Tertiary

- **Positive Lime:** Presence and healthy status only.
- **Quiet Danger:** Destructive actions without alarmist saturation.

### Neutral

- **Midnight Canvas:** The application background.
- **Navigation Black:** Stable global-shell background.
- **Quiet Surface / Raised Surface:** Tonal panel separation and selected states.
- **Warm Ink / Copy / Muted / Faint:** A descending hierarchy from primary content to low-emphasis decoration.
- **Separator / Control Outline:** Separators stay subtle; interactive boundaries remain independently perceptible.

### Named Rules

**The Scarce Signal Rule.** Orange communicates brand, selection, progress, or commitment; it is never ambient decoration.

**The Semantic Accent Rule.** Lilac means social or taste context, and lime means presence or health. Do not swap their jobs for variety.

**The Operational Status Rule.** Orange marks selection, commitment, and progress; Warm Copy marks checking or slow states; Positive Lime means healthy or present.

## Typography

**Display Font:** Charter with Bitstream Charter and Georgia fallbacks

**Body Font:** DejaVu Sans with Arial fallback

**Character:** Charter brings film-poster warmth and editorial authority. DejaVu Sans keeps navigation, controls, and metadata compact and direct. Both shipped webfonts are self-hosted.

### Hierarchy

- **Display:** Regular, tightly tracked, and near-solid leading for hero statements and major page titles.
- **Headline:** Regular Charter for section openings and card-led editorial statements.
- **Body:** Regular DejaVu Sans with generous leading and a readable maximum line length around 68 characters.
- **Label:** Compact uppercase DejaVu Sans with wide tracking for roles, categories, and state names.
- **Control:** Medium-weight DejaVu Sans with tight leading and subtle negative tracking for direct actions.

### Named Rules

**The Two Voices Rule.** Serif type tells the story; sans-serif type helps the member act.

## Layout

Desktop compositions use a 62px content edge and an 84px global navigation shell. The base unit is 4px, with the established rhythm progressing through 8, 12, 18, 24, 32, 48, and 64px. Broad editorial openings transition into structured content, often with a main column and a decision-oriented side rail.

The current catalog responds at 640px and 1024px. Below 1024px, global navigation becomes a separate 64px bar containing only the supplied brand lockup and a 44px menu trigger; routes, search, and the member profile move into the drawer. Mobile is composed independently rather than produced by shrinking a desktop grid; controls wrap, section ownership remains obvious, and primary actions retain touch-safe height.

On Home, poster-led circle and trending collections become horizontal discovery rails on narrow screens. Continue-watching cards, the editorial feature, curated lists, and the mood action stack instead, preserving a readable sequence and full-width actions without compressing their content.

Authentication, onboarding, report, and Watch use purpose-specific reduced shells instead of global navigation. Reduced branded headers keep only the context needed to finish the current job, always use the supplied Consumit mark, and never synthesize the mark with styled text. Onboarding keeps semantic step progress and an optional skip action visible at every width; the mobile skip target remains at least 44px high.

## Elevation & Depth

The interface is flat by default. Depth comes from tonal surfaces, hairline boundaries, artwork gradients, and occasional cinematic imagery—not routine control or panel shadows.

**The Flat Interface Rule.** Shadows may separate artwork, but ordinary controls and content panels remain flat.

## Shapes

Controls and panels are square to gently rounded, using a tight 4–8px range. The 6px control radius is the default interactive shape. Circles are reserved for people, presence, progress, and the recurring celestial artwork language.

## Components

### Buttons

Buttons are compact, direct, and consequence-aware.

- **Shape:** Gently squared controls with a 6px radius; default and icon controls are 44px tall.
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

- **Desktop:** Use an 84px flat Navigation Black shell with the exact supplied mark, Home / Movies / Series / Friends, a universal outlined search field, and the supplied member portrait. The active route receives a thin signal-orange baseline.
- **Search:** Submit a GET query named `q`. The destination, initial value, and placeholder may change through the component API, but the field remains a 44px outlined global search rather than a filled or pill-shaped control.
- **Member presence:** The portrait is supplied by the caller; the component alone owns the optional Positive Lime presence dot and keeps its visible and announced online state synchronized.
- **Mobile:** Below 1024px, keep only the brand and a 44px menu trigger in the 64px bar. The trigger opens a full-height, flat right-side dialog containing search, the primary routes, and the member profile; do not add standalone search or profile shortcuts to the bar.
- **API:** `activeHref` owns current-route presentation, while `items` defaults to Home / Movies / Series / Friends. Brand, search, and profile destinations and content may be overridden without changing the shell anatomy; `sticky` changes positioning only.
- **Interaction:** Routes use visible inset two-pixel orange focus rings. The dialog traps focus, closes on Escape, and returns focus to its trigger. Keep state changes brief and disable decorative transitions when reduced motion is requested.
- **Scope:** Exclude this shell from Watch and from the reduced authentication, onboarding, and report headers.

### Label and Input

Labels and inputs form one quiet, native-first control contract while remaining independently composable.

- **Label:** Keep context visible above the field in 12px, 700-weight uppercase DejaVu Sans with `0.12em` tracking and Warm Copy color. The caller owns `htmlFor` / `id` association.
- **Input:** Use a native input at exactly 52px high with the 6px control radius, Input Field surface, Warm Ink text, and the perceptible control outline.
- **Focus:** Keyboard focus changes the boundary to Signal Orange and adds a visible two-pixel orange ring separated from the field by the Midnight Canvas. Remove the transition for reduced motion.
- **Invalid:** `aria-invalid="true"` changes the boundary and focus ring to Quiet Danger. The caller owns validation, `aria-describedby`, and message content.
- **Read-only / Disabled:** Read-only fields move to Quiet Surface while preserving legibility. Disabled fields use the same surface with muted text, reduced opacity, and an unavailable cursor.
- **Native behavior:** Preserve caller-owned input types, values, autocomplete, and other native attributes. Normalize browser autofill to the Input Field, Warm Ink, and Signal Orange caret palette.
- **Scope:** Search adornments, password reveal, textarea, shared helper or error text, and checkbox behavior remain separate form-foundation components.

### Selection and Filters

- Tabs own horizontal overflow so narrow layouts keep one readable row without widening the page.
- Chips, segmented controls, toggles, and issue selectors use the dedicated control outline; faint separators are never used as interactive boundaries.
- Native radio and checkbox semantics remain intact. Controls and links keep at least a 44px target in both dimensions; compact title and action labels sit inside the larger interactive area instead of growing visually.
- Selected treatments remain legible in every pointer state: dark selections keep warm-ivory text, while ivory selections keep midnight text on hover.

### Identity and Signals

- Avatars identify people once. Decorative portraits are hidden from assistive technology when the adjacent byline already names the member.
- Presence, save state, status, rank, and compatibility always include explicit text for assistive technology; color and iconography only reinforce that meaning.
- Lilac is reserved for taste overlap and social affinity. Lime remains reserved for presence and healthy states.

### Media and Content Cards

- Supplied artwork leads the composition. Poster, landscape, missing-art, and editorial frames preserve deliberate aspect ratios rather than stretching media.
- Card APIs separate image, metadata, social context, progress, and action content so screens can compose the right density without duplicating card internals.
- Gradients belong to artwork legibility only; ordinary card surfaces stay flat.

### Home Composition

Home at `/` follows one deliberate discovery sequence: featured hero with Taste Match; From your circle with friend activity; Continue watching; a personalized editorial feature; Trending tonight; Lists worth stealing; mood entry points; then the footer. This order belongs to Home and is not a default strategy for title, profile, library, or operational surfaces.

The pacing alternates emotional and practical decisions. A broad cinematic opening leads into trusted social discovery, a compact return-to-watch section, an editorial interruption, ranked member evidence, human curation, and a final low-friction mood choice.

**The Home Cadence Rule.** Preserve Home’s shipped section order and alternation of cinematic, social, utility, and editorial beats; do not generalize that composition to other pages.

### Trending Card

- **Signature:** Place the oversized serif rank vertically centered behind and to the left of the poster. Keep the numeral quiet in Raised Surface so it reads as one ranked silhouette with the artwork rather than a competing badge.
- **Evidence:** Keep the member score on the artwork and completion proof below the title; rank, rating, and completion remain separately understandable.
- **Responsive behavior:** Trending remains a horizontal discovery rail on narrow screens and resolves to the five-card desktop row at the established wide breakpoint.

**The Rank Behind the Poster Rule.** A Trending Card’s oversized rank sits behind the poster at its vertical center; never float it above the artwork or reduce it to an ordinary corner badge.

### Editorial and Social

- Section headings establish a clear editorial opening before controls or grids.
- Social proof explains why a title matters through named people, reactions, and taste context rather than anonymous engagement totals.
- Spoilers use native disclosure behavior. Member status and reaction state remain announced independently of their visual treatment.

**The Social Boundary Rule.** Follow and Circle support asynchronous discovery; direct or private member messaging is not part of the product.

### Profile and Taste Surfaces

Profile surfaces are living taste spaces rather than account summaries.

- **Profile masthead:** Layer a supplied cinematic backdrop and legibility gradient behind one identity block: avatar and presence, name, handle and context, short bio, compact history statistics, then the follow action. Statistics support the person; they do not become the headline. Direct messaging is not part of the product.
- **Profile composition:** Move from the masthead into horizontally scrollable section tabs, then pair primary section content with contextual evidence on desktop. On mobile, place each evidence block immediately after the content it explains.
- **Compatibility:** Pair the named member relationship with a clamped overlap score, a human-readable reason, and mutual people or shared favorites. Foreground why two people connect rather than anonymous engagement.
- **Diary row:** Keep date, artwork, title, rating, watch context, optional personal note, and destination action in separate readable slots. On narrow screens the action follows the content instead of compressing it.
- **Taste signature:** Use one editorial sentence as the lead, followed by explicitly named taste worlds and restrained supporting behavior.
- **Rating rhythm:** Treat the histogram as evidence rather than a control. Label the distribution on the figure, hide individual bars from assistive technology, and keep even the smallest axis labels at readable Muted Metadata contrast.

**The Human Reason Rule.** Profile and taste surfaces explain affinity through named people, shared worlds, and readable reasons; totals never stand alone as proof.

**The Related Evidence Rule.** Public-profile evidence sits beside the content it explains on desktop and follows that content immediately on mobile; never detach it into a generic side rail.

**The Rating Evidence Rule.** Rating histograms are labeled figures, not controls: announce the distribution once, hide individual bars, and keep the axis labels readable.

### Title and Series Surfaces

- **Title masthead:** Make one cinematic promise with artwork, context, display title, metadata, synopsis, and a compact action cluster. Taste match and named social proof support that promise without competing with it.
- **Member pulse:** Present the numeric rating and count accessibly; the distribution is secondary evidence and remains decorative to assistive technology.
- **Season and episode choice:** Use a native season select with a visible label. Each episode row gives state first, then title and evidence, then a distinct action; progress is announced independently and never replaces the action label.
- **Cast card:** Preserve the portrait ratio, identify the person once, and keep character or role subordinate to the name.

**The Single Promise Rule.** A title masthead sells one film or series; continuation state, member evidence, and secondary actions clarify the decision without becoming rival heroes.

### Library and List Surfaces

- **Library toolbar:** Keep in-library search, filters, and sort or view controls as distinct regions that can wrap without losing their labels or order.
- **Saved title card:** Separate saved state, contextual badge, watch progress, metadata, personal or social signal, and destination. Progress uses orange and includes a textual equivalent.
- **Ordered title row:** Preserve curator rank and note as authored evidence. Match, friend proof, and the title action remain separate; search and filtering must not silently reorder the list.
- **Curator panel:** Name owners and collaborators with their roles and contribution detail before descriptive tags.

**The State, Evidence, Action Rule.** Episode, library, and ordered-list rows keep current state, supporting evidence, and the available action visibly distinct.

### Authentication and Onboarding

- **Authentication shell:** At large widths, place reference-authored focal artwork, narrative, and optional proof in a dedicated story panel beside the focused form. Below desktop, remove that story panel rather than shrinking it or moving it behind the form. Keep the shell's dark artwork overlay as the safe default; a caller may weaken or remove it only when the supplied artwork already preserves content legibility. Ask only for account essentials, preserve email access beside social providers, and place privacy or control language beside the decision it explains.
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

Component 17 is UI-shell-only. Provider ranking, health determination, entitlement checks, streaming adapters, and switching behavior remain application logic behind the provider-adapter seam.

- **Watch header:** Use the supplied Consumit mark, back destination, title context, active source status, and an explicit exit. Do not restore global navigation inside watch.
- **Consumit Player:** Render a semantic native video surface with first-party play, seek, volume, and fullscreen controls. Authorized providers supply direct HLS, DASH, or native-media sources through the later adapter seam; iframe and embed surfaces are excluded.
- **Source selector:** Use controlled native radio rows. The radio owns keyboard focus, the containing row exposes that focus visibly, and selected, health, and detail text remain independently understandable.
- **Composition contract:** The selected source, watch-header status, player status, and active source detail update from the same application state. A visual selection must never disagree with the source reported as selected.

**The Player Ownership Rule.** Consumit owns the playback controls and media surface; providers supply authorized direct media through an adapter boundary and never replace the interface with an embed.

**The Synchronized Watch State Rule.** Source selection, watch status, player status, and active detail always describe the same application state.

### Global Finish

- **Empty state:** Name the quiet condition, explain what will appear or change, and offer one relevant next action when recovery is possible.
- **Loading state:** Announce the affected content through a status role, keep placeholders subordinate, and stop spinners and pulses when reduced motion is requested.
- **Error state:** Name what failed, protect the member’s understanding of what remains safe, add useful diagnostic detail, and provide a direct recovery action.
- **Footer:** End standard pages with the supplied Consumit mark and wordmark, support and legal destinations, and copyright; keep every link touch-safe and keyboard-visible.

**The Honest Recovery Rule.** Empty, loading, and error states name the affected content, its impact, and the next available recovery without implying data loss that did not occur.

## Do's and Don'ts

### Do:

- **Do** use the supplied brand and artwork assets instead of recreating them with generic icons.
- **Do** reserve ivory for confident immediate actions and orange for committed progression.
- **Do** preserve visible keyboard focus, 44px targets for compact controls and links, and readable metadata contrast.
- **Do** finish each shared component and its states before composing the next screen.
- **Do** keep Home’s section order and responsive discovery rails specific to Home.
- **Do** keep playback selection, header status, player status, and active source detail synchronized from one application state.
- **Do** explain empty, loading, and error states in terms of member impact and the next useful recovery.

### Don't:

- **Don't** introduce large pills, routine gradients, glass effects, or floating dashboard cards.
- **Don't** use orange, lilac, or lime as interchangeable decoration.
- **Don't** reduce every surface to a rounded card grid.
- **Don't** treat mobile as a scaled-down desktop composition.
- **Don't** reuse Home’s editorial cadence as a universal page template.
- **Don't** synthesize the Consumit mark with styled text in reduced branded headers or hide onboarding skip on mobile.
- **Don't** put provider ranking, health, entitlement, streaming-adapter, or switching logic inside Component 17, and don't introduce iframe or embed playback.
