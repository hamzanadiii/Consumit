# ADR 0011: Provider-scoped media credentials

Status: Accepted for the NontonFlix Relay candidate; production activation remains separate.

## Context

Relay media normally rejects every credential-bearing source. Referer, Origin, Accept and User-Agent hints may cross the relay boundary, but `cookie` and `authorization` are removed before a source can become a Relay grant. This keeps a provider's browser session from leaking into a different media host, a nested playlist, or another provider.

NontonFlix's HLS media is different. Its playlist grant is bound to the device that minted it: a direct Worker request returns `403 {"error":"Media grant belongs to another device."}`. The only usable credential is one cookie minted for `media.nontonflix.com`; it carries no member identity and is not reusable against another provider.

## Decision

Allow one exception, and keep it narrower than the general credential seam:

- The exception exists only for provider id `nontonflix`.
- The source URL hostname must be exactly `media.nontonflix.com`.
- Only the `cookie` header is allowed; `authorization` and every other credential remain rejected.
- The cookie value is capped at 512 bytes and must contain no CR/LF.
- The API Relay issuer, provider SDK validation, Media Relay grant codec and Worker manifest rewriter all enforce the same provider/host binding independently.
- Header hints, including the cookie, are forwarded only while the destination host equals the grant's `headerHost`. A cross-host child receives no hints, so the cookie cannot follow an off-host playlist reference.
- Reliable media hosts are still checked against the configured allowlist before any grant is issued. No wildcard, regex-driven or provider-supplied relay wrapper is accepted.

This is a media-grant credential, not a member credential. It does not enter logs, analytics, provider iframe documents, playback progress or history.

## Consequences

NontonFlix can play through the Consumit Player without exposing its session to other hosts. The exception is deliberately hard-coded rather than a reusable configuration flag, so adding another cookie-forwarding provider requires a new review and a new ADR amendment.

EmbedMaster needs no exception: it accepts only `Referer` and `Origin` hints, which already fit the existing non-credential policy.

If NontonFlix changes its media host, cookie name or grant format, the provider fails closed until the adapter and all four checks are updated together.
