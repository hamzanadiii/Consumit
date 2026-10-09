# Player quality and controls — 2026-10-09

## Delivered slice

Both frontend players preserve their current presentation and engines. Subtitle appearance and sync now share one UI implementation in `ui-core`; the bordered chip helper became unused and was removed. Appearance uses four compact flat rows with a contextual heading. Sync keeps the offset, fine adjustment toolbar and selectable cue list together, with quiet screen-reader announcements instead of a separate status card. Existing selection, cue calibration, stored preferences, Back/Close focus and playback position remain intact.

Quality no longer rounds physical heights to a nominal ladder. HLS corrects observed rendition labels while preserving the identifiers and unobserved levels. Frame callbacks accept only frames within the playing fragment, and teardown cancels outstanding observations. Settings distinguishes observed playback from the requested rendition; Quality reports decoded width × height. Native and DASH playback also display decoded dimensions, and declared DASH heights are no longer rounded upward.

Cast stays visible and opens a connection panel without a discovered TV. It distinguishes missing receiver setup, an unavailable SDK and ready device selection, bounds SDK loading to the existing ten seconds, shares concurrent checks and permits retry. Choose TV opens Google’s picker only from a click. Initial availability is read from the Cast context; unexpected states fail closed. The timing control uses TimerReset instead of Wand2. Existing receiver configuration, protected handoffs and browser/cast cookie separation are preserved. No receiver ID or device availability is fabricated.

Receiver startup is prevented from overwriting the sender clock before media loading completes. Connection captures position/play intent before the picker, passes cancellation into the protected handoff and tears down a failed TV load while keeping local playback. Remote volume now updates the SDK player volume before calling its parameterless controller method; status refresh retains the device name. See [Google’s Cast context](https://developers.google.com/cast/docs/reference/web_sender/cast.framework.CastContext) and [remote player controller](https://developers.google.com/cast/docs/reference/web_sender/cast.framework.RemotePlayerController).

Home's clock pauses over links/buttons, keyboard focus, hidden/offscreen content and reduced motion. Resting the pointer over the artwork allows rotation. The existing shared animation clock, elapsed-progress retention and touch behavior remain intact.

## Live local evidence

- Movie 550, playing server **purstream**: decoded **1282 × 534** before and after the fix. The old nearest-height rule displayed **480p**; the refreshed frontend displays **Playing at 1282 × 534**, an exact **534p** height and Auto. This is cropped widescreen video, not evidence that a different higher-resolution rendition exists. No media URL or playback authorization was recorded in the report.
- The Cast connection panel opens without a TV; desktop/touch fixture checks pass. On the refreshed local movie-550 page, Cast opens, retries and closes. The icon is verified in deterministic fixtures; the live title did not have a ready subtitle-sync control during that probe.
- The current Home hero advanced from Lanterns to East of Eden while the pointer rested over the artwork.
- The local `web` Docker image rebuilt successfully. Only the frontend container was recreated; it reports healthy at `localhost:8080`. API, database and provider state were preserved.

## Automated evidence

- Initial failing regressions reproduced inflated adaptive quality labels, whole-artwork hover pauses and absent Cast controls.
- Shared media-engine coverage includes exact/invalid heights, corrected adaptive labels, stale-frame rejection, stable level selection and canceled callbacks. Player coverage separates cropped decoded pixels from the requested rendition.
- Original checkout UI suites: **200 UI / 201 Next UI tests passed**; whole-workspace type checks passed; both UI lint commands passed; original Home hero suite passed **12 tests**.
- Release worktree lint, type checks, both optimized frontend builds, duplication/import-boundary checks and targeted final core lint/type checks passed. A concurrent development/build file-access failure was resolved by running the web build after the development server closed.
- Desktop/touch UI review: **8 passed, 2 device-specific skips**. Inspected compact appearance and sync panels, unavailable Cast, narrow layout, native subtitle labels, caption/control stability and volume interactions. The detector reported **14 existing advisory findings**, with no blocking findings in the new panels.
- Next frontend functional playback: **27 passed, 2 device-specific skips**, followed by **4 passing focused cases** after correcting the new cue test's storage key/sign and rerunning a transient subtitle-discovery failure. Covered decoding, seeking, progress/reload, fallback, same/changing-URL renewal, caption selection/upload and sync persistence.
- Original frontend protected relay and cue sync: **6 passed** across desktop/touch, including cookie-bound native/HLS decoding, seeking, copied-link rejection and unchanged position after cue calibration.
- The standard `bun run test` command **passed across every workspace and the twenty release-tool tests** before the additional Cast request. After the Cast changes, both UI suites passed **62 tests each**, `ui-core` passed **47**, and `web-core` passed **86**. The full Watch file passed **42 cases on each frontend**; the empty-startup and TV-rejection cases also passed independently (**2 cases per frontend**) after making their session fixtures independent of test order. Sender/handoff tests passed **12 cases** and the original checkout’s Cast/Watch check passed **12 cases**. Desktop/touch Cast panel checks passed **2 cases**. The new detector run reported **zero anti-patterns and four inherited advisory type-size notes**. Final workspace lint/type checks and both optimized frontend builds passed for the additional changes. The original checkout also passes workspace type checks. The compatibility frontend Docker build passed on retry after its test fixture was ported, and the frontend was recreated healthy. The final build-time receiver wiring was validated through Compose; the local receiver ID remains empty. Infrastructure validation passed (both Terraform configurations, both Nginx configurations and fourteen alert rules).

- The sender-position regression was also run against the old startup behavior: it failed with position **0** instead of **42**, then passed again after restoring the fix.

- Regression harness notes: The new quality test required flexible accessible-name whitespace; a jsdom keyboard-focus assertion now models focus-visible explicitly instead of depending on prior mouse events.

## Delivery and limits

The authoritative shared implementation remains on `codex/cleanup-playback-security`. Only this UI/quality/hero slice was also adapted into the original checkout so the currently running frontend can use it with the pending provider work. That checkout still uses its existing pre-consolidation package layout; full security/cleanup integration remains a coordinated release, not an implicit merge of unrelated work.

This is local verification, not production launch verification. There was no account purchase, VPS provisioning, public deployment or SQL migration. Actual HTTPS/Chromecast hardware checks and the launch load baseline remain required after provisioning. The short Purstream check verifies the supplied title; it does not establish every provider's rendition availability or uninterrupted long-form playback.
