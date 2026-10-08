'use client'

import { titleHref, watchHref, type AnimeTitleSummary, type CatalogPage } from '@consumit/contracts'
import { ArrowRight, Play, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'

import {
  buttonVariants,
  Button,
  EmptyState,
  FilterChip,
  SectionHeading,
} from '@consumit/next-ui'

import { CatalogGrid, titleMeta } from '../catalog/catalog-ui'
import { SaveTitleButton } from '../catalog/save-title-button'
import { FilScreenShell } from '../shared'
import { TitleCard } from '../shared/title-card'

type SearchScreenProps = {
  /** AniList anime matches. TMDB never serves anime, so these arrive separately. */
  animeResults?: readonly AnimeTitleSummary[] | undefined
  initialQuery: string
  page: CatalogPage
  queryTooShort: boolean
}

function AnimeSearchCard({ anime }: { anime: AnimeTitleSummary }) {
  const meta = [anime.seasonYear, 'Anime', anime.genres.slice(0, 2).join(' · ')].filter(Boolean).join(' · ')
  return (
    <TitleCard
      action={<SaveTitleButton id={anime.anilistId} kind="anime" title={anime.titles.preferred} />}
      href={watchHref({ kind: 'anime', id: anime.anilistId })}
      meta={meta}
      titleHref={`/anime/${anime.anilistId}`}
      title={{ id: anime.anilistId, kind: 'anime', title: anime.titles.preferred, year: anime.seasonYear, posterUrl: anime.coverImage.url, tmdbRating: anime.averageScore === null ? null : anime.averageScore / 10 }}
    />
  )
}

export function SearchScreen({ animeResults, initialQuery, page, queryTooShort }: SearchScreenProps) {
  const [activeKind, setActiveKind] = useState<'all' | 'movie' | 'series' | 'anime'>('all')
  // TMDB serves movies and series only — anime matches come from AniList.
  const animeItems = animeResults ?? []
  const results = useMemo(() => {
    if (activeKind === 'anime') return []
    return activeKind === 'all' ? page.items : page.items.filter((item) => item.kind === activeKind)
  }, [activeKind, page.items])
  const showAnime = (activeKind === 'all' || activeKind === 'anime') && animeItems.length > 0
  const best = results[0] ?? page.items[0]

  return (
    <FilScreenShell pageHeading={undefined}>
      <main className="mx-auto w-full max-w-[90rem]" data-consumit-search-screen>
        <section className="relative isolate overflow-hidden border-b border-[var(--fs-line)] px-5 py-16 sm:px-8 sm:py-20 lg:px-[50px] lg:py-24">
          {best?.backdropUrl ? <Image alt="" className="-z-20 object-cover opacity-35" fill priority sizes="100vw" src={best.backdropUrl} /> : null}
          <span aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(9,9,11,.98),rgba(9,9,11,.76)_58%,rgba(9,9,11,.42))]" />
          <div className="max-w-4xl">
            <h1 className="max-w-[13ch] text-balance font-display text-5xl leading-[0.95] tracking-[-0.03em] text-[var(--fs-ink)] sm:text-6xl lg:text-[5.25rem]">Find the thing that stays with you.</h1>
            <p className="mt-6 max-w-[62ch] text-sm leading-7 text-[var(--fs-secondary)] sm:text-base">Search real movies, series, and anime, explore the details, and choose what deserves tonight.</p>
            <form action="/search" className="relative mt-9 max-w-3xl" method="get" role="search">
              <label className="sr-only" htmlFor="explore-search">Search movies, series, and anime</label>
              <Search aria-hidden="true" className="absolute top-1/2 left-5 size-5 -translate-y-1/2 text-[var(--fs-muted)]" />
              <input className="h-16 w-full rounded-control border border-[var(--fs-field-border)] bg-[var(--fs-field)] pr-36 pl-14 text-base text-[var(--fs-ink)] outline-none placeholder:text-[var(--fs-muted)] focus-visible:border-[var(--fs-focus)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] sm:pr-40" defaultValue={initialQuery} id="explore-search" maxLength={100} name="q" placeholder="Try ‘Dune’ or ‘Severance’" type="search" />
              <Button className="absolute top-2 right-2 h-12" type="submit" variant="accent">Search</Button>
            </form>
            {queryTooShort ? <p className="mt-3 text-xs text-[var(--fs-accent)]" role="alert">Type at least two characters. Discovery titles are shown below.</p> : null}
          </div>
        </section>

        <div className="px-5 sm:px-8 lg:px-[50px]">
          {best ? (
            <section className="py-14 sm:py-16 lg:py-20" aria-labelledby="best-match-heading">
              <SectionHeading id="best-match-heading" title={initialQuery.length >= 2 ? `Best match for “${initialQuery}”` : 'A strong place to begin'} />
              <article className="relative isolate mt-8 min-h-[27rem] overflow-hidden rounded-card border border-[var(--fs-line)]">
                {best.backdropUrl ? <Image alt="" className="-z-20 object-cover" fill sizes="100vw" src={best.backdropUrl} /> : null}
                <span aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(9,9,11,.98)_0%,rgba(9,9,11,.87)_48%,rgba(9,9,11,.3)_100%)]" />
                <div className="flex flex-col justify-center p-6 sm:p-10 lg:p-14">
                  <h2 className="max-w-[13ch] font-display text-4xl leading-none tracking-[-0.025em] text-[var(--fs-ink)] sm:text-5xl">{best.title}</h2>
                  <p className="mt-4 text-sm text-[var(--fs-secondary)]">{titleMeta(best)}</p>
                  <p className="mt-6 max-w-[54ch] text-sm leading-7 text-[var(--fs-secondary)]">{best.overview || 'More information will be available soon.'}</p>
                  <div className="mt-7 flex flex-wrap gap-3">
                    <Link className={buttonVariants()} href={titleHref(best)}>View title <ArrowRight aria-hidden="true" /></Link>
                    <Link className={buttonVariants({ variant: 'secondary' })} href={watchHref(best)}><Play aria-hidden="true" /> Watch</Link>
                  </div>
                </div>
              </article>
            </section>
          ) : null}

          <section className="border-t border-[var(--fs-line)] py-14 sm:py-16 lg:py-20" id="results" aria-labelledby="results-heading">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <SectionHeading description={activeKind === 'anime' ? `${animeItems.length} AniList ${animeItems.length === 1 ? 'match' : 'matches'}` : `${results.length} real catalog ${results.length === 1 ? 'match' : 'matches'}`} id="results-heading" title={initialQuery.length >= 2 ? 'Search results' : 'Explore the catalog'} />
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filter results">
                {([['all', 'All'], ['movie', 'Movies'], ['series', 'Series'], ['anime', 'Anime']] as const).map(([value, label]) => <FilterChip key={value} onClick={() => setActiveKind(value)} selected={activeKind === value}>{label}</FilterChip>)}
              </div>
            </div>
            {activeKind === 'anime' ? null : (
              <div className="mt-9">
                {results.length > 0 ? <CatalogGrid items={results} /> : <EmptyState description="Try a different title, spelling, or switch back to all results." title="No titles found" />}
              </div>
            )}
          </section>

          {showAnime ? (
            <section className="border-t border-[var(--fs-line)] py-14 sm:py-16 lg:py-20" id="anime-results" aria-labelledby="anime-results-heading">
              <SectionHeading description={`Anime metadata by AniList · ${animeItems.length} ${animeItems.length === 1 ? 'match' : 'matches'}`} id="anime-results-heading" title="Anime" />
              <ul className="mt-9 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {animeItems.map((anime) => <AnimeSearchCard anime={anime} key={`anime:${anime.anilistId}`} />)}
              </ul>
            </section>
          ) : activeKind === 'anime' ? (
            <section className="border-t border-[var(--fs-line)] py-14 sm:py-16 lg:py-20" id="anime-results" aria-labelledby="anime-results-heading">
              <SectionHeading description="Anime metadata by AniList" id="anime-results-heading" title="Anime" />
              <div className="mt-9">
                <EmptyState description="Try a different title, spelling, or switch back to all results." title="No anime found" />
              </div>
            </section>
          ) : null}

        </div>
      </main>
    </FilScreenShell>
  )
}
