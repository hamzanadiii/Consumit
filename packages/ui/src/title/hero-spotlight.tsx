'use client'

import { useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'

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

const DEFAULT_ADVANCE_MS = 2500
const FOCUS_GRACE_MS = 6000

/**
 * Rotating cinematic spotlight. One title owns the hero at a time;
 * backdrops crossfade with a slow settle while the title block rises.
 * Hovering never pauses the loop, so pointer and touch users can never
 * strand it; rotation pauses on focus, offscreen, and reduced motion, with
 * focus resuming on its own after a short grace period. A vertical progress
 * rail floats at the hero's right edge: the live title falls top-down over
 * one rotation period while the rest stay dots, so every title stays
 * reachable; the rails below carry the same titles.
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
  const [interrupted, setInterrupted] = useState(false)
  const [visible, setVisible] = useState(true)
  const [reducedMotion, setReducedMotion] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)
  const focusTimer = useRef<number | null>(null)
  const count = items.length

  const go = useCallback(
    (next: number) => {
      if (count > 0) setIndex(((next % count) + count) % count)
    },
    [count],
  )

  useEffect(() => () => {
    if (focusTimer.current != null) window.clearTimeout(focusTimer.current)
  }, [])

  function clearFocusTimer() {
    if (focusTimer.current != null) {
      window.clearTimeout(focusTimer.current)
      focusTimer.current = null
    }
  }

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

  const running = count > 1 && !interrupted && visible && !reducedMotion

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
        synopsis={only.synopsis}
        synopsisClassName="line-clamp-3"
        title={only.title}
      />
    )
  }

  return (
    <section
      aria-label={label}
      className={cn('relative', className)}
      data-consumit-hero-spotlight
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          clearFocusTimer()
          setInterrupted(false)
        }
      }}
      onFocus={() => {
        // Keyboard and assistive-tech readers get a still hero to read, then
        // rotation resumes on its own so one interaction never strands it.
        setInterrupted(true)
        clearFocusTimer()
        focusTimer.current = window.setTimeout(() => {
          setInterrupted(false)
        }, FOCUS_GRACE_MS)
      }}
      ref={sectionRef}
      {...props}
    >
      <div className="grid">
        {items.map((item, position) => {
          const active = position === index
          return (
            <div
              aria-hidden={!active}
              aria-label={`${position + 1} of ${count}: ${item.title}`}
              className={cn(
                'col-start-1 row-start-1 transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
                active ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0',
              )}
              inert={!active}
              key={item.key}
              role="group"
            >
              <TitleMasthead
                actions={item.actions}
                backgroundClassName={cn(
                  'transition-transform duration-[6000ms] ease-linear motion-reduce:transition-none',
                  active ? 'scale-100' : 'scale-[1.06]',
                )}
                backgroundSrc={item.backgroundSrc}
                byline={item.byline}
                className={mastheadClassName}
                context={item.context}
                headingLevel={headingLevel}
                lede={item.lede}
                logoUrl={item.logoUrl}
                metadata={item.metadata}
                synopsis={item.synopsis}
                synopsisClassName="line-clamp-3"
                title={item.title}
              />
            </div>
          )
        })}
      </div>
      <div className="pointer-events-none absolute top-1/2 right-5 z-10 flex -translate-y-1/2 flex-col items-center gap-2 sm:right-8 lg:right-[50px]">
        {items.map((item, position) => {
          const active = position === index
          return (
            <button
              aria-current={active || undefined}
              aria-label={`Show ${item.title}`}
              className="pointer-events-auto flex h-7 w-11 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-orange"
              key={item.key}
              onClick={() => go(position)}
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
