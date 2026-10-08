import type { CatalogKind, CatalogPage } from '@consumit/contracts'

import { FilScreenShell } from '../shared'

import { CatalogBrowseContent } from './catalog-browse-content'

type CatalogBrowseScreenProps = { current: CatalogPage; kind: CatalogKind; popular: CatalogPage }

export function CatalogBrowseScreen({ current, kind, popular }: CatalogBrowseScreenProps) {
  return (
    <FilScreenShell activeKindTab={kind === 'movie' ? 'movies' : 'series'} pageHeading={kind === 'movie' ? 'Movies' : 'Series'}>
      <CatalogBrowseContent current={current} currentYear={new Date().getUTCFullYear()} kind={kind} popular={popular} />
    </FilScreenShell>
  )
}
