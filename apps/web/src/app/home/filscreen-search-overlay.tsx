'use client'

import { kindLabel, titleHref, type PublicMemberSummary, type AnimeTitleSummary, type CatalogTitleSummary } from '@consumit/contracts'
import { Avatar, Select } from '@consumit/ui'
import { ArrowRight, CornerDownLeft, Search, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { searchMembers } from '@/lib/identity-browser'
import { memberAvatarSrc } from '@/lib/avatar'
import { FollowButton } from '../profile/follow-button'
import { browserSearchAnime } from '@/lib/anime-browser'
import { browserSearchCatalog } from '@/lib/catalog-browser'

const SEARCH_DEBOUNCE_MS = 200
const MAX_OVERLAY_RESULTS = 7
const MAX_CATALOG_RESULTS = 7
const MAX_ANIME_RESULTS = 5

const OVERLAY_ANIMATION = [
  '@keyframes fs-search-backdrop-in{from{opacity:0}to{opacity:1}}',
  '@keyframes fs-search-panel-in{from{opacity:0;transform:translateY(18px) scale(.95);filter:blur(6px)}to{opacity:1;transform:none;filter:none}}',
  '.fs-search-backdrop{animation:fs-search-backdrop-in .2s ease both}',
  '.fs-search-panel{animation:fs-search-panel-in .3s cubic-bezier(.16,1,.3,1) both;transform-origin:top center}',
  '.fs-search-panel input[type="search"]::-webkit-search-cancel-button,.fs-search-panel input[type="search"]::-webkit-search-decoration,.fs-search-panel input[type="search"]::-webkit-search-results-button,.fs-search-panel input[type="search"]::-webkit-search-results-decoration{display:none;-webkit-appearance:none;appearance:none}',
  '.fs-search-panel input[type="search"]::-ms-clear,.fs-search-panel input[type="search"]::-ms-reveal{display:none;width:0;height:0}',
  '@media (prefers-reduced-motion:reduce){.fs-search-backdrop,.fs-search-panel{animation:none}}',
].join('')

type SearchStatus = 'idle' | 'loading' | 'error'

type SearchScope = 'all' | 'movie' | 'series' | 'anime' | 'people'

const SCOPES: ReadonlyArray<{ value: SearchScope; label: string; placeholder: string }> = [
  { value: 'all', label: 'All', placeholder: 'Search movies and TV shows…' },
  { value: 'movie', label: 'Movies', placeholder: 'Search movies…' },
  { value: 'series', label: 'Series', placeholder: 'Search series…' },
  { value: 'anime', label: 'Anime', placeholder: 'Search anime…' },
  { value: 'people', label: 'People', placeholder: 'Search names or usernames…' },
]

type OverlayEntry = {
  member?: PublicMemberSummary

  href: string
  key: string
  meta: string
  posterUrl?: string | undefined
  ratingLabel?: string | undefined
  title: string
}

function catalogEntry(item: CatalogTitleSummary): OverlayEntry {
  return {
    href: titleHref(item),
    key: `${item.kind}:${item.id}`,
    meta: [item.year ? String(item.year) : null, kindLabel(item.kind)].filter(Boolean).join(' · '),
    posterUrl: item.posterUrl ?? undefined,
    ratingLabel: typeof item.tmdbRating === 'number' ? `★ ${item.tmdbRating.toFixed(1)}` : undefined,
    title: item.title,
  }
}

function animeEntry(anime: AnimeTitleSummary): OverlayEntry {
  const score = anime.averageScore === null ? undefined : (anime.averageScore / 10).toFixed(1)
  return {
    href: `/anime/${anime.anilistId}`,
    key: `anime:${anime.anilistId}`,
    meta: [anime.seasonYear ? String(anime.seasonYear) : null, 'Anime', anime.genres.slice(0, 2).join(' · ') || null].filter(Boolean).join(' · '),
    posterUrl: anime.coverImage.url ?? undefined,
    ratingLabel: score ? `★ ${score}` : undefined,
    title: anime.titles.preferred,
  }
}

function mergeOverlayResults(query: string, catalog: readonly CatalogTitleSummary[], anime: readonly AnimeTitleSummary[]): OverlayEntry[] {
  // One ranked list, not catalog-first: every match scores against the query
  // (exact, prefix, word-prefix, substring, then the rest) and the best
  // title wins regardless of domain. Anime scores across all its titles so
  // a romaji query like "boku no hero" still matches. Ties keep fetch order.
  const scored: { entry: OverlayEntry; score: number }[] = [
    ...catalog.slice(0, MAX_CATALOG_RESULTS).map((item) => ({
      entry: catalogEntry(item),
      score: matchScore(query, [item.title]),
    })),
    ...anime.slice(0, MAX_ANIME_RESULTS).map((item) => ({
      entry: animeEntry(item),
      score: matchScore(query, [item.titles.preferred, item.titles.english, item.titles.romaji]),
    })),
  ]
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, MAX_OVERLAY_RESULTS)
    .map((scoredEntry) => scoredEntry.entry)
}

function matchScore(query: string, titles: readonly (string | null)[]): number {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return 4
  let best = 4
  for (const raw of titles) {
    if (!raw) continue
    const title = raw.toLowerCase()
    if (title === normalizedQuery) return 0
    if (title.startsWith(normalizedQuery)) best = Math.min(best, 1)
    else if (title.split(/[^a-z0-9]+/).some((word) => word.startsWith(normalizedQuery))) best = Math.min(best, 2)
    else if (title.includes(normalizedQuery)) best = Math.min(best, 3)
  }
  return best
}

export function FilScreenSearchOverlay({ onClose, open }: { onClose: () => void; open: boolean }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const requestIdRef = useRef(0)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<SearchScope>('all')
  const [results, setResults] = useState<readonly OverlayEntry[]>([])
  const [status, setStatus] = useState<SearchStatus>('idle')
  const [activeIndex, setActiveIndex] = useState(-1)
  const [retryNonce, setRetryNonce] = useState(0)

  const normalized = query.trim().slice(0, 100)
  const minimumLength = scope === 'people' ? 3 : 2
  const showResults = normalized.length >= minimumLength

  function handleQuery(value: string) {
    setQuery(value)
    if (value.trim().length < minimumLength) {
      requestIdRef.current += 1
      setResults([])
      setStatus('idle')
      setActiveIndex(-1)
    }
  }

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    inputRef.current?.focus()
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => {
      document.body.style.overflow = previousOverflow
      cancelAnimationFrame(frame)
    }
  }, [open])

  useEffect(() => {
    if (!open || normalized.length < minimumLength) return
    const controller = new AbortController()
    const requestId = ++requestIdRef.current
    const timer = window.setTimeout(() => {
      setStatus('loading')
      if (scope === 'people') {
        void searchMembers(normalized, undefined, controller.signal).then(page => {
          if (requestIdRef.current !== requestId) return
          const items = page.items.slice(0, MAX_OVERLAY_RESULTS).map(member => ({ member, href: `/profile/${member.username}`, key: member.id, title: member.displayName ?? member.username, meta: `@${member.username}` }))
          setResults(items); setStatus('idle'); setActiveIndex(items.length ? 0 : -1)
        }).catch(() => { if (!controller.signal.aborted && requestIdRef.current === requestId) setStatus('error') })
        return
      }
      // Movies/series (TMDB) and anime (AniList) are separate domains.
      // Either outage must not take down the other: each resolves to null
      // on failure and only a total miss surfaces the error state. A chosen
      // scope searches its domain only.
      void Promise.all([
        scope === 'anime' ? Promise.resolve(null) : browserSearchCatalog(normalized, scope, controller.signal).catch(() => null),
        scope === 'movie' || scope === 'series' ? Promise.resolve(null) : browserSearchAnime(normalized, 1, controller.signal).catch(() => null),
      ]).then(([catalog, anime]) => {
        if (requestIdRef.current !== requestId) return
        if (!catalog && !anime) {
          setStatus('error')
          return
        }
        const items = mergeOverlayResults(normalized, catalog?.items ?? [], anime?.items ?? [])
        setResults(items)
        setStatus('idle')
        setActiveIndex(items.length > 0 ? 0 : -1)
      })
    }, SEARCH_DEBOUNCE_MS)
    return () => { window.clearTimeout(timer); controller.abort(); if (requestIdRef.current === requestId) requestIdRef.current += 1 }
  }, [minimumLength, normalized, open, retryNonce, scope])

  useEffect(() => {
    if (!open || activeIndex < 0) return
    const option = document.getElementById(`fs-search-option-${activeIndex}`)
    if (option && typeof option.scrollIntoView === 'function') {
      option.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex, open])

  if (!open) return null

  const activeResult = activeIndex >= 0 ? results[activeIndex] : undefined

  function goTo(href: string) {
    onClose()
    router.push(href)
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (activeResult) {
      goTo(activeResult.href)
      return
    }
    if (normalized.length >= minimumLength) {
      goTo(`/search?q=${encodeURIComponent(normalized)}&type=${scope}`)
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto p-4 pt-[8vh] sm:p-8 sm:pt-[10vh]">
      <style>{OVERLAY_ANIMATION}</style>
      <button
        aria-label="Close search"
        className="fs-search-backdrop fixed inset-0 cursor-default bg-black/70 backdrop-blur-md"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <div
        aria-label="Search titles"
        aria-modal="true"
        className="fs-search-panel relative flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[var(--fs-field-border)] bg-[var(--fs-field)] shadow-[0_32px_80px_-16px_rgba(0,0,0,0.65)]"
        role="dialog"
      >
        <form onSubmit={handleSubmit} role="search">
          <div className="flex items-center gap-2 border-b border-[var(--fs-line)] px-4 py-3 sm:gap-3 sm:px-5">
            <Search aria-hidden="true" className="size-5 shrink-0 text-[var(--fs-muted)]" />
            <Select
              className="w-28 shrink-0"
              hideLabel
              label="Search scope"
              onValueChange={(value) => {
                setScope(value as SearchScope)
                // Results belong to one scope; never show the previous
                // scope's titles while (or after) the new one resolves.
                setResults([])
                setActiveIndex(-1)
                setStatus('idle')
                inputRef.current?.focus()
              }}
              options={SCOPES.map(({ label, value }) => ({ label, value }))}
              value={scope}
            />
            <label className="sr-only" htmlFor="filscreen-command-search">
              {scope === 'people' ? 'Search people' : 'Search movies, series, and anime'}
            </label>
            <input
              aria-activedescendant={activeResult ? `fs-search-option-${activeIndex}` : undefined}
              aria-autocomplete="list"
              aria-controls="filscreen-search-results"
              aria-expanded={results.length > 0}
              autoComplete="off"
              className="h-12 min-w-0 flex-1 bg-transparent text-lg text-[var(--fs-ink)] caret-[var(--fs-focus)] outline-none placeholder:text-[var(--fs-muted)]"
              id="filscreen-command-search"
              maxLength={100}
              onChange={(event) => handleQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  setActiveIndex((current) => (results.length === 0 ? -1 : (current + 1) % results.length))
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  setActiveIndex((current) => (results.length === 0 ? -1 : (current - 1 + results.length) % results.length))
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  onClose()
                }
              }}
              placeholder={SCOPES.find((entry) => entry.value === scope)?.placeholder ?? 'Search movies and TV shows…'}
              ref={inputRef}
              role="combobox"
              spellCheck={false}
              type="search"
              value={query}
            />
            {query ? (
              <button
                aria-label="Clear search"
                className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg text-[var(--fs-muted)] outline-none transition-colors hover:bg-[var(--fs-hover)] hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
                onClick={() => {
                  handleQuery('')
                  inputRef.current?.focus()
                }}
                type="button"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            ) : null}
            <kbd className="hidden shrink-0 rounded-md border border-[var(--fs-field-border)] bg-[var(--fs-rail)] px-2 py-1 text-[11px] font-bold text-[var(--fs-muted)] sm:inline-block">
              ESC
            </kbd>
          </div>
        </form>

        <div className="min-h-0 overflow-y-auto">
          {!showResults ? (
            <div className="flex flex-col items-center px-5 py-14 text-center sm:px-8">
              <span aria-hidden="true" className="grid size-14 place-items-center rounded-full border border-[var(--fs-line)] bg-[var(--fs-rail)]">
                <Search className="size-6 text-[var(--fs-muted)]" />
              </span>
              <p className="mt-5 text-lg font-bold text-[var(--fs-ink)]">{scope === 'people' ? 'Find people with your taste' : 'Find something to watch'}</p>
              <p className="mt-2 max-w-xs text-sm leading-6 text-[var(--fs-muted)]">
                {scope === 'people' ? 'Enter at least three characters to find public profiles. Search by name or username.' : <>Start typing a title, then narrow by <strong className="text-[var(--fs-ink)]">Movies</strong>, <strong className="text-[var(--fs-ink)]">Series</strong> or <strong className="text-[var(--fs-ink)]">Anime</strong>.</>}
              </p>
            </div>
          ) : status === 'loading' && results.length === 0 ? (
            <p className="px-5 py-8 text-sm text-[var(--fs-muted)]" role="status">
              {scope === 'people' ? 'Searching people…' : 'Searching the catalog…'}
            </p>
          ) : status === 'error' ? (
            <div className="px-5 py-8">
              <p className="text-sm text-[var(--fs-danger)]" role="alert">
                Search could not load. Your place here is safe.
              </p>
              <button
                className="mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-[var(--fs-field-border)] px-4 text-sm font-bold text-[var(--fs-ink)] outline-none transition-colors hover:border-[var(--fs-focus)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
                onClick={() => setRetryNonce((count) => count + 1)}
                type="button"
              >
                Try again
              </button>
            </div>
          ) : results.length === 0 ? (
            <div className="px-5 py-8">
              <p className="text-sm font-bold text-[var(--fs-ink)]">No {scope === 'people' ? 'people' : 'titles'} found for “{normalized}”.</p>
              <p className="mt-1 text-sm text-[var(--fs-muted)]">Try a different spelling, or see everything matching on the full search page.</p>
            </div>
          ) : (
            <ul aria-label="Matching titles" className="p-2" id="filscreen-search-results" role="listbox">
              {results.map((item, index) => {
                const selected = index === activeIndex
                return (
                  <li
                    aria-selected={selected}
                    className={`flex items-center gap-4 rounded-xl px-3 py-2.5 outline-none transition-colors ${
                      selected ? 'bg-[var(--fs-accent-soft)] shadow-[inset_0_0_0_1px_var(--fs-accent)]' : 'hover:bg-[var(--fs-hover)]'
                    }`}
                    id={`fs-search-option-${index}`}
                    key={item.key}
                    onMouseEnter={() => setActiveIndex(index)}
                    role="option"
                  >
                    {item.member ? <Avatar name={item.title} size="md" src={memberAvatarSrc(item.member.avatarUrl, item.member.id)} treatment={item.member.avatarStyle} /> : <span aria-hidden="true" className="grid h-20 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--fs-rail)] text-base font-bold text-[var(--fs-muted)]">
                      {item.posterUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- tiny command-palette thumb avoids Next image overhead
                        <img alt="" className="h-full w-full object-cover" loading="lazy" src={item.posterUrl} />
                      ) : (
                        item.title.charAt(0)
                      )}
                    </span>}
                    <Link
                      className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
                      href={item.href}
                      onClick={onClose}
                      tabIndex={-1}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-bold text-[var(--fs-ink)]">{item.title}</span>
                        <span className="mt-1 block truncate text-sm text-[var(--fs-muted)]">
                          {item.meta}
                          {item.ratingLabel ? (
                            <>
                              {' · '}
                              <span className="text-[var(--fs-star)]">{item.ratingLabel}</span>
                            </>
                          ) : null}
                        </span>
                      </span>
                      <CornerDownLeft aria-hidden="true" className={`size-5 shrink-0 ${selected ? 'text-[var(--fs-accent)]' : 'text-[var(--fs-muted)]'}`} />
                    </Link>
                    {item.member ? <FollowButton isFollowing={item.member.isFollowing} memberId={item.member.id} username={item.member.username} /> : null}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-[var(--fs-line)] bg-[var(--fs-rail)] px-4 py-3 text-xs text-[var(--fs-muted)] sm:px-5">
          <span className="hidden items-center gap-1.5 sm:flex" aria-hidden="true">
            <kbd className="rounded border border-[var(--fs-field-border)] bg-[var(--fs-field)] px-1.5 py-0.5 font-bold">↑↓</kbd>
            navigate
          </span>
          <span className="hidden items-center gap-1.5 sm:flex" aria-hidden="true">
            <kbd className="rounded border border-[var(--fs-field-border)] bg-[var(--fs-field)] px-1.5 py-0.5 font-bold">↵</kbd>
            open
          </span>
          <span className="hidden items-center gap-1.5 sm:flex" aria-hidden="true">
            <kbd className="rounded border border-[var(--fs-field-border)] bg-[var(--fs-field)] px-1.5 py-0.5 font-bold">esc</kbd>
            close
          </span>
          {showResults ? (
            <Link
              className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-bold text-[var(--fs-accent)] outline-none hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
              href={`/search?q=${encodeURIComponent(normalized)}&type=${scope}`}
              onClick={onClose}
            >
              See all results
              <ArrowRight aria-hidden="true" className="size-3.5" />
            </Link>
          ) : (
            <span className="ml-auto" aria-hidden="true">
              ⌘K to toggle
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
