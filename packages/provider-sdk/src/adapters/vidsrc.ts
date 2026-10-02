import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'

const mirrorBase = 'https://vsembed.ru/'

// Port of the PROVE VidSrc recipe (vsembed.ru backend), reverse-engineered
// from the live player:
//   embed/movie?tmdb= -> iframe data-api -> gate JSON { src }
//   -> inner landing window.CFG.playerUrl -> nested player window.CONFIG.api
//      (data.vidsrcme.ru/api.php?...&stream_urls)
//   -> stream_urls (plaintext array) -> per-host generate.php IP-bound JWT
//      (?token=), minted just-in-time.
// Streams land on VidSrc's rotating CDN edges as direct HLS. Caveat: the
// tokens bind to the minter IP, so worker/browser consumption from a
// different egress may 403 — the lab verdict decides whether this row stays.
const HOP_TIMEOUT_MS = 4000

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('VidSrc step timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

export function createVidsrcProvider(http: ProviderHttp, now = Date.now) {
  async function hostToken(origin: string, signal: AbortSignal): Promise<string> {
    const op = bounded(signal, HOP_TIMEOUT_MS)
    try {
      const res = await document(http, `${origin}/generate.php`, op.signal, { 'user-agent': userAgent })
      const text = res.text.trim()
      if (text.startsWith('{') || text.startsWith('[')) {
        try {
          const parsed: unknown = JSON.parse(text)
          if (typeof parsed === 'string') return parsed
          if (parsed && typeof parsed === 'object') {
            const record = parsed as Record<string, unknown>
            return String(record.token ?? record.data ?? record.string ?? record.result ?? '')
          }
        } catch {
          return ''
        }
      }
      return text
    } catch {
      return ''
    } finally {
      op.cleanup()
    }
  }

  return adapter('vidsrc', async (input, signal) => {
    const { ref } = input
    const isTv = ref.kind === 'series'
    if ((ref.kind !== 'movie' && !isTv) || (isTv && (!ref.season || !ref.episode))) throw new ProviderFailure('empty')
    const pageUrl = isTv
      ? `${mirrorBase}embed/tv?tmdb=${ref.id}&season=${ref.season}&episode=${ref.episode}`
      : `${mirrorBase}embed/movie?tmdb=${ref.id}`
    const op = bounded(signal, 20000)
    try {
      const baseHeaders = { 'user-agent': userAgent, referer: mirrorBase }
      const embed = await document(http, pageUrl, op.signal, baseHeaders)
      const dataApi = embed.text.match(/data-api="([^"]+)"/i)?.[1]?.replace(/&amp;/g, '&')
      if (!dataApi) throw new ProviderFailure('empty')
      const gate = await document(http, new URL(dataApi, mirrorBase).href, op.signal, baseHeaders)
      let innerSrc = ''
      try {
        innerSrc = String((JSON.parse(gate.text) as { src?: unknown }).src ?? '')
      } catch {
        throw new ProviderFailure('malformed')
      }
      if (!/^https?:\/\//i.test(innerSrc)) throw new ProviderFailure('empty')
      const innerOrigin = new URL(innerSrc).origin
      const landing = await document(http, innerSrc, op.signal, { ...baseHeaders, referer: pageUrl })
      let playerUrl = ''
      try {
        playerUrl = new URL((JSON.parse(landing.text.match(/window\.CFG\s*=\s*(\{.*?\});/s)?.[1] ?? 'null') as { playerUrl?: unknown }).playerUrl as string, innerOrigin).href
      } catch {
        throw new ProviderFailure('empty')
      }
      const playerHtml = await document(http, playerUrl, op.signal, { ...baseHeaders, referer: innerSrc })
      let streamApi = ''
      try {
        const cfg = JSON.parse(playerHtml.text.match(/window\.CONFIG\s*=\s*(\{.*?\});/s)?.[1] ?? 'null') as { api?: unknown; streamBase?: unknown }
        streamApi = String(cfg?.api ?? '')
        if (!streamApi && typeof cfg?.streamBase === 'string') {
          const u = new URL(cfg.streamBase)
          if (isTv) {
            u.searchParams.set('season', String(ref.season))
            u.searchParams.set('episode', String(ref.episode))
          }
          u.searchParams.set('stream_urls', '')
          streamApi = u.href.replace(/stream_urls=$/, 'stream_urls')
        }
      } catch {
        throw new ProviderFailure('empty')
      }
      if (!/^https?:\/\//i.test(streamApi)) throw new ProviderFailure('empty')
      const streamRes = await document(http, streamApi, op.signal, { ...baseHeaders, accept: 'application/json', referer: playerUrl })
      let streamJson: unknown = null
      try {
        streamJson = JSON.parse(streamRes.text)
      } catch {
        throw new ProviderFailure('malformed')
      }
      const data = (streamJson as { data?: unknown })?.data ?? {}
      const rawUrls: string[] = []
      const direct = (data as { stream_urls?: unknown }).stream_urls
      if (Array.isArray(direct)) {
        for (const entry of direct) if (typeof entry === 'string' && /^https?:\/\//i.test(entry)) rawUrls.push(entry)
      } else if (typeof direct === 'string' && direct) {
        // Provider-supplied executable decryptors are not a trusted adapter
        // dependency. This configuration stays disabled until the format has
        // a native, bounded decoder with a deterministic contract fixture.
        throw new ProviderFailure('malformed')
      }
      if (!rawUrls.length) throw new ProviderFailure('empty')
      const playHeaders = { 'user-agent': userAgent, referer: `${innerOrigin}/`, origin: innerOrigin }
      const sources: ProviderSource[] = []
      const seen = new Set<string>()
      for (const raw of rawUrls.slice(0, 6)) {
        let url = raw
        try {
          const token = await hostToken(new URL(raw).origin, op.signal)
          if (token) url = raw.includes('__TOKEN__') ? raw.split('__TOKEN__').join(token) : `${raw + (raw.includes('?') ? '&' : '?')}token=${token}`
        } catch {
          if (signal.aborted) throw signal.reason
        }
        if (seen.has(url)) continue
        seen.add(url)
        sources.push({
          key: `vidsrc:auto:${sources.length}`,
          url,
          type: 'hls',
          qualityHint: 'Auto',
          expiresAt: accessDeadline(url, now()),
          language: 'original',
          headers: playHeaders,
          subtitles: [],
        })
      }
      if (!sources.length) throw new ProviderFailure('empty')
      return sources
    } finally {
      op.cleanup()
    }
  })
}
