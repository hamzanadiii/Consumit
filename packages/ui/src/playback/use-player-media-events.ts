import { useEffect, useState, type ReactNode, type RefObject } from 'react'

import type { DirectMediaSource } from './media-source'
import { cueTextAt, type SubtitleCue } from './subtitle-sync'

/** Browser media events and text-track sampling owned by one attached video element. */
export function usePlayerMediaEvents({
  videoRef,
  mediaSrc,
  source,
  children,
  captionsOn,
  selectedSubtitle,
  subtitleCues,
  subtitleDelayMs,
}: {
  videoRef: RefObject<HTMLVideoElement | null>
  mediaSrc?: string | undefined
  source?: DirectMediaSource | undefined
  children?: ReactNode
  captionsOn: boolean
  selectedSubtitle: string
  subtitleCues: readonly SubtitleCue[]
  subtitleDelayMs: number
}) {
  const [decodedWidth, setDecodedWidth] = useState(0)
  const [decodedHeight, setDecodedHeight] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [bufferedEnd, setBufferedEnd] = useState(0)
  const [activeCue, setActiveCue] = useState('')
  const [isPip, setIsPip] = useState(false)
  const [metadataSource, setMetadataSource] = useState<string | undefined>()

  useEffect(() => {
    const video = videoRef.current
    if (!video || source) return
    try {
      for (const track of Array.from(video.textTracks)) {
        if (track.kind === 'subtitles' || track.kind === 'captions') {
          track.mode = captionsOn && (track.id === selectedSubtitle || track.language === selectedSubtitle || (selectedSubtitle === 'english' && track.language === 'en')) ? 'showing' : 'disabled'
        }
      }
    } catch {
      /* subtitle tracks are enhancement-only */
    }
  }, [captionsOn, children, selectedSubtitle, source, videoRef])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const updateCues = () => {
      if (!captionsOn) {
        setActiveCue('')
        return
      }
      // File captions use Consumit's clock even at zero offset. Native
      // cue lists can be reset by streaming engines during playback.
      if (selectedSubtitle.startsWith('external:') && subtitleCues.length > 0) {
        try {
          setActiveCue(cueTextAt(subtitleCues, video.currentTime || 0, subtitleDelayMs))
        } catch {
          /* cue matching is best-effort */
        }
        return
      }
      let foundText = ''
      try {
        for (const track of Array.from(video.textTracks)) {
          if (track.mode === 'showing' || track.mode === 'hidden') {
            const cues = track.activeCues
            if (cues && cues.length > 0) {
              const texts: string[] = []
              for (let i = 0; i < cues.length; i++) {
                const cue = cues[i] as VTTCue | undefined
                if (cue?.text) {
                  const cleaned = cue.text.replace(/<[^>]+>/g, '').trim()
                  if (cleaned) texts.push(cleaned)
                }
              }
              if (texts.length > 0) {
                foundText = texts.join('\n')
                break
              }
            }
          }
        }
      } catch {
        /* cue inspection is best-effort */
      }
      setActiveCue(foundText)
    }

    const textTracks = video.textTracks
    const listeners: { track: TextTrack; listener: () => void }[] = []
    const attachTrackListeners = () => {
      try {
        for (const track of Array.from(video.textTracks)) {
          track.removeEventListener('cuechange', updateCues)
          track.addEventListener('cuechange', updateCues)
          listeners.push({ track, listener: updateCues })
        }
      } catch {
        /* best effort */
      }
      updateCues()
    }

    attachTrackListeners()
    textTracks?.addEventListener?.('addtrack', attachTrackListeners)
    textTracks?.addEventListener?.('change', updateCues)
    video.addEventListener('timeupdate', updateCues)
    video.addEventListener('seeking', updateCues)
    video.addEventListener('seeked', updateCues)

    // Sample each frame while playing; timeupdate alone can lag cue changes.
    let frame = 0
    const sampleFrame = () => {
      updateCues()
      frame = requestAnimationFrame(sampleFrame)
    }
    const startSampling = () => { if (frame === 0) frame = requestAnimationFrame(sampleFrame) }
    const stopSampling = () => { if (frame !== 0) cancelAnimationFrame(frame); frame = 0 }
    video.addEventListener('playing', startSampling)
    video.addEventListener('pause', stopSampling)
    video.addEventListener('ended', stopSampling)
    if (!video.paused) startSampling()

    return () => {
      stopSampling()
      video.removeEventListener('playing', startSampling)
      video.removeEventListener('pause', stopSampling)
      video.removeEventListener('ended', stopSampling)
      textTracks?.removeEventListener?.('addtrack', attachTrackListeners)
      textTracks?.removeEventListener?.('change', updateCues)
      video.removeEventListener('timeupdate', updateCues)
      video.removeEventListener('seeking', updateCues)
      video.removeEventListener('seeked', updateCues)
      for (const { track, listener } of listeners) track.removeEventListener('cuechange', listener)
    }
  }, [captionsOn, selectedSubtitle, subtitleDelayMs, subtitleCues, videoRef])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const syncClock = () => {
      setDecodedWidth(video.videoWidth || 0)
      setDecodedHeight(video.videoHeight || 0)
      setCurrentTime(video.currentTime || 0)
      setDuration(Number.isFinite(video.duration) ? video.duration : 0)
    }
    const syncBuffered = () => {
      try {
        const buffered = video.buffered
        if (buffered.length > 0) setBufferedEnd(buffered.end(buffered.length - 1))
      } catch {
        /* buffered introspection is best-effort */
      }
    }

    syncClock()
    syncBuffered()
    const metadataLoaded = () => { setMetadataSource(mediaSrc); syncClock() }
    const metadataEmptied = () => { setMetadataSource(undefined); syncClock() }
    const onEnterPip = () => setIsPip(true)
    const onLeavePip = () => setIsPip(false)
    video.addEventListener('resize', syncClock)
    video.addEventListener('emptied', metadataEmptied)
    video.addEventListener('loadedmetadata', metadataLoaded)
    video.addEventListener('durationchange', syncClock)
    video.addEventListener('timeupdate', syncClock)
    video.addEventListener('progress', syncBuffered)
    video.addEventListener('playing', syncBuffered)
    video.addEventListener('enterpictureinpicture', onEnterPip)
    video.addEventListener('leavepictureinpicture', onLeavePip)
    return () => {
      video.removeEventListener('resize', syncClock)
      video.removeEventListener('emptied', metadataEmptied)
      video.removeEventListener('loadedmetadata', metadataLoaded)
      video.removeEventListener('durationchange', syncClock)
      video.removeEventListener('timeupdate', syncClock)
      video.removeEventListener('progress', syncBuffered)
      video.removeEventListener('playing', syncBuffered)
      video.removeEventListener('enterpictureinpicture', onEnterPip)
      video.removeEventListener('leavepictureinpicture', onLeavePip)
    }
  }, [mediaSrc, videoRef])

  return {
    decodedWidth,
    decodedHeight,
    currentTime,
    setCurrentTime,
    duration,
    setDuration,
    bufferedEnd,
    activeCue,
    isPip,
    metadataSource,
  }
}
