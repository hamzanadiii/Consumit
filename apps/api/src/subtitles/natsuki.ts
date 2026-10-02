import { invalidateStellarSession, signStellarRequest } from '@consumit/provider-sdk'
import type { SubtitleHttp } from './http.ts'
import type { RawSubtitle, SubtitleQuery, SubtitleSearchProvider } from './types.ts'

// Natsuki — Stellar/Aphrodite's subtitle backend, standalone.
//   GET natsuki.hls.lol/subs?tmdbId=&season=&episode= -> { subtitles: [
//     { sid, language, langCode, url, fileName, delay } ] }
// File URLs are rewritten to the live host and signed per file (X-S gate);
// the engine downloads + converts (srt->vtt) + caches same-origin. Signing
// is pure local crypto against the vendored atlantic.st chunk; the Stellar
// session is warmed best-effort so subtitle calls never depend on a
// separate handshake round-trip.
const NATSUKI_BASE = 'https://natsuki.hls.lol'
const ARTEMIS_BASE = 'https://stellar.hls.lol'
const REFERER = 'https://atlantic.st/'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

type GateSign = (base: string, path: string) => Promise<Record<string, string> | null>

const signStellar = signStellarRequest as unknown as GateSign
const clearStellar = () => {
  try {
    ;(invalidateStellarSession as unknown as () => void)()
  } catch {
    // Session reset is best-effort.
  }
}

async function ensureSession(sign: GateSign): Promise<void> {
  try {
    await sign(ARTEMIS_BASE, '/resolve?tmdbId=0&type=movie')
  } catch {
    // The next attempt performs its own handshake.
  }
}

async function signedFileHeaders(path: string, sign: GateSign): Promise<Record<string, string> | null> {
  try {
    await ensureSession(sign)
    const headers = await sign(NATSUKI_BASE, path)
    if (!headers?.['X-S-Sid']) return null
    return { Referer: REFERER, ...headers }
  } catch {
    return null
  }
}

/** Provenance signal as rating (only Yify votes otherwise): scene/p2p
 *  release tags outrank unrated ties; cams demote below them. */
export function releaseTagRating(fileName: string): number {
  const name = fileName.toLowerCase()
  if (/cam|telesync|screener|workprint/i.test(name)) return -1
  if (/bluray|blu-ray|bdrip|brrip|2160p|1080p|yify|web-dl|hdtv/i.test(name)) return 4
  return 0
}

export function createNatsukiProvider(http: SubtitleHttp, sign: GateSign = signStellar): SubtitleSearchProvider {
  return {
    id: 'natsuki',
    name: 'Natsuki',
    supports(query: SubtitleQuery) {
      return (query.type === 'movie' || query.type === 'tv' || query.type === 'anime') && !!query.tmdbId
    },
    async search(query: SubtitleQuery, signal: AbortSignal): Promise<RawSubtitle[]> {
      await ensureSession(sign)
      const params = new URLSearchParams({ tmdbId: String(query.tmdbId) })
      if (query.type !== 'movie') {
        params.set('season', String(Number(query.season ?? 1)))
        params.set('episode', String(Number(query.episode ?? 1)))
      }
      const attempt = async (): Promise<string> => {
        const headers = await sign(NATSUKI_BASE, `/subs?${params.toString()}`)
        if (!headers) throw new Error('Natsuki signing failed.')
        const { text } = await http.get(`${NATSUKI_BASE}/subs?${params.toString()}`, {
          'User-Agent': UA,
          Accept: 'application/json',
          Referer: REFERER,
          ...headers,
        }, signal)
        return text
      }
      let text: string
      try {
        text = await attempt()
      } catch {
        clearStellar()
        text = await attempt()
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error('Natsuki response malformed.')
      }
      const data = parsed as { subtitles?: unknown }
      const list = Array.isArray(data?.subtitles) ? data.subtitles : []
      if (!list.length) return []
      const want = new Set((query.langs ?? []).map((lang) => lang.toLowerCase()))
      const picked = list.filter((entry) => {
        const code = String((entry as Record<string, unknown>)?.langCode || '').toLowerCase()
        return code && want.has(code)
      })
      const pool = picked.length ? picked : list
      const out: RawSubtitle[] = []
      for (const entry of pool) {
        const record = entry as Record<string, unknown>
        const rawUrl = String(record.url || '')
        if (!rawUrl) continue
        let fileUrl: string
        try {
          const parsedUrl = new URL(rawUrl)
          parsedUrl.hostname = 'natsuki.hls.lol'
          fileUrl = parsedUrl.toString()
        } catch {
          continue
        }
        const path = fileUrl.slice('https://natsuki.hls.lol'.length) || '/'
        const headers = await signedFileHeaders(path, sign)
        if (!headers) continue
        const code = String(record.langCode || '').toLowerCase() || 'en'
        const fileName = String(record.fileName || '')
        out.push({
          url: fileUrl,
          lang: code,
          label: fileName || String(record.language || code),
          format: 'srt',
          rating: releaseTagRating(fileName),
          provider: 'natsuki',
          headers,
        })
      }
      return out
    },
  }
}
