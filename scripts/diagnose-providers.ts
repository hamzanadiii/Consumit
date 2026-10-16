import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { loadConfiguredProviders } from '../apps/api/src/playback/configured-providers.ts'
import { validatedSources, type ProviderSource } from '../packages/provider-sdk/src/index.ts'

// Explicit live diagnostic: bounded resolve and browser first-frame checks.
// Signed URLs, headers, credentials, and browser errors never enter the report.
const config = process.env.PLAYBACK_MEDIA_CONFIG ?? 'infra/playback/providers.local.json'
const filter = process.argv.find(arg => arg.startsWith('--ids='))?.slice(6).split(',')
const variant = process.argv.includes('--alternate')
const reportPath = process.argv.find(arg => arg.startsWith('--out='))?.slice(6) ?? `tmp/provider-diagnostics${variant ? '-alternate' : ''}.json`
const rows = JSON.parse(await readFile(config, 'utf8')) as { id: string; enabled?: boolean;  }[]
const api = 'http://localhost:3001'
const metadata = new Map<number, Promise<any>>()
function anime(id: number) {
  let result = metadata.get(id)
  if (!result) {
    result = fetch(`${api}/v1/anime/${id}`, { signal: AbortSignal.timeout(10_000) }).then(response => { if (!response.ok) throw new Error('metadata unavailable'); return response.json() })
    metadata.set(id, result)
  }
  return result
}
const providers = await loadConfiguredProviders(config, {
  tmdbToken: process.env.TMDB_API_READ_TOKEN,
  animeTitleResolver: async id => (await anime(id)).titles.preferred,
  animeTitleVariantsResolver: async id => { const detail = await anime(id); return [...new Set(Object.values(detail.titles).filter((name): name is string => typeof name === 'string' && !!name))] },
  animeMetaResolver: async id => { const detail = await anime(id); return { title: detail.titles.preferred, malId: detail.malId } },
})
const hlsCode = await readFile(createRequire(resolve('packages/ui/package.json')).resolve('hls.js/dist/hls.min.js'), 'utf8')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const selected = providers.filter(provider => !filter || filter.includes(provider.adapter.id))
const output: any[] = []
let next = 0

async function checkSource(page: any, source: ProviderSource) {
  const url = new URL(source.url)
  if (/proxy|relay/i.test(url.hostname + url.pathname) || ['url', 'target', 'destination'].some(key => /^https?:/i.test(url.searchParams.get(key) ?? ''))) return { ok: false, code: 'relay-source' }
  return page.evaluate(async ({ url, type }: { url: string; type: string }) => {
    if (type === 'dash') return { ok: false, code: 'dash-check-unavailable' }
    return new Promise(resolve => {
      const video = document.createElement('video')
      video.muted = true; video.playsInline = true; video.style.width = '320px'
      document.body.append(video)
      let hls: any
      let complete = false
      const finish = (ok: boolean, code: string) => {
        if (complete) return
        complete = true; clearTimeout(timer); video.pause(); hls?.destroy(); video.removeAttribute('src'); video.load(); video.remove()
        resolve({ ok, code })
      }
      const timer = setTimeout(() => finish(false, 'first-frame-timeout'), 15_000)
      video.addEventListener('error', () => finish(false, 'media-error'))
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(() => finish(true, 'first-frame'))
      else video.addEventListener('playing', () => finish(true, 'playing'))
      if (type === 'hls' && (window as any).Hls.isSupported()) {
        const Hls = (window as any).Hls
        hls = new Hls({ maxBufferLength: 2, maxMaxBufferLength: 4, maxBufferSize: 4 * 1024 * 1024, manifestLoadingMaxRetry: 0, levelLoadingMaxRetry: 0, fragLoadingMaxRetry: 0 })
        hls.on(Hls.Events.ERROR, (_: unknown, info: any) => { if (info.fatal) finish(false, 'hls-' + info.type) })
        hls.on(Hls.Events.MANIFEST_PARSED, () => { void video.play().catch(() => finish(false, 'play-rejected')) })
        hls.loadSource(url); hls.attachMedia(video)
      } else {
        video.src = url; void video.play().catch(() => finish(false, 'play-rejected'))
      }
    })
  }, { url: source.url, type: source.type })
}
try {
  await Promise.all(Array.from({ length: 2 }, async () => {
    const page = await browser.newPage()
    await page.goto('http://localhost:8080/about', { waitUntil: 'domcontentloaded' })
    await page.addScriptTag({ content: hlsCode })
    for (;;) {
      const provider = selected[next++]
      if (!provider) break
      const base = rows[providers.indexOf(provider)]!
      const record: any = { id: base.id, runtimeId: provider.adapter.id, enabled: base.enabled !== false, delivery: 'direct', checks: [] }
      for (const kind of provider.mediaKinds) {
        const ref = (!variant ? provider.probes?.[kind]?.ref : undefined) ?? (kind === 'anime' ? { kind, id: variant ? 7785 : 21, episode: 1 } : kind === 'series' ? { kind, id: variant ? 1396 : 1399, season: 1, episode: 1 } : { kind, id: variant ? 272 : 550 })
        const started = Date.now()
        const signal = AbortSignal.timeout(15_000)
        try {
          const result = await Promise.race([provider.adapter.resolve({ ref, region: 'US', audioLanguage: provider.probes?.[kind]?.audioLanguage ?? (kind === 'anime' ? 'ja' : 'en') }, signal), new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true }))])
          const sources = validatedSources(result, provider)
          const check: any = { kind, ref, resolved: sources.length, resolveMs: Date.now() - started, direct: false, attempts: [] }
          if (!sources.length) check.code = result.ok ? 'no-validated-sources' : result.code
          for (const source of sources.slice(0, 4)) {
            const checked = await checkSource(page, source)
            check.attempts.push({ type: source.type, ...checked })
            if (checked.ok) { check.direct = true; break }
          }
          record.checks.push(check)
        } catch {
          record.checks.push({ kind, ref, resolved: 0, resolveMs: Date.now() - started, direct: false, code: signal.aborted ? 'timeout' : 'resolve-error' })
        }
      }
      output.push(record)
      console.log(JSON.stringify(record))
      await mkdir('tmp', { recursive: true })

    }
    await page.close()
  }))
} finally { await browser.close() }
await writeFile(reportPath, JSON.stringify({ at: new Date().toISOString(), browser: 'Chrome', origin: 'http://localhost:8080', providers: output }, null, 2) + '\n')
console.log(JSON.stringify({ checked: output.length, direct: output.filter(row => row.checks.some((check: any) => check.direct)).map(row => row.id) }))
