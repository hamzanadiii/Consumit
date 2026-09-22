'use client'

import type { AnimePage } from '@consumit/contracts'
import { useCallback, useEffect, useRef, useState } from 'react'

import { browserAnimeSeasonal, type BrowserAnimeError } from '@/lib/anime-browser'

export type AnimeFeedQuery = {
  season: 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL'
  year: number
}

export function useAnimeFeed(query: AnimeFeedQuery, initialPage?: AnimePage) {
  const [page, setPage] = useState(initialPage)
  const [loading, setLoading] = useState(!initialPage)
  const [error, setError] = useState(false)
  const requestRef = useRef<AbortController | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const cancelledRef = useRef(false)
  const hasMore = !page || (page.items.length > 0 && page.page < Math.min(page.totalPages, 500))

  const requestPage = useCallback(async () => {
    if (requestRef.current || !hasMore) return
    const controller = new AbortController()
    requestRef.current = controller
    try {
      const next = await browserAnimeSeasonal(query.season, query.year, (page?.page ?? 0) + 1, controller.signal)
      if (cancelledRef.current || requestRef.current !== controller || controller.signal.aborted) return
      setPage((previous) => {
        const items = new Map(previous?.items.map((item) => [item.anilistId, item]))
        next.items.forEach((item) => items.set(item.anilistId, item))
        return {
          ...next,
          items: [...items.values()],
          totalPages: next.items.length === 0 ? next.page : next.totalPages,
        }
      })
    } catch {
      if (!cancelledRef.current && requestRef.current === controller && !controller.signal.aborted) setError(true)
    } finally {
      if (!cancelledRef.current && requestRef.current === controller) {
        requestRef.current = null
        setLoading(false)
      }
    }
  }, [hasMore, page, query])

  const loadMore = useCallback(() => {
    if (requestRef.current || !hasMore) return
    setLoading(true)
    setError(false)
    void requestPage()
  }, [hasMore, requestPage])

  useEffect(() => {
    cancelledRef.current = false
    return () => {
      cancelledRef.current = true
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!page && !error) void requestPage()
  }, [error, page, requestPage])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || loading || error || !hasMore || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore()
    }, { rootMargin: '600px 0px' })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [error, hasMore, loadMore, loading])

  return { error, hasMore, loading, loadMore, page, sentinelRef }
}
