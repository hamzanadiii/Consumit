# Unified player deck — direction contract

This direction implements the member-approved unified-control-deck plan and supersedes the player composition in the earlier 2026-10-18 modernization direction. It is scoped to Watch and shared player presentation; browsing retains its existing visual system.

**Job:** watch an exact movie or episode, adjust the experience, and recover without losing the current recording or checkpoint.

**Thesis:** the picture owns the viewport; one stable bottom deck makes the available actions understandable. Retain the supplied Consumit mark, signal orange, warm ivory, existing self-hosted Inter and compact 3/5/6px geometry. Charcoal deck and panel surfaces separate controls from bright footage without decorative blur.

**First viewport:** a compact Back/title/episode header and contained picture. Desktop transport is left; labeled Sources, Captions, Episodes and Settings are right, followed by fullscreen. Timeline and timing sit above the row. Phone portrait puts timing, transport and labeled destinations beneath the picture. Short landscape retains overlays and safe-area clearance. Movies omit Episodes. Unavailable neighboring episodes are omitted.

**Signature interaction:** each destination opens a compact card centered 8px above its button, clamped to 12px viewport margins. Its width is at most 380px and its height is bounded by space above the trigger and `min(62dvh, 520px)`; the body scrolls under a fixed header. This same placement applies to desktop, portrait phone, narrow phone and short landscape. The active destination closes its card from root or nested views; selecting another destination switches cards. Nested views offer Back, and Close/Escape restores focus to the clicked deck destination. Panels and episode changes retain video DOM identity. Escape consumes the panel action before viewport-fullscreen exit.

**Hierarchy:** captions owns Off, languages, search, file upload, appearance and sync. Settings groups Playback (quality, audio and adjustments), Viewing (theater when surrounding content can be hidden, Cast, PiP and shortcuts), and Watch preferences; route-owned preference content remains in its existing slot. The dedicated full-viewport Watch canvas is already in theater mode and omits its toggle. External players share presentation through their wrapper, retain their own iframe controls, and explain unsupported progress sync and auto-next.

**States:** initial resolution and preparation, autoplay gesture recovery, later buffering, source switching/exhaustion, subtitle discovery/preparation/retry, empty search, upcoming episodes and progress-sync notices. Loading has honest text rather than fabricated percentages. Captions never move timing or transport. Volume overlays never move adjacent actions.

**Motion:** brief opacity/transform panel transitions; reduced motion removes authored transitions. Three-second control hiding remains suspended by focused controls, pause, buffering and open panels.

**Boundaries:** presentation only. Existing media engines, source validation, provider Admin order, canonical recording identity, history, progress, preferences and frame security remain owned by their current layers. No production rollout is included.

**Build and proof:** the user pinned the interaction and brand direction in the implementation plan; this is a code-led implementation of that contract, using deterministic playback fixtures and no new raster assets. Review desktop, phone, narrow phone and short landscape, then complete the independent finish review and document the actual result.
