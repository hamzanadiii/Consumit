import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, mediaType, ProviderFailure, userAgent, verifiedPlaybackSources, type ProviderHttp } from './http.ts'

const BASE = 'https://yumezone.live'
const API = `${BASE}/api/yume`

// Port of the PROVE YumeZone recipe (verified 2026-10-16): a SvelteKit site
// over a FastAPI watch endpoint whose response is XOR-ciphered JSON. Each of
// the eight named server lanes gets an independently signed POST carrying a
// per-timestamp SHA-256 signature (mulberry32 key string) and its reversed-
// base64 cipher token; the {ct} body decrypts back to lane JSON. Lanes answer
// either a first-party HLS master on the yumezone.live /p/<opaque> path
// (ACAO * per PROVE) or third-party embed documents (Dexter = ani.pm); this
// adapter returns both kinds so the direct roster row keeps the HLS sources
// and the embed roster row keeps the iframes. Dub requests fall back to sub
// lanes. Provider lanes are queried sequentially within the bounded attempt,
// matching the upstream's verified PROVE request pattern, and
// every HLS root is verified before it can become a session.
const LANES = ['Karl', 'Dexter', 'Goku', 'Nexus', 'Rin', 'Koto', 'Riko', 'Cosmic'] as const
const LANE_TIMEOUT_MS = 1600

const laneSchema = z.object({
  video_link: z.string().max(4096).optional(),
  source_type: z.string().max(16).optional(),
  hls_sources: z.array(z.object({ file: z.string().max(4096).optional() }).passthrough()).max(32).optional(),
  embed_sources: z.array(z.object({ url: z.string().max(4096).optional(), name: z.string().max(64).optional() }).passthrough()).max(32).optional(),
  subtitles: z.array(z.object({
    file: z.string().max(4096).optional(), url: z.string().max(4096).optional(),
    lang: z.string().max(16).optional(), label: z.string().max(128).optional(),
  }).passthrough()).max(32).optional(),
}).passthrough()
type LaneData = z.infer<typeof laneSchema>

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('YumeZone lane timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

function prng(seed: number) {
  let o = seed
  return () => {
    o += 1831565813
    let t = o
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function keyString(t: number) {
  const a = prng(20260620)
  const b = prng(98765432)
  let s = ''
  let n = ''
  for (let i = 0; i < 20; i++) s += String.fromCharCode(33 + Math.floor(a() * 90))
  for (let i = 0; i < 20; i++) n += String.fromCharCode(33 + Math.floor(b() * 90))
  const e = t ^ 8272540
  const xored = s
    .split('')
    .map((ch, i) => String.fromCharCode(ch.charCodeAt(0) ^ ((e >> (i % 16)) & 7)))
    .join('')
  return `${xored}:${n}`
}

/** Exported for adapter tests: the lane signature the site expects. */
export function yumeLaneSig(alid: string, ep: number, ts: number): string {
  const raw = `${alid}:${ep}:${ts}:${keyString(ts)}`.split('').reverse().join('') + '_yume'
  return createHash('sha256').update(raw, 'utf8').digest('hex')
}

/** Exported for adapter tests: the inverse of the lane XOR cipher. */
export function sealYumePayload(payload: unknown, sig: string): string {
  const plain = Buffer.from(JSON.stringify(payload), 'utf8')
  const key = Buffer.from(sig, 'utf8')
  const out = Buffer.alloc(plain.length)
  for (let i = 0; i < plain.length; i++) out[i] = plain[i]! ^ key[i % key.length]! ^ ((i * 3) % 256)
  return out.toString('base64')
}

function decryptLane(ct: string, sig: string): LaneData | null {
  try {
    const bytes = Buffer.from(ct, 'base64')
    const key = Buffer.from(sig, 'utf8')
    const out = Buffer.alloc(bytes.length)
    for (let i = 0; i < bytes.length; i++) out[i] = bytes[i]! ^ key[i % key.length]! ^ ((i * 3) % 256)
    const validated = laneSchema.safeParse(JSON.parse(out.toString('utf8')))
    return validated.success ? validated.data : null
  } catch {
    return null
  }
}

async function fetchLane(
  http: ProviderHttp,
  alid: string,
  ep: number,
  provider: string,
  language: 'sub' | 'dub',
  sig: string,
  ts: number,
  signal: AbortSignal,
): Promise<LaneData | null> {
  const op = bounded(signal, LANE_TIMEOUT_MS)
  try {
    const response = await http(`${API}/watch/sources`, {
      'content-type': 'application/json',
      'user-agent': userAgent,
      origin: BASE,
      referer: `${BASE}/watch/${alid}/${ep}`,
    }, op.signal, {
      method: 'POST',
      body: JSON.stringify({
        anime_id: alid,
        episode_number: ep,
        language,
        provider,
        sig,
        ts,
        client_cipher_token: Buffer.from([...sig].reverse().join(''), 'latin1').toString('base64'),
      }),
    })
    if (response.status !== 200) return null
    let parsed: unknown
    try {
      parsed = JSON.parse(response.text)
    } catch {
      return null
    }
    if (!parsed || typeof parsed !== 'object') return null
    const record = parsed as Record<string, unknown>
    const ct = typeof record.ct === 'string' ? record.ct : typeof record.encrypted === 'string' ? record.encrypted : null
    if (ct) return decryptLane(ct, sig)
    if (record.success === false || typeof record.video_link !== 'string') return null
    const validated = laneSchema.safeParse(record)
    return validated.success ? validated.data : null
  } catch {
    return null
  } finally {
    op.cleanup()
  }
}

function absoluteUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `${BASE}${value.startsWith('/') ? '' : '/'}${value}`
}

export function createYumezoneProvider(http: ProviderHttp, now = Date.now) {
  return Object.assign(adapter('yumezone', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'anime' || !ref.episode) throw new ProviderFailure('empty')
    const dub = input.audioLanguage === 'en'
    const language = dub ? 'en' : 'original'
    const alid = String(ref.id)
    const ep = ref.episode
    const ts = Math.floor(now() / 1000)
    const sig = yumeLaneSig(alid, ep, ts)

    const lanes: { provider: string; data: LaneData }[] = []
    const wantedLanguages: readonly ('sub' | 'dub')[] = dub ? ['dub', 'sub'] : ['sub']
    for (const wanted of wantedLanguages) {
      let hlsCount = 0
      for (const provider of LANES) {
        if (hlsCount >= 3 && lanes.length >= 4) break
        const data = await fetchLane(http, alid, ep, provider, wanted, sig, ts, signal)
        if (!data?.video_link) continue
        lanes.push({ provider, data })
        if (data.source_type === 'hls') hlsCount++
      }
      if (lanes.length) break
    }
    if (!lanes.length) throw new ProviderFailure('empty')

    const sources: ProviderSource[] = []
    const seen = new Set<string>()
    const seenSubs = new Set<string>()
    const subtitles: ProviderSource['subtitles'] = []

    for (const { provider, data } of lanes) {
      const laneHls: string[] = []
      const laneEmbeds: string[] = []
      if (data.video_link) (data.source_type === 'embed' ? laneEmbeds : laneHls).push(data.video_link)
      for (const h of data.hls_sources ?? []) if (h.file) laneHls.push(h.file)
      for (const e of data.embed_sources ?? []) if (e.url) laneEmbeds.push(e.url)
      const laneKey = provider.toLowerCase()

      for (const raw of laneHls) {
        if (sources.length >= 8) break
        const url = absoluteUrl(raw)
        if (!url.startsWith('https://') || url.length > 4096 || seen.has(url)) continue
        seen.add(url)
        let expiresAt: string
        try {
          expiresAt = accessDeadline(url, now())
        } catch {
          continue
        }
        sources.push({
          key: `yumezone:${laneKey}:${dub ? 'dub' : 'sub'}:${ep}:${sources.length}`, serverName: provider.slice(0, 80),
          url,
          type: mediaType(url) ?? 'hls',
          headers: {},
          expiresAt,
          language,
          qualityHint: 'Auto',
          subtitles: [],
        })
        // Soft subtitle tracks ride the same /p/ proxy as the HLS lanes; the
        // embed lanes never carry Consumit-managed subtitles.
        for (const track of data.subtitles ?? []) {
          const rawSub = track.file ?? track.url
          if (!rawSub || seenSubs.has(rawSub)) continue
          const subUrl = absoluteUrl(rawSub)
          if (!subUrl.startsWith('https://') || subtitles.length >= 32) continue
          seenSubs.add(rawSub)
          const format = /\.ass(?:[?#]|$)/i.test(subUrl) ? 'ass' as const
            : /\.srt(?:[?#]|$)/i.test(subUrl) ? 'srt' as const
              : 'vtt' as const
          const label = (track.label || track.lang || 'English').slice(0, 64)
          subtitles.push({ id: `yumezone-sub-${subtitles.length}`, label, language: label.slice(0, 32), url: subUrl, format })
        }
      }

      for (const raw of laneEmbeds) {
        if (sources.length >= 8) break
        if (!/^https:\/\//i.test(raw) || raw.length > 4096 || seen.has(raw)) continue
        seen.add(raw)
        sources.push({
          key: `yumezone:${laneKey}:embed:${ep}:${sources.length}`,
          url: raw,
          type: 'iframe',
          expiresAt: new Date(now() + 1_800_000).toISOString(),
          language,
          headers: {},
          subtitles: [],
        })
      }
    }
    if (!sources.length) throw new ProviderFailure('empty')

    const withSubtitles = sources.map((source) => source.type === 'hls' ? { ...source, subtitles } : source)
    const verified = await verifiedPlaybackSources(http, withSubtitles, signal)
    return verified.slice(0, 8)
  }), { audioLanguages: ['ja', 'en'] })
}

/** AniPM via YumeZone. Keep the configured ID/order, but never substitute
 * ReAnime/Flixcloud or another audio lane for this explicit player choice. */
export function createYumezoneFrameProvider(http: ProviderHttp, now = Date.now) {
  return Object.assign(adapter('yumezoneframe', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'anime' || !ref.episode) throw new ProviderFailure('empty')
    const requested = input.audioLanguage.split('-')[0]
    if (requested !== 'en' && requested !== 'ja') throw new ProviderFailure('empty')
    const dub = requested === 'en'
    const language = dub ? 'en' : 'ja'
    const alid = String(ref.id)
    const ep = ref.episode
    const ts = Math.floor(now() / 1000)
    const sig = yumeLaneSig(alid, ep, ts)

    const data = await fetchLane(http, alid, ep, 'Dexter', dub ? 'dub' : 'sub', sig, ts, signal)
    if (!data) throw new ProviderFailure('empty')

    const sources: ProviderSource[] = []
    const seen = new Set<string>()
    {
      const laneEmbeds: string[] = []
      if (data.video_link && data.source_type === 'embed') laneEmbeds.push(data.video_link)
      for (const e of data.embed_sources ?? []) if (e.url) laneEmbeds.push(e.url)
      for (const raw of laneEmbeds) {
        if (sources.length >= 4) break
        if (raw.length > 4096 || seen.has(raw)) continue
        let url: URL
        try { url = new URL(raw) } catch { continue }
        const canonicalPath = `/embed/ani/${alid}/${ep}/${dub ? 'dub' : 'sub'}`
        if (url.origin !== 'https://ani.pm' || url.username || url.password || !(url.pathname.replace(/\/$/, '') === canonicalPath || /^\/e\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname))) continue
        seen.add(raw)
        sources.push({
          key: `yumezoneframe:dexter:${dub ? 'dub' : 'sub'}:${ep}:${sources.length}`,
          url: raw,
          type: 'iframe',
          expiresAt: new Date(now() + 1_800_000).toISOString(),
          language,
          headers: {},
          subtitles: [],
          frameSandbox: 'none',
        })
      }
    }
    if (!sources.length) throw new ProviderFailure('empty')
    return sources
  }), { audioLanguages: ['ja', 'en'], label: 'AniPM' })
}
