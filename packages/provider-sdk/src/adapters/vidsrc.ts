import { Buffer } from 'node:buffer'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'

const mirrorBase = 'https://vsembed.ru/'

// Port of the PROVE VidSrc recipe (vsembed.ru backend), reverse-engineered
// from the live player:
//   embed/movie?tmdb= -> iframe data-api -> gate JSON { src }
//   -> inner landing window.CFG.playerUrl -> nested player window.CONFIG.api
//      (data.vidsrcme.ru/api.php?...&stream_urls)
//   -> stream_urls (plaintext array, or base64 ChaCha20 decrypted with the
//      per-window WASM vsdec recipe) -> per-host generate.php IP-bound JWT
//      (?token=), minted just-in-time.
// Streams land on VidSrc's rotating CDN edges as direct HLS. Caveat: the
// tokens bind to the minter IP, so worker/browser consumption from a
// different egress may 403 — the lab verdict decides whether this row stays.
const HOP_TIMEOUT_MS = 4000

const wasmCache = new Map<string, { mod: WebAssembly.Module; ts: number }>()

function b64ToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'))
}

async function wasmModule(w: unknown, wasmUrl?: unknown, wasmB64?: unknown): Promise<WebAssembly.Module | null> {
  const key = `w:${String(w ?? 'x')}`
  const hit = wasmCache.get(key)
  if (hit && Date.now() - hit.ts < 4 * 60_000) return hit.mod
  try {
    let bytes: Uint8Array
    if (typeof wasmUrl === 'string' && wasmUrl) {
      // The decryptor runs outside the pinned transport, so its host must
      // belong to the known API family — never an arbitrary upstream value.
      let host = ''
      try {
        const parsed = new URL(wasmUrl)
        if (parsed.protocol !== 'https:') return null
        host = parsed.hostname.toLowerCase()
      } catch {
        return null
      }
      const allowed = ['vsembed.ru', 'data.vidsrc.sh', 'data.vidsrcme.ru', 'cloudorchestranova.com']
      if (!allowed.some((domain) => host === domain || host.endsWith(`.${domain}`))) return null
      const res = await fetch(wasmUrl, { headers: { 'user-agent': userAgent }, signal: AbortSignal.timeout(8000) })
      if (!res.ok) return null
      bytes = new Uint8Array(await res.arrayBuffer())
    } else if (typeof wasmB64 === 'string' && wasmB64) {
      bytes = b64ToBytes(wasmB64)
    } else {
      return null
    }
    const mod = await WebAssembly.compile(bytes)
    if (wasmCache.size > 8) wasmCache.delete(wasmCache.keys().next().value!)
    wasmCache.set(key, { mod, ts: Date.now() })
    return mod
  } catch {
    return null
  }
}

async function vsDecrypt(mod: WebAssembly.Module, encB64: string): Promise<string | null> {
  try {
    const inst = await WebAssembly.instantiate(mod, {})
    const api = inst.exports as Record<string, (...args: number[]) => number> & { memory: WebAssembly.Memory }
    const enc = b64ToBytes(encB64)
    const ptr = api.alloc!(enc.length)
    new Uint8Array(api.memory.buffer, ptr, enc.length).set(enc)
    const outLen = api.decrypt!(ptr, enc.length)
    return new TextDecoder().decode(new Uint8Array(api.memory.buffer, ptr + 12, outLen))
  } catch {
    return null
  }
}

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
        // The decryptor block rides top-level beside data, not inside it.
        const vs = (streamJson as { vs?: { w?: unknown; wasm_url?: unknown; wasm?: unknown } }).vs
          ?? (data as { vs?: { w?: unknown; wasm_url?: unknown; wasm?: unknown } }).vs ?? {}
        const mod = await wasmModule(vs.w, vs.wasm_url, vs.wasm)
        if (mod) {
          const text = await vsDecrypt(mod, direct)
          if (text) for (const line of text.split('\n')) {
            const clean = line.trim()
            if (/^https?:\/\//i.test(clean)) rawUrls.push(clean)
          }
        }
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
