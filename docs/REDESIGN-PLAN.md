# Consumit desktop enhancement plan

Updated 2026-10-02. The latest member brief preserves the shipped FilScreen interface and focuses on desktop. The existing app screenshot is the active reference; the Nocturne mockup and three standalone cinema studies are superseded explorations.

## Authority and constraints

Read DESIGN.md, docs/COMPONENTS.md, and the shipped screen before changing the UI. Preserve the existing shell, tabs, fonts, palette, artwork-led heroes, shared cards, product language, and first-party Consumit Player. Mobile design work is deferred. Speed means page and interaction performance, not rushing the design process. Reuse installed tools and assets; introduce no paid tools, services, fonts, or templates.

## First slice: desktop Home

Member job: choose a featured title or continue into the catalog without losing the page's familiar structure.

- Rebalance the hero height and text measure so the artwork reads clearly and the catalog begins within reach.
- Refine desktop typography, synopsis spacing, metadata emphasis, and Watch / More info alignment.
- Preserve the vertical featured-title selectors; give hover, focus, and current selection clear treatment.
- Add a desktop Pause / Resume control that preserves the member's choice through manual slide selection.
- Stop the carousel animation clock while paused, focused, hovered, offscreen, hidden, or under reduced motion. Resume from its retained progress.
- Keep the existing artless, single-slide, loading, and unavailable behavior.

Validate wide and compact desktop layouts, both themes, expanded and collapsed sidebars, keyboard navigation, reduced motion, artwork loading, and long or missing content. Use frozen public catalog fixtures for the visual review and existing behavioral tests for the carousel and Home. Record broad check failures separately from the slice; do not claim production performance gains from development rendering.

## Later desktop slices

After reviewing the Home enhancement, refine catalog rails and cards only where rendered evidence identifies a defect. Continue into title details, Search, and personal pages through the existing shared components. Preserve playback foundations and provider seams. Do not introduce a parallel frontend system or begin a mobile redesign.

## Completion

The slice is complete when its visible states and interactions are verified, relevant checks pass, and the desktop hero contract is recorded in DESIGN.md and docs/COMPONENTS.md. The older design directories remain historical references, not production entry points.

## Current validation

Desktop Home refinements are implemented. Home/carousel tests and scoped lint pass, including persistent manual pause, retained progress, and cancellation of paused animation frames. The design detector found no mechanical failures; existing missing-art colors and local artwork-legibility treatments remain intentional. Desktop layout was checked at 1917×807, 1440×900, and 1024×768, including light theme and expanded sidebar, with no horizontal overflow.

The visual check used rendered current component markup with the running app's compiled shared styles plus the new local hero stylesheet, against frozen public catalog data. It verifies composition, not hydrated app integration. Full current-source development rendering stalled during compilation under Windows and Linux runtimes; broad web typecheck also reports existing review/list contract mismatches and stale generated route references. Those checks remain unresolved. Production load-time and bundle comparisons have not been measured, so no page-speed improvement is claimed.
