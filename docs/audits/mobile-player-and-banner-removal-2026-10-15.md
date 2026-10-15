# Mobile player and display banner removal — 2026-10-15

## Member job and authority

Watch an exact movie or episode comfortably on a phone, retaining the approved A cinema layout and playback functionality. The latest explicit request enhances mobile controls, removes the back arrow inside the player and removes all display banners. It supersedes the previous constraint to preserve ad placement and exact mobile control presentation. The approved working preview and shipped shared components remain the visual authority; the earlier generated-comp scores are historical and are not reopened by this ordinary refinement.

References supplied by the member:

- `C:/Users/LENOVO/AppData/Local/Temp/codex-clipboard-f7fee23a-1023-49b1-a491-11309cb27479.png`
- `C:/Users/LENOVO/AppData/Local/Temp/codex-clipboard-26ef4d2c-a571-4093-8782-3894495077b1.png`

## Implemented scope

`WatchPlayback` no longer supplies an in-player `onBack`; the shared Player header omits its empty back wrapper when neither callback nor destination exists. The page-level Return to title remains. Panel Back controls still navigate within settings.

The shared Player owns an inline-size container for both mouse and touch. At container widths up to 600px, inline video uses a 16:9 frame and timeline/controls sit beneath the picture in normal flow. The redundant inline header and paused-detail overlay are hidden; page details retain title and episode context. Transport and secondary actions use separate rows, 44px action targets and a 48px play target. Secondary actions form three columns at 330px and below. Fullscreen retains a compact header and overlay controls. At 601–900px player widths with viewport height up to 520px, compact targets remain and paused details/volume sliders are hidden.

Display AdSlot mounts, imports and wrappers are removed from Home, Movies/Series/Anime catalogs, movie/series/anime title details, Watch and the owner’s Profile overview. Former wide-layout 300px ad columns are removed. Home also omits the advertising support card. Profile backdrop artwork and community cards remain product content. Existing pop-under integration stays separate and unchanged, with its disclosure retained; Privacy no longer claims active Adsterra display banners.

Media engine, playback sessions, provider adapters/contracts, watch progress, history and Viewing Preferences retain their existing ownership. No new raster asset ships. Incumbent palette, fonts, spacing and shape tokens and `.impeccable/design.json` are preserved; the responsive behavior is recorded as a local player rule rather than a new global token system.

## Named states and evidence

Twelve fresh captures cover paused and playing states at phone, narrow phone, mouse-driven narrow layout, landscape and desktop widths, plus phone fullscreen and Settings. Evidence is retained at:

- `.impeccable/review/mobile-player/{phone,narrow,mouse-mobile,landscape,desktop}-{paused,playing}.png`
- `.impeccable/review/mobile-player/phone-fullscreen.png`
- `.impeccable/review/mobile-player/phone-settings.png`
- `.impeccable/review/mobile-player/metrics.json`

The final optimized Next web build, UI type checking, scoped UI/web ESLint and `git diff --check` passed. Metrics for all five contexts report no horizontal page overflow, no in-player Back buttons, no ad slots or banner requests and no page errors. Paused details are hidden in all four mobile contexts; measured mobile controls are at least 44px. At the first capture checkpoint, landscape Play measured 44px because of selector specificity, and the finish reviewer found unaligned mobile settings toggle rows. Both were fixed. The optimized web build passed again after the CSS fixes, the preview server was restarted to replace a stale stylesheet, and all twelve captures were refreshed. Final metrics show Play at 48px in all four mobile contexts and the other transport/action targets at 44px. The refreshed phone Settings capture shows aligned icon, label and toggle rows. The initial defects are retained here as fixed historical findings and are not promoted into the design tokens. The existing anime browse banner assertion was updated to expect no advertisement. No tests were added or run for this UI refinement.

The independent finish review requested the settings-row alignment and landscape Play fixes above. Both are implemented and the complete refreshed capture matrix passes the recorded measurements. The final [reviewer record](../../.impeccable/review/mobile-player/reviewer.md) returns **ship**: persistence passes, both scored fixes are resolved, no regression remains in the scored areas and material fixes are clear. This bounded recheck reached its review ceiling; it is not a new claim of full live-provider or physical-device certification. The previous approved A review does not establish a finish verdict for this refinement. Physical Safari/Android checks and production deployment remain undone. No physical-device certification, live-provider coverage or live pop-under-network verification is claimed.

## Canonical documentation

Current product behavior is reconciled in `docs/PRODUCT.md`, `DESIGN.md`, `docs/COMPONENTS.md`, `docs/DELIVERY.md` and the Watch surface brief. Dated older delivery entries and audits retain their historical advertising and review evidence. No unrelated preexisting design drift is canonized or repaired by this slice.
