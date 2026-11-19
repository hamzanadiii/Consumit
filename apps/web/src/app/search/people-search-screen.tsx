'use client'

import { publicMemberSummarySchema, type PublicMemberPage, type PublicMemberSummary } from '@consumit/contracts'
import { Button, Input } from '@consumit/ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from 'react'
import { z } from 'zod'
import { searchMembers } from '@/lib/identity-browser'
import { FilScreenShell } from '../shared'
import { MemberRows } from '../profile/member-rows'
import { CommunityTabs } from '../taste/community-tabs'
import { useSession } from '../session/session'

function peopleCount(count: number) {
  return count === 1 ? '1 person' : `${count} people`
}

const PEOPLE_SEARCH_CACHE_TTL_MS = 2 * 60 * 1000
const cachedPeoplePageSchema = z.object({
  items: z.array(publicMemberSummarySchema),
  nextCursor: z.string().max(1024).nullable(),
})

function peopleSearchCacheKey(query: string, viewer: string) {
  return `consumit.people-search.v1:${encodeURIComponent(viewer)}:${encodeURIComponent(query)}`
}

const peopleSearchCacheListeners = new Map<string, Set<() => void>>()

function subscribeToPeopleSearchCache(key: string, listener: () => void) {
  const listeners = peopleSearchCacheListeners.get(key) ?? new Set<() => void>()
  listeners.add(listener)
  peopleSearchCacheListeners.set(key, listeners)
  const onStorage = (event: StorageEvent) => { if (event.key === key || event.key === null) listener() }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) peopleSearchCacheListeners.delete(key)
    window.removeEventListener('storage', onStorage)
  }
}

function getPeopleSearchCacheSnapshot(key: string) {
  try { return window.sessionStorage.getItem(key) } catch { return null }
}

function readPeopleSearchCache(raw: string | null, query: string, viewer: string): PublicMemberPage | null {
  if (!raw) return null
  try {
    const cached = JSON.parse(raw) as { query?: unknown; savedAt?: unknown; viewer?: unknown; page?: unknown }
    if (cached.query !== query || cached.viewer !== viewer || typeof cached.savedAt !== 'number' || Date.now() - cached.savedAt > PEOPLE_SEARCH_CACHE_TTL_MS || cached.savedAt > Date.now() + 1000) return null
    const page = cachedPeoplePageSchema.safeParse(cached.page)
    if (!page.success) return null
    return page.data
  } catch {
    return null
  }
}

function writePeopleSearchCache(query: string, viewer: string, page: PublicMemberPage) {
  try {
    const key = peopleSearchCacheKey(query, viewer)
    window.sessionStorage.setItem(key, JSON.stringify({ query, savedAt: Date.now(), viewer, page }))
    for (const listener of peopleSearchCacheListeners.get(key) ?? []) listener()
  } catch { /* Search and pagination continue when browser storage is unavailable. */ }
}

export function PeopleSearchScreen({ initialQuery, initialPage, initialSuggestions = null, suggestionsError = false }: { initialQuery: string; initialPage: PublicMemberPage | null; initialSuggestions?: PublicMemberSummary[] | null; suggestionsError?: boolean }) {
  const session = useSession()
  const router = useRouter()
  const [page, setPage] = useState(initialPage)
  const [hasLoadedPage, setHasLoadedPage] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(initialQuery.length >= 3 && !initialPage)
  const [refreshing, startRefresh] = useTransition()
  const lock = useRef(false)
  const focusAfterLoad = useRef<'load-more' | 'results' | 'retry' | null>(null)
  const loadMoreRef = useRef<HTMLButtonElement>(null)
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null)
  const retryRef = useRef<HTMLButtonElement>(null)
  const [announcement, setAnnouncement] = useState('')
  const signInNextPath = `/search?${new URLSearchParams({ type: 'people', q: initialQuery }).toString()}`
  const viewerScope = session.status === 'authenticated' && session.member
    ? `member:${session.member.id}`
    : session.status === 'anonymous' ? 'guest' : null
  const cacheKey = viewerScope && initialQuery.length >= 3 ? peopleSearchCacheKey(initialQuery, viewerScope) : null
  const subscribeToCache = useCallback((listener: () => void) => cacheKey ? subscribeToPeopleSearchCache(cacheKey, listener) : () => {}, [cacheKey])
  const readCacheSnapshot = useCallback(() => cacheKey ? getPeopleSearchCacheSnapshot(cacheKey) : null, [cacheKey])
  const cachedPageRaw = useSyncExternalStore(subscribeToCache, readCacheSnapshot, () => null)
  const cachedPage = useMemo(() => viewerScope ? readPeopleSearchCache(cachedPageRaw, initialQuery, viewerScope) : null, [cachedPageRaw, initialQuery, viewerScope])
  const cacheMatchesCurrentResults = Boolean(cachedPage && cachedPage.items.length > (initialPage?.items.length ?? 0) && initialPage?.items.length !== 0 && (!initialPage || initialPage.items.every((item, index) => cachedPage.items[index]?.id === item.id)))
  const restoredPage = !hasLoadedPage && cacheMatchesCurrentResults ? cachedPage : null
  const visiblePage = restoredPage ?? page
  const visibleError = error && !restoredPage
  const statusMessage = busy
    ? 'Searching people'
    : restoredPage
      ? `${peopleCount(restoredPage.items.length)} restored; ${peopleCount(restoredPage.items.length)} shown.`
      : announcement

  useEffect(() => {
    if (busy || !focusAfterLoad.current) return
    const action = focusAfterLoad.current
    focusAfterLoad.current = null
    if (action === 'retry') retryRef.current?.focus()
    else if (action === 'load-more') loadMoreRef.current?.focus()
    else resultsHeadingRef.current?.focus()
  }, [busy, error, visiblePage?.nextCursor])

  async function load() {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(false)
    if (restoredPage) setPage(restoredPage)
    setHasLoadedPage(true)
    try {
      const result = await searchMembers(initialQuery, visiblePage?.nextCursor ?? undefined)
      const total = (visiblePage?.items.length ?? 0) + result.items.length
      const nextPage = { items: [...(visiblePage?.items ?? []), ...result.items], nextCursor: result.nextCursor }
      setPage(nextPage)
      setAnnouncement(`${peopleCount(result.items.length)} loaded; ${peopleCount(total)} shown.`)
      if (viewerScope) writePeopleSearchCache(initialQuery, viewerScope, nextPage)
      focusAfterLoad.current = result.nextCursor ? 'load-more' : 'results'
    }
    catch { setError(true); focusAfterLoad.current = 'retry' }
    finally { lock.current = false; setBusy(false) }
  }
  return (
    <FilScreenShell pageHeading={undefined}>
      <main id="consumit-main-content" tabIndex={-1} className="taste taste-page taste-community-page" data-consumit-people-search>
        <header className="taste-community-header taste-community-people-header">
          <div>
            <p className="taste-community-eyebrow">COMMUNITY</p>
            <h1>Find your kind of people.</h1>
            <p className="taste-community-intro">Meet curators, explore their taste, and follow the voices you want more of.</p>
          </div>
        </header>
        <CommunityTabs active="people" query={initialQuery} signedIn={Boolean(session.member)} />
        <form action="/search" className="taste-community-people-search" method="get" role="search">
          <label className="sr-only" htmlFor="people-query">Search people by name or username</label>
          <Input className="min-w-0 flex-1" defaultValue={initialQuery} id="people-query" maxLength={100} minLength={3} name="q" placeholder="Name or username" type="search" />
          <input name="type" type="hidden" value="people" />
          <Button type="submit">Find people</Button>
        </form>
        <section aria-busy={busy} className="taste-community-people-results">
          <div className="taste-community-people-heading">
            <div><p className="taste-community-eyebrow">YOUR NEXT FOLLOW</p><h2 ref={resultsHeadingRef} tabIndex={-1}>People to meet</h2></div>
            {initialQuery.length >= 3 && visiblePage ? <span className="taste-muted">{visiblePage.items.length ? `${visiblePage.items.length} ${visiblePage.items.length === 1 ? 'curator' : 'curators'} shown` : 'No matches'}</span> : null}
          </div>
          {initialQuery.length < 3 ? <p className="taste-community-people-note">Enter at least three characters to search public profiles.</p> : null}
          {visiblePage?.items.length === 0 ? <div className="taste-community-people-empty"><h3>No people found for “{initialQuery}”.</h3><p>Try a different name or spelling, or explore collections to find a new curator.</p><Link className="taste-button" href="/community?mode=discover">Explore collections</Link></div> : null}
          {visiblePage?.items.length ? <MemberRows items={visiblePage.items} signInNextPath={signInNextPath} /> : null}
          {visibleError ? <div className="taste-community-inline-error" role="alert"><p>People search could not load.</p><Button ref={retryRef} disabled={busy} onClick={() => void load()} variant="secondary">{busy ? 'Searching…' : 'Try again'}</Button></div> : null}
          {!visibleError && visiblePage?.nextCursor ? <Button ref={loadMoreRef} className="taste-community-load-more" disabled={busy} onClick={() => void load()} variant="secondary">{busy ? 'Searching…' : 'Load more people'}</Button> : null}
          <p aria-atomic="true" className="sr-only" role="status">{statusMessage}</p>
        </section>
        {(initialQuery.length < 3 || page?.items.length === 0) ? <section aria-labelledby="people-suggestions-title" className="taste-community-suggestions">
          <div className="taste-community-suggestions-intro">
            <h2 id="people-suggestions-title">Curators to explore</h2>
            <p>Meet people behind public collections, then follow the voices you want to hear from.</p>
          </div>
          {suggestionsError ? <div className="taste-community-inline-error" role="alert"><p>Curator suggestions could not load.</p><Button disabled={refreshing} onClick={() => startRefresh(() => router.refresh())} variant="secondary">{refreshing ? 'Refreshing…' : 'Try again'}</Button></div> : null}
          {!suggestionsError && initialSuggestions?.length ? <MemberRows items={initialSuggestions} signInNextPath={signInNextPath} /> : null}
          {!suggestionsError && initialSuggestions?.length === 0 ? <div className="taste-community-suggestions-empty"><p>No new curators to suggest yet. Explore public collections to meet someone new.</p><Link className="taste-button" href="/community?mode=discover">Explore collections</Link></div> : null}
        </section> : null}
      </main>
    </FilScreenShell>
  )
}
