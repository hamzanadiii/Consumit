import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv, createHash, createHmac } from 'node:crypto'
import type { ProviderSource } from '../index.ts'
import type { AnimeTitleResolver } from './anixo.ts'
import type { AnimeTitleVariantsResolver } from './animeparadise.ts'
import { accessDeadline, adapter, mediaType, ProviderFailure, userAgent, verifiedPlaybackSources, type ProviderHttp } from './http.ts'

// Port of the PROVE AllAnime recipe (mkissa.to + api.mkissa.net, build 180):
// plain persisted-query GraphQL GETs for search; the episode query rides an
// AES-256-GCM `aaReq` token minted from a pinned mask XOR the bootstrap
// partB, and answers with a base64 `tobeparsed` blob. sourceUrl entries are
// either direct http URLs or "--"-prefixed hex (XOR 56) clock paths that
// resolve through clock.json on allanime.day. Entries rank Default 100 >
// Ss-Hls 90 > hls 80 > mp4 50; the top 6 are gated as real playlists before
// they can session. An empty lane falls back to the other audio (sub<->dub).
// Delivery: direct. Verified against the PROVE chain on 2026-10-16.
const API = 'https://api.mkissa.net/api'
const BOOT = 'https://api.mkissa.net/client-crypto/v1/bootstrap'
const CLOCK_ORIGIN = 'https://allanime.day'
const SITE = 'https://mkissa.to'
const BUILD_ID = '180'
const LANE = 'k7'
const MASK_B64 = '0l9xFeTNfYkbfQHmzUQlt2hz0WdzIhoqFbj7YADON7A='
const BOOT_PREFIX = 'NmmeXF'
const EPOCH_MS = 604800000
const GRACE_MS = 86400000
const SEARCH_QH = 'a24c500a1b765c68ae1d8dd85174931f661c71369c89b92b88b75a725afc471c'
const EPISODE_QH = '6b48b24cc684033f90a13879521dc64c9527d698baf1bd78232120767d691eb1'
const STEP_TIMEOUT_MS = 8000
const MAX_SOURCES = 6

const gqlHeaders = {
  'user-agent': userAgent,
  referer: `${SITE}/`,
  origin: SITE,
  accept: 'application/json, text/plain, */*',
  'x-build-id': BUILD_ID,
}

type CryptoState = { epoch: number; key: Buffer }

/** Build-180 mask + bootPrefix are pinned; the state (epoch, derived key)
 *  survives per process so one resolve does not re-bootstrap per query. */
let cachedCrypto: CryptoState | null = null

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('AllAnime step timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

function bootHmac(mask: Buffer, buildId: string, epoch: number): string {
  const mid = createHmac('sha256', mask).update(`${BOOT_PREFIX}:${buildId}`).digest()
  const msg = `${LANE}+${buildId}+mkissa.to+mkissa+${epoch}`
  return createHmac('sha256', mid).update(msg).digest('hex')
}

async function bootstrap(http: ProviderHttp, nowMs: number, signal: AbortSignal): Promise<CryptoState> {
  if (cachedCrypto) return cachedCrypto
  const mask = Buffer.from(MASK_B64, 'base64')
  const epoch = Math.floor((nowMs - GRACE_MS) / EPOCH_MS)
  const op = bounded(signal, STEP_TIMEOUT_MS)
  try {
    const response = await http(`${BOOT}?buildId=${BUILD_ID}&k=${LANE}`, {
      ...gqlHeaders,
      'x-aa-boot': bootHmac(mask, BUILD_ID, epoch),
    }, op.signal)
    if (response.status < 200 || response.status >= 300) throw new ProviderFailure('unavailable')
    let body: { epoch?: unknown; partB?: unknown }
    try {
      body = JSON.parse(response.text) as { epoch?: unknown; partB?: unknown }
    } catch {
      throw new ProviderFailure('malformed')
    }
    const liveEpoch = Number(body.epoch)
    const partB = Buffer.from(String(body.partB ?? ''), 'base64')
    if (!Number.isFinite(liveEpoch) || partB.length !== 32) throw new ProviderFailure('malformed')
    const key = Buffer.alloc(32)
    for (let i = 0; i < 32; i++) key[i] = mask[i]! ^ partB[i]!
    cachedCrypto = { epoch: liveEpoch, key }
    return cachedCrypto
  } finally {
    op.cleanup()
  }
}

function aareq(state: CryptoState, qh: string, nowMs: number): string {
  const ts = Math.floor(nowMs / 1000 / 300) * 300 * 1000
  const payload = JSON.stringify({ v: 1, ts, epoch: state.epoch, buildId: BUILD_ID, qh, k: LANE })
  const iv = createHash('sha256').update(`${state.epoch}:${qh}:${ts}`).digest().subarray(0, 12)
  const cipher = createCipheriv('aes-256-gcm', state.key, iv)
  const ct = Buffer.concat([cipher.update(Buffer.from(payload)), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([Buffer.from([0x01]), iv, ct, tag]).toString('base64')
}

function decodeTobeparsed(state: CryptoState, tbp: string): unknown {
  try {
    const raw = Buffer.from(tbp, 'base64')
    const iv = raw.subarray(1, 13)
    const ct = raw.subarray(13, raw.length - 16)
    const tag = raw.subarray(raw.length - 16)
    const decipher = createDecipheriv('aes-256-gcm', state.key, iv)
    decipher.setAuthTag(tag)
    return JSON.parse(Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8'))
  } catch {
    throw new ProviderFailure('malformed')
  }
}

async function gqlGet(http: ProviderHttp, variables: unknown, qh: string, withAaReq: boolean, nowMs: number, signal: AbortSignal): Promise<unknown> {
  const extensions: Record<string, unknown> = { persistedQuery: { version: 1, sha256Hash: qh } }
  if (withAaReq) {
    const state = await bootstrap(http, nowMs, signal)
    extensions.aaReq = aareq(state, qh, nowMs)
    extensions.k = LANE
  }
  const url = `${API}?variables=${encodeURIComponent(JSON.stringify(variables))}&extensions=${encodeURIComponent(JSON.stringify(extensions))}`
  const op = bounded(signal, STEP_TIMEOUT_MS)
  try {
    const response = await http(url, gqlHeaders, op.signal)
    if (response.status === 404) throw new ProviderFailure('empty')
    if (response.status < 200 || response.status >= 300) throw new ProviderFailure('unavailable')
    let json: Record<string, unknown> | null
    try {
      json = JSON.parse(response.text) as Record<string, unknown> | null
    } catch {
      throw new ProviderFailure('malformed')
    }
    const envelope = json as { errors?: Array<{ message?: unknown }>; message?: unknown; data?: Record<string, unknown> } | null
    const err = envelope?.errors?.[0]?.message ?? envelope?.message
    if (err && !envelope?.data) throw new ProviderFailure('malformed')
    const data = envelope?.data ?? json
    if (data && typeof data === 'object' && 'tobeparsed' in data && (data as { tobeparsed?: unknown }).tobeparsed) {
      const state = await bootstrap(http, nowMs, signal)
      return decodeTobeparsed(state, String((data as { tobeparsed: unknown }).tobeparsed))
    }
    return data
  } finally {
    op.cleanup()
  }
}

function titleScore(a: string, b: string): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
  const x = norm(a)
  const y = norm(b)
  if (!x || !y) return 0
  if (x === y) return 1
  const xw = new Set(x.split(' '))
  const yw = new Set(y.split(' '))
  let inter = 0
  for (const w of xw) if (yw.has(w)) inter++
  return inter / Math.max(xw.size, yw.size)
}

/** Sort key: higher = better. Default/Ss-Hls first. */
function rank(name: string): number {
  const n = name.toLowerCase()
  if (n.includes('default')) return 100
  if (n.includes('ss-hls') || n.includes('sshls')) return 90
  if (n.includes('hls')) return 80
  if (n.includes('mp4')) return 50
  return 10
}

function extractSourceUrls(epData: unknown): Array<{ name: string; url: string }> {
  const record = epData as { episode?: { sourceUrls?: unknown }; sourceUrls?: unknown } | null
  const raw = record?.episode?.sourceUrls ?? record?.sourceUrls
  if (!Array.isArray(raw)) return []
  const out: Array<{ name: string; url: string }> = []
  for (const entry of raw) {
    if (typeof entry === 'string' && entry) {
      out.push({ name: '', url: entry })
      continue
    }
    if (!entry || typeof entry !== 'object') continue
    const fields = entry as Record<string, unknown>
    const url = String(fields.sourceUrl ?? fields.url ?? fields.link ?? '')
    if (!url) continue
    out.push({ name: String(fields.sourceName ?? fields.name ?? fields.serverName ?? ''), url })
  }
  return out
}

function xorClockPath(raw: string): string | null {
  const hex = raw.startsWith('--') ? raw.slice(2) : raw
  if (hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null
  let out = ''
  for (let i = 0; i < hex.length; i += 2) {
    out += String.fromCharCode(Number.parseInt(hex.substring(i, i + 2), 16) ^ 56)
  }
  return out.replace('clock', 'clock.json')
}

async function resolveClock(http: ProviderHttp, rawUrl: string, signal: AbortSignal): Promise<Array<{ url: string; referer: string }>> {
  const path = xorClockPath(rawUrl.replace(/^--/, ''))
  if (!path) return []
  const clockUrl = path.startsWith('http') ? path : `${CLOCK_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`
  const op = bounded(signal, STEP_TIMEOUT_MS)
  try {
    const response = await http(clockUrl, {
      'user-agent': userAgent,
      referer: `${CLOCK_ORIGIN}/`,
    }, op.signal)
    if (response.status < 200 || response.status >= 300) return []
    let body: { links?: unknown }
    try {
      body = JSON.parse(response.text) as { links?: unknown }
    } catch {
      return []
    }
    if (!Array.isArray(body.links)) return []
    const out: Array<{ url: string; referer: string }> = []
    for (const entry of body.links as Array<{ link?: unknown; headers?: Record<string, unknown> } | null>) {
      const url = String(entry?.link ?? '')
      if (!url.startsWith('https://') || url.length > 4096) continue
      const referer = String(entry?.headers?.Referer ?? entry?.headers?.referer ?? `${CLOCK_ORIGIN}/`)
      out.push({ url, referer })
    }
    return out
  } catch {
    return []
  } finally {
    op.cleanup()
  }
}

function refererOrigin(referer: string): string {
  try {
    return new URL(referer).origin
  } catch {
    return SITE
  }
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
}

export function createAllAnimeProvider(http: ProviderHttp, resolveTitle: AnimeTitleResolver, now = Date.now, resolveTitleVariants?: AnimeTitleVariantsResolver) {
  const searchShow = async (query: string, audio: 'sub' | 'dub', nowMs: number, signal: AbortSignal): Promise<{ id: string; name: string } | null> => {
    const data = await gqlGet(http, {
      search: { query },
      limit: 10,
      page: 1,
      translationType: audio,
      countryOrigin: 'ALL',
    }, SEARCH_QH, false, nowMs, signal) as { shows?: { edges?: unknown } } | null
    const edges = data?.shows?.edges
    if (!Array.isArray(edges) || !edges.length) return null
    let best: Record<string, unknown> | null = null
    let bestScore = -1
    for (const edge of edges.slice(0, 10)) {
      if (!edge || typeof edge !== 'object') continue
      const record = edge as Record<string, unknown>
      const altNames = Array.isArray(record.altNames) ? record.altNames : []
      const names = [record.name, record.englishName, record.nameOnlyString, ...altNames]
        .filter((name): name is string => typeof name === 'string' && name.length > 0)
      let score = 0
      for (const name of names) score = Math.max(score, titleScore(name, query))
      if (score > bestScore) {
        bestScore = score
        best = record
      }
    }
    if (bestScore > 0 && best?._id) return { id: String(best._id), name: String(best.englishName || best.name || '') }
    return null
  }

  return Object.assign(adapter('allanime', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'anime' || !ref.episode) throw new ProviderFailure('empty')
    // Audio convention: explicit English requests dub, everything else plays
    // the original with subs; an empty lane falls back to the other audio
    // while source language keeps the requested label (PROVE semantics).
    const dub = input.audioLanguage === 'en'
    const audio = dub ? 'dub' : 'sub'
    let title: string
    try {
      title = (await resolveTitle(ref.id, signal)).trim()
    } catch {
      throw new ProviderFailure('empty')
    }
    if (!title) throw new ProviderFailure('empty')
    const nowMs = now()

    let aliases: readonly string[] = []
    try { aliases = resolveTitleVariants ? await resolveTitleVariants(ref.id, signal) : [] } catch { /* canonical title remains usable */ }
    const queries = [...new Set([title, ...aliases].map(value => value.trim()).filter(Boolean))].slice(0, 4)
    const settled = await Promise.allSettled(queries.map((query) => searchShow(query, audio, nowMs, signal)))
    let match: { id: string; name: string } | null = null
    let sawFulfilled = false
    for (const result of settled) {
      if (result.status !== 'fulfilled') continue
      sawFulfilled = true
      if (result.value) {
        match = result.value
        break
      }
    }
    if (!match) {
      if (!sawFulfilled) {
        const failure = settled.find((result) => result.status === 'rejected')
        if (failure?.status === 'rejected') throw failure.reason
      }
      throw new ProviderFailure('empty')
    }

    let entries = extractSourceUrls(await gqlGet(http, { showId: match.id, translationType: audio, episodeString: String(ref.episode) }, EPISODE_QH, true, nowMs, signal))
    if (!entries.length) {
      const other = dub ? 'sub' : 'dub'
      entries = extractSourceUrls(await gqlGet(http, { showId: match.id, translationType: other, episodeString: String(ref.episode) }, EPISODE_QH, true, nowMs, signal))
      if (!entries.length) throw new ProviderFailure('empty')
    }

    const ordered = [...entries].sort((a, b) => rank(b.name || b.url) - rank(a.name || a.url)).slice(0, 8)
    const seen = new Set<string>()
    const lanes = ordered.map(async (entry) => {
      if (entry.url.startsWith('http')) {
        if (seen.has(entry.url)) return []
        seen.add(entry.url)
        return [{ url: entry.url, name: entry.name, referer: `${SITE}/` }]
      }
      const links = await resolveClock(http, entry.url, signal)
      const out: Array<{ url: string; name: string; referer: string }> = []
      for (const link of links) {
        if (seen.has(link.url)) continue
        seen.add(link.url)
        out.push({ url: link.url, name: entry.name, referer: link.referer })
      }
      return out
    })
    const settledLanes = await Promise.allSettled(lanes)
    const candidates: ProviderSource[] = []
    const seenKeys = new Set<string>()
    for (const lane of settledLanes) {
      if (lane.status !== 'fulfilled') continue
      for (const item of lane.value) {
        if (candidates.length >= MAX_SOURCES) break
        if (!item.url.startsWith('https://') || item.url.length > 4096) continue
        let expiresAt: string
        try {
          expiresAt = accessDeadline(item.url, nowMs)
        } catch {
          continue
        }
        const hint = /\.m3u8(\?|$)/i.test(item.url) ? 'hls' : 'mp4'
        const laneName = slug(item.name) || 'src'
        let key = `allanime:${audio}:${laneName}:${ref.episode}`
        if (seenKeys.has(key)) key = `${key}:${candidates.length}`
        seenKeys.add(key)
        candidates.push({
          key, serverName: item.name.slice(0, 80), url: item.url, type: mediaType(item.url, hint) ?? 'hls',
          headers: { 'user-agent': userAgent, referer: item.referer, origin: refererOrigin(item.referer) },
          expiresAt,
          language: dub ? 'en' : 'original',
          qualityHint: 'Auto',
          subtitles: [],
        })
      }
    }
    if (!candidates.length) throw new ProviderFailure('empty')
    const verified = await verifiedPlaybackSources(http, candidates, signal)
    if (!verified.length) throw new ProviderFailure('empty')
    return verified.slice(0, MAX_SOURCES)
  }), { audioLanguages: ['ja', 'en'] })
}
