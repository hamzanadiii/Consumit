"use client"
import { useEffect, useRef, type RefObject } from 'react'
import { createPlaybackController } from './playback-controller'
import { createPlaybackControllerNext } from './playback-controller-next'
import type { DirectMediaSource } from './media-source'

type PlaybackController = ReturnType<typeof createPlaybackController>
type ControllerCallbacks = Parameters<typeof createPlaybackController>[1]

/** Own controller lifetime and same-source attachment independently of chrome. */
export function usePlayerController(videoRef: RefObject<HTMLVideoElement | null>, source: DirectMediaSource | undefined, callbacks: ControllerCallbacks, resumeAt: number, resumePlaying: boolean, next: boolean) {
  const controllerRef = useRef<PlaybackController | null>(null)
  const phase = useRef('loading')
  const attached = useRef<{ controller: PlaybackController; src: string; type: DirectMediaSource['type'] } | null>(null)
  const latest = useRef({ callbacks, resumeAt, resumePlaying })
  useEffect(() => { latest.current = { callbacks, resumeAt, resumePlaying } }, [callbacks, resumeAt, resumePlaying])
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const controller = (next ? createPlaybackControllerNext : createPlaybackController)(video, {
      change(snapshot) { phase.current = snapshot.phase; latest.current.callbacks.change?.(snapshot) },
      fatal(reason, failure) { latest.current.callbacks.fatal?.(reason, failure) },
      event(event) { latest.current.callbacks.event?.(event) },
    })
    controllerRef.current = controller
    return () => { controller.destroy(); controllerRef.current = null }
  }, [videoRef, next])
  useEffect(() => {
    const controller = controllerRef.current
    if (!source || !controller) return
    if (attached.current && attached.current.controller === controller && attached.current.src === source.src && attached.current.type === source.type && phase.current !== 'failed') return
    attached.current = { controller, src: source.src, type: source.type }
    void controller.load(source, latest.current.resumeAt, latest.current.resumePlaying)
  }, [source])
  return controllerRef
}
