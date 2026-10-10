# Home recommendations and subtitle selection

Member jobs: choose the next title after a completed watch, and select or adjust subtitles without leaving playback. Scope is an extension of the existing FilScreen Home and Consumit Player.

## Direction contract

THESIS: A completed watch provides a specific reason for a poster shelf. Subtitle tracks are the panel's primary task, with adjustments in a compact persistent footer.

OWN-WORLD: Preserve the existing midnight surfaces, warm ivory type, sparse orange selection and shared portrait cards. No replacement visual identity.

STORY: Choose a recent completed movie or series, browse catalog recommendations, and open its title. In playback, find a language, select a track, or use Appearance, Sync and Upload.

FIRST VIEWPORT: Home places the shelf immediately after Continue watching, with an inline watched-title selector. The subtitle panel has a compact header, Off, search, language groups, and a three-action footer. Only track browsing scrolls.

FORM: Existing-world extension; the supplied poster reference and current shared components pin the direction. No random direction selection or new raster assets.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Behavior

The Home shelf reads validated device-local completed progress, including the existing 95 percent completion threshold. It resolves up to five recent unique movies or series through the bounded catalog batch, then fetches the selected title's catalog recommendations. It omits the resolved watched seeds and duplicate recommendations. Missing history hides the shelf; unavailable recommendations offer retry, and empty recommendations invite another watched title. This is catalog related-title discovery, not computed Taste Match. Anime and imported server-only history remain outside this device-local slice.

Subtitle tools retain appearance, offset and file-upload behavior. Language requests expose loading and a retry within that group while local tracks remain selectable. Discovery availability is one quiet notice without server credential details. Search preparation exposes its loading state and prevents competing selections. Regional language metadata renders distinctly.

Verification uses deterministic catalog and playback fixtures. No provider adapter or playback engine changes belong to this slice.

## Verification

The visual reviewer returned **ship** after inspecting Home and subtitle captures on desktop Chrome and Pixel 7 touch. The Home selector wraps without document overflow; subtitle tools remain visible beneath the contained browser. Failure states were reviewed through source and tests rather than captures.

Passed: 72 relevant shared UI tests, 29 relevant web tests, web/UI lint and type checks, and the optimized web production build. Browser checks verified native-language selection on desktop and touch, and populated Home and subtitle panel captures at both viewport sizes. Temporary capture tests were removed after verification. Screenshots remain under `.impeccable/review/` as development evidence; no new artwork ships.

Verification also uncovered a guest notification render crash: comparing an absent owner to an optional null action state attempted to read `state.busy`. The action hook now explicitly requires a non-null state, with a guest regression test. The subsequent production build passed.
