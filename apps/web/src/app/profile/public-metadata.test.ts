import { describe, expect, it } from 'vitest'

import { metadata as archiveMetadata } from './[username]/[section]/page'
import { metadata as profileMetadata } from './[username]/page'

describe('public member page indexing', () => {
  it('keeps profiles and profile archives out of search indexing', () => {
    for (const metadata of [profileMetadata, archiveMetadata]) {
      expect(metadata.robots).toEqual({ follow: false, index: false })
    }
  })
})
