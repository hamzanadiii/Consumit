# Network screen repair — 2026-10-12

The member job is browsing Followers and Following without a large empty profile hero or controls intended for another viewer. The reported owner screen passed an owner profile DTO into a visitor screen: its missing public member ID produced a self-Follow action, and its different statistics shape produced a blank Ratings count. Relationship pages also retained their initial React state when the username or view changed.

Network now uses the existing compact `ProfileArchiveShell`: one Network heading, the member portrait and identity, owner Edit profile or a valid visitor follow/sign-in action, and counted Followers/Following tabs above the list. The API owner discriminator governs the projection and navigation. Owner Ratings uses the same compact archive boundary. Collections remount per username/view, resetting pages, cursor and errors. Profile navigation reveals its active tab horizontally on arrival and resize without scrolling the page vertically.

Verification:

- Web lint and type checking pass; the optimized production build passes.
- All 83 web test files pass, covering 501 checks. New regressions cover the owner header, guest/public navigation and counts, the API owner discriminator, and replacement of relationship pages/cursors. Existing checks cover collection retry, empty states and follow failure/recovery. An initial broader run had two overly broad test queries and one playback timing failure; scoped queries and a quiet complete rerun pass.
- Two deterministic Chrome scenarios pass at 1440px and 390px: authenticated visitor Follow, owner Network/Followers/Following navigation, real counts, empty and populated lists, guest sign-in paths, compact header, no page overflow and active Network visibility. Owner and visitor visuals retain the current archive design. Captures live under `.impeccable/review/network/`; captures made immediately after navigation can include the existing session-bootstrap state before hydration.
- The targeted design detector reports no findings. The source diff passes whitespace checks.

Deployment succeeded at `https://consumit.online` with web image `consumit-web:network-20261012T203718898Z`. Six reviewed profile source files were installed against their verified production preimages. The web container is healthy; internal and external HTTPS production smoke checks pass. Inspection of its built bundle confirms the existing subtitle upload, appearance preview, Analytics and settings changes remain present. Owner behavior was verified with deterministic authenticated fixtures; no production member records or publication preferences were changed to enable a live owner test.

The previous web image is `consumit-web:analytics-20261012T193851257Z`. Exact source/configuration backups and the deployment result are stored at `/opt/consumit/infra/secrets/network-release-backups/network-20261012T203718898Z`. `CONSUMIT_WEB_RELEASE` is the only changed production setting. The provider roster and other configuration values are preserved, and API/gateway/SES images remain unchanged. No database migration, Worker rollout or data-service restart occurred.
