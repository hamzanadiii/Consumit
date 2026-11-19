'use client'

import { Tabs, type TabItem } from '@consumit/ui'
import { useEffect, useRef, useState, type ComponentProps } from 'react'

type ScrollableTabsProps = {
  activeValue: string
  ariaLabel: string
  className?: string
  items: readonly TabItem[]
  profileCue?: boolean
} & Pick<ComponentProps<'nav'>, 'id'>

export function ScrollableTabs({ activeValue, ariaLabel, className, id, items, profileCue = false }: ScrollableTabsProps) {
  const navigation = useRef<HTMLElement>(null)
  const [scrollEdges, setScrollEdges] = useState({ left: false, right: false })
  const [hashActiveValue, setHashActiveValue] = useState<string | null>(null)
  const currentValue = hashActiveValue ?? activeValue

  useEffect(() => {
    const updateHashActiveValue = () => {
      const activeItem = items.find(item => item.href === window.location.hash)
      setHashActiveValue(activeItem?.value ?? null)
    }

    updateHashActiveValue()
    window.addEventListener('hashchange', updateHashActiveValue)
    return () => window.removeEventListener('hashchange', updateHashActiveValue)
  }, [items])

  useEffect(() => {
    const nav = navigation.current
    if (!nav) return

    const updateScrollEdges = () => {
      const maxScroll = Math.max(0, nav.scrollWidth - nav.clientWidth)
      const next = { left: nav.scrollLeft > 1, right: maxScroll - nav.scrollLeft > 1 }
      setScrollEdges(previous => previous.left === next.left && previous.right === next.right ? previous : next)
    }
    const revealActiveSection = () => {
      const selected = nav.querySelector('[aria-current]')
      if (!selected || nav.scrollWidth <= nav.clientWidth) {
        updateScrollEdges()
        return
      }
      const bounds = nav.getBoundingClientRect()
      const activeBounds = selected.getBoundingClientRect()
      const offset = activeBounds.left < bounds.left ? activeBounds.left - bounds.left
        : activeBounds.right > bounds.right ? activeBounds.right - bounds.right : 0
      if (offset && typeof nav.scrollTo === 'function') nav.scrollTo({ left: nav.scrollLeft + offset, behavior: 'instant' })
      updateScrollEdges()
    }

    revealActiveSection()
    nav.addEventListener('scroll', updateScrollEdges, { passive: true })
    window.addEventListener('resize', revealActiveSection)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateScrollEdges)
    observer?.observe(nav)
    if (nav.firstElementChild) observer?.observe(nav.firstElementChild)
    return () => {
      nav.removeEventListener('scroll', updateScrollEdges)
      window.removeEventListener('resize', revealActiveSection)
      observer?.disconnect()
    }
  }, [currentValue, items])

  const cueAttributes = (edge: 'left' | 'right') => ({
    'data-consumit-tabs-scroll-cue': edge,
    ...(profileCue ? { 'data-profile-scroll-cue': edge } : {}),
  })

  return (
    <div className="relative min-w-0">
      <Tabs activeValue={currentValue} aria-label={ariaLabel} className={className} id={id} items={items} ref={navigation} />
      {scrollEdges.left ? <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-[var(--fs-page)] to-transparent" {...cueAttributes('left')} /> : null}
      {scrollEdges.right ? <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-[var(--fs-page)] to-transparent" {...cueAttributes('right')} /> : null}
    </div>
  )
}
