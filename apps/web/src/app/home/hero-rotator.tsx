'use client'

import { titleHref, watchHref } from '@consumit/contracts'
import { Play, Star } from 'lucide-react'
import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'

import { makerByline, type HeroDetail } from '../catalog/catalog-ui'
import { OnDemandLink as Link } from '../shared/on-demand-link'
import styles from './hero-rotator.module.css'

const ADVANCE_MS = 4000
const MAX_SLIDES = 5

function ratingLabel(rating: number | null) {
  return rating === null ? null : rating.toFixed(1)
}

/**
 * Rotation candidates in priority order: the featured hero first, then
 * spotlight titles. Entries without backdrop art cannot carry the cinematic
 * frame, duplicates collapse, and a bare hero always survives as fallback.
 */
export function selectHeroSlides(
  hero: HeroDetail,
  spotlight: readonly HeroDetail[] = [],
  max: number = MAX_SLIDES,
): HeroDetail[] {
  const seen = new Set<string>()
  const slides: HeroDetail[] = []
  for (const item of [hero, ...spotlight]) {
    if (slides.length >= max) break
    const key = `${item.kind}:${item.id}`
    if (seen.has(key) || !item.backdropUrl) continue
    seen.add(key)
    slides.push(item)
  }
  return slides.length > 0 ? slides : [hero]
}

function HeroArticle({ animate, eager, hero, titleId }: {
  animate: boolean
  eager: boolean
  hero: HeroDetail
  titleId: string
}) {
  const rating = ratingLabel(hero.tmdbRating)
  const byline = makerByline(hero)
  const seasonCount = hero.seasons?.length ?? 0
  const duration = hero.kind === 'movie'
    ? (hero.runtimeMinutes ? `${Math.floor(hero.runtimeMinutes / 60)}h ${hero.runtimeMinutes % 60}m` : null)
    : (seasonCount > 0 ? `${seasonCount} ${seasonCount === 1 ? 'season' : 'seasons'}` : null)
  const contentRating = hero.kind === 'series' ? hero.contentRating : hero.certification
  return (
    <article className={`relative isolate overflow-hidden rounded-card border border-[var(--fs-line)] bg-[#2a1a12] text-white ${styles.frame}`}>
      {hero.backdropUrl ? (
        <Image
          alt=""
          className={`object-cover ${styles.art}`}
          fill
          loading={eager ? undefined : 'lazy'}
          priority={eager}
          sizes="(min-width: 1024px) calc(100vw - 112px), 100vw"
          src={hero.backdropUrl}
        />
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: 'radial-gradient(120% 90% at 78% 8%, #f7b267 0%, #d97b3f 28%, #7a3a22 55%, #2a1a12 100%)' }}
        />
      )}
      <div aria-hidden="true" className={`absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.92)_0%,rgba(0,0,0,0.62)_45%,rgba(0,0,0,0.08)_100%)] ${styles.shade}`} />
      <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(0deg,rgba(0,0,0,0.85)_0%,rgba(0,0,0,0)_40%)]" />
      <div className={`relative flex max-w-2xl flex-col justify-center gap-3 p-6 sm:p-10 lg:p-12 min-h-[calc(100svh-100px)] sm:min-h-[calc(100svh-104px)] lg:min-h-[calc(100svh-112px)] ${styles.copy}${animate ? ' fs-hero-in' : ''}`} key={animate ? `${titleId}-in` : `${titleId}-idle`}>
        <h2 className="max-w-[24ch] text-balance font-bold" id={titleId}>
          {hero.logoUrl ? (
            <Image alt={hero.title} className="h-auto max-h-24 w-auto max-w-full [filter:drop-shadow(0_2px_16px_rgb(0_0_0/0.65))] sm:max-h-28" height={240} loading={eager ? undefined : 'lazy'} priority={eager} src={hero.logoUrl} width={640} />
          ) : (
            <span className="font-display text-[clamp(2.5rem,5vw,4rem)] leading-[0.95] font-normal tracking-[-0.025em] text-white">{hero.title}</span>
          )}
        </h2>
        {hero.tagline ? <p className={`max-w-[48ch] font-display text-2xl leading-snug text-white/95 ${styles.tagline}`}>{hero.tagline}</p> : null}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          {rating ? (
            <span className="inline-flex items-center gap-1 font-bold text-white tabular-nums">
              <Star aria-hidden="true" className="size-3.5 fill-current" />
              {rating}
              <span className="sr-only">on TMDB</span>
            </span>
          ) : null}
          {hero.year ? <span className="font-bold text-white tabular-nums lg:font-medium lg:text-white/85">{hero.year}</span> : null}
          {duration ? <span className="text-white/70">{duration}</span> : null}
          {hero.genreNames.length ? <span className="text-white/70">{hero.genreNames.slice(0, 3).join(' · ')}</span> : null}
          {contentRating ? <span className="rounded border border-white/30 bg-black/40 px-1.5 py-0.5 text-[11px] font-bold text-white">{contentRating}</span> : null}
        </p>
        {byline ? <p className="text-xs font-bold tracking-wide text-white/75 lg:font-medium lg:tracking-normal">{byline}</p> : null}
        {hero.overview ? <p className={`max-w-[62ch] text-sm leading-6 text-white/85 line-clamp-3 ${styles.overview}`}>{hero.overview}</p> : null}
        <div className={`mt-1 flex flex-wrap items-center gap-3 ${styles.actions}`}>
          <Link
            className="inline-flex min-h-11 items-center gap-2 rounded-control bg-[#f4f0e8] px-5 text-sm font-bold text-[#09090b] outline-none transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-white"
            href={watchHref(hero)}
          >
            <Play aria-hidden="true" className="size-4" />
            Watch
          </Link>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-white/40 bg-black/40 px-5 text-sm font-bold text-white outline-none transition-colors hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white"
            href={titleHref(hero)}
          >
            More info
          </Link>
        </div>
      </div>
    </article>
  )
}

export type FilScreenHeroRotatorProps = {
  hero: HeroDetail
  label?: string | undefined
  spotlight?: readonly HeroDetail[] | undefined
}

/**
 * Rotating cinematic hero. One title owns the frame at a time; backdrops
 * crossfade without moving the reading position while the incoming copy
 * arrives as one authored block. A vertical selector rail inside the frame
 * jumps between titles without stopping the reel. Hover, focus, offscreen
 * content, hidden tabs, and reduced motion pause rotation while they last.
 */
export function FilScreenHeroRotator({ hero, label = 'Featured titles', spotlight = [] }: FilScreenHeroRotatorProps) {
  const slides = selectHeroSlides(hero, spotlight)
  const [index, setIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [documentVisible, setDocumentVisible] = useState(true)
  const [inView, setInView] = useState(true)
  const [reducedMotion, setReducedMotion] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)
  const fillRef = useRef<HTMLSpanElement>(null)
  const progressRef = useRef(0)
  const count = slides.length
  const activeIndex = index % count

  const go = useCallback(
    (next: number) => {
      if (count <= 0) return
      progressRef.current = 0
      if (fillRef.current) fillRef.current.style.transform = 'scaleY(0)'
      setIndex(((next % count) + count) % count)
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
      (entries) => setInView(entries.some((entry) => entry.isIntersecting)),
      { threshold: 0.15 },
    )
    observer.observe(section)
    return () => observer.disconnect()
  }, [count])

  // Rotation yields while the member points at a control or tabs through
  // the hero, then resumes on its own. Reduced motion never auto-advances.
  // One shared clock drives the fill bar and the slide advance together,
  // so they can never drift apart. Pausing freezes both mid-frame and
  // resuming continues from the exact same position.
  const running = count > 1 && !hovered && !focused && inView && documentVisible && !reducedMotion

  useEffect(() => {
    if (!running) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const elapsed = now - last
      last = now
      progressRef.current += elapsed / ADVANCE_MS
      if (progressRef.current >= 1) {
        progressRef.current = 0
        setIndex((current) => (current + 1) % count)
      }
      if (fillRef.current) fillRef.current.style.transform = `scaleY(${Math.min(progressRef.current, 1)})`
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [count, running])

  if (count <= 1) {
    const only = slides[0] ?? hero
    return (
      <section aria-label={label} className="mt-4" ref={sectionRef}>
        <HeroArticle animate={!reducedMotion} eager hero={only} titleId="filscreen-hero-title" />
      </section>
    )
  }

  return (
    <section
      aria-label={label}
      aria-roledescription="carousel"
      className="relative mt-4"
      onBlurCapture={() => setFocused(false)}
      onFocusCapture={(event) => setFocused(event.target instanceof HTMLElement && event.target.matches(':focus-visible'))}
      onPointerDownCapture={() => setFocused(false)}
      onKeyDownCapture={() => setFocused(true)}
      onPointerOver={(event) => { if (event.pointerType === 'mouse') setHovered(event.target instanceof Element && !!event.target.closest('a, button')) }}
      onPointerLeave={() => setHovered(false)}
      ref={sectionRef}
    >
      <div aria-live={running ? 'off' : 'polite'} className="grid">
        {slides.map((item, position) => {
          const active = position === activeIndex
          const titleId = `filscreen-hero-title-${position}`
          return (
            <div
              aria-hidden={!active}
              aria-label={`${position + 1} of ${count}: ${item.title}`}
              aria-roledescription="slide"
              className={
                active
                  ? 'col-start-1 row-start-1 transition-opacity duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none'
                  : 'pointer-events-none col-start-1 row-start-1 opacity-0 motion-reduce:transition-none'
              }
              inert={!active}
              key={`${item.kind}:${item.id}`}
              role="group"
            >
              <HeroArticle animate={active && !reducedMotion} eager={position === 0} hero={item} titleId={titleId} />
            </div>
          )
        })}
      </div>
      <div aria-label="Choose a featured title" className={`absolute top-1/2 right-4 z-10 flex -translate-y-1/2 flex-col gap-1 ${styles.selectors}`} role="group">
        {slides.map((item, position) => {
          const active = position === activeIndex
          return (
            <button
              aria-current={active || undefined}
              aria-label={`Show ${item.title}`}
              className={`grid h-11 w-11 cursor-pointer place-items-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none ${styles.selector}`}
              key={`${item.kind}:${item.id}`}
              onClick={() => go(position)}
              type="button"
            >
              {active ? (
                <span aria-hidden="true" className="relative block h-8 w-2 overflow-hidden rounded bg-white/25">
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 origin-top rounded bg-[var(--fs-accent)]"
                    ref={fillRef}
                    // Fresh mounts start empty: without this the fill renders
                    // full until the shared clock writes its first frame, and
                    // stays frozen full whenever rotation is paused.
                    style={{ transform: 'scaleY(0)' }}
                  />
                </span>
              ) : (
                <span aria-hidden="true" className="block h-8 w-2 rounded bg-white/25" />
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
