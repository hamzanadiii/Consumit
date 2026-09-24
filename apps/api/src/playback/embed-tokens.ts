import { createHmac } from 'node:crypto'
import type { ProviderRegistration } from '@consumit/provider-sdk'

const EXPIRY_MS = 4 * 60 * 60 * 1000

export type ProxyGrant = {
  v: 1
  url: string
  host: string
  hosts: string[]
  patterns: string[]
  headers: { referer?: string; origin?: string }
  expires: number
}

function signature(secret: string, encoded: string): string {
  return createHmac('sha256', secret).update(encoded).digest('hex')
}

/** URL, destinations, and provider headers are all covered by the signature. */
export function createProxyGrant(secret: string, grant: Omit<ProxyGrant, 'v' | 'expires'>, expires = Date.now() + EXPIRY_MS): string {
  const encoded = Buffer.from(JSON.stringify({ v: 1, ...grant, expires } satisfies ProxyGrant)).toString('base64url')
  return `${encoded}.${signature(secret, encoded)}`
}

export function proxyUrl(workerUrl: string, secret: string, url: string, registration: ProviderRegistration, headers: Record<string, string> = {}): string {
  const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]))
  const grant = createProxyGrant(secret, {
    url,
    host: new URL(workerUrl).hostname,
    hosts: [...registration.mediaHosts],
    patterns: registration.mediaHostPatterns?.map((pattern) => pattern.source) ?? [],
    headers: {
      ...(normalized.referer ? { referer: normalized.referer } : {}),
      ...(normalized.origin ? { origin: normalized.origin } : {}),
    },
  })
  return `${workerUrl.replace(/\/$/, '')}/proxy?token=${encodeURIComponent(grant)}`
}
