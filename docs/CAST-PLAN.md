# Chromecast slice — full receiver + progress

Member job: **start watching on the phone or laptop, throw it to the TV, keep
position, captions, and history in sync.** Live content is explicitly out of
scope; this slice is VOD-only (movies, series episodes, anime episodes).

## Non-goals

- Live/linear content, watch parties, multi-room sync (all excluded by `PRODUCT.md`).
- Replacing the web player engines (see ADR 0002 — the CAF receiver bundles
  its own player on the TV side; the web player stays hls.js/dash.js/native).
- Guest casting without a session: cast reuses the existing playback session
  and progress model, never a parallel one.

## UX flow

```text
Watch (or embed) player chrome → Cast button (advanced controls row; second
mobile row) → device picker → TV loads Consumit receiver → member sees
backdrop + title + progress on TV → phone becomes remote (play/pause/seek/
volume/captions/server) → disconnect returns playback to the phone at the
TV's position.
```

Receiver UI follows Cinema After Midnight: backdrop art, Charter title,
ivory progress rail, quiet paused overlay. No catalog browsing on TV in this
slice — the TV is a playback surface, the sender stays the remote.

## Architecture

```text
Sender (apps/web)                    TV (custom CAF receiver)
─────────────────                    ────────────────────────
CastButton (player chrome)           /cast/receiver.html (static,
useCastSession hook                   no Next chrome)
  │                                    │
  ├─ CastContext session mgmt         ├─ CAF Receiver + PlayerManager
  ├─ LOAD media = session src URL     ├─ header injection for provider
  │   (direct or signed Worker URL)   │   referer/origin via playback
  ├─ polls RemotePlayer state         │   config request handlers
  ├─ writes progress + telemetry      ├─ MediaTrack captions (first-party
  │   through existing sender-side     │   VTT; CORS verified pre-launch)
  │   session/progress/events infra   ├─ display status back to sender
  └─ lease renewal reloads cast media └─ styled idle/loading/paused states
     at the retained position
```

Key decisions:

1. **Custom receiver, not default.** Provider streams need `referer`/`origin`
   hints the default media receiver cannot send; CAF request handlers can.
   Styled default would also strand captions and status text.
2. **Sender owns session, progress, telemetry.** The TV never authenticates:
   no member tokens, cookies, or progress writes cross to the receiver. The
   sender polls cast media status and reuses `writePlaybackProgress`,
   `createPlaybackEvents`, and the playback session (same `session.id`).
3. **Server switches and renewals reload cast media** through the existing
   coordinator (`recover`/`switchAvailable`) with retained position — the
   same L3/L4 ladder, new last mile.
4. **Receiver is static, not a deployable.** `apps/web/public/cast/` hosts
   versioned `receiver.html`/JS served at `https://<app>/cast/receiver.html`
   (Chromecast requires public HTTPS). No new service, no new store.
5. **Sender SDK loads lazily** (`__onGCastApiAvailable`), only when a Cast
   runtime exists. Base bundle stays fast; no-cast browsers see no button.

## Module interfaces (to be defined before implementation)

```text
useCastSession(): { available, connected, device, connect(), disconnect(),
                    load(session, position), play(), pause(), seekTo(),
                    setVolume(), setMuted(), selectTrack(), state }
  Behind: chrome.cast / cast.framework (mocked in tests).

receiver message contract (customData on LOAD + status namespace):
  LOAD customData: { sessionId, title, artwork, position, audioLanguage,
                     subtitleTrackId?, headers: { referer?, origin? } }
  Status back: { position, duration, playing, ended } (polled, not pushed).
```

## Phases (smallest coherent slices)

1. **P1 — cast basic play + progress.** DONE. Sender lib (`cast-sender.ts`,
   mocked-SDK unit tests), player chrome cast button (`@consumit/ui`),
   static custom receiver (`apps/web/public/cast/`, header injection +
   brand states), LOAD from session with retained position, disconnect
   resumes the phone at the TV position, sender-side progress +
   `started`/`ended` telemetry, renewal/server-switch reload cast media with
   fail-open to the phone. Hardware pass criteria in
   `docs/runbooks/chromecast-testing.md` remain a manual step (no real
   Chromecast in CI). Direct sources needing `referer` hints are
   best-effort on TV until session header hints are plumbed.
2. **P2 — caption/audio parity.** MediaTrack captions from session + engine
   tracks (CORS on `/v1/subtitles/file` verified), audio language through
   LOAD customData, sender track menu drives receiver selection.
3. **P3 — TV-side failure visibility.** Sender-visible TV fatal recovery,
   honest receiver unavailable state, session header hints for direct
   sources. (Renewal/server-switch reload already landed in P1.)

Each phase: deterministic sender fixtures, receiver logic tests, failure
states (no devices found, receiver load fail, mid-cast source death,
disconnect mid-recovery), a11y of the cast button/menu, docs only on
decision change.

## Verification

- Unit: hook state machine (idle→connecting→casting→disconnected), LOAD
  payload shape, progress writes from polled status, receiver header
  injection + status mapping.
- Browser (Playwright, mocked `chrome.cast`): button appears only when the
  Cast runtime loads; connect/disconnect round-trip; position handoff both
  ways; no-cast browsers unaffected.
- Manual (runbook): whitelisted device → cast → seek/captions/server switch
  → disconnect resumes on phone; expiry renewal mid-cast; kill receiver
  mid-play (sender offers resume).

## Open questions

1. Cast Developer Console registration owner + test-device whitelist.
   (Still operator work; blocks only hardware verification.)
2. Receiver app ID wiring: config-only (`NEXT_PUBLIC_CAST_RECEIVER_ID`),
   unpublished while testing. (Implemented; button hidden until set.)
3. CORS check on first-party subtitle files from the receiver origin. (P2.)
4. Guests may cast by default: the sender session exists for guests and
   progress stays device-local, mirroring local guest playback. Restrict to
   members later if that proves wrong.
