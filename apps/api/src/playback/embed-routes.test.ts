import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import { createStaticProvider, type ProviderRegistration, type ProviderSource } from '@consumit/provider-sdk'
import { createMemoryPlaybackStore } from './state.ts'
import { createPlayback } from './playback.ts'
import { registerEmbedRoutes } from './embed-routes.ts'

const source: ProviderSource = {
  key: 'main', url: 'https://media.example.com/master.m3u8', type: 'hls', language: 'original',
  expiresAt: '2099-01-01T00:00:00.000Z', headers: { referer: 'https://provider.example.com/' }, subtitles: [],
}

describe('public embed resolution', () => {
  it('returns one signed proxy grant without relying on Referer or double wrapping', async () => {
    const provider: ProviderRegistration = {
      adapter: createStaticProvider('primary', [{ ref: { kind: 'movie', id: 1 }, sources: [source] }]),
      enabled: true, approvedRegions: ['US'], mediaHosts: ['media.example.com'], upstreamGroup: 'primary',
      concurrency: 2, requestsPerMinute: 30, proxy: true, mediaKinds: ['movie'],
    }
    const store = createMemoryPlaybackStore()
    const workerUrl = 'https://proxy.example.com'
    const hmacSecret = 'test-secret-long-enough-for-hmac-validation'
    const app = Fastify()
    registerEmbedRoutes(app, { playback: createPlayback({ providers: [provider], store, region: 'US', workerUrl, hmacSecret }), workerUrl, hmacSecret, providers: [provider] })
    try {
      const response = await app.inject({ method: 'GET', url: '/v1/embed/movie/1' })
      expect(response.statusCode).toBe(200)
      const url = new URL(response.json().sources[0].url)
      expect(url.origin).toBe(workerUrl)
      expect(url.pathname).toBe('/proxy')
      expect(url.searchParams.has('url')).toBe(false)
      const encoded = url.searchParams.get('token')!.split('.')[0]!
      const grant = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as { url: string; hosts: string[]; headers: { referer: string } }
      expect(grant.url).toBe(source.url)
      expect(grant.hosts).toEqual(['media.example.com'])
      expect(grant.headers.referer).toBe('https://provider.example.com/')
    } finally { await app.close(); await store.close() }
  })

  it('accepts a safe lang query and ignores junk without failing the resolve', async () => {
    const provider: ProviderRegistration = {
      adapter: createStaticProvider('primary', [{ ref: { kind: 'movie', id: 1 }, sources: [source] }]),
      enabled: true, approvedRegions: ['US'], mediaHosts: ['media.example.com'], upstreamGroup: 'primary',
      concurrency: 2, requestsPerMinute: 30, proxy: false, mediaKinds: ['movie'],
    }
    const store = createMemoryPlaybackStore()
    const app = Fastify()
    registerEmbedRoutes(app, { playback: createPlayback({ providers: [provider], store, region: 'US' }), workerUrl: undefined, hmacSecret: undefined, providers: [provider] })
    try {
      const withLang = await app.inject({ method: 'GET', url: '/v1/embed/movie/1?lang=it' })
      expect(withLang.statusCode).toBe(200)
      expect(withLang.json().success).toBe(true)

      const junkLang = await app.inject({ method: 'GET', url: '/v1/embed/movie/1?lang=../../etc' })
      expect(junkLang.statusCode).toBe(200)
      expect(junkLang.json().success).toBe(true)
    } finally { await app.close(); await store.close() }
  })
})
