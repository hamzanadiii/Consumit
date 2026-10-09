# Protected playback rollout

Both frontend designs remain available. The production release still selects the original frontend on OVH. This change adds no paid service and creates no SQL migration.

## Private configuration

Create a Turnstile Managed widget for exactly `consumit.online`, with action `playback`. Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` before building each frontend and keep `TURNSTILE_SECRET_KEY` private in the API environment. Production preparation/preflight rejects missing values. Never use development test keys in production. Guest verification lives in the existing dedicated playback Valkey instance for four hours; cookie presence is not verification.

Set `PLAYBACK_RELAY_ORIGIN=https://consumit.online`. Keep the issuer and Worker relay secrets equal, private and at least 32 characters long. Retain independent provider and discovery allowlists. Deploy the Worker route `consumit.online/media/*` in the same Cloudflare zone; the domain must remain proxied through Cloudflare. The origin gateway deliberately returns 403 for `/media/*`. Disable workers.dev and preview addresses. Do not expose a second route to the same Worker under another public origin.

## Local development

Verification is enabled when an explicit API Turnstile secret is configured; production playback cannot start without it. For deterministic verification tests use injected clients, and for local browser verification use Cloudflare test keys rather than production credentials.

Both frontends can proxy `/media/*` using a development-only `CONSUMIT_RELAY_URL` pointing to a local Worker fixture. Configure that Worker with a loopback HTTP `APP_ORIGIN` and an explicit comma-separated `DEVELOPMENT_ORIGINS` list for the local frontend origins (including their ports). The API binds grants to the validated resolve Origin. Production ignores the development origin list. Same-origin proxies carry only the local anonymous playback cookie; upstream providers never receive it.

`bun run dev:web`, `bun run dev:next` and frontend builds prepare Cast assets from `packages/web-core/public/cast`. Set `NEXT_PUBLIC_CAST_RECEIVER_ID` before the image build, and configure the custom Cast receiver ID only after the HTTPS receiver URL is registered. Keep the direct-cast behavior; protected relay casting always requires a new sender-issued handoff.

## Coordinated cutover

1. Run `bun run code:check`, tests, lint, type checks, both builds and infrastructure validation. Keep previous application images and the existing recovery procedures.
2. Prepare the API, browser and Worker from the same release. During cutover pause new playback authorization, install the protected Worker, then activate the matching API/frontend release. Do not serve the new issuer against the old Worker.
3. Version-one grants fail closed. Existing streams must start a fresh playback session. Normal version-two HLS renewal preserves buffered playback; this is not an indefinite legacy compatibility window.
4. Check API readiness, failure metrics and relay status without logging grants, challenge tokens, handoffs, cookies or upstream URLs. Verification failures expose only bounded reason labels.
5. Roll back only to the complete matching protected release. An insecure legacy Worker must not be a silent fallback.

## Launch gates

After the VPS exists, verify real HTTPS guest/member startup, verification failure/retry, private caching, HLS/native playback, seeking, subtitles, separate audio, saved progress and grant renewal. Test a copied media/control URL from another browser and a foreign website. Test TV handoff, replay rejection, source renewal, provider switching and progress on actual Cast hardware. Run the fifty-session, ten-minute load baseline (warm page/API p95 below two seconds, under 1% unexpected server errors). Existing SES, backup/restore and Telegram/external-outage checks remain required.

These are live launch gates, not claims established by local fixtures. Protection prevents copied Consumit relay links from working without proof; an authorized viewer can still capture or retransmit media, and direct provider URLs remain visible.

## Integration references

The server validates single-use Turnstile tokens with exact hostname/action matching ([Cloudflare validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)). Cast loads use the SDK `media`, `currentTime` and `autoplay` fields; the receiver reads media custom data and supplies cookie credentials only to its protected first-party requests ([LoadRequest](https://developers.google.com/cast/docs/reference/web_sender/chrome.cast.media.LoadRequest), [PlaybackConfig](https://developers.google.com/cast/docs/reference/web_receiver/cast.framework.PlaybackConfig)). Hardware checks remain required.
