'use client'

import type { AnimeTitleSummary, CatalogTitleSummary } from '@consumit/contracts'
import { Clock, Flame } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import type { HeroDetail } from '../catalog/catalog-ui'
import { AnimeTitleRail } from './anime-title-rail'
import { ContinueRail } from './continue-rail'
import { FilScreenHeroRotator } from './hero-rotator'
import {
  FilScreenShell,
  SIDEBAR_STORAGE_KEY,
  THEME_STORAGE_KEY,
  THEME_STYLE,
  CONTRACT_HTML,
  type FilScreenTheme,
} from './filscreen-shell'
import { TitleRail } from './title-rail'

export {
  FilScreenShell,
  SIDEBAR_STORAGE_KEY,
  THEME_STORAGE_KEY,
  THEME_STYLE,
  CONTRACT_HTML,
  type FilScreenTheme,
}

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
      <FilScreenHeroRotator hero={hero} spotlight={spotlight} />

      <section aria-labelledby="filscreen-continue-title" className="mt-8">
        <ContinueRail />
      </section>

      {trendingMovies && trendingMovies.length > 0 ? (
        <TitleRail
          icon={<Flame aria-hidden="true" className="size-4 text-[var(--fs-flame)]" />}
          id="filscreen-trending-movies"
          items={trendingMovies}
          title="Trending Movies"
          viewAllHref="/movies"
        />
      ) : null}

      {trendingSeries && trendingSeries.length > 0 ? (
        <TitleRail
          icon={<Flame aria-hidden="true" className="size-4 text-[var(--fs-flame)]" />}
          id="filscreen-trending-series"
          items={trendingSeries}
          title="Trending Series"
          viewAllHref="/series"
        />
      ) : null}

      {trendingAnime && trendingAnime.length > 0 ? (
        <AnimeTitleRail
          icon={<Flame aria-hidden="true" className="size-4 text-[var(--fs-flame)]" />}
          id="filscreen-trending-anime"
          items={trendingAnime}
          title="Trending Anime"
          viewAllHref="/anime"
        />
      ) : null}

      {topRatedMovies && topRatedMovies.length > 0 ? (
        <TitleRail
          id="filscreen-top-rated-movies"
          items={topRatedMovies}
          title="Top Rated Movies"
          viewAllHref="/movies"
        />
      ) : null}

      {topRatedSeries && topRatedSeries.length > 0 ? (
        <TitleRail
          id="filscreen-top-rated-series"
          items={topRatedSeries}
          title="Top Rated Series"
          viewAllHref="/series"
        />
      ) : null}

      {awardWinningShows && awardWinningShows.length > 0 ? (
        <TitleRail
          id="filscreen-award-winning"
          items={awardWinningShows}
          title="Award Winning Shows"
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

      <section aria-labelledby="filscreen-circle-title" className="mt-8">
        <h2 className="font-display text-2xl tracking-[-0.02em]" id="filscreen-circle-title">Circle activity</h2>
        <div className="mt-3 rounded-[16px] border border-[var(--fs-field-border)] bg-[var(--fs-field)] p-4">
          <p className="text-sm leading-6 text-[var(--fs-secondary)]">No circle activity yet. Follow members to see what they are watching.</p>
          <Link className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-[var(--fs-accent-soft)] px-4 text-sm font-bold text-[var(--fs-ink)] outline-none hover:bg-[var(--fs-accent-soft-hover)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href="/friends">
            Find members
          </Link>
        </div>
      </section>

      <p className="mt-6 flex items-center gap-2 text-xs text-[var(--fs-muted)]">
        <Clock aria-hidden="true" className="size-3.5" />
        Progress stays with you when sources change.
      </p>
    </FilScreenShell>
  )
}
