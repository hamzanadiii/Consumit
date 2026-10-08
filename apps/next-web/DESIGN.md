---
name: Consumit Next
description: A streaming salon and private museum, implemented in the independent frontend.
colors:
  cinema-canvas: "#111112"
  cinema-nav: "#161617"
  cinema-surface: "#1c1c1e"
  cinema-field: "#1b1b1d"
  cinema-raised: "#272729"
  cinema-hover: "#29292b"
  cinema-ink: "#f5f5f3"
  cinema-copy: "#d2d2cf"
  cinema-muted: "#a6a6a2"
  cinema-line: "#333335"
  cinema-field-border: "#535353"
  cinema-control-outline: "#777774"
  coral: "#ff7857"
  coral-focus: "#ff9c83"
  paper-canvas: "#f5f3ee"
  paper-nav: "#eeebe4"
  paper-field: "#fffdfa"
  paper-ink: "#282622"
  paper-copy: "#56524b"
  paper-muted: "#69635b"
  paper-line: "#dcd6cc"
  paper-field-border: "#aaa195"
  paper-hover: "#e8e3d8"
  paper-accent: "#b73e24"
  dusk-canvas: "#201b18"
  dusk-nav: "#29221d"
  dusk-field: "#2b241f"
  dusk-ink: "#f5e9d9"
  dusk-copy: "#d6c7b6"
  dusk-muted: "#b8a691"
  dusk-line: "#463b33"
  dusk-field-border: "#6a5747"
  dusk-hover: "#3a3028"
  dusk-accent: "#efb985"
  player-canvas: "#0a0a0a"
  player-menu: "#202022"
  player-menu-border: "#454547"
  danger: "#b76d66"
typography:
  display:
    fontFamily: "'Manrope Variable', Manrope, 'Noto Sans Arabic', 'Segoe UI', sans-serif"
    fontSize: "clamp(44px, 5vw, 76px)"
    fontWeight: 650
    lineHeight: 1.04
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "'Manrope Variable', Manrope, 'Noto Sans Arabic', 'Segoe UI', sans-serif"
    fontSize: "30px"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.035em"
  title:
    fontFamily: "'Manrope Variable', Manrope, 'Noto Sans Arabic', 'Segoe UI', sans-serif"
    fontSize: "24px"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "-0.035em"
  body:
    fontFamily: "'Manrope Variable', Manrope, 'Noto Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif"
    fontSize: "14px"
    lineHeight: 1.7
  label:
    fontFamily: "'Manrope Variable', Manrope, 'Noto Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 600
  journal:
    fontFamily: "'Charter', Georgia, serif"
    fontSize: "30px"
    fontWeight: 400
    letterSpacing: "-0.025em"
rounded:
  micro: "3px"
  favorite-art: "4px"
  input: "8px"
  control: "9px"
  atmosphere: "12px"
  card: "14px"
  sheet: "16px"
  banner: "20px"
  pill: "30px"
spacing:
  label-gap: "5px"
  compact-gap: "8px"
  item-gap: "12px"
  control-padding: "16px"
  mobile-gutter: "20px"
  tablet-gutter: "24px"
  sheet-padding: "28px"
  content-top: "36px"
  desktop-gutter: "40px"
  room-gap: "48px"
  content-bottom: "64px"
components:
  button-primary:
    backgroundColor: "{colors.coral}"
    textColor: "{colors.cinema-canvas}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.cinema-ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.cinema-copy}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-watch:
    backgroundColor: "{colors.cinema-ink}"
    textColor: "{colors.cinema-canvas}"
    rounded: "{rounded.control}"
    padding: "0 22px"
    height: "48px"
  input:
    backgroundColor: "{colors.cinema-field}"
    textColor: "{colors.cinema-ink}"
    rounded: "{rounded.input}"
    padding: "0 16px"
    height: "52px"
  navigation-active:
    backgroundColor: "{colors.cinema-ink}"
    textColor: "{colors.cinema-canvas}"
    rounded: "{rounded.pill}"
    padding: "0 21px"
    height: "44px"
  poster:
    backgroundColor: "{colors.cinema-field}"
    rounded: "{rounded.control}"
  atmosphere-choice:
    backgroundColor: "transparent"
    textColor: "{colors.cinema-ink}"
    rounded: "{rounded.atmosphere}"
    padding: "12px"
---

# Design System: Consumit Next

## Overview

**Creative North Star: "The Streaming Salon and Personal Museum"**

Large cinematic artwork makes discovery immediate; permanently readable captions and a private journal make the same room personal. The interface uses charcoal, soft white, coral, clear Manrope typography, and calm sheets. Film logos keep their own lettering. Charter supplies the journal's reading voice.

This record describes the implemented world in `apps/next-web` and `packages/next-ui`. It does not replace the preserved frontend's root design authority. The stylesheet order is shared next-ui styles, museum styles, then next.css; the final cascade and scoped shell themes are authoritative. Legacy FilScreen hook names are compatibility selectors, not a direction to reproduce the original sidebar.

**Key Characteristics:**

- Expansive key art with clear Watch and title-detail actions.
- Horizontal desktop wayfinding and four named mobile destinations.
- Favorite artwork presented as a private museum with readable captions.
- Cinema, Paper gallery, and Dusk atmospheres; Gallery and Journal compositions.
- Focus movement that yields to Quiet motion and system motion preferences.

The code-led direction is recorded in [the surface contract](../../.impeccable/surfaces/next-frontend.md), candidate 4, seed `f5c1f1a6`. Reference context and asset provenance live in [FRONTEND-NEXT.md](../../docs/FRONTEND-NEXT.md). Screenshot evidence and browser verification live in [the review folder](../../.impeccable/review/next-frontend/); this design record does not assert finish-review approval.

## Colors

The default room is neutral charcoal with a restrained coral accent. Paper gallery warms the surrounding shell; Dusk replaces the charcoal room with brown-black and amber.

### Primary

- **Coral:** actions, selected states, caret, and Consumit's wordmark point in Cinema.
- **Paper accent:** rust action and focus color in Paper gallery.
- **Dusk accent:** amber action and focus color in Dusk.

### Neutral

- **Cinema canvas, navigation, surface, field, and raised surface:** separate the room, wayfinding, forms, and panels through tone.
- **Cinema ink, copy, and muted:** primary reading, supporting copy, and persistent captions; muted text remains meaningful content.
- **Paper and Dusk families:** the corresponding shell, navigation, fields, reading hierarchy, dividers, and hover states.
- **Player canvas and menu:** dedicated dark playback surfaces, including when the surrounding room uses Paper gallery.
- **Field borders and control outline:** distinguish editable and interactive edges.
- **Danger:** the inherited semantic error treatment; it is not an ornamental accent.

The listed room palettes are the final `--fs-*` values in next.css. Some shared semantic surfaces, status colors, and artwork mastheads retain locally scoped values from next-ui and THEME_STYLE; do not assume a shell token remaps every nested component.

### Named Rules

**The Room and Picture Rule.** Change the surrounding room through its atmosphere; keep photographic mastheads and the player on their dedicated contrast fields.

## Typography

**Display Font:** self-hosted Manrope Variable with Manrope and script-aware sans fallbacks.\
**Body Font:** the same interface stack, including Noto Sans Arabic, Segoe UI, Tahoma, and Arial fallbacks.\
**Journal Font:** Charter with Georgia fallback.

**Character:** Manrope provides clean, compact wayfinding and confident title hierarchy. Charter marks the quieter journal without making every heading editorial serif. Manrope is imported by next-ui and its license is retained in `public/licenses/manrope.txt`.

### Hierarchy

- **Display:** text fallback for cinematic featured titles; catalog title logos retain their artwork.
- **Headline:** the favorite exhibition heading; profile names use a separate responsive ramp (`clamp(30px, 3.6vw, 50px)`).
- **Title:** discovery and continuation rail headings.
- **Body:** profile description and reading copy, with profile biography limited to 60ch.
- **Label:** controls, metadata, and captions; poster titles use 14px/650 and their metadata 12px.
- **Journal:** journal section headings; these become 27px on mobile.

The document root is 16px. Desktop featured supporting lines are 24px, mobile 19px. Mobile rail headings are 21px and captions 13px/11px. Compact metadata and dock labels can be smaller; do not promote their sizes to the main reading role.

### Named Rules

**The Permanent Caption Rule.** Poster title and supporting metadata stay visible at rest; focus emphasizes artwork without making the caption conditional.

## Layout

The desktop shell uses an 80px sticky horizontal header. Content is centered within 1600px with 40px side gutters and 36px top padding. Discovery key art extends through the content gutters; its copy stays within 750px, with hero height `clamp(540px, 67svh, 730px)`. Rails use 20px gaps and poster widths `clamp(164px, 14.5vw, 225px)`.

At widths up to 1023px, side gutters become 24px, header controls compact, and the journal becomes one column. At widths up to 699px, the header is 68px, gutters are 20px, desktop navigation is replaced by a four-destination dock, and the account sheet sits within 16px of the viewport edges. The footer reserves 100px bottom padding for the dock. Mobile posters are 148px wide with 14px gaps, and feature selectors move below the hero.

Gallery favorites use four columns, a centered 1100px maximum, and roomy responsive gaps. The narrow museum treatment uses two columns. Journal composition limits favorites to 760px, removes stagger and shadow, and reduces the cover from 380px to 280px. The journal's desktop main/aside split is 1.8fr/0.8fr with a 260px aside minimum and 48px gap; mobile activity uses two columns. Profile tabs scroll horizontally.

The player is its own focused surface. Its paused text has a local dark gradient; desktop copy occupies at most 48% of the image and 62ch, while mobile hides the synopsis to leave transport controls and artwork clear.

## Elevation & Depth

The room relies on tonal surfaces and thin separators. Artwork receives diffuse depth; account and player sheets use shadows to separate overlays. These are native parts of this world, not a universal prohibition on shadows.

### Shadow Vocabulary

- **Focused catalog artwork:** `0 16px 32px #00000040`.
- **Favorite exhibition artwork:** `0 22px 46px #00000045`.
- **Account sheet:** `0 20px 70px #00000050`.
- **Player menu:** `0 20px 60px #0008`.

### Named Rules

**The Still Room Rule.** Quiet motion and the system reduced-motion preference suppress spatial poster movement and feature autoplay; information and focus cues remain available.

## Shapes

Ordinary controls and posters use gentle corners; exhibition art uses smaller physical edges. Sheets and profile banners have broader curves. Navigation selections, profile actions, and composition controls use pills; player icon controls and the play control are circles. Inputs override the shared control radius with their own 8px radius. Mobile player corners tighten to 10px, and mobile profile banners to 16px.

## Components

### Buttons

Shared primary actions use the atmosphere's semantic accent, with a 44px medium height, 16px inline padding, and 150ms ease-out state transitions. Secondary actions have a control outline; ghost actions gain a tonal surface. Loading disables duplicate actions and shows a spinner, disabled controls reduce opacity, and keyboard focus has a visible accent ring. The featured Watch action deliberately uses soft white on charcoal, 48px height, and 22px inline padding.

### Cards / Containers

Catalog posters use a 2:3 artwork frame, permanent title/metadata captions, gentle corners, and a 6px focus lift over 450ms. Favorite frames have tighter corners and stronger diffuse depth; Journal composition removes that depth. Empty favorite slots retain the same artwork proportions and provide an actionable prompt rather than invented catalog or member evidence.

### Inputs / Fields

Text inputs are 52px high with 16px inline padding, a semantic field background, readable placeholder, and control outline. Hover strengthens the edge; keyboard focus uses accent border and ring. Invalid fields use the danger treatment, and disabled/read-only states remain distinct.

### Navigation

Desktop Home, Movies, Series, and Anime use 44px targets and an inverted pill for the current destination. Search is reachable from its icon, slash, or Command/Control-K. The account menu contains the private museum and archives; guests retain honest sign-in destinations. Mobile Home, Discover, Watchlist, and Museum use named icon destinations with a 52px minimum item height. Escape closes the account menu and restores focus.

### Appearance

Three radio tiles select Cinema, Paper gallery, and Dusk. The selected tile has an accent edge and check icon; keyboard focus surrounds the whole tile. Gallery/Journal use pressed-state pill controls. Quiet motion uses a labeled toggle. Preferences apply immediately, use `consumit.next.*` device storage, and report when persistence is unavailable.

### Player

First-party player controls retain their media semantics, visible keyboard focus, and dark menu surfaces. The round play control uses soft white on charcoal. An elapsed/remaining time action and keyboard guide improve access without changing playback position. Paused copy uses its own dark field over bright artwork; mobile prioritizes title, facts, and transport.

### Advertisement

Ad slots reserve the actual configured unit dimensions, with an Advertisement label and themed field background. Pending frames stay concealed. Meaningful image or frame evidence reveals the creative; blocked/unfilled units collapse after ten seconds. The smallest fitting unit is chosen from the slot's measured width. Ads never determine playback availability.

## Do's and Don'ts

### Do:

- **Do** use the final app cascade and next-ui presentation components as this frontend's source of truth.
- **Do** preserve title captions, obvious current navigation, and visible keyboard focus.
- **Do** let real key art supply the spectacle and keep player text on a reliable contrast field.
- **Do** support all three atmospheres, both profile compositions, and motion preferences when extending a surface.
- **Do** distinguish labeled preview fixtures from actual member records and unavailable states.

### Don't:

- **Don't** apply this world's tokens to the preserved original frontend.
- **Don't** turn compatibility FilScreen selectors into a requirement for the original sidebar.
- **Don't** replace member history, lists, or ratings with invented social or personalized evidence.
- **Don't** expose pending blank ad frames or retain an unfilled ad box as a visual motif.
- **Don't** make a supplied but inaccessible reference image into a claimed approved visual comp.
