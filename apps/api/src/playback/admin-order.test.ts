import { describe, expect, it } from 'vitest'
import { createStaticProvider, type ProviderRegistration, type ProviderSource } from '@consumit/provider-sdk'
import { createPlayback } from './playback.ts'
import { createMemoryPlaybackStore } from './state.ts'
import { createPlaybackRelay } from './relay.ts'

const ref = { kind: 'movie' as const, id: 1 }
const input = { ref, capabilities: { hls: true, dash: false, native: true, nativeHls: false }, audioLanguage: 'en', preferences: { providerOrder: ['direct-b', 'direct-a'] } }
const source: ProviderSource = { key: 'main', url: 'https://media.example/main.m3u8', type: 'hls', language: 'original', expiresAt: '2099-01-01T00:00:00.000Z', headers: {}, subtitles: [] }
const signal = new AbortController().signal
function setup(order = ['relay-a', 'direct-a', 'relay-b', 'direct-b']) {
  const calls: string[] = []
  const providers: ProviderRegistration[] = ['direct-a', 'direct-b', 'relay-a', 'relay-b'].map(id => {
    const adapter = createStaticProvider(id, [{ ref, sources: [source] }])
    return {
      adapter: { ...adapter, async resolve(input, signal) { calls.push(id); return adapter.resolve(input, signal) } },
      deliveryMode: id.startsWith('relay') ? 'relay' : 'direct', enabled: true, approvedRegions: ['US'], mediaKinds: ['movie'],
      mediaHosts: ['media.example'], upstreamGroup: id.endsWith('a') ? 'shared-a' : 'shared-b', concurrency: 2, requestsPerMinute: 100,
    }
  })
  const store = createMemoryPlaybackStore()
  const relay = createPlaybackRelay({ origin: 'https://edge.example', secret: 'fixture-secret-over-thirty-two-characters', providers: { 'relay-a': ['media.example'], 'relay-b': ['media.example'] } })
  return { providers, store, calls, playback: createPlayback({ providers, store, region: 'US', relay, relayOrigin: 'https://watch.example', providerOrders: { movie: order, series: [], anime: [] } }) }
}

describe('Admin playback order across delivery modes', () => {
  it('uses the same mixed order for the roster, legacy startup and recovery, ignoring personal order', async () => {
    const { playback, store } = setup()
    try {
      expect((await playback.listProviders(input, signal)).map(provider => provider.id)).toEqual(['relay-a', 'direct-a', 'relay-b', 'direct-b'])
      let session = await playback.resolve('owner', input, signal)
      const id = session.id
      expect(session.source).toMatchObject({ providerId: 'relay-a', delivery: 'relay' })
      const renewed = await playback.recover('owner', id, { sourceId: session.source.id, reason: 'expired' }, true, signal)
      expect(renewed.source.providerId).toBe('relay-a')
      session = renewed
      for (const providerId of ['direct-a', 'relay-b', 'direct-b']) {
        session = await playback.recover('owner', id, { sourceId: session.source.id, reason: 'network' }, false, signal)
        expect(session).toMatchObject({ id, ref, source: { providerId } })
      }
      await expect(playback.recover('owner', id, { sourceId: session.source.id, reason: 'network' }, false, signal)).rejects.toMatchObject({ code: 'PLAYBACK_UNAVAILABLE' })
    } finally { await store.close() }
  })
  it('visits the mixed Admin roster once through attempt recovery and stops at exhaustion', async () => {
    const { playback, store, calls } = setup()
    try {
      let attempt = await playback.beginAttempt!('owner', input, signal)
      for (const providerId of ['relay-a', 'direct-a', 'relay-b', 'direct-b']) {
        expect(attempt).toMatchObject({ status: 'ready', session: { ref, source: { providerId } } })
        if (attempt.status !== 'ready') throw new Error('Expected ready fixture')
        attempt = await playback.beginAttempt!('owner', input, signal, attempt.session.id, { sourceId: attempt.session.source.id, reason: 'network' })
      }
      expect(attempt).toMatchObject({ status: 'exhausted', tried: 4, total: 4 })
      expect(calls).toEqual(['relay-a', 'direct-a', 'relay-b', 'direct-b'])
    } finally { await store.close() }
  })
  it('skips disabled and unapproved rows without promoting Direct ahead of an eligible Relay', async () => {
    const { playback, providers, store } = setup(['relay-a', 'direct-a', 'relay-b', 'direct-b'])
    try {
      providers[0]!.enabled = false
      providers[2]!.adapter = createStaticProvider('unapproved', [{ ref, sources: [source] }])
      expect((await playback.listProviders(input, signal)).map(provider => provider.id)).toEqual(['relay-b', 'direct-b'])
      expect((await playback.resolve('owner', input, signal)).source.providerId).toBe('relay-b')
    } finally { await store.close() }
  })
  it('keeps a manual choice and resumes Admin order when that choice fails', async () => {
    const { playback, store } = setup()
    try {
      const initial = await playback.resolve('owner', input, signal)
      const manual = await playback.switchProvider('owner', initial.id, 'direct-b', signal)
      expect(manual.source.providerId).toBe('direct-b')
      const recovered = await playback.recover('owner', manual.id, { sourceId: manual.source.id, reason: 'network' }, false, signal)
      expect(recovered).toMatchObject({ id: initial.id, ref, source: { providerId: 'relay-a', delivery: 'relay' } })
    } finally { await store.close() }
  })
})
