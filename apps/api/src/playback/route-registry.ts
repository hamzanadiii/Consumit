import { createHash } from 'node:crypto'
import { suppliesVideo, type ProviderRegistration } from '@consumit/provider-sdk'
import type { PlaybackRef } from '@consumit/contracts'

export type ProviderExecutionMode = 'local' | 'cloudflare-only'
export type ProviderRoute = Readonly<{ provider: string; kind: PlaybackRef['kind']; region: string; purpose: 'video' | 'audio'; delivery: 'direct' | 'relay' | 'embed'; lookup: string; media: string | 'browser'; policy: string; relayHosts: readonly string[]; version: string }>
export function createProviderRouteRegistry(options: {
  providers: readonly ProviderRegistration[]; resolverOrigin: string; resolverOrigins?: Readonly<Record<string, string>> | undefined
  relayOrigin?: string | undefined; relayOrigins?: Readonly<Record<string, string>> | undefined; relayProviders?: Readonly<Record<string, readonly string[]>> | undefined; accepted: readonly string[]
}) {
  const exactOrigin = (value: string) => {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password || url.port || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)) throw new Error('Invalid Cloudflare route origin.')
    return value
  }
  const rows = options.providers.flatMap(provider => {
    if (!options.accepted.some(route => route.startsWith(`${provider.adapter.id}:`)) || !provider.workerConfig) return []
    const lookup = exactOrigin(options.resolverOrigins?.[provider.adapter.id] ?? options.resolverOrigin)
    const media = provider.deliveryMode === 'relay' ? exactOrigin(options.relayOrigins?.[provider.adapter.id] ?? options.relayOrigin ?? '') : 'browser'
    const delivery = provider.deliveryMode ?? 'direct'
    const relayHosts = delivery === 'relay' ? [...(options.relayProviders?.[provider.adapter.id] ?? [])].sort() : []
    const purposes: Array<'video' | 'audio'> = [
      ...(suppliesVideo(provider) ? ['video' as const] : []),
      ...(provider.role === 'audio' || provider.role === 'both' ? ['audio' as const] : []),
    ]
    return purposes.flatMap(purpose => provider.mediaKinds.flatMap(kind => provider.approvedRegions.filter(region => {
      const tuple = `${provider.adapter.id}:${kind}:${region}:${delivery}`
      return options.accepted.includes(purpose === 'audio' ? `${tuple}:audio` : tuple)
    }).map(region => ({ provider: provider.adapter.id, kind, region, purpose, delivery, lookup, media, relayHosts, policy: createHash('sha256').update(JSON.stringify([provider.mediaHosts, provider.mediaHostPatterns?.length ? provider.mediaHostPatterns.map(pattern => pattern.source) : undefined, provider.relayHostDiscovery])).digest('hex') }))))
  }).sort((left, right) => `${left.provider}:${left.kind}:${left.region}:${left.delivery}:${left.purpose}`.localeCompare(`${right.provider}:${right.kind}:${right.region}:${right.delivery}:${right.purpose}`))
  const version = `edge-v1-${createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0, 16)}`
  const routes = new Map(rows.map(row => [`${row.provider}:${row.kind}:${row.region}:${row.purpose}:${row.delivery}`, Object.freeze({ ...row, version })]))
  return Object.freeze({
    version,
    snapshot: () => [...routes.values()],
    find: (provider: string, kind: PlaybackRef['kind'], region: string, delivery = 'direct', purpose: 'video' | 'audio' = 'video') => routes.get(`${provider}:${kind}:${region}:${purpose}:${delivery}`) ?? null,
    resolverPolicy: () => [...routes.values()].map(({ version: routeVersion, policy, provider, kind, region, purpose, delivery, lookup }) => ({ version: routeVersion, policy, provider, kind, region, purpose, delivery, lookup })),
    relayRoutes: () => [...routes.values()].filter(route => route.delivery === 'relay').map(({ version: routeVersion, provider, kind, region, purpose, media, relayHosts }) => ({ version: routeVersion, provider, kind, region, purpose, delivery: 'relay' as const, media, hosts: relayHosts })),
  })
}
