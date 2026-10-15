import { lookup } from 'node:dns/promises'
import type { LookupAddress } from 'node:dns'
import { request } from 'node:https'
import { BlockList, isIP } from 'node:net'
import { pipeline, type Readable } from 'node:stream'
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib'
import { allowedMediaUrl } from '@consumit/provider-sdk'

const blocked = new BlockList()
for (const [ip, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) blocked.addSubnet(ip, prefix, 'ipv4')
const globalV6 = new BlockList()
globalV6.addSubnet('2000::', 3, 'ipv6')
blocked.addSubnet('2001:db8::', 32, 'ipv6')
blocked.addSubnet('2001::', 32, 'ipv6')
blocked.addSubnet('2002::', 16, 'ipv6')

export function publicAddress(address: string) {
  const family = isIP(address)
  return family === 4 ? !blocked.check(address, 'ipv4') : family === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6')
}

export type MediaResponse = { status: number; headers: Headers; body: Readable; url: string }
export type MediaRequest = { method?: 'POST' | 'HEAD'; body?: string | Uint8Array }
/** `patterns` carries the row's configured flux-host regexes so the
 *  destination gate admits rotating provider CDNs (e.g. KissKH's hlsN
 *  masters) while still failing closed on anything else. */
export type MediaTransport = (url: string, hosts: readonly string[], headers: Record<string, string>, signal: AbortSignal, init?: MediaRequest, patterns?: readonly RegExp[]) => Promise<MediaResponse>

/** Bounded DNS reuse avoids multiplying uncancellable OS lookups across
 * concurrent adapter hops. Every socket still pins a validated public IP. */
export function createMediaTransport(): MediaTransport {
  const cached = new Map<string, { addresses: LookupAddress[]; until: number }>()
  const pending = new Map<string, Promise<{ address: string; family: number }[]>>()
  function addressesFor(host: string): Promise<{ address: string; family: number }[]> {
    const hit = cached.get(host)
    if (hit && hit.until > Date.now()) return Promise.resolve(hit.addresses)
    const existing = pending.get(host)
    if (existing) return existing
    if (pending.size >= 32) return Promise.reject(new Error('Media DNS is busy.'))
    const work = lookup(host, { all: true }).then((addresses) => {
      if (!addresses.length || addresses.some((entry) => !publicAddress(entry.address))) throw new Error('Blocked media address.')
      if (cached.size >= 128) cached.delete(cached.keys().next().value!)
      cached.set(host, { addresses, until: Date.now() + 60_000 })
      return addresses
    }).finally(() => pending.delete(host))
    pending.set(host, work)
    return work
  }
  return async (value, hosts, headers, signal, init, patterns) => {
    let current = value
    let forwarded = { ...headers }
    let method = init?.method ?? 'GET'
    let body: string | Uint8Array | undefined = init?.body
    for (let redirect = 0; redirect <= 3; redirect++) {
      if (!allowedMediaUrl(current, hosts, patterns)) throw new Error('Blocked media destination.')
      signal.throwIfAborted()
      const url = new URL(current)
      let dnsTimer: ReturnType<typeof setTimeout> | undefined
      let abort: (() => void) | undefined
      const addresses = await Promise.race([
        addressesFor(url.hostname),
        new Promise<never>((_, reject) => {
          abort = () => reject(signal.reason)
          signal.addEventListener('abort', abort, { once: true })
          dnsTimer = setTimeout(() => reject(new Error('Media DNS timed out.')), 3000)
          dnsTimer.unref()
        }),
      ]).finally(() => {
        clearTimeout(dnsTimer)
        if (abort) signal.removeEventListener('abort', abort)
      })
      signal.throwIfAborted()
      if (!addresses.length || addresses.some((entry) => !publicAddress(entry.address))) throw new Error('Blocked media address.')
      const address = addresses[0]!
      const response = await new Promise<MediaResponse>((resolve, reject) => {
        const req = request(url, {
          method, signal, headers: { ...forwarded, 'accept-encoding': 'identity' },
          lookup: (_hostname, options, callback) => {
            if (options.all) callback(null, [address])
            else callback(null, address.address, address.family)
          },
        }, (res) => {
          const resultHeaders = new Headers()
          for (const [key, entry] of Object.entries(res.headers)) {
            if (Array.isArray(entry)) entry.forEach((item) => resultHeaders.append(key, item))
            else if (entry !== undefined) resultHeaders.set(key, entry)
          }
          // Upstreams (notably Cloudflare-fronted JSON APIs) compress even when
          // asked for identity. Decode the known codings so resolution documents
          // and manifests arrive as plain bytes; the body cap downstream still
          // bounds decompressed output, and anything else stays rejected.
          const encoding = res.headers['content-encoding']
          let body: Readable = res
          if (encoding !== undefined && encoding !== 'identity') {
            const decoder = encoding === 'gzip' ? createGunzip()
              : encoding === 'deflate' ? createInflate()
              : encoding === 'br' ? createBrotliDecompress() : null
            if (!decoder) {
              res.destroy()
              reject(new Error('Unsupported provider document encoding.'))
              return
            }
            // A consumer may stop after a bounded prefix or hit its body cap.
            // pipeline closes the upstream socket too and propagates truncated
            // or errored input to the decoded readable.
            body = decoder
            pipeline(res, decoder, () => { /* The body consumer observes stream errors. */ })
            resultHeaders.delete('content-encoding')
            resultHeaders.delete('content-length')
          }
          resolve({ status: res.statusCode ?? 502, headers: resultHeaders, body, url: current })
        })
        req.setTimeout(15000, () => req.destroy(new Error('Media transfer stalled.')))
        req.on('error', reject)
        if (body !== undefined) req.write(body)
        req.end()
      })
      if (![301, 302, 303, 307, 308].includes(response.status)) return response
      response.body.destroy()
      const location = response.headers.get('location')
      if (!location) throw new Error('Invalid media redirect.')
      const next = new URL(location, current)
      if (next.hostname !== url.hostname) forwarded = Object.fromEntries(Object.entries(forwarded).filter(([name]) => !/^(cookie|authorization)$/i.test(name)))
      // Standard browser behavior: a redirect restarts as GET without a body
      // (307/308 preservation is unnecessary for resolution documents).
      method = 'GET'; body = undefined
      current = next.href
    }
    throw new Error('Too many media redirects.')
  }
}
export const fetchMedia = createMediaTransport()
