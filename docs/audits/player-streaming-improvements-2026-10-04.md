# Player recovery and control audit — 2026-10-04

The member job is to start or restore the exact movie/episode without losing a native checkpoint, with usable controls throughout recovery. This audit continues the provider-addition work; it does not treat a resolved URL or loaded iframe as working playback.

## Changes

- Initial startup failure now offers Choose another server before a playback session exists. The existing error panel opens a labeled native Server select with lazy discovery, loading, retry, empty and disabled-choice states. Try again retains the selected server; Auto restores ordinary source selection.
- Resolve accepts an optional configured provider ID and attempts that exact eligible provider through its saved Direct, Relay or Embed tier. Existing host, identity, audio, quota and circuit validation still applies. Disabled, audio-only, wrong-region, wrong-kind, unsupported anime audio and independently unapproved Relay providers cannot be selected. This does not accept arbitrary provider URLs.
- Startup selection retains the canonical title/episode and saved native position. Once playing, automatic recovery and existing owned-session switches keep their behavior. External frames still cannot report or overwrite progress without a reviewed event protocol.
- Native control hiding respects keyboard focus across playback start and pointer movement. Mouse playback should retain its ordinary fade; a real Chrome regression reproduced persistent controls after clicking Play, and the guard was narrowed to `:focus-visible`.
- The repeated-renewal browser scenario now uses the shipped Settings → Playback settings speed slider. Its former inline speed selector had become stale.

## Verified evidence

- API routes and delivery suites: 30 checks pass, including HTTP parsing of explicit startup choices, rejection of unknown/empty IDs, exact-provider selection and all eligibility guards.
- Watch orchestration: all 41 checks pass, including startup selection before a session, existing cross-tier switching, recovery and progress behavior.
- Shared native player: all 57 checks in the changed playback test file pass, including focused controls remaining visible and hiding after focus leaves.
- Four real Chrome startup scenarios pass across desktop and Pixel 7 touch: a saved 12-second checkpoint resumes on the chosen backup server; failed discovery and failed selection remain retryable. The checks use the actual fixture API, require decoded 640-pixel video, retain the selected provider on retry and check page overflow.
- Desktop and mobile startup captures were inspected together. Shared actions, the labeled selector and failure copy fit the player stage without horizontal overflow.
- The earlier targeted focus/renewal browser run passed. Repeated short HLS renewals retain decoded playback, 0.5× speed, captions and paused position without another media load. The final keyboard/pointer/renewal rerun timed out before tests began because its fixture web server did not compile within 240 seconds. The latest `:focus-visible` correction passes the shared player tests; final browser confirmation remains pending host resource recovery.

## Deployment and limits

These latest native-control and startup-recovery changes are verified from current source and the fixture dev server. The deployed optimized web remains the prior provider-addition build. API development is mounted and healthy; web deployment still requires a new optimized build.

C: has approximately 130 MB free, and an earlier parallel verification exhausted host memory. Sequential focused runs recovered, but the final fixture compilation stalled. Changed-file lint and API/shared-player/web type checking pass. The aborted fixture generation left invalid generated route declarations; the installed Next.js `typegen` command successfully regenerated the production route types before the passing final web type check. Automatic approval review rejected removal of old generated build caches without supplying a specific reason; that cleanup has not been retried through another tool. A production rebuild is deferred until at least 2 GB is free, preserving the healthy deployed site.

The earlier provider audit remains authoritative for sample availability: Citadel, Rigel, Vidnest and StigStream decoded and sought the 2025 Devil May Cry episode; ReAnime decoded its sampled anime episode. MegaPlay/VsEmbed sandbox refusal, APIPlayer verification, EmbedAPI upstream failure and VaPlayer edge denial remain unresolved. No success is inferred from Admin resolution alone. Full-title and all-provider reliability, every casting device and unavailable browser engines are not established by these focused fixtures.

No member records, provider credentials, signed source URLs or relay grants are included in this audit.
