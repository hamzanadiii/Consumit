'use client'

import { useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { Pause, Play } from 'lucide-react'

import { Button } from '../button/button'
import { cn } from '../lib/cn'
import { TitleMasthead } from './title'

export type HeroSpotlightItem = {
  actions?: ReactNode | undefined
  backgroundSrc?: string | undefined
  byline?: ReactNode | undefined
  context?: string | undefined
  key: string
  lede?: ReactNode | undefined
  logoUrl?: string | null | undefined
  metadata: ReactNode
  posterSrc?: string | undefined
  synopsis: string
  title: string
}

export type HeroSpotlightProps = Omit<ComponentProps<'section'>, 'children'> & {
  autoAdvanceMs?: number | undefined
  headingLevel?: 'h1' | 'h2' | undefined
  items: readonly HeroSpotlightItem[]
  label?: string | undefined
  mastheadClassName?: string | undefined
}

const DEFAULT_ADVANCE_MS = 8000

/**
 * Rotating cinematic spotlight. One title owns the hero at a time;
 * backdrops crossfade without moving the reading position. Focus and manual
 * selection stop rotation until the member explicitly starts it again.
 * Hover, offscreen content, hidden tabs, and reduced motion also pause it.
 */
export function HeroSpotlight({
  autoAdvanceMs = DEFAULT_ADVANCE_MS,
  className,
  headingLevel = 'h2',
  items,
  label = 'Featured titles',
  mastheadClassName,
  ...props
}: HeroSpotlightProps) {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [hovered, setHovered] = useState(false)
  const [documentVisible, setDocumentVisible] = useState(true)
  const [visible, setVisible] = useState(true)
  const [reducedMotion, setReducedMotion] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)
  const count = items.length

  const go = useCallback(
    (next: number) => {
      if (count > 0) setIndex(((next % count) + count) % count)
    },
    [count],
  )

  useEffect(() => {
    const sync = () => setDocumentVisible(!document.hidden)
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReducedMotion(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    const section = sectionRef.current
    if (!section || typeof IntersectionObserver !== 'function') return
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries.some((entry) => entry.isIntersecting)),
      { threshold: 0.15 },
    )
    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  const running = count > 1 && playing && !hovered && visible && documentVisible && !reducedMotion

  useEffect(() => {
    if (!running) return
    const id = window.setTimeout(() => setIndex((current) => (current + 1) % count), autoAdvanceMs)
    return () => window.clearTimeout(id)
  }, [running, index, autoAdvanceMs, count])

  if (count === 0) return null

  if (count === 1) {
    const only = items[0]
    if (!only) return null
    return (
      <TitleMasthead
        actions={only.actions}
        backgroundSrc={only.backgroundSrc}
        byline={only.byline}
        className={mastheadClassName}
        context={only.context}
        headingLevel={headingLevel}
        lede={only.lede}
        logoUrl={only.logoUrl}
        metadata={only.metadata}
        posterSrc={only.posterSrc}
        synopsis={only.synopsis}
        synopsisClassName="line-clamp-3"
        title={only.title}
      />
    )
  }

  return (
    <section
      aria-label={label}
      aria-roledescription="carousel"
      className={cn('relative', className)}
      data-consumit-hero-spotlight
      onFocusCapture={(event) => {
        if (!(event.target instanceof Element) || !event.target.closest('[data-consumit-rotation-toggle]')) setPlaying(false)
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      ref={sectionRef}
      {...props}
    >
      <Button
        aria-label={playing && !reducedMotion ? 'Pause featured titles' : 'Start featured titles'}
        className="consumit-hero-toggle"
        data-consumit-rotation-toggle
        disabled={reducedMotion}
        onClick={() => setPlaying((current) => !current)}
        size="icon"
        title={reducedMotion ? 'Automatic rotation is off for reduced motion' : playing ? 'Pause featured titles' : 'Start featured titles'}
        variant="secondary"
      >
        {playing && !reducedMotion ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
      </Button>
      <div aria-atomic="false" aria-live={running ? 'off' : 'polite'} className="grid">
        {items.map((item, position) => {
          const active = position === index % count
          return (
            <div
              aria-hidden={!active}
              aria-label={`${position + 1} of ${count}: ${item.title}`}
              aria-roledescription="slide"
              className={cn(
                'col-start-1 row-start-1 transition-opacity duration-300 ease-out motion-reduce:transition-none',
                active ? 'opacity-100' : 'pointer-events-none opacity-0',
              )}
              data-active={active || undefined}
              inert={!active}
              key={item.key}
              role="group"
            >
              <TitleMasthead
                actions={item.actions}
                backgroundSrc={item.backgroundSrc}
                byline={item.byline}
                className={mastheadClassName}
                context={item.context}
                headingLevel={headingLevel}
                lede={item.lede}
                logoUrl={item.logoUrl}
                metadata={item.metadata}
                posterSrc={item.posterSrc}
                synopsis={item.synopsis}
                synopsisClassName="line-clamp-3"
                title={item.title}
              />
            </div>
          )
        })}
      </div>
      <div aria-label="Choose a featured title" className="consumit-hero-selectors" role="group">
        {items.map((item, position) => {
          const active = position === index % count
          return (
            <button
              aria-current={active || undefined}
              aria-label={`Show ${item.title}`}
              className="pointer-events-auto flex h-7 w-11 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-orange"
              key={item.key}
              onClick={() => { setPlaying(false); go(position) }}
              type="button"
            >
              {active ? (
                <span aria-hidden="true" className="relative h-7 w-1.5 overflow-hidden rounded-full bg-ink/25">
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-ink"
                    data-consumit-hero-dot
                    key={`${item.key}-${running}`}
                    style={{ animationDuration: `${autoAdvanceMs}ms`, animationPlayState: running ? 'running' : 'paused' }}
                  />
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-ink/35 transition-colors motion-reduce:transition-none hover:bg-ink/60"
                />
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
