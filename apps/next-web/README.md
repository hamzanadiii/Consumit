# Consumit: independent frontend

This is the second Consumit frontend. The original lives in `apps/web` and uses `packages/ui`; this app lives here and uses `packages/next-ui`. Both consume the existing first-party API, contracts, providers, and member data. Selecting this app does not replace the original deployment.

Run `bun run dev:next` from the repository root to open it on `http://localhost:3080`. Configure `CONSUMIT_API_URL` to the existing API. For the existing Docker stack, run `bun run docker:next`; it starts only the additional frontend using `compose.next.yaml`, with the original gateway on port 8080 retained.

The frontend includes discovery, movie/series/anime catalogs and details, search, sign-in, private profiles and archives, collections, settings, and the Consumit player. Appearance is stored in `consumit.next.*` browser preferences. Member history and watch progress remain shared canonical data, independently of appearance and playback sources.

Dark Cinema is the default atmosphere. Paper gallery and Dusk change the whole interface. Gallery and Journal are selectable profile compositions; Quiet motion complements the operating-system motion preference. Favorite ordering, banner editing, account settings, and playback recovery retain their existing API contracts and failure behavior.

`/design-lab` is a runtime-gated, no-index visual fixture. Set `CONSUMIT_DESIGN_LAB=1` to enable it locally. Its sample member records are explicitly labeled; its player uses the existing local demonstration video. The ordinary member routes require the real session and real account data. The Docker Compose deployment disables the lab by default.

See [DESIGN.md](./DESIGN.md) for this frontend's visual authority and [the frontend delivery note](../../docs/FRONTEND-NEXT.md) for references and validation scope.
