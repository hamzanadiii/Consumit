# Canary the first-party playback core

The Consumit Player uses a new media-element controller on canary web deployments before replacing the current controller. Watch and public embeds select the same core from `NEXT_PUBLIC_PLAYBACK_CORE`, while session resolution, progress ownership, embed URLs, and `PLAYER_EVENT` messages keep their existing contracts. We chose a parallel path because real browser decoding and provider failures cannot be proven by component tests alone; deployment routing can send a small cohort to `next` and return it to the legacy build immediately if viewer metrics regress.

Current status (2026-09-29): this decision still applies to member Watch. Public embed pages and API routes described above are deferred and unmounted.

Provider adapters return data through bounded transport and validation. They must not fetch or execute provider-supplied programs to obtain a source. An adapter that cannot resolve safely fails and lets the resolver try the next eligible provider; encrypted VidSrc responses require a native, reviewed decoder before that disabled adapter can be enabled.
