import { describe, expect, it } from 'vitest'
import { createStaticProvider, type ProviderRegistration } from '@consumit/provider-sdk'
import { createCapabilityRegistry } from './delivery.ts'
import { createMemoryPlaybackStore } from './state.ts'
import { configurationDigest, loadPlaybackCertification } from './certification.ts'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const provider: ProviderRegistration = { adapter: createStaticProvider('owned', []), enabled: true, approvedRegions: ['US'], mediaHosts: ['media.example'], upstreamGroup: 'owned', concurrency: 2, requestsPerMinute: 30 }

describe('playback certification artifact', () => {
  it('imports matching direct evidence and returns only certified providers', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'consumit-cert-'))
    const config = '[{"id":"owned"}]\n'
    const configPath = join(dir, 'providers.json'); const path = join(dir, 'cert.json')
    await writeFile(configPath, config)
    await writeFile(path, JSON.stringify({ version: 1, configurationSha256: configurationDigest(config), generatedAt: '2026-09-12T00:00:00.000Z', expiresAt: '2026-09-14T00:00:00.000Z', region: 'US', providers: [{ id: 'owned', checks: [{ name: 'expiry', pass: true }], rows: [{ providerId: 'owned', host: 'media.example', kind: 'mp4', engine: 'native', capability: 'direct', confidence: 1, probes: 5, successes: 5, streak: 5, updatedAt: 1 }] }] }))
    const registry = createCapabilityRegistry(createMemoryPlaybackStore())
    await expect(loadPlaybackCertification({ path, mediaConfigPath: configPath, providers: [provider], registry, region: 'US', now: () => Date.parse('2026-09-13T00:00:00.000Z') })).resolves.toEqual([provider])
    await expect(registry.get('media.example', 'mp4', 'native')).resolves.toMatchObject({ capability: 'direct' })
  })

  it('rejects expired, mismatched, and unauthorized evidence', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'consumit-cert-'))
    const configPath = join(dir, 'providers.json'); const path = join(dir, 'cert.json')
    await writeFile(configPath, '[]')
    const base = { version: 1, configurationSha256: configurationDigest('different'), generatedAt: '2026-09-12T00:00:00.000Z', expiresAt: '2026-09-14T00:00:00.000Z', region: 'US', providers: [{ id: 'owned', checks: [{ name: 'expiry', pass: true }], rows: [{ providerId: 'owned', host: 'evil.example', kind: 'mp4', engine: 'native', capability: 'direct', confidence: 1, probes: 5, successes: 5, streak: 5, updatedAt: 1 }] }] }
    await writeFile(path, JSON.stringify(base))
    const registry = createCapabilityRegistry(createMemoryPlaybackStore())
    await expect(loadPlaybackCertification({ path, mediaConfigPath: configPath, providers: [provider], registry, region: 'US' })).rejects.toThrow('does not match')
    await writeFile(path, JSON.stringify({ ...base, configurationSha256: configurationDigest('[]') }))
    await expect(loadPlaybackCertification({ path, mediaConfigPath: configPath, providers: [provider], registry, region: 'US', now: () => Date.parse('2026-09-15T00:00:00.000Z') })).rejects.toThrow('expired')
  })
})
