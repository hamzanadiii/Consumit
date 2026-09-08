import type { CatalogKind, CatalogPage } from '@consumit/contracts'

import { CatalogBrowseContent } from './catalog-browse-content'
import { CatalogStaleNotice } from './catalog-ui'
import { ScreenShell } from '../screens/screen-shell'

type CatalogBrowseScreenProps = { current: CatalogPage; kind: CatalogKind; popular: CatalogPage }

export function CatalogBrowseScreen({ current, kind, popular }: CatalogBrowseScreenProps) {
  const stale = current.meta.stale || popular.meta.stale
  return (
    <ScreenShell activeHref={kind === 'movie' ? '/movies' : '/series'}>
      {stale ? <CatalogStaleNotice meta={{ ...popular.meta, stale }} /> : null}
      <CatalogBrowseContent current={current} currentYear={new Date().getUTCFullYear()} kind={kind} popular={popular} />
    </ScreenShell>
  )
}
