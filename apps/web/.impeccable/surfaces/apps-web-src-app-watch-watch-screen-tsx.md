---
version: 1
slug: "apps-web-src-app-watch-watch-screen-tsx"
primary_target: "apps/web/src/app/watch/watch-screen.tsx"
related_targets: ["apps/web/src/app/watch/watch-playback.tsx", "apps/web/src/app/watch/series/series-watch-screen.tsx", "apps/web/src/app/watch/anime/anime-watch-screen.tsx", "apps/web/src/app/watch/episode-rail.tsx"]
---

# Consumit Watch / Cinema layout

**Mode:** Operate.
**Job:** Watch an exact movie or episode and choose the next episode without losing playback context.
**Confirmed scope (2026-10-14):** Redesign the whole Watch page while retaining current player controls. The member chose a cinema feel: a large player, quiet dark layout and compact episode list.
**Identity:** Inherit Cinema After Midnight: midnight canvas, warm ivory, Charter and DejaVu Sans, orange for selection and progress. Shared components remain the control authority.
**Preserve:** Player functionality and media behavior; title/episode identity; progress, resume and preferences; SUB/DUB; source recovery and honest Embed limitations; season/filter/paging/unaired episode states; approved A cinema composition. The 2026-10-15 refinement removes display banners and the duplicate in-player back arrow and adapts the narrow control layout.
**Phone composition:** Player first, followed directly by title/audio details and compact episodes. Maintain touch targets, readable text, long-title wrapping and keyboard focus.
**Approved (2026-10-15):** A — large player with compact episodes beside it. Comp: `.impeccable/mocks/watch-redesign/quiet-cinema.png`. The member explicitly retained shipped player controls; generated frames, thumbnails and approximate branding are illustrative, not replacement assets. The later mobile refinement removes every display banner. Movie Watch has no episode rail.

## Direction contract

**THESIS:** The picture owns Watch; a narrow, readable episode list supports choosing the next installment without competing with it.

**OWN-WORLD:** Midnight black, warm ivory Charter title, compact DejaVu Sans metadata, orange current-episode signal, flat hairline separation and shipped controls.

**STORY:** Return to the title, watch or recover the exact source, retain position, then choose an episode or season. Synopsis and SUB/DUB stay adjacent to the picture.

**FIRST VIEWPORT:** A small branded Return to title row precedes a dominant player, with no display advertisement. Desktop has an approximately 300px episode rail with small landscape stills and two-line titles. Flat title details follow the player. Phones stack player, details and episode list with touch-safe controls.

**FORM:** User-pinned cinema composition A, seed `consumit-watch-cinema`; preserve the approved topology, player functionality, catalog identity and member progress ownership; apply the approved narrow-player refinement below.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Implementation and finish evidence — 2026-10-15

The local implementation follows approved A with the retained player controls: full-width movie player/details without ad or rail; Series/Anime player/details beside compact episodes from 1100px (320px rail, 400px from 1400px), stacked below that width. Rows use 88px stills, two-line titles and explicit current/upcoming labels. Season, SUB/DUB, filter, paging, independent collapsing standard ad and shared footer remain available. Loaded canonical-title filtering follows the displayed title precedence; future disabled rows never claim Now playing.

Documentation is merged into DESIGN.md, docs/PRODUCT.md, docs/COMPONENTS.md and docs/DELIVERY.md; docs/audits/watch-redesign-2026-10-15.md records scope, provenance and limitations. Incumbent tokens and .impeccable/design.json are preserved. No generated comp art ships: controlled review video is color bars, illustrations are existing catalog SVG fixtures and the ad placeholder is fixture-only.

Nine valid captures and metrics are retained under .impeccable/review/watch-redesign. Changed-source ESLint, web types and the optimized Next production build passed after final source fixes. No tests were added or run; no production deployment or physical-device certification is claimed.

The independent review resolved typography and canonical filtering before gate persistence. At that checkpoint the raw generated-comp gate failed at 58.9% against 72%, and the retained-controls scoped override was refused. That raw failure remains evidence; no generated-comp pixel-fidelity pass is claimed.

**Final reference approved (2026-10-15):** The member explicitly said, “Yes—use the working preview as the final reference; keep current controls.” The working-preview capture `.impeccable/review/watch-redesign/desktop.png`, supported by the other eight state/viewport captures, supersedes the generated comp as the final visual reference. Hero (58.9%) and responsive (59%) use forced closure with this approval recorded; the raw original-comp failures are preserved and are not pixel-fidelity passes.

**Finish recorded:** The final independent verdict resolves persistence and returns `ship` for the three scored fixes. Its final pass scores only persistence, retaining the resolved typography/filter findings; it is not a new review of the whole surface. Spec, plates, hero, sections, motion, responsive and review are closed. `.impeccable/build/state.json` records finish `ship` at 2026-10-15T00:46:19.858Z. Documentation is complete for this scope; deployment and physical-device certification are not claimed.

## Mobile player and banner refinement — 2026-10-15

**Latest authorization:** Enhance the mobile player, remove the pictured back arrow inside the player and remove all display banners. This supersedes the earlier preservation of banner placement and exact mobile control presentation; the approved A Watch layout and existing playback functionality remain the reference.

**Current composition:** The page-level Return to title remains above the player. Watch supplies no in-player back callback, and the shared header omits its empty back wrapper. A player container query at 600px and below keeps inline video at 16:9 and places timeline/controls below the picture in normal flow, hides redundant inline header/paused details and uses separate transport/action rows with 44px targets and a 48px play target. Secondary actions form three columns at 330px and below. Fullscreen retains compact context and overlay controls; short landscape containers at 601–900px and viewport heights up to 520px retain compact targets and omit paused details/volume sliders. Media engine, provider, progress and preference behavior are unchanged.

**Display banners:** Watch and all active browse/detail/profile placements omit AdSlot mounts and reserved space. Home also omits the advertising support card; profile artwork, community cards and the separate existing browse pop-under integration remain. The broader removal is recorded in PRODUCT.md and COMPONENTS.md.

**Evidence status:** The final optimized web build, UI types, scoped UI/web lint and diff check passed. Twelve fresh captures and metrics under `.impeccable/review/mobile-player/` cover five contexts plus phone fullscreen and Settings. Every context reports no page overflow/errors, in-player Back buttons, ad slots or banner requests. After settings-row and landscape Play corrections, all twelve captures were refreshed after a preview restart. All four mobile contexts measure 48px Play and 44px other controls, with paused details hidden. The independent reviewer returned **ship** after the bounded fix recheck: persistence passes, settings alignment and landscape Play sizing are resolved, and no regression remains in the scored areas. Review scope and ceiling are recorded in `.impeccable/review/mobile-player/reviewer.md`. Earlier Watch review scores and approved working-preview reference are historical evidence for approved A, not a finish verdict for this refinement. No tests were added or run, no production deployment or physical-device certification is claimed. See `docs/audits/mobile-player-and-banner-removal-2026-10-15.md`.

## Owner-confirmed interface refinement — 2026-10-15

The owner confirmed one Consumit Server group that opens its existing provider choices and separate named external players. Episodic playback preferences sit directly below the picture. The recommendation row uses compact grouped filters, corner dismissal actions and visible phone titles. The welcome dialog follows the supplied centered share/support references within Consumit tokens. Controlled desktop/touch review and source regression evidence are recorded in docs/audits/interface-refinement-2026-10-15.md. This is a refinement of the incumbent world; the retained player controls and approved cinema topology remain the visual authority.


## Anime audio placement — 2026-10-15

Owner-requested refinement puts the existing Audio SUB/DUB segmented control first in the preferences row directly below the player, before native toggles. External players retain the selector without unsupported native controls. Title details carry no audio selector. Live 1440px/390px review and 51 focused regressions pass; see docs/audits/anime-audio-placement-2026-10-15.md.
