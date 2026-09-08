'use client'

import { titleHref, watchHref, type CatalogTitleSummary } from '@consumit/contracts'
import { ArrowRight, Play } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

import {
  buttonVariants,
  EditorialFeature,
  FilterChip,
  Footer,
  HeroSpotlight,
  SectionHeading,
  TitleMasthead,
  TrendingCard,
  WatchCard,
} from '@consumit/ui'

import { CatalogStaleNotice, titleMeta } from '../catalog/catalog-ui'
import { SaveTitleButton } from '../catalog/save-title-button'
import { TitleActions } from '../catalog/title-actions'
import { SessionNavigation } from '../session/session-navigation'

type HomeScreenProps = {
  curated: readonly CatalogTitleSummary[]
  editorial: CatalogTitleSummary
  hero: CatalogTitleSummary
  popular?: readonly CatalogTitleSummary[] | undefined
  spotlight?: readonly CatalogTitleSummary[] | undefined
  stale: boolean
  topRated?: readonly CatalogTitleSummary[] | undefined
  trending: readonly CatalogTitleSummary[]
}

function SectionAction({ href, label = 'View all' }: { href: string; label?: string }) {
  return (
    <Link className="inline-flex min-h-11 items-center gap-2 rounded-control px-1 text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-orange outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-orange" href={href}>
      {label}<ArrowRight aria-hidden="true" className="size-3.5" />
    </Link>
  )
}

export function HomeScreen({ curated, editorial, hero, popular = [], spotlight = [], stale, topRated = [], trending }: HomeScreenProps) {
  const [genre, setGenre] = useState('')
  const genrePool = useMemo(() => {
    const seen = new Set<string>()
    return [...curated, ...trending, ...popular, ...topRated].filter((title) => {
      const key = `${title.kind}:${title.id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [curated, popular, topRated, trending])
  const topGenres = useMemo(() => {
    const counts = new Map<string, number>()
    for (const title of genrePool) {
      for (const name of title.genreNames) counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [genrePool])
  const activeGenre = genre || topGenres[0]?.[0] || ''
  const genreTitles = genrePool.filter((title) => title.genreNames.includes(activeGenre))

  return (
    <>
      <SessionNavigation activeHref="/" searchPlaceholder="Search movies and series" sticky={false} />
      {stale ? <CatalogStaleNotice meta={{ fetchedAt: new Date(0).toISOString(), language: 'en-US', region: 'US', source: 'tmdb', stale }} /> : null}

      <main className="mx-auto w-full max-w-[90rem]" data-consumit-home>
        <h1 className="sr-only">Consumit home</h1>
        {spotlight.length > 1 ? (
          <HeroSpotlight
            items={spotlight.map((item) => ({
              actions: (
                <>
                  <Link className={buttonVariants()} href={watchHref(item)}><Play aria-hidden="true" /> Watch</Link>
                  <TitleActions id={item.id} kind={item.kind} title={item.title} titleHref={titleHref(item)} />
                </>
              ),
              backgroundSrc: item.backdropUrl ?? undefined,
              key: `${item.kind}:${item.id}`,
              metadata: titleMeta(item),
              synopsis: item.overview || 'More information will be available soon.',
              title: item.title,
            }))}
            label="New this week"
            mastheadClassName="rounded-none border-x-0 border-t-0 px-5 py-14 sm:px-8 lg:min-h-[36.5rem] lg:px-[62px] lg:py-20"
          />
        ) : (
          <TitleMasthead
            actions={(
              <>
                <Link className={buttonVariants()} href={watchHref(hero)}><Play aria-hidden="true" /> Watch</Link>
                <TitleActions id={hero.id} kind={hero.kind} title={hero.title} titleHref={titleHref(hero)} />
              </>
            )}
            backgroundSrc={hero.backdropUrl ?? undefined}
            className="rounded-none border-x-0 border-t-0 px-5 py-14 sm:px-8 lg:min-h-[36.5rem] lg:px-[62px] lg:py-20"
            metadata={titleMeta(hero)}
            synopsis={hero.overview || 'More information will be available soon.'}
            title={hero.title}
          />
        )}

        <div className="px-5 sm:px-8 lg:px-[62px]">
          <section className="py-14 sm:py-16 lg:py-20" aria-labelledby="trending-heading">
            <SectionHeading action={<SectionAction href="/search" />} description="Live titles people are discovering right now" id="trending-heading" title="Trending tonight" />
            <div className="mt-8 grid auto-cols-[minmax(11rem,72vw)] grid-flow-col gap-5 overflow-x-auto pb-4 sm:auto-cols-[13rem] xl:grid-flow-row xl:grid-cols-5 xl:overflow-visible xl:pb-0">
              {trending.slice(0, 5).map((title, index) => (
                <TrendingCard artworkSrc={title.posterUrl ?? undefined} href={titleHref(title)} key={`${title.kind}:${title.id}`} linkComponent={Link} rank={index + 1} title={title.title} />
              ))}
            </div>
          </section>

          {popular.length > 0 ? (
            <section className="border-t border-border py-14 sm:py-16 lg:py-20" aria-labelledby="popular-heading">
              <SectionHeading action={<SectionAction href="/search" />} description="What viewers are discovering across the catalog" id="popular-heading" title="Popular now" />
              <div className="mt-8 grid auto-cols-[minmax(11rem,72vw)] grid-flow-col gap-5 overflow-x-auto pb-4 sm:auto-cols-[13rem] xl:grid-flow-row xl:grid-cols-5 xl:overflow-visible xl:pb-0">
                {popular.slice(0, 5).map((title) => (
                  <WatchCard artworkSrc={title.posterUrl ?? undefined} bookmark={<SaveTitleButton id={title.id} kind={title.kind} title={title.title} />} href={watchHref(title)} key={`${title.kind}:${title.id}`} linkComponent={Link} meta={title.year ? String(title.year) : undefined} rating={title.tmdbRating ?? undefined} title={title.title} titleHref={titleHref(title)} />
                ))}
              </div>
            </section>
          ) : null}

          {topRated.length > 0 ? (
            <section className="border-t border-border py-14 sm:py-16 lg:py-20" aria-labelledby="top-rated-heading">
              <SectionHeading action={<SectionAction href="/search" />} description="Sustained acclaim across the catalog" id="top-rated-heading" title="Top rated" />
              <div className="mt-8 grid auto-cols-[minmax(11rem,72vw)] grid-flow-col gap-5 overflow-x-auto pb-4 sm:auto-cols-[13rem] xl:grid-flow-row xl:grid-cols-5 xl:overflow-visible xl:pb-0">
                {topRated.slice(0, 5).map((title) => (
                  <WatchCard artworkSrc={title.posterUrl ?? undefined} bookmark={<SaveTitleButton id={title.id} kind={title.kind} title={title.title} />} href={watchHref(title)} key={`${title.kind}:${title.id}`} linkComponent={Link} meta={title.year ? String(title.year) : undefined} rating={title.tmdbRating ?? undefined} title={title.title} titleHref={titleHref(title)} />
                ))}
              </div>
            </section>
          ) : null}

          <section className="border-t border-border py-14 sm:py-16 lg:py-20" aria-label="Editorial selection">
            <EditorialFeature
              action={<Link className={buttonVariants()} href={watchHref(editorial)}><Play aria-hidden="true" /> Watch</Link>}
              alt={`${editorial.title} artwork`}
              context="Tonight's editorial selection"
              metadata={titleMeta(editorial)}
              secondaryAction={<Link className={buttonVariants({ variant: 'secondary' })} href={titleHref(editorial)}>View title</Link>}
              src={editorial.backdropUrl ?? editorial.posterUrl ?? undefined}
              synopsis={editorial.overview || 'More information will be available soon.'}
              title={editorial.title}
            />
          </section>

          {genrePool.length > 0 ? (
            <section className="border-t border-border py-14 sm:py-16 lg:py-20" aria-labelledby="genre-heading">
              <SectionHeading description="Explore the current catalog by genre" id="genre-heading" title="Browse by genre" />
              <div aria-label="Filter by genre" className="mt-6 flex flex-wrap gap-2" role="group">
                {topGenres.map(([name]) => (
                  <FilterChip key={name} onClick={() => setGenre(name)} selected={name === activeGenre}>{name}</FilterChip>
                ))}
              </div>
              <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 xl:grid-cols-5">
                {genreTitles.slice(0, 10).map((title) => (
                  <WatchCard artworkSrc={title.posterUrl ?? undefined} bookmark={<SaveTitleButton id={title.id} kind={title.kind} title={title.title} />} href={watchHref(title)} key={`${title.kind}:${title.id}`} linkComponent={Link} meta={title.year ? String(title.year) : undefined} rating={title.tmdbRating ?? undefined} title={title.title} titleHref={titleHref(title)} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </main>

      <Footer copyright="© 2026 Consumit" linkComponent={Link} links={[{ href: '/about', label: 'About' }, { href: '#help', label: 'Help' }, { href: '#apps', label: 'Apps' }, { href: '#terms', label: 'Terms' }, { href: '#privacy', label: 'Privacy' }, { href: '/components', label: 'Components' }]} />
    </>
  )
}
