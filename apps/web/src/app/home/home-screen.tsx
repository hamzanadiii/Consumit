'use client'

import { titleHref, watchHref, type CatalogTitleSummary } from '@consumit/contracts'
import { ArrowRight, Bookmark, Play } from 'lucide-react'
import { useMemo, useState } from 'react'

import {
  Badge,
  buttonVariants,
  ContentCard,
  ContinueCard,
  CuratedListCard,
  EditorialFeature,
  FilterChip,
  Footer,
  GlobalNavigation,
  MemberByline,
  MoodSelector,
  RatingDisplay,
  SectionHeading,
  SocialProof,
  TitleMasthead,
  TrendingCard,
} from '@consumit/ui'

import { deterministicMemberScore, deterministicTaste } from '@/lib/catalog-registry'

import { CatalogPreviewNotice } from '../catalog/catalog-attribution'
import { CatalogStaleNotice, memberRating, titleMeta } from '../catalog/catalog-ui'

const people = [{ name: 'Yasmine' }, { name: 'Omar' }, { name: 'Nadia' }] as const
const moodOptions = [
  { label: 'Slow & beautiful', tone: 'orange', value: 'slow' },
  { label: 'Mess with my head', tone: 'lilac', value: 'strange' },
  { label: 'Easy comfort', tone: 'lime', value: 'comfort' },
  { label: 'Laugh with friends', tone: 'orange', value: 'funny' },
  { label: 'Pure tension', tone: 'rose', value: 'tense' },
] as const

type HomeScreenProps = {
  curated: readonly CatalogTitleSummary[]
  editorial: CatalogTitleSummary
  hero: CatalogTitleSummary
  stale: boolean
  trending: readonly CatalogTitleSummary[]
}

function SectionAction({ href, label = 'View all' }: { href: string; label?: string }) {
  return (
    <a className="inline-flex min-h-11 items-center gap-2 rounded-control px-1 text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-orange outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-orange" href={href}>
      {label}<ArrowRight aria-hidden="true" className="size-3.5" />
    </a>
  )
}

export function HomeScreen({ curated, editorial, hero, stale, trending }: HomeScreenProps) {
  const [circleFilter, setCircleFilter] = useState('all')
  const [mood, setMood] = useState<string>()
  const [savedHero, setSavedHero] = useState(false)
  const circleTitles = useMemo(() => {
    if (circleFilter === 'movies') return curated.filter((title) => title.kind === 'movie').slice(0, 5)
    if (circleFilter === 'series') return curated.filter((title) => title.kind === 'series').slice(0, 5)
    return curated.slice(0, 5)
  }, [circleFilter, curated])

  return (
    <>
      <GlobalNavigation activeHref="/" avatarSrc="/assets/hamza-avatar.svg" profileHref="/profile/hamza" profileName="Hamza" searchPlaceholder="Search movies, series, people" sticky={false} />
      <CatalogPreviewNotice />
      {stale ? <CatalogStaleNotice meta={{ fetchedAt: new Date(0).toISOString(), language: 'en-US', region: 'US', source: 'tmdb', stale }} /> : null}

      <main className="mx-auto w-full max-w-[90rem]" data-consumit-home>
        <h1 className="sr-only">Consumit home</h1>
        <TitleMasthead
          actions={(
            <>
              <a className={buttonVariants()} href={watchHref(hero)}><Play aria-hidden="true" /> Watch</a>
              <button aria-label={savedHero ? 'Remove from library' : 'Save to library'} aria-pressed={savedHero} className={buttonVariants({ size: 'icon', variant: 'secondary' })} onClick={() => setSavedHero((value) => !value)} type="button">
                <Bookmark aria-hidden="true" className={savedHero ? 'fill-current' : ''} />
              </button>
            </>
          )}
          backgroundSrc={hero.backdropUrl ?? undefined}
          className="rounded-none border-x-0 border-t-0 px-5 py-14 sm:px-8 lg:min-h-[36.5rem] lg:px-[62px] lg:py-20"
          metadata={titleMeta(hero)}
          synopsis={hero.overview || 'More information will be available soon.'}
          tasteReason={`Because ${people[0].name} and ${people[1].name} have been watching stories like this.`}
          tasteScore={deterministicTaste(hero)}
          title={hero.title}
        />

        <div className="px-5 sm:px-8 lg:px-[62px]">
          <section className="py-14 sm:py-16 lg:py-20" aria-labelledby="circle-heading">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <SectionHeading description="Real titles, surfaced through people you trust" id="circle-heading" title="From your circle" />
              <div aria-label="Filter circle titles" className="flex flex-wrap gap-2" role="group">
                {['all', 'movies', 'series'].map((filter) => (
                  <FilterChip key={filter} onClick={() => setCircleFilter(filter)} selected={circleFilter === filter}>
                    {filter.charAt(0).toUpperCase() + filter.slice(1)}
                  </FilterChip>
                ))}
              </div>
            </div>
            <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_19rem]">
              <div className="grid auto-cols-[minmax(10rem,72vw)] grid-flow-col gap-3 overflow-x-auto pb-4 sm:auto-cols-[12rem] xl:grid-flow-row xl:grid-cols-5 xl:overflow-visible xl:pb-0">
                {circleTitles.map((title, index) => (
                  <ContentCard artworkSrc={title.posterUrl ?? undefined} badge={<Badge tone="lilac">{deterministicTaste(title, index)}% match</Badge>} friends={people.slice(0, (index % 3) + 1)} href={titleHref(title)} key={`${title.kind}:${title.id}`} meta={titleMeta(title)} title={title.title} />
                ))}
              </div>
              <aside className="border-t border-border pt-6 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-7" aria-labelledby="friends-watching">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-sm font-bold text-ink" id="friends-watching">Your circle is watching</h3>
                  <SectionAction href="/friends" label="See all" />
                </div>
                <div className="mt-3 divide-y divide-border">
                  {curated.slice(0, 3).map((title, index) => (
                    <div className="py-4" key={`${title.kind}:${title.id}`}>
                      <MemberByline meta={`watched ${title.title}`} name={people[index]?.name ?? 'A friend'} />
                      <RatingDisplay className="mt-2 pl-11" value={4.5 - index * 0.25} />
                    </div>
                  ))}
                </div>
              </aside>
            </div>
          </section>

          <section className="border-t border-border py-14 sm:py-16 lg:py-20" aria-labelledby="continue-heading">
            <SectionHeading action={<SectionAction href="/library" />} id="continue-heading" title="Continue watching" />
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {curated.slice(5, 9).map((title, index) => (
                <ContinueCard artworkSrc={title.backdropUrl ?? title.posterUrl ?? undefined} href={watchHref(title)} key={`${title.kind}:${title.id}`} meta={title.kind === 'series' ? `S1 E${index + 2} · ${24 + index * 7} min left` : `${31 + index * 6} min left`} progress={[62, 34, 79, 22][index] ?? 40} title={title.title} />
              ))}
            </div>
          </section>

          <section className="border-t border-border py-14 sm:py-16 lg:py-20" aria-label="Personalized editorial pick">
            <EditorialFeature action={<a className={buttonVariants()} href={watchHref(editorial)}><Play aria-hidden="true" /> Watch</a>} alt={`${editorial.title} artwork`} context={`Because you loved ${hero.title}`} metadata={titleMeta(editorial)} secondaryAction={<a className={buttonVariants({ variant: 'secondary' })} href={titleHref(editorial)}>Why this pick?</a>} socialProof={<SocialProof detail={memberRating(editorial)} items={people.slice(0, 2)} label="Yasmine and Omar" text="2 people in your circle loved it" />} src={editorial.backdropUrl ?? editorial.posterUrl ?? undefined} synopsis={editorial.overview || 'More information will be available soon.'} title={editorial.title} />
          </section>

          <section className="border-t border-border py-14 sm:py-16 lg:py-20" aria-labelledby="trending-heading">
            <SectionHeading action={<SectionAction href="/search" />} description="Live TMDB momentum with Consumit member signals" id="trending-heading" title="Trending tonight" />
            <div className="mt-8 grid auto-cols-[minmax(11rem,72vw)] grid-flow-col gap-5 overflow-x-auto pb-4 sm:auto-cols-[13rem] xl:grid-flow-row xl:grid-cols-5 xl:overflow-visible xl:pb-0">
              {trending.slice(0, 5).map((title, index) => (
                <TrendingCard artworkSrc={title.posterUrl ?? undefined} completionProof={`${10 + index * 2}K watched · ${94 - index * 2}% finished`} href={titleHref(title)} key={`${title.kind}:${title.id}`} memberScore={deterministicMemberScore(title, index)} rank={index + 1} title={title.title} />
              ))}
            </div>
          </section>

          <section className="border-t border-border py-14 sm:py-16 lg:py-20" aria-labelledby="lists-heading">
            <SectionHeading description="Made by people you follow, not a content department" id="lists-heading" title="Lists worth stealing" />
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {[
                ['Yasmine', 'Films that feel like a memory', '426'],
                ['Omar', 'One perfect title for every mood', '319'],
                ['Nadia', 'Beautifully strange and worth it', '588'],
              ].map(([curator, listTitle, saves], index) => (
                <CuratedListCard artworkSources={curated.slice(index, index + 4).map((title) => title.posterUrl ?? undefined)} curator={curator ?? ''} href="/lists/films-that-feel-like-a-memory" key={curator} saves={saves ?? '0'} title={listTitle ?? ''} />
              ))}
            </div>
          </section>

          <section className="border-t border-border py-14 sm:py-16 lg:py-20" aria-labelledby="mood-heading">
            <SectionHeading id="mood-heading" title="What kind of night is it?" />
            <div className="mt-7 flex flex-col gap-4 xl:flex-row xl:items-start">
              <MoodSelector className="flex-1" label="Choose tonight’s mood" onValueChange={setMood} options={moodOptions} value={mood} />
              <a className={`${buttonVariants({ size: 'lg' })} justify-between xl:min-w-[19rem]`} href="/search">Surprise me based on my taste<ArrowRight aria-hidden="true" /></a>
            </div>
          </section>
        </div>
      </main>

      <Footer copyright="© 2026 Consumit" links={[{ href: '/about', label: 'About' }, { href: '#help', label: 'Help' }, { href: '#apps', label: 'Apps' }, { href: '#terms', label: 'Terms' }, { href: '#privacy', label: 'Privacy' }, { href: '/components', label: 'Components' }]} />
    </>
  )
}
