import { Buffer } from 'node:buffer'
import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { assertHlsManifest } from '../manifest.ts'
import { accessDeadline, adapter, ProviderFailure, userAgent, type ProviderHttp, type ProviderHttpRequest } from './http.ts'
import type { AnimeTitleResolver } from './anixo.ts'
import type { AnimeTitleVariantsResolver } from './animeparadise.ts'

// player.kototv.to redirects watch pages to the canonical root domain.
// Resolve there directly so the pinned transport does not reject the hop.
const SITE = 'https://kototv.to'
const OBF_KEY = 'otaku-embed-v1'

// Port of the PROVE KoToTV recipe (verified live 2026-10-16): a title search
// resolves the site slug — PROVE's MAL mapper path needs a MAL id this
// signature does not carry — the watch page carries one main-player iframe,
// and the embed page hides its config in window.__P (base64 of a payload XORed
// per character with 'otaku-embed-v1'). The decoded config yields a single
// CORS-open hls.kototv.to master plus VTT captions; the master is verified as
// a real playlist on a bounded probe before it becomes a source.
// Delivery tier: DIRECT. Consumit verification date: 2026-10-16.
const PAGE_TIMEOUT_MS = 15000
const MEDIA_TIMEOUT_MS = 10000
const MAX_TRANSIENT_RETRIES = 3

const pageHeaders = { accept: 'text/html,application/xhtml+xml,application/json' }

const searchSchema = z.object({
  results: z.array(z.object({
    slug: z.string().max(256),
    title: z.string().max(512),
  }).passthrough()).max(64).optional(),
})

type Caption = { url: string; label: string; format: 'vtt' | 'srt' | 'ass' }

async function documentWithRetry(http: ProviderHttp, url: string, signal: AbortSignal, headers: Record<string, string> = {}, init?: ProviderHttpRequest) {
  let response = await http(url, { 'user-agent': userAgent, ...headers }, signal, init)
  // KotoTV intermittently returns 5xx across search, watch, embed, and HLS
  // pages. Retry those temporary failures within each step's normal deadline.
  for (let retry = 0; retry < MAX_TRANSIENT_RETRIES && response.status >= 500 && response.status < 600; retry++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 250 * (retry + 1)))
    signal.throwIfAborted()
    response = await http(url, { 'user-agent': userAgent, ...headers }, signal, init)
  }
  if (response.status === 404) throw new ProviderFailure('empty')
  if (response.status < 200 || response.status >= 300) throw new ProviderFailure('unavailable')
  return response
}

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('KoToTV step timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

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

function deobfuscate(blob: string): { src?: unknown; subtitles?: unknown } {
  const raw = Buffer.from(String(blob).trim(), 'base64').toString('binary')
  let text = ''
  for (let i = 0; i < raw.length; i++) {
    text += String.fromCharCode(raw.charCodeAt(i) ^ OBF_KEY.charCodeAt(i % OBF_KEY.length))
  }
  return JSON.parse(decodeURIComponent(escape(text)))
}

function subtitleFormat(url: string): 'vtt' | 'srt' | 'ass' {
  const path = url.split(/[?#]/)[0] ?? url
  if (/\.srt$/i.test(path)) return 'srt'
  if (/\.ass$/i.test(path)) return 'ass'
  return 'vtt'
}

async function resolveSlug(http: ProviderHttp, titles: readonly string[], signal: AbortSignal): Promise<string> {
  for (const title of titles.slice(0, 3)) {
    const op = bounded(signal, PAGE_TIMEOUT_MS)
    try {
      const response = await documentWithRetry(http, `${SITE}/api/ajax/search?q=${encodeURIComponent(title)}`, op.signal, { ...pageHeaders, referer: `${SITE}/` })
      const payload = searchSchema.parse(JSON.parse(response.text))
      let best: { slug: string; score: number } | null = null
      for (const result of payload.results ?? []) {
        if (!/^[a-z0-9-]{1,160}$/i.test(result.slug)) continue
        const score = titleScore(title, result.title)
        if (!best || score > best.score) best = { slug: result.slug, score }
      }
      if (best && best.score >= 0.5) return best.slug
    } finally {
      op.cleanup()
    }
  }
  return ''
}

async function resolveEmbedToken(http: ProviderHttp, slug: string, episode: number, dub: boolean, signal: AbortSignal): Promise<string> {
  const path = `/anime/${slug}/watch/${episode}${dub ? '/dub' : ''}`
  const op = bounded(signal, PAGE_TIMEOUT_MS)
  try {
    const page = await documentWithRetry(http, `${SITE}${path}`, op.signal, { ...pageHeaders, referer: `${SITE}/` })
    return page.text.match(/<iframe[^>]+src="https:\/\/player\.kototv\.to\/embed\/([A-Za-z0-9]+)\/(sub|dub)"/i)?.[1] ?? ''
  } finally {
    op.cleanup()
  }
}

async function resolveConfig(http: ProviderHttp, token: string, audio: string, signal: AbortSignal): Promise<{ master: string; captions: Caption[] }> {
  const op = bounded(signal, PAGE_TIMEOUT_MS)
  try {
    const page = await documentWithRetry(http, `${SITE}/embed/${token}/${audio}`, op.signal, pageHeaders)
    const blob = page.text.match(/window\.__P\s*=\s*"([^"]+)"/)?.[1]
    if (!blob) throw new ProviderFailure('malformed')
    let config: { src?: unknown; subtitles?: unknown }
    try {
      config = deobfuscate(blob)
    } catch {
      throw new ProviderFailure('malformed')
    }
    const master = String(config.src ?? '')
    if (!master.startsWith('https://') || master.length > 4096) throw new ProviderFailure('empty')
    const captions: Caption[] = []
    const seen = new Set<string>()
    for (const track of Array.isArray(config.subtitles) ? config.subtitles : []) {
      const entry = track as { src?: unknown; lang?: unknown; label?: unknown }
      const url = typeof entry.src === 'string' ? entry.src.trim() : ''
      if (!url.startsWith('https://') || url.length > 4096 || seen.has(url) || captions.length >= 24) continue
      seen.add(url)
      const label = String(entry.label ?? entry.lang ?? 'English').slice(0, 64) || 'English'
      captions.push({ url, label, format: subtitleFormat(url) })
    }
    return { master, captions }
  } finally {
    op.cleanup()
  }
}

/** Direct delivery needs a real playlist the browser can read cross-origin:
 *  a bounded prefix probe rejects error pages and gated hosts before selection. */
async function verifyMaster(http: ProviderHttp, master: string, signal: AbortSignal): Promise<void> {
  const op = bounded(signal, MEDIA_TIMEOUT_MS)
  try {
    const probe = await documentWithRetry(http, master, op.signal, {}, { readPrefixBytes: 64 * 1024 })
    try {
      assertHlsManifest(probe.text)
    } catch {
      throw new ProviderFailure('malformed')
    }
    if (probe.headers?.get('access-control-allow-origin') !== '*') throw new ProviderFailure('empty')
  } finally {
    op.cleanup()
  }
}

export function createKototvProvider(http: ProviderHttp, resolveTitle: AnimeTitleResolver, now = Date.now, resolveTitleVariants?: AnimeTitleVariantsResolver) {
  return Object.assign(adapter('kototv', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'anime' || !ref.episode) throw new ProviderFailure('empty')
    const dub = input.audioLanguage === 'en'
    const audio = dub ? 'dub' : 'sub'
    let title: string
    try {
      title = (await resolveTitle(ref.id, signal)).trim()
    } catch {
      throw new ProviderFailure('empty')
    }
    if (!title) throw new ProviderFailure('empty')

    let aliases: readonly string[] = []
    try { aliases = resolveTitleVariants ? await resolveTitleVariants(ref.id, signal) : [] } catch { /* canonical title remains usable */ }
    const slug = await resolveSlug(http, [...new Set([title, ...aliases].map(value => value.trim()).filter(Boolean))], signal)
    if (!slug) throw new ProviderFailure('empty')

    const token = await resolveEmbedToken(http, slug, ref.episode, dub, signal)
    if (!token) throw new ProviderFailure('empty')

    const { master, captions } = await resolveConfig(http, token, audio, signal)
    await verifyMaster(http, master, signal)

    const subtitles: ProviderSource['subtitles'] = captions.map((caption, index) => ({
      id: `kototv-sub-${index}`,
      label: caption.label,
      language: caption.label.slice(0, 32),
      url: caption.url,
      format: caption.format,
    }))
    return [{
      key: `kototv:${audio}:${ref.episode}`,
      url: master,
      type: 'hls',
      headers: {},
      expiresAt: accessDeadline(master, now()),
      language: dub ? 'en' : 'original',
      qualityHint: 'Auto',
      subtitles,
    }]
  }), { audioLanguages: ['ja', 'en'] })
}
