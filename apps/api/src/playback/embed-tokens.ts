import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const EXPIRY_MS = 24 * 60 * 60 * 1000 // 24 hours

export function createEmbedToken(secret: string, url: string, domain: string): string {
  const expires = Date.now() + EXPIRY_MS
  const payload = `${url}|${domain}|${expires}`
  const sig = createHmac('sha256', secret).update(payload).digest('hex')
  return `${expires}.${sig}`
}

export function verifyEmbedToken(secret: string, url: string, domain: string, token: string): boolean {
  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [expiresStr, sig] = parts as [string, string]
  const expires = Number(expiresStr)
  if (Date.now() > expires) return false
  const payload = `${url}|${domain}|${expires}`
  const expected = createHmac('sha256', secret).update(payload).digest('hex')
  if (sig.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))
}

export function isEmbedDomainAllowed(domain: string, allowedDomains: string): boolean {
  if (!allowedDomains) return true
  const domains = allowedDomains.split(',').map((d) => d.trim().toLowerCase())
  return domains.some((pattern) => {
    if (pattern.startsWith('*.')) {
      return domain.endsWith(pattern.slice(1)) || domain === pattern.slice(2)
    }
    return domain === pattern
  })
}
