# Anime audio placement — 2026-10-15

## Requested member job

Move SUB/DUB out of the anime title and synopsis area into an immediately reachable playback location. The existing shared SegmentedControl now starts the playback-preferences row immediately below the picture, with Audio as its visible label. Native playback options follow and wrap on phones. External players and final/single episodes retain the language selector even when native autoplay/shortcut controls are unavailable. Player controls, resolve-time audio, saved preference and canonical episode navigation behavior are preserved.

## Checks

- 51 focused regressions passed across WatchPlayback and anime preference tests; coverage includes external-player placement, no unsupported autoplay control, saved DUB, explicit SUB URLs and episode navigation.
- Web TypeScript, changed-source lint and mechanical design scan passed.
- Controlled 1440px and 390px browser fixtures verify placement, DUB URL/selection and external-player access, with no page overflow. The initial fixture pass recorded storage errors from the test init script running in opaque sandboxed frames; the fixture init is now restricted to the top document. This did not require changing the product or sandbox.
- Immutable production build, off-host incremental backup/archive check, web readiness, public route/private-boundary smoke and live 1440px/390px fixture confirmation passed for web-20261015-audio-placement-v1. Live UI confirmation reports no browser exceptions or overflow and verifies exact DUB navigation plus external-player selector access. Backend container identities, configuration, member counts and 1% playback canary were preserved. Candidate differs from the current frozen production snapshot in only four Watch source/test paths. Concurrent checkout edits are excluded.

## Scope and limits

No provider changes, database migrations, new paid service, player replacement or playback canary expansion. Controlled media proves UI behavior only; physical devices and actual upstream DUB availability are not certified by this layout change. Rollback uses the previous immutable web image and retained source before-images.
