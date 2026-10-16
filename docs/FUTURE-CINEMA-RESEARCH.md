# Cinema design research: retained references

Researched 2026-10-02. Updated for the latest brief: enhance the existing FilScreen design on desktop. This note is reference material; DESIGN.md, docs/COMPONENTS.md, and the shipped interface govern implementation. Earlier whole-frontend replacement recommendations and standalone concepts are superseded.

## Tools and assets for the active slice

Use the installed Next.js, React, Tailwind, native CSS, Lucide, browser tools, and existing test tooling. Keep the current self-hosted typefaces and catalog artwork pipeline. No new dependencies, paid tools, assets, or generation workflows are needed for desktop Home polish.

Catalog artwork remains supplied through existing contracts and credits. [TMDB's FAQ](https://developer.themoviedb.org/docs/faq) distinguishes non-commercial API use from commercial arrangements. This plan adds no purchases; it makes no claim about total service operating costs or media rights.

## Optional craft references

These sources inform hierarchy, framing, and restraint. They are not shipping asset libraries or replacement layout instructions.

| Source | Applicable observation |
| --- | --- |
| [Pentagram: Quad Cinema](https://www.pentagram.com/work/quad-cinema) | Consistent typography and wayfinding across a cinema identity |
| [Territory Studio: DUNE](https://territorystudio.com/project/dune/) | Restrained controls and deliberate visual emphasis |
| [Territory Studio: Blade Runner 2049](https://territorystudio.com/project/blade-runner-2049/) | Artwork framing and readable functional information |
| [MUBI](https://mubi.com/en/about) | Cinema curation alongside streaming and editorial context |

## Performance principles

Avoid decorative 3D runtimes, autoplay background video, canvas sampling, or continuous effects. Preserve appropriately sized optimized images and lazy loading for secondary artwork. Suspend carousel animation work when interaction or visibility pauses it. Honor reduced motion and maintain keyboard access.

Use the existing [Next.js image controls](https://nextjs.org/docs/app/api-reference/components/image) for delivery. Compare production builds on the same device and network before claiming improved load times. [Core Web Vitals thresholds](https://web.dev/articles/vitals) remain targets, not measured results for this design pass.

## Skills

Impeccable polish is the main workflow: preserve the visual world, inspect the actual desktop render, fix local hierarchy and interaction defects, and verify the member path. Additional brand, image-generation, Figma, or prototype workflows are unnecessary for this slice.

The implementation order and completion conditions live in [REDESIGN-PLAN.md](./REDESIGN-PLAN.md).
