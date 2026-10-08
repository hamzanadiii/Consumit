# Independent Consumit frontend

The member job is to discover something to watch, continue playback, and keep a personal record of the stories that matter. The second frontend is separately runnable in `apps/next-web`, with its own `packages/next-ui` presentation package and local design authority. The original `apps/web`, `packages/ui`, and running deployment remain available.

## Experience

Horizontal catalog navigation, a searchable account menu, and a four-destination mobile dock connect discovery and the private museum. Cinematic key art, selectable features, and permanently readable poster captions lead discovery. A broad profile banner leads into ordered favorite art and the member's actual private diary, reviews, collections, history, and watchlist. Account statistics are derived from member records. There is no added public social network.

Cinema, Paper gallery, and Dusk are selectable atmospheres. Gallery and Journal control profile composition. Preferences use a separate `consumit.next.*` namespace; they persist on this device and honestly report unavailable storage. Quiet motion and the system motion preference suppress spatial movement and feature autoplay. The player retains configured validated sources, adapter boundaries, source recovery, independent progress, quality/audio/subtitles, fullscreen, keyboard controls, and accessibility. Its new presentation adds a keyboard guide and a reversible elapsed/remaining time control.

## References and asset origin

- [Apple TV redesign](https://www.apple.com/newsroom/2023/12/redesigned-apple-tv-app-elevates-the-viewing-experience/): art hierarchy and unified browsing.
- [Netflix TV experience](https://about.netflix.com/en/news/unveiling-our-innovative-new-tv-experience): discoverable navigation and contextual selection.
- [Letterboxd](https://letterboxd.com/about/faq/): films as a personal journal.
- [MUBI collections](https://mubi.com/en/collections): editorial film shelves.
- [MyAnimeList](https://play.google.com/store/apps/details?id=net.myanimelist.app): anime discovery and tracking.
- [Shelf](https://apps.apple.com/gb/app/shelf-music-books-movies/id1667391175): a personal cultural archive.

Mobbin was requested, but its available screen/flow tools require a paid plan and did not return reference assets. The implementation uses the public primary references above. The Impeccable streaming-wall quality card was supplied as a direction reference but could not be visually fetched; there is no approved visual comp, and review uses the code-led direction contract.

Catalog images come from the existing first-party TMDB/AniList catalog responses and existing image configuration. The lab's catalog fixture records their original URLs. Existing Consumit brand/vector assets and the local demonstration videos were copied from `apps/web/public` without alteration. No generated raster assets or downloaded third-party design screenshots ship. Manrope Variable is self-hosted from `@fontsource-variable/manrope` (SIL Open Font License); existing Charter font resources are retained for journal reading.

## Platform and delivery

The new frontend proxies `/v1` to the same first-party API. Provider foundations, database schema, authentication contracts, and playback validation are unchanged. `compose.next.yaml` adds only the new frontend service on port 3080. Its runtime lab gate defaults to disabled. Existing Docker targets remain intact, with additive workspace manifests needed by Bun's frozen lockfile.

The Docker build receives the API proxy destination explicitly, because Next rewrites are written during the build. Local development API configuration accepts localhost origins. A production API still enforces its configured exact application origin; an independent production deployment must configure that origin for the chosen frontend before enabling account mutations. This frontend does not weaken that check.

Visual QA uses labeled deterministic member fixtures and a local demo video. Live guest checks cover catalog navigation, search entry, and sign-in. The fixture does not certify external providers or a real authenticated member session. Automated coverage includes existing member/catalog/recovery contracts, new navigation/session failure behavior, preference persistence and denial, favorite save rollback, and player time toggling without seeking.
