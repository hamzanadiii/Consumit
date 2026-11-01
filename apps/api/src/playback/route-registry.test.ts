import { expect, it } from 'vitest'
import { createStaticProvider, type ProviderRegistration } from '@consumit/provider-sdk'
import { configuredProviders } from './configured-providers.ts'
import { createProviderRouteRegistry } from './route-registry.ts'

const provider: ProviderRegistration = {
  adapter: createStaticProvider('fixture', []), enabled: true, mediaHosts: ['media.example.com'], approvedRegions: ['US', 'FR'], mediaKinds: ['movie', 'series'], upstreamGroup: 'fixture', concurrency: 1, requestsPerMinute: 10,
  deliveryMode: 'relay', workerConfig: { id: 'fixture' },
}
const options = { providers: [provider], resolverOrigin: 'https://resolver.example.com', relayOrigin: 'https://relay.example.com', relayProviders: { fixture: ['media.example.com'] }, accepted: ['fixture:movie:US:relay'] }
it('accepts only an explicitly reviewed provider/kind/region/delivery tuple', () => {
  const registry = createProviderRouteRegistry(options)
  expect(registry.find('fixture', 'movie', 'US', 'relay')).toMatchObject({ lookup: options.resolverOrigin, media: options.relayOrigin, version: registry.version })
  expect(registry.resolverPolicy()).toMatchObject([{ provider: 'fixture', kind: 'movie', region: 'US', purpose: 'video', delivery: 'relay', lookup: options.resolverOrigin, version: registry.version }])
  expect(registry.relayRoutes()).toEqual([{ version: registry.version, provider: 'fixture', kind: 'movie', region: 'US', purpose: 'video', delivery: 'relay', media: options.relayOrigin, hosts: ['media.example.com'] }])
  expect(registry.find('fixture', 'series', 'US', 'relay')).toBeNull()
  expect(registry.find('fixture', 'movie', 'FR', 'relay')).toBeNull()
  expect(registry.find('fixture', 'movie', 'US', 'direct')).toBeNull()
  expect(createProviderRouteRegistry({ ...options, accepted: [] }).snapshot()).toEqual([])
})
it('requires an explicit audio route for an audio-capable provider', () => {
  const both = { ...provider, role: 'both' as const }
  const videoRoute = 'fixture:movie:US:relay'
  const videoOnly = createProviderRouteRegistry({ ...options, providers: [both], accepted: [videoRoute] })
  expect(videoOnly.find('fixture', 'movie', 'US', 'relay', 'audio')).toBeNull()
  const reviewed = createProviderRouteRegistry({ ...options, providers: [both], accepted: [videoRoute, `${videoRoute}:audio`] })
  expect(reviewed.find('fixture', 'movie', 'US', 'relay', 'audio')).toMatchObject({ purpose: 'audio' })
  expect(reviewed.relayRoutes().map(route => route.purpose)).toEqual(['audio', 'video'])
})
it('changes the route version when the immutable host policy changes', () => {
  const before = createProviderRouteRegistry(options)
  const after = createProviderRouteRegistry({ ...options, providers: [{ ...provider, mediaHosts: ['different.example.com'] }] })
  expect(after.version).not.toBe(before.version)
  const relayHostsChanged = createProviderRouteRegistry({ ...options, relayProviders: { fixture: ['new-media.example.com'] } })
  expect(relayHostsChanged.version).not.toBe(before.version)
  expect(() => createProviderRouteRegistry({ ...options, resolverOrigin: 'http://localhost:3001' })).toThrow('Invalid Cloudflare route origin')
})

it('compiles NontonFlix, VidBolt, and EmbedMaster from provider config into separate Relay cohorts', () => {
  const providers = configuredProviders([
    { id: 'wecollege-miami', adapter: 'wecollege', enabled: false, deliveryMode: 'relay', role: 'video', regions: ['US'], mediaKinds: ['movie', 'series'], mediaHosts: ['moon.zenoak.top', 'ultramoss.top', 'emberwave.top', 'rapidmesa.top'], resolutionHosts: [], upstreamGroup: 'wecollege-miami', relayHostDiscovery: 'wecollege-city-v1' },
    { id: 'vidbolt', adapter: 'vidbolt', enabled: false, deliveryMode: 'relay', role: 'video', regions: ['US'], mediaKinds: ['movie', 'series'], mediaHosts: ['img.rousav.tech', 'img.animecurx.tech', 'proxy.vidbolt.xyz', 'img1.hscow.com'], resolutionHosts: ['vidbolt.xyz'], upstreamGroup: 'vidbolt' },
    { id: 'nontonflix', adapter: 'nontonflix', enabled: false, deliveryMode: 'relay', role: 'video', regions: ['US'], mediaKinds: ['movie', 'series'], mediaHosts: ['media.nontonflix.com'], resolutionHosts: ['nontonflix.com'], upstreamGroup: 'nontonflix' },
    { id: 'embedmaster', adapter: 'embedmaster', enabled: false, deliveryMode: 'relay', role: 'video', regions: ['US'], mediaKinds: ['movie', 'series'], mediaHosts: ['perfectbussines.website'], resolutionHosts: ['embedmaster.link', 'embdmstrplayer.com'], upstreamGroup: 'embedmaster' },
  ], { tmdbToken: 'fixture-token' })
  const registry = createProviderRouteRegistry({
    providers, resolverOrigin: 'https://resolver.example.com', relayOrigin: 'https://relay.example.com',
    relayProviders: {
      'wecollege-miami': ['moon.zenoak.top', 'ultramoss.top', 'emberwave.top', 'rapidmesa.top'],
      vidbolt: ['img.rousav.tech', 'img.animecurx.tech', 'proxy.vidbolt.xyz', 'img1.hscow.com'],
      nontonflix: ['media.nontonflix.com'],
      embedmaster: ['perfectbussines.website'],
    },
    accepted: [
      'wecollege-miami:movie:US:relay', 'wecollege-miami:series:US:relay',
      'vidbolt:movie:US:relay', 'vidbolt:series:US:relay',
      'nontonflix:movie:US:relay', 'nontonflix:series:US:relay',
      'embedmaster:movie:US:relay', 'embedmaster:series:US:relay',
    ],
  })
  expect(registry.snapshot().map(({ provider, kind, delivery }) => `${provider}:${kind}:${delivery}`)).toEqual([
    'embedmaster:movie:relay', 'embedmaster:series:relay', 'nontonflix:movie:relay', 'nontonflix:series:relay',
    'vidbolt:movie:relay', 'vidbolt:series:relay', 'wecollege-miami:movie:relay', 'wecollege-miami:series:relay',
  ])
  expect(registry.relayRoutes().find(route => route.provider === 'embedmaster')).toMatchObject({ hosts: ['perfectbussines.website'], purpose: 'video' })
  expect(registry.relayRoutes().find(route => route.provider === 'nontonflix')).toMatchObject({ hosts: ['media.nontonflix.com'], purpose: 'video' })
  expect(registry.relayRoutes().find(route => route.provider === 'vidbolt')).toMatchObject({ hosts: ['img.animecurx.tech', 'img.rousav.tech', 'img1.hscow.com', 'proxy.vidbolt.xyz'], purpose: 'video' })
  expect(registry.relayRoutes().find(route => route.provider === 'wecollege-miami')).toMatchObject({ hosts: ['emberwave.top', 'moon.zenoak.top', 'rapidmesa.top', 'ultramoss.top'] })
  expect(registry.find('embedmaster', 'movie', 'US', 'relay')).toMatchObject({ lookup: 'https://resolver.example.com', media: 'https://relay.example.com' })
})
