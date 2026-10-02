# Future cinema: research proposal

Researched 2026-10-02. **Proposal only:** this note is not active design authority and does not supersede `DESIGN.md`, `docs/COMPONENTS.md`, product scope, or playback ADRs. No application implementation changes are included.

## Binding constraints from the member brief

Updated 2026-10-02: speed means runtime performance: responsive pages, navigation, and playback startup. The owner explicitly prioritizes design quality over execution speed and requests an original frontend, replacing the incumbent visuals. New tooling, assets, fonts, exports, and services must require no purchase or subscription. Do not introduce paid image generation, watermark-removal upgrades, paid templates, or dependencies on temporary trials/free-tier credits.

This is a zero-additional-purchase redesign plan. Existing development/agent usage, production hosting, domain, and catalog/media permissions are separate project costs; this note does not establish that the whole deployed service can operate at zero cost. In particular, do not call all catalog use free: [TMDB's FAQ](https://developer.themoviedb.org/docs/faq) distinguishes non-commercial API use from commercial arrangements.

## Recommended toolkit

Selection is a recommendation for Consumit's existing React/Next.js stack, not an objective ranking of every tool. Keep native semantics, first-party playback ownership and controllers, configured provider adapters, and independent member progress/history. Replace the visual components, navigation, layouts, and player presentation.

| Tool | Proposed role | Why and boundary |
| --- | --- | --- |
| Existing Next.js / React / Tailwind | Build new frontend components against current contracts | Keep the framework and functional seams. Author a replacement visual system; do not reuse the incumbent shell, cards, or artwork style. |
| Native CSS | Default for the cinematic reveal and interface feedback | Start with short opacity/transform transitions, architectural layout, and still imagery. No new animation dependency is required for the first prototype. |
| Motion for React core | Conditional addition if CSS cannot express the approved interaction cleanly | The core is MIT licensed; paid Motion products are outside the plan. Add only for a concrete requirement and review bundle impact. [Docs](https://motion.dev/docs), [reduced motion](https://motion.dev/docs/react-use-reduced-motion), [license](https://github.com/motiondivision/motion/blob/main/LICENSE.md) |
| Existing Playwright and browser developer tools | Visual and performance verification | Reuse installed tooling for viewport captures, keyboard paths, request/bundle checks, and playback measurements. No paid monitoring service is required for this slice. |
| Blender | Optional offline creation of one original atmosphere asset | Blender is free and open source. Use only if existing permitted imagery does not meet the composition; local rendering takes time. Ship a compressed still, not a live 3D scene. [Blender](https://www.blender.org/about/) |

The first slice excludes Rive, Spline, Three.js/WebGL scenes, GSAP, paid Figma features, and paid image-generation workflows. Some excluded libraries are free; their setup/runtime complexity is unnecessary for this slice. The initial concept is a code-led browser prototype, so a design-service export is never a delivery dependency.

## Assets to use

- **Typography:** select new free faces for the replacement world. The browser studies self-host Sora, Unbounded, and Barlow Condensed from [Google Fonts sources](https://github.com/google/fonts/tree/main/ofl), with their SIL Open Font License files included. Paid foundry fonts are excluded. Production should load only the selected faces and needed weights.
- **Icons:** retain [Lucide](https://lucide.dev/license) for a consistent control family; its ISC license permits use subject to its notice requirements. Add bespoke brand graphics only where the shared icon vocabulary does not express the idea.
- **Spatial materials:** [Poly Haven](https://polyhaven.com/license) assets are CC0 and permit commercial use. Useful for HDR lighting, subtle metal, stone, and tactile surfaces in original renders. The CC0 statement covers assets, not every website element or its brand mark.
- **Deterministic demo footage and artwork:** retain only the neutral generated playback fixture for control verification, explicitly labelled as a test pattern. Do not reuse the old branded SVG posters. The browser studies use newly sourced NASA/JSC and NASA/JPL-Caltech/University of Arizona photographs with origin metadata and credits; [NASA media guidance](https://www.nasa.gov/nasa-brand-center/images-and-media/) applies. These are illustrative atmosphere for fictional preview titles, not real film artwork. [Blender Studio remixing](https://studio.blender.org/remixing/) remains an optional source after checking each download and licence; membership-only resources are excluded.
- **Real catalog artwork:** continue through existing catalog integrations rather than sourcing posters from inspiration websites. [TMDB FAQ](https://developer.themoviedb.org/docs/faq) requires approved logo/notice attribution and a commercial arrangement for revenue-oriented use, and says TMDB does not claim ownership of all images. Preserve the existing credits. [AniList terms](https://github.com/AniList/docs/blob/master/docs/guide/terms-of-use.md) limit commercial usage and prohibit competing non-complementary trackers and mass collection; availability through an API is not a blanket independent artwork license. These sources supply catalog metadata/artwork, not media playback rights.

## Inspiration sources are a separate pool

- ShotDeck subscriptions are excluded. Use the publicly accessible first-party studio case studies below for lighting and framing research.
- [FilmGrab](https://film-grab.com/about/): curator-built film still reference library. Use it to study composition and assemble reference links. Its about page does not establish production reuse rights, so it is not a shipping asset library.

The implementation recommendation is to select one signature transition and one cinematic artwork treatment, then measure the real Discover → title → Watch flow. Preserve readable controls, keyboard/touch access, reduced motion, missing-art/loading/error states, and playback responsiveness before expanding spatial effects. Freeze approved demo assets locally for visual work; asset provenance should record creator, source URL, license, attribution, and permitted uses.

## Visual reference shortlist

The translations below are design judgments drawn from the creators' work, not claims that their interfaces should be copied or their imagery reused.

| First-party reference | What to study | Proposed translation for Consumit |
| --- | --- | --- |
| [Apple Vision Pro Cinema Environment](https://support.apple.com/en-lamr/guide/apple-vision-pro/tan836d673da/visionos) | A dedicated environment for watching | A sense of entering a private theater; surrounding navigation recedes when watching starts. This is web art direction, not a promise of spatial hardware features. |
| [Territory Studio: Blade Runner 2049](https://territorystudio.com/project/blade-runner-2049/) | Physical, optical textures and the contrast between utilitarian and minimal geometric interfaces | Architectural framing, readable instrument-like controls, and original optical imagery. Avoid borrowing fictional screen clutter as product information. |
| [Territory Studio: DUNE](https://territorystudio.com/project/dune/) | Restrained, physically grounded controls and projected light | A small set of precise interactions that feel tangible; future technology can be quiet. |
| [Pentagram: Quad Cinema](https://www.pentagram.com/work/quad-cinema) | One identity spanning typography, signage, architecture, and illuminated displays | A consistent frame, typographic rhythm, and wayfinding system across discovery, profiles, and Watch. |
| [GMUNK: TRON Legacy](https://gmunk.com/TRON-Legacy) | Graphic structure, optical depth, and choreographed motion | Study the discipline of a signature reveal; author original assets and suspend decorative movement during playback. |
| [MUBI](https://mubi.com/en/about) | The relationship between streaming, curation, publishing, and cinema culture | Keep lists, reviews, and Circle discovery human and editorial within the futuristic world. |
| [Codrops: WebGL Image Transitions](https://tympanus.net/codrops/2019/11/05/creative-webgl-image-transitions/) | Motion reference only | Study pacing if useful; do not import its WebGL runtime into the first slice. |

## Recommended experience direction

The owner needs to see the alternatives before choosing. Three code-led browser studies compare **Obsidian** (a dark projection room), **Orbit** (a bright lunar observatory), and **Afterimage** (a cobalt/citron cinema programme). These are working design names, not product concepts or brand changes. No palette is pinned yet. Each has fresh Home, title, and Watch compositions on desktop and phone. The interface carries the spectacle before playback and becomes calm while watching.

- **Discovery:** one confident featured title, a prominent route back to Continue watching, and curated shelves with readable metadata. No invented personalization or member evidence.
- **Title detail:** a deliberate composition around key art, synopsis, real title facts, and one clear Watch action; episode selection preserves canonical identity.
- **Signature moment:** selected title artwork expands into the Watch composition as surrounding chrome dims. Playback preparation begins immediately; animation must not delay first frame, and an instant transition remains available.
- **Watch:** replace the visual presentation while retaining production media controllers and first-party control ownership. Controls remain understandable, captions legible, and recovery preserves progress. No persistent decorative animation over the film. The disposable study uses only a local neutral control demo; it does not replace the production engines.
- **After watching:** make the existing deliberate rating, review, and Diary paths comfortable; automatic completion remains private Watch History, not automatic publication.
- **Profiles, lists, and Circle:** express taste through artwork and editorial compositions using real records. Authentication, settings, support, and Admin keep compact task-focused layouts within the same system.

Do not promise live color sampling from every playback source. Browser-direct cross-origin media may prevent canvas readback. Start with a static artwork-derived palette or an authored still; any live effect is a separate measured experiment. [MDN canvas cross-origin guidance](https://developer.mozilla.org/en-US/docs/Web/HTML/How_to/CORS_enabled_image).

## Skills and delivery sequence

Use **impeccable** to lead product hierarchy, states, and quality and **prototype** to prove the signature transition directly in the browser. **design-taste-frontend** can supplement discovery art direction; it does not govern settings or Watch. Image-generation, brandkit, image-to-code, and Figma workflows are not required for this zero-spend slice. Avoid applying multiple competing skill presets to the same screen.

1. Capture the incumbent Home, movie and episode details, Watch controls, profiles, and mobile layouts; inventory shared components and assets.
2. Build three distinct code-led Home → title → Watch studies with new typography, imagery, and components. Show actual browser layouts because the owner cannot choose from mood descriptions. These remain proposals until a visual reference is selected.
3. Lock that visual world through the working prototype, then record reusable tokens, type hierarchy, asset direction, motion rules, and desktop/mobile compositions. Record the chosen authority in DESIGN.md and align components; do not silently replace product language or scope.
4. Build one coherent Home → title → Watch prototype and prove the signature transition with loading, unavailable artwork, playback failure/recovery, keyboard, touch, and reduced-motion states. Compare playback start and responsiveness against the incumbent before wider rollout.
5. Expand through shared components into catalog/search, series/anime details, personal archives, Circle/lists, authentication/onboarding, and settings/support/Admin. Keep member-data privacy and provider seams intact.
6. Run relevant automated checks and one bounded desktop/mobile visual review, fix material defects, and update the product/design sources only where behavior or approved decisions changed.

The immediate deliverable is a concrete comparison of three original watching-flow studies with zero tooling or asset purchases, in [the future cinema prototype](../design/future-cinema-prototype/CREDITS.md). A whole-product redesign is the destination; selecting a visual world lets subsequent slices carry it consistently across the app.

## Performance acceptance for the first slice

- No new 3D runtime, autoplay background video, video-to-canvas color sampling, continuous particle scene, or full-screen animated blur.
- Load appropriately sized stills; reserve artwork dimensions; prioritize only the initial important image and defer offscreen shelves. Use existing image delivery and [Next.js image sizing/loading controls](https://nextjs.org/docs/app/api-reference/components/image).
- Keep animation short, honor reduced motion, and never hold playback preparation behind a visual transition. Decorative work stops during playback and when the page is hidden.
- Measure the optimized production build against the incumbent on the same device/network conditions. Record first-frame startup and interaction responsiveness; do not claim a performance gain from development-mode screenshots or one timing sample.
- Aim for good Core Web Vitals: LCP at most 2.5 seconds, INP at most 200 milliseconds, CLS at most 0.1, assessed at the 75th percentile. These are targets, not measured results; lab checks guide the slice, and field data establishes the percentile. [Web Vitals thresholds](https://web.dev/articles/vitals).
- Keep the current player and recovery logic. No regression in first-frame startup, controls, captions, retained position, or fallback behavior is an acceptance requirement; optimization unrelated to the visual slice stays separate.
