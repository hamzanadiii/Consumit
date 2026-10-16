import { createGrantCodec, exactMediaHost, mediaGrantUrl, manifestGrantUrl, relayDestination } from '@consumit/media-relay'
import { rewriteRelayManifest } from '@consumit/media-relay/manifest'
import { mediaHeaders } from '@consumit/media-relay/provider-headers'
import { createProviderHttp } from './provider-http.ts'
import type { MediaTransport } from './transport.ts'
import { allowedMediaUrl, suppliesVideo } from '@consumit/provider-sdk'
import type { ResolvedSource } from './resolver.ts'

export type RelayDiscovery = Record<string, 'storm-boron-v1' | 'wecollege-city-v1' | 'lookmovie-v1'>
export type PlaybackRelayNode = { origin: string; secret: string; providers: Record<string, string[]> }
export type PlaybackRelayConfig = PlaybackRelayNode & { discovery?: RelayDiscovery; node?: PlaybackRelayNode; providerOrigins?: Readonly<Record<string, string>>; controlProviders?: readonly 'rigel'[] }
type RelayControlFetch = (input: string | URL, init?: RequestInit) => Promise<Response>
export function parseRelayControlProviders(raw: string): 'rigel'[] {
  const value: unknown = JSON.parse(raw)
  if (!Array.isArray(value) || value.length > 1 || value.some(id => id !== 'rigel')) throw new Error('Unknown relay control provider.')
  return value as 'rigel'[]
}
export function validateRelayNode(node: PlaybackRelayNode) {
  const url = new URL(node.origin)
  if (url.protocol !== 'https:' || url.origin !== node.origin || url.username || url.password || node.secret.length < 32
    || Object.keys(node.providers).some(id => id !== 'lookmovie-relay')) throw new Error('Invalid approved media node.')
  parseRelayProviders(JSON.stringify(node.providers))
  return node
}
export function parseRelayDiscovery(raw: string): RelayDiscovery {
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.entries(value).some(([id, recipe]) =>
    !(id === 'stormboron' && recipe === 'storm-boron-v1' || ['wecollege-miami', 'wecollege-boise'].includes(id) && recipe === 'wecollege-city-v1' || id === 'lookmovie-relay' && recipe === 'lookmovie-v1'))) throw new Error('Unknown relay discovery recipe.')
  return value as RelayDiscovery
}
export function parseRelayProviders(raw: string): Record<string, string[]> {
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid relay providers.')
  const entries = Object.entries(value)
  if (entries.length > 64 || entries.some(([id, hosts]) => !/^[a-z0-9-]{1,40}$/.test(id)
      || !Array.isArray(hosts) || !hosts.length || hosts.length > 100 || hosts.some(host => typeof host !== 'string' || !exactMediaHost(host)))) throw new Error('Relay requires exact approved media hosts per provider.')
  return Object.fromEntries(entries)
}
export function createPlaybackRelay(config: PlaybackRelayConfig, transport?: MediaTransport, controlFetch: RelayControlFetch = fetch) {
  if (config.controlProviders?.some(id => id !== 'rigel' || !config.providers[id]?.length)) throw new Error('Invalid relay control provider.')
  const edge = createRelayIssuer(config, transport, true, controlFetch)
  const regional = new Map(Object.entries(config.providerOrigins ?? {}).map(([id, origin]) => {
    const url = new URL(origin)
    if (!config.providers[id]?.length || url.protocol !== 'https:' || url.origin !== origin || url.username || url.password) throw new Error('Invalid regional relay origin.')
    return [id, createRelayIssuer({ ...config, origin }, transport, true, controlFetch)]
  }))
  const node = config.node ? createRelayIssuer({ ...validateRelayNode(config.node), discovery: { 'lookmovie-relay': 'lookmovie-v1' } }, transport, false) : undefined
  if (config.node && (config.node.secret === config.secret || config.node.origin === config.origin && Object.keys(config.providers).length)) throw new Error('Media node requires an independent signing key and origin.')
  const route = (id: string) => node?.includes(id) ? node : regional.get(id) ?? edge
  const codec = createGrantCodec(config.secret)
  return {
    permits: (resolved: Pick<ResolvedSource, 'source' | 'registration'>) => route(resolved.registration.adapter.id).permits(resolved),
    includes: (id: string) => route(id).includes(id),
    issue: (resolved: ResolvedSource, expiry: number, origin: string) => route(resolved.registration.adapter.id).issue(resolved, expiry, origin),
    issueAudio: (resolved: ResolvedSource, expiry: number, origin: string) => route(resolved.registration.adapter.id).issue(resolved, expiry, origin, true),
    accepts: (src: string, provider: string) => route(provider).accepts(src, provider),
    async manifest(token: string, origin: string, signal: AbortSignal) {
      const grant = await (await codec).open(token)
      return route(grant.provider).manifest(token, origin, signal)
    },
  }
}
function createRelayIssuer(config: PlaybackRelayConfig, transport?: MediaTransport, controlManifests = true, controlFetch: RelayControlFetch = fetch) {
  const codec = createGrantCodec(config.secret)
  const compilesControl = (id: string) => Boolean(config.discovery?.[id] || config.controlProviders?.includes(id as 'rigel'))
  function discoveredHosts(source: ResolvedSource['source'], registration: ResolvedSource['registration']) {
    const leased = source.relayRecipe && registration.relayHostDiscovery === source.relayRecipe && config.discovery?.[registration.adapter.id] === source.relayRecipe
      && source.relayHosts?.length && source.relayHosts.length <= 8 && source.relayHosts.every(exactMediaHost)
      && (source.relayRecipe !== 'wecollege-city-v1' || relayDestination(source.url, config.providers[registration.adapter.id] ?? [])) ? source.relayHosts : []
    // Preserve the compact static capability when the entire verified graph
    // already fits independent policy; only rotating hosts need extra scope.
    return leased.some(host => !(config.providers[registration.adapter.id] ?? []).includes(host)) ? leased : []
  }
  function permits(resolved: Pick<ResolvedSource, 'source' | 'registration'>, audioOnly = false): boolean {
    const { source, registration } = resolved
    const hosts = config.providers[registration.adapter.id] ?? []
    return registration.enabled && registration.deliveryMode === 'relay' && (audioOnly ? (registration.role === 'audio' || registration.role === 'both') && source.type === 'hls' : suppliesVideo(registration)) && source.type !== 'dash' && source.type !== 'iframe'
      && hosts.length > 0 && relayDestination(source.url, [...hosts, ...discoveredHosts(source, registration)])
      && hosts.every(host => allowedMediaUrl(`https://${host}/`, registration.mediaHosts, registration.mediaHostPatterns))
      && Object.entries(source.headers).every(([name, value]) => /^(referer|origin|accept|user-agent)$/i.test(name)
        && value.length <= 512 && !/[\r\n]/.test(value))
  }
  return {
    permits,
    includes(providerId: string) { return Boolean(config.providers[providerId]?.length) },
    async issue(resolved: ResolvedSource, expiry: number, origin: string, audioOnly = false): Promise<string | null> {
      const { source, registration } = resolved
      if (source.type === 'dash' || source.type === 'iframe' || !permits(resolved, audioOnly)) return null
      try {
        const token = await (await codec).seal({ version: 1, provider: registration.adapter.id, url: source.url,
          expires: expiry, origin, headers: source.headers, headerHost: new URL(source.url).hostname, kind: source.type, depth: 0,
          ...(discoveredHosts(source, registration).length ? { recipe: source.relayRecipe!, hosts: discoveredHosts(source, registration) } : {}) })
        return controlManifests && registration.adapter.id !== 'lookmovie-relay' && source.type === 'hls' && compilesControl(registration.adapter.id) ? manifestGrantUrl(origin, token) : mediaGrantUrl(config.origin, token)
      } catch { return null }
    },
    async accepts(src: string, provider: string): Promise<boolean> {
      try {
        const url = new URL(src)
        const control = url.pathname === '/v1/playback/relay-manifest' && [...url.searchParams].length === 1 && url.searchParams.has('grant')
        if (!control && (url.origin !== config.origin || url.search || !url.pathname.startsWith('/media/'))) return false
        // Session ownership authorizes renewal after source expiry; the
        // Worker always enforces expiry before fetching any media.
        const grant = await (await codec).open(control ? url.searchParams.get('grant')! : url.pathname.slice(7), Date.now(), true)
        if (control && (!controlManifests || url.origin !== grant.origin || !compilesControl(grant.provider) || grant.kind !== 'hls')) return false
        return grant.provider === provider && relayDestination(grant.url, [...config.providers[provider] ?? [],
          ...(grant.recipe && config.discovery?.[provider] === grant.recipe ? grant.hosts ?? [] : [])])
      } catch { return false }
    },
    async manifest(token: string, origin: string, signal: AbortSignal): Promise<string> {
      const signer = await codec, grant = await signer.open(token)
      if (grant.origin !== origin || grant.kind !== 'hls' || !compilesControl(grant.provider)
        || grant.recipe && config.discovery?.[grant.provider] !== grant.recipe) throw new Error('Invalid control capability.')
      const hosts = grant.recipe ? grant.hosts! : config.providers[grant.provider] ?? []
      if (!config.providers[grant.provider]?.length || !relayDestination(grant.url, hosts)) throw new Error('Blocked control destination.')
      if (config.controlProviders?.includes(grant.provider as 'rigel')) {
        // Only control text crosses the API; the signed video/key/map requests remain at Cloudflare.
        const response = await controlFetch(new URL('/v1/relay-manifest', config.origin), {
          method: 'POST', headers: { authorization: `Bearer ${config.secret}`, 'content-type': 'application/json', origin },
          body: JSON.stringify({ grant: token }), redirect: 'error', signal,
        })
        const base = response.headers.get('x-consumit-manifest-base')
        if (response.status !== 200 || !base || !relayDestination(base, hosts)) { await response.body?.cancel(); throw new Error('Unavailable Cloudflare control document.') }
        const reader = response.body?.getReader()
        if (!reader) throw new Error('Missing control document.')
        const chunks: Uint8Array[] = []
        let size = 0
        try {
          for (;;) {
            signal.throwIfAborted()
            const part = await reader.read()
            if (part.done) break
            size += part.value.length
            if (size > 2 * 1024 * 1024) throw new Error('Control document exceeds its limit.')
            chunks.push(part.value)
          }
        } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
        return rewriteRelayManifest(Buffer.concat(chunks).toString('utf8'), base, grant, hosts, signer, config.origin, Date.now(), origin)
      }
      const http = createProviderHttp(hosts, transport)
      const response = await http(grant.url, mediaHeaders(grant.provider, new URL(grant.url).hostname, grant.headerHost, grant.headers, grant.recipe), signal)
      if (response.status !== 200 || new TextEncoder().encode(response.text).length > 512 * 1024) throw new Error('Unavailable control document.')
      return rewriteRelayManifest(response.text, response.url, grant, hosts, signer, config.origin, Date.now(), origin)
    },
  }
}
export type PlaybackRelay = ReturnType<typeof createPlaybackRelay>
