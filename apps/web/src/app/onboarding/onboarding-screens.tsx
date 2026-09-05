'use client'

import { ArrowLeft, Search, ShieldCheck } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useId, useMemo, useState, type ReactNode } from 'react'

import {
  AvatarGroup,
  Button,
  FilterChip,
  ImportOption,
  Input,
  MemberSuggestion,
  OnboardingHeader,
  ProgressRail,
  RatingDisplay,
  SelectableTitle,
  buttonVariants,
} from '@consumit/ui'

const artwork = {
  northbound: '/assets/posters/northbound.svg',
  saltwater: '/assets/posters/saltwater.svg',
  thirdSun: '/assets/posters/third-sun.svg',
  violetHours: '/assets/posters/violet-hours.svg',
} as const

const titles = [
  { artworkSrc: artwork.saltwater, id: 'silent-year', kind: 'movie', meta: '2021 · Movie', title: 'The Silent Year' },
  { artworkSrc: artwork.violetHours, id: 'violet-hours', kind: 'series', meta: '2022– · Series', title: 'Violet Hours' },
  { artworkSrc: artwork.northbound, id: 'no-one-leaves-sunday', kind: 'series', meta: '2025 · Limited series', title: 'No One Leaves Sunday' },
  { artworkSrc: artwork.thirdSun, id: 'little-gods', kind: 'movie', meta: '2021 · Movie', title: 'Little Gods' },
  { artworkSrc: artwork.northbound, id: 'last-tenant', kind: 'movie', meta: '2018 · Movie', title: 'The Last Tenant' },
  { artworkSrc: artwork.saltwater, id: 'after-rain', kind: 'movie', meta: '2018 · Movie', title: 'After Rain' },
  { artworkSrc: artwork.violetHours, id: 'ash-in-the-hall', kind: 'movie', meta: '2019 · Movie', title: 'Ash in the Hall' },
  { artworkSrc: artwork.northbound, id: 'paper-kingdom', kind: 'movie', meta: '2023 · Movie', title: 'Paper Kingdom' },
  { artworkSrc: artwork.thirdSun, id: 'static-bloom', kind: 'movie', meta: '2020 · Movie', title: 'Static Bloom' },
] as const

const initialTitleIds = [
  'silent-year',
  'violet-hours',
  'little-gods',
  'ash-in-the-hall',
  'paper-kingdom',
] as const

const members = [
  { detail: 'Noir, moral fog, patient endings', films: '428 films', handle: '@yasmineframes', name: 'Yasmine El Idrissi', overlap: 93 },
  { detail: 'Architecture, memory, long silences', films: '612 films', handle: '@slowcuts', name: 'Omar Benjelloun', overlap: 87 },
  { detail: 'Ghost stories that barely admit it', films: '301 films', handle: '@aftercredits', name: 'Nadia Rahal', overlap: 83 },
  { detail: 'Strange comedies, tender disasters', films: '269 films', handle: '@oddcomedies', name: 'Adil Benomar', overlap: 78 },
] as const

const initialFollowedHandles = members.slice(0, 3).map((member) => member.handle)

function OnboardingScreen({ children, current }: { children: ReactNode; current: number }) {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <OnboardingHeader
        className="lg:min-h-[84px] lg:px-[62px]"
        current={current}
        skipHref="/"
        total={3}
      />
      {children}
    </div>
  )
}

function PosterFan() {
  return (
    <div aria-hidden="true" className="relative mt-14 hidden h-[18rem] w-[28rem] lg:block">
      <Image
        alt=""
        className="absolute top-1 left-3 h-[16.5rem] w-[11.25rem] -rotate-[8deg] rounded-card border border-ink/15 object-cover shadow-2xl shadow-canvas/40"
        height={264}
        src={artwork.northbound}
        width={180}
      />
      <Image
        alt=""
        className="absolute top-4 left-[8.8rem] h-[16.5rem] w-[11.25rem] rotate-[5deg] rounded-card border border-ink/15 object-cover shadow-2xl shadow-canvas/45"
        height={264}
        src={artwork.violetHours}
        width={180}
      />
      <Image
        alt=""
        className="absolute top-8 right-3 h-60 w-[9.75rem] rotate-[10deg] rounded-card border border-ink/15 object-cover shadow-2xl shadow-canvas/50"
        height={240}
        src={artwork.saltwater}
        width={156}
      />
    </div>
  )
}

function SearchBox({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string
  onChange: (value: string) => void
  placeholder: string
  value: string
}) {
  return (
    <form className="relative min-w-0" onSubmit={(event) => event.preventDefault()} role="search">
      <label className="sr-only" htmlFor={label}>{placeholder}</label>
      <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" />
      <Input
        className="h-12 pl-12"
        id={label}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={placeholder}
        type="search"
        value={value}
      />
    </form>
  )
}

export function HistoryOnboardingScreen() {
  const fileInputId = useId()
  const [choice, setChoice] = useState<'fresh' | 'import'>('import')
  const [fileName, setFileName] = useState<string>()

  return (
    <OnboardingScreen current={1}>
      <main className="px-5 py-7 sm:px-8 sm:py-10 lg:px-[62px] lg:py-11" data-consumit-onboarding-history>
        <section className="relative overflow-hidden rounded-card border border-border bg-[linear-gradient(135deg,#17131a_0%,#37222e_55%,#15151b_100%)] px-5 py-8 sm:p-10 lg:min-h-[48.875rem] lg:p-[50px]">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_66%,rgb(255_93_56_/_0.1),transparent_28rem)]" />
          <div className="relative grid gap-10 lg:grid-cols-[minmax(0,29.5rem)_minmax(0,1fr)] lg:gap-6">
            <div className="flex min-w-0 flex-col">
              <h1 className="max-w-[14ch] text-balance font-display text-4xl leading-[0.98] tracking-[-0.025em] text-ink sm:text-5xl lg:text-[3.25rem]">
                Your history can come with you.
              </h1>
              <p className="mt-7 max-w-[44ch] text-sm leading-6 text-muted">
                Import what you watched, rated, liked, and saved. Or start clean. Neither choice locks you in.
              </p>
              <PosterFan />
              <p className="mt-auto hidden text-[0.6875rem] leading-5 text-faint lg:block">
                You can skip every onboarding step and change these choices later.
              </p>
            </div>

            <div className="min-w-0">
              <div className="space-y-4">
                <ImportOption
                  action={(
                    <label className={`${buttonVariants({ size: 'lg', variant: 'primary' })} max-w-full cursor-pointer uppercase tracking-[0.04em] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-orange`} htmlFor={fileInputId}>
                      <span className="max-w-44 truncate">{fileName ?? 'Choose export file'}</span>
                      <input
                        accept=".csv,.zip,text/csv,application/zip"
                        className="sr-only"
                        id={fileInputId}
                        onChange={(event) => {
                          setChoice('import')
                          setFileName(event.currentTarget.files?.[0]?.name)
                        }}
                        type="file"
                      />
                    </label>
                  )}
                  benefits={[
                    'Watched films and diary dates',
                    'Ratings, likes, and favorites',
                    'Watchlist and personal lists',
                  ]}
                  className="relative lg:min-h-[15.625rem] lg:px-8 lg:py-8 lg:[&>div>div:last-child]:absolute lg:[&>div>div:last-child]:right-8 lg:[&>div>div:last-child]:bottom-8 [&_ul]:grid-cols-1 [&_ul]:border-t-0 [&_ul]:pt-0"
                  description="Upload your Letterboxd export. Takes about 30 seconds."
                  selected={choice === 'import'}
                  title="Import from Letterboxd"
                />

                <ImportOption
                  action={(
                    <Button
                      className="uppercase tracking-[0.04em]"
                      onClick={() => setChoice('fresh')}
                      size="lg"
                      variant={choice === 'fresh' ? 'primary' : 'secondary'}
                    >
                      Start clean
                    </Button>
                  )}
                  className="lg:min-h-[10.5rem] lg:px-8 lg:py-8"
                  description="Pick a few favorites in the next step. You can import later from Settings."
                  icon="minus"
                  selected={choice === 'fresh'}
                  title="Start fresh"
                />
              </div>

              <aside className="mt-5 flex gap-4 rounded-card border border-border bg-canvas/55 p-5" id="import-details">
                <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-lilac" />
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-ink">Your import is yours.</h2>
                  <p className="mt-2 max-w-[60ch] text-xs leading-5 text-muted">
                    We use it to build your library and taste. Delete imported data anytime without deleting your account.
                  </p>
                </div>
              </aside>

              <div className="mt-8 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between lg:mt-16">
                <p className="text-[0.6875rem] leading-5 text-faint lg:hidden">
                  You can skip every onboarding step and change these choices later.
                </p>
                <Link
                  className={`${buttonVariants({ size: 'lg', variant: 'accent' })} min-w-48 uppercase tracking-[0.04em] sm:ml-auto`}
                  href="/onboarding/favorites"
                >
                  Continue
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </OnboardingScreen>
  )
}

export function FavoritesOnboardingScreen() {
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<'all' | 'movie' | 'series'>('all')
  const [selectedIds, setSelectedIds] = useState<string[]>([...initialTitleIds])
  const [limitMessage, setLimitMessage] = useState('')

  const visibleTitles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return titles.filter((title) => {
      const matchesScope = scope === 'all' || title.kind === scope
      const matchesQuery = normalizedQuery.length === 0 || title.title.toLowerCase().includes(normalizedQuery)
      return matchesScope && matchesQuery
    })
  }, [query, scope])

  const selectedTitles = titles.filter((title) => selectedIds.includes(title.id))
  const isReady = selectedIds.length === 5

  function toggleTitle(id: string) {
    setSelectedIds((current) => {
      if (current.includes(id)) {
        setLimitMessage('Choose one more title to keep your starting taste complete.')
        return current.filter((titleId) => titleId !== id)
      }
      if (current.length >= 5) {
        setLimitMessage('Remove one selected title before choosing another.')
        return current
      }
      setLimitMessage('Your starting taste is ready.')
      return [...current, id]
    })
  }

  return (
    <OnboardingScreen current={2}>
      <main className="px-5 py-9 sm:px-8 lg:px-[62px] lg:pt-[72px] lg:pb-9" data-consumit-onboarding-favorites>
        <header>
          <h1 className="max-w-[24ch] text-balance font-display text-4xl leading-none tracking-[-0.025em] text-ink sm:text-5xl">
            Pick five that feel like you.
          </h1>
          <p className="mt-4 max-w-[68ch] text-sm leading-6 text-muted">
            Not the “best” titles. The ones you would defend at an unreasonable hour.
          </p>
        </header>

        <div className="mt-8 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_21.9375rem] lg:gap-20">
          <section className="min-w-0" aria-label="Choose favorite titles">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <SearchBox label="favorite-title-search" onChange={setQuery} placeholder="Search a movie or series" value={query} />
              <div aria-label="Title type" className="flex gap-2" role="group">
                <FilterChip className="h-12 flex-1 px-4 sm:flex-none" onClick={() => setScope('all')} selected={scope === 'all'}>All</FilterChip>
                <FilterChip className="h-12 flex-1 px-4 sm:flex-none" onClick={() => setScope('movie')} selected={scope === 'movie'}>Movies</FilterChip>
                <FilterChip className="h-12 flex-1 px-4 sm:flex-none" onClick={() => setScope('series')} selected={scope === 'series'}>Series</FilterChip>
              </div>
            </div>

            {visibleTitles.length > 0 ? (
              <div className="mt-8 grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 xl:grid-cols-5">
                {visibleTitles.map((title) => (
                  <SelectableTitle
                    artworkSrc={title.artworkSrc}
                    checked={selectedIds.includes(title.id)}
                    key={title.id}
                    meta={title.meta}
                    name="favoriteTitles"
                    onChange={() => toggleTitle(title.id)}
                    title={title.title}
                    value={title.id}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-8 border-y border-border py-12 text-center">
                <h2 className="font-display text-2xl text-ink">No title matches that search.</h2>
                <p className="mt-3 text-sm text-muted">Try another name or return to all titles.</p>
                <Button className="mt-5" onClick={() => { setQuery(''); setScope('all') }} variant="secondary">Show all titles</Button>
              </div>
            )}
          </section>

          <aside className="self-start rounded-card border border-border bg-surface p-6 lg:sticky lg:top-7" aria-label="Your starting taste">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-sm font-bold text-ink">Your starting taste</h2>
              <p aria-live="polite" className="text-xs font-bold uppercase tracking-[0.05em] text-orange">{selectedIds.length} selected</p>
            </div>
            <ProgressRail className="mt-6" label={`${selectedIds.length} of 5 favorite titles selected`} max={5} value={selectedIds.length} />
            <p aria-live="polite" className="mt-3 min-h-5 text-[0.6875rem] leading-5 text-muted">
              {limitMessage || 'Choose exactly five titles. You can change them later.'}
            </p>

            <div className="mt-8">
              <h3 className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-muted">This will shape</h3>
              <ul className="mt-5 space-y-4">
                {['Your first home recommendations', 'Taste overlap with other members', 'Lists and reviews surfaced to you'].map((benefit) => (
                  <li className="flex items-center gap-3 text-xs leading-5 text-copy" key={benefit}>
                    <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-lilac" />
                    {benefit}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-8 border-t border-border pt-7">
              <h3 className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-muted">Selected</h3>
              {selectedTitles.length > 0 ? (
                <ol className="mt-5 space-y-3 text-xs text-copy">
                  {selectedTitles.map((title) => <li key={title.id}>{title.title}</li>)}
                </ol>
              ) : (
                <p className="mt-4 text-xs leading-5 text-muted">Your five choices will appear here.</p>
              )}
            </div>

            <div className="mt-10">
              {isReady ? (
                <Link className={`${buttonVariants({ size: 'lg', variant: 'accent' })} w-full uppercase tracking-[0.04em]`} href="/onboarding/circle">
                  Continue
                </Link>
              ) : (
                <Button className="w-full uppercase tracking-[0.04em]" disabled size="lg" variant="accent">
                  Choose {5 - selectedIds.length} more
                </Button>
              )}
              <p className="mt-4 text-center text-[0.6875rem] text-faint">You can change these anytime.</p>
            </div>
          </aside>
        </div>
      </main>
    </OnboardingScreen>
  )
}

export function CircleOnboardingScreen() {
  const [query, setQuery] = useState('')
  const [followedHandles, setFollowedHandles] = useState<string[]>([...initialFollowedHandles])

  const visibleMembers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return members
    return members.filter((member) => `${member.name} ${member.handle}`.toLowerCase().includes(normalizedQuery))
  }, [query])

  const followedMembers = members.filter((member) => followedHandles.includes(member.handle))
  const previewMember = followedMembers[0]

  function setFollowing(handle: string, following: boolean) {
    setFollowedHandles((current) => (
      following
        ? Array.from(new Set([...current, handle]))
        : current.filter((memberHandle) => memberHandle !== handle)
    ))
  }

  return (
    <OnboardingScreen current={3}>
      <main className="px-5 py-9 sm:px-8 lg:px-[62px] lg:pt-[72px] lg:pb-9" data-consumit-onboarding-circle>
        <header>
          <h1 className="max-w-[24ch] text-balance font-display text-4xl leading-none tracking-[-0.025em] text-ink sm:text-5xl lg:max-w-none">
            Start with people, not popularity.
          </h1>
          <p className="mt-4 max-w-[68ch] text-sm leading-6 text-muted">
            Follow a few members whose taste can genuinely change what you watch.
          </p>
        </header>

        <div className="mt-8 grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_26.6875rem] lg:gap-7">
          <section className="min-w-0" aria-label="Suggested members">
            <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,38.75rem)_1fr]">
              <SearchBox label="member-search" onChange={setQuery} placeholder="Search people by name or username" value={query} />
              <p className="text-xs leading-5 text-muted sm:text-right lg:whitespace-nowrap">Suggested from your selected favorites</p>
            </div>

            {visibleMembers.length > 0 ? (
              <div className="mt-8 space-y-4">
                {visibleMembers.map((member) => (
                  <MemberSuggestion
                    className="lg:min-h-28 lg:px-5"
                    detail={member.detail}
                    films={member.films}
                    following={followedHandles.includes(member.handle)}
                    handle={member.handle}
                    key={member.handle}
                    name={member.name}
                    onFollowingChange={(following) => setFollowing(member.handle, following)}
                    overlap={member.overlap}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-8 border-y border-border py-12 text-center">
                <h2 className="font-display text-2xl text-ink">No member matches that search.</h2>
                <p className="mt-3 text-sm text-muted">Try a name, handle, or return to every suggestion.</p>
                <Button className="mt-5" onClick={() => setQuery('')} variant="secondary">Show all members</Button>
              </div>
            )}
          </section>

          <aside className="self-start rounded-card border border-border bg-surface p-7 lg:sticky lg:top-7" aria-label="Your starting circle">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-sm font-bold text-ink">Your starting circle</h2>
              <p aria-live="polite" className="text-xs font-bold uppercase tracking-[0.05em] text-orange">{followedHandles.length} following</p>
            </div>

            {followedMembers.length > 0 ? (
              <div className="mt-7 flex items-center gap-5">
                <AvatarGroup items={followedMembers} label={followedMembers.map((member) => member.name).join(', ')} size="md" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-ink">Your home feed is ready.</p>
                  <p className="mt-1 text-[0.6875rem] leading-5 text-muted">Reviews, lists, and trusted signals</p>
                </div>
              </div>
            ) : (
              <p className="mt-6 text-xs leading-5 text-muted">Follow someone to seed your first social recommendations—or enter without a Circle.</p>
            )}

            <div className="mt-7 border-t border-border pt-7">
              <h3 className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-muted">First feed preview</h3>
              {previewMember ? (
                <article className="mt-5 rounded-control border border-border bg-surface-raised p-4">
                  <div className="flex items-start gap-3">
                    <AvatarGroup items={[previewMember]} label={previewMember.name} size="sm" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold leading-5 text-ink">{previewMember.name.split(' ')[0]} reviewed The Silent Year</p>
                      <RatingDisplay className="mt-1" value={4.5} />
                    </div>
                  </div>
                  <blockquote className="mt-5 font-display text-xl leading-7 text-copy">“Quiet without feeling empty.”</blockquote>
                  <a className="mt-4 inline-flex min-h-11 items-center text-[0.6875rem] text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-orange" href="#first-feed-preview">
                    Open title · 54 likes
                  </a>
                </article>
              ) : null}
            </div>

            <p className="mt-7 text-xs leading-5 text-muted">
              You can unfollow anyone later. Following affects discovery—not private messages or playback.
            </p>
            <Link className={`${buttonVariants({ size: 'lg', variant: 'accent' })} mt-6 w-full uppercase tracking-[0.04em]`} href="/">
              Enter Consumit
            </Link>
          </aside>
        </div>

        <footer className="mt-10 flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between lg:mt-14">
          <p className="max-w-[70ch] text-[0.6875rem] leading-5 text-faint">
            No pressure. Consumit will keep learning from what you actually watch, save, and rate.
          </p>
          <Link className="inline-flex min-h-11 items-center gap-2 rounded-control text-xs text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-orange" href="/onboarding/favorites">
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to favorites
          </Link>
        </footer>
      </main>
    </OnboardingScreen>
  )
}
