/** Opaque, authenticated, expiring media capabilities. No member identity. */
export type RelayGrant = {
  version: 1
  provider: string
  url: string
  expires: number
  origin: string
  headers: Record<string, string>
  headerHost: string
  kind: 'hls' | 'native' | 'auto'
  depth: number
  recipe?: 'storm-boron-v1' | 'wecollege-city-v1' | 'lookmovie-v1'
  hosts?: string[]
}
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })
export const MAX_GRANT_MS = 30 * 60_000
export function exactMediaHost(host: string): boolean {
  return host.length <= 253 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(host)
    && !/\.(?:local|internal|localhost|test|invalid)$/.test(host) && !/^\d+(?:\.\d+){3}$/.test(host)
}
export function relayDestination(value: string, hosts: readonly string[]): boolean {
  try {
    const url = new URL(value)
    return value.length <= 1800 && url.protocol === 'https:' && !url.username && !url.password && !url.hash
      && (!url.port || url.port === '443') && exactMediaHost(url.hostname) && hosts.includes(url.hostname)
  } catch { return false }
}
function encode(value: Uint8Array) {
  const native = value as Uint8Array & { toBase64?: (options: { alphabet: 'base64url'; omitPadding: boolean }) => string }
  if (native.toBase64) return native.toBase64({ alphabet: 'base64url', omitPadding: true })
  return btoa(String.fromCharCode(...value)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}
function decode(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid grant.')
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0))
}
function validGrant(value: unknown, now: number, allowExpired = false): value is RelayGrant {
  if (!value || typeof value !== 'object') return false
  const grant = value as Partial<RelayGrant>
  if (grant.recipe !== undefined || grant.hosts !== undefined) {
    if (!['storm-boron-v1', 'wecollege-city-v1', 'lookmovie-v1'].includes(grant.recipe ?? '') || !Array.isArray(grant.hosts)
      || !grant.hosts.length || grant.hosts.length > 8 || grant.hosts.some(host => !exactMediaHost(host))
      || !relayDestination(grant.url ?? '', grant.hosts)) return false
  }
  if (grant.version !== 1 || !/^[a-z0-9-]{1,40}$/.test(grant.provider ?? '') || typeof grant.url !== 'string'
      || !Number.isSafeInteger(grant.expires) || (!allowExpired && grant.expires! <= now) || grant.expires! > now + MAX_GRANT_MS
      || !['hls', 'native', 'auto'].includes(grant.kind ?? '') || !Number.isInteger(grant.depth) || grant.depth! < 0 || grant.depth! > 5
      || typeof grant.origin !== 'string' || typeof grant.headerHost !== 'string' || !exactMediaHost(grant.headerHost)
      || !grant.headers || typeof grant.headers !== 'object' || Array.isArray(grant.headers)) return false
  try { if (new URL(grant.origin).origin !== grant.origin) return false } catch { return false }
  return Object.entries(grant.headers).every(([name, value]) => /^(referer|origin|accept|user-agent)$/i.test(name)
    && typeof value === 'string' && value.length <= 512 && !/[\r\n]/.test(value))
}
export async function createGrantCodec(secret: string) {
  if (secret.length < 32) throw new Error('Relay secret requires at least 32 characters.')
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret))
  const key = await crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
  return {
    async seal(grant: RelayGrant, now = Date.now()): Promise<string> {
      if (!validGrant(grant, now)) throw new Error('Invalid grant.')
      const iv = crypto.getRandomValues(new Uint8Array(12))
      // Compact wire representation keeps full binding while reducing the
      // repeated JSON/encoding work for long VOD playlists on Workers Free.
      const compact = [grant.version, grant.provider, grant.url, grant.expires, grant.origin, grant.headers, grant.headerHost, grant.kind, grant.depth, ...(grant.recipe ? [grant.recipe, grant.hosts] : [])]
      const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('consumit-media-v1') }, key, encoder.encode(JSON.stringify(compact)))
      const bytes = new Uint8Array(iv.length + data.byteLength)
      bytes.set(iv); bytes.set(new Uint8Array(data), iv.length)
      const token = encode(bytes)
      if (token.length > 3600) throw new Error('Grant exceeds its limit.')
      return token
    },
    async open(token: string, now = Date.now(), allowExpired = false): Promise<RelayGrant> {
      if (token.length > 3600) throw new Error('Invalid grant.')
      const bytes = decode(token)
      if (bytes.length < 29) throw new Error('Invalid grant.')
      const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: encoder.encode('consumit-media-v1') }, key, bytes.slice(12))
      const parsed: unknown = JSON.parse(decoder.decode(data))
      // Keep previously issued object grants valid until their expiry.
      const value: unknown = Array.isArray(parsed) && [9, 11].includes(parsed.length) ? {
        version: parsed[0], provider: parsed[1], url: parsed[2], expires: parsed[3], origin: parsed[4],
        headers: parsed[5], headerHost: parsed[6], kind: parsed[7], depth: parsed[8],
        ...(parsed.length === 11 ? { recipe: parsed[9], hosts: parsed[10] } : {}),
      } : parsed
      if (!validGrant(value, now, allowExpired)) throw new Error('Invalid grant.')
      return value
    },
  }
}
export type GrantCodec = Awaited<ReturnType<typeof createGrantCodec>>
export function mediaGrantUrl(origin: string, token: string): string { return `${origin}/media/${token}` }
export function manifestGrantUrl(origin: string, token: string): string { return `${origin}/v1/playback/relay-manifest?grant=${token}` }
