import type { SubtitleCue } from './subtitle-sync'

type CaptionSelection = { value: string; cues: readonly SubtitleCue[]; delayMs: number }

/** Present the same selected caption file through the video's native renderer.
 * iOS fullscreen excludes DOM siblings, so it must receive a showing TextTrack. */
export function createNativeFullscreenCaptions(video: HTMLVideoElement) {
  let selection: CaptionSelection = { value: 'off', cues: [], delayMs: 0 }
  let active = false
  let watched: HTMLTrackElement | undefined
  let applied: { track: TextTrack; cues: readonly SubtitleCue[]; delayMs: number } | undefined
  const shell = video.closest<HTMLElement>('[data-consumit-player]')

  function reconcile(force = false) {
    if (!active) return
    const id = selection.value.startsWith('external:') ? selection.value.slice('external:'.length) : undefined
    const element = id ? Array.from(video.querySelectorAll('track')).find(track => track.id === id) : undefined
    if (watched !== element) {
      watched?.removeEventListener('load', loaded)
      watched = element
      watched?.addEventListener('load', loaded)
      applied = undefined
    }
    try {
      if (selection.value === 'off') {
        for (const element of Array.from(video.querySelectorAll('track'))) if (element.kind === 'subtitles' || element.kind === 'captions') element.default = false
        for (const track of Array.from(video.textTracks)) if (track.kind === 'subtitles' || track.kind === 'captions') track.mode = 'disabled'
        return
      }
      if (!element?.track) return // In-band tracks already use the engine's native selection.
      const track = element.track
      // Reconciliation can briefly retain the previous file while a new
      // selection reaches React. Native fullscreen must show just this file.
      for (const other of Array.from(video.textTracks)) {
        if (other !== track && (other.kind === 'subtitles' || other.kind === 'captions')) other.mode = 'disabled'
      }
      for (const other of Array.from(video.querySelectorAll('track'))) if (other !== element && (other.kind === 'subtitles' || other.kind === 'captions')) other.default = false
      element.default = true // Safari requires default for custom-control caption files.
      // Hidden loads cues without a duplicate native line while preparing.
      track.mode = 'hidden'
      if (selection.cues.length && typeof VTTCue !== 'undefined' && (force || applied?.track !== track || applied.cues !== selection.cues || applied.delayMs !== selection.delayMs)) {
        const offset = selection.delayMs / 1000
        const nextCues: VTTCue[] = []
        for (const cue of selection.cues) {
          const start = Math.max(0, cue.startTime - offset), end = cue.endTime - offset
          if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
          // VTTCue text is WebVTT markup; retain parsed plaintext literally.
          const text = cue.text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
          nextCues.push(new VTTCue(start, end, text))
        }
        const previousCues = Array.from(track.cues ?? [])
        try {
          for (const cue of previousCues) track.removeCue(cue)
          for (const cue of nextCues) track.addCue(cue)
        } catch (error) {
          try {
            for (const cue of Array.from(track.cues ?? [])) track.removeCue(cue)
            for (const cue of previousCues) track.addCue(cue)
          } catch { /* The browser's original loader can still finish. */ }
          throw error
        }
        applied = { track, cues: selection.cues, delayMs: selection.delayMs }
      }
      track.mode = 'showing'
    } catch { /* The original VTT file remains a native fallback if cue rewriting is unavailable. */
      if (element?.track) element.track.mode = 'showing'
    }
  }
  function loaded() { reconcile(true) }
  const observer = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(() => reconcile())
  observer?.observe(video, { childList: true })

  function leave() {
    active = false
    video.removeAttribute('data-native-fullscreen')
    shell?.removeAttribute('data-native-fullscreen')
    watched?.removeEventListener('load', loaded)
    watched = undefined
    applied = undefined
    for (const element of Array.from(video.querySelectorAll('track'))) {
      if (!element.id.startsWith('consumit-external-') || !element.track) continue
      element.track.mode = selection.value === `external:${element.id}` ? 'hidden' : 'disabled'
    }
  }
  return {
    update(next: CaptionSelection) { selection = next; reconcile() },
    enter() {
      active = true
      video.setAttribute('data-native-fullscreen', 'true')
      shell?.setAttribute('data-native-fullscreen', 'true')
      reconcile()
    },
    leave,
    destroy() { observer?.disconnect(); leave() },
  }
}
