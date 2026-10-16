# Reliable playback device acceptance

Release: `rebuild-20261015-reliable-v1`, deployed on 2026-10-15 after the owner's explicit request. The owner deferred hands-on checks. The new features are available site-wide through both compatible playback paths; the separate playback process retains its 1% canary. Do not mark the reported brother's PC issue resolved until it is reproduced and retested there.

## Access and record

For normal device checks, open **https://consumit.online** on each device using a test member account. Keep passwords private. Controlled failure scenarios below still use the private deterministic fixtures, not deliberately broken public providers.

The optional PC fixture preview is `http://127.0.0.1:28126`. A phone's `127.0.0.1` refers to the phone; that URL cannot reach the PC. Some audio/fullscreen/cast capabilities require HTTPS; plain LAN HTTP is not production-equivalent evidence. Never expose a development server or fictional fixture account to the public Internet, and never enter production credentials into a fixture.

Record the device model, OS/version, browser/version, candidate URL/version, network, signed-in/guest state and whether an ad blocker is installed. Test without an ad blocker for the advertising acceptance. Keep screenshots and notes free of passwords, cookies, signed source URLs and account recovery codes.

Use **Pass**, **Fail** or **Unavailable** for every row. Unavailable includes a missing language/quality, provider outage, unsupported browser feature or a device not yet tested; it is never a Pass. Name the title, canonical episode, provider/server and delivery path from the interface, plus failure category. A source that resolves but never decodes is not a playback Pass.

## Required devices

| Device/browser | Status | Version and evidence |
| --- | --- | --- |
| Brother's PC, Chrome | Unavailable — deferred | |
| Brother's PC, Edge | Unavailable — deferred | |
| Brother's PC, Firefox | Unavailable — deferred | |
| Physical Android, Chrome | Unavailable — deferred | |
| Physical iPhone, Safari | Unavailable — deferred | |

The local controlled Chrome desktop/narrow and Firefox results are in [the release audit](../audits/reliable-playback-2026-10-15.md). Narrow desktop emulation does not replace physical Android; a browser shim does not replace native Safari fullscreen/audio-policy checks.

## For one movie, series episode and anime episode

1. Browse, sign in, open the exact title and play it. Confirm the picture advances and sound is audible; record first-frame timing and provider. Keep movie/TMDB and anime/AniList identity distinct.
2. Open Subtitles. Wait for discovery to finish; note partial failures and retry once. Check that later language groups can be opened and paged without losing previously found files. Choose an available subtitle from Consumit's aggregated list, not only the provider's in-band English track. Verify readable cues, seek forward/back, pause/resume, and fullscreen. Change the source and check captions/sync remain correct. Upload a small known SRT/VTT and check appearance and sync; reject a malformed file while preserving the working selection.
3. Change **stream audio language** where supplied. Previous sound should continue until the new track starts. Repeat using a **separate recording** language where supplied; if one fails, confirm a compatible remaining recording is tried. If the browser asks, press Enable audio. On failure, prior audio and saved language must remain unchanged. Seek, adjust sync and test a recording with a clearly different duration; do not count incompatible cuts as supported audio.
4. Open Quality. Record the choices actually supplied. Choose 1080p only when available; confirm the rendered resolution and that position, audio intent and captions are retained. Missing 1080p is Unavailable, not Pass.
5. Open Manage servers. Move a server up/down using touch and keyboard, reload, and confirm the order for that title type. Verify another title type has its own order. On another signed-in device, verify account synchronization. Guests should retain only their device order. Reset to default. Disabled/region-ineligible servers must not become usable from an old saved preference.
6. Use the controlled failure fixture to test Main Server → every Backup → exhausted, with stable labels and actual progress. Cancel a pending search; no late result should restart it. Select a server manually and verify a new recovery cycle. External players must be labeled and must not claim Consumit caption/progress/auto-next support. Never deliberately disrupt public provider services to create failures.
7. Watch beyond 60 seconds without completing, then leave Watch. Confirm Home Continue watching shows the exact title/episode. Reload, sign in on a second device, and resume from the newest account checkpoint. Guests must not see a member's rows; a second member must not see the first member's rows. Test anime with a numeric id also used by a movie in the controlled fixture.
8. Hide the Continue entry. It should disappear on both signed-in devices while stored progress/history remains. Watch it again and confirm eligibility returns. Complete a movie: it disappears. Complete a nonfinal episode: Continue points only to the next confirmed available canonical episode; finished/unknown-next series should not invent an episode.
9. Save/remove from Watchlist and an existing list; verify another signed-in device sees the change. Retain current catalog/library sort behavior. Complete a watch, then check signed-in recommendations for that actual title. Exercise type filtering, Recommended/Top rated/Newest, Not interested, Undo and reset; ensure watched/dismissed entries stay excluded and viewing history stays intact.
10. Autoplay starts Off by default. Enable it, finish a nonfinal episode and verify the **10-second countdown**, Play now and Cancel. Confirm no double navigation/completion on duplicate end events. External players do not trigger owned auto-next without verified events.
11. Report playback issue. Diagnostics must be optional and initially unchecked; inspect the preview and confirm only canonical title/episode, safe provider id, coarse browser, delivery and failure category. No credentials, cookies or playback URLs. Sending remains the member's deliberate action.

## Browse → Ad status

1. With a clean test profile, confirm default On and the existing two-per-hour device limit. No display banners or reserved banner space should appear.
2. Set Off before advertising loads. Navigate, click title cards and controls, use Back, and reload. No advertising script request or unsolicited window should occur. Repeat in a second open tab and after closing/reopening the browser. Run without an ad blocker.
3. With the controlled advertising-handler fixture already executed on Browse, set Off. The device choice must persist and Browse must reload to remove handlers; another browsing tab should also settle Off. An active Watch tab must keep its video and position without a document reload.
4. Simulate account preference read/write failure in the controlled fixture. Pending saved preferences must not inject advertising. Off must remain effective on the device, show Retry sync and survive reload; retry should synchronize when the account service returns.
5. With Off, automatic recovery must skip providers requiring an unsandboxed external player and offer compatible servers. Do not treat an explicit member-opened external link as an unsolicited pop-up.

## Record and gate

| Title/type/episode | Provider/path | Language/quality | Device/browser | Result | Actual observation or failure |
| --- | --- | --- | --- | --- | --- |
| | | | | Unavailable | Not exercised yet |

Attach the completed matrix and redacted evidence to the release audit. Run relevant automated checks and production-image smoke checks, preserve backups, and deploy compatible API/playback plus the additive migration before web. Retain image/routing rollback and the 1% canary. Promote only when the recorded acceptance gates pass; partial upstream availability must be described honestly.
