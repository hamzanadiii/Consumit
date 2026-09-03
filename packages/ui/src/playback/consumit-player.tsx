'use client'

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { Maximize, Pause, Play, Volume2, VolumeX } from 'lucide-react'

import { cn } from '../lib/cn'
import { MissingArtwork } from '../media/media'

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'

  const wholeSeconds = Math.floor(seconds)
  const minutes = Math.floor(wholeSeconds / 60)
  const remainder = wholeSeconds % 60

  return `${minutes}:${remainder.toString().padStart(2, '0')}`
}

export type ConsumitPlayerProps = Omit<
  ComponentProps<'video'>,
  'className' | 'controls' | 'poster' | 'title'
> & {
  className?: string | undefined
  posterSrc?: string | undefined
  status?: ReactNode | undefined
  title: string
  videoClassName?: string | undefined
}

export function ConsumitPlayer({
  autoPlay,
  children,
  className,
  muted,
  onDurationChange,
  onPause,
  onPlay,
  onTimeUpdate,
  onVolumeChange,
  posterSrc,
  preload = 'metadata',
  src,
  status,
  title,
  videoClassName,
  ...props
}: ConsumitPlayerProps) {
  const playerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(Boolean(muted))
  const [isPlaying, setIsPlaying] = useState(Boolean(autoPlay))
  const hasSource = Boolean(src || children)

  useEffect(() => {
    if (typeof muted === 'boolean') setIsMuted(muted)
  }, [muted])

  async function togglePlayback() {
    const video = videoRef.current
    if (!video || !hasSource) return

    if (video.paused) {
      try {
        await video.play()
      } catch {
        setIsPlaying(false)
      }
    } else {
      video.pause()
    }
  }

  function toggleMute() {
    const video = videoRef.current
    if (!video || !hasSource) return

    video.muted = !video.muted
    setIsMuted(video.muted)
  }

  async function toggleFullscreen() {
    const player = playerRef.current
    if (!player) return

    if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else {
      await player.requestFullscreen()
    }
  }

  return (
    <div
      className={cn('overflow-hidden rounded-card border border-border bg-black', className)}
      data-consumit-player
      ref={playerRef}
    >
      {status ? (
        <div
          aria-live="polite"
          className="flex min-h-11 items-center gap-2 border-b border-border bg-canvas px-4 text-xs text-copy"
          role="status"
        >
          <span aria-hidden="true" className="size-2 rounded-full bg-lime" />
          {status}
        </div>
      ) : null}
      <div className="relative aspect-video overflow-hidden bg-black">
        {!posterSrc && !hasSource ? (
          <MissingArtwork
            className="absolute inset-0"
            label={`${title} playback unavailable`}
          />
        ) : null}
        <video
          {...props}
          aria-label={`${title} player`}
          autoPlay={autoPlay}
          className={cn('size-full object-contain', videoClassName)}
          muted={isMuted}
          onDurationChange={(event) => {
            setDuration(event.currentTarget.duration || 0)
            onDurationChange?.(event)
          }}
          onPause={(event) => {
            setIsPlaying(false)
            onPause?.(event)
          }}
          onPlay={(event) => {
            setIsPlaying(true)
            onPlay?.(event)
          }}
          onTimeUpdate={(event) => {
            setCurrentTime(event.currentTarget.currentTime)
            onTimeUpdate?.(event)
          }}
          onVolumeChange={(event) => {
            setIsMuted(event.currentTarget.muted)
            onVolumeChange?.(event)
          }}
          playsInline
          poster={posterSrc}
          preload={preload}
          ref={videoRef}
          src={src}
        >
          {children}
        </video>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,transparent,rgba(9,9,11,0.94))] px-3 pt-12 pb-3 sm:px-4">
          <div className="pointer-events-auto flex items-center gap-1 sm:gap-2">
            <button
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="grid size-11 shrink-0 place-items-center rounded-control text-ink outline-none hover:bg-ink/10 focus-visible:ring-2 focus-visible:ring-orange disabled:cursor-default disabled:text-muted"
              disabled={!hasSource}
              onClick={togglePlayback}
              type="button"
            >
              {isPlaying ? <Pause aria-hidden="true" className="size-5 fill-current" /> : <Play aria-hidden="true" className="size-5 fill-current" />}
            </button>
            <input
              aria-label="Playback position"
              className="h-11 min-w-0 flex-1 cursor-pointer accent-orange disabled:cursor-default disabled:opacity-45"
              disabled={!hasSource || duration <= 0}
              max={duration || 0}
              min={0}
              onChange={(event) => {
                const nextTime = Number(event.currentTarget.value)
                if (videoRef.current) videoRef.current.currentTime = nextTime
                setCurrentTime(nextTime)
              }}
              step={0.1}
              type="range"
              value={Math.min(currentTime, duration || 0)}
            />
            <span className="min-w-[5.5rem] text-center text-xs tabular-nums text-copy">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
            <button
              aria-label={isMuted ? 'Unmute' : 'Mute'}
              className="grid size-11 shrink-0 place-items-center rounded-control text-ink outline-none hover:bg-ink/10 focus-visible:ring-2 focus-visible:ring-orange disabled:cursor-default disabled:text-muted"
              disabled={!hasSource}
              onClick={toggleMute}
              type="button"
            >
              {isMuted ? <VolumeX aria-hidden="true" className="size-5" /> : <Volume2 aria-hidden="true" className="size-5" />}
            </button>
            <button
              aria-label="Enter fullscreen"
              className="grid size-11 shrink-0 place-items-center rounded-control text-ink outline-none hover:bg-ink/10 focus-visible:ring-2 focus-visible:ring-orange"
              onClick={toggleFullscreen}
              type="button"
            >
              <Maximize aria-hidden="true" className="size-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
