'use client'

import { type CatalogTitleSummary } from '@consumit/contracts'
import { ArrowLeft, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

import { Button, FilterChip, Input, OnboardingHeader, ProgressRail, SelectableTitle, buttonVariants } from '@consumit/ui'

import { browserSearchCatalog } from '@/lib/catalog-browser'
import { saveMemberFavorites } from '@/lib/identity-browser'
import { LetterboxdImportFlow } from '../imports/letterboxd-import-flow'

function OnboardingScreen({ children, current }: { children: ReactNode; current: number }) {
  return <div className="min-h-screen bg-canvas text-ink"><OnboardingHeader className="lg:min-h-[68px] lg:px-[50px]" current={current} skipHref="/" total={3} />{children}</div>
}

function SearchBox({ label, onChange, placeholder, value }: { label: string; onChange: (value: string) => void; placeholder: string; value: string }) {
  return <form className="relative min-w-0" onSubmit={(event) => event.preventDefault()} role="search"><label className="sr-only" htmlFor={label}>{placeholder}</label><Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" /><Input className="h-12 pl-12" id={label} maxLength={100} onChange={(event) => onChange(event.currentTarget.value)} placeholder={placeholder} type="search" value={value} /></form>
}

function PosterFan({ titles }: { titles: readonly CatalogTitleSummary[] }) {
  return <div aria-hidden="true" className="relative mt-14 hidden h-[18rem] w-[28rem] lg:block">{titles.slice(0, 3).map((title, index) => title.posterUrl ? <Image alt="" className="absolute top-1 aspect-[2/3] h-[16.5rem] w-auto rounded-card border border-ink/15 object-cover shadow-2xl shadow-canvas/40" height={600} key={`${title.kind}:${title.id}`} src={title.posterUrl} style={{ left: `${0.75 + index * 8.1}rem`, transform: `rotate(${-8 + index * 7}deg)`, zIndex: index }} width={400} /> : null)}</div>
}

export function HistoryOnboardingScreen({ titles }: { titles: readonly CatalogTitleSummary[] }) {
  return (
    <OnboardingScreen current={1}><main className="px-5 py-7 sm:px-8 sm:py-10 lg:px-[50px] lg:py-11" data-consumit-onboarding-history><section className="relative overflow-hidden rounded-card border border-border bg-[linear-gradient(135deg,#17131a_0%,#37222e_55%,#15151b_100%)] px-5 py-8 sm:p-10 lg:min-h-[48rem] lg:p-[50px]"><div className="relative grid gap-10 lg:grid-cols-[minmax(0,29.5rem)_minmax(0,1fr)] lg:gap-10"><div className="flex flex-col"><h1 className="max-w-[14ch] text-balance font-display text-4xl leading-[0.98] tracking-[-0.025em] text-ink sm:text-5xl lg:text-[3.25rem]">Your history can come with you.</h1><p className="mt-7 max-w-[44ch] text-sm leading-6 text-muted">Upload your Letterboxd export, review uncertain matches, then confirm. Likes and deleted content are intentionally skipped.</p><PosterFan titles={titles} /></div><div><LetterboxdImportFlow completeHref="/onboarding/favorites" /><Link className="mt-6 inline-flex min-h-11 items-center text-xs font-bold text-muted hover:text-ink" href="/onboarding/favorites">Start fresh instead</Link></div></div></section></main></OnboardingScreen>
  )
}

function favoriteKey(title: CatalogTitleSummary) { return `${title.kind}:${title.id}` }

export function FavoritesOnboardingScreen({ initialTitles }: { initialTitles: readonly CatalogTitleSummary[] }) {
  const router = useRouter()
  const requestIdRef = useRef(0)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<'all' | 'movie' | 'series'>('all')
  const [results, setResults] = useState<readonly CatalogTitleSummary[]>(initialTitles)
  const [selectedIds, setSelectedIds] = useState<string[]>(initialTitles.slice(0, 6).map(favoriteKey))
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
  function toggle(id: string) { setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : current.length < 6 ? [...current, id] : current) }
  async function saveFavorites() {
    setSaving(true); setSaveError(null)
    try {
      await saveMemberFavorites(selected.map(({ id, kind }) => ({ id, kind })))
      router.push('/onboarding/circle')
      router.refresh()
    } catch { setSaveError('Your Favorites could not be saved. Please retry.'); setSaving(false) }
  }

  return (
    <OnboardingScreen current={2}><main className="px-5 py-9 sm:px-8 lg:px-[50px] lg:pt-[58px] lg:pb-9" data-consumit-onboarding-favorites><header><h1 className="max-w-[24ch] text-balance font-display text-4xl leading-none tracking-[-0.025em] text-ink sm:text-5xl">Pick six that feel like you.</h1><p className="mt-4 max-w-[68ch] text-sm leading-6 text-muted">Not the “best” titles. The real movies and series you would defend at an unreasonable hour.</p></header><div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_21.9375rem] lg:gap-20"><section><div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><SearchBox label="favorite-title-search" onChange={setQuery} placeholder="Search a movie or series" value={query} /><div className="flex gap-2">{([['all', 'All'], ['movie', 'Movies'], ['series', 'Series']] as const).map(([value, label]) => <FilterChip className="h-12 flex-1 px-4 sm:flex-none" key={value} onClick={() => setScope(value)} selected={scope === value}>{label}</FilterChip>)}</div></div>{query.trim().length === 1 ? <p className="mt-3 text-xs text-orange">Type at least two characters to search.</p> : null}{visibleSearchState === 'loading' ? <p className="mt-5 text-xs text-muted" role="status">Searching the catalog…</p> : null}{visibleSearchState === 'error' ? <p className="mt-5 text-xs text-orange" role="alert">Search could not load. Your current favorites are preserved.</p> : null}<div className="mt-8 grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 xl:grid-cols-5">{visible.map((title) => <SelectableTitle artworkSrc={title.posterUrl ?? undefined} checked={selectedIds.includes(favoriteKey(title))} key={favoriteKey(title)} meta={[title.year, title.kind === 'movie' ? 'Movie' : 'Series'].filter(Boolean).join(' · ')} name="favoriteTitles" onChange={() => toggle(favoriteKey(title))} title={title.title} value={favoriteKey(title)} />)}</div>{visible.length === 0 && visibleSearchState !== 'loading' ? <p className="mt-10 text-sm text-muted">No real catalog title matched that search.</p> : null}</section><aside className="self-start rounded-card border border-border bg-surface p-6 lg:sticky lg:top-7"><div className="flex items-baseline justify-between gap-4"><h2 className="text-sm font-bold text-ink">Your four</h2><p className="text-xs font-bold text-orange">{selectedIds.length} selected</p></div><ProgressRail className="mt-6" label={`${selectedIds.length} of 4 favorite titles selected`} max={4} value={selectedIds.length} /><ol className="mt-7 space-y-3 text-xs text-copy">{selected.map((title) => <li key={favoriteKey(title)}>{title.title}</li>)}</ol>{selectedIds.length === 4 ? <Button className="mt-8 w-full" loading={saving} onClick={() => void saveFavorites()} variant="accent">Save and continue</Button> : <Button className="mt-8 w-full" disabled size="lg" variant="accent">Choose {4 - selectedIds.length} more</Button>}{saveError ? <p className="mt-3 text-xs text-danger" role="alert">{saveError}</p> : null}</aside></div></main></OnboardingScreen>
  )
}

export function CircleOnboardingScreen() {
  return (
    <OnboardingScreen current={3}><main className="px-5 py-9 sm:px-8 lg:px-[50px] lg:pt-[58px] lg:pb-9" data-consumit-onboarding-circle><header><h1 className="text-balance font-display text-4xl leading-none tracking-[-0.025em] text-ink sm:text-5xl">Your library starts with you.</h1><p className="mt-4 max-w-[68ch] text-sm leading-6 text-muted">Following and Circle activity will appear when the social slice is ready. We will not invent members or activity in the meantime.</p></header><section className="mt-10 max-w-2xl rounded-card border border-border bg-surface p-8"><h2 className="font-display text-3xl text-ink">No Circle activity yet</h2><p className="mt-4 text-sm leading-6 text-muted">Finish setup and begin building your real profile from your own watches, reviews, Favorites, and lists.</p><Link className={`${buttonVariants({ size: 'lg', variant: 'accent' })} mt-8`} href="/">Enter Consumit</Link></section><footer className="mt-10 border-t border-border pt-5"><Link className="inline-flex min-h-11 items-center gap-2 text-xs text-muted hover:text-ink" href="/onboarding/favorites"><ArrowLeft aria-hidden="true" className="size-4" /> Back to favorites</Link></footer></main></OnboardingScreen>
  )
}
