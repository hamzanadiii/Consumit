import { watchHref, type CatalogKind, type CatalogPage, type CatalogTitleSummary } from '@consumit/contracts'
import { Play } from 'lucide-react'

import { buttonVariants, TitleMasthead } from '@consumit/ui'

import { deterministicTaste } from '@/lib/catalog-registry'

import { CatalogShelf, CatalogStaleNotice, titleMeta } from './catalog-ui'
import { ScreenShell } from '../screens/screen-shell'

type CatalogBrowseScreenProps = {
  current: CatalogPage
  hero: CatalogTitleSummary
  kind: CatalogKind
  popular: CatalogPage
  topRated: CatalogPage
}

export function CatalogBrowseScreen({ current, hero, kind, popular, topRated }: CatalogBrowseScreenProps) {
  const isMovie = kind === 'movie'
  const stale = current.meta.stale || popular.meta.stale || topRated.meta.stale
  return (
    <ScreenShell activeHref={isMovie ? '/movies' : '/series'}>
      {stale ? <CatalogStaleNotice meta={{ ...popular.meta, stale }} /> : null}
      <main className="mx-auto w-full max-w-[90rem]">
        <h1 className="sr-only">Browse {isMovie ? 'movies' : 'series'}</h1>
        <TitleMasthead
          actions={<a className={buttonVariants()} href={watchHref(hero)}><Play aria-hidden="true" /> Watch</a>}
          backgroundSrc={hero.backdropUrl ?? undefined}
          className="rounded-none border-x-0 border-t-0 px-5 py-14 sm:px-8 lg:min-h-[34rem] lg:px-[62px] lg:py-20"
          metadata={titleMeta(hero)}
          synopsis={hero.overview || 'More information will be available soon.'}
          tasteReason="Selected from your Taste Match and the people you trust."
          tasteScore={deterministicTaste(hero)}
          title={hero.title}
        />
        <div className="px-5 sm:px-8 lg:px-[62px]">
          <CatalogShelf description={isMovie ? 'In cinemas and newly released for the US market' : 'Series currently airing'} id="current-catalog" items={current.items} title={isMovie ? 'Now playing' : 'On air'} />
          <CatalogShelf description="What viewers are discovering right now" id="popular-catalog" items={popular.items} title="Popular now" />
          <CatalogShelf description="Sustained acclaim across the catalog" id="top-rated-catalog" items={topRated.items} title="Top rated" />
        </div>
      </main>
    </ScreenShell>
  )
}
