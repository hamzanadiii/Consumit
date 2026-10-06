import { createDecipheriv, generateKeyPairSync, sign } from 'node:crypto'
import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'
import type { AnimeTitleResolver } from './anixo.ts'

const siteOrigin = 'https://animekai.stream'
const embedOrigin = 'https://mfw09.org'

// Port of the PROVE AnimeKai recipe (verified live 2026-09-25): the site
// search resolves the canonical title to a slug, the episode page lists
// sub/dub servers, and mfw09 serves the media through an attested playback
// chain — P-256 device attestation, a proof-of-work captcha, an AES-256-GCM
// playback payload. The upstream proof-of-work bundle is never fetched or
// executed: its hash is ported natively below (custom ARX sponge over a
// SHA-256 IV; the advertised `sha256-leading-zero-bits` label does not match
// what their verifier accepts). The decrypted edge HLS answers 200 ACAO *.

const SEARCH_MS = 5000
const PAGE_MS = 6000
const CHAIN_MS = 14_000
const POW_TIMEOUT_MS = 10_000

interface ServerPick {
  code: string
  media: 'sub' | 'dub'
  host: string
}

const searchSchema = z.object({
  ok: z.boolean().optional(),
  results: z.array(z.object({ slug: z.string().max(256), title: z.string().max(512) })).default([]),
})
const challengeSchema = z.object({ challenge_id: z.string().max(256), nonce: z.string().max(512) })
const attestSchema = z.object({
  token: z.string().max(8192),
  viewer_id: z.string().max(256),
  device_id: z.string().max(256),
})
const captchaSchema = z.object({
  pow_nonce: z.string().max(512),
  pow_difficulty: z.number().int().min(0).max(64).optional(),
  pow_token: z.string().max(8192),
})
const verifySchema = z.object({ token: z.string().max(8192) })
const playbackPayloadSchema = z.object({
  iv: z.string().max(256),
  payload: z.string().max(65_536),
  key_parts: z.array(z.string().max(512)).min(1).max(64),
  version: z.string().max(8).optional(),
})
const playbackConfigSchema = z.object({
  sources: z.array(z.object({
    url: z.string().max(4096),
    label: z.string().max(32).optional(),
  }).passthrough()).default([]),
  tracks: z.array(z.object({
    label: z.string().max(128).optional(),
    kind: z.string().max(64).optional(),
    file: z.string().max(4096).optional(),
    src: z.string().max(4096).optional(),
    url: z.string().max(4096).optional(),
  }).passthrough()).default([]),
  expires_at: z.string().max(64).optional(),
})

/** Title similarity for search-result matching (0..1), from the PROVE base recipe. */
function titleScore(a: string, b: string): number {
  const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
  const x = norm(a)
  const y = norm(b)
  if (!x || !y) return 0
  if (x === y) return 1
  const xw = new Set(x.split(' '))
  const yw = new Set(y.split(' '))
  let inter = 0
  for (const word of xw) if (yw.has(word)) inter++
  return inter / Math.max(xw.size, yw.size)
}

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('AnimeKai step timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

function parseServers(html: string): ServerPick[] {
  const out: ServerPick[] = []
  let listMedia = ''
  const tagPattern = /<ul[^>]*class="[^"]*server-list[^"]*"[^>]*>|<li[^>]*data-url="[^"]*"[^>]*>/g
  for (const match of html.matchAll(tagPattern)) {
    const tag = match[0]
    if (tag.startsWith('<ul')) {
      listMedia = /data-media="([^"]*)"/.exec(tag)?.[1] || ''
      continue
    }
    const url = /data-url="([^"]+)"/.exec(tag)?.[1]
    if (!url) continue
    const media = /data-media="([^"]*)"/.exec(tag)?.[1] || listMedia
    try {
      const parsed = new URL(url)
      const code = parsed.pathname.split('/').filter(Boolean).pop() || ''
      if (code) out.push({ code, media: media === 'dub' ? 'dub' : 'sub', host: parsed.host })
    } catch {
      // skip malformed url
    }
  }
  return out
}

function toBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length)
  for (let index = 0; index < value.length; index++) bytes[index] = value.charCodeAt(index) & 255
  return bytes
}

function rotl(value: number, bits: number): number {
  return (value << bits | value >>> (32 - bits)) >>> 0
}

function imul(value: number, factor: number): number {
  return Math.imul(value, factor) >>> 0
}

function mix(state: Uint32Array): void {
  state[0] = (state[0]! + state[1]!) >>> 0
  state[3] = rotl(state[3]! ^ state[0]!, 16)
  state[2] = (state[2]! + state[3]!) >>> 0
  state[1] = rotl(state[1]! ^ state[2]!, 12)
  state[0] = (state[0]! + state[1]!) >>> 0
  state[3] = rotl(state[3]! ^ state[0]!, 8)
  state[2] = (state[2]! + state[3]!) >>> 0
  state[1] = rotl(state[1]! ^ state[2]!, 7)
}

/** The mfw09 proof-of-work hash: absorb bytes into a SHA-256 IV, squeeze a
 *  512-lane state, run two ARX mix rounds, fold into 256 output bits. Ported
 *  from their `pow-*.js` bundle so upstream code never executes here. */
function powHash(bytes: Uint8Array): Uint32Array {
  const state = new Uint32Array([1779033703, 3144134277, 1013904242, 2773480762])
  for (let index = 0; index < bytes.length; index++) {
    state[0] = (state[0]! + bytes[index]!) >>> 0
    state[0] = rotl(state[0]!, 7)
    mix(state)
  }
  for (let round = 0; round < 8; round++) mix(state)
  const lane = new Uint32Array(512)
  for (let index = 0; index < 512; index++) {
    mix(state)
    lane[index] = (state[0]! ^ state[2]!) >>> 0
  }
  for (let round = 0; round < 2; round++) {
    for (let index = 0; index < 512; index++) {
      const pick = lane[index]! & 511
      let value = (lane[index]! + lane[pick]!) >>> 0
      value = rotl(value, 13)
      value = (value ^ imul(lane[(index + 1) & 511]!, 2654435761)) >>> 0
      lane[index] = value
      state[0] = (state[0]! ^ value) >>> 0
      mix(state)
    }
  }
  const out = new Uint32Array(8)
  for (let word = 0; word < 8; word++) {
    mix(state)
    let acc = state[0]!
    const base = word * 64
    for (let offset = 0; offset < 64; offset++) {
      const value = lane[base + offset]!
      acc = (acc + value) >>> 0
      acc = rotl(acc, 5)
      acc = (acc ^ imul(value, 2246822519)) >>> 0
    }
    out[word] = (acc ^ state[2]!) >>> 0
  }
  return out
}

function leadingZeroBits(words: Uint32Array): number {
  let bits = 0
  for (let index = 0; index < words.length; index++) {
    const word = words[index]!
    if (word === 0) {
      bits += 32
      continue
    }
    return bits + Math.clz32(word)
  }
  return bits
}

/** Smallest counter whose hash carries `difficulty` leading zero bits.
 *  Mirrors the upstream solver: difficulty 0 answers "0", batches yield to
 *  the event loop, and the budget returns null instead of hanging a resolve. */
export async function solvePow(nonce: string, difficulty: number, timeoutMs: number, signal?: AbortSignal): Promise<string | null> {
  if (difficulty <= 0) return '0'
  const prefix = `${nonce}:`
  const started = Date.now()
  const batch = 1024
  let counter = 0
  for (;;) {
    for (let attempt = 0; attempt < batch; attempt++) {
      if (leadingZeroBits(powHash(toBytes(`${prefix}${counter}`))) >= difficulty) return String(counter)
      counter++
    }
    if (Date.now() - started > timeoutMs) return null
    signal?.throwIfAborted()
    await new Promise<void>((resolve) => { setTimeout(resolve, 0) })
  }
}

function b64urlToBuffer(value: string): Buffer {
  let normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  while (normalized.length % 4) normalized += '='
  return Buffer.from(normalized, 'base64')
}

function decryptPlayback(payload: z.infer<typeof playbackPayloadSchema>): unknown {
  const version = payload.version?.trim() ?? ''
  const parsedVersion = Number(version)
  let order: number[] = []
  if (version !== '' && Number.isInteger(parsedVersion) && parsedVersion >= 1 && parsedVersion <= 20) order = [parsedVersion, 31 - parsedVersion]
  const selected = order.filter((value) => value >= 1 && value <= payload.key_parts.length)
  const chosen = selected.length ? selected.map((value) => payload.key_parts[value - 1]!) : payload.key_parts
  const key = Buffer.concat(chosen.map((part) => b64urlToBuffer(part)))
  if (key.length !== 32) throw new ProviderFailure('malformed')
  const iv = b64urlToBuffer(payload.iv)
  const data = b64urlToBuffer(payload.payload)
  if (iv.length === 0 || data.length <= 16) throw new ProviderFailure('malformed')
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(data.subarray(data.length - 16))
    const plaintext = Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()])
    return JSON.parse(plaintext.toString('utf8'))
  } catch (error) {
    if (error instanceof SyntaxError) throw error
    throw new ProviderFailure('malformed')
  }
}

async function postJson(http: ProviderHttp, path: string, body: unknown, referer: string, signal: AbortSignal, extra: Record<string, string> = {}) {
  const response = await document(http, `${embedOrigin}${path}`, signal, {
    'user-agent': userAgent,
    referer,
    accept: 'application/json',
    'content-type': 'application/json',
    ...extra,
  }, { method: 'POST', body: JSON.stringify(body) })
  return JSON.parse(response.text)
}

export function createAnimeKaiProvider(http: ProviderHttp, resolveTitle: AnimeTitleResolver, now = Date.now) {
  return Object.assign(adapter('animekai', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'anime' || !ref.episode) throw new ProviderFailure('empty')
    const wanted: 'sub' | 'dub' = input.audioLanguage.toLowerCase().split('-')[0] === 'en' ? 'dub' : 'sub'
    let title: string
    try {
      title = (await resolveTitle(ref.id, signal)).trim()
    } catch {
      throw new ProviderFailure('empty')
    }
    if (!title) throw new ProviderFailure('empty')

    // Search -> best title match.
    let slug: string
    {
      const op = bounded(signal, SEARCH_MS)
      try {
        const response = await document(http, `${siteOrigin}/api/search_live.php?q=${encodeURIComponent(title)}`, op.signal, {
          'user-agent': userAgent,
          referer: `${siteOrigin}/`,
          accept: 'application/json',
        })
        const data = searchSchema.parse(JSON.parse(response.text))
        if (data.ok === false) throw new ProviderFailure('empty')
        let best: { slug: string; title: string } | null = null
        let bestScore = -1
        for (const item of data.results) {
          const score = titleScore(item.title, title)
          if (score > bestScore) {
            bestScore = score
            best = item
          }
        }
        if (!best || bestScore < 0.4) throw new ProviderFailure('empty')
        slug = best.slug
      } finally {
        op.cleanup()
      }
    }

    // Only the requested audio variant may cross the adapter boundary.
    let pick: ServerPick
    let usedAudio: 'sub' | 'dub'
    {
      const op = bounded(signal, PAGE_MS)
      try {
        const response = await document(http, `${siteOrigin}/watch/${slug}/ep-${ref.episode}`, op.signal, {
          'user-agent': userAgent,
          accept: 'text/html',
        })
        const servers = parseServers(response.text)
        if (!servers.length) throw new ProviderFailure('empty')
        const direct = servers.find((server) => server.media === wanted && server.host === 'mfw09.org')
        if (direct) {
          pick = direct
          usedAudio = wanted
        } else {
          throw new ProviderFailure('empty')
        }
      } finally {
        op.cleanup()
      }
    }

    // mfw09 attestation + proof-of-work + playback -> decrypted edge config.
    const referer = `${embedOrigin}/e/${pick.code}`
    let config: z.infer<typeof playbackConfigSchema>
    {
      const op = bounded(signal, CHAIN_MS)
      try {
        const challenge = challengeSchema.parse(await postJson(http, '/api/videos/access/challenge', {}, referer, op.signal))
        const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
        const jwk = publicKey.export({ format: 'jwk' }) as { x?: string; y?: string }
        if (!jwk.x || !jwk.y) throw new ProviderFailure('unavailable')
        const signature = sign('sha256', Buffer.from(String(challenge.nonce), 'utf8'), privateKey).toString('base64url')
        const attestation = attestSchema.parse(await postJson(http, '/api/videos/access/attest', {
          viewer_id: '',
          device_id: '',
          challenge_id: challenge.challenge_id,
          nonce: challenge.nonce,
          signature,
          public_key: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y },
          client: { user_agent: userAgent, extra: { vendor: '', appVersion: '' } },
          storage: {},
          attributes: { entropy: 'low' },
        }, referer, op.signal))
        const fingerprint = { token: attestation.token, viewer_id: attestation.viewer_id, device_id: attestation.device_id }
        const captcha = captchaSchema.parse(await postJson(http, `/api/videos/${pick.code}/embed/captcha`, { fingerprint }, referer, op.signal))
        const solution = await solvePow(captcha.pow_nonce, captcha.pow_difficulty ?? 16, POW_TIMEOUT_MS, op.signal)
        if (solution == null) throw new ProviderFailure('unavailable')
        const verification = verifySchema.parse(await postJson(http, `/api/videos/${pick.code}/embed/captcha/verify`, {
          pow_token: captcha.pow_token,
          solution,
          fingerprint,
        }, referer, op.signal))
        const playback = z.object({ playback: playbackPayloadSchema }).parse(await postJson(http, `/api/videos/${pick.code}/embed/playback`, { fingerprint }, referer, op.signal, {
          'x-captcha-token': verification.token,
        }))
        const decrypted = decryptPlayback(playback.playback)
        config = playbackConfigSchema.parse(decrypted)
      } finally {
        op.cleanup()
      }
    }

    const chosenIndex = config.sources.findIndex((source) => /^https:\/\//.test(source.url))
    if (chosenIndex < 0) throw new ProviderFailure('empty')
    const chosen = config.sources[chosenIndex]!
    let expiresAt: string
    const providerExpiry = Date.parse(config.expires_at ?? '')
    if (Number.isFinite(providerExpiry) && providerExpiry - 60_000 > now() + 30_000) {
      expiresAt = new Date(providerExpiry - 60_000).toISOString()
    } else {
      try {
        expiresAt = accessDeadline(chosen.url, now())
      } catch {
        throw new ProviderFailure('empty')
      }
    }
    const subtitles = config.tracks
      .map((track, index): ProviderSource['subtitles'][number] | null => {
        const url = track.file ?? track.src ?? track.url ?? ''
        if (!url.startsWith('https://')) return null
        const extension = (url.split('?')[0]?.split('.').pop() ?? '').toLowerCase()
        const format = extension === 'srt' || extension === 'ass' ? extension : 'vtt'
        const label = (track.label || track.kind || 'Subtitle').slice(0, 64)
        return { id: `animekai-sub-${index}`, label, language: label.slice(0, 32), url, format }
      })
      .filter((track): track is NonNullable<typeof track> => track !== null)
      .slice(0, 20)
    const source: ProviderSource = {
      key: `animekai:${usedAudio}:${ref.episode}`,
      url: chosen.url,
      type: 'hls',
      expiresAt,
      headers: {},
      language: usedAudio === 'dub' ? 'en' : 'original',
      qualityHint: (chosen.label || 'Auto').slice(0, 24),
      subtitles,
    }
    return [source]
  }), { audioLanguages: ['ja', 'en'] as const })
}
