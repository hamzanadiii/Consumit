'use client'

import { ArrowRight, Bell, Check, Play, Plus } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState, type ReactNode } from 'react'

import {
  Badge,
  Button,
  CastCard,
  EpisodeRow,
  Footer,
  GlobalNavigation,
  MemberPulse,
  PosterCard,
  ProgressRail,
  SeasonSelector,
  SectionHeading,
  SocialProof,
  Tabs,
  TitleMasthead,
  TrustedReaction,
  buttonVariants,
} from '@consumit/ui'

const artwork = {
  backdrop: '/assets/cinematic-backdrop.svg',
  northbound: '/assets/posters/northbound.svg',
  saltwater: '/assets/posters/saltwater.svg',
  thirdSun: '/assets/posters/third-sun.svg',
  violetHours: '/assets/posters/violet-hours.svg',
} as const

const circle = [
  { name: 'Yasmine' },
  { name: 'Omar' },
  { name: 'Nadia' },
] as const

const movieCast = [
  ['Sara El Amrani', 'Mara'],
  ['Youssef Naciri', 'The Watchman'],
  ['Nora Rahal', 'Salma'],
  ['Malik Bensaid', 'Young Idris'],
  ['Leila Mansouri', 'Director'],
  ['Samir El Idrissi', 'Writer'],
] as const

const seriesCast = [
  ['Lina Serraj', 'Mina'],
  ['Adil Benomar', 'Yanis'],
  ['Meriem Rahal', 'Salma'],
  ['Sami Idrissi', 'Ilyas'],
  ['Nora Belkacem', 'Creator'],
  ['Ilan Moreau', 'Director'],
] as const

type RelatedTitle = {
  href: string
  meta: string
  src: string
  title: string
}

const relatedMovies: readonly RelatedTitle[] = [
  { href: '/title/sea-of-names', meta: '94% match · 2025', src: artwork.saltwater, title: 'Sea of Names' },
  { href: '/title/atlas-motel', meta: '91% match · 2024', src: artwork.northbound, title: 'Atlas Motel' },
  { href: '/title/little-gods', meta: '89% match · 2023', src: artwork.violetHours, title: 'Little Gods' },
  { href: '/title/the-returning', meta: '87% match · 2022', src: artwork.thirdSun, title: 'The Returning' },
  { href: '/title/third-sun', meta: '86% match · 2021', src: artwork.saltwater, title: 'Third Sun' },
]

const relatedSeries: readonly RelatedTitle[] = [
  { href: '/series/fault-lines', meta: '93% match · 3 seasons', src: artwork.saltwater, title: 'Fault Lines' },
  { href: '/series/no-one-leaves-sunday', meta: '90% match · Limited series', src: artwork.northbound, title: 'No One Leaves Sunday' },
  { href: '/series/little-gods', meta: '88% match · 2 seasons', src: artwork.violetHours, title: 'Little Gods' },
  { href: '/series/the-returning', meta: '86% match · 1 season', src: artwork.thirdSun, title: 'The Returning' },
  { href: '/series/third-sun', meta: '84% match · Limited series', src: artwork.saltwater, title: 'Third Sun' },
]

type ReviewFixture = {
  engagement: string
  memberName: string
  meta: string
  quote: string
  rating: number
}

const movieReviews: readonly ReviewFixture[] = [
  {
    engagement: '48 likes · 6 replies',
    memberName: 'Yasmine',
    meta: '26 August · Review',
    quote: 'It moves like a dream where you know something terrible happened, but not to whom.',
    rating: 4.5,
  },
  {
    engagement: '73 likes · 11 replies',
    memberName: 'Omar',
    meta: '25 August · Review',
    quote: 'A mystery that respects you enough to leave the final door closed. Rare.',
    rating: 5,
  },
  {
    engagement: '31 likes · 4 replies',
    memberName: 'Nadia',
    meta: '23 August · Review',
    quote: 'The city is the best character. Everyone else is just trying not to disappear inside it.',
    rating: 4,
  },
]

const seriesReviews: readonly ReviewFixture[] = [
  {
    engagement: '54 likes · 8 replies',
    memberName: 'Yasmine',
    meta: 'Season 2 · Review',
    quote: 'Every episode gives me one answer and three new problems.',
    rating: 4.5,
  },
  {
    engagement: '81 likes · 13 replies',
    memberName: 'Omar',
    meta: 'Season 2 · Review',
    quote: 'Episode four made my apartment feel suspicious for two days.',
    rating: 5,
  },
  {
    engagement: '38 likes · 4 replies',
    memberName: 'Nadia',
    meta: 'Season 2 · Review',
    quote: 'The building deserves its own acting award.',
    rating: 4,
  },
]

type EpisodeFixture = {
  action: 'continue' | 'notify' | 'play'
  artworkSrc: string
  description: string
  episode: string
  meta: string
  progress?: number
  status?: string
  title: string
}

const episodesBySeason: Record<'1' | '2', readonly EpisodeFixture[]> = {
  '1': [
    {
      action: 'play',
      artworkSrc: artwork.northbound,
      description: 'Mina moves into the last building she remembers from before her sister vanished.',
      episode: 'Episode 1',
      meta: '49 min · Watched',
      title: 'The Last Building',
    },
    {
      action: 'play',
      artworkSrc: artwork.saltwater,
      description: 'A violet window appears across the courtyard, but only at 3:17 every night.',
      episode: 'Episode 2',
      meta: '51 min · Watched',
      title: 'Across the Courtyard',
    },
    {
      action: 'play',
      artworkSrc: artwork.thirdSun,
      description: 'The residents compare memories and discover that none of their floor plans agree.',
      episode: 'Episode 3',
      meta: '47 min · Watched',
      title: 'A Different Hallway',
    },
  ],
  '2': [
    {
      action: 'continue',
      artworkSrc: artwork.violetHours,
      description: 'Mina follows a violet reflection into an apartment that does not exist by day.',
      episode: 'Episode 4',
      meta: '52 min · 31% watched',
      progress: 31,
      status: 'Continue · Episode 4',
      title: 'Glass Teeth',
    },
    {
      action: 'play',
      artworkSrc: artwork.saltwater,
      description: 'A silent tenant offers Mina a key—but only if she promises never to use it.',
      episode: 'Episode 5',
      meta: '48 min',
      title: 'The Quiet Floor',
    },
    {
      action: 'play',
      artworkSrc: artwork.thirdSun,
      description: 'The building wakes in 1998. Mina is the only person who notices.',
      episode: 'Episode 6',
      meta: '54 min',
      title: "Someone Else's Morning",
    },
    {
      action: 'notify',
      artworkSrc: artwork.violetHours,
      description: 'Mina returns to the first door and finds her own name written underneath.',
      episode: 'Episode 7 · Friday',
      meta: '51 min · Available at 21:00',
      title: 'The Door Remembers',
    },
  ],
}

const footerLinks = [
  { href: '#about-consumit', label: 'About' },
  { href: '/help', label: 'Help' },
  { href: '#apps', label: 'Apps' },
  { href: '#terms', label: 'Terms' },
  { href: '#privacy', label: 'Privacy' },
] as const

function DetailShell({ activeHref, children }: { activeHref: '/movies' | '/series'; children: ReactNode }) {
  return (
    <>
      <GlobalNavigation
        activeHref={activeHref}
        avatarSrc="/assets/hamza-avatar.svg"
        profileHref="/profile/hamza"
        profileName="Hamza"
        searchPlaceholder="Search titles, people, lists"
        sticky={false}
      />
      {children}
      <Footer copyright="© 2026 Consumit" links={footerLinks} />
    </>
  )
}

function SectionAction({ href, label }: { href: string; label: string }) {
  return (
    <a
      className="inline-flex min-h-11 items-center gap-2 rounded-control px-1 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-orange outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-orange motion-reduce:transition-none"
      href={href}
    >
      {label}
      <ArrowRight aria-hidden="true" className="size-3.5" />
    </a>
  )
}

function CastRail({ cast }: { cast: readonly (readonly [string, string])[] }) {
  return (
    <div className="mt-8 grid auto-cols-[minmax(9.5rem,42vw)] grid-flow-col gap-4 overflow-x-auto pb-4 sm:auto-cols-[11rem] xl:grid-flow-row xl:grid-cols-6 xl:overflow-visible xl:pb-0">
      {cast.map(([name, role]) => (
        <CastCard character={role} href={`/profile/${name.toLowerCase().replaceAll(' ', '-')}`} key={name} name={name} />
      ))}
    </div>
  )
}

function ReviewGrid({ reviews }: { reviews: readonly ReviewFixture[] }) {
  return (
    <div className="mt-8 grid gap-4 lg:grid-cols-3">
      {reviews.map((review) => (
        <TrustedReaction
          engagement={review.engagement}
          key={review.memberName}
          memberHref={`/profile/${review.memberName.toLowerCase()}`}
          memberName={review.memberName}
          meta={review.meta}
          quote={review.quote}
          rating={review.rating}
        />
      ))}
    </div>
  )
}

function RelatedRail({ items }: { items: readonly RelatedTitle[] }) {
  return (
    <div className="mt-8 grid auto-cols-[minmax(10rem,68vw)] grid-flow-col gap-4 overflow-x-auto pb-4 sm:auto-cols-[12rem] xl:grid-flow-row xl:grid-cols-5 xl:overflow-visible xl:pb-0">
      {items.map((item) => <PosterCard key={item.title} {...item} />)}
    </div>
  )
}

function MetadataLine({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-copy">{children}</div>
}

export function TitleDetailScreen({ slug }: { slug: string }) {
  const [saved, setSaved] = useState(false)
  const [showTrailerNote, setShowTrailerNote] = useState(false)

  return (
    <DetailShell activeHref="/movies">
      <main className="mx-auto w-full max-w-[90rem]" data-consumit-title-detail data-title-slug={slug}>
        <TitleMasthead
          actions={(
            <>
              <Link className={buttonVariants({ size: 'lg', variant: 'primary' })} href="/watch/the-last-city-after-rain" prefetch={false}>
                <Play aria-hidden="true" className="fill-current" />
                Play now
              </Link>
              <Button aria-pressed={showTrailerNote} onClick={() => setShowTrailerNote((current) => !current)} size="lg" variant="secondary">
                <Play aria-hidden="true" />
                Trailer
              </Button>
              <Button
                aria-label={saved ? 'Remove The Last City After Rain from library' : 'Save The Last City After Rain to library'}
                aria-pressed={saved}
                onClick={() => setSaved((current) => !current)}
                size="icon"
                variant="secondary"
              >
                {saved ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
              </Button>
            </>
          )}
          backgroundSrc={artwork.backdrop}
          className="rounded-none border-x-0 border-t-0 px-5 py-14 sm:px-8 lg:min-h-[42rem] lg:px-[62px] lg:py-24"
          headingLevel="h1"
          metadata={(
            <MetadataLine>
              <strong className="text-ink">2026</strong>
              <span>2h 08m</span>
              <span>Drama · Mystery</span>
              <Badge tone="neutral">16+</Badge>
              <span>4K · Dolby Atmos</span>
            </MetadataLine>
          )}
          socialProof={(
            <aside className="rounded-card border border-border bg-canvas/90 p-5" aria-label="Your circle on this film">
              <p className="mb-4 text-xs font-bold text-ink">Your circle on this film</p>
              <SocialProof
                detail="8 watched · 3 reviewed"
                items={circle}
                label="Yasmine, Omar, and Nadia"
                text={<><strong className="text-ink">4.6 average</strong> from people you trust</>}
              />
            </aside>
          )}
          synopsis="A cartographer returns to a city that has erased every street she remembers—and finds one stranger still living inside her old map."
          tasteReason="Strong fit: slow mysteries, hostile cities, and endings that refuse to explain themselves."
          tasteScore={92}
          title="The Last City After Rain"
        />

        <p aria-live="polite" className="min-h-0 px-5 text-xs text-muted sm:px-8 lg:px-[62px]">
          {showTrailerNote ? 'Trailer preview will open here when an authorized source is available.' : ''}
        </p>

        <div className="px-5 sm:px-8 lg:px-[62px]">
          <Tabs
            activeValue="overview"
            aria-label="The Last City After Rain sections"
            items={[
              { href: '#overview', label: 'Overview', value: 'overview' },
              { href: '#reviews', label: 'Reviews', value: 'reviews' },
              { href: '#cast', label: 'Cast & crew', value: 'cast' },
              { href: '#lists', label: 'Lists', value: 'lists' },
              { href: '#details', label: 'Details', value: 'details' },
            ]}
          />

          <section className="scroll-mt-8 py-12 sm:py-14 lg:py-16" id="overview" aria-labelledby="movie-about-heading">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-20">
              <div className="min-w-0">
                <SectionHeading id="movie-about-heading" title="About the film" />
                <p className="mt-6 max-w-[70ch] text-sm leading-7 text-copy">
                  Mara, a mapmaker living in exile, returns home after the monsoon to find an impossible city: entire neighborhoods have vanished from public memory. Only a night watchman recognizes her map. Together they trace the last surviving street before the rain comes again.
                </p>
                <dl className="mt-9 grid gap-x-8 gap-y-6 border-t border-border pt-7 text-xs sm:grid-cols-2 xl:grid-cols-3" id="details">
                  {[
                    ['Director', 'Leila Mansouri'],
                    ['Writer', 'Samir El Idrissi'],
                    ['Country', 'Morocco · France'],
                    ['Audio', 'Arabic · French · English'],
                    ['Subtitles', 'AR · EN · FR · ES · DE +12'],
                    ['Release', '18 Sep 2026'],
                  ].map(([term, detail]) => (
                    <div className="grid grid-cols-[5.5rem_1fr] gap-3" key={term}>
                      <dt className="text-muted">{term}</dt>
                      <dd className="font-bold text-copy">{detail}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <MemberPulse className="self-start lg:sticky lg:top-7" count="12,846 ratings" value={4.3} />
            </div>
          </section>

          <section className="scroll-mt-8 border-t border-border py-12 sm:py-14 lg:py-16" id="cast" aria-labelledby="movie-cast-heading">
            <SectionHeading action={<SectionAction href="#all-cast" label="View all" />} id="movie-cast-heading" title="Cast & crew" />
            <CastRail cast={movieCast} />
          </section>

          <section className="scroll-mt-8 border-t border-border py-12 sm:py-14 lg:py-16" id="reviews" aria-labelledby="movie-reviews-heading">
            <SectionHeading action={<SectionAction href="#all-reviews" label="All reviews" />} id="movie-reviews-heading" title="People you trust, on this film" />
            <ReviewGrid reviews={movieReviews} />
          </section>

          <section className="border-t border-border py-12 sm:py-14 lg:py-16" aria-labelledby="movie-related-heading">
            <SectionHeading description="Five places to go next" id="movie-related-heading" title="If this stays with you" />
            <RelatedRail items={relatedMovies} />
          </section>

          <section className="scroll-mt-8 border-t border-border py-12 sm:py-14" id="lists" aria-labelledby="member-lists-heading">
            <div className="grid gap-7 lg:grid-cols-[18rem_1fr] lg:items-center">
              <SectionHeading description="Curated by people, in a deliberate order" id="member-lists-heading" title="In 1,204 member lists" />
              <div className="grid gap-3 md:grid-cols-3">
                {[
                  ['Yasmine · 18 titles', 'Films that feel like a memory', 'from-[#6b2f37] to-[#291821]'],
                  ['Omar · 12 titles', 'One perfect film for every mood', 'from-[#28515a] to-[#97674c]'],
                  ['Nadia · 24 titles', 'Beautifully strange and worth it', 'from-[#4d3a5d] to-[#8f6865]'],
                ].map(([meta, title, tone]) => (
                  <Link className={`group min-h-28 rounded-card border border-border bg-gradient-to-br ${tone} p-5 outline-none focus-visible:ring-2 focus-visible:ring-orange`} href="/lists/films-that-feel-like-a-memory" key={title} prefetch={false}>
                    <span className="text-[0.625rem] font-bold uppercase tracking-[0.08em] text-ink/80">{meta}</span>
                    <span className="mt-3 block font-display text-xl leading-tight text-ink transition-colors group-hover:text-white">{title}</span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>
    </DetailShell>
  )
}

export function SeriesDetailScreen({ slug }: { slug: string }) {
  const [saved, setSaved] = useState(false)
  const [season, setSeason] = useState<'1' | '2'>('2')
  const [notifiedEpisodes, setNotifiedEpisodes] = useState<string[]>([])
  const [showTrailerNote, setShowTrailerNote] = useState(false)
  const episodes = episodesBySeason[season]
  const seasonSummary = useMemo(() => season === '2'
    ? { completed: 3, next: 'S2 E04 · Glass Teeth', remaining: '36 minutes remaining', total: 8 }
    : { completed: 8, next: 'Season 1 complete', remaining: 'Continue with Season 2', total: 8 }, [season])

  function toggleNotification(episodeTitle: string) {
    setNotifiedEpisodes((current) => current.includes(episodeTitle)
      ? current.filter((title) => title !== episodeTitle)
      : [...current, episodeTitle])
  }

  return (
    <DetailShell activeHref="/series">
      <main className="mx-auto w-full max-w-[90rem]" data-consumit-series-detail data-series-slug={slug}>
        <TitleMasthead
          actions={(
            <>
              <Link className={buttonVariants({ size: 'lg', variant: 'primary' })} href="/watch/violet-hours-s2-e4" prefetch={false}>
                <Play aria-hidden="true" className="fill-current" />
                Continue S2 E04
              </Link>
              <Button aria-pressed={showTrailerNote} onClick={() => setShowTrailerNote((current) => !current)} size="lg" variant="secondary">
                <Play aria-hidden="true" />
                Trailer
              </Button>
              <Button
                aria-label={saved ? 'Remove Violet Hours from library' : 'Save Violet Hours to library'}
                aria-pressed={saved}
                onClick={() => setSaved((current) => !current)}
                size="icon"
                variant="secondary"
              >
                {saved ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
              </Button>
            </>
          )}
          backgroundSrc={artwork.backdrop}
          className="rounded-none border-x-0 border-t-0 px-5 py-14 [&>img]:hue-rotate-[250deg] [&>img]:saturate-[.72] sm:px-8 lg:min-h-[42rem] lg:px-[62px] lg:py-24"
          headingLevel="h1"
          metadata={(
            <MetadataLine>
              <strong className="text-ink">2022–</strong>
              <span>2 seasons</span>
              <span>Mystery · Drama</span>
              <Badge tone="neutral">16+</Badge>
              <span>4K</span>
            </MetadataLine>
          )}
          socialProof={(
            <aside className="rounded-card border border-border bg-canvas/90 p-5" aria-label="Friends watching this season">
              <p className="mb-4 text-xs font-bold text-ink">Friends watching this season</p>
              <SocialProof
                detail="3 friends ahead · 2 behind you"
                items={circle}
                label="Yasmine, Omar, and Nadia"
                text={<strong className="text-ink">Yasmine is on Episode 6</strong>}
              />
            </aside>
          )}
          synopsis="Every night at 3:17, one apartment in the city lights up violet. Everyone who enters remembers a different version of the same life."
          tasteReason="Because you stay for slow-burn mysteries and characters who make terrible choices beautifully."
          tasteScore={89}
          title="Violet Hours"
        />

        <p aria-live="polite" className="min-h-0 px-5 text-xs text-muted sm:px-8 lg:px-[62px]">
          {showTrailerNote ? 'Trailer preview will open here when an authorized source is available.' : ''}
        </p>

        <div className="px-5 sm:px-8 lg:px-[62px]">
          <Tabs
            activeValue="episodes"
            aria-label="Violet Hours sections"
            items={[
              { href: '#episodes', label: 'Episodes', value: 'episodes' },
              { href: '#series-about', label: 'Overview', value: 'overview' },
              { href: '#series-reviews', label: 'Reviews', value: 'reviews' },
              { href: '#series-cast', label: 'Cast & crew', value: 'cast' },
              { href: '#series-related', label: 'Lists', value: 'lists' },
            ]}
          />

          <section className="scroll-mt-8 py-12 sm:py-14 lg:py-16" id="episodes" aria-labelledby="episodes-heading">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <SectionHeading id="episodes-heading" title="Episodes" />
              <div className="flex flex-wrap items-center gap-4">
                <SeasonSelector
                  onValueChange={(value) => setSeason(value === '1' ? '1' : '2')}
                  options={[{ label: 'Season 1', value: '1' }, { label: 'Season 2', value: '2' }]}
                  value={season}
                />
                <span className="text-xs text-muted">8 episodes</span>
              </div>
            </div>

            <div className="mt-8 grid gap-7 lg:grid-cols-[minmax(0,1fr)_24rem]">
              <div className="space-y-3">
                {episodes.map((episode) => {
                  const { action: actionKind, ...episodeProps } = episode
                  const notified = notifiedEpisodes.includes(episode.title)
                  const action = actionKind === 'notify' ? (
                    <Button
                      aria-pressed={notified}
                      className="w-full sm:w-auto"
                      onClick={() => toggleNotification(episode.title)}
                      size="sm"
                      variant="secondary"
                    >
                      {notified ? <Check aria-hidden="true" /> : <Bell aria-hidden="true" />}
                      {notified ? 'Reminder set' : 'Notify me'}
                    </Button>
                  ) : (
                    <Link
                      className={`${buttonVariants({ size: 'sm', variant: actionKind === 'continue' ? 'primary' : 'secondary' })} w-full sm:w-auto`}
                      href={`/watch/violet-hours-${episode.episode.toLowerCase().replaceAll(' ', '-').replaceAll('·', '')}`}
                      prefetch={false}
                    >
                      {actionKind === 'continue' ? 'Continue' : 'Play'}
                    </Link>
                  )

                  return <EpisodeRow action={action} key={episode.title} {...episodeProps} />
                })}
              </div>

              <aside className="space-y-4 lg:sticky lg:top-7 lg:self-start" aria-label={`Season ${season} status`}>
                <section className="rounded-card border border-border bg-surface p-6">
                  <h3 className="text-sm font-bold text-ink">Your Season {season} progress</h3>
                  <p className="mt-5 font-display text-5xl leading-none text-ink">{seasonSummary.completed} of {seasonSummary.total}</p>
                  <p className="mt-2 text-xs text-muted">episodes finished</p>
                  <ProgressRail className="mt-6" label={`${seasonSummary.completed} of ${seasonSummary.total} episodes finished`} max={seasonSummary.total} value={seasonSummary.completed} />
                  <div className="mt-7 border-t border-border pt-6">
                    <p className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-muted">Up next</p>
                    <p className="mt-3 text-sm font-bold text-ink">{seasonSummary.next}</p>
                    <p className="mt-1 text-xs text-muted">{seasonSummary.remaining}</p>
                    <Link className={`${buttonVariants({ size: 'sm', variant: 'primary' })} mt-5`} href="/watch/violet-hours-s2-e4" prefetch={false}>
                      {season === '2' ? 'Continue episode' : 'Start Season 2'}
                    </Link>
                  </div>
                </section>

                <section className="rounded-card border border-border bg-surface p-6">
                  <h3 className="text-sm font-bold text-ink">Release schedule</h3>
                  <p className="mt-4 font-display text-2xl leading-tight text-copy">New episodes every Friday</p>
                  <p className="mt-3 text-xs leading-5 text-muted">Episode 7 arrives in 3 days · 21:00</p>
                  <p className="mt-5 flex items-center gap-2 text-[0.6875rem] text-copy">
                    <span aria-hidden="true" className="size-2 rounded-full bg-lime" />
                    Release notifications enabled
                  </p>
                </section>
              </aside>
            </div>
          </section>

          <section className="scroll-mt-8 border-t border-border py-12 sm:py-14 lg:py-16" id="series-about" aria-labelledby="series-about-heading">
            <SectionHeading id="series-about-heading" title="About Violet Hours" />
            <p className="mt-6 max-w-[72ch] text-sm leading-7 text-copy">
              After her sister vanishes, Mina moves into the last building she visited. Every night at 3:17, one apartment glows violet and opens into a different year. The residents remember Mina—but none of them remember the same version of her.
            </p>
            <dl className="mt-9 grid gap-x-10 gap-y-6 border-t border-border pt-7 text-xs sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['Creator', 'Nora Belkacem'],
                ['Original language', 'Arabic · French'],
                ['Status', 'Returning series'],
                ['Member rating', '4.4 / 5'],
              ].map(([term, detail]) => (
                <div className="grid grid-cols-[7rem_1fr] gap-3" key={term}>
                  <dt className="text-muted">{term}</dt>
                  <dd className={term === 'Member rating' ? 'font-bold text-orange' : 'font-bold text-copy'}>{detail}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="scroll-mt-8 border-t border-border py-12 sm:py-14 lg:py-16" id="series-cast" aria-labelledby="series-cast-heading">
            <SectionHeading action={<SectionAction href="#all-series-cast" label="View all" />} id="series-cast-heading" title="Cast & crew" />
            <CastRail cast={seriesCast} />
          </section>

          <section className="scroll-mt-8 border-t border-border py-12 sm:py-14 lg:py-16" id="series-reviews" aria-labelledby="series-reviews-heading">
            <SectionHeading action={<SectionAction href="#all-series-reviews" label="All reviews" />} id="series-reviews-heading" title="Your circle on Violet Hours" />
            <ReviewGrid reviews={seriesReviews} />
          </section>

          <section className="scroll-mt-8 border-t border-border py-12 sm:py-14 lg:py-16" id="series-related" aria-labelledby="series-related-heading">
            <SectionHeading description="Series to watch next" id="series-related-heading" title="When the violet light goes out" />
            <RelatedRail items={relatedSeries} />
          </section>
        </div>
      </main>
    </DetailShell>
  )
}
