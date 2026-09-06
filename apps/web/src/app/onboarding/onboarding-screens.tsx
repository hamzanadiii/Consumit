'use client'

import { type CatalogTitleSummary } from '@consumit/contracts'
import { ArrowLeft, Search, ShieldCheck } from 'lucide-react'
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'

import { AvatarGroup, Button, FilterChip, ImportOption, Input, MemberSuggestion, OnboardingHeader, ProgressRail, RatingDisplay, SelectableTitle, buttonVariants } from '@consumit/ui'

import { browserSearchCatalog } from '@/lib/catalog-browser'

const members = [
  { detail: 'Noir, moral fog, patient endings', films: '428 titles', handle: '@yasmineframes', name: 'Yasmine El Idrissi', overlap: 93 },
  { detail: 'Architecture, memory, long silences', films: '612 titles', handle: '@slowcuts', name: 'Omar Benjelloun', overlap: 87 },
  { detail: 'Ghost stories that barely admit it', films: '301 titles', handle: '@aftercredits', name: 'Nadia Rahal', overlap: 83 },
  { detail: 'Strange comedies, tender disasters', films: '269 titles', handle: '@oddcomedies', name: 'Adil Benomar', overlap: 78 },
] as const

function OnboardingScreen({ children, current }: { children: ReactNode; current: number }) {
  return <div className="min-h-screen bg-canvas text-ink"><OnboardingHeader className="lg:min-h-[84px] lg:px-[62px]" current={current} skipHref="/" total={3} />{children}</div>
}

function SearchBox({ label, onChange, placeholder, value }: { label: string; onChange: (value: string) => void; placeholder: string; value: string }) {
  return <form className="relative min-w-0" onSubmit={(event) => event.preventDefault()} role="search"><label className="sr-only" htmlFor={label}>{placeholder}</label><Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" /><Input className="h-12 pl-12" id={label} maxLength={100} onChange={(event) => onChange(event.currentTarget.value)} placeholder={placeholder} type="search" value={value} /></form>
}

function PosterFan({ titles }: { titles: readonly CatalogTitleSummary[] }) {
  return <div aria-hidden="true" className="relative mt-14 hidden h-[18rem] w-[28rem] lg:block">{titles.slice(0, 3).map((title, index) => title.posterUrl ? <Image alt="" className="absolute top-1 aspect-[2/3] h-[16.5rem] w-auto rounded-card border border-ink/15 object-cover shadow-2xl shadow-canvas/40" height={600} key={`${title.kind}:${title.id}`} src={title.posterUrl} style={{ left: `${0.75 + index * 8.1}rem`, transform: `rotate(${-8 + index * 7}deg)`, zIndex: index }} width={400} /> : null)}</div>
}

export function HistoryOnboardingScreen({ titles }: { titles: readonly CatalogTitleSummary[] }) {
  const fileInputId = useId()
  const [choice, setChoice] = useState<'fresh' | 'import'>('import')
  const [fileName, setFileName] = useState<string>()
  return (
    <OnboardingScreen current={1}><main className="px-5 py-7 sm:px-8 sm:py-10 lg:px-[62px] lg:py-11" data-consumit-onboarding-history><section className="relative overflow-hidden rounded-card border border-border bg-[linear-gradient(135deg,#17131a_0%,#37222e_55%,#15151b_100%)] px-5 py-8 sm:p-10 lg:min-h-[48rem] lg:p-[50px]"><div className="relative grid gap-10 lg:grid-cols-[minmax(0,29.5rem)_minmax(0,1fr)] lg:gap-6"><div className="flex flex-col"><h1 className="max-w-[14ch] text-balance font-display text-4xl leading-[0.98] tracking-[-0.025em] text-ink sm:text-5xl lg:text-[3.25rem]">Your history can come with you.</h1><p className="mt-7 max-w-[44ch] text-sm leading-6 text-muted">Import what you watched, rated, liked, and saved. Or start clean. Neither choice locks you in.</p><PosterFan titles={titles} /></div><div><div className="space-y-4"><ImportOption action={<label className={`${buttonVariants({ size: 'lg' })} max-w-full cursor-pointer uppercase tracking-[0.04em]`} htmlFor={fileInputId}><span className="max-w-44 truncate">{fileName ?? 'Choose export file'}</span><input accept=".csv,.zip,text/csv,application/zip" className="sr-only" id={fileInputId} onChange={(event) => { setChoice('import'); setFileName(event.currentTarget.files?.[0]?.name) }} type="file" /></label>} benefits={['Watched titles and diary dates', 'Ratings, likes, and favorites', 'Watchlist and personal lists']} description="Upload your Letterboxd export. Takes about 30 seconds." selected={choice === 'import'} title="Import from Letterboxd" /><ImportOption action={<Button onClick={() => setChoice('fresh')} size="lg" variant={choice === 'fresh' ? 'primary' : 'secondary'}>Start clean</Button>} description="Pick a few favorites next. You can import later from Settings." icon="minus" selected={choice === 'fresh'} title="Start fresh" /></div><aside className="mt-5 flex gap-4 rounded-card border border-border bg-canvas/55 p-5"><ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-lilac" /><div><h2 className="text-sm font-bold text-ink">Your import is yours.</h2><p className="mt-2 text-xs leading-5 text-muted">We use it to build your library and taste. Delete imported data without deleting your account.</p></div></aside><a className={`${buttonVariants({ size: 'lg', variant: 'accent' })} mt-10 min-w-48`} href="/onboarding/favorites">Continue</a></div></div></section></main></OnboardingScreen>
  )
}

function favoriteKey(title: CatalogTitleSummary) { return `${title.kind}:${title.id}` }

export function FavoritesOnboardingScreen({ apiBase, initialTitles }: { apiBase: string; initialTitles: readonly CatalogTitleSummary[] }) {
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<'all' | 'movie' | 'series'>('all')
  const [results, setResults] = useState<readonly CatalogTitleSummary[]>(initialTitles)
  const [selectedIds, setSelectedIds] = useState<string[]>(initialTitles.slice(0, 5).map(favoriteKey))
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'error'>('idle')

  useEffect(() => {
    const normalized = query.trim().slice(0, 100)
    if (normalized.length < 2) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setSearchState('loading')
      void browserSearchCatalog(apiBase, normalized, scope, controller.signal)
        .then((response) => { setResults(response.items); setSearchState('idle') })
        .catch((error) => { if (!(error instanceof DOMException && error.name === 'AbortError')) setSearchState('error') })
    }, 350)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [apiBase, initialTitles, query, scope])

  const searchActive = query.trim().length >= 2
  const source = searchActive ? results : initialTitles
  const visible = useMemo(() => (searchActive ? source : source.filter((title) => scope === 'all' || title.kind === scope)), [scope, searchActive, source])
  const visibleSearchState = searchActive ? searchState : 'idle'
  const known = new Map([...initialTitles, ...results].map((title) => [favoriteKey(title), title]))
  const selected = selectedIds.map((id) => known.get(id)).filter((title): title is CatalogTitleSummary => Boolean(title))
  function toggle(id: string) { setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : current.length < 5 ? [...current, id] : current) }

  return (
    <OnboardingScreen current={2}><main className="px-5 py-9 sm:px-8 lg:px-[62px] lg:pt-[72px] lg:pb-9" data-consumit-onboarding-favorites><header><h1 className="max-w-[24ch] text-balance font-display text-4xl leading-none tracking-[-0.025em] text-ink sm:text-5xl">Pick five that feel like you.</h1><p className="mt-4 max-w-[68ch] text-sm leading-6 text-muted">Not the “best” titles. The real movies and series you would defend at an unreasonable hour.</p></header><div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_21.9375rem] lg:gap-20"><section><div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><SearchBox label="favorite-title-search" onChange={setQuery} placeholder="Search a movie or series" value={query} /><div className="flex gap-2">{([['all', 'All'], ['movie', 'Movies'], ['series', 'Series']] as const).map(([value, label]) => <FilterChip className="h-12 flex-1 px-4 sm:flex-none" key={value} onClick={() => setScope(value)} selected={scope === value}>{label}</FilterChip>)}</div></div>{query.trim().length === 1 ? <p className="mt-3 text-xs text-orange">Type at least two characters to search.</p> : null}{visibleSearchState === 'loading' ? <p className="mt-5 text-xs text-muted" role="status">Searching the catalog…</p> : null}{visibleSearchState === 'error' ? <p className="mt-5 text-xs text-orange" role="alert">Search could not load. Your current favorites are preserved.</p> : null}<div className="mt-8 grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 xl:grid-cols-5">{visible.map((title) => <SelectableTitle artworkSrc={title.posterUrl ?? undefined} checked={selectedIds.includes(favoriteKey(title))} key={favoriteKey(title)} meta={[title.year, title.kind === 'movie' ? 'Movie' : 'Series'].filter(Boolean).join(' · ')} name="favoriteTitles" onChange={() => toggle(favoriteKey(title))} title={title.title} value={favoriteKey(title)} />)}</div>{visible.length === 0 && visibleSearchState !== 'loading' ? <p className="mt-10 text-sm text-muted">No real catalog title matched that search.</p> : null}</section><aside className="self-start rounded-card border border-border bg-surface p-6 lg:sticky lg:top-7"><div className="flex items-baseline justify-between gap-4"><h2 className="text-sm font-bold text-ink">Your starting taste</h2><p className="text-xs font-bold text-orange">{selectedIds.length} selected</p></div><ProgressRail className="mt-6" label={`${selectedIds.length} of 5 favorite titles selected`} max={5} value={selectedIds.length} /><ol className="mt-7 space-y-3 text-xs text-copy">{selected.map((title) => <li key={favoriteKey(title)}>{title.title}</li>)}</ol>{selectedIds.length === 5 ? <Link className={`${buttonVariants({ size: 'lg', variant: 'accent' })} mt-8 w-full`} href="/onboarding/circle">Continue</Link> : <Button className="mt-8 w-full" disabled size="lg" variant="accent">Choose {5 - selectedIds.length} more</Button>}</aside></div></main></OnboardingScreen>
  )
}

export function CircleOnboardingScreen({ previewTitle }: { previewTitle: CatalogTitleSummary }) {
  const [query, setQuery] = useState('')
  const [followed, setFollowed] = useState<string[]>(members.slice(0, 3).map((member) => member.handle))
  const visible = members.filter((member) => `${member.name} ${member.handle}`.toLowerCase().includes(query.trim().toLowerCase()))
  const followedMembers = members.filter((member) => followed.includes(member.handle))
  return (
    <OnboardingScreen current={3}><main className="px-5 py-9 sm:px-8 lg:px-[62px] lg:pt-[72px] lg:pb-9" data-consumit-onboarding-circle><header><h1 className="text-balance font-display text-4xl leading-none tracking-[-0.025em] text-ink sm:text-5xl">Start with people, not popularity.</h1><p className="mt-4 max-w-[68ch] text-sm leading-6 text-muted">Follow members whose taste can genuinely change what you watch.</p></header><div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_26.6875rem]"><section><SearchBox label="member-search" onChange={setQuery} placeholder="Search people by name or username" value={query} /><div className="mt-8 space-y-4">{visible.map((member) => <MemberSuggestion detail={member.detail} films={member.films} following={followed.includes(member.handle)} handle={member.handle} key={member.handle} name={member.name} onFollowingChange={(following) => setFollowed((current) => following ? Array.from(new Set([...current, member.handle])) : current.filter((value) => value !== member.handle))} overlap={member.overlap} />)}</div></section><aside className="self-start rounded-card border border-border bg-surface p-7 lg:sticky lg:top-7"><h2 className="text-sm font-bold text-ink">Your starting circle</h2><div className="mt-7 flex items-center gap-5"><AvatarGroup items={followedMembers} label={followedMembers.map((member) => member.name).join(', ')} size="md" /><p className="text-xs text-muted">{followed.length} following</p></div><article className="mt-7 rounded-control border border-border bg-surface-raised p-4"><p className="text-xs font-bold text-ink">Yasmine reviewed {previewTitle.title}</p><RatingDisplay className="mt-2" value={4.5} /><blockquote className="mt-5 font-display text-xl leading-7 text-copy">“Quiet without feeling empty.”</blockquote></article><p className="mt-7 text-xs leading-5 text-muted">Following affects discovery—not private messages or playback.</p><Link className={`${buttonVariants({ size: 'lg', variant: 'accent' })} mt-6 w-full`} href="/">Enter Consumit</Link></aside></div><footer className="mt-10 border-t border-border pt-5"><Link className="inline-flex min-h-11 items-center gap-2 text-xs text-muted hover:text-ink" href="/onboarding/favorites"><ArrowLeft aria-hidden="true" className="size-4" /> Back to favorites</Link></footer></main></OnboardingScreen>
  )
}
