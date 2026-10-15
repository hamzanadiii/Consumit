import { useEffect, useMemo, useState } from 'react'

import type { DirectMediaSource, SkipSegment } from './media-source'

/** Resolves validated provider and catalog timing for the current media item. */
export function usePlayerSkipSegments({
  source,
  mediaSrc,
  metadataSource,
  duration,
  currentTime,
  hasError,
  onSkipSegmentsRequest,
}: {
  source?: DirectMediaSource | undefined
  mediaSrc?: string | undefined
  metadataSource?: string | undefined
  duration: number
  currentTime: number
  hasError: boolean
  onSkipSegmentsRequest?: ((duration: number, signal: AbortSignal) => Promise<readonly SkipSegment[]>) | undefined
}) {
  const [catalogSkipTimes, setCatalogSkipTimes] = useState<{
    src: string
    duration: number
    request: typeof onSkipSegmentsRequest
    segments: readonly SkipSegment[]
  } | null>(null)
  const hasProviderIntro = Boolean(source?.skipSegments?.some(
    (segment) => segment.kind === 'intro' && segment.start >= 0 && segment.end > segment.start && segment.end <= duration,
  ))

  useEffect(() => {
    if (!onSkipSegmentsRequest || !mediaSrc || metadataSource !== mediaSrc || duration < 30 || hasProviderIntro || hasError) return
    const controller = new AbortController()
    void onSkipSegmentsRequest(duration, controller.signal).then((segments) => {
      if (!controller.signal.aborted) setCatalogSkipTimes({ src: mediaSrc, duration, request: onSkipSegmentsRequest, segments })
    }, () => { /* Missing timing metadata never interrupts playback. */ })
    return () => controller.abort()
  }, [onSkipSegmentsRequest, mediaSrc, metadataSource, duration, hasProviderIntro, hasError])

  const skipSegments = useMemo(() => {
    const provider = source?.skipSegments ?? []
    const fetched = catalogSkipTimes && catalogSkipTimes.request === onSkipSegmentsRequest && metadataSource === mediaSrc && catalogSkipTimes.src === mediaSrc && catalogSkipTimes.duration === duration
      ? catalogSkipTimes.segments
      : []
    return [...provider, ...fetched.filter((segment) => !provider.some((known) => known.kind === segment.kind))]
      .filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.start >= 0 && segment.end > segment.start && (duration <= 0 || segment.end <= duration))
  }, [source?.skipSegments, catalogSkipTimes, mediaSrc, metadataSource, duration, onSkipSegmentsRequest])
  const activeSkip = skipSegments.find((segment) => currentTime >= segment.start && currentTime < segment.end - 0.25 && segment.end > segment.start)

  return { skipSegments, activeSkip }
}
