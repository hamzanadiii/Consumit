# Anime artwork and player heading — 2026-10-09

## Behavior

The anime name is the first Watch header line. The episode number and title are the second line. The name stays at 24px with a 32px line height during preparation, pause and playback on desktop and mobile. Long names truncate without changing the font size. Progress and playback source selection remain independent of these labels.

AniList queries request its `extraLarge` cover and retain `large` as fallback. The mapper accepts only HTTP(S) artwork URLs and falls back if the larger value is absent or invalid. Cache generation `anilist:v2` fetches the new mapped covers without removing existing data. Wide AniList banners are unchanged; this does not promise higher resolution for the supplied landscape cards or substitute uncertain TMDb artwork.

## Checks

- AniList mapper/adapter/client and stale cache: 17 passed using the project's Vitest runner. The new larger-cover regression failed before the implementation and passed afterward.
- Both release player packages: 62 passed each. Original checkout player packages: 200 / 201 passed.
- Anime heading integration case passed independently in both frontends, in the release and original checkouts.
- Desktop and touch heading checks passed: fixed computed font size during preparation, pause and play, media decoding and resume. Inspected the desktop/mobile captures. Mobile intentionally has no desktop preparation overlay.
- Both optimized release frontend builds, workspace lint and workspace type checks passed. Shared import/duplication checks passed for 682 production files.
- UI detector: zero blocking findings; eight inherited font-size advisories outside the changed heading.

## Running local app

The original frontend and API Docker images built successfully and both recreated containers report healthy. A fresh Chrome session on `localhost:8080` verified `ONE PIECE` alone on line one, a 24px computed heading size and episode information on line two (initial fallback `E1 — Episode 1`). The catalog cover exactly matches AniList’s official `extraLarge` field. The playback request was intercepted with a deterministic rejection: this verifies catalog/header rendering, not a live provider stream. Original checkout workspace type checks also passed. The alternate review container was not refreshed; both frontend source implementations and release builds were checked.

## Delivery

The reviewable slice is isolated on `codex/cleanup-playback-security` and adapted narrowly into the original checkout. Pending provider/UI edits and member data are preserved. No SQL migration or public deployment is part of this slice.
