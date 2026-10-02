import { describe, expect, it } from 'vitest'
import { createStaticProvider, sourceIdentity, validatedSources, type ProviderRegistration, type ProviderSource } from './index'

const ref = { kind: 'movie' as const, id: 1 }
const source: ProviderSource = { key: 'main', url: 'https://media.example/test.m3u8?token=1', type: 'hls', language: 'original', expiresAt: new Date(Date.now() + 3600000).toISOString(), headers: {}, subtitles: [] }
const registration: ProviderRegistration = { adapter: createStaticProvider('owned', [{ ref, sources: [source] }]), enabled: true, approvedRegions: ['US'], mediaHosts: ['media.example'], upstreamGroup: 'owned', concurrency: 2, requestsPerMinute: 30, mediaKinds: ['movie'] }
describe('provider contract', () => {
  it('resolves exact episodes without guessing another season or episode', async () => {
    const episode = { kind: 'series' as const, id: 9, season: 2, episode: 3 }
    const adapter = createStaticProvider('owned', [{ ref: episode, sources: [source] }])
    expect(await adapter.resolve({ ref: episode, region: 'US', audioLanguage: 'en' }, new AbortController().signal)).toMatchObject({ sources: [source] })
    expect(await adapter.resolve({ ref: { ...episode, episode: 4 }, region: 'US', audioLanguage: 'en' }, new AbortController().signal)).toMatchObject({ sources: [] })
    expect(() => createStaticProvider('owned', [{ ref: { kind: 'series', id: 9 }, sources: [source] }])).toThrow()
  })
  it('resolves configured titles, respects cancellation, and handles absent titles', async () => {
    expect(await registration.adapter.resolve({ ref, region: 'US', audioLanguage: 'en' }, new AbortController().signal)).toMatchObject({ ok: true, sources: [source] })
    expect(await registration.adapter.resolve({ ref: { ...ref, id: 2 }, region: 'US', audioLanguage: 'en' }, new AbortController().signal)).toMatchObject({ sources: [] })
    expect(await registration.adapter.resolve({ ref, region: 'US', audioLanguage: 'en' }, AbortSignal.abort())).toMatchObject({ code: 'cancelled' })
  })
  it('rejects malformed, expired, off-allowlist, and header-locked direct sources', () => {
    for (const bad of [{ ...source, url: 'https://evil.example/media' }, { ...source, expiresAt: new Date(0).toISOString() }, { ...source, headers: { Cookie: 'secret' } }, { ...source, type: 'iframe' }]) {
      expect(validatedSources({ ok: true, sources: [bad] }, registration)).toEqual([])
    }
    expect(validatedSources({ ok: true, sources: [source, source] }, registration)).toHaveLength(1)
  })
  it('rejects relay-wrapped sources even on configured hosts', () => {
    for (const url of ['https://media.example/proxy?url=https%3A%2F%2Fupstream.example%2Fv.m3u8', 'https://media.example/v.m3u8?target=https%3A%2F%2Fupstream.example%2Fv.m3u8']) {
      expect(validatedSources({ ok: true, sources: [{ ...source, url }] }, registration)).toEqual([])
    }
  })
  it('identifies renditions by canonical content and key rather than access URLs', () => {
    expect(sourceIdentity('owned', ref, 'main')).toBe(sourceIdentity('owned', ref, 'main'))
    expect(sourceIdentity('owned', { kind: 'series', id: 1, season: 1, episode: 2 }, 'main')).not.toBe(sourceIdentity('owned', { kind: 'series', id: 1, season: 1, episode: 1 }, 'main'))
  })
})
