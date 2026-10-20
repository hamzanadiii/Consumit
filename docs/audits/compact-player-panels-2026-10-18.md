# Compact button-anchored player panels

The follow-up interaction keeps Sources, Captions, Episodes and Settings in compact cards immediately above their active deck destination. Each card centers over its trigger, leaves an 8px gap, clamps within 12px viewport margins, and caps its height at the available space above the trigger or `min(62dvh, 520px)`. Its header remains fixed while the body scrolls independently. The panel measures against its actual containing block. The picture stage allows cards to extend above it, while the outer player clips the complete experience to the viewport.

Selecting another destination switches panels. Selecting the active destination closes it from root or nested views. Close, Escape, Back and focus return remain available. Settings is grouped into Playback, Viewing and Watch preferences; Episodes keeps season, search, paging and exact route navigation while using shorter artwork rows. Sources and Captions retain their existing content. The external-player wrapper anchors its Sources and Episodes cards through internal destination markers.

The change is presentational. Existing playback elements, source ordering and selection, episode ownership, preferences and provider contracts remain unchanged. Opening cards does not pause or remount playback.

Phone captures at 390px show the Settings card fully above its button, with its header and all actions visible as the body scrolls. The automated responsive pass also confirms the card header remains the top hit target instead of the video stage.

## Verification

Viewport, interaction, build and local-rollout evidence is recorded in the current [delivery entry](../DELIVERY.md#compact-button-anchored-player-panels--local-preview-2026-10-18).
