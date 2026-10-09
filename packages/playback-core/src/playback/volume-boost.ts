/** A lazy audio graph for this media element; normal volume and mute stay native. */
export function createVolumeBoost(video: HTMLMediaElement, contextFactory = () => new AudioContext()) {
  let context: AudioContext | null = null
  let source: MediaElementAudioSourceNode | null = null
  let gain: GainNode | null = null
  let pending: Promise<void> | null = null
  let target = 1
  let output = 1
  let disposed = false

  const resume = () => {
    if (context?.state === 'suspended') void context.resume().catch(() => {})
  }
  video.addEventListener('play', resume)

  async function initialize() {
    // Non-CORS media becomes silent when routed through Web Audio. Reject it
    // before creating a source; configured streams normally use anonymous CORS.
    const url = video.currentSrc || video.src
    if (url && new URL(url, location.href).origin !== location.origin && !video.crossOrigin) {
      throw new Error('Volume boost requires CORS-enabled media')
    }
    const next = contextFactory()
    try {
      await next.resume()
      if (disposed || (target === 1 && output === 1)) {
        await next.close()
        return
      }
      const amplifier = next.createGain()
      amplifier.gain.value = target * output
      amplifier.connect(next.destination)
      const input = next.createMediaElementSource(video)
      input.connect(amplifier)
      context = next
      source = input
      gain = amplifier
    } catch (error) {
      await next.close().catch(() => {})
      throw error
    }
  }

  return {
    async output(value: 0 | 1) {
      output = value
      if (!gain && output === 1) return
      if (!gain) { pending ??= initialize().finally(() => { pending = null }); await pending }
      if (context?.state === 'suspended') await context.resume()
      if (!disposed && gain) gain.gain.value = target * output
    },
    async set(value: number) {
      if (disposed) throw new Error('Volume boost has been disposed')
      target = Number.isFinite(value) ? Math.min(3, Math.max(1, value)) : 1
      if (!gain && target === 1 && !pending) return 1
      if (!gain) {
        pending ??= initialize().finally(() => { pending = null })
        await pending
      }
      if (disposed) return 1
      try {
        if (context?.state === 'suspended') await context.resume()
        gain?.gain.setTargetAtTime(target * output, context?.currentTime ?? 0, 0.015)
        return target
      } catch (error) {
        target = 1
        if (gain) gain.gain.value = output
        throw error
      }
    },
    dispose() {
      disposed = true
      video.removeEventListener('play', resume)
      source?.disconnect()
      gain?.disconnect()
      void context?.close().catch(() => {})
    },
  }
}
