# Watch cinema redesign — 2026-10-15

Status: implemented in the local preview and documented; the member approved that working preview as the final visual reference. All workflow phases are closed and `.impeccable/build/state.json` records finish `ship` at 2026-10-15T00:46:19.858Z. The independent verdict is `ship` for the three scored fixes, without a new review of the whole surface. No production deployment or physical-device certification is claimed.

## Approved scope and implementation

The member job is watching an exact movie or episode and choosing the next episode without losing playback context. The member requested the whole Watch page, retained current player controls, and approved direction A: a large player, quiet dark composition and compact episodes beside it on desktop. The direction contract is `apps/web/.impeccable/surfaces/apps-web-src-app-watch-watch-screen-tsx.md`.

The implementation composes `watch-surface.tsx`, `watch-surface.module.css`, `episode-rail.tsx` and the movie, Series and Anime Watch screens. `watch-playback.tsx` changes only its outer wrapper. The player controls and engine, provider adapters, session, member progress, resume and viewing preferences retain their existing behavior and ownership.

Movies use a full-width player followed by title details, without an episode rail or ad. Series and Anime use the primary player/details column with an adjacent sticky rail from 1100px, then stack player, details and episodes on smaller screens. The rail is 320px, growing to 400px from 1400px. Compact rows use 88px landscape stills, two-line titles, explicit current/upcoming labels and orange current selection. Season, Anime SUB/DUB, filtering and pagination remain available. An independent standard ad above Series/Anime collapses when unfilled. The shared FilScreen footer closes the page.

Filtering uses episode numbers and known titles, including loaded canonical titles with the same precedence as the rendered row. It does not fetch all unloaded episode titles for a search. No matches offers Clear filter. Failed detail enrichment preserves episode navigation and labeled title-art fallback. Future episodes remain disabled and never claim Now playing.

## Evidence

The nine valid captures in `.impeccable/review/watch-redesign/` are `desktop.png` (1505px), `series-desktop.png` (1440px), `movie-desktop.png` (1440px), `mobile.png` (390px), `series-mobile.png` (320px), `landscape.png` (844×390), `empty-filter.png`, `upcoming.png` and `canonical-filter.png`.

`metrics.json` records player/detail/rail geometry, no horizontal page overflow at the measured viewports, no page errors, and decoded advancing controlled video. It also records Page 2, the disabled upcoming row and the loaded-title query returning the canonical ninth episode. These deterministic captures establish the observed layout and named states; they do not establish live provider reliability, full-title playback or physical-device behavior.

Changed-source ESLint, web type checking and the optimized Next production build passed after the final source fixes. No tests were added or run for this UI task.

## Review and reference resolution

The independent reviewer initially requested fixes. The refreshed captures resolved typography/detail hierarchy and canonical-title filtering, with all nine captures accepted and no observed regression from that fix batch. Gate persistence was the remaining scored finding at that checkpoint.

The raw generated-comp gate failed at 58.9% against the 72% threshold. At that checkpoint hero remained open and later phases pending. A scoped override quoting the member's retained-controls request was refused; that failure remains evidence and is not rewritten as a generated-comp pixel-fidelity pass.

The member then explicitly approved: “Yes—use the working preview as the final reference; keep current controls.” The current working-preview capture (`.impeccable/review/watch-redesign/desktop.png`) is now the final visual reference, supported by the other eight state and viewport captures. Hero (58.9%) and responsive (59%) use forced closure with that actual approval recorded. This is an authorized reference change, not an automated original-comp pixel-fidelity pass; the raw failures remain in evidence.

The final `.impeccable/review/watch-redesign/reviewer-verdict.md` resolves persistence and returns `ship` for the scored fixes. That final pass scored only persistence; typography and canonical filtering retain their earlier resolved status. No source or capture changes were submitted for it, and it is not a new review of the whole surface. Spec, plates, hero, sections, motion, responsive and review are closed; `.impeccable/build/state.json` records finish `ship` at 2026-10-15T00:46:19.858Z.

## Asset and system provenance

This extends the incumbent Cinema After Midnight world. Existing palette and typography tokens and `.impeccable/design.json` are preserved. The approved generated comp is a direction reference; its approximate branding, media frame and thumbnails are illustrative. No generated comp artwork ships. Review video is controlled color bars, catalog illustrations are existing SVG fixtures, and the review ad placeholder is fixture-only; runtime Watch continues to use the existing catalog artwork and standard independent ad component.

Pre-existing unrelated design drift is outside this slice and is not promoted into reusable rules or repaired here.
