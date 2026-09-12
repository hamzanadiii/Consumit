'use client'

import type { CatalogPage } from '@consumit/contracts'
import { useCallback, useEffect, useRef, useState } from 'react'

import { browserDiscoverCatalog, type BrowseCatalogQuery } from '@/lib/catalog-browser'

// The owner remounts this feed when its query changes. Each feed owns its requests.
export function useCatalogFeed(query: BrowseCatalogQuery, initialPage?: CatalogPage) {
  const [page, setPage] = useState(initialPage)
  const [loading, setLoading] = useState(!initialPage)
  const [error, setError] = useState(false)
  const requestRef = useRef<AbortController | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const hasMore = !page || (page.items.length > 0 && page.page < Math.min(page.totalPages, 500))

  const requestPage = useCallback(async () => {
    if (requestRef.current || !hasMore) return
    const controller = new AbortController()
    requestRef.current = controller
    try {
      const next = await browserDiscoverCatalog(query, (page?.page ?? 0) + 1, controller.signal)
      if (controller.signal.aborted) return
      setPage((previous) => {
        const items = new Map(previous?.items.map((item) => [`${item.kind}:${item.id}`, item]))
        next.items.forEach((item) => items.set(`${item.kind}:${item.id}`, item))
        return {
          ...next,
          items: [...items.values()],
          meta: { ...next.meta, stale: next.meta.stale || (previous?.meta.stale ?? false) },
          // Empty pages terminate even if an upstream count is out of date.
          totalPages: next.items.length === 0 ? next.page : next.totalPages,
        }
      })
    } catch {
      if (!controller.signal.aborted) setError(true)
    } finally {
      if (!controller.signal.aborted) {
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
    // requestPage handles cancellation. Stop network work when a filter change
    // replaces this feed, and prevent late results from updating its state.
    return () => {
      requestRef.current?.abort()
      requestRef.current = null
    }
  }, [])

  useEffect(() => {
    // State changes inside requestPage follow the awaited network response.
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
