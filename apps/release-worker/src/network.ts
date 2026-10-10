import { createServer, request } from 'node:http'
import { connect, isIP } from 'node:net'
import { lookup } from 'node:dns/promises'
import type { Socket } from 'node:net'
import type { ReleaseProbeSource } from '@consumit/contracts'

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a = 0, b = 0, c = 0] = address.split('.').map(Number)
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) || (a === 100 && b >= 64 && b <= 127)
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113))
  }
  return isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:(?:db8|0|2|10|20):/i.test(address) && !/^2002:/i.test(address)
}
export function permittedMediaHost(host: string, source: ReleaseProbeSource | null) {
  return Boolean(source && (source.mediaHosts.includes(host.toLowerCase()) || source.mediaHostPatterns.some(pattern => new RegExp(pattern, 'i').test(host))))
}
export function allowedBrowserUrl(raw: string, appOrigin: string, source: ReleaseProbeSource | null) {
  let url: URL
  try { url = new URL(raw) } catch { return false }
  if (url.username || url.password) return false
  if (url.origin === appOrigin) return url.pathname === '/_internal/release-check' || url.pathname.startsWith('/_next/')
    || url.pathname.startsWith('/assets/') || url.pathname === '/favicon.ico' || url.pathname === '/icon.svg'
    || Boolean(source && url.pathname === '/v1/playback/relay-manifest')
  return url.protocol === 'https:' && url.port === '' && permittedMediaHost(url.hostname, source)
}

/** Pin each connection to a validated DNS answer, avoiding DNS rebinding.
 * Chromium uses this proxy for every connection; only the configured first-party
 * origin may use a private address. No member or worker credential crosses it. */
export async function createProbeProxy(appOrigin: string, getSource: () => ReleaseProbeSource | null, connectHost?: string, connectPort?: number) {
  const app = new URL(appOrigin), sockets = new Set<Socket>()
  async function destination(host: string, port: number, protocol: string) {
    const firstParty = host === app.hostname && port === Number(app.port || (app.protocol === 'https:' ? 443 : 80)) && protocol === app.protocol
    if (!firstParty && !(protocol === 'https:' && port === 443 && permittedMediaHost(host, getSource()))) throw new Error('Destination blocked')
    const answers = await lookup(firstParty ? connectHost || host : host, { all: true })
    if (!answers.length || (!firstParty && answers.some(row => !isPublicAddress(row.address)))) throw new Error('Destination blocked')
    return answers[0]!.address
  }
  const server = createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url ?? '')
      if (url.protocol !== 'http:' || url.origin !== appOrigin || !allowedBrowserUrl(url.href, appOrigin, getSource())) throw new Error('Destination blocked')
      const address = await destination(url.hostname, Number(url.port || 80), url.protocol)
      const upstream = request({ hostname: address, port: connectHost ? connectPort ?? Number(url.port || 80) : Number(url.port || 80), method: incoming.method, path: url.pathname + url.search,
        headers: { ...incoming.headers, host: url.host }, timeout: 15_000 }, response => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers); response.pipe(outgoing)
      })
      upstream.on('timeout', () => upstream.destroy())
      upstream.on('error', () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end() })
      incoming.pipe(upstream)
    } catch { outgoing.writeHead(403); outgoing.end() }
  })
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.setTimeout(90_000, () => socket.destroy()) })
  server.on('connect', (incoming, client, head) => {
    void (async () => {
      const target = new URL(`https://${incoming.url}`)
      if (target.username || target.password || target.pathname !== '/') throw new Error('Destination blocked')
      const address = await destination(target.hostname, Number(target.port || 443), 'https:')
      const upstream = connect(Number(target.port || 443), address)
      sockets.add(upstream); upstream.on('close', () => sockets.delete(upstream))
      upstream.setTimeout(90_000, () => upstream.destroy())
      upstream.on('connect', () => { client.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head.length) upstream.write(head); client.pipe(upstream); upstream.pipe(client) })
      upstream.on('error', () => client.destroy()); client.on('error', () => upstream.destroy()); client.on('close', () => upstream.destroy())
    })().catch(() => client.destroy())
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Proxy unavailable')
  return { url: `http://127.0.0.1:${address.port}`, close: async () => { sockets.forEach(socket => socket.destroy()); await new Promise<void>(resolve => server.close(() => resolve())) } }
}
