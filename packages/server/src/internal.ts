import { timingSafeEqual } from 'node:crypto'
export type InternalFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>
import { z } from 'zod'
import { context, propagation } from '@opentelemetry/api'

export const internalConfigSchema = z.strictObject({
  origin: z.url().refine(value => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && url.origin === value && !url.username && !url.password } catch { return false } }),
  secret: z.string().min(32).max(256),
})
export type InternalConfig = z.infer<typeof internalConfigSchema>
export function authorizedInternal(actual: string | undefined, secret: string | undefined): boolean {
  if (!secret || !actual) return false
  const expected = Buffer.from(`Bearer ${secret}`), supplied = Buffer.from(actual)
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}
export function createInternalClient(config: InternalConfig, fetcher: InternalFetch = fetch) {
  internalConfigSchema.parse(config)
  return async function call(path: string, body: unknown, options: { signal?: AbortSignal; timeoutMs?: number; maximumBytes?: number } = {}): Promise<unknown> {
    if (!/^\/v1\/internal\/[a-z0-9/-]+$/.test(path)) throw new Error('Invalid internal operation.')
    const headers: Record<string, string> = { authorization: `Bearer ${config.secret}`, 'content-type': 'application/json' }
    propagation.inject(context.active(), headers)
    const payload = JSON.stringify(body)
    if (!payload || Buffer.byteLength(payload) > 1024 * 1024) throw new Error('Internal request exceeded its limit.')
    const response = await fetcher(new URL(path, config.origin), {
      method: 'POST', redirect: 'error', credentials: 'omit',
      headers, body: payload,
      signal: AbortSignal.any([AbortSignal.timeout(options.timeoutMs ?? 5000), ...(options.signal ? [options.signal] : [])]),
    })
    if (!response.ok) { await response.body?.cancel(); throw new Error('Internal operation unavailable.') }
    if (!response.body) throw new Error('Internal operation returned no response.')
    const reader = response.body.getReader(), chunks: Uint8Array[] = []
    let size = 0
    try {
      for (;;) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > (options.maximumBytes ?? 1024 * 1024)) { await reader.cancel(); throw new Error('Internal response exceeded its limit.') }; chunks.push(chunk.value) }
    } finally { reader.releaseLock() }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  }
}
export type InternalClient = ReturnType<typeof createInternalClient>
