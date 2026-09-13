'use client'

import { titleHref, watchHref, type CatalogTitleSummary } from '@consumit/contracts'
import { ArrowRight, Play } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

import {
  buttonVariants,
  CarouselRow,
  EditorialFeature,
  FilterChip,
  Footer,
  HeroSpotlight,
  SectionHeading,
  TitleMasthead,
  WatchCard,
} from '@consumit/ui'

import { CatalogStaleNotice, detailMeta, makerByline, titleMeta, type HeroDetail } from '../catalog/catalog-ui'
import { SaveTitleButton } from '../catalog/save-title-button'
import { SessionNavigation } from '../session/session-navigation'

type HomeScreenProps = {
  curated: readonly CatalogTitleSummary[]
  editorial: CatalogTitleSummary
  hero: HeroDetail
  popular?: readonly CatalogTitleSummary[] | undefined
  spotlight?: readonly HeroDetail[] | undefined
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
      <SessionNavigation activeHref="/" searchPlaceholder="Search titles" sticky={false} />
      {stale ? <CatalogStaleNotice meta={{ fetchedAt: new Date(0).toISOString(), language: 'en-US', region: 'US', source: 'tmdb', stale }} /> : null}

      <main className="mx-auto w-full max-w-[90rem]" data-consumit-home>
        <h1 className="sr-only">Consumit home</h1>
        {spotlight.length > 1 ? (
          <HeroSpotlight
            autoAdvanceMs={8000}
            items={spotlight.map((item) => ({
              actions: (
                <>
                  <Link className={buttonVariants()} href={watchHref(item)}><Play aria-hidden="true" /> Watch</Link>
                  <Link className={buttonVariants({ variant: 'secondary' })} href={titleHref(item)}>More info</Link>
                </>
              ),
              backgroundSrc: item.backdropUrl ?? undefined,
              byline: makerByline(item),
              key: `${item.kind}:${item.id}`,
              lede: item.tagline ?? undefined,
              logoUrl: item.logoUrl ?? undefined,
              metadata: detailMeta(item),
              synopsis: item.overview || 'More information will be available soon.',
              title: item.title,
            }))}
            label="New this week"
            mastheadClassName="consumit-home-masthead"
          />
        ) : (
          <TitleMasthead
            actions={(
              <>
                <Link className={buttonVariants()} href={watchHref(hero)}><Play aria-hidden="true" /> Watch</Link>
                <Link className={buttonVariants({ variant: 'secondary' })} href={titleHref(hero)}>More info</Link>
              </>
            )}
            backgroundSrc={hero.backdropUrl ?? undefined}
            byline={makerByline(hero)}
            className="consumit-home-masthead"
            lede={hero.tagline ?? undefined}
            logoUrl={hero.logoUrl ?? undefined}
            metadata={detailMeta(hero)}
            synopsis={hero.overview || 'More information will be available soon.'}
            title={hero.title}
          />
        )}

        <div className="px-5 sm:px-8 lg:px-[50px]">
          {popular.length > 0 ? (
            <section className="border-t border-border py-14 sm:py-16 lg:py-20" aria-labelledby="popular-heading">
              <SectionHeading action={<SectionAction href="/search" />} description="What viewers are discovering across the catalog" id="popular-heading" title="Popular now" />
              <div className="mt-8">
                <CarouselRow aria-label="Popular titles">
                  {popular.slice(0, 15).map((title) => (
                    <WatchCard
                      artworkSrc={title.posterUrl ?? undefined}
                      bookmark={<SaveTitleButton id={title.id} kind={title.kind} title={title.title} />}
                      className="w-[145px] sm:w-[170px] md:w-[195px] lg:w-[215px] shrink-0"
                      href={watchHref(title)}
                      key={`${title.kind}:${title.id}`}
                      linkComponent={Link}
                      meta={title.year ? String(title.year) : undefined}
                      rating={title.tmdbRating ?? undefined}
                      title={title.title}
                      titleHref={titleHref(title)}
                    />
                  ))}
                </CarouselRow>
              </div>
            </section>
          ) : null}

          {topRated.length > 0 ? (
            <section className="border-t border-border py-14 sm:py-16 lg:py-20" aria-labelledby="top-rated-heading">
              <SectionHeading action={<SectionAction href="/search" />} description="Sustained acclaim across the catalog" id="top-rated-heading" title="Top rated" />
              <div className="mt-8">
                <CarouselRow aria-label="Top rated titles">
                  {topRated.slice(0, 15).map((title) => (
                    <WatchCard
                      artworkSrc={title.posterUrl ?? undefined}
                      bookmark={<SaveTitleButton id={title.id} kind={title.kind} title={title.title} />}
                      className="w-[145px] sm:w-[170px] md:w-[195px] lg:w-[215px] shrink-0"
                      href={watchHref(title)}
                      key={`${title.kind}:${title.id}`}
                      linkComponent={Link}
                      meta={title.year ? String(title.year) : undefined}
                      rating={title.tmdbRating ?? undefined}
                      title={title.title}
                      titleHref={titleHref(title)}
                    />
                  ))}
                </CarouselRow>
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
              <SectionHeading description="Find something by mood" id="genre-heading" title="Browse by genre" />
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
