/**
 * AdController sits alongside the media controller and never affects provider
 * resolution, source scoring, delivery policy, or progress identity. Playback
 * fails open: an ad outage resolves back to idle so content starts or resumes.
 * No ad network is wired yet; this module is the seam Phase 9 builds on.
 */

export type AdPhase = 'idle' | 'loading' | 'done' | 'failed'
export type AdEvent = { type: 'ad-start' | 'ad-end' | 'ad-error'; slot?: string | undefined }
export type AdSlot = { id: string; url?: string | undefined }
export type AdLoader = (slot: AdSlot, signal: AbortSignal) => Promise<void>

export function createAdController(
  callbacks: { event?: ((event: AdEvent) => void) | undefined } = {},
  loader: AdLoader = async () => undefined,
) {
  let phase: AdPhase = 'idle'
  let destroyed = false
  let attachment: AbortController | undefined

  function emit(event: AdEvent) {
    if (!destroyed) callbacks.event?.(event)
  }

  return {
    get phase(): AdPhase { return phase },
    /**
     * Attempt an ad slot and always resolve. Rejection is never used: failure
     * reports `failed` through the phase and an `ad-error` event, then falls
     * back to `idle` so the media controller proceeds with content.
     */
    async load(slot?: AdSlot): Promise<AdPhase> {
      if (destroyed || !slot) return 'idle'
      attachment?.abort()
      attachment = new AbortController()
      const signal = attachment.signal
      phase = 'loading'
      emit({ type: 'ad-start', slot: slot.id })
      try {
        await loader(slot, signal)
        if (destroyed || signal.aborted) return 'idle'
        phase = 'done'
        emit({ type: 'ad-end', slot: slot.id })
        return 'done'
      } catch {
        if (!destroyed && !signal.aborted) {
          phase = 'failed'
          emit({ type: 'ad-error', slot: slot.id })
        }
        return 'idle'
      }
    },
    destroy() {
      destroyed = true
      attachment?.abort()
      attachment = undefined
    },
  }
}
