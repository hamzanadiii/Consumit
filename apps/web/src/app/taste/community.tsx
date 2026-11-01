'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { tasteAuthorSchema, tasteCommunitySchema, tasteListLayoutSchema, type TasteCommunity, type CatalogRef, type CatalogTitleSummary } from '@consumit/contracts'
import { Avatar } from '@consumit/ui'
import { browserCatalogTitlesForRefs } from '@/lib/catalog-browser'
import { memberAvatarSrc } from '@/lib/avatar'
import { IdentityApiError } from '@/lib/identity-browser'
import { FilScreenShell } from '../shared'
import { formatTasteDate, TastePoster, titleKey, Spoiler } from './primitives'
import { tasteRead, tasteWrite, errorText } from './api'
import { CommunityTabs } from './community-tabs'
import { useSession } from '../session/session'

const followingReturnStateSchema = z.object({
  viewer: z.string().min(1),
  query: z.string().max(100),
  kind: z.string().max(20),
  genre: z.string().max(80),
  cursors: z.array(z.string().min(1).max(1024)).max(1000),
})

function followingReturnStateKey(viewer: string, query: string, kind: string, genre: string) {
  return `consumit.community-following-return.v1.${[viewer, query, kind, genre].map(encodeURIComponent).join(':')}`
}

function readFollowingReturnCursors(key: string, viewer: string, query: string, kind: string, genre: string) {
  try {
    const raw = window.sessionStorage.getItem(key)
    if (!raw) return []
    const parsed = followingReturnStateSchema.safeParse(JSON.parse(raw))
    if (!parsed.success || parsed.data.viewer !== viewer || parsed.data.query !== query || parsed.data.kind !== kind || parsed.data.genre !== genre) return []
    return [...new Set(parsed.data.cursors)]
  } catch {
    return []
  }
}

function storeFollowingReturnCursors(key: string, viewer: string, query: string, kind: string, genre: string, cursors: string[]) {
  try {
    if (cursors.length) window.sessionStorage.setItem(key, JSON.stringify({ viewer, query, kind, genre, cursors }))
    else window.sessionStorage.removeItem(key)
  } catch { /* Returning to the feed remains optional when device storage is unavailable. */ }
}

function communityHref(mode: 'following' | 'discover', query: string, kind: string, genre: string, cursor?: string) {
  const params = new URLSearchParams({ mode })
  if (query) params.set('q', query)
  if (kind !== 'all') params.set('kind', kind)
  if (genre) params.set('genre', genre)
  if (cursor) params.set('cursor', cursor)
  return `/community?${params}`
}

function itemKindLabel(kind: TasteCommunity['items'][number]['kind']) {
  if (kind === 'review') return 'Review'
  if (kind === 'edition') return 'Monthly edition'
  return 'Collection'
}

function itemActionLabel(kind: TasteCommunity['items'][number]['kind']) {
  if (kind === 'review') return 'Read review'
  if (kind === 'edition') return 'Open edition'
  return 'Explore collection'
}

function CommunityCard({ item, titles }: { item: TasteCommunity['items'][number]; titles: Map<string, CatalogTitleSummary> }) {
  const refs = item.refs.slice(0, 5)

  return (
    <article className="taste-community-card">
      <div aria-label={refs.length ? `${refs.length} title${refs.length === 1 ? '' : 's'} in this ${item.kind === 'list' ? 'collection' : item.kind === 'edition' ? 'edition' : 'review'}` : undefined} className="taste-community-art" data-cover-count={refs.length} role={refs.length ? 'group' : undefined} style={{ gridTemplateColumns: `repeat(${Math.max(refs.length, 1)}, minmax(0, 1fr))` }}>
        {refs.length ? refs.map((ref: CatalogRef) => (
          <TastePoster key={titleKey(ref)} refValue={ref} small title={titles.get(titleKey(ref))} />
        )) : <span className="taste-community-art-empty">A point of view, in progress</span>}
      </div>
      <div className="taste-community-card-copy">
        <div className="taste-community-byline">
          <Link className="taste-community-curator" href={`/profile/${item.author.username}`}>
            <Avatar name={item.author.name} size="sm" src={memberAvatarSrc(item.author)} treatment="noir" />
            <span><strong>{item.author.name}</strong><span className="taste-muted">@{item.author.username}</span></span>
          </Link>
          <time className="taste-muted" dateTime={item.date}>{formatTasteDate(item.date)}</time>
        </div>
        <p className="taste-community-kind">{itemKindLabel(item.kind)}</p>
        <h2><Link href={item.href}>{item.title}</Link></h2>
        {item.excerpt ? <Spoiler hidden={item.spoiler}><p className="taste-community-excerpt">{item.excerpt.slice(0, 300)}</p></Spoiler> : null}
        <Link className="taste-community-action" href={item.href}>{itemActionLabel(item.kind)} <span aria-hidden="true">↗</span></Link>
      </div>
    </article>
  )
}

export function CommunityScreen({ data, titles, mode, query, kind, genre, cursor = '', initialError = false }: {
  data: TasteCommunity | null
  titles: CatalogTitleSummary[]
  mode: 'following' | 'discover'
  query: string
  kind: string
  genre: string
  cursor?: string
  initialError?: boolean
}) {
  const session = useSession()
  const router = useRouter()
  const [search, setSearch] = useState(query)
  const [filter, setFilter] = useState(kind)
  const [genreFilter, setGenreFilter] = useState(genre)
  const [feed, setFeed] = useState(data)
  const [resolvedTitles, setResolvedTitles] = useState(titles)
  const [loadError, setLoadError] = useState(initialError)
  const [retrying, setRetrying] = useState(false)
  const [recoveryAnnouncement, setRecoveryAnnouncement] = useState('')
  const [recoveryVersion, setRecoveryVersion] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [restoringFollowing, setRestoringFollowing] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState<{ message: string; retryable: boolean } | null>(null)
  const [pageFeedback, setPageFeedback] = useState<{ kind: 'more' | 'end'; message: string } | null>(null)
  const [loadedCursors, setLoadedCursors] = useState<string[]>([])
  const mainRef = useRef<HTMLElement | null>(null)
  const loadMoreController = useRef<AbortController | null>(null)
  const loadMoreButtonRef = useRef<HTMLButtonElement | null>(null)
  const restartButtonRef = useRef<HTMLButtonElement | null>(null)
  const endStatusRef = useRef<HTMLParagraphElement | null>(null)
  const hasFilters = Boolean(query || kind !== 'all' || genre)
  const pageSubject = mode === 'discover' ? 'collections' : 'publications'
  const titleMap = new Map(resolvedTitles.map((title) => [titleKey(title), title]))

  async function retryFeed() {
    setRetrying(true)
    try {
      const params = new URLSearchParams({ mode, q: query, kind, genre, ...(cursor ? { cursor } : {}) })
      const nextFeed = await tasteRead(`community?${params}`, tasteCommunitySchema)
      setFeed(nextFeed)
      setLoadError(false)
      setRecoveryAnnouncement(nextFeed.items.length ? 'Community loaded.' : '')
      setRecoveryVersion(version => version + 1)
      const refs = nextFeed.items.flatMap((item) => item.refs)
      if (refs.length) {
        try {
          const result = await browserCatalogTitlesForRefs(refs)
          setResolvedTitles(result.titles)
        } catch { /* The publication feed is still useful when title artwork is unavailable. */ }
      }
    } catch {
      setLoadError(true)
    } finally {
      setRetrying(false)
    }
  }

  async function loadMore() {
    if (!feed?.nextCursor || loadMoreController.current) return
    const controller = new AbortController()
    loadMoreController.current = controller
    setLoadingMore(true)
    setLoadMoreError(null)
    setPageFeedback(null)
    setRecoveryAnnouncement('')
    try {
      const requestedCursor = feed.nextCursor
      const params = new URLSearchParams({ mode, q: query, kind, genre, cursor: requestedCursor })
      const nextPage = await tasteRead(`community?${params}`, tasteCommunitySchema, controller.signal)
      if (controller.signal.aborted) return
      const loadedIds = new Set(feed.items.map((item) => item.id))
      const newItems = nextPage.items.filter((item) => !loadedIds.has(item.id))
      setFeed({ items: [...feed.items, ...newItems], nextCursor: nextPage.nextCursor })
      if (mode === 'following' && session.member) {
        const nextCursors = loadedCursors.includes(requestedCursor) ? loadedCursors : [...loadedCursors, requestedCursor]
        setLoadedCursors(nextCursors)
        storeFollowingReturnCursors(followingReturnStateKey(session.member.id, query, kind, genre), session.member.id, query, kind, genre, nextCursors)
      }

      const refs = newItems.flatMap((item) => item.refs)
      if (refs.length) {
        void browserCatalogTitlesForRefs(refs).then((result) => {
          if (controller.signal.aborted) return
          setResolvedTitles((current) => {
            const byKey = new Map(current.map((title) => [titleKey(title), title]))
            for (const title of result.titles) byKey.set(titleKey(title), title)
            return [...byKey.values()]
          })
        }).catch(() => { /* Collections remain readable when optional catalog artwork is unavailable. */ })
      }

      const subject = mode === 'discover' ? 'collection' : 'publication'
      const loaded = newItems.length === 1 ? `1 more ${subject}` : `${newItems.length} more ${subject}s`
      const pluralSubject = mode === 'discover' ? 'collections' : 'publications'
      const message = nextPage.nextCursor
        ? newItems.length ? `${loaded} loaded.` : `No new ${pluralSubject} on this page.`
        : newItems.length
          ? `Loaded ${loaded}. You’re all caught up.`
          : `No new ${pluralSubject} on this page. You’re all caught up.`
      setPageFeedback({ kind: nextPage.nextCursor ? 'more' : 'end', message })
    } catch (error) {
      if (!controller.signal.aborted) {
        setLoadMoreError({ message: errorText(error), retryable: !(error instanceof IdentityApiError) || error.retryable })
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoadingMore(false)
        if (loadMoreController.current === controller) loadMoreController.current = null
      }
    }
  }

  useEffect(() => {
    const viewer = session.status === 'authenticated' ? session.member?.id : undefined
    if (mode !== 'following' || !viewer || !data || cursor) return
    const key = followingReturnStateKey(viewer, query, kind, genre)
    const cursors = readFollowingReturnCursors(key, viewer, query, kind, genre)
    if (!cursors.length) return

    const controller = new AbortController()
    let active = true
    loadMoreController.current = controller
    void (async () => {
      setRestoringFollowing(true)
      let restoredFeed = data
      const restoredCursors: string[] = []
      try {
        for (const pageCursor of cursors) {
          const params = new URLSearchParams({ mode, q: query, kind, genre, cursor: pageCursor })
          const nextPage = await tasteRead(`community?${params}`, tasteCommunitySchema, controller.signal)
          if (controller.signal.aborted) return
          const loadedIds = new Set(restoredFeed.items.map((item) => item.id))
          const newItems = nextPage.items.filter((item) => !loadedIds.has(item.id))
          restoredFeed = { items: [...restoredFeed.items, ...newItems], nextCursor: nextPage.nextCursor }
          restoredCursors.push(pageCursor)
          setFeed(restoredFeed)
          setLoadedCursors([...restoredCursors])
          storeFollowingReturnCursors(key, viewer, query, kind, genre, restoredCursors)

          const refs = newItems.flatMap((item) => item.refs)
          if (refs.length) {
            void browserCatalogTitlesForRefs(refs).then((result) => {
              if (controller.signal.aborted) return
              setResolvedTitles((current) => {
                const byKey = new Map(current.map((title) => [titleKey(title), title]))
                for (const title of result.titles) byKey.set(titleKey(title), title)
                return [...byKey.values()]
              })
            }).catch(() => { /* Publications remain readable without optional artwork. */ })
          }
        }
        if (active) setRecoveryAnnouncement('Your place in Following has been restored.')
      } catch (error) {
        if (active && !controller.signal.aborted) {
          setLoadMoreError({ message: errorText(error), retryable: !(error instanceof IdentityApiError) || error.retryable })
          storeFollowingReturnCursors(key, viewer, query, kind, genre, restoredCursors)
        }
      } finally {
        if (active) {
          setRestoringFollowing(false)
          if (loadMoreController.current === controller) loadMoreController.current = null
        }
      }
    })()
    return () => {
      active = false
      controller.abort()
      if (loadMoreController.current === controller) loadMoreController.current = null
    }
  }, [cursor, data, genre, kind, mode, query, session.member?.id, session.status])

  const isLoadingError = loadError || !feed

  useEffect(() => {
    if (recoveryVersion > 0) mainRef.current?.focus()
  }, [recoveryVersion])

  useEffect(() => {
    if (loadingMore) return
    if (loadMoreError) {
      if (loadMoreError.retryable) loadMoreButtonRef.current?.focus()
      else restartButtonRef.current?.focus()
      return
    }
    if (pageFeedback?.kind === 'end') endStatusRef.current?.focus()
    else if (pageFeedback?.kind === 'more') loadMoreButtonRef.current?.focus()
  }, [loadingMore, loadMoreError, pageFeedback])

  useEffect(() => () => loadMoreController.current?.abort(), [])

  return (
    <FilScreenShell>
      <main ref={mainRef} id="consumit-main-content" tabIndex={-1} className="taste taste-page taste-community-page">
        {recoveryAnnouncement ? <span className="sr-only" role="status">{recoveryAnnouncement}</span> : null}
        <header className="taste-community-header">
          <div>
            <p className="taste-community-eyebrow">COMMUNITY</p>
            <h1>Find your kind of people.</h1>
            <p className="taste-community-intro">Discover collections with a point of view, then meet the people behind them.</p>
          </div>
          <Link className="taste-community-settings" href="/community/settings">Community settings <span aria-hidden="true">↗</span></Link>
        </header>

        <CommunityTabs active={mode} signedIn={Boolean(session.member)} />

        {mode === 'discover' ? (
          <section aria-label="Discover collections" className="taste-community-discovery">
            <form className="taste-community-toolbar" onSubmit={(event) => { event.preventDefault(); router.push(communityHref(mode, search.trim(), filter, genreFilter)) }} role="search">
              <label className="taste-community-search"><span className="sr-only">Search collections</span><input maxLength={100} onChange={(event) => setSearch(event.target.value)} placeholder="A feeling, a theme, a title…" type="search" value={search} /><span aria-hidden="true">⌕</span></label>
              <label className="taste-community-select"><span className="sr-only">Filter by title type</span><select onChange={(event) => { setFilter(event.target.value); router.push(communityHref(mode, search.trim(), event.target.value, genreFilter)) }} value={filter}><option value="all">All titles</option><option value="movie">Movies</option><option value="series">Series</option><option value="anime">Anime</option></select></label>
              <label className="taste-community-select"><span className="sr-only">Filter by genre</span><select onChange={(event) => { setGenreFilter(event.target.value); router.push(communityHref(mode, search.trim(), filter, event.target.value)) }} value={genreFilter}><option value="">All genres</option>{tasteListLayoutSchema.shape.genres.unwrap().element.options.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <button className="taste-button taste-button-primary" type="submit">Find collections</button>
              <Link className="taste-button taste-community-create" href="/lists/new">Create a collection <span aria-hidden="true">＋</span></Link>
            </form>
            {hasFilters ? <div className="taste-community-filter-note"><span>Showing collections for your search</span><button onClick={() => { setSearch(''); setFilter('all'); setGenreFilter(''); router.push(communityHref('discover', '', 'all', '')) }} type="button">Clear filters</button></div> : null}
          </section>
        ) : <div className="taste-community-following-intro"><span>Following</span><p>New reviews, collections, and editions from the curators you follow.</p></div>}

        {isLoadingError ? (
          <section className="taste-community-state" role="alert">
            <p className="taste-community-eyebrow">A MOMENT, PLEASE</p>
            <h2>We couldn’t load this community view.</h2>
            <p>Give it another try. Your place here will be waiting.</p>
            <button className="taste-button taste-button-primary" disabled={retrying} onClick={() => void retryFeed()} type="button">{retrying ? 'Trying again…' : 'Try again'}</button>
          </section>
        ) : !feed.items.length ? (
          <section className="taste-community-state" aria-live="polite">
            <p className="taste-community-eyebrow">{mode === 'discover' ? hasFilters ? 'NO MATCHES YET' : 'A FRESH PAGE' : 'YOUR COMMUNITY'}</p>
            <h2>{mode === 'following' ? 'Your next discovery starts with someone.' : hasFilters ? 'No collections match these filters.' : 'A new point of view starts here.'}</h2>
            <p>{mode === 'following'
              ? 'Follow a curator and their public reviews, collections, and monthly editions will find a home here.'
              : hasFilters
                ? 'Try a broader search or clear your filters to see every public collection.'
                : 'There are no public collections to explore just yet. You can be the first to share one.'}</p>
            {mode === 'following' ? (
              <div className="taste-actions">
                <Link className="taste-button taste-button-primary" href="/community?mode=discover">Explore collections</Link>
                <Link className="taste-button" href="/search?type=people">Find curators</Link>
              </div>
            ) : null}
          </section>
        ) : (
          <section aria-label={mode === 'discover' ? 'Public collections' : 'Recent publications from people you follow'} className={mode === 'discover' ? 'taste-community-grid' : 'taste-community-feed'} id="community-publications">
            {feed.items.map((item) => <CommunityCard item={item} key={item.id} titles={titleMap} />)}
          </section>
        )}

        {!isLoadingError && feed?.nextCursor ? (
          <div className="taste-community-next">
            {loadMoreError ? <p className="taste-community-page-error" role="alert">{loadMoreError.message} {loadMoreError.retryable ? 'Your loaded items are still here.' : mode === 'following' ? 'Restart Following to get a fresh page.' : 'Restart the search to refresh this page.'}</p> : null}
            {pageFeedback?.kind === 'more' ? <span className="sr-only" role="status">{pageFeedback.message}</span> : null}
            {loadMoreError && !loadMoreError.retryable ? (
              <button className="taste-button" disabled={loadingMore} onClick={() => window.location.assign(communityHref(mode, query, kind, genre))} ref={restartButtonRef} type="button">{mode === 'discover' ? 'Restart discovery' : 'Restart Following'}</button>
            ) : (
              <button aria-busy={loadingMore || restoringFollowing} aria-controls="community-publications" className="taste-button" disabled={loadingMore || restoringFollowing} onClick={() => void loadMore()} ref={loadMoreButtonRef} type="button">
                {restoringFollowing ? 'Restoring your place in Following…' : loadingMore ? `Loading more ${pageSubject}…` : loadMoreError ? `Retry loading more ${pageSubject}` : `Load more ${pageSubject}`}
              </button>
            )}
          </div>
        ) : pageFeedback?.kind === 'end' ? (
          <div className="taste-community-next"><p className="taste-community-end" ref={endStatusRef} role="status" tabIndex={-1}>{pageFeedback.message}</p></div>
        ) : null}
      </main>
    </FilScreenShell>
  )
}

export function CommunitySettings() {
  const session = useSession()
  return <CommunitySettingsContent key={session.member?.id ?? 'guest'} />
}

function CommunitySettingsContent() {
  const [items, setItems] = useState<z.infer<typeof tasteAuthorSchema>[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [unblockingId, setUnblockingId] = useState<string | null>(null)
  const [unblockError, setUnblockError] = useState<{ memberId: string; message: string } | null>(null)
  const loadController = useRef<AbortController | null>(null)
  const readBlocks = useCallback((signal?: AbortSignal) => tasteRead('blocks', z.object({ items: z.array(tasteAuthorSchema) }), signal), [])

  const loadBlocks = useCallback(async () => {
    loadController.current?.abort()
    const controller = new AbortController()
    loadController.current = controller
    setLoading(true)
    setLoadError('')
    try {
      const result = await readBlocks(controller.signal)
      if (!controller.signal.aborted) setItems(result.items)
    } catch (error) {
      if (!controller.signal.aborted) setLoadError(errorText(error))
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
        if (loadController.current === controller) loadController.current = null
      }
    }
  }, [readBlocks])

  useEffect(() => {
    const controller = new AbortController()
    loadController.current = controller
    void readBlocks(controller.signal)
      .then(result => { if (!controller.signal.aborted) setItems(result.items) })
      .catch(error => { if (!controller.signal.aborted) setLoadError(errorText(error)) })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
          if (loadController.current === controller) loadController.current = null
        }
      })
    return () => loadController.current?.abort()
  }, [readBlocks])

  async function unblock(memberId: string) {
    setUnblockingId(memberId)
    setUnblockError(null)
    try {
      await tasteWrite(`blocks/${memberId}`, { enabled: false })
      setItems(current => current.filter(item => item.id !== memberId))
    } catch (error) {
      setUnblockError({ memberId, message: errorText(error) })
    } finally {
      setUnblockingId(null)
    }
  }

  return <FilScreenShell><main id="consumit-main-content" tabIndex={-1} className="taste taste-page taste-reading">
    <Link href="/community">← Community</Link>
    <h1>Your community, your boundaries.</h1>
    <p className="taste-empty">Replies to your work arrive in Notifications. Turn curator and list updates on individually; mute discussions from their pages.</p>
    <h2>Blocked members</h2>
    {loading ? <p className="taste-status" role="status">Loading blocked members…</p> : null}
    {!loading && loadError ? <p className="taste-status" role="alert">{loadError} <button className="taste-button" onClick={() => void loadBlocks()} type="button">Retry loading blocked members</button></p> : null}
    {!loading && !loadError ? items.map(item => <div key={item.id}>
      <div aria-busy={unblockingId === item.id} className="taste-order-row">
        <span>{item.name} · @{item.username}</span>
        <button className="taste-button" disabled={unblockingId !== null} onClick={() => void unblock(item.id)} type="button">{unblockingId === item.id ? 'Unblocking…' : 'Unblock'}</button>
      </div>
      {unblockError?.memberId === item.id ? <p className="taste-status" role="alert">{unblockError.message} <button className="taste-button" disabled={unblockingId !== null} onClick={() => void unblock(item.id)} type="button">Retry unblock</button></p> : null}
    </div>) : null}
    {!loading && !loadError && !items.length ? <p className="taste-empty">No blocked members.</p> : null}
    <Link className="taste-button" href="/settings">Profile privacy settings</Link>
  </main></FilScreenShell>
}
