# Chromecast device testing

Automated suites cover the sender state machine, the player chrome, and
Watch integration with a mocked Cast SDK. An opt-in browser flow also stubs the
SDK and verifies the explicit device-picker step, the starting phone checkpoint,
and resume from the TV's latest position after disconnect. Set a non-empty
`NEXT_PUBLIC_CAST_RECEIVER_ID` before starting the experience test server and
run `bun run test:experience -- tests/experience/watch-cast.spec.ts`. A real
device is still required before calling casting done. Receiver bugs (header
injection, codec support, idle behavior) only reproduce on hardware.

## Prerequisites

1. A Chromecast or Cast-enabled TV on the same network as the test sender.
2. One custom receiver registered by the app owner in the Cast Developer
   Console with its URL pointing at the deployment under test
   (`https://<app>/cast/receiver.html`). This is a shared app configuration;
   members do not register or provide their own receiver IDs.
   For local testing, host the receiver on the LAN and register that URL on a
   whitelisted test device. The receiver SDK itself always loads from Google;
   only the receiver app URL changes.
3. `NEXT_PUBLIC_CAST_RECEIVER_ID` set to that shared app ID before building
   the web deployment under test. Without it the Cast SDK and device picker
   cannot start, so casting is unavailable to every member on that build.
4. A title with a proxy-delivery source (most reliable on TV hardware) and
   one with a direct source.

## Pass criteria (P1)

1. The cast button appears only in Chrome/Edge with the receiver ID
   configured; it stays hidden in Firefox/Safari and when unconfigured.
2. Connect → TV shows backdrop, title, and playback from the phone's
   position; the phone shows the casting panel with device name and position.
3. Pause, seek, and volume from the phone act on the TV within two seconds.
4. Disconnect (phone button or TV app exit) resumes the phone player at the
   TV's position with play intent.
5. Let a 31-second lease expire mid-cast: the TV reloads and keeps playing
   without interaction.
6. Switch servers mid-cast: the TV follows to the new provider; a dead TV
   load falls back to the phone with the "Lost the TV connection" notice.
7. Member history and progress after a cast session match a local session of
   the same watch (position, completion, telemetry `started`/`ended`).

## Known P1 limits (P2/P3)

- Captions and alternate audio on the TV (P2: needs subtitle CORS + track
  parity verification on hardware).
- TV-side fatal errors surface only on the TV; the phone notices stalled
  position (P3: sender-visible TV error recovery).
- Direct-delivery sources needing `referer` hints are best-effort on TV
  hardware until session header hints are plumbed (P3); proxy sources are
  fully supported in P1.
