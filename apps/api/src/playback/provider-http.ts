import type { ProviderHttp } from '@consumit/provider-sdk'
import { fetchMedia, type MediaTransport } from './transport.ts'

/** Resolution documents use the same destination protections as media, with a hard body cap. */
export function createProviderHttp(hosts: readonly string[], transport: MediaTransport = fetchMedia): ProviderHttp {
  return async (url, headers, signal, init) => {
    if (init?.body && init.body.length > 65_536) throw new Error('Provider request exceeds its limit.')
    const response = await transport(url, hosts, headers, signal, init?.method === 'POST' ? { method: 'POST', body: init.body ?? '' } : undefined)
    const abort = () => response.body.destroy(new Error('Provider request cancelled.'))
    signal.addEventListener('abort', abort, { once: true })
    try {
      signal.throwIfAborted()
      const length = Number(response.headers.get('content-length'))
      if (length > 1_048_576) throw new Error('Provider document exceeds its limit.')
      if (response.headers.get('content-encoding') && response.headers.get('content-encoding') !== 'identity') throw new Error('Unsupported provider document encoding.')
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of response.body) {
        signal.throwIfAborted()
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        size += bytes.length
        if (size > 1_048_576) throw new Error('Provider document exceeds its limit.')
        chunks.push(bytes)
      }
      signal.throwIfAborted()
      return { status: response.status, url: response.url, text: Buffer.concat(chunks).toString('utf8'), headers: response.headers }
    } finally { signal.removeEventListener('abort', abort); response.body.destroy() }
  }
}
