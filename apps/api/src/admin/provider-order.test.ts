import { describe, expect, it } from 'vitest'
import { createStaticProvider, type ProviderRegistration } from '@consumit/provider-sdk'
import { orderedProviderIds } from './provider-config.ts'

function provider(id: string, kind: 'movie' | 'series' | 'anime', priority: number): ProviderRegistration {
  return { adapter: createStaticProvider(id, []), enabled: true, approvedRegions: ['US'], mediaHosts: [], upstreamGroup: id, concurrency: 1, requestsPerMinute: 30, priority, mediaKinds: [kind] }
}

describe('saved provider order', () => {
  it('honors saved order, appends newcomers, and filters by kind', () => {
    const direct = provider('direct', 'movie', 0)
    const backup = provider('backup', 'movie', 100)
    const newcomer = provider('new', 'movie', 50)
    expect(orderedProviderIds([backup, direct], {}, 'movie')).toEqual(['backup', 'direct'])
    expect(orderedProviderIds([backup, direct, newcomer], { backup: { order: { movie: 0 } }, direct: { order: { movie: 1 } } }, 'movie')).toEqual(['backup', 'direct', 'new'])
    direct.enabled = false
    expect(orderedProviderIds([backup, direct, newcomer], { backup: { order: { movie: 0 } }, direct: { order: { movie: 1 } } }, 'movie')).toEqual(['backup', 'direct', 'new'])
    expect(orderedProviderIds([provider('anime', 'anime', 0), backup], {}, 'anime')).toEqual(['anime'])
  })
})
