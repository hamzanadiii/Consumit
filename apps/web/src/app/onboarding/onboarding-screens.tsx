'use client'

import { GUIDE_VERSION, kindLabel, MAX_MEMBER_FAVORITES, type CatalogRef, type CatalogTitleSummary } from '@consumit/contracts'
import { Button, FilterChip, Input, OnboardingHeader, SelectableTitle } from '@consumit/ui'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { browserSearchCatalog } from '@/lib/catalog-browser'
import { saveMemberFavorites } from '@/lib/identity-browser'
import { useExperience } from '../experience/experience-provider'
import { PreferenceEditor } from '../experience/preference-fields'
import { CommunityCards } from '../experience/community-cards'
import { useSession } from '../session/session'
import { readFavoritesDraft, storeFavoritesDraft, clearFavoritesDraft } from './favorites-draft'

const stepHref = (step: string, next: string) => `/onboarding${step ? `/${step}` : ''}?${new URLSearchParams({ next })}`
const keyFor = (ref: CatalogRef) => `${ref.kind}:${ref.id}`
function GuideFrame({ children, current, next, back }: { children: ReactNode; current: number; next: string; back: string }) {
  const router = useRouter()
  const experience = useExperience()
  async function skip() {
    try { await experience.patch({ guideVersion: GUIDE_VERSION, guideStatus: 'dismissed' }) } catch { /* Device dismissal is retained; skipping stays optional. */ }
    router.push(next)
  }
  return <div className="min-h-screen bg-[var(--fs-page)] text-[var(--fs-ink)]"><OnboardingHeader current={current} total={3} skipHref={next} onSkip={() => void skip()} homeHref={next} className="bg-[var(--fs-nav)] text-[var(--fs-ink)]" /><main className="mx-auto w-full max-w-5xl px-5 py-7 sm:px-8 sm:py-10"><Link className="mb-7 inline-flex min-h-11 items-center text-sm text-[var(--fs-secondary)] outline-none hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href={back} onClick={event => { if (current === 1) { event.preventDefault(); void skip() } }}>Back</Link>{children}</main></div>
}
export function ViewingOnboardingScreen({ next = '/' }: { next?: string }) {
  const router = useRouter()
  return <GuideFrame current={1} next={next} back={next}><header className="mb-9 max-w-[68ch]"><h1 className="text-balance font-display text-4xl leading-[1.05] tracking-[-0.025em] sm:text-5xl">Make yourself at home.</h1><p className="mt-5 text-sm leading-7 text-[var(--fs-secondary)] sm:text-base">Pick how you like to watch. We’ll use these choices when you open a title, whenever the source supports them. You can change everything later.</p></header><PreferenceEditor label="Save and continue" onSaved={() => router.push(stepHref('favorites', next))} /></GuideFrame>
}
export function FavoritesOnboardingScreen({ initialTitles, initialFavorites = [], favoritesUnavailable = false, next = '/' }: { initialTitles: readonly CatalogTitleSummary[]; initialFavorites?: readonly CatalogRef[]; favoritesUnavailable?: boolean; next?: string }) {
  const { member, status } = useSession()
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<'all' | 'movie' | 'series' | 'anime'>('all')
  const [results, setResults] = useState<readonly CatalogTitleSummary[]>(initialTitles)
  const [selected, setSelected] = useState<readonly CatalogRef[]>(initialFavorites)
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const requestId = useRef(0)
  const [known, setKnown] = useState(() => new Map(initialTitles.map(title => [keyFor(title), title])))
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (member) queueMicrotask(() => setSelected(readFavoritesDraft(member.id, initialFavorites)))
  }, [member, initialFavorites])
  useEffect(() => {
    const id = ++requestId.current
    if (query.trim().length < 2) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setSearchState('loading')
      void browserSearchCatalog(query.trim(), scope, controller.signal).then(response => {
        if (id !== requestId.current || controller.signal.aborted) return
        setKnown(current => new Map([...current, ...response.items.map(title => [keyFor(title), title] as const)]))
        setResults(response.items); setSearchState('idle')
      }, () => { if (id === requestId.current && !controller.signal.aborted) setSearchState('error') })
    }, 350)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query, scope, attempt])
  function toggle(ref: CatalogRef) {
    const nextSelection = selected.some(value => keyFor(value) === keyFor(ref)) ? selected.filter(value => keyFor(value) !== keyFor(ref)) : selected.length < MAX_MEMBER_FAVORITES ? [...selected, ref] : selected
    setSelected(nextSelection)
    if (member) storeFavoritesDraft(member.id, nextSelection)
  }
  async function save() {
    setSaving(true); setSaveError(null)
    try { await saveMemberFavorites(selected); if (member) clearFavoritesDraft(member.id); router.push(stepHref('ready', next)) }
    catch { setSaveError('Favorites could not be saved. Your selections are kept here. Retry or continue without saving.'); setSaving(false) }
  }
  const visible = query.trim().length >= 2 ? results : initialTitles.filter(title => scope === 'all' || title.kind === scope)
  return <GuideFrame current={2} next={next} back={stepHref('', next)}><header><h1 className="text-balance font-display text-4xl leading-[1.05] tracking-[-0.025em] sm:text-5xl">A few of your favorites.</h1><p className="mt-5 max-w-[65ch] text-sm leading-7 text-[var(--fs-secondary)]">Choose up to four titles you love. This step is optional; your Favorites express your taste on your profile.</p></header>
    {status === 'loading' ? <p role="status">Loading your account…</p> : !member ? <div className="mt-8 border-y border-[var(--fs-line)] py-7"><p className="text-sm leading-6">Create an account to save Favorites, keep your Watchlist, and remember your progress.</p><div className="mt-5 flex flex-wrap gap-5"><Link className="inline-flex min-h-11 items-center font-bold text-[var(--fs-accent)]" href={`/sign-up?${new URLSearchParams({ next })}`}>Create an account</Link><Link className="inline-flex min-h-11 items-center text-sm" href={stepHref('ready', next)}>Continue without an account</Link></div></div> : <>
      {favoritesUnavailable ? <p role="alert" className="mt-6 text-sm">Existing Favorites could not load. <Button variant="ghost" onClick={() => router.refresh()}>Retry loading Favorites</Button></p> : null}
      <div className="mt-8 grid gap-7 lg:grid-cols-[minmax(0,1fr)_16rem]"><section><label className="text-sm font-bold" htmlFor="favorite-title-search">Search movies, series, or anime</label><Input className="mt-2 min-h-11 w-full" id="favorite-title-search" maxLength={100} value={query} onChange={e => setQuery(e.target.value)} type="search" /><div className="mt-4 flex flex-wrap gap-2">{(['all', 'movie', 'series', 'anime'] as const).map(value => <FilterChip key={value} selected={scope === value} onClick={() => setScope(value)}>{value === 'all' ? 'All' : kindLabel(value)}</FilterChip>)}</div>
        {query.trim().length >= 2 && searchState === 'loading' ? <p role="status" className="mt-5 text-sm">Searching the catalog…</p> : null}
        {query.trim().length >= 2 && searchState === 'error' ? <div role="alert" className="mt-5 text-sm">Search could not load. Your choices are kept. <Button variant="ghost" onClick={() => setAttempt(value => value + 1)}>Retry search</Button></div> : null}
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">{visible.map(title => <SelectableTitle artworkSrc={title.posterUrl ?? undefined} checked={selected.some(ref => keyFor(ref) === keyFor(title))} key={keyFor(title)} name="favoriteTitles" meta={[title.year, kindLabel(title.kind)].filter(Boolean).join(' · ')} onChange={() => toggle({ kind: title.kind, id: title.id })} title={title.title} value={keyFor(title)} />)}</div>
        {!visible.length && searchState !== 'loading' ? <p className="mt-6 text-sm text-[var(--fs-secondary)]">No titles to show yet. Search for a favorite, or continue without choosing.</p> : null}
      </section><aside className="self-start border-t border-[var(--fs-line)] pt-5"><h2 className="text-base font-bold">Your Favorites · {selected.length}/4</h2><ul className="mt-4 space-y-2">{selected.map(ref => <li className="flex items-start justify-between gap-2 text-sm" key={keyFor(ref)}><span className="min-w-0 break-words">{known.get(keyFor(ref))?.title ?? `${kindLabel(ref.kind)} ${ref.id}`}</span><Button size="sm" variant="ghost" onClick={() => toggle(ref)} aria-label={`Remove ${known.get(keyFor(ref))?.title ?? keyFor(ref)}`}>Remove</Button></li>)}</ul><Button className="mt-6 w-full" disabled={favoritesUnavailable} loading={saving} onClick={() => void save()} variant="accent">{saveError ? 'Retry saving Favorites' : 'Save and continue'}</Button>{saveError ? <p role="alert" className="mt-3 text-sm">{saveError}</p> : null}<Link className="mt-4 inline-flex min-h-11 items-center text-sm text-[var(--fs-secondary)]" href={stepHref('ready', next)}>Continue without saving</Link></aside></div>
    </>}
  </GuideFrame>
}
export function ReadyOnboardingScreen({ next = '/' }: { next?: string }) {
  const router = useRouter()
  const experience = useExperience()
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  async function finish() {
    setBusy(true); setError(false)
    try { await experience.patch({ guideVersion: GUIDE_VERSION, guideStatus: 'completed' }); if (experience.owner) clearFavoritesDraft(experience.owner); router.push(next) }
    catch { setError(true) } finally { setBusy(false) }
  }
  return <GuideFrame current={3} next={next} back={stepHref('favorites', next)}><h1 className="text-balance font-display text-4xl leading-[1.05] tracking-[-0.025em] sm:text-5xl">You’re ready to watch.</h1><p className="mt-5 max-w-[65ch] text-sm leading-7 text-[var(--fs-secondary)]">Your choices travel into Watch. Change them anytime in Settings or the player.</p><dl className="mt-8 divide-y divide-[var(--fs-line)] border-y border-[var(--fs-line)]">
    {[['Find your next title', 'Use Search to find a movie, series, or anime. Open a title and choose Watch.'], ['Save it for later', 'Members can add titles to Watchlist and pick up from Continue watching.'], ['Keep up with new episodes', 'Save series or anime to Watchlist or Favorites for New this week. Episode notifications are optional and start in Settings.']].map(([title, description]) => <div className="py-5 sm:grid sm:grid-cols-[13rem_1fr] sm:gap-7" key={title}><dt className="text-sm font-bold">{title}</dt><dd className="mt-2 max-w-[65ch] text-sm leading-6 text-[var(--fs-secondary)] sm:mt-0">{description}</dd></div>)}
    </dl><CommunityCards />{!experience.ready ? <p className="mb-4 text-sm" role="status">Loading your account preferences… <Button variant="ghost" onClick={() => router.refresh()}>Retry loading account</Button></p> : null}{error ? <p role="alert" className="mb-4 text-sm">Completion could not sync. Retry, or use Skip to start browsing.</p> : null}<Button disabled={!experience.ready} loading={busy} variant="accent" onClick={() => void finish()}>{error ? 'Retry and start browsing' : 'Start browsing'}</Button></GuideFrame>
}
