'use client'

import { titleHref, type CatalogTitleSummary } from '@consumit/contracts'
import { ArrowRight, CornerDownLeft, Search, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { browserSearchCatalog } from '@/lib/catalog-browser'

const SEARCH_DEBOUNCE_MS = 200
const MAX_OVERLAY_RESULTS = 7

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

export function FilScreenSearchOverlay({ onClose, open }: { onClose: () => void; open: boolean }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const requestIdRef = useRef(0)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<readonly CatalogTitleSummary[]>([])
  const [status, setStatus] = useState<SearchStatus>('idle')
  const [activeIndex, setActiveIndex] = useState(-1)
  const [retryNonce, setRetryNonce] = useState(0)

  const normalized = query.trim().slice(0, 100)
  const showResults = normalized.length >= 2

  function handleQuery(value: string) {
    setQuery(value)
    if (value.trim().length < 2) {
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
    if (!open || normalized.length < 2) return
    const requestId = ++requestIdRef.current
    const timer = window.setTimeout(() => {
      setStatus('loading')
      void browserSearchCatalog(normalized, 'all')
        .then((response) => {
          if (requestIdRef.current !== requestId) return
          const items = response.items.slice(0, MAX_OVERLAY_RESULTS)
          setResults(items)
          setStatus('idle')
          setActiveIndex(items.length > 0 ? 0 : -1)
        })
        .catch(() => {
          if (requestIdRef.current !== requestId) return
          setStatus('error')
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [normalized, open, retryNonce])

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
      goTo(titleHref(activeResult))
      return
    }
    if (normalized.length >= 2) {
      goTo(`/search?q=${encodeURIComponent(normalized)}`)
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
          <div className="flex items-center gap-3 border-b border-[var(--fs-line)] px-4 sm:px-5">
            <Search aria-hidden="true" className="size-5 shrink-0 text-[var(--fs-accent)]" />
            <label className="sr-only" htmlFor="filscreen-command-search">
              Search movies and series
            </label>
            <input
              aria-activedescendant={activeResult ? `fs-search-option-${activeIndex}` : undefined}
              aria-autocomplete="list"
              aria-controls="filscreen-search-results"
              aria-expanded={results.length > 0}
              autoComplete="off"
              className="h-16 min-w-0 flex-1 bg-transparent text-lg text-[var(--fs-ink)] caret-[var(--fs-focus)] outline-none placeholder:text-[var(--fs-muted)]"
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
              placeholder="Search movies, series…"
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
            ) : (
              <kbd className="hidden shrink-0 rounded-md border border-[var(--fs-field-border)] bg-[var(--fs-rail)] px-2 py-1 text-[11px] font-bold text-[var(--fs-muted)] sm:inline-block">
                ESC
              </kbd>
            )}
          </div>
        </form>

        <div className="min-h-0 overflow-y-auto">
          {!showResults ? (
            <div className="px-4 py-5 sm:px-5">
              <p className="text-xs font-bold tracking-[0.12em] text-[var(--fs-muted)] uppercase">Jump to</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {([
                  ['Trending movies', '/movies'],
                  ['Trending series', '/series'],
                  ['New for you', '/'],
                ] as const).map(([label, href]) => (
                  <Link
                    className="inline-flex min-h-11 items-center justify-between gap-2 rounded-xl border border-[var(--fs-field-border)] bg-[var(--fs-rail)] px-4 text-sm font-bold text-[var(--fs-ink)] outline-none transition-all hover:-translate-y-px hover:border-[var(--fs-focus)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
                    href={href}
                    key={href}
                    onClick={onClose}
                  >
                    {label}
                    <ArrowRight aria-hidden="true" className="size-4 text-[var(--fs-muted)]" />
                  </Link>
                ))}
              </div>
              <p className="mt-4 text-xs text-[var(--fs-muted)]">Type at least two characters to search the live catalog.</p>
            </div>
          ) : status === 'loading' && results.length === 0 ? (
            <p className="px-5 py-8 text-sm text-[var(--fs-muted)]" role="status">
              Searching the catalog…
            </p>
          ) : status === 'error' && results.length === 0 ? (
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
              <p className="text-sm font-bold text-[var(--fs-ink)]">No titles found for “{normalized}”.</p>
              <p className="mt-1 text-sm text-[var(--fs-muted)]">Try a different spelling, or see everything matching on the full search page.</p>
            </div>
          ) : (
            <ul aria-label="Matching titles" className="p-2" id="filscreen-search-results" role="listbox">
              {results.map((item, index) => {
                const selected = index === activeIndex
                return (
                  <li
                    aria-selected={selected}
                    className={`flex items-center gap-3 rounded-xl px-2 py-2 outline-none transition-colors ${
                      selected ? 'bg-[var(--fs-accent-soft)] shadow-[inset_0_0_0_1px_var(--fs-accent)]' : 'hover:bg-[var(--fs-hover)]'
                    }`}
                    id={`fs-search-option-${index}`}
                    key={`${item.kind}:${item.id}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    role="option"
                  >
                    <span aria-hidden="true" className="grid h-14 w-10 shrink-0 place-items-center overflow-hidden rounded-md bg-[var(--fs-rail)] text-sm font-bold text-[var(--fs-muted)]">
                      {item.posterUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- tiny command-palette thumb avoids Next image overhead
                        <img alt="" className="h-full w-full object-cover" loading="lazy" src={item.posterUrl} />
                      ) : (
                        item.title.charAt(0)
                      )}
                    </span>
                    <Link
                      className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
                      href={titleHref(item)}
                      onClick={onClose}
                      tabIndex={-1}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-[var(--fs-ink)]">{item.title}</span>
                        <span className="mt-0.5 block truncate text-xs text-[var(--fs-muted)]">
                          {[item.year ? String(item.year) : null, item.kind === 'movie' ? 'Movie' : 'Series'].filter(Boolean).join(' · ')}
                          {typeof item.tmdbRating === 'number' ? (
                            <>
                              {' · '}
                              <span className="text-[var(--fs-star)]">★ {item.tmdbRating.toFixed(1)}</span>
                            </>
                          ) : null}
                        </span>
                      </span>
                      <CornerDownLeft aria-hidden="true" className={`size-4 shrink-0 ${selected ? 'text-[var(--fs-accent)]' : 'text-[var(--fs-muted)]'}`} />
                    </Link>
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
              href={`/search?q=${encodeURIComponent(normalized)}`}
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
