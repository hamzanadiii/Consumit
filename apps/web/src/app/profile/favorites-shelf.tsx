'use client'

import { kindLabel, MAX_MEMBER_FAVORITES, type CatalogRef, type CatalogTitleSummary } from '@consumit/contracts'
import { Check, LoaderCircle, Plus, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { ArtworkFrame, Button, FilterChip, Input } from '@consumit/ui'

import { TitleCard } from '../shared/title-card'

import { browserSearchCatalog } from '@/lib/catalog-browser'
import { saveMemberFavorites } from '@/lib/identity-browser'

import { ProfileEditorDialog } from './profile-editor-dialog'

const SEARCH_DEBOUNCE_MS = 150

function refKey(ref: CatalogRef) { return `${ref.kind}:${ref.id}` }

function toSavePayload(items: readonly CatalogRef[]): CatalogRef[] {
  return items.map(({ id, kind }) => ({ id, kind }))
}

/**
 * The owner's favorites shelf is its own editor: hovering a poster reveals
 * a remove action that saves immediately, and empty frames open a compact
 * pick-a-favorite palette. Visitors see the same posters without controls.
 */
export function FavoritesShelf({ favorites, owner, titles }: {
  favorites: readonly CatalogRef[]
  owner: boolean
  titles: readonly CatalogTitleSummary[]
}) {
  const router = useRouter()
  const titleMap = new Map(titles.map((title) => [refKey(title), title]))
  const [items, setItems] = useState<readonly CatalogRef[]>(() => favorites.slice(0, MAX_MEMBER_FAVORITES))
  const [removingKey, setRemovingKey] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<'all' | 'movie' | 'series' | 'anime'>('all')
  const [results, setResults] = useState<readonly CatalogTitleSummary[]>([])
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'error'>('idle')
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const requestIdRef = useRef(0)
  const busy = removingKey !== null || picking

  useEffect(() => {
    if (!paletteOpen) return
    const normalized = query.trim().slice(0, 100)
    if (normalized.length < 2) return
    // Stale responses are ignored by request id instead of aborting in
    // flight: aborts surface as unhandled AbortError overlays in the browser.
    const requestId = ++requestIdRef.current
    const timer = window.setTimeout(() => {
      setSearchState('loading')
      void browserSearchCatalog(normalized, scope)
        .then((response) => {
          if (requestIdRef.current !== requestId) return
          setResults(response.items)
          setSearchState('idle')
        })
        .catch(() => {
          if (requestIdRef.current !== requestId) return
          setSearchState('error')
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [paletteOpen, query, scope])

  useEffect(() => {
    if (paletteOpen) searchInputRef.current?.focus()
  }, [paletteOpen])

  function handleQuery(value: string) {
    setQuery(value)
    if (value.trim().length < 2) {
      setResults([])
      setSearchState('idle')
    }
  }

  function closePalette() {
    setPaletteOpen(false)
    setQuery('')
    setResults([])
    setSearchState('idle')
    setError(null)
  }

  async function removeFavorite(ref: CatalogRef) {
    if (busy) return
    const key = refKey(ref)
    const previous = items
    setRemovingKey(key)
    setError(null)
    setItems(previous.filter((item) => refKey(item) !== key))
    try {
      await saveMemberFavorites(toSavePayload(previous.filter((item) => refKey(item) !== key)))
      router.refresh()
    } catch {
      setItems(previous)
      setError('That favorite could not be removed. Please retry.')
    } finally {
      setRemovingKey(null)
    }
  }

  async function pickFavorite(title: CatalogTitleSummary) {
    if (busy || items.length >= MAX_MEMBER_FAVORITES) return
    if (items.some((item) => refKey(item) === refKey(title))) return
    const previous = items
    const next = [...previous, { id: title.id, kind: title.kind } as CatalogRef]
    setPicking(true)
    setError(null)
    setItems(next)
    try {
      await saveMemberFavorites(toSavePayload(next))
      closePalette()
      router.refresh()
    } catch {
      setItems(previous)
      setError('That favorite could not be added. Please retry.')
    } finally {
      setPicking(false)
    }
  }

  return (
    <>
      {error && !paletteOpen ? <p className="mt-8 text-xs text-[var(--fs-danger)]" role="alert">{error}</p> : null}
      <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((favorite) => {
          const title = titleMap.get(refKey(favorite))
          const label = title?.title ?? `${kindLabel(favorite.kind)} #${favorite.id}`
          const key = refKey(favorite)
          const removing = removingKey === key
          const cardTitle = title ?? { id: favorite.id, kind: favorite.kind, title: label, year: null, posterUrl: null, tmdbRating: null }
          return (
            <TitleCard
              action={owner ? (
                <button
                  aria-label={`Remove ${label} from favorites`}
                  className="grid size-8 cursor-pointer place-items-center rounded-full bg-black/70 text-white outline-none transition-colors hover:bg-[var(--fs-accent-strong)] hover:text-[var(--fs-on-accent)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] disabled:cursor-default disabled:opacity-100 [@media(hover:none)]:opacity-100"
                  disabled={busy}
                  onClick={() => void removeFavorite(favorite)}
                  type="button"
                >
                  {removing ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : <X aria-hidden="true" className="size-4" />}
                </button>
              ) : undefined}
              className="min-w-0"
              key={key}
              meta={[title?.year, kindLabel(favorite.kind)].filter(Boolean).join(' · ')}
              rating={null}
              title={cardTitle}
            />
          )
        })}
        {owner ? Array.from({ length: MAX_MEMBER_FAVORITES - items.length }, (_, index) => (
          <li key={`empty-${items.length + index + 1}`}>
            <button
              aria-label={`Add favorite ${items.length + index + 1}`}
              className="group grid aspect-[2/3] w-full cursor-pointer place-items-center rounded-card border border-dashed border-[var(--fs-field-border)] bg-[var(--fs-field)] outline-none transition-all duration-200 ease-out hover:border-[var(--fs-accent)]/60 focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] motion-reduce:transition-none motion-reduce:transform-none disabled:cursor-default disabled:opacity-45 disabled:hover:transform-none"
              disabled={busy}
              onClick={() => setPaletteOpen(true)}
              type="button"
            >
              <span className="grid size-11 place-items-center rounded-full bg-[var(--fs-hover)] text-[var(--fs-muted)] transition-colors duration-200 group-hover:bg-[var(--fs-accent-soft)] group-hover:text-[var(--fs-accent)] motion-reduce:transition-none">
                <Plus aria-hidden="true" className="size-5" />
              </span>
            </button>
          </li>
        )) : null}
      </ul>
      {owner && items.length === 0 ? (
        <p className="mt-4 text-xs leading-5 text-[var(--fs-muted)]">Start with a story you would gladly revisit. Choose up to four titles to make this shelf yours.</p>
      ) : null}
      {owner && paletteOpen ? (
        <ProfileEditorDialog
          eyebrow="Favorites"
          description="Search the real catalog — movies, series, and anime."
          footer={(
            <Button disabled={picking} onClick={closePalette} variant="secondary">Cancel</Button>
          )}
          labelledBy="pick-favorite-heading"
          maxWidthClassName="max-w-xl"
          onClose={closePalette}
          title="Pick a favorite"
        >
          <form className="relative min-w-0" onSubmit={(event) => event.preventDefault()} role="search">
            <label className="block text-xs font-bold tracking-[0.12em] text-[var(--fs-muted)] uppercase" htmlFor="pick-favorite-search">
              Name of movie, series, or anime
            </label>
            <span className="relative mt-2 block">
              <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-[var(--fs-muted)]" />
              <Input
                className="h-12 pl-12 text-base"
                id="pick-favorite-search"
                maxLength={100}
                onChange={(event) => handleQuery(event.currentTarget.value)}
                placeholder="Dune, Severance…"
                ref={searchInputRef}
                type="search"
                value={query}
              />
            </span>
          </form>
          <div className="mt-3 flex gap-2">
            {([['all', 'All'], ['movie', 'Movies'], ['series', 'Series'], ['anime', 'Anime']] as const).map(([value, label]) => (
              <FilterChip className="h-10 flex-1 px-4 sm:flex-none" key={value} onClick={() => setScope(value)} selected={scope === value}>
                {label}
              </FilterChip>
            ))}
          </div>
          {error ? <p className="mt-4 text-xs text-[var(--fs-danger)]" role="alert">{error}</p> : null}
          {searchState === 'loading' ? <p className="mt-4 text-xs text-[var(--fs-muted)]" role="status">Searching the catalog…</p> : null}
          {searchState === 'error' ? <p className="mt-4 text-xs text-[var(--fs-danger)]" role="alert">Search could not load. Please retry.</p> : null}
          {results.length > 0 ? (
            <ul className="mt-4 grid max-h-80 gap-2 overflow-y-auto">
              {results.map((title) => {
                const taken = items.some((item) => refKey(item) === refKey(title))
                return (
                  <li key={refKey(title)}>
                    <button
                      aria-label={taken ? `${title.title}, already in favorites` : `Pick ${title.title}`}
                      className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border border-[var(--fs-field-border)] bg-[var(--fs-field)] p-2 pr-3 text-left outline-none transition-colors duration-150 hover:border-[var(--fs-accent)]/60 hover:bg-[var(--fs-hover)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] motion-reduce:transition-none ${taken ? 'cursor-default opacity-55 hover:border-[var(--fs-field-border)] hover:bg-[var(--fs-field)]' : ''}`}
                      disabled={taken || picking}
                      onClick={() => void pickFavorite(title)}
                      type="button"
                    >
                      <ArtworkFrame alt={`${title.title} poster`} className="w-11 shrink-0 rounded-lg" ratio="square" src={title.posterUrl ?? undefined} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-[var(--fs-ink)]">{title.title}</span>
                        <span className="mt-0.5 block text-xs text-[var(--fs-muted)] tabular-nums">
                          {[title.year ? String(title.year) : null, kindLabel(title.kind)].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      {taken ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-[var(--fs-muted)]">
                          <Check aria-hidden="true" className="size-4" /> Added
                        </span>
                      ) : picking ? (
                        <LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin text-[var(--fs-muted)] motion-reduce:animate-none" />
                      ) : (
                        <Plus aria-hidden="true" className="size-4 shrink-0 text-[var(--fs-muted)]" />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : null}
          {query.trim().length >= 2 && results.length === 0 && searchState !== 'loading' && searchState !== 'error' ? (
            <p className="mt-4 text-sm text-[var(--fs-muted)]">No real catalog titles match that search yet.</p>
          ) : null}
        </ProfileEditorDialog>
      ) : null}
    </>
  )
}
