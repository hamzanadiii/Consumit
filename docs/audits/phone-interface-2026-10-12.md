# Phone interface refinement — 2026-10-12

The member jobs are browsing and choosing a title, searching, reaching personal archives, rating a title, and editing account/viewing preferences on a phone. This slice retains Cinema After Midnight, the existing catalog destinations, member-data behavior, and the active Consumit Player.

## Shipped changes

- The phone shell opens a closed-by-default native navigation sheet rather than placing archive/account rows above the page. It keeps all destinations, theme and session actions, locks background scrolling, contains keyboard focus, supports Close/backdrop/Escape and returns focus. Desktop keeps its icon rail.
- Home's phone hero is bounded to 360–480px with readable copy, touch-safe actions and horizontal featured selectors.
- Search fills the dynamic phone viewport, separates scope and query, adds an explicit Close action, scrolls results independently and loops keyboard focus. Search shortcuts preserve trigger focus on dismissal.
- Portrait cards show full wrapping title captions below artwork; featured cards allow two title lines and wrapping metadata.
- Shared touch buttons, filters, options and segmented controls use 44px targets. Fields use 16px text. Select popups stay inside horizontal viewport bounds and can open above a low trigger.
- Phone rating uses ten numbered native-radio targets, retaining selection, accessibility and clear-on-reselection behavior. Desktop retains stars.
- Safe-area padding protects the utility row, navigation/Search surfaces and Settings save bar. Narrow member headers use an icon-only Search trigger instead of an ellipsized label.

## Evidence and verification

Deterministic experience fixtures were used; no live member records or provider outputs were required. Fresh captures are under `.impeccable/review/mobile/`, including phone dark/light, 320px phone, Search, navigation, catalog captions, signed-in details, Settings, Profile, Watchlist, Notifications and desktop.

- All three new Chrome browser scenarios passed, covering 320×700, 390×844 and 844×390 layouts; navigation and Search focus/dismissal; theme persistence; filter popup bounds; form text size; numbered rating targets; and member surfaces. Checked pages have no horizontal overflow or uncaught page errors.
- The final relevant web unit run passed 90 tests across 13 files. The initial full web run passed 462 tests and failed six superseded sidebar assertions; those assertions were updated to the shipped navigation behavior and passed in the subsequent runs.
- The shared UI suite passed all 236 tests at its checkpoint; all 12 focused selection/rating/card tests passed after popup/rating updates.
- Web and UI lint and TypeScript checks passed. The final optimized web build passed compilation, TypeScript and static generation. Diff whitespace checks passed.

The verified phone changes shipped in the [2026-10-12 application rollout](./full-release-2026-10-12.md). Browser emulation is evidence for the checked layouts, not a physical iPhone/Android certification. Admin's deferred phone composition and unrelated changes remain outside this slice; the deployment audit records the separate sampled live-provider checks.
