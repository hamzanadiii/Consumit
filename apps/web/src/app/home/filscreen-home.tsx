'use client'

import type { AnimeTitleSummary, CatalogTitleSummary, PublicListDiscoveryItem } from '@consumit/contracts'
import { Button, buttonVariants } from '@consumit/ui'
import { Clock, Flame } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState, useTransition } from 'react'

import type { HeroDetail } from '../catalog/catalog-ui'
import { AnimeTitleRail } from './anime-title-rail'
import { ContinueRail } from './continue-rail'
import { NewEpisodesRail } from './new-episodes-rail'
import { BecauseYouWatchedRail } from './because-you-watched-rail'
import { CommunityCards } from '../experience/community-cards'
import { FilScreenHeroRotator } from './hero-rotator'
import { FilScreenShell } from './filscreen-shell'
import { TitleRail } from '../shared/title-rail'
import { PublicListRail } from './public-list-rail'

type HomeListCard = PublicListDiscoveryItem & { artworkSources: readonly (string | undefined)[] }
type HomeCatalogState = 'empty' | 'unavailable'

function HomeCatalogNotice({ state }: { state: HomeCatalogState }) {
  const router = useRouter()
  const [refreshing, startRefresh] = useTransition()
  const wrapper = 'mx-auto mb-6 grid w-full max-w-[90rem] gap-4 rounded-card border border-[var(--fs-line)] bg-[var(--fs-field)] px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6'
  const actionClass = `${buttonVariants({ variant: 'secondary' })} min-h-[44px]`

  if (state === 'empty') {
    return (
      <section aria-labelledby="home-recommendations-empty-title" className={wrapper} role="status">
        <div>
          <h2 className="font-display text-xl text-[var(--fs-ink)]" id="home-recommendations-empty-title">No fresh recommendations are available yet.</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--fs-secondary)]">Try a category to find your next watch.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className={actionClass} href="/movies">Browse movies</Link>
          <Link className={actionClass} href="/series">Browse series</Link>
          <Link className={actionClass} href="/anime">Browse anime</Link>
        </div>
      </section>
    )
  }

  return (
    <section aria-busy={refreshing} aria-labelledby="home-recommendations-error-title" className={wrapper}>
      <div aria-labelledby="home-recommendations-error-title" role="alert">
        <h2 className="font-display text-xl text-[var(--fs-ink)]" id="home-recommendations-error-title">Some recommendations couldn’t load.</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--fs-secondary)]">The rest of Home is ready. Retry to check for missing shelves.</p>
      </div>
      <Button className="min-h-[44px]" disabled={refreshing} onClick={() => startRefresh(() => router.refresh())} size="sm" variant="primary">
        {refreshing ? 'Refreshing…' : 'Retry recommendations'}
      </Button>
    </section>
  )
}

export type FilScreenHomeProps = {
  awardWinningShows?: readonly CatalogTitleSummary[] | undefined
  catalogState?: HomeCatalogState | undefined
  hero: HeroDetail
  mindfuckMovies?: readonly CatalogTitleSummary[] | undefined
  newFromNetworkLists?: readonly HomeListCard[] | undefined
  popularLists?: readonly HomeListCard[] | undefined
  popular?: readonly CatalogTitleSummary[] | undefined
  serviceRail?: ReactNode | undefined
  spotlight?: readonly HeroDetail[] | undefined
  topRatedMovies?: readonly CatalogTitleSummary[] | undefined
  topRatedSeries?: readonly CatalogTitleSummary[] | undefined
  trending?: readonly CatalogTitleSummary[] | undefined
  trendingAnime?: readonly AnimeTitleSummary[] | undefined
  trendingMovies?: readonly CatalogTitleSummary[] | undefined
  trendingSeries?: readonly CatalogTitleSummary[] | undefined
  trendingWithMembers?: readonly CatalogTitleSummary[] | undefined
}

export function FilScreenHome({
  awardWinningShows = [],
  catalogState,
  hero,
  mindfuckMovies = [],
  newFromNetworkLists = [],
  popularLists = [],
  serviceRail,
  spotlight,
  topRatedMovies = [],
  topRatedSeries = [],
  trendingAnime = [],
  trendingMovies = [],
  trendingSeries = [],
  trendingWithMembers = [],
}: FilScreenHomeProps) {
  const mainRef = useRef<HTMLElement>(null)
  const previousCatalogState = useRef(catalogState)
  const [catalogAnnouncement, setCatalogAnnouncement] = useState('')

  useEffect(() => {
    if (previousCatalogState.current === 'unavailable' && catalogState !== 'unavailable') {
      mainRef.current?.focus()
      setCatalogAnnouncement('Home recommendations refreshed.')
    }

    previousCatalogState.current = catalogState
  }, [catalogState])

  return (
    <FilScreenShell activeKindTab="new" pageHeading={undefined}>
      <main className="min-w-0" id="consumit-main-content" ref={mainRef} tabIndex={-1}>
      <h1 className="sr-only">Discover your next watch</h1>
      {catalogAnnouncement && catalogState === undefined ? <p className="sr-only" role="status">{catalogAnnouncement}</p> : null}
      {catalogState ? <HomeCatalogNotice state={catalogState} /> : null}
      <FilScreenHeroRotator hero={hero} spotlight={spotlight} />

      <ContinueRail />

      <NewEpisodesRail />
      <BecauseYouWatchedRail />
      {newFromNetworkLists.length ? <PublicListRail id="filscreen-new-from-network" items={newFromNetworkLists} title="New from your network" /> : null}
      {popularLists.length ? <PublicListRail id="filscreen-popular-lists" items={popularLists} title="Popular with members" /> : null}
      {trendingWithMembers.length > 0 ? <TitleRail
        description="A shared pulse from members who opted in."
        icon={<Flame aria-hidden="true" className="size-4 text-[var(--fs-flame)]" />}
        id="filscreen-trending-with-members"
        items={trendingWithMembers}
        title="Trending with members"
      /> : null}
      <CommunityCards dismissible />

      {trendingMovies && trendingMovies.length > 0 ? (
        <TitleRail
          icon={<Flame aria-hidden="true" className="size-4 text-[var(--fs-flame)]" />}
          id="filscreen-trending-movies"
          items={trendingMovies}
          title="Trending Movies"
          viewAllHref="/movies?feed=trending"
        />
      ) : null}

      {trendingSeries && trendingSeries.length > 0 ? (
        <TitleRail
          icon={<Flame aria-hidden="true" className="size-4 text-[var(--fs-flame)]" />}
          id="filscreen-trending-series"
          items={trendingSeries}
          title="Trending Series"
          viewAllHref="/series?feed=trending"
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
          viewAllHref="/movies?feed=top-rated"
        />
      ) : null}

      {topRatedSeries && topRatedSeries.length > 0 ? (
        <TitleRail
          id="filscreen-top-rated-series"
          items={topRatedSeries}
          title="Top Rated Series"
          viewAllHref="/series?feed=top-rated"
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

      <p className="mt-6 flex items-center gap-2 text-xs text-[var(--fs-muted)]">
        <Clock aria-hidden="true" className="size-3.5" />
        Progress stays with you when sources change.
      </p>
      </main>
    </FilScreenShell>
  )
}
