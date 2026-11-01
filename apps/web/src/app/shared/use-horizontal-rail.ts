'use client'

import { useEffect, useRef, useState } from 'react'

type RailState = { canScroll: boolean; atStart: boolean; atEnd: boolean }
type HorizontalRailOptions = { scrollFraction?: number }

const INITIAL_RAIL_STATE: RailState = { canScroll: false, atStart: true, atEnd: true }

/** Owns measured overflow, edge state, and reduced-motion-aware page scrolling for a horizontal title rail. */
export function useHorizontalRail(itemCount: number, { scrollFraction = 0.8 }: HorizontalRailOptions = {}) {
  const railRef = useRef<HTMLUListElement>(null)
  const [state, setState] = useState(INITIAL_RAIL_STATE)

  useEffect(() => {
    const rail = railRef.current
    if (!rail) return
    const update = () => {
      const maximum = Math.max(0, rail.scrollWidth - rail.clientWidth)
      const next = { canScroll: itemCount > 1 && maximum > 8, atStart: rail.scrollLeft <= 1, atEnd: rail.scrollLeft >= maximum - 1 }
      setState(current => current.canScroll === next.canScroll && current.atStart === next.atStart && current.atEnd === next.atEnd ? current : next)
    }
    update()
    rail.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(rail)
    Array.from(rail.children).forEach(child => observer?.observe(child))
    return () => {
      rail.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      observer?.disconnect()
    }
  }, [itemCount])

  function move(direction: -1 | 1) {
    const rail = railRef.current
    if (!rail) return
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    rail.scrollBy({ left: rail.clientWidth * scrollFraction * direction, behavior: reducedMotion ? 'instant' : 'smooth' })
  }

  return { railRef, ...state, move }
}
