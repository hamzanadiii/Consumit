import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createProviderConfigStore, applyOverridesInPlace } from './provider-config.ts'
import { createStaticProvider, type ProviderRegistration } from '@consumit/provider-sdk'

describe('provider setting retirement', () => {
  it('persists a role across reloads and restores the configured role on reset', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'consumit-provider-role-'))
    try {
      const path = join(directory, 'settings.json')
      const provider: ProviderRegistration = { adapter: createStaticProvider('fixture', []), enabled: true, role: 'both', approvedRegions: ['US'], mediaHosts: [], upstreamGroup: 'fixture', mediaKinds: ['movie'], concurrency: 1, requestsPerMinute: 30 }
      const store = createProviderConfigStore(path)
      await store.setOverride('fixture', { role: 'audio', deliveryMode: 'relay' })
      const reloaded = createProviderConfigStore(path)
      applyOverridesInPlace([provider], await reloaded.getAll())
      expect(provider.role).toBe('audio')
      expect(provider.deliveryMode).toBe('relay')
      await reloaded.removeOverride('fixture')
      applyOverridesInPlace([provider], await reloaded.getAll())
      expect(provider.role).toBe('both')
      expect(provider.deliveryMode).toBe('direct')
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
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
