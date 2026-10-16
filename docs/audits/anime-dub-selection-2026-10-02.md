# Strict anime DUB selection — 2026-10-02

The member reported that clicking DUB still played SUB and requested that sub-only providers be excluded from DUB. The slice preserves the desktop player and makes its existing audio toggle an actual resolution constraint.

The resolver regression requested English for an anime episode with a higher-priority original-audio source and a lower-priority English source. Before the repair it selected the original source. Existing adapter fixtures also explicitly expected AnimeParadise and AnimeKitsu to answer DUB with their original-audio track, and AnimeKai to use SUB when a dub server was absent. Those expectations were corrected to the member's requested behavior.

Current configured adapter capabilities:

| Adapter | SUB | English DUB |
|---|---|---|
| AnimeParadise | Supported by the current extraction path | Excluded |
| AnimeKitsu | Supported by the current extraction path | Excluded |
| Kyren | Requested sub variant | Requested dub variant, when available |
| AnimeKai | Requested sub server | Requested dub server, when available |

These are adapter capabilities, not a guarantee that every episode is available. DUB list filtering is separate from Admin enable/disable and saved order: all configured rows remain available for their supported requests.

Sub-only adapters now declare their known audio languages and return empty for DUB before metadata or upstream requests. The API uses those declarations for attempts and diagnostic lists. Returned and shared-cache anime sources must match the requested audio; an original-audio source is not an English dub even when its captions are English. Unknown adapter capabilities do not bypass source-language checks. Movie and series preference behavior remains intact. AnimeKai's opposite-variant fallback was removed. A further regression demonstrated that Kyren could label an explicitly original upstream source as English based only on the request; it now rejects conflicting explicit labels. The live Kyren dub endpoint labelled the working sample `dub`.

Initial DUB failure reports that an English dub could not be loaded and suggests retry or selecting SUB. The existing SUB/DUB toggle stays available. Refresh, fallback, and manual switches reuse the requested language, and preserve canonical identity and member progress. Tests cover source mismatch, no matching dub, sub-only attempts without network work, shared-cache mismatch, provider lists, renewal and fallback, and honest unavailability.

All 54 API playback tests and 119 adapter tests passed, with provider SDK type checking, a focused API playback type check, and changed-file lint. The resolver's original-audio substitution regression and Kyren's conflicting-label regression failed before their respective fixes. API was restarted and both API/web report healthy. No frontend implementation changed and no web rebuild was needed.

In desktop Chrome through localhost:8080, clicking DUB on AniList 16498 episode 1 sent `audioLanguage: en`, selected Kyren, and decoded 1920-pixel video past one second with no page errors. AniList 7785 episode 1 remained selected as DUB but returned the explicit missing-dub message; its separate SUB request still resolved through Kyren. The DUB diagnostic roster contained only Kyren and AnimeKai. These checks establish variant routing, startup, and failure behavior, not full-episode coverage or an independent listening verification of every provider recording. Sanitized browser evidence is in the companion JSON. Temporary harnesses were removed after verification.
