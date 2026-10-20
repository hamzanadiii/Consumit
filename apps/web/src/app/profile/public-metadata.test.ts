import { describe, expect, it } from 'vitest'

import { metadata as listMetadata } from '../lists/[slug]/page'
import { metadata as archiveMetadata } from './[username]/[section]/page'
import { metadata as profileMetadata } from './[username]/page'

describe('public member page indexing', () => {
  it('keeps profiles, profile archives, and public lists out of search indexing', () => {
    for (const metadata of [profileMetadata, archiveMetadata, listMetadata]) {
      expect(metadata.robots).toEqual({ follow: false, index: false })
    }
  })
})
