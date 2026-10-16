import { attachMediaEngine, type MediaEngine } from '@consumit/ui/media-engine'
import type { ReleaseProbeEvidence, ReleaseProbeSource } from '@consumit/contracts'

/** Exercise the same engine as Watch, without progress, advertising or telemetry. */
export async function checkMedia(video: HTMLVideoElement, source: ReleaseProbeSource, timeoutMs = 25_000): Promise<ReleaseProbeEvidence> {
  const signal = AbortSignal.timeout(timeoutMs)
  const evidence: ReleaseProbeEvidence = { decodedFrames: 0, advancedSeconds: 0, seeked: false, resumedSeconds: 0 }
  let engine: MediaEngine | undefined, frame: number | undefined, fatal = false
  let phase: 'media' | 'seek' = 'media'
  let seekObserved = false
  const onSeeked = () => { seekObserved = true }
  const frames = () => { evidence.decodedFrames += 1; frame = video.requestVideoFrameCallback(frames) }
  if (video.requestVideoFrameCallback) frame = video.requestVideoFrameCallback(frames)
  const wait = async (done: () => boolean) => {
    while (!done()) {
      signal.throwIfAborted()
      if (fatal || video.error) throw new Error('media')
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  // A media play promise can remain pending forever when segments never arrive.
  // Observe it without allowing it to outlive the probe's abort/fatal checks.
  const play = async () => {
    let settled = false, failed = false
    void video.play().then(() => { settled = true }, () => { failed = true; settled = true })
    await wait(() => settled)
    signal.throwIfAborted()
    if (failed || fatal || video.error) throw new Error('media')
  }
  const advance = async (seconds: number) => {
    const firstFrames = evidence.decodedFrames
    let previous = video.currentTime, tick = performance.now(), advanced = 0
    await wait(() => {
      const now = performance.now(), elapsed = (now - tick) / 1000, delta = video.currentTime - previous
      if (!video.paused && !video.seeking && delta > 0 && delta <= elapsed * 1.5 + 0.1) advanced += delta
      previous = video.currentTime; tick = now
      return advanced >= seconds && evidence.decodedFrames > firstFrames
    })
    return advanced
  }
  try {
    video.muted = true; video.playbackRate = 1
    engine = await attachMediaEngine(video, source, { tracks() {}, fatal() { fatal = true } }, signal)
    await play()
    await wait(() => video.videoWidth > 0 && Number.isFinite(video.duration) && video.duration >= 15)
    evidence.advancedSeconds = await advance(5)
    phase = 'seek'
    const target = Math.min(video.duration / 2, Math.max(10, video.currentTime + 10))
    video.addEventListener('seeked', onSeeked)
    video.currentTime = target
    await wait(() => seekObserved && !video.seeking && Math.abs(video.currentTime - target) < 1)
    evidence.seeked = true
    await play()
    evidence.resumedSeconds = await advance(2)
    return evidence
  } catch {
    return { ...evidence, failure: signal.aborted ? 'timeout' : phase }
  } finally {
    if (frame !== undefined) video.cancelVideoFrameCallback(frame)
    video.removeEventListener('seeked', onSeeked)
    video.pause(); engine?.destroy(); video.removeAttribute('src')
  }
}
