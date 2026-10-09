import { ApiError } from '../http/errors.ts'
import { createGrantCodec, exactMediaHost, mediaGrantUrl, manifestGrantUrl, relayDestination } from '@consumit/media-relay'
import { rewriteRelayManifest } from '@consumit/media-relay/manifest'
import { mediaHeaders } from '@consumit/media-relay/provider-headers'
import { createProviderHttp } from './provider-http.ts'
import type { MediaTransport } from './transport.ts'
import { allowedMediaUrl, suppliesVideo } from '@consumit/provider-sdk'
import type { ResolvedSource } from './resolver.ts'

import { parseRelayDiscovery, parseRelayProviders, type RelayDiscovery } from '@consumit/media-relay/policy'
import type { RelayScope } from '@consumit/media-relay/authorization'
export { parseRelayDiscovery, parseRelayProviders }
export type PlaybackRelayConfig = { origin: string; secret: string; providers: Record<string, string[]>; discovery?: RelayDiscovery }
export function createPlaybackRelay(config: PlaybackRelayConfig, transport?: MediaTransport) {
  const codec = createGrantCodec(config.secret)
  function discoveredHosts(source: ResolvedSource['source'], registration: ResolvedSource['registration']) {
    const leased = source.relayRecipe && registration.relayHostDiscovery === source.relayRecipe && config.discovery?.[registration.adapter.id] === source.relayRecipe
      && source.relayHosts?.length && source.relayHosts.length <= 8 && source.relayHosts.every(exactMediaHost)
      && (source.relayRecipe !== 'wecollege-city-v1' || relayDestination(source.url, config.providers[registration.adapter.id] ?? [])) ? source.relayHosts : []
    // Preserve the compact static capability when the entire verified graph
    // already fits independent policy; only rotating hosts need extra scope.
    return leased.some(host => !(config.providers[registration.adapter.id] ?? []).includes(host)) ? leased : []
  }
  function permits(resolved: Pick<ResolvedSource, 'source' | 'registration'>): boolean {
    const { source, registration } = resolved
    const hosts = config.providers[registration.adapter.id] ?? []
    return registration.enabled && registration.deliveryMode === 'relay' && suppliesVideo(registration) && source.type !== 'dash' && source.type !== 'iframe'
      && hosts.length > 0 && relayDestination(source.url, [...hosts, ...discoveredHosts(source, registration)])
      && hosts.every(host => allowedMediaUrl(`https://${host}/`, registration.mediaHosts, registration.mediaHostPatterns))
      && Object.entries(source.headers).every(([name, value]) => /^(referer|origin|accept|user-agent)$/i.test(name)
        && value.length <= 512 && !/[\r\n]/.test(value))
  }
  return {
    permits,
    includes(providerId: string) { return Boolean(config.providers[providerId]?.length) },
    async issue(resolved: ResolvedSource, expiry: number, origin: string, scope: RelayScope): Promise<string | null> {
      const { source, registration } = resolved
      if (source.type === 'dash' || source.type === 'iframe' || !permits(resolved)) return null
      try {
        const token = await (await codec).seal({ version: 2, ...scope, provider: registration.adapter.id, url: source.url,
          expires: expiry, origin, headers: source.headers, headerHost: new URL(source.url).hostname, kind: source.type, depth: 0,
          ...(discoveredHosts(source, registration).length ? { recipe: source.relayRecipe!, hosts: discoveredHosts(source, registration) } : {}) })
        return source.type === 'hls' && config.discovery?.[registration.adapter.id] ? manifestGrantUrl(origin, token) : mediaGrantUrl(origin, token)
      } catch { return null }
    },
    async accepts(src: string, provider: string, scope: RelayScope): Promise<boolean> {
      try {
        const url = new URL(src)
        const control = url.pathname === '/v1/playback/relay-manifest' && [...url.searchParams].length === 1 && url.searchParams.has('grant')
        if (!control && (url.search || !url.pathname.startsWith('/media/'))) return false
        // Session ownership authorizes renewal after source expiry; the
        // Worker always enforces expiry before fetching any media.
        const grant = await (await codec).open(control ? url.searchParams.get('grant')! : url.pathname.slice(7), Date.now(), true)
        if (control && (url.origin !== grant.origin || !config.discovery?.[grant.provider] || grant.kind !== 'hls')) return false
        return url.origin === grant.origin && grant.owner === scope.owner && grant.session === scope.session && grant.audience === scope.audience && grant.provider === provider && relayDestination(grant.url, [...config.providers[provider] ?? [],
          ...(grant.recipe && config.discovery?.[provider] === grant.recipe ? grant.hosts ?? [] : [])])
      } catch { return false }
    },
    async cast(src: string, browserOwner: string, session: string, castOwner: string): Promise<{ src: string; expiresAt: string }> {
      const url = new URL(src)
      const grant = await (await codec).open(url.pathname === '/v1/playback/relay-manifest' ? url.searchParams.get('grant') ?? '' : url.pathname.slice(7))
      if (!await this.accepts(src, grant.provider, { owner: browserOwner, session, audience: 'browser' })) throw new Error('Invalid cast source.')
      const token = await (await codec).seal({ ...grant, owner: castOwner, audience: 'cast' })
      return { src: grant.kind === 'hls' && config.discovery?.[grant.provider] ? manifestGrantUrl(grant.origin, token) : mediaGrantUrl(grant.origin, token), expiresAt: new Date(grant.expires).toISOString() }
    },
    async manifest(token: string, origin: string | undefined, scope: Pick<RelayScope, 'owner' | 'audience'>, signal: AbortSignal): Promise<string> {
      const signer = await codec
      let grant
      try { grant = await signer.open(token) } catch { throw new ApiError('FORBIDDEN', 'Use a valid media capability.') }
      if (grant.owner !== scope.owner || grant.audience !== scope.audience || origin !== undefined && grant.origin !== origin || grant.kind !== 'hls' || !config.discovery?.[grant.provider]
        || grant.recipe && config.discovery[grant.provider] !== grant.recipe) throw new ApiError('FORBIDDEN', 'Use an authorized media capability.')
      const hosts = grant.recipe ? grant.hosts! : config.providers[grant.provider] ?? []
      if (!config.providers[grant.provider]?.length || !relayDestination(grant.url, hosts)) throw new Error('Blocked control destination.')
      const http = createProviderHttp(hosts, transport)
      const response = await http(grant.url, mediaHeaders(grant.provider, new URL(grant.url).hostname, grant.headerHost, grant.headers, grant.recipe), signal)
      if (response.status !== 200 || new TextEncoder().encode(response.text).length > 512 * 1024) throw new Error('Unavailable control document.')
      return rewriteRelayManifest(response.text, response.url, grant, hosts, signer, grant.origin, Date.now(), grant.origin)
    },
  }
}
export type PlaybackRelay = ReturnType<typeof createPlaybackRelay>
