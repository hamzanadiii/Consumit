import { allowedMediaUrl } from '@consumit/provider-sdk'
import type { MediaResponse, MediaTransport } from '../../../apps/api/src/playback/transport.ts'

/** Worker-only transport. Every redirect is independently scoped and credentials
 * are stripped on host changes. No Node sockets or VPS callback exists. */
export function createEdgeTransport(options: { fetch?: typeof fetch; maxRequests?: number } = {}): MediaTransport {
  let requests = 0
  return async (value, hosts, headers, signal, init, patterns) => {
    let url = new URL(value), outgoing = new Headers({ ...headers, 'accept-encoding': 'identity' })
    let method = init?.method ?? 'GET', body = init?.body
    const approved = (target: URL) => {
      if (!allowedMediaUrl(target, hosts, patterns) || target.port && target.port !== '443' ||
        !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(target.hostname) || /(?:^|\.)(?:localhost|local|internal|invalid|test)$/i.test(target.hostname)) throw new Error('Blocked provider destination.')
    }
    for (let redirects = 0; redirects <= 3; redirects++) {
      signal.throwIfAborted(); approved(url)
      if (++requests > (options.maxRequests ?? 50)) throw new Error('Edge request budget exhausted.')
      const response = await (options.fetch ?? fetch)(url, { method, headers: outgoing, ...(body ? { body: typeof body === 'string' ? body : new Uint8Array(body) } : {}), redirect: 'manual', signal, cache: 'no-store' })
      if (![301, 302, 303, 307, 308].includes(response.status)) {
        const reader = response.body?.getReader()
        let destroyed = false
        const stream = {
          async *[Symbol.asyncIterator]() {
            if (!reader) return
            try { while (!destroyed) { const part = await reader.read(); if (part.done) break; yield part.value } }
            finally { await reader.cancel().catch(() => undefined) }
          },
          destroy() { destroyed = true; void reader?.cancel().catch(() => undefined) },
        }
        return { status: response.status, headers: response.headers, url: url.href, body: stream as unknown as MediaResponse['body'] }
      }
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (!location || redirects === 3) throw new Error('Invalid provider redirect.')
      const next = new URL(location, url); approved(next)
      if (next.hostname !== url.hostname) outgoing = new Headers([...outgoing].filter(([name]) => !/^(?:cookie|authorization)$/i.test(name)))
      if (response.status === 303 || (response.status === 301 || response.status === 302) && method === 'POST') { method = 'GET'; body = undefined }
      url = next
    }
    throw new Error('Too many provider redirects.')
  }
}
