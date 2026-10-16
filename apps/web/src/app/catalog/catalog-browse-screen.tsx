import type { CatalogKind, CatalogPage } from '@consumit/contracts'
import type { BrowseCatalogFeed } from '@/lib/catalog-browser'

import { FilScreenShell } from '../shared'

import { CatalogBrowseContent } from './catalog-browse-content'

type CatalogBrowseScreenProps = { current: CatalogPage; initialFeed?: BrowseCatalogFeed | undefined; kind: CatalogKind; popular: CatalogPage }

export function CatalogBrowseScreen({ current, initialFeed = 'popular', kind, popular }: CatalogBrowseScreenProps) {
  return (
    <FilScreenShell activeKindTab={kind === 'movie' ? 'movies' : 'series'} pageHeading={kind === 'movie' ? 'Movies' : 'Series'}>
      <CatalogBrowseContent current={current} currentYear={new Date().getUTCFullYear()} initialFeed={initialFeed} key={`${kind}:${initialFeed}`} kind={kind} popular={popular} />
    </FilScreenShell>
  )
}
