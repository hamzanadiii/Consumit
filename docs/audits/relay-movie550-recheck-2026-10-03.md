# Movie 550 relay recheck

The owner reported that only Storm Boron played TMDB movie 550. This recheck supersedes any implication that the earlier short, mixed-title samples proved reliable movie delivery. Earlier WeCollege browser passes used TV 1399 S1E1 and a temporary HLS harness; this run drove the deployed Admin Browser check and its actual Consumit Player.

The same Chromium context resolved each provider and clicked Browser check for movie 550. Evidence records media HTTP status/kind/depth and public hostname only; auth, capabilities and raw upstream URLs are omitted. See [the sanitized evidence](./relay-movie550-recheck-2026-10-03.json).

| Provider | Result for movie 550 |
| --- | --- |
| Storm Boron | Decoded 1920×800, 75 frames at 3 seconds; subsequent seek timed out |
| Rive Zephyr | Returned `empty` before any media request; earlier successful resolution was intermittent |
| WeCollege Miami | Resolved relay source; no first frame; player reported manifest failure |
| WeCollege Boise | Resolved relay source; no first frame; player reported manifest failure |

A Miami repeat with Wrangler tail still observed multiple `exceededCpu` outcomes and “Worker exceeded CPU time limit” exceptions during the check. The CPU events did not expose a provider association in the sanitized capture, so they cannot all be attributed to Miami. Its browser trace independently confirmed a root 200, several media 200s, then an ultramoss.top media 403 and a headers failure before any frame. One root rewrite completed with 877,910 response bytes, but successful requests did not establish sustained playback. Thus compact encoding reduced work but did not eliminate Free runtime failures. CPU-limit responses can appear to the browser as opaque network/manifest errors; the earlier optimization must not be called a complete fix.

A further Miami first-frame attempt failed its root request with `net::ERR_FAILED`; a direct re-probe of the same unexpired capability returned 503. This corroborates runtime failure independently of the earlier segment 403. Bounded segment header probes compared bare, fixed public Referer and original source hints. Reference index 15 returned 403 bare and 206 with either Referer-bearing hint set. The other sampled prefixes returned 206. This identifies a separate cross-host header bug: the Worker dropped the recorded public `https://movy.sx/` Referer when following WeCollege roots to their independently approved segment hosts. Prefix delivery does not prove full-segment streaming succeeds.

The fixed recipe forwards only that public Referer for `wecollege-miami` and `wecollege-boise`, from `moon.zenoak.top` to `ultramoss.top` or `emberwave.top`. It does not forward Origin or arbitrary source headers across hosts. Every destination still needs independent approval. The regression test failed with a missing Referer before the fix; all 26 Worker tests, Worker TypeScript and changed-file lint pass afterward. This addresses the proven header failure, not the remaining Free CPU failures or overall reliability.

BingeBang, Nebula and Zeta retain the separate, already-recorded local-versus-edge failures (403/502). These findings do not establish that a paid plan would fix upstream refusals. PROVE's local gateway uses a different execution budget and outbound network. The header recipe was redeployed on Free. No plan upgrade, provider setting changes, media-policy expansion or additional relay server occurred during this recheck.

The current Free implementation has not demonstrated reliable playback for these movie streams. Any further relay change must be tested against this exact title through the actual player, with first frames, seeking, sustained playback and Worker runtime outcomes, rather than source resolution or a short standalone HLS harness alone.
