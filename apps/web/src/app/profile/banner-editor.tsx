'use client'

import { kindLabel, type CatalogTitleSummary } from '@consumit/contracts'
import { Search, Trash2 } from 'lucide-react'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { ArtworkFrame, Button, FilterChip, Input } from '@consumit/ui'

import { browserSearchCatalog } from '@/lib/catalog-browser'
import { updateMemberProfile } from '@/lib/identity-browser'

import { ProfileEditorDialog } from './profile-editor-dialog'
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
        data-initial-focus
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
  const retrySearchRef = useRef<HTMLButtonElement>(null)
  const requestIdRef = useRef(0)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<'all' | 'movie' | 'series' | 'anime'>('all')
  const [results, setResults] = useState<readonly CatalogTitleSummary[]>([])
  const [staged, setStaged] = useState<string | null>(currentBannerUrl)
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [retryRevision, setRetryRevision] = useState(0)
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
  }, [bannerOpen, query, retryRevision, scope])

  useEffect(() => { if (searchState === 'error') retrySearchRef.current?.focus() }, [searchState])

  function handleQuery(value: string) {
    requestIdRef.current++
    setQuery(value)
    if (value.trim().length < 2) {
      setResults([])
      setSearchState('idle')
      return
    }
    setResults([])
    setSearchState('loading')
  }

  function handleScope(value: 'all' | 'movie' | 'series' | 'anime') {
    requestIdRef.current++
    setScope(value)
    if (query.trim().length < 2) return
    setResults([])
    setSearchState('loading')
  }

  function retrySearch() {
    requestIdRef.current++
    setResults([])
    setSearchState('loading')
    setRetryRevision(revision => revision + 1)
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
    } finally {
      setSaving(false)
    }
  }

  if (!bannerOpen) return null

  return (
    <ProfileEditorDialog
      eyebrow="Profile"
      description="A wide cinematic backdrop for your profile. Only titles with wide artwork qualify."
      footer={(
        <>
          {saveError ? <p className="mb-4 text-xs text-[var(--fs-danger)]" role="alert">{saveError}</p> : null}
          <div className="flex flex-wrap gap-3">
            <Button disabled={saving} loading={saving} onClick={() => void save()} variant="accent">Save banner</Button>
            {staged ? (
              <Button disabled={saving} onClick={() => setStaged(null)} type="button" variant="secondary">
                <Trash2 aria-hidden="true" /> Remove
              </Button>
            ) : null}
            <Button disabled={saving} onClick={close} variant="ghost">Cancel</Button>
          </div>
        </>
      )}
      labelledBy="banner-editor-heading"
      onClose={close}
      title="Edit banner"
    >
      <div data-consumit-banner-editor>
        {staged ? (
          <div className="relative aspect-[21/9] overflow-hidden rounded-[16px] border border-[var(--fs-accent)]/50">
            <Image alt="Banner preview" className="object-cover object-[center_25%]" fill sizes="(min-width: 1024px) 48rem, 100vw" src={staged} />
            <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(0deg,rgba(0,0,0,0.45)_0%,transparent_55%)]" />
          </div>
        ) : (
          <div className="rounded-[16px] border border-dashed border-[var(--fs-field-border)] bg-[var(--fs-field)] px-6 py-8 text-sm leading-6 text-[var(--fs-muted)]">
            No banner set. Your favorites artwork shows behind your profile instead.
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <SearchBox inputRef={searchInputRef} onChange={handleQuery} value={query} />
          <div className="grid min-w-0 grid-cols-4 gap-2 sm:flex sm:gap-2">
            {([['all', 'All'], ['movie', 'Movies'], ['series', 'Series'], ['anime', 'Anime']] as const).map(([value, label]) => (
              <FilterChip className="h-12 w-full min-w-0 justify-center whitespace-nowrap px-2 text-[0.6875rem] sm:w-auto sm:flex-none sm:px-4 sm:text-xs" key={value} onClick={() => handleScope(value)} selected={scope === value}>
                {label}
              </FilterChip>
            ))}
          </div>
        </div>
        {query.trim().length < 2 ? <p className="mt-3 text-xs text-[var(--fs-muted)]">Type at least two characters to search backdrops in real time. Only titles with wide artwork can be banners.</p> : null}
        {searchState === 'loading' ? <p className="mt-5 text-xs text-[var(--fs-muted)]" role="status">Searching the catalog…</p> : null}
        {searchState === 'error' ? (
          <div className="mt-5 text-xs text-[var(--fs-danger)]" role="alert">
            <p>Search could not load. Your current banner is preserved.</p>
            <Button className="mt-3 min-h-11 focus:ring-2 focus:ring-[var(--fs-focus)]" onClick={retrySearch} ref={retrySearchRef} variant="secondary">Retry search</Button>
          </div>
        ) : null}
        <div className="mt-5 grid grid-cols-2 gap-3">
          {results.map((title) => {
            const selected = staged === title.backdropUrl
            return (
              <button
                aria-label={`Use ${title.title} as banner`}
                aria-pressed={selected}
                className="group rounded-[16px] text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
                key={`${title.kind}:${title.id}`}
                onClick={() => setStaged(title.backdropUrl ?? null)}
                type="button"
              >
                <span className={`relative block overflow-hidden rounded-[16px] border transition-[transform,border-color,box-shadow] duration-200 motion-reduce:transition-none ${selected ? 'border-[var(--fs-accent)] ring-2 ring-[var(--fs-accent)]' : 'border-[var(--fs-field-border)] group-hover:-translate-y-1 group-hover:border-[var(--fs-accent)]/60 motion-reduce:transform-none'}`}>
                  <ArtworkFrame alt={`${title.title} backdrop`} className="rounded-none border-0" ratio="landscape" src={title.backdropUrl ?? undefined} />
                  {selected ? (
                    <span className="absolute top-2 right-2 rounded-full bg-[var(--fs-accent-strong)] px-2.5 py-1 text-[10px] font-bold tracking-wide text-[var(--fs-on-accent)] uppercase">
                      Selected
                    </span>
                  ) : null}
                </span>
                <span className="mt-2 block truncate text-xs font-bold text-[var(--fs-ink)] group-hover:text-[var(--fs-accent)]">{title.title}</span>
                <span className="mt-0.5 block text-[0.6875rem] text-[var(--fs-muted)] tabular-nums">{[title.year, kindLabel(title.kind)].filter(Boolean).join(' · ')}</span>
              </button>
            )
          })}
        </div>
        {query.trim().length >= 2 && results.length === 0 && searchState === 'idle' ? <p className="mt-5 text-sm text-[var(--fs-muted)]">No wide backdrops match that search yet.</p> : null}
      </div>
    </ProfileEditorDialog>
  )
}
