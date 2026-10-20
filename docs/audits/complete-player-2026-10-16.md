# Complete player, familiar UI — 2026-10-16

Implemented in the workspace. The approved Cinema After Midnight identity and Watch composition remain the visual authority. No production deployment or physical-device certification is claimed.

## Delivered behavior

- Series and Anime share one episode browser state between the page rail and the player. Season browsing is independent of playback, uses the existing catalog endpoint, and retains loading, retry, filtering, pagination and upcoming states. Movies omit Episodes. Current episode identifies selection without claiming that a failed source is playing.
- Native episode navigation retains the video/fullscreen DOM elements, saves the preceding episode and resumes the selected episode's own checkpoint. Recording tokens distinguish repeated visits to the same episode; superseded sources, subtitle preparation, progress callbacks and cast samples cannot take over a later transition. Pending subtitle corrections flush against their original record.
- Player Settings includes Watch's Autoplay, Show up-next card, Anime SUB/DUB and keyboard help alongside the existing media tools. Recovery, finite source-search progress/cancellation and next-episode actions render inside the first-party fullscreen boundary. Missing sources do not expose invented quality or audio choices.
- Theater mode expands the existing picture layout and restores supporting material on exit. Fullscreen control lock leaves Unlock and captions available while suppressing transport/gestures. Desktop panels and phone/short-landscape sheets retain bounded scrolling, Close, keyboard navigation and focus restoration.
- Home keeps its section order and artwork. The polish bounds hero copy, improves secondary-action contrast, permits two-line Continue watching titles and wrapping episode/time metadata, and separates title-detail playback actions with touch-safe spacing.

## Ownership and compatibility

The web application still owns navigation, canonical identity, sessions, provider selection and member progress. The UI package adds optional episode/settings/status presentation slots, canonical recording identity and controlled theater actions. No HTTP API, database schema, provider adapter, Admin playback order or production media policy changes are introduced.

External providers keep their own players and existing progress/auto-next limitations. iOS native fullscreen retains platform controls; custom panels remain available inline. TV media/progress ownership retains its sender/receiver boundary.

The fixture server now forwards the existing playback-attempt methods and supplies deterministic movie, Series and Anime records. Development CSP permits only its exact HTTP media origin when PLAYBACK_FIXTURE_PROXY=1; production remains HTTPS-only. The development script directive also permits the eval behavior required by Next's development debugger, without changing production directives.

## Verification

- 122 UI/player/controller/caption regression tests passed. The 72 affected player/room tests were rerun after the final unavailable-control guards and passed.
- 55 Watch/session tests passed, covering episode checkpoints, late resolves, repeated-episode subtitle preparation, cancellable source searches, source recovery, completion, casting and existing behavior.
- 62 other web checks were covered across episode browsing, Anime preferences, progress/coordinator behavior, hero, Continue watching and title details. One catalog test failed in the concurrent run; its unchanged isolated file rerun passed all 9 tests.
- Desktop Chrome: all 4 browser scenarios passed on the final source. The desktop/touch matrix passed 7 scenarios with 1 intentional duplicate visual-matrix skip. Final desktop behavior and the 12 captures were refreshed after the transition guard and settings-row correction; the unavailable-control guards have the final 72-test UI rerun.
- Scoped lint and UI type checking passed. The final optimized production web build passed compilation, TypeScript, page generation and optimization.
- git diff --check passed at the implementation checkpoint; pre-existing unrelated workspace edits were preserved.

Browser assertions prove retained fullscreen and video identity, independent resume checkpoints, Back navigation, non-navigating season browsing, shared filtering, theater restoration, lock/unlock and no horizontal page overflow in the viewport matrix. Color-bar media decoded and advanced. Tests do not establish live provider availability or physical Android/iPhone behavior.

## Visual evidence

Twelve deterministic captures are retained under .impeccable/review/player-room/: desktop, 390px phone, 320px narrow phone and 844×390 short landscape, their episode panels, phone fullscreen Settings, movie Watch, Anime upcoming episodes and exhausted-source recovery.

The bounded visual review corrected the repeated drawer heading, short-landscape clipping, narrow action layout and Watch-setting row alignment. The final scoped confirmation shows the setting rows separated and the sheet header/Close reachable. No new artwork ships; screenshots use existing controlled video and geometric artwork fallbacks.

Reference studies: [Movy](https://www.movy.sx/tv/213375?play=true), [7Movies](https://7movies.ac/), [Cinejoy](https://cinejoy.pk/movie/278-the-shawshank-redemption-1994), and [Atlantic](https://atlantic.st/title/tv/213562). These supplied interaction inspiration, not replacement branding or copied code.
