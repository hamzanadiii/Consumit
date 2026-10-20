import { createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto'

// Native implementation of cinecat.eu's x-az gate, reverse-engineered from the
// site's own player on 2026-10-18 by capturing its WebCrypto calls in a real
// headless session. The atlantic.st-vendored aphrodite-gate.ts speaks a retired
// dialect (client id "c":"a") whose challenge signature is rejected with 403,
// so this adapter mints tags itself:
//   K1        = SHA-256("aphrodite.z.v2" || salt)                [static]
//   challenge = POST /content/index {"c":"z",ts,n,s} with
//               s  = HMAC-SHA256(K1, "v2:z:{ts}:{n}")
//   response  = {"d"} where d = IV(12) || AES-GCM(seal, sessionJson) with
//               seal = HMAC-SHA256(K1, "aphrodite-seal-v2|{ts}|{n}")
//               sessionJson = {"exp","now","sid","skey"} (30-minute session)
//   headers   = x-az-id/sid, x-az-ts/session ts, x-az-nonce, and
//               x-az-tag = HMAC-SHA256(skey, "v2:{sid}:{path}:{ts}:{nonce}")

const SALT = Buffer.from('9ffe87cc9d08c07d06514dda26178f231461ddd11af17847988e5faccfc61cc7', 'hex')
const K1 = createHash('sha256').update('aphrodite.z.v2').update(SALT).digest()
const CLIENT_ID = 'z'
const REFERER = 'https://cinecat.eu/'
const SESSION_REFRESH_MARGIN_SECONDS = 60

export type CinecatGateOptions = {
  fetch?: typeof fetch
  now?: () => number
  randomHex?: (byteLength: number) => string
  timeoutMs?: number
}

type CinecatSession = { sid: string; skey: Buffer; ts: number; expAt: number }

let session: CinecatSession | null = null
let inFlight: Promise<CinecatSession> | null = null

function hexToBytes(hex: string): Buffer {
  return Buffer.from(hex, 'hex')
}

function parseSession(raw: unknown, ts: number): CinecatSession {
  const text = typeof raw === 'string' ? raw : ''
  const parsed = JSON.parse(text) as { exp?: unknown; sid?: unknown; skey?: unknown }
  const sid = typeof parsed.sid === 'string' ? parsed.sid : ''
  const skeyHex = typeof parsed.skey === 'string' ? parsed.skey : ''
  const exp = typeof parsed.exp === 'number' ? parsed.exp : 0
  if (!/^[0-9a-f]{32}$/.test(sid) || !/^[0-9a-f]{64}$/.test(skeyHex) || !Number.isFinite(exp)) {
    throw new Error('cinecat session blob is malformed')
  }
  return { sid, skey: hexToBytes(skeyHex), ts, expAt: exp }
}

async function requestSession(base: string, options: CinecatGateOptions): Promise<CinecatSession> {
  const doFetch = options.fetch ?? fetch
  const ts = Math.floor((options.now ?? Date.now)() / 1000)
  const randomHex = options.randomHex ?? ((byteLength: number) => randomBytes(byteLength).toString('hex'))
  const n = randomHex(8)
  const challenge = {
    c: CLIENT_ID,
    ts,
    n,
    s: createHmac('sha256', K1).update(`v2:${CLIENT_ID}:${ts}:${n}`).digest('hex'),
  }
  const res = await doFetch(`${base}/content/index`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', referer: REFERER },
    body: JSON.stringify(challenge),
    signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
  })
  if (!res.ok) throw new Error(`cinecat challenge HTTP ${res.status}`)
  const payload = (await res.json()) as { d?: unknown }
  const dHex = typeof payload.d === 'string' ? payload.d : ''
  if (dHex.length < 64 || dHex.length % 2 !== 0) throw new Error('cinecat challenge returned no session blob')
  const sealed = hexToBytes(dHex)
  if (sealed.length <= 12 + 16) throw new Error('cinecat session blob is too short')
  const seal = createHmac('sha256', K1).update(`aphrodite-seal-v2|${ts}|${n}`).digest()
  // d = IV(12) || ciphertext || GCM tag(16); node needs the tag set explicitly
  // (WebCrypto consumes it from the tail of the buffer automatically).
  const decipher = createDecipheriv('aes-256-gcm', seal, sealed.subarray(0, 12))
  decipher.setAuthTag(sealed.subarray(sealed.length - 16))
  let plain: Buffer
  try {
    plain = Buffer.concat([decipher.update(sealed.subarray(12, sealed.length - 16)), decipher.final()])
  } catch {
    throw new Error('cinecat session blob failed authentication')
  }
  return parseSession(plain.toString('utf8'), ts)
}

async function getSession(base: string, options: CinecatGateOptions): Promise<CinecatSession> {
  const nowSeconds = Math.floor((options.now ?? Date.now)() / 1000)
  if (session && session.expAt - SESSION_REFRESH_MARGIN_SECONDS > nowSeconds) return session
  if (!inFlight) {
    inFlight = requestSession(base, options).then(
      (fresh) => {
        session = fresh
        inFlight = null
        return fresh
      },
      (error: unknown) => {
        inFlight = null
        throw error
      },
    )
  }
  return inFlight
}

/** Mint x-az headers for a cdn.hls.lol content path (throws when the gate fails). */
export async function signCinecatRequest(base: string, path: string, options: CinecatGateOptions = {}): Promise<Record<string, string>> {
  const active = await getSession(base, options)
  const randomHex = options.randomHex ?? ((byteLength: number) => randomBytes(byteLength).toString('hex'))
  const nonce = randomHex(8)
  const tag = createHmac('sha256', active.skey).update(`v2:${active.sid}:${path}:${active.ts}:${nonce}`).digest('hex')
  return { 'x-az-id': active.sid, 'x-az-ts': String(active.ts), 'x-az-nonce': nonce, 'x-az-tag': tag }
}

/** Drop the cached 30-minute session (called after a 401/403 content answer). */
export function invalidateCinecatSession(): void {
  session = null
}
