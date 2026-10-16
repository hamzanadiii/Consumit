# Browsing notifications — 2026-10-15

## Member job and scope

The owner requested that the ad-settings and feedback messages appear as notifications instead of rows inside the welcome card. The welcome keeps sharing, copy-link, exploration and optional guide actions. Separate device-local notices follow after it closes, one at a time with a 1.5-second pause, explicit dismissal and functional Settings/feedback links. They do not take focus, auto-expire, change advertising preferences or appear on Watch. Cross-tab dismissals are received; storage failure retains dismissal for the current visit.

## Evidence

- Nine focused regression checks passed across welcome and notifications: modal separation, delayed notices, serial dismissal, reload persistence, destination links, blocked storage, cross-tab dismissal, native share cancellation and Watch exclusion.
- Changed-source ESLint and web TypeScript passed; mechanical design scan returned no findings.
- Controlled 1440px desktop and 390px touch review passed without page overflow or browser exceptions. The local Next development indicator is outside the product UI and appears in the phone crop.
- Immutable candidate: web-20261015-notices-v1. Only the four selected experience source/test paths differ from the deployed snapshot; concurrent advertising and other workspace edits are excluded.
- Production build, off-host incremental backup/archive check, activation and production smoke passed. Live browser confirmation at both sizes passed: no page overflow or browser exceptions, both notice destinations visible, serial dismissal and persistence after reload verified. The web container is healthy; other container identities, provider configuration, member counts and the 1% playback canary were preserved. Previous image and source before-images are retained for rollback. See local/welcome-notifications-20261015 for frozen manifest, screenshots, baseline and logs.

## Limits

These are public product tips, separate from private episode reminders. No new database record, API, provider configuration, paid service or playback promotion is needed. Physical-device checks remain deferred.
