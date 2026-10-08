'use client'

import type { AnimeTitleSummary, CatalogTitleSummary } from '@consumit/contracts'
import { Clock, Flame } from 'lucide-react'
import type { ReactNode } from 'react'

import type { HeroDetail } from '../catalog/catalog-ui'
import { AnimeTitleRail } from './anime-title-rail'
import { ContinueRail } from './continue-rail'
import { FilScreenHeroRotator } from './hero-rotator'
import { FilScreenShell } from './filscreen-shell'
import { TitleRail } from '../shared/title-rail'
import { AdSlot } from '../shared/ad-slot'

export type FilScreenHomeProps = {
  awardWinningShows?: readonly CatalogTitleSummary[] | undefined
  hero: HeroDetail
  mindfuckMovies?: readonly CatalogTitleSummary[] | undefined
  popular?: readonly CatalogTitleSummary[] | undefined
  serviceRail?: ReactNode | undefined
  spotlight?: readonly HeroDetail[] | undefined
  topRatedMovies?: readonly CatalogTitleSummary[] | undefined
  topRatedSeries?: readonly CatalogTitleSummary[] | undefined
  trending?: readonly CatalogTitleSummary[] | undefined
  trendingAnime?: readonly AnimeTitleSummary[] | undefined
  trendingMovies?: readonly CatalogTitleSummary[] | undefined
  trendingSeries?: readonly CatalogTitleSummary[] | undefined
}

export function FilScreenHome({
  awardWinningShows = [],
  hero,
  mindfuckMovies = [],
  serviceRail,
  spotlight,
  topRatedMovies = [],
  topRatedSeries = [],
  trendingAnime = [],
  trendingMovies = [],
  trendingSeries = [],
}: FilScreenHomeProps) {
  return (
    <FilScreenShell activeKindTab="new" pageHeading="Consumit home">
      <div className="next-home-feature"><FilScreenHeroRotator hero={hero} spotlight={spotlight} /></div>

      <section aria-labelledby="filscreen-continue-title" className="next-continue-section">
        <ContinueRail />
      </section>

      <div className="my-8 sm:my-10"><AdSlot placement="home" position="early" /></div>

      {trendingMovies && trendingMovies.length > 0 ? (
        <TitleRail
          icon={<Flame aria-hidden="true" className="size-4 text-[var(--fs-flame)]" />}
          id="filscreen-trending-movies"
          items={trendingMovies}
          title="Movies worth your evening"
          viewAllHref="/movies"
        />
      ) : null}

      {trendingSeries && trendingSeries.length > 0 ? (
        <TitleRail
          icon={<Flame aria-hidden="true" className="size-4 text-[var(--fs-flame)]" />}
          id="filscreen-trending-series"
          items={trendingSeries}
          title="Find your next series"
          viewAllHref="/series"
        />
      ) : null}

      {trendingSeries && trendingSeries.length > 0 ? (
        <div className="my-8 sm:my-10"><AdSlot placement="home" /></div>
      ) : null}

      {trendingAnime && trendingAnime.length > 0 ? (
        <AnimeTitleRail
          icon={<Flame aria-hidden="true" className="size-4 text-[var(--fs-flame)]" />}
          id="filscreen-trending-anime"
          items={trendingAnime}
          title="A world of anime"
          viewAllHref="/anime"
        />
      ) : null}

      {topRatedMovies && topRatedMovies.length > 0 ? (
        <TitleRail
          id="filscreen-top-rated-movies"
          items={topRatedMovies}
          title="The ones that stay with you"
          viewAllHref="/movies"
        />
      ) : null}

      {topRatedSeries && topRatedSeries.length > 0 ? (
        <TitleRail
          id="filscreen-top-rated-series"
          items={topRatedSeries}
          title="Series, exceptionally told"
          viewAllHref="/series"
        />
      ) : null}

      {topRatedSeries && topRatedSeries.length > 0 ? (
        <div className="my-8 sm:my-10"><AdSlot placement="home" position="late" /></div>
      ) : null}

      {awardWinningShows && awardWinningShows.length > 0 ? (
        <TitleRail
          id="filscreen-award-winning"
          items={awardWinningShows}
          title="Award-winning stories"
        />
      ) : null}

      {mindfuckMovies && mindfuckMovies.length > 0 ? (
        <TitleRail
          id="filscreen-mindfuck-movies"
          items={mindfuckMovies}
          title="Mindf*ck Movies"
        />
      ) : null}

      {serviceRail}

      <p className="mt-6 flex items-center gap-2 text-xs text-[var(--fs-muted)]">
        <Clock aria-hidden="true" className="size-3.5" />
        Progress stays with you when sources change.
      </p>
    </FilScreenShell>
  )
}
