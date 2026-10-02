import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'
import { invalidateAphroditeSession, signAphroditeRequest } from './aphrodite-gate.ts'

// Port of the PROVE Aphrodite recipe (Stellar's CDN backend, direct):
//   GET cdn.hls.lol/content/{movie|tv}/... with signed X-A-* headers
//   -> totallyacdn.org HLS (2160/1080 + audio), CORS-open.
// The signing implementation is vendored from atlantic.st's own player
// chunk (aphrodite-gate.ts, refreshed 2026-09-22) — re-pull it from the
// player bundle if auth starts failing (the importer names the file; hash
// rotates on deploy). A stale chunk is treacherous: signing still succeeds
// but the backend answers every title with one generic m3u8-proxy fallback
// entry whose media URL never becomes a playlist.
// Fallback: Helios (stream.hls.lol/helios, ns_-AES-GCM -> workers.dev HLS,
// ACAO *) — cdn.hls.lol's totallyacdn payload route started serving the
// atlantic.st SPA homepage instead of a playlist (2026-09), so a cdn URL
// that does not serve a playlist is treated as a miss and Helios is tried
// next. The NS key below is the public client key vendored from
// atlantic.st's own assets bundle (PROVE providers/stellar-gate/helios.ts);
// refresh it from the bundle if Helios payloads stop decrypting.
// A 401/403 clears the cached session and retries once: a stale sid
// otherwise poisons every later call in a long-lived process.
const apiOrigin = 'https://cdn.hls.lol'
const subsOrigin = 'https://natsuki.hls.lol'
const heliosOrigin = 'https://stream.hls.lol'
const nsKeyHex = 'e4b8a1d6f2c9037b5a8e4d1c6f9b2085a7c3e9f6d1b4a8c2e5f7a0d3b6c9e2f5'
const clientHeaders = { 'user-agent': userAgent, accept: 'application/json' }

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

  async function measurePlaylist(url: string, signal: AbortSignal): Promise<string | null> {
    const op = bounded(signal, 4000)
    try {
      const res = await document(http, url, op.signal, { 'user-agent': userAgent, referer: 'https://atlantic.st/' })
      const text = res.text.trimStart()
      if (!text.startsWith('#EXTM3U') || !/#EXT-X-(?:STREAM-INF|TARGETDURATION|MEDIA-SEQUENCE):/.test(res.text)) return null
      let maxRes = 0
      for (const match of res.text.matchAll(/RESOLUTION=\d+x(\d+)/gi)) {
        maxRes = Math.max(maxRes, Number.parseInt(match[1] ?? '0', 10))
      }
      return qualityLabel(maxRes)
    } catch {
      return null
    } finally {
      op.cleanup()
    }
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

  async function decryptNs(payload: string): Promise<string | null> {
    if (!payload.startsWith('ns_')) return /^https?:\/\//i.test(payload) ? payload : null
    try {
      const subtle = globalThis.crypto?.subtle
      if (!subtle) return null
      const hex = payload.slice(3)
      if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return null
      const raw = hexToBytes(hex)
      if (raw.length < 28) return null
      const key = await subtle.importKey('raw', hexToBytes(nsKeyHex), { name: 'AES-GCM' }, false, ['decrypt'])
      const plain = await subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, key, raw.slice(12))
      const url = new TextDecoder().decode(plain)
      return /^https?:\/\//i.test(url) ? url : null
    } catch {
      return null
    }
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
        const url = await decryptNs(raw)
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
    // cdn.hls.lol first — but only if it still serves a playlist (its
    // totallyacdn payload route started answering with the atlantic.st SPA
    // homepage) — then the Helios backend.
    let streamUrl: string | null = null
    let qualityHint = 'Auto'
    const path = isTv ? `/content/tv/${ref.id}/${ref.season}/${ref.episode}` : `/content/movie/${ref.id}`
    const res = await signedGet(path, signal)
    if (!res) throw new ProviderFailure('unavailable')
    try {
      const data = contentSchema.parse(JSON.parse(res.text))
      const candidate = (data.hls || (data.type === 'hls' ? data.url : '') || '').trim()
      if (data.found && /^https?:\/\//i.test(candidate)) {
        const measured = await measurePlaylist(candidate, signal)
        if (measured) {
          streamUrl = candidate
          qualityHint = measured
        }
      }
    } catch (error) {
      if (error instanceof ProviderFailure) throw error
      throw new ProviderFailure('malformed')
    }
    if (!streamUrl) {
      const heliosUrl = await heliosResolve(isTv ? 'tv' : 'movie', String(ref.id), ref.season ?? 1, ref.episode ?? 1, signal)
      if (heliosUrl) {
        const measured = await measurePlaylist(heliosUrl, signal)
        if (measured) {
          streamUrl = heliosUrl
          qualityHint = measured
        }
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
      // The Atlantic player referer is required by its HLS payload hosts.
      // Direct playback cannot set it in the browser; the signed Worker retry
      // uses this hint when a direct manifest request is rejected.
      headers: { referer: 'https://atlantic.st/' },
      subtitles,
    }]
  })
}
