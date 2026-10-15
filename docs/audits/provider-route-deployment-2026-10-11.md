# Production provider route deployment — 2026-10-11

The owner requested a VPS code update so the working and failing provider paths can be tried on the live site. The release adds the measured Vixsrc browser-player alternative while retaining the original Direct route and the existing LookMovie same-OVH fallback.

## Deployment

- API release: `e84060152707-20261011T183838635Z`, healthy.
- Runtime source changes: `packages/provider-sdk/src/adapters/frames.ts` and `apps/api/src/playback/configured-providers.ts` only. Uploaded file hashes and the current remote source revision were checked before installation.
- New registration: `vixsrcframe`, Embed, movies/series, exact `vixsrc.to` origin. Canonical published movie/episode paths are constructed without an OVH page lookup. This is frame candidate resolution, not server-side playback-health evidence.
- The new frame uses the existing Watch/Admin external-player surface and explicit plain-frame policy. Provider controls and unavailable progress sync remain disclosed. Plain frames permit provider popups and top navigation; the short browser samples do not establish their absence during a full title.
- Configuration now has 50 base rows and overrides. The 49 existing override values were verified unchanged. The new row is independently enabled and placed first within the final Embed tier; Direct → Relay → Embed remains the automatic order. Existing Direct provider order and delivery modes were preserved.
- The existing web image remains `e84060152707-20261011T021152629Z`; no web source change is needed for the existing frame surface. The independent LookMovie media process remains `e84060152707-20261011T170313613Z`; its secret, persistent budget and running process were preserved.
- SDK checks: 332 passing. API registration checks: 25 passing, including exact-origin and delivery mismatch rejection. SDK/API type and lint checks, the production image build and HTTPS smoke passed.
- No additional server, subscription, cloud account or paid Worker plan was provisioned.

## Real Watch checks after activation

Fresh isolated Chrome contexts load `https://consumit.online`. The harness pins only `providerId` in the real API resolution request; session responses, scripts, media and referrer policies remain deployed. A frame is counted as playing only after video dimensions and advancing playback are observed inside its provider document, independently of the frame load event.

| Route | Sample | Result |
| --- | --- | --- |
| `vixsrcframe` / Embed | Movie 550 | 1280×720 decoded, more than five seconds advancing; provider controls |
| `vixsrcframe` / Embed | Series 1396 S1E1 | 1280×720 decoded, more than five seconds advancing; provider controls |
| `lookmovie-relay` / same-OVH Relay | Movie 680 | 1920×816 decoded, seek passed, 20 seconds advancing; same-session renewal issued a fresh capability that decoded |
| `purstream` / Direct | Movie 550 | Decode and seek passed; 1,805 subtitle cues; uploaded SRT and VTT both selected and rendered |
| `purstream` / Direct | Series 1396 S1E1 | Decode and seek passed; 587 subtitle cues |
| `cookiebakers` / Direct | Movie 550 and series 1396 S1E1 | Both decode and seek passed at 1920×1080; provider captions present |
| `animeparadise` / Direct | Anime 21 episode 21 | Decode and seek passed at 1440×1080 |
| `kazora` / Direct | Anime 19 episode 1 | Decode and seek passed at 720×540 |
| `rivecitadel` / Direct | Movie 550 and series 1396 S1E1 | Both decode and seek passed; selected rendition varied between samples |
| `streamvault` / Direct | Movie 550 | Decode and seek passed at 1920×800 |
| `evion` / Direct | Series 1399 S1E1 | First-frame evidence, then seek timeout in two fresh Watch runs despite omitted Referer; not a passing playback/seek check |

## Remaining Direct failures

A separate 24-sample diagnostic sweep requests production-issued Direct sources and tests them from the production browser origin. It overlaps the brief API replacement: initial AnimeParadise/AnimeKai 502 responses are not used as steady-state availability evidence. AnimeParadise subsequently passes actual Watch. A fresh AnimeKai request resolves after activation but its issued media fails in the viewer browser and returns 404 from Windows; the earlier egress comparison supplies the fuller diagnosis.

| Original Direct route | Current sample evidence |
| --- | --- |
| `vixsrc` movie/series | Production resolution unavailable; upstream challenge from the tested OVH/Worker lookup paths remains unresolved. Use the separate `vixsrcframe` alternative. |
| `lookmovie` movie | Production resolves, but the issued stream is unreadable/non-media at the viewer location. Use `lookmovie-relay`. |
| `animekai` anime | Fresh production resolution succeeds; browser media fails and Windows receives 404. |
| `rigel` movie/series | Resolution succeeds; media manifest receives 403. |
| `kyren`, `animekitsu`, `recloud` anime | Pinned production sample returns `PLAYBACK_UNAVAILABLE`. No claim that every catalog title is unavailable. |
| `vidrift` movie/series | Pinned production sample returns `PLAYBACK_UNAVAILABLE`. |
| `kisskh` movie/series | Pinned production sample returns `PLAYBACK_UNAVAILABLE`. |
| `streamvault` series | Pinned episode sample unavailable; its movie sample passes. |
| `evion` series | Actual Watch seeks fail twice, as above. |

The generic injected HLS diagnostic does not include Consumit's raw-VTT loader and reports Purstream parsing failures even though the actual deployed player passes both samples. Its initial Evion Fetch probe also differs from the actual Watch policy. Real Watch results take precedence. None of these diagnostic failures were converted to a successful health state merely because resolution returned a source.

Other configured Worker Relay providers and older Embed providers were preserved but were not all retested in this deployment. Full-title playback, wider browser/device coverage and larger relay concurrency remain unverified.

## Operator use and evidence

Open [Watch movie 550](https://consumit.online/watch/movie/550), open Settings → Server in the native player, and select the exact provider. `vixsrcframe` uses the top-level Server selector once the external-player surface appears. Select `lookmovie-relay` for LookMovie through the existing OVH media route. Frames control their own subtitles; SRT/VTT uploads remain part of the native Consumit Player.

Sanitized local reports are in the ignored `local/production-playback` directory: `vixsrc-watch-report.json`, `lookmovie-watch-report.json`, `production-watch-report.json`, `extra-production-watch-report.json`, `evion-repeat-watch-report.json`, `public-issued-direct-roster-no-referrer-report.json`, and `public-issued-direct-animekai-no-referrer-report.json`. These contain sample verdicts and hostnames, without signed media URLs or secrets. Vixsrc movie/series screenshots show the actual deployed Watch surface.

## Rollback

Private rollback directory: `/opt/consumit/infra/secrets/vixsrc-frame-backups/20261011T183838257Z`. It contains the prior two runtime source files, provider base, production environment and private build/activation logs. The installer automatically restores these and removes only its added override on a deployment failure. For a later operator rollback, first check that these files/settings have not changed since activation, restore the recorded source/environment/base, remove only `vixsrcframe`'s override with a provider-config revision increment, then recreate API and refresh the gateway. The previous API image `e84060152707-20261011T170313613Z` remains available. Do not roll back the independent LookMovie media process, reset its budget or restore unrelated provider overrides.
