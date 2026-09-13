'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { buttonVariants } from '../button/button'
import { cn } from '../lib/cn'

export type CarouselRowProps = Omit<ComponentProps<'div'>, 'children'> & {
  action?: ReactNode | undefined
  children: ReactNode
  description?: ReactNode | undefined
  scrollAmount?: number | undefined
  title?: ReactNode | undefined
}

export function CarouselRow({
  action,
  children,
  className,
  description,
  scrollAmount = 640,
  title,
  ...props
}: CarouselRowProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollState = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const { clientWidth, scrollLeft, scrollWidth } = el
    setCanScrollLeft(scrollLeft > 6)
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 6)
  }, [])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    updateScrollState()
    el.addEventListener('scroll', updateScrollState, { passive: true })

    let resizeObserver: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateScrollState)
      resizeObserver.observe(el)
    }

    return () => {
      el.removeEventListener('scroll', updateScrollState)
      resizeObserver?.disconnect()
    }
  }, [updateScrollState, children])

  function scroll(direction: 'left' | 'right') {
    const el = scrollerRef.current
    if (!el) return
    const delta = Math.round(el.clientWidth * 0.75) || scrollAmount
    el.scrollBy({
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      left: direction === 'left' ? -delta : delta,
    })
  }

  return (
    <div
      className={cn('group/row relative min-w-0', className)}
      data-consumit-carousel-row
      {...props}
    >
      {/* Header if title/action provided */}
      {title || action ? (
        <div className="mb-4 flex items-end justify-between gap-4 px-1">
          <div>
            {typeof title === 'string' ? (
              <h2 className="font-display text-2xl tracking-[-0.02em] text-ink sm:text-3xl">
                {title}
              </h2>
            ) : (
              title
            )}
            {description ? (
              <p className="mt-1 text-sm text-muted">{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}

      <div className="relative">
        {/* Left Navigation Chevron */}
        <button
          aria-label="Scroll carousel left"
          className={cn(
            buttonVariants({ size: 'icon', variant: 'secondary' }),
            'absolute left-3 top-1/2 z-20 -translate-y-1/2 bg-canvas transition-colors duration-150 hover:text-orange disabled:opacity-0 motion-reduce:transition-none',
            canScrollLeft
              ? 'opacity-100'
              : 'pointer-events-none opacity-0',
          )}
          disabled={!canScrollLeft}
          onClick={() => scroll('left')}
          tabIndex={canScrollLeft ? 0 : -1}
          type="button"
        >
          <ChevronLeft aria-hidden="true" className="size-5" />
        </button>

        {/* Scroll Container */}
        <div
          aria-label={typeof props['aria-label'] === 'string' ? props['aria-label'] : typeof title === 'string' ? title : 'Titles'}
          className="flex gap-4 overflow-x-auto scroll-smooth py-2 px-1 outline-none focus-visible:ring-2 focus-visible:ring-orange motion-reduce:scroll-auto sm:gap-5 [&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar]:h-0 [scrollbar-width:none] [-ms-overflow-style:none]"
          data-consumit-carousel-scroller
          ref={scrollerRef}
          role="group"
          tabIndex={0}
        >
          {children}
        </div>

        {/* Right Navigation Chevron */}
        <button
          aria-label="Scroll carousel right"
          className={cn(
            buttonVariants({ size: 'icon', variant: 'secondary' }),
            'absolute right-3 top-1/2 z-20 -translate-y-1/2 bg-canvas transition-colors duration-150 hover:text-orange disabled:opacity-0 motion-reduce:transition-none',
            canScrollRight
              ? 'opacity-100'
              : 'pointer-events-none opacity-0',
          )}
          disabled={!canScrollRight}
          onClick={() => scroll('right')}
          tabIndex={canScrollRight ? 0 : -1}
          type="button"
        >
          <ChevronRight aria-hidden="true" className="size-5" />
        </button>
      </div>
    </div>
  )
}
