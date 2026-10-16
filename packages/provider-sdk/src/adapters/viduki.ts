import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { accessDeadline, adapter, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'

const SITE = 'https://www.viduki.net'
const API = 'https://api.viduki.net'

// Viduki.net — iframe API service backed by api.viduki.net. Resolution is a
// staged handshake against their anti-automation wall:
//   1. GET api/altcha-challenge -> SHA-256 proof-of-work {challenge,salt,
//      maxnumber}; the solution travels base64 JSON as `x-altcha`.
//   2. GET /bootstrap (x-altcha) -> page nonce.
//   3. Fresh altcha -> GET /pepper-key (x-altcha + x-nonce) -> AES-GCM
//      pepper envelope {bucket,iv,tag,ct}.
//   4. GET /main/servers (open) -> server cascade.
//   5. GET /main/{movie/{tmdb}|tv/{tmdb}/{s}/{e}}?srv=X with x-nonce,
//      x-client-nonce + x-request-id -> encrypted envelope, decrypted with
//      the site's own makima WASM module ({stream:{url}}).
// Streams are single-level HLS on rotating hosts, Origin-allowlisted to the
// site with no CORS headers for anyone else, so masters always cross through
// the approved Worker relay with the site Origin/Referer. Resolution is pure
// API: the provider's popunder page never loads. The WASM module executes in
// the standard WebAssembly sandbox with a single abort import; only the
// mapped export names are called.
const MAX_POW_ITERATIONS = 2_000_000

const challengeSchema = z.object({
  challenge: z.string().max(256).nullish(),
  salt: z.string().max(256).nullish(),
  maxnumber: z.number().nullish(),
  algorithm: z.string().max(32).nullish(),
  signature: z.string().max(1024).nullish(),
}).passthrough()
const bootstrapSchema = z.object({ n: z.string().max(256).nullish() }).passthrough()
const pepperSchema = z.object({
  bucket: z.union([z.string().max(64), z.number()]).nullish(),
  iv: z.string().max(512).nullish(),
  tag: z.string().max(512).nullish(),
  ct: z.string().max(1_000_000).nullish(),
}).passthrough()
const manifestSchema = z.object({
  url: z.string().max(4096).nullish(),
  exports: z.record(z.string(), z.string().max(128)).nullish(),
}).passthrough()
const serverSchema = z.object({ name: z.string().max(64) }).passthrough()
const envelopeSchema = z.object({
  sn: z.string().max(512).nullish(),
  tb: z.union([z.string().max(64), z.number()]).nullish(),
  iv1: z.string().max(512).nullish(),
  iv2: z.string().max(512).nullish(),
  wk: z.string().max(1024).nullish(),
  tag1: z.string().max(512).nullish(),
  tag2: z.string().max(512).nullish(),
  ct: z.string().max(1_000_000).nullish(),
}).passthrough()

type WasmModule = { exports: Record<string, string>; instance: Record<string, (...args: number[]) => number> }

function baseHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'user-agent': userAgent,
    accept: 'application/json, text/plain, */*',
    origin: SITE,
    referer: `${SITE}/`,
    ...extra,
  }
}

function hexToBytes(value: string): Uint8Array {
  const clean = value.length % 2 ? `0${value}` : value
  const out = new Uint8Array(clean.length / 2)
  for (let index = 0; index < out.length; index++) out[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16)
  return out
}

function bigEndian64(value: bigint): Uint8Array {
  const out = new Uint8Array(8)
  new DataView(out.buffer).setBigInt64(0, value, false)
  return out
}

function findStreamUrl(plain: string): string {
  try {
    const direct = (JSON.parse(plain) as { stream?: { url?: unknown } })?.stream?.url
    if (typeof direct === 'string' && /^https?:\/\//i.test(direct) && direct.length <= 4096) return direct
  } catch {
    // fall through to the scan
  }
  const match = /https?:\/\/[^\s"'\\]+?\.(?:m3u8|mp4)[^\s"'\\]*/i.exec(plain)
  const found = match?.[0]
  return found && found.length <= 4096 ? found : ''
}

/** Port of the supplied Viduki recipe. Every upstream document is validated
 *  before use; any rejection degrades to "no source" without retries. */
export function createVidukiProvider(http: ProviderHttp, now = Date.now) {
  async function json(url: string, signal: AbortSignal, headers: Record<string, string> = {}): Promise<unknown | null> {
    let response
    try {
      response = await http(url, baseHeaders(headers), signal)
    } catch {
      return null
    }
    if (!response || response.status < 200 || response.status >= 300) return null
    try {
      return JSON.parse(response.text) as unknown
    } catch {
      return null
    }
  }

  async function solveAltcha(challenge: unknown, signal: AbortSignal): Promise<string | null> {
    const parsed = challengeSchema.safeParse(challenge)
    if (!parsed.success || !parsed.data.challenge) return null
    const salt = Buffer.from(String(parsed.data.salt ?? ''), 'utf8')
    const target = String(parsed.data.challenge)
    const max = Math.min(Math.max(1, Math.floor(Number(parsed.data.maxnumber) || 1_000_000)), MAX_POW_ITERATIONS)
    for (let number = 0; number <= max; number++) {
      if (signal.aborted) return null
      const digest = createHash('sha256').update(Buffer.concat([salt, Buffer.from(String(number))])).digest('hex')
      if (digest === target) {
        return Buffer.from(JSON.stringify({
          algorithm: parsed.data.algorithm ?? 'SHA-256',
          challenge: target,
          number,
          salt: parsed.data.salt,
          signature: parsed.data.signature,
          took: 50,
        })).toString('base64')
      }
      if (number % 4095 === 0) await new Promise((resolve) => setImmediate(resolve))
    }
    return null
  }

  async function loadWasm(signal: AbortSignal): Promise<WasmModule | null> {
    try {
      const manifest = manifestSchema.safeParse(await json(`${SITE}/makima-manifest.json`, signal))
      if (!manifest.success || !manifest.data.url || !manifest.data.exports) return null
      const wasmUrl = manifest.data.url.startsWith('http') ? manifest.data.url : SITE + manifest.data.url
      let response
      try {
        response = await http(wasmUrl, { 'user-agent': userAgent, referer: `${SITE}/` }, signal)
      } catch {
        return null
      }
      if (!response || response.status < 200 || response.status >= 300 || !response.bytes || response.bytes.length > 1_048_576) return null
      const { instance } = await WebAssembly.instantiate(new Uint8Array(response.bytes), {
        env: { abort: () => { throw new Error('makima abort') } },
      })
      return { exports: manifest.data.exports, instance: instance.exports as WasmModule['instance'] }
    } catch {
      return null
    }
  }

  function decryptEnvelope(module: WasmModule, nonce: string, pepper: z.infer<typeof pepperSchema>, clientNonce: string, requestId: string, envelope: z.infer<typeof envelopeSchema>): string | null {
    try {
      if (pepper.bucket == null || !pepper.iv || !pepper.ct || !pepper.tag) return null
      if (!envelope.sn || envelope.tb == null || !envelope.iv1 || !envelope.iv2 || !envelope.wk || !envelope.tag1 || !envelope.tag2 || !envelope.ct) return null
      const fns: Record<string, (...args: number[]) => number> = {}
      for (const name of ['alloc', 'writeByte', 'readByte', 'reset', 'decryptPepper', 'decryptEnvelope'] as const) {
        const key = module.exports[name]
        const fn = key === undefined ? undefined : module.instance[key]
        if (typeof fn !== 'function') return null
        fns[name] = fn as (...args: number[]) => number
      }
      const alloc = fns['alloc'] ?? ((() => { throw new Error('unreachable') }) as (...args: number[]) => number)
      const writeByte = fns['writeByte'] ?? alloc
      const readByte = fns['readByte'] ?? alloc
      const reset = fns['reset'] ?? alloc
      const decryptPepper = fns['decryptPepper'] ?? alloc
      const decryptEnvelopeFn = fns['decryptEnvelope'] ?? alloc
      const put = (bytes: Uint8Array): number => {
        const pointer = alloc(bytes.length)
        for (let index = 0; index < bytes.length; index++) writeByte(pointer, index, bytes[index] ?? 0)
        return pointer
      }
      const get = (pointer: number, length: number): Uint8Array => {
        const out = new Uint8Array(length)
        for (let index = 0; index < length; index++) out[index] = readByte(pointer, index)
        return out
      }
      reset()
      const pepperResult = decryptPepper(
        put(hexToBytes(nonce)), hexToBytes(nonce).length,
        put(bigEndian64(BigInt(pepper.bucket))), 8,
        put(hexToBytes(pepper.iv)), hexToBytes(pepper.iv).length,
        put(hexToBytes(pepper.ct)), hexToBytes(pepper.ct).length,
        put(hexToBytes(pepper.tag)), hexToBytes(pepper.tag).length,
      )
      if (!(pepperResult > 0)) return null
      reset()
      const clientBytes = hexToBytes(clientNonce)
      const serverBytes = hexToBytes(envelope.sn)
      const bucketBytes = bigEndian64(BigInt(envelope.tb))
      const requestBytes = hexToBytes(requestId)
      const iv2 = hexToBytes(envelope.iv2)
      const wk = hexToBytes(envelope.wk)
      const tag2 = hexToBytes(envelope.tag2)
      const iv1 = hexToBytes(envelope.iv1)
      const ct = hexToBytes(envelope.ct)
      const tag1 = hexToBytes(envelope.tag1)
      const out = alloc(ct.length)
      const length = decryptEnvelopeFn(
        put(clientBytes), clientBytes.length,
        put(serverBytes), serverBytes.length,
        put(bucketBytes), 8,
        put(requestBytes), requestBytes.length,
        put(iv2), iv2.length,
        put(wk), wk.length,
        put(tag2), tag2.length,
        put(iv1), iv1.length,
        put(ct), ct.length,
        put(tag1), tag1.length,
        out,
      )
      if (!(length > 0)) return null
      return new TextDecoder().decode(get(out, length))
    } catch {
      return null
    }
  }

  return adapter('viduki', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'movie' && ref.kind !== 'series') throw new ProviderFailure('empty')
    const tmdb = String(ref.id).trim()
    if (!tmdb) throw new ProviderFailure('empty')
    const path = ref.kind === 'movie'
      ? `/main/movie/${encodeURIComponent(tmdb)}`
      : `/main/tv/${encodeURIComponent(tmdb)}/${ref.season}/${ref.episode}`

    const first = await json(`${API}/altcha-challenge`, signal)
    const proof1 = await solveAltcha(first, signal)
    if (!proof1) throw new ProviderFailure('empty')
    const boot = bootstrapSchema.safeParse(await json(`${API}/bootstrap`, signal, { 'x-altcha': proof1 }))
    const nonce = boot.success ? boot.data.n ?? null : null
    if (!nonce) throw new ProviderFailure('empty')

    const second = await json(`${API}/altcha-challenge`, signal)
    const proof2 = await solveAltcha(second, signal)
    if (!proof2) throw new ProviderFailure('empty')
    const pepper = pepperSchema.safeParse(await json(`${API}/pepper-key`, signal, { 'x-altcha': proof2, 'x-nonce': nonce }))
    if (!pepper.success || pepper.data.ct === undefined || pepper.data.bucket === undefined) throw new ProviderFailure('empty')

    const module = await loadWasm(signal)
    if (!module) throw new ProviderFailure('empty')

    const servers = z.array(z.unknown()).max(32).safeParse(await json(`${API}/main/servers`, signal))
    if (!servers.success) throw new ProviderFailure('empty')
    const names: string[] = []
    for (const entry of servers.data) {
      const parsed = serverSchema.safeParse(entry)
      if (parsed.success) names.push(parsed.data.name)
    }
    if (!names.length) throw new ProviderFailure('empty')
    const clientNonce = randomBytes(16).toString('hex')
    const requestId = randomBytes(16).toString('hex')
    const playHeaders = baseHeaders()
    for (const name of names) {
      if (signal.aborted) throw new ProviderFailure('empty')
      const envelope = envelopeSchema.safeParse(await json(`${API}${path}?srv=${encodeURIComponent(name)}`, signal, {
        'x-nonce': nonce,
        'x-client-nonce': clientNonce,
        'x-request-id': requestId,
      }))
      if (!envelope.success) continue
      const plain = decryptEnvelope(module, nonce, pepper.data, clientNonce, requestId, envelope.data)
      if (!plain) continue
      const streamUrl = findStreamUrl(plain)
      if (!streamUrl || !/^https:\/\//i.test(streamUrl)) continue
      let expiresAt: string
      try {
        expiresAt = accessDeadline(streamUrl, now())
      } catch {
        continue
      }
      return [{
        key: 'viduki:0',
        url: streamUrl,
        type: 'hls',
        headers: playHeaders,
        expiresAt,
        expiryEstimated: true,
        language: 'original',
        qualityHint: 'Auto',
        subtitles: [],
      }]
    }
    throw new ProviderFailure('empty')
  })
}
