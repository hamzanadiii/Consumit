import type { ProviderHttp } from '@consumit/provider-sdk'
import { fetchMedia, type MediaTransport } from './transport.ts'

/** Resolution documents use the same destination protections as media, with a hard body cap. */
export function createProviderHttp(hosts: readonly string[], transport: MediaTransport = fetchMedia, relayDiscovery = false): ProviderHttp {
  const http: ProviderHttp = async (url, headers, signal, init) => {
    const requestSize = typeof init?.body === 'string' ? Buffer.byteLength(init.body) : init?.body?.byteLength ?? 0
    if (requestSize > 65_536) throw new Error('Provider request exceeds its limit.')
    const prefixLimit = init?.readPrefixBytes
    if (prefixLimit !== undefined && (!Number.isInteger(prefixLimit) || prefixLimit < 1 || prefixLimit > 65_536)) {
      throw new Error('Provider response prefix limit is invalid.')
    }
    const response = await transport(url, hosts, headers, signal, init?.method === 'POST' ? { method: 'POST', body: init.body ?? '' } : undefined)
    const abort = () => response.body.destroy(new Error('Provider request cancelled.'))
    signal.addEventListener('abort', abort, { once: true })
    try {
      signal.throwIfAborted()
      const length = Number(response.headers.get('content-length'))
      if (prefixLimit === undefined && length > 1_048_576) throw new Error('Provider document exceeds its limit.')
      if (response.headers.get('content-encoding') && response.headers.get('content-encoding') !== 'identity') throw new Error('Unsupported provider document encoding.')
      const chunks: Buffer[] = []
      let size = 0
      const limit = prefixLimit ?? 1_048_576
      for await (const chunk of response.body) {
        signal.throwIfAborted()
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        const remaining = limit - size
        if (bytes.length > remaining) {
          if (prefixLimit === undefined) throw new Error('Provider document exceeds its limit.')
          if (remaining > 0) chunks.push(bytes.subarray(0, remaining))
          size = limit
          break
        }
        chunks.push(bytes)
        size += bytes.length
        if (prefixLimit !== undefined && size >= prefixLimit) break
      }
      signal.throwIfAborted()
      const bytes = Buffer.concat(chunks)
      return { status: response.status, url: response.url, text: bytes.toString('utf8'), bytes, headers: response.headers }
    } finally { signal.removeEventListener('abort', abort); response.body.destroy() }
  }
  if (relayDiscovery) http.mediaScope = (destinations) => {
    if (!destinations.length || destinations.length > 8 || destinations.some(host => !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host))) throw new Error('Invalid discovered media scope.')
    return createProviderHttp(destinations, transport)
  }
  return http
}
