---
status: accepted
---

# Consumit owns the playback surface

Consumit will play authorized HLS, DASH, and direct media sources through a first-party player instead of iframe or embed surfaces. This preserves one accessible control system, stable progress and failover behavior, and consistent product trust while media bytes still travel directly from the authorized provider or CDN to the member’s browser.

## Consequences

Provider resolution and delivery adapters remain separate from the player UI. The player component owns controls and media presentation; playback sessions, source switching, telemetry, entitlements, and provider health remain application concerns.
