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
const providers = await loadConfiguredProviders(env.playback.mediaConfig, {
  tmdbToken: env.tmdbToken,
  // Route compilation never resolves a title; provide inert metadata seams so
  // anime adapters can be registered without making external catalog calls.
  animeTitleResolver: async () => '',
  animeTitleVariantsResolver: async () => [],
  animeMetaResolver: async () => ({ title: '', malId: null }),
})
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
const resolverRoutePolicy = registry.resolverPolicy()
function splitResolverPolicy(routes: typeof resolverRoutePolicy) {
  const parts: typeof resolverRoutePolicy[] = []
  for (const route of routes) {
    const previous = parts.at(-1) ?? []
    const candidate = [...previous, route]
    if (new TextEncoder().encode(JSON.stringify(candidate)).byteLength > 4000) {
      if (previous.length === 0) throw new Error(`Resolver route ${route.provider}:${route.kind}:${route.region} exceeds the Worker binding limit.`)
      parts.push([route])
    } else if (parts.length === 0) parts.push(candidate)
    else parts[parts.length - 1] = candidate
  }
  if (parts.length > 3) throw new Error('Resolver route policy exceeds the three bounded Worker bindings.')
  return parts
}
const resolverWorkers = Object.fromEntries([...new Set(resolverRoutePolicy.map(route => route.lookup))].map(origin => {
  const routes = resolverRoutePolicy.filter(route => route.lookup === origin)
  return [origin, { routePolicy: routes, routePolicyParts: splitResolverPolicy(routes) }]
}))
process.stdout.write(`${JSON.stringify({
  version: registry.version,
  routes: registry.snapshot(),
  resolver: { routePolicy: resolverRoutePolicy, workers: resolverWorkers },
  relay: { routeVersion: registry.version, routePolicy: relayRoutes, providers: relayProviders,
    discovery: Object.fromEntries(Object.entries(env.playback.relay?.discovery ?? {}).filter(([provider]) => relayProviderIds.has(provider))) },
}, null, 2)}\n`)
