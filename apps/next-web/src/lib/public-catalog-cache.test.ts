import { afterEach, describe, expect, it, vi } from 'vitest'

import { publicCatalogFetchOptions, PUBLIC_CATALOG_REVALIDATE_SECONDS } from './public-catalog-cache'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('public catalog server cache', () => {
  it('sets only a bounded data-cache policy for public metadata reads', () => {
    expect(PUBLIC_CATALOG_REVALIDATE_SECONDS).toBe(300)
    expect(publicCatalogFetchOptions()).toEqual({ next: { revalidate: 300 } })
  })

  it('returns a fresh options object so callers cannot mutate policy for other requests', () => {
    const first = publicCatalogFetchOptions()
    first.next.revalidate = 1

    expect(publicCatalogFetchOptions()).toEqual({ next: { revalidate: 300 } })
  })
})
