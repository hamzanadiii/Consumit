import { loadEnv } from '../apps/api/src/config/env.ts'
import { loadConfiguredProviders } from '../apps/api/src/playback/configured-providers.ts'
import { createProviderRouteRegistry } from '../apps/api/src/playback/route-registry.ts'
import { allowedMediaUrl } from '../packages/provider-sdk/src/index.ts'

/** Compile the one reviewed API route list into Resolver and Relay policy.
 * This command emits only route metadata and exact host allowlists, never secrets. */
const env = loadEnv()
if (env.playback?.execution !== 'cloudflare-only' || !env.playback.resolver || !env.playback.enabled) {
  throw new Error('Provider route compilation requires enabled Cloudflare-only playback and a Resolver Worker.')
}
const providers = await loadConfiguredProviders(env.playback.mediaConfig, { tmdbToken: env.tmdbToken })
const registry = createProviderRouteRegistry({
  providers,
  resolverOrigin: env.playback.resolver.origin,
  resolverOrigins: env.playback.resolver.providerOrigins,
  relayOrigin: env.playback.relay?.origin,
  relayOrigins: env.playback.relay?.providerOrigins,
  relayProviders: env.playback.relay?.providers,
  accepted: env.playback.acceptedEdgeRoutes,
})
const relayRoutes = registry.relayRoutes()
const relayProviders = Object.fromEntries([...new Map(relayRoutes.map(route => [route.provider, route.hosts] as const))])
const relayProviderIds = new Set(relayRoutes.map(route => route.provider))
for (const provider of Object.keys(env.playback.relay?.discovery ?? {})) {
  if (!relayProviderIds.has(provider)) throw new Error(`Relay discovery policy ${provider} has no reviewed Relay route.`)
}
for (const route of relayRoutes) {
  const registration = providers.find(provider => provider.adapter.id === route.provider)
  const hosts = route.hosts
  if (!registration || !hosts?.length || hosts.some(host => !allowedMediaUrl(`https://${host}/`, registration.mediaHosts, registration.mediaHostPatterns))) {
    throw new Error(`Relay route ${route.provider}:${route.kind}:${route.region} is missing a matching exact API host policy.`)
  }
}
for (const [provider, hosts] of Object.entries(env.playback.relay?.providers ?? {})) {
  if (!relayRoutes.some(route => route.provider === provider)) throw new Error(`Relay host policy ${provider} has no reviewed Relay route.`)
  relayProviders[provider] = hosts
}
process.stdout.write(`${JSON.stringify({
  version: registry.version,
  routes: registry.snapshot(),
  resolver: { routePolicy: registry.resolverPolicy() },
  relay: { routeVersion: registry.version, routePolicy: relayRoutes, providers: relayProviders,
    discovery: Object.fromEntries(Object.entries(env.playback.relay?.discovery ?? {}).filter(([provider]) => relayProviderIds.has(provider))) },
}, null, 2)}\n`)
