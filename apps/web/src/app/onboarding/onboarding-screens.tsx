'use client'

import { kindLabel, MAX_MEMBER_FAVORITES, type CatalogTitleSummary } from '@consumit/contracts'
import { Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

import { Button, FilterChip, Input, OnboardingHeader, ProgressRail, SelectableTitle } from '@consumit/ui'

import { browserSearchCatalog } from '@/lib/catalog-browser'
import { saveMemberFavorites } from '@/lib/identity-browser'

function OnboardingScreen({ children, current }: { children: ReactNode; current: number }) {
  return <div className="min-h-screen bg-canvas text-ink"><OnboardingHeader className="lg:min-h-[68px] lg:px-[50px]" current={current} skipHref="/" total={2} />{children}</div>
}

function SearchBox({ label, onChange, placeholder, value }: { label: string; onChange: (value: string) => void; placeholder: string; value: string }) {
  return <form className="relative min-w-0" onSubmit={(event) => event.preventDefault()} role="search"><label className="sr-only" htmlFor={label}>{placeholder}</label><Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" /><Input className="h-12 pl-12" id={label} maxLength={100} onChange={(event) => onChange(event.currentTarget.value)} placeholder={placeholder} type="search" value={value} /></form>
}

function PosterFan({ titles }: { titles: readonly CatalogTitleSummary[] }) {
  return <div aria-hidden="true" className="relative mt-14 hidden h-[18rem] w-[28rem] lg:block">{titles.slice(0, 3).map((title, index) => title.posterUrl ? <Image alt="" className="absolute top-1 aspect-[2/3] h-[16.5rem] w-auto rounded-card border border-ink/15 object-cover shadow-2xl shadow-canvas/40" height={600} key={`${title.kind}:${title.id}`} src={title.posterUrl} style={{ left: `${0.75 + index * 8.1}rem`, transform: `rotate(${-8 + index * 7}deg)`, zIndex: index }} width={400} /> : null)}</div>
}

export function HistoryOnboardingScreen({ titles }: { titles: readonly CatalogTitleSummary[] }) {
  return (
    <OnboardingScreen current={1}><main className="px-5 py-7 sm:px-8 sm:py-10 lg:px-[50px] lg:py-11" data-consumit-onboarding-history><section className="relative overflow-hidden rounded-card border border-border bg-[linear-gradient(135deg,#17131a_0%,#37222e_55%,#15151b_100%)] px-5 py-8 sm:p-10 lg:min-h-[48rem] lg:p-[50px]"><div className="relative grid gap-10 lg:grid-cols-[minmax(0,29.5rem)_minmax(0,1fr)] lg:gap-10"><div className="flex flex-col"><h1 className="max-w-[14ch] text-balance font-display text-4xl leading-[0.98] tracking-[-0.025em] text-ink sm:text-5xl lg:text-[3.25rem]">Your history starts here.</h1><p className="mt-7 max-w-[44ch] text-sm leading-6 text-muted">Nothing to import. Every episode and film you finish lands in your diary automatically, with progress, ratings, and lists building from it.</p><PosterFan titles={titles} /></div><div className="flex flex-col justify-center"><div className="rounded-card border border-white/10 bg-black/25 p-6 sm:p-8"><p className="text-sm font-bold text-ink">Next: pick a few favorites</p><p className="mt-2 max-w-[42ch] text-sm leading-6 text-muted">Tell Consumit what you already love so home opens with something worth watching instead of an empty shelf.</p><Link className="mt-6 inline-flex min-h-11 items-center rounded-control bg-orange px-6 text-sm font-bold text-canvas transition-[filter,transform] hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none" href="/onboarding/favorites">Choose favorites</Link><Link className="mt-5 inline-flex min-h-11 items-center text-xs font-bold text-muted hover:text-ink" href="/">Skip for now</Link></div></div></div></section></main></OnboardingScreen>
  )
}

function favoriteKey(title: CatalogTitleSummary) { return `${title.kind}:${title.id}` }

export function FavoritesOnboardingScreen({ initialTitles }: { initialTitles: readonly CatalogTitleSummary[] }) {
  const router = useRouter()
  const requestIdRef = useRef(0)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<'all' | 'movie' | 'series' | 'anime'>('all')
  const [results, setResults] = useState<readonly CatalogTitleSummary[]>(initialTitles)
  const [selectedIds, setSelectedIds] = useState<string[]>(initialTitles.slice(0, MAX_MEMBER_FAVORITES).map(favoriteKey))
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
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
    }, 350)
    return () => window.clearTimeout(timer)
  }, [initialTitles, query, scope])

  const searchActive = query.trim().length >= 2
  const source = searchActive ? results : initialTitles
  const visible = useMemo(() => (searchActive ? source : source.filter((title) => scope === 'all' || title.kind === scope)), [scope, searchActive, source])
  const visibleSearchState = searchActive ? searchState : 'idle'
  const known = new Map([...initialTitles, ...results].map((title) => [favoriteKey(title), title]))
  const selected = selectedIds.map((id) => known.get(id)).filter((title): title is CatalogTitleSummary => Boolean(title))
  function toggle(id: string) { setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : current.length < MAX_MEMBER_FAVORITES ? [...current, id] : current) }
  async function saveFavorites() {
    setSaving(true); setSaveError(null)
    try {
      await saveMemberFavorites(selected.map(({ id, kind }) => ({ id, kind })))
      router.push('/')
      router.refresh()
    } catch { setSaveError('Your Favorites could not be saved. Please retry.'); setSaving(false) }
  }

  return (
    <OnboardingScreen current={2}><main className="px-5 py-9 sm:px-8 lg:px-[50px] lg:pt-[58px] lg:pb-9" data-consumit-onboarding-favorites><header><h1 className="max-w-[24ch] text-balance font-display text-4xl leading-none tracking-[-0.025em] text-ink sm:text-5xl">Pick four that feel like you.</h1><p className="mt-4 max-w-[68ch] text-sm leading-6 text-muted">Not the “best” titles. The real movies and series you would defend at an unreasonable hour.</p></header><div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_21.9375rem] lg:gap-20"><section><div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><SearchBox label="favorite-title-search" onChange={setQuery} placeholder="Search a movie or series" value={query} /><div className="flex gap-2">{([['all', 'All'], ['movie', 'Movies'], ['series', 'Series'], ['anime', 'Anime']] as const).map(([value, label]) => <FilterChip className="h-12 flex-1 px-4 sm:flex-none" key={value} onClick={() => setScope(value)} selected={scope === value}>{label}</FilterChip>)}</div></div>{query.trim().length === 1 ? <p className="mt-3 text-xs text-orange">Type at least two characters to search.</p> : null}{visibleSearchState === 'loading' ? <p className="mt-5 text-xs text-muted" role="status">Searching the catalog…</p> : null}{visibleSearchState === 'error' ? <p className="mt-5 text-xs text-orange" role="alert">Search could not load. Your current favorites are preserved.</p> : null}<div className="mt-8 grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 xl:grid-cols-5">{visible.map((title) => <SelectableTitle artworkSrc={title.posterUrl ?? undefined} checked={selectedIds.includes(favoriteKey(title))} key={favoriteKey(title)} meta={[title.year, kindLabel(title.kind)].filter(Boolean).join(' · ')} name="favoriteTitles" onChange={() => toggle(favoriteKey(title))} title={title.title} value={favoriteKey(title)} />)}</div>{visible.length === 0 && visibleSearchState !== 'loading' ? <p className="mt-10 text-sm text-muted">No real catalog title matched that search.</p> : null}</section><aside className="self-start rounded-card border border-border bg-surface p-6 lg:sticky lg:top-7"><div className="flex items-baseline justify-between gap-4"><h2 className="text-sm font-bold text-ink">Your four</h2><p className="text-xs font-bold text-orange">{selectedIds.length} selected</p></div><ProgressRail className="mt-6" label={`${selectedIds.length} of ${MAX_MEMBER_FAVORITES} favorite titles selected`} max={MAX_MEMBER_FAVORITES} value={selectedIds.length} /><ol className="mt-7 space-y-3 text-xs text-copy">{selected.map((title) => <li key={favoriteKey(title)}>{title.title}</li>)}</ol>{selectedIds.length === MAX_MEMBER_FAVORITES ? <Button className="mt-8 w-full" loading={saving} onClick={() => void saveFavorites()} variant="accent">Save and continue</Button> : <Button className="mt-8 w-full" disabled size="lg" variant="accent">Choose {MAX_MEMBER_FAVORITES - selectedIds.length} more</Button>}{saveError ? <p className="mt-3 text-xs text-danger" role="alert">{saveError}</p> : null}</aside></div></main></OnboardingScreen>
  )
}


