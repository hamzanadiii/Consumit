import { createPublicKey, verify as verifySignature, type JsonWebKey } from 'node:crypto'

import { normalizeEmail } from './identity.ts'

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const GOOGLE_JWKS_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/certs'
const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com'])
const CLOCK_SKEW_SECONDS = 60
const MAX_ID_TOKEN_AGE_SECONDS = 10 * 60

type GoogleJwk = JsonWebKey & { kid: string; alg?: string; kty: 'RSA'; n: string; e: string; use?: string }
type GoogleClaims = {
  aud?: string | string[]
  azp?: string
  email?: string
  email_verified?: boolean | string
  exp?: number
  hd?: string
  iat?: number
  iss?: string
  name?: string
  nonce?: string
  sub?: string
}
type VerifiedGoogleClaims = GoogleClaims & { email: string; sub: string }

export type VerifiedGoogleIdentity = {
  email: string
  emailAuthoritative: boolean
  googleSubject: string
  name: string | null
}

let jwksCache: { expiresAt: number; keys: GoogleJwk[] } | null = null
let jwksRequest: Promise<GoogleJwk[]> | null = null

function decodeJwtPart<T>(value: string): T {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T
}

function cacheExpiry(headers: Headers): number {
  const maxAge = /(?:^|,)\s*max-age=(\d+)/i.exec(headers.get('cache-control') ?? '')?.[1]
  const seconds = maxAge ? Math.min(86_400, Math.max(60, Number(maxAge))) : 3_600
  return Date.now() + seconds * 1_000
}

async function googleSigningKeys(forceRefresh = false): Promise<GoogleJwk[]> {
  if (!forceRefresh && jwksCache && jwksCache.expiresAt > Date.now()) return jwksCache.keys
  if (jwksRequest) return jwksRequest
  jwksRequest = (async () => {
    const response = await fetch(GOOGLE_JWKS_ENDPOINT, { signal: AbortSignal.timeout(5_000) })
    if (!response.ok) throw new Error('Google signing keys are unavailable.')
    const result = await response.json() as { keys?: unknown }
    if (!Array.isArray(result.keys)) throw new Error('Google signing keys are invalid.')
    const keys = result.keys.filter((key): key is GoogleJwk => {
      if (!key || typeof key !== 'object') return false
      const candidate = key as Partial<GoogleJwk>
      return typeof candidate.kid === 'string' && typeof candidate.n === 'string' && typeof candidate.e === 'string'
        && candidate.kty === 'RSA' && (!candidate.alg || candidate.alg === 'RS256')
        && (!candidate.use || candidate.use === 'sig')
    })
    if (!keys.length) throw new Error('Google signing keys are invalid.')
    jwksCache = { expiresAt: cacheExpiry(response.headers), keys }
    return keys
  })()
  try {
    return await jwksRequest
  } finally {
    jwksRequest = null
  }
}

async function verifiedClaims(idToken: string, input: { audience: string; nonce: string }): Promise<VerifiedGoogleClaims> {
  const parts = idToken.split('.')
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error('Google returned an invalid identity token.')
  const header = decodeJwtPart<{ alg?: string; kid?: string; typ?: string }>(parts[0]!)
  if (header.alg !== 'RS256' || (header.typ !== undefined && header.typ !== 'JWT')
      || typeof header.kid !== 'string' || header.kid.length > 256) {
    throw new Error('Google returned an unsupported identity token.')
  }

  let jwk = (await googleSigningKeys()).find((key) => key.kid === header.kid)
  if (!jwk) jwk = (await googleSigningKeys(true)).find((key) => key.kid === header.kid)
  if (!jwk) throw new Error('Google identity token key was not recognized.')

  const signedContent = Buffer.from(`${parts[0]}.${parts[1]}`, 'utf8')
  const signature = Buffer.from(parts[2]!, 'base64url')
  if (!verifySignature('RSA-SHA256', signedContent, createPublicKey({ key: jwk, format: 'jwk' }), signature)) {
    throw new Error('Google identity token signature did not match.')
  }

  const claims = decodeJwtPart<GoogleClaims>(parts[1]!)
  const now = Math.floor(Date.now() / 1_000)
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  const emailVerified = claims.email_verified === true || claims.email_verified === 'true'
  const email = typeof claims.email === 'string' ? normalizeEmail(claims.email) : ''
  const subject = claims.sub
  if (!GOOGLE_ISSUERS.has(claims.iss ?? '')
      || !audiences.includes(input.audience)
      || (audiences.length > 1 && claims.azp !== input.audience)
      || (claims.azp !== undefined && claims.azp !== input.audience)
      || typeof claims.exp !== 'number' || claims.exp <= now - CLOCK_SKEW_SECONDS
      || typeof claims.iat !== 'number' || claims.exp <= claims.iat
      || claims.iat > now + CLOCK_SKEW_SECONDS || claims.iat < now - MAX_ID_TOKEN_AGE_SECONDS
      || claims.nonce !== input.nonce
      || typeof subject !== 'string' || !/^[\x21-\x7e]{1,255}$/.test(subject)
      || !emailVerified || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Google identity token claims did not pass validation.')
  }
  return { ...claims, email, sub: subject }
}

export async function exchangeGoogleAuthorizationCode(input: {
  audience: string
  clientId: string
  clientSecret: string
  code: string
  codeVerifier: string
  nonce: string
  redirectUri: string
}): Promise<VerifiedGoogleIdentity> {
  const form = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    code: input.code,
    code_verifier: input.codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: input.redirectUri,
  })
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    body: form,
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    method: 'POST',
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) throw new Error('Google authorization code exchange failed.')
  const tokens = await response.json() as { id_token?: unknown }
  if (typeof tokens.id_token !== 'string' || tokens.id_token.length > 16_384) throw new Error('Google did not return an identity token.')
  const claims = await verifiedClaims(tokens.id_token, input)
  const domain = claims.email.split('@')[1] ?? ''
  const hostedDomain = typeof claims.hd === 'string' ? claims.hd.toLowerCase() : ''
  return {
    email: normalizeEmail(claims.email),
    emailAuthoritative: domain === 'gmail.com' || hostedDomain.length > 0,
    googleSubject: claims.sub,
    name: typeof claims.name === 'string' ? claims.name.trim().replace(/\s+/g, ' ').slice(0, 80) || null : null,
  }
}
