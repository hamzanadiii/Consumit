import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve as resolvePath } from 'node:path'
import { hostname } from 'node:os'
import { chromium } from '@playwright/test'
import { loadConfiguredProviders } from '../apps/api/src/playback/configured-providers.ts'
import { validatedSources, type ProviderRegistration, type ProviderSource } from '../packages/provider-sdk/src/index.ts'
import { joinReports, renderMatrix, summarize } from './egress-sweep-verdict.mjs'

// Egress sweep: measure every configured provider through one egress and join
// the per-egress reports into a direct-playback matrix.
//
// Usage
//   bun scripts/egress-sweep.ts \
//     [--config=infra/playback/providers.local.json] [--ids=vixsrc,lookmovie] \
//     [--label=dev] [--via=local|worker|worker:<url>] [--media=local] \
//     [--origin=https://consumit.online] [--browser=on|off] [--limit=3] \
//     [--out=tmp/egress-sweep-dev.json]
//   bun scripts/egress-sweep.ts --join=tmp/egress-sweep-*.json --viewer=dev
//
// Run the same probe once per egress (dev line, OVH, a Cloudflare resolver
// colo via --via=worker:<url>), then join the reports. Only a report whose
// browser ran at the real production origin gives authoritative CORS results.

const args = new Map<string, string>()
for (const arg of process.argv.slice(2)) {
  const [key, value] = arg.startsWith('--') ? arg.slice(2).split(/=(.*)/s) : []
  if (key) args.set(key, value ?? 'true')
}

const boolArg = (key: string, fallback: boolean) => {
  const value = args.get(key)
  if (value === undefined) return fallback
  return value !== 'off' && value !== 'false' && value !== '0'
}

type Probe = {
  kind: string
  ref: unknown
  resolveOk?: boolean
  resolveCode?: string
  resolveMs?: number
  sourceCount?: number
  sources?: { type: string; host: string }[]
  mediaOk?: boolean | null
  mediaCode?: string
  mediaStatus?: number
  /** Same fetch replayed with the adapter's declared header hints. */
  mediaWithHeadersOk?: boolean | null
  mediaWithHeadersCode?: string
  /** Adapter hints without the Origin header, isolating origin refusals. */
  mediaNoOriginOk?: boolean | null
  mediaNoOriginCode?: string
  cors?: boolean | null
  browserOk?: boolean | null
  browserCode?: string
}
type Report = {
  at: string
  label: string
  tool: 'egress-sweep'
  egress: { resolveVia: string; mediaFrom: string; browserOrigin: string | null; browserRun: boolean }
  providers: { id: string; adapter: string; delivery: string; probes: Probe[] }[]
}

// ---------------------------------------------------------------------------
// Join mode: merge existing reports and print the matrix.
// ---------------------------------------------------------------------------
const joinArg = args.get('join')
if (joinArg && joinArg !== 'true') {
  const paths = joinArg.split(',').map((entry) => entry.trim()).filter(Boolean)
  const reports = await Promise.all(paths.map((path) => readFile(path, 'utf8').then((raw) => JSON.parse(raw) as Report)))
  const rows = joinReports(reports, args.get('viewer'))
  const summary = summarize(rows)
  const table = renderMatrix(rows)
  const out = args.get('out')
  if (out && out !== 'true') {
    await mkdir(resolvePath(out, '..'), { recursive: true })
    await writeFile(out, `${JSON.stringify({ at: new Date().toISOString(), tool: 'egress-sweep-matrix', viewer: rows[0]?.viewer, summary, rows }, null, 2)}\n`)
  }
  console.log(table)
  console.log(JSON.stringify(summary))
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Probe mode.
// ---------------------------------------------------------------------------
const configPath = args.get('config') ?? process.env.PLAYBACK_MEDIA_CONFIG ?? 'infra/playback/providers.local.json'
const label = args.get('label') ?? hostname().toLowerCase()
const via = args.get('via') ?? 'local'
const origin = args.get('origin') ?? 'http://localhost:8080'
const runBrowser = boolArg('browser', true)
const limit = Number(args.get('limit') ?? 3)
const outPath = args.get('out') ?? `tmp/egress-sweep-${label}.json`
const wanted = args.get('ids')?.split(',').map((entry) => entry.trim()).filter(Boolean)

const probeRefs: Record<string, { ref: Record<string, unknown>; audioLanguage: string }> = {
  movie: { ref: { kind: 'movie', id: 550 }, audioLanguage: 'en' },
  series: { ref: { kind: 'series', id: 1399, season: 1, episode: 1 }, audioLanguage: 'en' },
  anime: { ref: { kind: 'anime', id: 21, episode: 1 }, audioLanguage: 'ja' },
}

// Anime adapters resolve through the local catalog API. When it is not
// running those lookups fail for an environmental reason, which must never be
// reported as a provider verdict.
const metadataAvailable = await fetch('http://localhost:3001/v1/anime/21', { signal: AbortSignal.timeout(4_000) })
  .then((response) => response.ok).catch(() => false)
if (!metadataAvailable) console.error('WARN: catalog metadata API is unreachable; anime lookups will report "unmeasured" instead of a provider verdict.')

const workerUrl = via.startsWith('worker') ? (via === 'worker' ? 'https://consumit-provider-resolver.consumit-project.workers.dev/v1/resolve' : via.slice(7)) : null
const workerSecret = workerUrl ? (await readFile('infra/cloudflare/provider-resolver.production.secret.local', 'utf8').catch(() => '')).trim() : ''

const metadataFor = (kind: string) => kind === 'movie'
  ? { title: 'Fight Club', year: 1999, imdbId: 'tt0137523', runtimeSec: 8340 }
  : kind === 'series'
    ? { title: 'Game of Thrones', year: 2011, imdbId: 'tt0944947', runtimeSec: 3600 }
    : { animeTitle: 'Naruto', animeTitles: ['Naruto'], malId: 21 }

// Anime adapters need catalog titles the local API supplies; when it is not
// running those providers simply report an unavailable lookup.
const animeCache = new Map<number, Promise<any>>()
function animeMetadata(id: number) {
  let pending = animeCache.get(id)
  if (!pending) {
    pending = fetch(`http://localhost:3001/v1/anime/${id}`, { signal: AbortSignal.timeout(8000) })
      .then((response) => { if (!response.ok) throw new Error('metadata unavailable'); return response.json() })
    animeCache.set(id, pending)
  }
  return pending
}

const rawRows = JSON.parse(await readFile(configPath, 'utf8')) as { id: string; enabled?: boolean }[]
const providers: ProviderRegistration[] = await loadConfiguredProviders(configPath, {
  tmdbToken: process.env.TMDB_API_READ_TOKEN,
  animeTitleResolver: async (id) => (await animeMetadata(id)).titles.preferred,
  animeTitleVariantsResolver: async (id) => {
    const detail = await animeMetadata(id)
    return [...new Set(Object.values(detail.titles).filter((name): name is string => typeof name === 'string' && !!name))]
  },
  animeMetaResolver: async (id) => { const detail = await animeMetadata(id); return { title: detail.titles.preferred, malId: detail.malId } },
})

const selected = providers.filter((provider, index) => {
  const row = rawRows[index]
  if (wanted) return !!row && wanted.includes(row.id)
  return row?.enabled !== false
})
if (!selected.length) throw new Error('No providers matched --ids.')

// ---------------------------------------------------------------------------
// Lookup through the configured channel.
// ---------------------------------------------------------------------------
async function resolveThrough(provider: ProviderRegistration, registrationRow: unknown, kind: string, signal: AbortSignal) {
  const { ref, audioLanguage } = probeRefs[kind]!
  const input = { ref, region: 'US', audioLanguage }
  if (!workerUrl) return provider.adapter.resolve(input as never, signal)
  const body = JSON.stringify({ providerId: (registrationRow as { id?: string })?.id ?? provider.adapter.id, config: registrationRow, input, metadata: metadataFor(kind) })
  const response = await fetch(workerUrl, {
    method: 'POST',
    headers: { authorization: `Bearer ${workerSecret}`, 'content-type': 'application/json' },
    body,
    signal,
  })
  const payload = await response.json().catch(() => ({})) as { ok?: boolean; sources?: unknown[]; code?: string }
  return { ok: payload.ok === true, sources: (payload.sources ?? []) as never, code: payload.code } as never
}

// ---------------------------------------------------------------------------
// Media + CORS probe from this egress, impersonating the browser origin.
// ---------------------------------------------------------------------------
const isRelayShaped = (url: URL) => /proxy|relay/i.test(url.hostname + url.pathname)
  || ['url', 'target', 'destination'].some((key) => /^https?:/i.test(url.searchParams.get(key) ?? ''))

async function probeMedia(source: ProviderSource, browserOrigin: string, mode: 'bare' | 'adapter' | 'noorigin') {
  if (source.type === 'iframe') return { mediaOk: null, cors: null, code: 'iframe-source' }
  if (isRelayShaped(new URL(source.url))) return { mediaOk: null, cors: null, code: 'relay-source' }
  try {
    const headers: Record<string, string> = { accept: '*/*', ...(mode === 'bare' ? {} : source.headers) }
    if (mode !== 'noorigin') headers.origin = browserOrigin
    const response = await fetch(source.url, {
      headers,
      signal: AbortSignal.timeout(12_000),
      redirect: 'follow',
    })
    const acao = response.headers.get('access-control-allow-origin')
    const cors = acao === '*' || (acao !== null && acao === browserOrigin)
    if (!response.ok) return { mediaOk: false, cors, code: `http-${response.status}` }
    if (source.type !== 'hls' && source.type !== 'dash') {
      await response.body?.cancel().catch(() => undefined)
      return { mediaOk: true, cors, status: response.status }
    }
    // Playlists are small; a mislabelled video response must not be buffered.
    const reader = response.body?.getReader()
    const chunks: Uint8Array[] = []
    let bytes = 0
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read()
        if (done || !value) break
        chunks.push(value); bytes += value.byteLength
        if (bytes > 512 * 1024) { await reader.cancel().catch(() => undefined); break }
      }
    }
    const head = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8', 0, 4096).trimStart()
    if (!head.startsWith('#EXTM3U') && !head.startsWith('<?xml')) return { mediaOk: false, cors, code: 'not-a-playlist' }
    return { mediaOk: true, cors, status: response.status }
  } catch {
    return { mediaOk: false, cors: null, code: 'media-fetch-failed' }
  }
}

// ---------------------------------------------------------------------------
// First frame from a real browser at the requested origin.
// ---------------------------------------------------------------------------
const require = createRequire(resolvePath('packages/ui/package.json'))
const hlsCode = await readFile(require.resolve('hls.js/dist/hls.min.js'), 'utf8')

async function checkFirstFrame(page: any, source: ProviderSource) {
  if (source.type === 'iframe') return { ok: null, code: 'iframe-source' }
  if (source.type === 'dash') return { ok: false, code: 'dash-check-unavailable' }
  if (isRelayShaped(new URL(source.url))) return { ok: null, code: 'relay-source' }
  return page.evaluate(async ({ url, type }: { url: string; type: string }) => {
    if (type !== 'hls' && !('MediaSource' in window)) return { ok: false, code: 'no-mse' }
    return new Promise((done) => {
      const video = document.createElement('video')
      video.muted = true; video.playsInline = true; video.style.width = '320px'
      document.body.append(video)
      let hls: any
      let finished = false
      const finish = (ok: boolean | null, code: string) => {
        if (finished) return
        finished = true; clearTimeout(timer); video.pause(); hls?.destroy()
        video.removeAttribute('src'); video.load(); video.remove()
        done({ ok, code })
      }
      const timer = setTimeout(() => finish(false, 'first-frame-timeout'), 25_000)
      video.addEventListener('error', () => finish(false, 'media-error'))
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(() => finish(true, 'first-frame'))
      else video.addEventListener('playing', () => finish(true, 'playing'))
      if (type === 'hls' && (window as any).Hls?.isSupported()) {
        const Hls = (window as any).Hls
        hls = new Hls({ maxBufferLength: 4, maxMaxBufferLength: 8, maxBufferSize: 6 * 1024 * 1024 })
        hls.on(Hls.Events.ERROR, (_: unknown, info: any) => { if (info.fatal) finish(false, `hls-${info.type}`) })
        hls.on(Hls.Events.MANIFEST_PARSED, () => { void video.play().catch(() => finish(false, 'play-rejected')) })
        hls.loadSource(url); hls.attachMedia(video)
      } else if (type === 'hls') {
        // Never fall back to `video.src = <m3u8>`: Chrome has no native HLS,
        // so that path reports a decode failure for every HLS provider.
        finish(false, 'hls-unsupported')
      } else {
        video.src = url; void video.play().catch(() => finish(false, 'play-rejected'))
      }
    })
  }, { url: source.url, type: source.type })
}

// ---------------------------------------------------------------------------
// Bounded run.
// ---------------------------------------------------------------------------
const rowsById = new Map(rawRows.map((row) => [row.id, row]))
const report: Report = {
  at: new Date().toISOString(),
  label,
  tool: 'egress-sweep',
  egress: { resolveVia: via, mediaFrom: 'local', browserOrigin: runBrowser ? origin : null, browserRun: false },
  providers: [],
}

let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null
let originReachable = false
if (runBrowser) {
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  // Reachability decides whether first-frame evidence exists at all, so it is
  // retried and reported loudly: a silent skip would turn every verdict into
  // "Partially measured" and look like provider behaviour.
  for (let attempt = 0; attempt < 3 && !originReachable; attempt++) {
    const reachability = await browser.newPage()
    originReachable = await reachability.goto(origin, { waitUntil: 'domcontentloaded', timeout: 30_000 }).then(() => true).catch(() => false)
    await reachability.close()
    if (!originReachable) await new Promise((done) => setTimeout(done, 2_000 * (attempt + 1)))
  }
  report.egress.browserOrigin = originReachable ? origin : null
  if (!originReachable) console.error(`WARN: origin ${origin} was unreachable; no first-frame evidence will be collected and every verdict will read "Partially measured".`)
}

async function probeProvider(provider: ProviderRegistration) {
  const row = rowsById.get(provider.adapter.id) ?? { id: provider.adapter.id }
  const record: Report['providers'][number] = {
    id: (row as { id: string }).id,
    adapter: provider.adapter.id,
    delivery: provider.deliveryMode ?? 'direct',
    probes: [],
  }
  for (const kind of provider.mediaKinds) {
    const probe: Probe = { kind, ref: probeRefs[kind]?.ref }
    const started = Date.now()
    const signal = AbortSignal.timeout(15_000)
    let sources: ProviderSource[] = []
    try {
      const result = await resolveThrough(provider, row, kind, signal)
      const parsed = result as { ok?: boolean; code?: string }
      sources = parsed.ok ? validatedSources(result as never, provider, Date.now()) : []
      probe.resolveOk = parsed.ok === true && sources.length > 0
      probe.resolveCode = probe.resolveOk ? undefined : parsed.code ?? (parsed.ok ? 'no-validated-sources' : 'lookup-failed')
    } catch {
      probe.resolveOk = false
      probe.resolveCode = signal.aborted ? 'timeout' : 'resolve-error'
    }
    probe.resolveMs = Date.now() - started
    if (!probe.resolveOk && !metadataAvailable && kind === 'anime') probe.resolveCode = 'metadata-unavailable'
    probe.sourceCount = sources.length
    probe.sources = sources.slice(0, limit).map((source) => {
      try { return { type: source.type, host: new URL(source.url).hostname } } catch { return { type: source.type, host: 'invalid-url' } }
    })

    const candidates = sources.filter((source) => source.type !== 'iframe').slice(0, limit)
    const bare: Awaited<ReturnType<typeof probeMedia>>[] = []
    const hinted: Awaited<ReturnType<typeof probeMedia>>[] = []
    const unorigin: Awaited<ReturnType<typeof probeMedia>>[] = []
    let chosen: ProviderSource | null = null
    for (const source of candidates) {
      const bareResult = await probeMedia(source, origin, 'bare')
      bare.push(bareResult)
      hinted.push(await probeMedia(source, origin, 'adapter'))
      unorigin.push(await probeMedia(source, origin, 'noorigin'))
      if (bareResult.mediaOk === true) { chosen = source; break }
    }
    const pick = (results: typeof bare, key: 'mediaOk' | 'cors') =>
      results.some((entry) => entry[key] === true) ? true
        : results.some((entry) => entry[key] === false) ? false : null

    if (candidates.length) {
      probe.mediaOk = pick(bare, 'mediaOk')
      probe.mediaWithHeadersOk = pick(hinted, 'mediaOk')
      probe.mediaNoOriginOk = pick(unorigin, 'mediaOk')
      probe.cors = pick(bare, 'cors')
      const mediaCode = bare.find((entry) => entry.code)
      if (mediaCode?.code) probe.mediaCode = mediaCode.code
      const hintCode = hinted.find((entry) => entry.code)
      if (hintCode?.code) probe.mediaWithHeadersCode = hintCode.code
      const originCode = unorigin.find((entry) => entry.code)
      if (originCode?.code) probe.mediaNoOriginCode = originCode.code
      const status = bare.find((entry) => entry.status !== undefined)
      if (status?.status !== undefined) probe.mediaStatus = status.status

      // A first frame is only meaningful when the browser-realistic request
      // already succeeded; header-bound and egress-bound sources are settled
      // by the fetch probes above.
      if (chosen && browser && originReachable) {
        const page = await browser.newPage()
        try {
          await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 15_000 })
          // Every check page is a fresh document: hls.js must be injected here
          // or HLS silently degrades to `video.src = <m3u8>`, which Chrome
          // cannot play, and every provider reports a bogus decode failure.
          await page.addScriptTag({ content: hlsCode })
          const hlsReady = await page.evaluate(() => typeof (window as any).Hls === 'function' || typeof (window as any).Hls === 'object')
          if (!hlsReady) { probe.browserOk = false; probe.browserCode = 'hls-unavailable' }
          const frame = hlsReady ? await checkFirstFrame(page, chosen) : { ok: false, code: 'hls-unavailable' }
          probe.browserOk = frame.ok
          if (frame.code) probe.browserCode = frame.code
        } catch {
          probe.browserOk = false
          probe.browserCode = 'browser-error'
        } finally { await page.close() }
      }
    } else {
      probe.mediaOk = null
      probe.mediaWithHeadersOk = null
      probe.mediaNoOriginOk = null
      probe.cors = null
      probe.browserOk = null
    }

    record.probes.push(probe)
    console.log(JSON.stringify({ provider: record.id, kind, ...probe }))
  }
  return record
}

try {
  let cursor = 0
  const workers = Array.from({ length: Math.min(2, selected.length) }, async () => {
    for (;;) {
      const index = cursor++
      const provider = selected[index]
      if (!provider) break
      report.providers.push(await probeProvider(provider))
    }
  })
  await Promise.all(workers)
} finally {
  await browser?.close()
}

report.egress.browserRun = report.providers.some((entry) => entry.probes.some((probe) => typeof probe.browserOk === 'boolean'))
await mkdir(resolvePath(outPath, '..'), { recursive: true })
await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`)

const rows = joinReports([report])
console.log(renderMatrix(rows))
console.log(JSON.stringify({ label, out: outPath, ...summarize(rows), next: `bun scripts/egress-sweep.ts --join=<other-report>,${outPath} --viewer=<your-label>` }))
