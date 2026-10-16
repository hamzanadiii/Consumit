# Google Analytics 4

Owner job: understand visits to Consumit's public browsing surfaces without exporting private member activity.

The owner's web stream for `https://www.consumit.online` uses public measurement ID `G-K0BSZ9ZM48`. Set `NEXT_PUBLIC_GA_MEASUREMENT_ID` before building the web image. An empty or invalid ID disables both collection and the analytics prompt. `NEXT_PUBLIC_GA_PROMPT=off` hides the consent prompt and starts collection without a stored prompt choice; any other value keeps the Allow/Decline prompt. This is a public identifier, not an API secret. Local examples leave the ID empty; the production example carries the supplied ID with the prompt hidden. Compose passes both values to the Docker build; changing a running container's environment alone does not update the client bundle.

## Property setup

Before rollout, open GA4 Admin → Data streams → the Consumit web stream and switch **Enhanced measurement off**. Consumit sends manual `page_view` events. Automatic browser-history, search, form, download, link and video events could duplicate visits or collect details outside the application's projection. Keep Google Signals and ads personalization disabled; the application also disables both in its tag configuration. The owner confirmed Enhanced measurement is off on October 12, 2026.

## Browser behavior

Unless `NEXT_PUBLIC_GA_PROMPT=off`, the root-mounted client component displays a non-modal prompt only on explicitly allowed public surfaces. Until Allow analytics, no Google tag loads or analytics commands are queued. Decline stays off. With the prompt hidden, an unset device choice behaves as accepted: the tag loads on allowed surfaces immediately and no prompt renders; a decline stored from Privacy Policy section 7 still stops collection and clears cookies. Privacy Policy section 7 lets visitors change their choice in either mode. It synchronizes across tabs and persists under `consumit.analytics.choice.v1`; blocked storage retains the choice for the current document only. Revocation sets Google's disable flag and clears host-only `_ga` cookies. It does not delete already collected Google records.

Allowed surfaces are Home, Movies, Series, Anime, Search, public title details, About, Help and legal documents. Title details collapse to `/title`, `/series/title` or `/anime/title` with fixed titles. Referrers retain only HTTP(S) origins. Query strings, fragments, search text, title IDs and document titles are never manually submitted. Watch, embeds, profiles, lists, library, settings, admin, authentication, onboarding, internal checks and unknown routes cannot initialize analytics; navigation there disables collection from a previously loaded tag. Enhanced measurement must remain off for this boundary.

Blocked or failed tag requests do not block browsing or playback. GA4 reports reflect visitors who allow analytics and whose browsers can reach Google, rather than total visits. Existing first-party anonymous Web Vitals and operational playback telemetry retain their own boundaries.

## Verify and rollback

Build the web image with the measurement ID, then deploy only that image using the existing production release process. Verify one visit in GA4 Realtime or Tag Assistant, including one page view per public navigation. With the default prompt, confirm no tag request before consent and that the Allow/Decline prompt appears on allowed surfaces; with `NEXT_PUBLIC_GA_PROMPT=off`, confirm no prompt renders and the tag loads without a stored choice. In both modes confirm no page views on excluded surfaces, sanitized event parameters, and immediate disable after declining in Privacy. Browser checks should intercept Google requests when using fixtures so automated tests do not create real analytics visits.

`CONSUMIT_WEB_RELEASE` optionally selects a web image independently of `CONSUMIT_RELEASE`, so this web-only deployment can retain the running API image. With an empty web override, the shared release tag remains the default. Subsequent releases must intentionally update or clear the web override.

Rollback to the previous web image, or unset the ID and rebuild. Retain the original image tag. No API, database, provider or relay migration is required.

References: [Google page views](https://developers.google.com/analytics/devguides/collection/ga4/views), [basic consent mode](https://developers.google.com/tag-platform/security/concepts/consent-mode), [privacy settings](https://developers.google.com/tag-platform/security/guides/privacy).
