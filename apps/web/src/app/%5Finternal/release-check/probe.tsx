'use client'

import { useEffect, useRef } from 'react'
import { releaseProbeSourceSchema, type ReleaseProbeEvidence } from '@consumit/contracts'
import { checkMedia } from './probe-evidence'

declare global { interface Window { consumitReleaseProbe?: (source: unknown) => Promise<ReleaseProbeEvidence> } }
export function ReleaseProbe() {
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    let busy = false
    window.consumitReleaseProbe = async input => {
      if (busy || !video.current) throw new Error('Probe is busy.')
      const source = releaseProbeSourceSchema.parse(input)
      busy = true
      try { return await checkMedia(video.current, source) } finally { busy = false }
    }
    return () => { delete window.consumitReleaseProbe }
  }, [])
  return <video ref={video} muted playsInline aria-label="Automatic playback check" className="h-48 w-80" />
}
