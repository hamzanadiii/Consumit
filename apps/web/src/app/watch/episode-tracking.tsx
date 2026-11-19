'use client'

import { useEffect, useRef, useState } from 'react'
import type { EpisodeTracking, PlaybackRef } from '@consumit/contracts'
import { Button } from '@consumit/ui'
import { readEpisodeTracking, writeEpisodeTracking } from '@/lib/playback-progress'

const continueLabel = 'Continue from this episode'
const watchedLabel = 'Mark episode watched'

export function EpisodeTrackingActions({ episodeRef, memberId }: { episodeRef: PlaybackRef; memberId?: string | undefined }) {
  const [tracking, setTracking] = useState<EpisodeTracking>()
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<'saved' | 'device' | 'failed'>()
  const [lastChoice, setLastChoice] = useState<EpisodeTracking>()
  const edited = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    void readEpisodeTracking(episodeRef, controller.signal, memberId).then(value => {
      if (!controller.signal.aborted && !edited.current) setTracking(value)
    })
    return () => controller.abort()
  }, [episodeRef, memberId])

  async function save(choice: EpisodeTracking) {
    if (pending) return
    edited.current = true
    setLastChoice(choice)
    setPending(true)
    setResult(undefined)
    try {
      const storage = await writeEpisodeTracking({ ...episodeRef, episodeTracking: choice }, memberId)
      setTracking(choice)
      setResult(memberId && storage === 'device' ? 'device' : 'saved')
    } catch {
      setResult('failed')
    } finally {
      setPending(false)
    }
  }

  const status = pending ? 'Saving episode…'
    : tracking === 'continue' ? 'Saved in Continue watching.'
    : tracking === 'watched' ? 'Marked watched. Continue watching will show the next aired episode when available.'
    : 'Keep your place across players.'

  return (
    <section className="space-y-2 border-b border-border pb-4" aria-label="Continue watching">
      <p className="text-sm font-semibold text-ink">Continue watching</p>
      <div className="flex flex-wrap gap-2">
        <Button aria-pressed={tracking === 'continue'} className="min-h-11" disabled={pending} onClick={() => void save('continue')} size="sm" variant={tracking === 'continue' ? 'secondary' : 'ghost'}>{continueLabel}</Button>
        <Button aria-pressed={tracking === 'watched'} className="min-h-11" disabled={pending} onClick={() => void save('watched')} size="sm" variant={tracking === 'watched' ? 'secondary' : 'ghost'}>{watchedLabel}</Button>
      </div>
      <p className="text-xs leading-5 text-copy" role="status">{status}</p>
      {lastChoice && (result === 'device' || result === 'failed') ? (
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-copy">
          <p role="alert">{result === 'device' ? 'Saved on this device. Account sync is still pending.' : 'This episode could not be saved.'}</p>
          <Button className="min-h-11" onClick={() => void save(lastChoice)} size="sm" variant="ghost">Try again</Button>
        </div>
      ) : null}
    </section>
  )
}
