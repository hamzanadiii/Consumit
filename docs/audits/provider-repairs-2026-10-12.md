# Provider repairs and AnimeKitsu season identity — 2026-10-12

## Member job and routing boundary

Recover CookieBakers, AnimeKai, AnimeKitsu, Evion and Rigel on deployed Watch, and investigate Vixsrc/LookMovie without purchasing infrastructure or enabling paid Workers usage. The later reported AnimeKitsu bug is specifically playing another Jujutsu Kaisen season under season-1 metadata. Video decoding alone is not sufficient identity evidence.

Provider requests stay Cloudflare except the previously approved Miami Relay API lookup. No OVH media process is enabled. Provider ordering, health, current Admin configuration, source validation and disabled/removed entries remain authoritative. Only Rigel and AnimeKai change delivery mode to Relay; other override fields are preserved with a guarded transaction and revision/audit update.

## AnimeKitsu reproduction and correction

The actual `/live-search` response for both `Jujutsu Kaisen` and `Jujutsu Kaisen Season 3` contains only `Jujutsu Kaisen Season 3`, slug `jujutsu-kaisen-3rd-season`. The old word-overlap matcher accepts a score of 0.4; the bare season-1 title scores 0.5 against season 3 and resolves its episodes. Six new regressions initially reproduced accepting a different season, movie, part or ambiguous row.

The adapter now matches exact normalized canonical aliases, compatible explicit season shorthand, and explicit season-1 labels for a bare first-season title. It understands ordinal labels, preserves Unicode aliases and rejects conflicting season markers in the slug. A bare alias cannot erase a canonical later-season qualifier. No broad word-overlap fallback remains. Equal best matches across different slugs fail closed. The selected episode link must identify the same approved site, selected slug and exact canonical episode; another work, episode or origin is not fetched.

Live API-container-to-diagnostic-Worker checks repeated AniList **113415 E2** three times: `empty`, zero sources, no anime/watch page fetch. The correct **172463 E1** request selects `jujutsu-kaisen-3rd-season`; its catalog episode is “Execution.” The final production API request pinned to AnimeKitsu for 113415 E2 returns **503 PLAYBACK_UNAVAILABLE**, rather than a season-3 source. The upstream index's missing season 1 is not made available by changing our matcher. Automatic selection can continue to another provider; a member pinning this missing provider needs another source.

The final deployed Watch check for 172463 E1 decodes 1280×720, seeks and resumes with advancing frames/time while retaining AnimeKitsu. Earlier successful season-3 decoding must not be described as proof of season-1 playback. This checks the canonical lookup/episode path and sampled delivery, not a fingerprint of every upstream recording.

## Other changes

- CookieBakers retains its bounded retry recipe and gets per-read timeout windows of 7, 3 and 2 seconds with existing retry gaps. A hung first read can recover within the 15-second Worker invocation rather than spending the entire attempt on one upstream read. Tests cover recovery and a healthy five-second first read; no unbounded retry loop is added.
- Worker provider configuration uses a discriminated adapter schema. Evion and Rigel inspect HLS once instead of duplicating tokenization. Rigel lookup reads only an 8 KB manifest prefix because the probe needs the header/first reference; full delivery validation remains separate.
- Exact per-provider Resolver origins select the reviewed Europe placement for AnimeKitsu, Evion, Rigel and AnimeKai. An attempt invokes one origin, with no regional retry or generic API lookup fallback.
- Rigel and AnimeKai use the separately deployed Europe Cloudflare Media Relay with exact reviewed host policies. Matching placement hints do not guarantee matching upstream egress. Browser checks, rather than placement alone, establish the sampled compatibility.
- Rigel's authenticated Media Worker control route fetches up to 2 MB of raw HLS through Cloudflare. The API verifies the returned base and full reference graph, compiles playlists with a maximum of 6000 references, and signs child controls to the API and segments/maps/keys to Cloudflare. A transport-spy regression proves that this path never calls the API's native upstream transport. Other graph limits remain unchanged.
- AnimeKai's multi-second proof solver exceeded Worker CPU. Only its pure nonce/difficulty calculation now runs in up to two isolated API child processes, with no inherited credentials, fixed compiled code, bounded input/output and an eight-second deadline. All upstream HTTP requests stay Cloudflare. The helper uses a distinct key, fixed endpoint, cancellation and route rate limit; capacity failure fails the provider attempt. The callback adds one Worker subrequest, not another Resolver invocation. The first rollout failed because Workers reject `redirect: error`; the deployed correction uses manual mode and rejects redirects before forwarding any credential. Tests cover the runtime-compatible mode and redirect refusal.
- Both Player controllers now give seeking a separate 30-second watchdog. Ordinary stall recovery retains its existing deadline. The tested Rigel/Evion seek paths no longer prematurely recover to another provider; controls and visual design are unchanged.

## Final production evidence

The browser harness pins only the requested provider/audio in the real API resolve request. It uses deployed Watch scripts, genuine API results and genuine video. A sample fails if recovery switches providers. Passing samples require initial decode, advancing time, seek settlement, and further advancing decoded frames/time after seeking.

| Provider | Active delivery | Canonical sample | Final evidence |
| --- | --- | --- | --- |
| CookieBakers | Direct | Movie 550 | 1280×720 decode, seek/resume; earlier 12 fresh Worker attempts also passed |
| AnimeKitsu | Direct | AniList 172463 E1, SUB | Correct season-3 row, 1280×720 decode, seek/resume; season-1 113415 E2 explicitly unavailable |
| Evion | Direct | Series 1399 S1E1 | 1280×720 decode, seek/resume, 21 observed CDN responses 200 |
| Rigel | Cloudflare Relay | Movie 550 | 1280×534 cropped video, seek/resume, 26 observed Cloudflare media responses 200 |
| AnimeKai | Cloudflare Relay | AniList 21 E1 | SUB and separate DUB checks decode 1280×720, seek/resume; 18/17 observed Cloudflare media responses 200 |
| WeCollege Miami | Existing Cloudflare Relay | Movies 550 and 680 | 720p, seek/resume, all 40 observed media responses 200; uploaded VTT selected/rendered on 550 |
| Vixsrc | Direct setting retained | Movie 550 | Lookup blocked; tested default, Europe, US West and Singapore routes do not produce a usable source |
| LookMovie | Direct setting retained | Movie 550 | Lookup blocked; tested regional `lmscript.xyz` calls return 403; no unverified relay activation |

After the redirect correction, three diagnostic and three production fresh AnimeKai lookups pass; two additional monitored lookups pass. Three final production AnimeKitsu season-3 lookups pass. Two additional Evion and Rigel lookups pass. These results do not guarantee every title, browser, audio lane, full-title duration, future upstream availability or larger concurrency. No claim that Vixsrc/LookMovie are permanently impossible is made; they remain unavailable from the tested approved routes.

## Later anime-frame and Mirage acceptance

The member then reported that clicking `reanimeframe` and `megaplayframe` did not show either frame, and requested Mirage in production. Real API requests pinned to AniList 113415 E2 return 503 for both on default lookup. Same-config API-originated Europe calls return one independently validated frame each: ReAnime uses one upstream lookup; MegaPlay uses three and still requires exact AniList ID. Browser fixtures retain the shipped sandbox settings and decode 1080p. Production now adds both IDs to the Europe Resolver map. Actual Watch clicks switch from the owned Player to ReAnime (200, restricted sandbox) and then MegaPlay (200, existing plain-frame declaration); each retains its requested provider and plays 1920×1080 with advancing frames/time. No relaxed identity match or new sandbox exception is introduced.

Mirage resolves from Europe but its Cine4k root manifest returns 403 with the production browser Origin and 200 valid HLS without Origin. Browser Direct consequently fails at the manifest. The relay canary uses only the reviewed four-host scope: Cine4k plus `carwashonline.site`, `nectronincllc.store` and `buswashsolarpanel.click`. It passes 720p decode/seek with 21 observed 200 relay responses. The production roster appends one movie-only `rivemirage` row, enabled as Relay at priority 100; a guarded transaction applies only its override and records a revision/audit entry. Existing rows and unrelated current Admin settings remain untouched. The checked-in example ships the row disabled.

Actual deployed Watch movie 550 returns a Mirage Relay session and passes 1280×720 decode, seeking and advancing frames/time after seeking (20 observed media responses 200). A separate live check renders a selected uploaded VTT and observes 18 media responses 200. Mirage's upstream label is “4K,” but these checks do not establish 4K rendering. Unapproved external provider-caption URLs are filtered by normal source validation; provider captions are not claimed to work. An additional UI source-menu check verifies that the new row can be selected.

The final read-only roster snapshot contains 51 configured rows: 22 Direct, 20 Relay, 9 Embed. It records 8 enabled Direct (one audio-only), 7 Relay and 7 Embed; these current enable choices differ from the earlier sweep and were preserved rather than reset. Vixsrc/LookMovie remain unavailable on the tested routes and are currently disabled in this snapshot.

The first startup attempt failed with `EACCES` on the private mounted roster because the atomic write created a root-owned 0600 file. Its automatic content/environment rollback retained that unreadable ownership. The previous API image was restored, the roster became readable by the image's verified uid/gid 1000/1000, and readiness returned 200. The corrected deployer preserves uid/gid/mode, stores metadata in the private backup, and performs a read test with the unprivileged API image and no network before restarting. The subsequent new API starts healthy and production smoke passes. No web container is restarted during this later rollout. Relevant configuration/resolver tests (32) and API types pass.

Final API is `consumit-api:e84060152707-20261012T045819613Z`; regional Media Worker is `ff000e07-58ef-4e2b-864f-c3b6d01a0581`. Resolver versions and the running web image remain as listed below. The corrected additional private rollback snapshot is `/opt/consumit/infra/secrets/frame-mirage-backups/20261012T045818905Z`; the failed-attempt snapshot `20261012T045332130Z` is retained for incident traceability. Use the corrected snapshot's roster metadata when restoring a mounted private file.

## Capacity and request accounting

The final regional tail reports successful outcomes with sampled CPU: AnimeKai 15/20 ms, Rigel 14/20 ms, Evion 8 ms. AnimeKai uses 8 subrequests, Rigel 13, Evion 4. The pure solver no longer consumes multi-second Worker CPU, but remaining observed CPU still exceeds the nominal 10 ms Free allowance for some invocations. Isolate flexibility is not a stable capacity guarantee. The 15-second / 50-subrequest guard, account quotas, API computation pool and rate limits can still fail attempts; the existing provider waterfall handles those failures. No paid usage activation was performed. OAuth could read Worker usage-model settings but not account subscriptions (403), so this audit does not claim independent verification of the billing subscription.

One uncached successful Direct attempt invokes one Resolver request; each subsequent provider attempt adds another. Direct manifests/video use zero Media Worker requests. Each relayed media asset invokes its Media Worker, including a Rigel control playlist fetched through its authenticated control endpoint. Additional regional deployments share account usage; they do not each create a new free quota. Existing API CPU/control requests have operational cost even without another subscription.

## Versions and rollback

| Component | Final active version |
| --- | --- |
| API image | `consumit-api:e84060152707-20261012T045819613Z` |
| Web image | `consumit-web:e84060152707-20261012T034952049Z` |
| Default Resolver | `6930baf9-149b-4051-991a-9aa3395c9be1` |
| Europe Resolver | `3d400cc6-ca9f-4c2e-8de5-b19dc13949a6` |
| Europe Media Relay | `ff000e07-58ef-4e2b-864f-c3b6d01a0581` |
| Existing Media Relay | `36bfdc49-0a84-49bf-b032-1dd85ca9186b` (preserved) |

Guarded installs retain private rollback snapshots under `/opt/consumit/infra/secrets/provider-fix-backups/20261012T034106239Z`, `seek-fix-backups/20261012T034951981Z`, and `provider-compute-backups/20261012T040837867Z`. These include prior private environment/source preimages and the earlier provider-mode snapshot where applicable. Roll back in reverse dependency order using the runbook and preserved image tags; keep Worker keys and API secrets aligned. Removing a regional map is not evidence that default egress works. Do not restore the wrong-season matcher to hide missing catalog content.

SDK 359 tests, Media Worker/Resolver 62 tests, relevant API 135 tests and controller 33 tests pass, with relevant package types/lint, production builds and HTTPS smoke. The computation program also passes its known vector after bundling and through the actual public API helper from the production container. New tests cover redirect refusal, proof input/code-injection boundaries, pool cancellation/capacity, Rigel control scope, per-provider origins and season identity.

The final local source check found an older configuration module without the deployed Worker's canonical metadata hooks, AnimeKai calculation callback or Vixsrc Frame registration. The calculation regression reproduced zero helper calls; the Vixsrc registration regression and full example-roster validation also failed. Only those adapter seams and discriminated configuration dispatch were reconciled with the retained provider options/rows. The final Worker suite (62), configuration/resolver checks (29), remaining relevant API checks (103), API/Worker types and targeted lint pass. All 52 checked-in example rows validate with canonical metadata callbacks. This local reconciliation does not replace or redeploy the already accepted live Worker versions.

Temporary diagnostic Workers and short-lived source/capability/key copies are removed after validation. Production Worker secret stores and private API rollback snapshots remain; no secret or signed source is committed. Local diagnostic scripts/reports remain under the ignored `local/production-playback` directory.
