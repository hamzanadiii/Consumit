'use client'

import type { CatalogRef, CatalogTitleSummary } from '@consumit/contracts'
import { Plus, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { ArtworkFrame, Button, FilterChip, Input } from '@consumit/ui'

import { browserSearchCatalog } from '@/lib/catalog-browser'
import { saveMemberFavorites } from '@/lib/identity-browser'

import { useProfileEdit } from './profile-edit'

const MAX_FAVORITES = 4
const SEARCH_DEBOUNCE_MS = 150

function favoriteKeyFromRef(ref: CatalogRef) { return `${ref.kind}:${ref.id}` }

function favoriteKeyFromTitle(title: CatalogTitleSummary) { return `${title.kind}:${title.id}` }

function SearchBox({ inputRef, onChange, value }: {
  inputRef: React.RefObject<HTMLInputElement | null>
  onChange: (value: string) => void
  value: string
}) {
  return (
    <form className="relative min-w-0" onSubmit={(event) => event.preventDefault()} role="search">
      <label className="sr-only" htmlFor="profile-favorites-search">Search a movie or series</label>
      <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" />
      <Input
        className="h-12 pl-12"
        id="profile-favorites-search"
        maxLength={100}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder="Search a movie or series"
        ref={inputRef}
        type="search"
        value={value}
      />
    </form>
  )
}

type FavoritesEditorProps = {
  current: readonly CatalogRef[]
  initialTitles: readonly CatalogTitleSummary[]
}

export function FavoritesEditor({ current, initialTitles }: FavoritesEditorProps) {
  const router = useRouter()
  const { favoritesOpen, setFavoritesOpen } = useProfileEdit()
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const requestIdRef = useRef(0)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<'all' | 'movie' | 'series'>('all')
  const [results, setResults] = useState<readonly CatalogTitleSummary[]>([])
  const [slots, setSlots] = useState<readonly (CatalogRef | null)[]>(() => {
    const refs = current.slice(0, MAX_FAVORITES)
    return Array.from({ length: MAX_FAVORITES }, (_, index) => refs[index] ?? null)
  })
  const [activeSlot, setActiveSlot] = useState<number | null>(null)
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!favoritesOpen) return
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
  }, [favoritesOpen, query, scope])

  useEffect(() => {
    if (favoritesOpen) searchInputRef.current?.focus()
  }, [favoritesOpen, activeSlot])

  const known = new Map([...initialTitles, ...results].map((title) => [favoriteKeyFromTitle(title), title]))
  const filledCount = slots.filter((slot): slot is CatalogRef => slot !== null).length

  function handleQuery(value: string) {
    setQuery(value)
    if (value.trim().length < 2) {
      setResults([])
      setSearchState('idle')
    }
  }

  function activateSlot(index: number) {
    setActiveSlot(index)
    searchInputRef.current?.focus()
  }

  function pick(title: CatalogTitleSummary) {
    const id = favoriteKeyFromTitle(title)
    if (slots.some((slot) => slot && favoriteKeyFromRef(slot) === id)) return
    const target = activeSlot !== null && slots[activeSlot] === null
      ? activeSlot
      : slots.findIndex((slot) => slot === null)
    if (target === -1 || target === null) return
    setSlots((currentSlots) => currentSlots.map((slot, index) => (index === target ? { id: title.id, kind: title.kind } : slot)))
    const nextEmpty = slots.findIndex((slot, index) => slot === null && index !== target)
    setActiveSlot(nextEmpty === -1 ? null : nextEmpty)
  }

  function clearSlot(index: number) {
    setSlots((currentSlots) => currentSlots.map((slot, slotIndex) => (slotIndex === index ? null : slot)))
    setActiveSlot(index)
  }

  function close() {
    const refs = current.slice(0, MAX_FAVORITES)
    setSlots(Array.from({ length: MAX_FAVORITES }, (_, index) => refs[index] ?? null))
    setActiveSlot(null)
    setFavoritesOpen(false)
    setQuery('')
    setResults([])
    setSaveError(null)
  }

  async function save() {
    setSaving(true)
    setSaveError(null)
    try {
      await saveMemberFavorites(slots.filter((slot): slot is CatalogRef => slot !== null))
      setFavoritesOpen(false)
      router.refresh()
    } catch {
      setSaveError('Your favorites could not be saved. Please retry.')
      setSaving(false)
    }
  }

  if (!favoritesOpen) return null

  return (
    <div className="mt-8 rounded-card border border-border bg-surface p-5 sm:p-8" data-consumit-favorites-editor>
      <div className="grid grid-cols-4 gap-3 sm:gap-4" role="group" aria-label="Favorite slots">
        {slots.map((slot, index) => {
          const title = slot ? known.get(favoriteKeyFromRef(slot)) : undefined
          if (!slot) {
            const active = activeSlot === index
            return (
              <button
                aria-label={`Pick favorite for slot ${index + 1}`}
                aria-pressed={active}
                className={`grid aspect-[2/3] w-full place-items-center rounded-card border-2 border-dashed outline-none transition-colors motion-reduce:transition-none ${active ? 'border-orange bg-surface-raised' : 'border-control-outline hover:border-ink/60'} focus-visible:ring-2 focus-visible:ring-orange`}
                key={`empty-${index}`}
                onClick={() => activateSlot(index)}
                type="button"
              >
                <Plus aria-hidden="true" className="size-7 text-muted" />
              </button>
            )
          }
          const label = title?.title ?? `${slot.kind === 'movie' ? 'Movie' : 'Series'} #${slot.id}`
          return (
            <div className="relative" key={favoriteKeyFromRef(slot)}>
              <ArtworkFrame alt={`${label} poster`} src={title?.posterUrl ?? undefined} />
              <button
                aria-label={`Remove ${label} from favorites`}
                className="absolute top-2 right-2 grid size-9 place-items-center rounded-full bg-canvas/85 text-ink outline-none transition-colors hover:bg-orange hover:text-canvas focus-visible:ring-2 focus-visible:ring-orange motion-reduce:transition-none"
                onClick={() => clearSlot(index)}
                type="button"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
          )
        })}
      </div>
      <p aria-live="polite" className="mt-3 text-xs text-muted">{filledCount} of {MAX_FAVORITES} selected</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <SearchBox inputRef={searchInputRef} onChange={handleQuery} value={query} />
        <div className="flex gap-2">
          {([['all', 'All'], ['movie', 'Movies'], ['series', 'Series']] as const).map(([value, label]) => (
            <FilterChip className="h-12 flex-1 px-4 sm:flex-none" key={value} onClick={() => setScope(value)} selected={scope === value}>
              {label}
            </FilterChip>
          ))}
        </div>
      </div>
      {query.trim().length < 2 ? <p className="mt-3 text-xs text-muted">Type at least two characters to search the catalog in real time.</p> : null}
      {searchState === 'loading' ? <p className="mt-5 text-xs text-muted" role="status">Searching the catalog…</p> : null}
      {searchState === 'error' ? <p className="mt-5 text-xs text-orange" role="alert">Search could not load. Your current favorites are preserved.</p> : null}
      <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 xl:grid-cols-5">
        {results.map((title) => {
          const taken = slots.some((slot) => slot && favoriteKeyFromRef(slot) === favoriteKeyFromTitle(title))
          return (
            <button
              aria-label={taken ? `${title.title}, already in favorites` : `Pick ${title.title}`}
              className={`group rounded-card text-left outline-none focus-visible:ring-2 focus-visible:ring-orange ${taken ? 'cursor-default opacity-45' : ''}`}
              disabled={taken}
              key={favoriteKeyFromTitle(title)}
              onClick={() => pick(title)}
              type="button"
            >
              <ArtworkFrame alt={`${title.title} poster`} src={title.posterUrl ?? undefined} />
              <span className="mt-2 block truncate text-xs font-bold text-ink">{title.title}</span>
              <span className="mt-0.5 block text-[0.6875rem] text-muted">{[title.year, title.kind === 'movie' ? 'Movie' : 'Series'].filter(Boolean).join(' · ')}</span>
            </button>
          )
        })}
      </div>
      {query.trim().length >= 2 && results.length === 0 && searchState !== 'loading' ? <p className="mt-6 text-sm text-muted">No real catalog titles match that search yet.</p> : null}
      {saveError ? <p className="mt-5 text-xs text-orange" role="alert">{saveError}</p> : null}
      <div className="mt-8 flex flex-wrap gap-3">
        <Button disabled={saving} loading={saving} onClick={() => void save()} variant="accent">Save favorites</Button>
        <Button disabled={saving} onClick={close} variant="secondary">Cancel</Button>
      </div>
    </div>
  )
}
