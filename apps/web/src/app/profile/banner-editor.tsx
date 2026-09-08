'use client'

import type { CatalogTitleSummary } from '@consumit/contracts'
import { Search, Trash2 } from 'lucide-react'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { ArtworkFrame, Button, FilterChip, Input } from '@consumit/ui'

import { browserSearchCatalog } from '@/lib/catalog-browser'
import { updateMemberProfile } from '@/lib/identity-browser'

import { useProfileEdit } from './profile-edit'

const SEARCH_DEBOUNCE_MS = 150

function SearchBox({ inputRef, onChange, value }: {
  inputRef: React.RefObject<HTMLInputElement | null>
  onChange: (value: string) => void
  value: string
}) {
  return (
    <form className="relative min-w-0" onSubmit={(event) => event.preventDefault()} role="search">
      <label className="sr-only" htmlFor="profile-banner-search">Search a movie or series for backdrop art</label>
      <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" />
      <Input
        className="h-12 pl-12"
        id="profile-banner-search"
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

type BannerEditorProps = {
  currentBannerUrl: string | null
}

export function BannerEditor({ currentBannerUrl }: BannerEditorProps) {
  const router = useRouter()
  const { bannerOpen, setBannerOpen } = useProfileEdit()
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const requestIdRef = useRef(0)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<'all' | 'movie' | 'series'>('all')
  const [results, setResults] = useState<readonly CatalogTitleSummary[]>([])
  const [staged, setStaged] = useState<string | null>(currentBannerUrl)
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!bannerOpen) return
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
          setResults(response.items.filter((item) => Boolean(item.backdropUrl)))
          setSearchState('idle')
        })
        .catch(() => {
          if (requestIdRef.current !== requestId) return
          setSearchState('error')
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [bannerOpen, query, scope])

  useEffect(() => {
    if (bannerOpen) searchInputRef.current?.focus()
  }, [bannerOpen])

  function handleQuery(value: string) {
    setQuery(value)
    if (value.trim().length < 2) {
      setResults([])
      setSearchState('idle')
    }
  }

  function close() {
    setBannerOpen(false)
    setQuery('')
    setResults([])
    setStaged(currentBannerUrl)
    setSaveError(null)
  }

  async function save() {
    setSaving(true)
    setSaveError(null)
    try {
      await updateMemberProfile({ bannerUrl: staged })
      setBannerOpen(false)
      router.refresh()
    } catch {
      setSaveError('Your banner could not be saved. Please retry.')
      setSaving(false)
    }
  }

  if (!bannerOpen) return null

  return (
    <div className="mt-8 rounded-card border border-border bg-surface p-5 sm:p-8" data-consumit-banner-editor>
      {staged ? (
        <div className="relative aspect-[21/9] overflow-hidden rounded-card border border-border">
          <Image alt="Banner preview" className="object-cover object-[center_25%]" fill sizes="(min-width: 1024px) 60rem, 100vw" src={staged} />
        </div>
      ) : (
        <p className="text-sm text-muted">No banner set. Your favorites artwork shows behind your profile instead.</p>
      )}

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
      {query.trim().length < 2 ? <p className="mt-3 text-xs text-muted">Type at least two characters to search backdrops in real time. Only titles with wide artwork can be banners.</p> : null}
      {searchState === 'loading' ? <p className="mt-5 text-xs text-muted" role="status">Searching the catalog…</p> : null}
      {searchState === 'error' ? <p className="mt-5 text-xs text-orange" role="alert">Search could not load. Your current banner is preserved.</p> : null}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {results.map((title) => (
          <button
            aria-label={`Use ${title.title} as banner`}
            className="group rounded-card text-left outline-none focus-visible:ring-2 focus-visible:ring-orange"
            key={`${title.kind}:${title.id}`}
            onClick={() => setStaged(title.backdropUrl ?? null)}
            type="button"
          >
            <ArtworkFrame alt={`${title.title} backdrop`} ratio="landscape" src={title.backdropUrl ?? undefined} />
            <span className="mt-2 block truncate text-xs font-bold text-ink group-hover:text-orange">{title.title}</span>
            <span className="mt-0.5 block text-[0.6875rem] text-muted">{[title.year, title.kind === 'movie' ? 'Movie' : 'Series'].filter(Boolean).join(' · ')}</span>
          </button>
        ))}
      </div>
      {query.trim().length >= 2 && results.length === 0 && searchState !== 'loading' ? <p className="mt-6 text-sm text-muted">No wide backdrops match that search yet.</p> : null}
      {saveError ? <p className="mt-5 text-xs text-orange" role="alert">{saveError}</p> : null}
      <div className="mt-8 flex flex-wrap gap-3">
        <Button disabled={saving} loading={saving} onClick={() => void save()} variant="accent">Save banner</Button>
        {staged ? (
          <Button disabled={saving} onClick={() => setStaged(null)} type="button" variant="secondary">
            <Trash2 aria-hidden="true" /> Remove
          </Button>
        ) : null}
        <Button disabled={saving} onClick={close} variant="ghost">Cancel</Button>
      </div>
    </div>
  )
}
