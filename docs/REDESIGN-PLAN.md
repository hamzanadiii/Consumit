# Consumit: new frontend plan

**Updated:** 2026-10-02  
**Status:** Original design exploration started; production migration has not started.  
**Brief:** A cinema from the future, with fast pages and fast playback. Design quality takes priority over execution speed. No new paid tools, fonts, assets, exports, or services.

## Outcome and authority

A member confidently chooses a title, enters the Consumit Player, keeps watching through recovery, and returns to their personal records and trusted Circle. Discovery feels like arriving at a cinema; watching feels like being inside it.

The 2026-10-02 brief replaces the earlier preservation-only visual scope. Build fresh navigation, layouts, typography, tokens, artwork direction, components, and player presentation. Existing screens are an inventory of behaviors and content, not a visual starting point. Retire previous frontend implementations as each replacement is integrated and verified; do not leave permanent competing UI systems.

Product language and capabilities remain governed by [PRODUCT.md](./PRODUCT.md) and [CONTEXT.md](../CONTEXT.md). [ARCHITECTURE.md](./ARCHITECTURE.md) and the playback ADRs retain their technical authority. DESIGN.md records the shipped world until a concrete new reference is selected, then will be rewritten around the new system. Update COMPONENTS.md with the new component contracts. Watch parties, private messaging, and other new capabilities are not implied by the visual brief.

Research and source links: [FUTURE-CINEMA-RESEARCH.md](./FUTURE-CINEMA-RESEARCH.md). This file owns implementation order and completion status.

## Constraints

- **Runtime performance:** loading, navigation, input response, image delivery, and time to the first video frame. This does not mean rushing design or skipping visual exploration.
- **Original frontend:** do not copy the FilScreen shell, current card styling, token palette, font pairing, poster motifs, or branded artwork into new concepts. Catalog artwork remains title content from the catalog contract; composition and presentation are newly designed.
- **Zero new purchases:** open-license fonts/icons, freely reusable source assets, and original artwork made with free tools. No paid generation, premium templates, subscriptions, watermark-removal upgrades, or trial-credit dependencies.
- **Stable product foundation:** retain canonical title/episode identity, authentication, privacy, API contracts, provider adapters, progress/history, and media controllers. Rebuild player controls/presentation against those contracts; retain first-party ownership and validated direct media.
- **Intentional devices:** design desktop and phone independently. Keyboard, touch, screen readers, reduced motion, and long/translated content belong in each slice.
- **Preview truth:** use disclosed deterministic data during visual exploration. Never show invented member activity, progress, or recommendations as live records.
- **Bounded removal:** remove replaced visual code and assets after callers migrate and checks pass. Keep unrelated pending work and member records intact.

## Phase 1: establish the new visual world

**Member job:** choose something to watch and understand how the experience carries into viewing.

1. Inventory routes, jobs, states, controls, data requirements, and technical seams. Study behavior and asset provenance instead of copying the incumbent look.
2. Develop original directions grounded in cinema, projection, exhibition, and optical instruments. Use first-party references for craft, not branded layouts.
3. Produce concrete browser compositions for Home, title detail, and Watch, with phone compositions and a meaningful transition. Select new free fonts and fresh authored/licensed imagery.
4. Compare hierarchy, distinctiveness, readability, watching focus, cross-screen consistency, and runtime cost. The compositions make the direction reviewable; palette descriptions alone do not.
5. Record the selected world, references, type/spacing/geometry/color scales, navigation, image treatment, and motion grammar. Mark unselected explorations historical.

**Exit:** an original Home -> title -> Watch reference that governs both expressive and task-focused surfaces, with no-cost asset provenance. Production cutover follows the resolved concrete reference.

## Phase 2: build the new frontend foundation

**Member job:** navigate and act consistently across screens.

Build only foundations exercised by the first selected flow: a new shell, typography, layout rhythm, buttons, focus, forms, selection, media frames, metadata, and status/empty/error compositions. Define public interfaces before implementation. Use native semantics and shared component boundaries. A proven accessible behavior primitive can survive while its visual design is replaced. No generic third-party theme becomes the brand.

Server-render content where appropriate, isolate interaction into small client components, and keep optional effects outside the critical path. Establish image/font/JS budgets from measurements rather than choosing a library stack by habit.

**Exit:** reusable tokens/components demonstrate the new world, cover keyboard/touch/reduced-motion states, and do not depend on the retired visual foundation.

## Phase 3: integrate the watching journey

| Slice | Member job | Coverage |
| --- | --- | --- |
| Home/discovery | Choose or resume | Featured selection, Continue watching, catalog shelves, real Circle evidence, signed-out/empty/loading/error states |
| Search/catalog | Find or browse | Movies/series/anime, filters, pagination, empty/unavailable results, keyboard and touch |
| Title/episodes | Understand and start the right watch | Synopsis, factual metadata, member actions, reviews, series seasons and canonical anime episodes |
| Watch/Player | Enter, control, and continue | New presentation and controls; play/pause/seek/volume/fullscreen, captions/audio/quality, supported casting, buffering/unavailable/recovery, episode continuation |

Begin media preparation as soon as Watch is requested. A cinematic transition runs alongside navigation/startup and never adds a required intro, download, or delay. Keep progress and recovery independent of presentation and provider. Normal controls never reveal provider topology.

**Exit per slice:** functional contracts, named failures, responsiveness, accessibility, and relevant automated checks pass. Compare production page/interaction/first-frame performance under the same device/network conditions.

## Phase 4: replace the remaining active surfaces

1. Profile overview and archives: Favorites, Activity, Films, Diary, Reviews, private Watchlist/History, Lists, Likes, Tags, and Network. Preserve owner/visitor boundaries and exact episodic records.
2. Circle, member discovery, list detail and authoring: follow, save, search/add/remove/reorder titles, notes, visibility, retry-safe writes, pagination.
3. Authentication, verification/recovery, onboarding, settings/imports, About/catalog credits, Help, issue reporting.
4. Admin operations: the same system with appropriate density, real provider state, and existing authorized controls.

Compose each surface for its member job. Move callers to new shared primitives, delete obsolete variants/styles/assets when unused, and update tests to verify behavior rather than old markup.

## Phase 5: verify and remove the old frontend

- Review rendered desktop, tablet, and phone layouts: long titles, absent artwork, empty accounts, loading, failed reads/writes, permissions.
- Run relevant lint/typecheck/tests/build checks and player regressions for changes to controls or integration.
- Compare optimized builds, bundle requests, image/font payloads, navigation/input response, and playback startup. Test real Safari media separately; local fixtures are not provider-readiness evidence.
- Remove unreferenced old shells, components, styles, branded demo art, obsolete previews, and stale visual rules. Verify redirects, SEO metadata, and catalog attribution.
- Rewrite DESIGN.md and COMPONENTS.md around the shipped system. Update PRODUCT.md only for approved experience changes. Align surface briefs without rewriting unrelated platform decisions.

## Performance gates

These are acceptance targets, not current measured results:

- Good Core Web Vitals: LCP <= 2.5 seconds, INP <= 200 milliseconds, CLS <= 0.1 at the 75th percentile. Lab comparisons guide implementation; field observations establish percentiles. [Thresholds](https://web.dev/articles/vitals).
- No regression in first-video-frame startup or playback control response against a comparable baseline.
- Reserve image space, use appropriate image sizes, prioritize the visible main image, defer offscreen media, and load only necessary self-hosted font files.
- Decorative motion stops during watching, offscreen, and with hidden tabs. Reduced motion retains a complete static composition.
- Optional canvas/WebGL must earn its cost in a bounded prototype, load outside the core path, and provide a static fallback. The identity must survive without the effect.
- No extra catalog calls, provider probes, authentication reads, or media preloads solely for decoration.

## First work package and status

The first package is original visual-world exploration and the Home -> title -> Watch reference. It is not an immediate whole-repository deletion.

- [x] Record the corrected brief: design quality, runtime performance, new frontend, zero new purchases.
- [x] Identify the product and playback behavior that survives replacement.
- [x] Start original direction exploration and register its design question.
- [ ] Build and review concrete desktop/phone compositions with newly selected assets.
- [ ] Record the selected world and component contracts.
- [ ] Integrate and verify the watching journey.
- [ ] Replace remaining active surfaces and remove superseded visual code.
- [ ] Complete performance evidence and source-of-truth documentation.
