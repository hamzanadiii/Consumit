import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'
import { invalidateAphroditeSession, signAphroditeRequest } from './aphrodite-gate.ts'

// Port of the PROVE Aphrodite recipe (Stellar's CDN backends):
//   1. Helios (stream.hls.lol/helios, lane-prefixed AES-GCM payload ->
//      HLS whose master answers ACAO * and whose rungs still carry full
//      titles) — the current first lane. Its variants answer only an
//      exact-match Referer on https://atlantic.st or http://localhost
//      (2026-10-11 probe: no Referer, https://consumit.online and
//      https://www.movy.sx all answer 403, and the localhost ACAO echo
//      drops the port), so the lane plays behind an Atlantic relay, not
//      browser-direct from Watch, which sends no Referer at all.
//   2. GET cdn.hls.lol/content/{movie|tv}/... with signed X-A-* headers
//      -> totallyacdn.org HLS (2160/1080 + audio), CORS-open, demoted to
//      fallback: since 2026-10-09 every rung it serves is a static 64-second
//      decoy sample, so it ships only when the playlist reaches ten minutes
//      (PROVE's own `>= 600` gate). A route that answers with the atlantic.st
//      SPA homepage instead of a playlist is a miss all the same.
// The signing implementation is vendored from atlantic.st's own player
// chunk (aphrodite-gate.ts, refreshed 2026-09-22) — re-pull it from the
// player bundle if auth starts failing (the importer names the file; hash
// rotates on deploy). A stale chunk is treacherous: signing still succeeds
// but the backend answers every title with one generic m3u8-proxy fallback
// entry whose media URL never becomes a playlist.
// The Helios lane keys below are the public client keys vendored from
// atlantic.st's own assets bundle (PROVE providers/stellar-gate/helios.ts):
// hl_ is Helios, ms_ is Moscow, ns_ is the legacy workers.dev lane. Refresh
// them from the bundle if Helios payloads stop decrypting.
// A 401/403 clears the cached session and retries once: a stale sid
// otherwise poisons every later call in a long-lived process.
const apiOrigin = 'https://cdn.hls.lol'
const subsOrigin = 'https://natsuki.hls.lol'
const heliosOrigin = 'https://stream.hls.lol'
// 2026-10-06 bundle order: helios, moscow, then the legacy workers.dev lane.
const heliosKeys = [
  '117c358bcfcaf8fe2cfca57c9d2238a300e1c4de2efb83a5012ba84d8a31f1dd',
  '55060a042823f51a94c296894a58a0db15f3baef807155140983083fa799ef47',
  'e4b8a1d6f2c9037b5a8e4d1c6f9b2085a7c3e9f6d1b4a8c2e5f7a0d3b6c9e2f5',
]
/** Real titles run past this; the cdn decoy lane stops at 64 seconds. */
const MIN_TITLE_SECONDS = 600
const clientHeaders = { 'user-agent': userAgent, accept: 'application/json' }
const playlistHeaders = { 'user-agent': userAgent, referer: 'https://atlantic.st/' }

const contentSchema = z.object({
  found: z.boolean().optional(),
  hls: z.string().max(4096).optional(),
  url: z.string().max(4096).optional(),
  type: z.string().max(32).optional(),
}).passthrough()

const subsSchema = z.object({
  subtitles: z.array(z.object({
    url: z.string().max(4096).optional(),
    file: z.string().max(4096).optional(),
    fileName: z.string().max(128).optional(),
    label: z.string().max(128).optional(),
    language: z.string().max(64).optional(),
  }).passthrough()).optional(),
}).passthrough()

const vdrkSubsSchema = z.array(z.object({
  file: z.string().max(4096).optional(),
  label: z.string().max(128).optional(),
}).passthrough())

const heliosSchema = z.object({
  sources: z.record(z.string(), z.object({
    url: z.string().max(4096).optional(),
  }).passthrough()).optional(),
}).passthrough()

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('Aphrodite step timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

function qualityLabel(maxRes: number): string {
  if (maxRes >= 2160) return '2160p'
  if (maxRes >= 1080) return '1080p'
  if (maxRes >= 720) return '720p'
  if (maxRes >= 480) return '480p'
  if (maxRes > 0) return `${maxRes}p`
  return 'Auto'
}

export type AphroditeSign = {
  sign: (base: string, path: string) => Promise<Record<string, string>>
  clear: () => void
}

const gateSign: AphroditeSign = {
  sign: (base, path) => (signAphroditeRequest as unknown as (base: string, path: string) => Promise<Record<string, string>>)(base, path),
  clear: () => { (invalidateAphroditeSession as unknown as () => void)() },
}

export function createAphroditeProvider(http: ProviderHttp, now = Date.now, options: { id?: string; sign?: AphroditeSign } = {}) {
  const id = options.id ?? 'aphrodite'
  const signer = options.sign ?? gateSign

  async function signedGet(path: string, signal: AbortSignal): Promise<{ status: number; text: string; url: string } | null> {
    const attempt = async (): Promise<{ status: number; text: string; url: string } | null> => {
      let headers: Record<string, string>
      try {
        headers = await signer.sign(apiOrigin, path)
      } catch {
        return null
      }
      // Raw http (not document): a 401/403 is a session signal to read,
      // not a transport error to throw.
      try {
        signal.throwIfAborted()
        const res = await http(`${apiOrigin}${path}`, { ...clientHeaders, referer: 'https://atlantic.st/', ...headers }, signal)
        return { status: res.status, text: res.text, url: res.url }
      } catch {
        return null
      }
    }
    const first = await attempt()
    if (first && (first.status === 401 || first.status === 403)) {
      try {
        signer.clear()
      } catch {
        /* session reset is best-effort */
      }
      return attempt()
    }
    return first
  }

  /** Validated HLS body, or null when the answer is not a playlist: the dead
   *  totallyacdn payload route serves the atlantic.st SPA homepage instead. */
  async function readPlaylist(url: string, signal: AbortSignal): Promise<string | null> {
    const op = bounded(signal, 6000)
    try {
      const res = await document(http, url, op.signal, playlistHeaders)
      const text = res.text
      if (!/^\s*#EXTM3U/.test(text) || !/#EXT-X-(?:STREAM-INF|TARGETDURATION|MEDIA-SEQUENCE):/.test(text)) return null
      return text
    } catch {
      return null
    } finally {
      op.cleanup()
    }
  }

  function qualityOf(text: string): string {
    let maxRes = 0
    for (const match of text.matchAll(/RESOLUTION=\d+x(\d+)/gi)) {
      maxRes = Math.max(maxRes, Number.parseInt(match[1] ?? '0', 10))
    }
    return qualityLabel(maxRes)
  }

  /** First variant reference of a master playlist, resolved against it. */
  function firstVariant(text: string, base: string): string | null {
    const lines = text.split(/\r?\n/).filter((line) => line.trim())
    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index]!.startsWith('#EXT-X-STREAM-INF')) continue
      for (let next = index + 1; next < lines.length; next += 1) {
        const line = lines[next]!
        if (line.startsWith('#')) continue
        try {
          return new URL(line, base).toString()
        } catch {
          return null
        }
      }
      return null
    }
    return null
  }

  /** Total VOD seconds behind an already-read playlist (0 on any failure).
   *  This is what rejects the cdn.hls.lol decoy lane: its rungs validate as
   *  playlists but hold a static 64-second sample, not the title. */
  async function playlistDurationSeconds(url: string, text: string, signal: AbortSignal): Promise<number> {
    const variant = firstVariant(text, url)
    const body = variant ? await readPlaylist(variant, signal) : text
    if (!body) return 0
    let total = 0
    for (const match of body.matchAll(/#EXTINF:([\d.]+)/g)) {
      total += Number.parseFloat(match[1] ?? '0')
    }
    return total
  }

  function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
    const out = new Uint8Array(hex.length / 2)
    for (let index = 0; index < hex.length; index += 2) {
      const byte = Number.parseInt(hex.slice(index, index + 2), 16)
      if (!Number.isInteger(byte)) throw new ProviderFailure('malformed')
      out[index / 2] = byte
    }
    return out
  }

  async function decryptHelios(payload: string): Promise<string | null> {
    // Plain URLs (already-decrypted lanes) pass straight through.
    if (/^https?:\/\//i.test(payload)) return payload
    // <2-char lane prefix + hex body (hl_, ms_, ns_, ...).
    if (!/^[a-z]{2}_[0-9a-fA-F]+$/.test(payload)) return null
    const hex = payload.slice(3)
    if (hex.length % 2 !== 0) return null
    const subtle = globalThis.crypto?.subtle
    if (!subtle) return null
    for (const keyHex of heliosKeys) {
      try {
        const raw = hexToBytes(hex)
        if (raw.length < 28) return null
        const key = await subtle.importKey('raw', hexToBytes(keyHex), { name: 'AES-GCM' }, false, ['decrypt'])
        const plain = await subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, key, raw.slice(12))
        const url = new TextDecoder().decode(plain)
        if (/^https?:\/\//i.test(url)) return url
      } catch {
        // Wrong lane key for this payload; the next one may still open it.
      }
    }
    return null
  }

  async function heliosResolve(kind: 'movie' | 'tv', tmdbId: string, season: number, episode: number, signal: AbortSignal): Promise<string | null> {
    const op = bounded(signal, 8000)
    try {
      const query = new URLSearchParams({ tmdbId, type: kind })
      if (kind === 'tv') {
        query.set('seasonId', String(season))
        query.set('episodeId', String(episode))
      }
      const res = await document(http, `${heliosOrigin}/helios?${query}`, op.signal, clientHeaders)
      const parsed = heliosSchema.parse(JSON.parse(res.text))
      const sources = parsed.sources ?? {}
      const ordered = [sources.Moscow, ...Object.values(sources)].filter((entry) => entry?.url)
      const seen = new Set<string>()
      for (const entry of ordered) {
        const raw = String(entry?.url ?? '')
        if (!raw || seen.has(raw)) continue
        seen.add(raw)
        const url = await decryptHelios(raw)
        if (url) return url
      }
      return null
    } catch {
      return null
    } finally {
      op.cleanup()
    }
  }

  return adapter(id, async (input, signal) => {
    const { ref } = input
    const isTv = ref.kind === 'series'
    if ((ref.kind !== 'movie' && !isTv) || (isTv && (!ref.season || !ref.episode))) throw new ProviderFailure('empty')
    let streamUrl: string | null = null
    let qualityHint = 'Auto'
    // Helios first: its master answers ACAO * and still carries the full
    // title, but its variants accept only the Atlantic or localhost
    // Referer (see the header), so the lane verifies server-side and plays
    // behind a relay. The cdn.hls.lol lane is a fallback since 2026-10-09 —
    // its totallyacdn payloads still validate as playlists, but every rung is a
    // static 64-second decoy sample, so it only ships past ten minutes.
    const heliosUrl = await heliosResolve(isTv ? 'tv' : 'movie', String(ref.id), ref.season ?? 1, ref.episode ?? 1, signal)
    if (heliosUrl) {
      const text = await readPlaylist(heliosUrl, signal)
      if (text) {
        streamUrl = heliosUrl
        qualityHint = qualityOf(text)
      }
    }
    if (!streamUrl) {
      const path = isTv ? `/content/tv/${ref.id}/${ref.season}/${ref.episode}` : `/content/movie/${ref.id}`
      const res = await signedGet(path, signal)
      if (!res) throw new ProviderFailure('unavailable')
      try {
        const data = contentSchema.parse(JSON.parse(res.text))
        const candidate = (data.hls || (data.type === 'hls' ? data.url : '') || '').trim()
        if (data.found && /^https?:\/\//i.test(candidate)) {
          const text = await readPlaylist(candidate, signal)
          if (text && (await playlistDurationSeconds(candidate, text, signal)) >= MIN_TITLE_SECONDS) {
            streamUrl = candidate
            qualityHint = qualityOf(text)
          }
        }
      } catch (error) {
        if (error instanceof ProviderFailure) throw error
        throw new ProviderFailure('malformed')
      }
    }
    if (!streamUrl) throw new ProviderFailure('empty')
    const type = mediaType(streamUrl) ?? 'hls'
    const subtitles: ProviderSource['subtitles'] = []
    const seenSubs = new Set<string>()
    const pushSubtitle = (url: unknown, label: unknown) => {
      const file = String(url ?? '')
      if (!file.startsWith('https://') || seenSubs.has(file) || subtitles.length >= 20) return
      seenSubs.add(file)
      const name = String(label ?? 'Unknown').slice(0, 64)
      subtitles.push({ id: `${id}-sub-${subtitles.length}`, label: name, language: name.slice(0, 32), url: file, format: /\.srt/i.test(file) ? 'srt' : 'vtt' })
    }
    const subOp = bounded(signal, 6000)
    try {
      const query = new URLSearchParams({ tmdbId: String(ref.id) })
      if (isTv) {
        query.set('season', String(ref.season))
        query.set('episode', String(ref.episode))
      }
      const subRes = await document(http, `${subsOrigin}/subs?${query}`, subOp.signal, clientHeaders)
      const parsed = subsSchema.parse(JSON.parse(subRes.text))
      for (const track of parsed.subtitles ?? []) {
        pushSubtitle(track.url ?? track.file, track.label ?? track.fileName)
      }
    } catch {
      // fall through to VDRK
    } finally {
      subOp.cleanup()
    }
    if (!subtitles.length) {
      const vdrkOp = bounded(signal, 6000)
      try {
        const vdrkUrl = isTv
          ? `https://sub.vdrk.site/v1/tv/${ref.id}/${ref.season}/${ref.episode}`
          : `https://sub.vdrk.site/v1/movie/${ref.id}`
        const vdrkRes = await document(http, vdrkUrl, vdrkOp.signal, clientHeaders)
        for (const track of vdrkSubsSchema.parse(JSON.parse(vdrkRes.text))) {
          pushSubtitle(track.file, track.label)
        }
      } catch {
        // Tracks are best-effort; resolved media stands alone.
      } finally {
        vdrkOp.cleanup()
      }
    }
    return [{
      key: `${id}:auto:0`,
      url: streamUrl,
      type,
      qualityHint,
      expiresAt: accessDeadline(streamUrl, now()),
      language: 'original',
      // The Atlantic Referer is what the API's server-side verification
      // sends, and it is the only Referer Helios variants accept: they
      // echo it as ACAO and refuse every other origin, including the
      // production one (2026-10-11 matrix). A browser cannot set a
      // Referer, so this hint buys server-side verification and a
      // Worker-relay route; Watch itself sends none.
      headers: { referer: 'https://atlantic.st/' },
      subtitles,
    }]
  })
}
