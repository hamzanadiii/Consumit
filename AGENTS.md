# Consumit working agreement

## Read by task

- **Domain:** read [`CONTEXT.md`](./CONTEXT.md) before naming or changing product concepts.
- **Product:** read [`docs/PRODUCT.md`](./docs/PRODUCT.md) before changing scope, experience flows, or active surfaces.
- **Platform:** read [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) before changing providers, playback, contracts, data, security, infrastructure, or deployment.
- **Delivery:** read [`docs/DELIVERY.md`](./docs/DELIVERY.md) before selecting or expanding an implementation slice.
- **Decisions:** read [`docs/OPEN-QUESTIONS.md`](./docs/OPEN-QUESTIONS.md) before acting on an unresolved foundation.
- **UI:** read [`DESIGN.md`](./DESIGN.md) and [`docs/COMPONENTS.md`](./docs/COMPONENTS.md), then use the shipped shared components and current screen implementation as visual authority.

## Execution rules

- Build the smallest coherent slice demanded by a named member job and active design reference.
- Keep provider-specific behavior behind the provider-adapter seam.
- Keep watch progress and member history independent of playback sources.
- Treat external provider output as hostile and playback sources as authorized-only inputs.
- Use deterministic fixtures for visual work until integration is the explicit purpose of the slice.
- Add directory and package structure lazily; create each part when a slice needs it.
- Preserve the active Consumit Player design. Consumit owns playback controls while authorized providers supply direct media through adapters.

## Completion

A change is complete when its named states and failure behavior are covered, relevant automated checks pass, and changed product language or decisions are updated at their single source of truth.
