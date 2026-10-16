# Subtitle aliases, standard quality and exact intros

Member jobs: select subtitles without duplicated language groups, recognize a stream’s quality, and skip a known intro without losing story content. The Anime browse addition reuses the existing catalog advertising component. The earlier Home recommendation shelf and compact subtitle-panel redesign remain in place.

## Delivered behavior

- ISO language aliases such as `en` and `eng` share one language row. Regional variants remain distinct. Each original discovery code retains its paging cursor, and the merged group retains all distinct tracks and local selections, including partial provider failure and retry.
- Settings and HLS/DASH rendition labels use standard resolution tiers. Cropped 1921 × 802 video reads as 1080p; 1280 × 534 reads as 720p. Quality continues to show actual decoded dimensions. Selection preserves each engine rendition identifier and observed-frame protections.
- Populated Anime featured rails have the shared early catalog banner. Empty rails omit it. Existing responsive unit sizing, isolated creative loading and blocked/unfilled collapse behavior remain owned by `AdSlot`.
- Exact provider intro ranges take precedence. Where those are absent, Watch and public Consumit embeds request optional timing metadata after the current source loads its actual runtime. Missing data keeps Skip intro hidden, as explicitly selected by the user. Paused playback permits a manual skip even when auto-skip is enabled. Source, title and runtime changes invalidate pending timing responses.

## Metadata adapters

The timing service uses fixed public metadata hosts and never supplies media. Movie/series requests include exact TMDB identity and decoded runtime; anime requests resolve canonical AniList identity to MAL, preserve episode identity and reject records more than five seconds from decoded runtime. Unknown anime mappings remain empty. Mixed openings are excluded rather than skipping scenes with story content.

The [TheIntroDB contract](https://theintrodb.github.io/theintrodb-npm/types.html) documents millisecond timestamps and a null start as the beginning of media; that explicit marker becomes zero. Omitted timing fields fail validation. Its runtime parameter selects the closest release, so timings still depend on upstream cut accuracy. The [AniSkip client](https://github.com/aniskip/aniskip-extension/blob/main/src/api/aniskip-http-client/aniskip-http-client.ts) supplies episode intervals in seconds. There is no generated or fixed-length intro fallback, and metadata availability cannot establish coverage for every title.

Reads reject redirects, schema-check identity, bound bodies to 64 KiB and have a three-second total deadline. Invalid, reversed, conflicting, out-of-runtime or excessively long ranges return no skip. Concurrent requests coalesce; cache size, cache lifetime and active reads are bounded. Test applications use empty metadata fixtures by default.

## Verification

- The duplicate-language, cropped-quality and Anime-banner regressions failed before their changes and passed afterward.
- Relevant UI suites passed 92 tests, followed by the additional missing-ICU regression and focused subtitle rerun. Browser checks passed all four exact/missing metadata cases on desktop Chrome and Chrome touch with real fixture decoding and seeking.
- Relevant web suites passed 56 tests covering Anime browsing, Watch, public embeds and browser metadata validation. API suites passed seven tests covering identity, units, runtime matching, beginning markers, hostile ranges, malformed/oversized responses, coalescing, stalled lookup deadlines and route validation, including season-zero specials.
- UI/web/API lint and type checks passed; web/API production builds passed. Changed-source whitespace checks passed. The keyboard transport test now establishes keyboard modality instead of inheriting earlier tests’ mouse modality.

Changes are in the shared workspace. No container rebuild, public deployment or database migration was performed for this slice. Upstream intro accuracy, title coverage and actual ad fill remain dependent on the configured services; deterministic checks do not certify those external conditions.
