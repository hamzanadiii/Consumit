import type { CatalogKind, CatalogPage } from '@consumit/contracts'
import type { BrowseCatalogFeed } from '@/lib/catalog-browser'

import { FilScreenShell } from '../shared'

import { CatalogBrowseContent } from './catalog-browse-content'

type CatalogBrowseScreenProps = { current: CatalogPage; initialFeed?: BrowseCatalogFeed | undefined; initialGenre?: string | undefined; initialYear?: string | undefined; kind: CatalogKind; popular: CatalogPage }

export function CatalogBrowseScreen({ current, initialFeed = 'popular', initialGenre, initialYear, kind, popular }: CatalogBrowseScreenProps) {
  return (
    <FilScreenShell activeKindTab={kind === 'movie' ? 'movies' : 'series'} pageHeading={undefined}>
      <CatalogBrowseContent current={current} currentYear={new Date().getUTCFullYear()} initialFeed={initialFeed} initialGenre={initialGenre} initialYear={initialYear} key={`${kind}:${initialFeed}:${initialGenre ?? ''}:${initialYear ?? ''}`} kind={kind} popular={popular} />
    </FilScreenShell>
  )
}
