# Player caption and control review — 2026-10-18

The supplied screenshots showed Arabic subtitle text rendered as mojibake, uneven transport placement on phones, an unanimated preparation indicator, and title artwork/navigation marks smaller or misplaced relative to the earlier player.

## Findings and changes

- Arabic WebVTT sources labelled `ar` bypassed the server byte decoder through the direct-track fast path. Legacy Windows-1256 bytes therefore reached the browser as if they were UTF-8. Arabic VTT candidates now use the validated first-party normalization/cache path; if fetching or normalization fails, the validated direct HTTPS candidate remains available. Local uploads and cue-sync reads now decode raw bytes too. Existing `dir="auto"`, Arabic language grouping and per-line subtitle handling remain in effect.
- Phone transport used a flexible three-control group beside a separate fullscreen column, so its four icons did not share equal spacing. The phone layout now uses four equal touch columns for Play, backward seek, forward seek and fullscreen, with destinations on the next row.
- Preparation now restores the earlier animated three-stroke orange sweep directly under the compact header. It uses transform/opacity and disables motion for reduced-motion preference. When the compact header already contains the title, the fallback omits a second oversized text title while preserving supplied logo artwork. Pause artwork, facts and synopsis stay at the upper left on desktop and compact on phones. The desktop Consumit mark is 48px and phone mark 36px; neighboring episode icons are enlarged.

## Verification

- The added API regression test failed before the fix because Arabic VTT was returned as an upstream direct URL without fetching or decoding. It passes after normalization. The regression covers the resolver and first-party file cache with a Windows-1256 payload.
- Browser byte decoder and uploaded-caption regressions confirm a Windows-1256 VTT becomes an Arabic cue without fetching the local blob again.
- `apps/api`: all 133 subtitle tests pass, including adapters, normalization, storage, language labels, and the direct fallback.
- `packages/ui`: all 230 playback tests pass, including upload lifecycle, full-screen captions, subtitle sync, player panels, and episode replacement.
- Playwright sizing fixture passes at 1920×822, 1440×900, 1280×548, 1024×600, 390×844, 320×720 and 844×390. It asserts preparation placement, pause information, panel bounds/focus, no phone volume, no overflow, four equal touch-control centers, 44px minimum targets and no browser page errors.
- API/UI TypeScript checks and targeted lint pass. The production-mode local container rebuild and health checks are recorded in the delivery entry.

This verifies the reported legacy-byte failure mode and deterministic player fixtures. It cannot establish that every live provider labels or encodes every subtitle track correctly without a captured failing provider response.

## Preparation placement follow-up

Follow-up reference clarified the intended split: on preparation the artwork belongs at bottom-left with the loading strokes and status; on pause the artwork, facts and description belong centered vertically at the left. The preparation copy is now a single bottom-aligned stack, while paused content is centered as one block and its inline phone overlay ends at the picture edge above the deck. The responsive sizing fixture checks both states and their picture/deck boundaries at all seven viewport sizes.
