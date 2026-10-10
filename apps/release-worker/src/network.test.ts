import { describe, expect, it } from 'vitest'
import { allowedBrowserUrl, createProbeProxy, isPublicAddress, permittedMediaHost } from './network'
import { workerConfigSchema } from './worker'
import type { ReleaseProbeSource } from '@consumit/contracts'

const source: ReleaseProbeSource = { src: 'https://media.example/a.mp4', type: 'native', expiresAt: '2099-01-01T00:00:00.000Z', providerId: 'one', revision: 'a'.repeat(64), region: 'US', audioLanguage: 'en', mediaHosts: ['media.example'], mediaHostPatterns: ['^cdn[0-9]+\\.example$'] }
describe('bounded browser network', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.1.1', '198.18.0.1', '203.0.113.1', '::1', '::ffff:127.0.0.1', 'fc00::1', '2001:db8::1', '2002:7f00:1::1'])('blocks private and reserved IP %s', address => expect(isPublicAddress(address)).toBe(false))
  it('allows public addresses and only configured media hosts', () => {
    expect(isPublicAddress('8.8.8.8')).toBe(true); expect(isPublicAddress('2606:4700::1111')).toBe(true)
    expect(permittedMediaHost('cdn1.example', source)).toBe(true)
    expect(permittedMediaHost('cdn1.example.attacker.test', source)).toBe(false)
    expect(allowedBrowserUrl('https://media.example/a.mp4', 'https://consumit.example', source)).toBe(true)
    for (const url of ['https://media.example:8443/a', 'https://user@media.example/a', 'http://media.example/a', 'https://evil.example/a']) expect(allowedBrowserUrl(url, 'https://consumit.example', source)).toBe(false)
  })
  it('excludes member APIs, watch pages and arbitrary first-party paths', () => {
    for (const path of ['/watch/series/1', '/v1/me', '/v1/internal/releases/source', '/settings']) expect(allowedBrowserUrl(`https://consumit.example${path}`, 'https://consumit.example', source)).toBe(false)
    expect(allowedBrowserUrl('https://consumit.example/_internal/release-check', 'https://consumit.example', null)).toBe(true)
    expect(allowedBrowserUrl('https://consumit.example/v1/playback/relay-manifest?grant=one', 'https://consumit.example', null)).toBe(false)
  })
  it('rejects an HTTP private destination at the actual proxy boundary', async () => {
    const proxy = await createProbeProxy('http://consumit.example', () => source)
    try {
      const response = await fetch(proxy.url, { headers: { host: '127.0.0.1' } })
      expect(response.status).toBe(403)
    } finally { await proxy.close() }
  })
  it('normalizes origins and rejects URL credentials', () => {
    expect(workerConfigSchema.parse({ apiOrigin: 'http://api:3001/', appOrigin: 'https://consumit.example/', secret: 'a'.repeat(32) }).appOrigin).toBe('https://consumit.example')
    expect(workerConfigSchema.safeParse({ apiOrigin: 'https://user:pass@api.example', appOrigin: 'https://consumit.example', secret: 'a'.repeat(32) }).success).toBe(false)
  })
})
