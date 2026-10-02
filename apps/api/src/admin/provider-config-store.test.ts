import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createProviderConfigStore } from './provider-config.ts'

describe('provider setting retirement', () => {
  it('drops obsolete settings while preserving deletion, order, and operator limits', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'consumit-provider-settings-'))
    try {
      const path = join(directory, 'settings.json')
      await writeFile(path, JSON.stringify({ fixture: { proxy: true, deliveryMode: 'proxy-required', removed: true, enabled: false, order: { movie: 2 }, concurrency: 1 } }))
      const store = createProviderConfigStore(path)
      expect(await store.getOverride('fixture')).toEqual({ removed: true, enabled: false, order: { movie: 2 }, concurrency: 1 })
      await store.setOverride('fixture', { requestsPerMinute: 20 })
      expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ fixture: { removed: true, enabled: false, order: { movie: 2 }, concurrency: 1, requestsPerMinute: 20 } })
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
})
