import type { Browser } from 'playwright'
import { z } from 'zod'
import { releaseProbeJobSchema, releaseProbeSourceSchema, releaseProbeEvidenceSchema, type ReleaseProbeSource, type ReleaseProbeEvidence, type ReleaseProbeJob } from '@consumit/contracts'
import { allowedBrowserUrl } from './network'

const origin = z.url().refine(raw => { const url = new URL(raw); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash }).transform(raw => new URL(raw).origin)
export const workerConfigSchema = z.object({ apiOrigin: origin, appOrigin: origin, secret: z.string().min(32).max(256) })
export type WorkerConfig = z.infer<typeof workerConfigSchema>
export function createWorker(config: WorkerConfig, browser: Browser, setSource: (source: ReleaseProbeSource | null) => void, log: (event: string) => void = () => {}) {
  async function send(path: string, body: unknown, signal: AbortSignal) {
    const response = await fetch(`${config.apiOrigin}${path}`, { method: 'POST', headers: { authorization: `Bearer ${config.secret}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal, redirect: 'error' })
    if (!response.ok) throw new Error('Worker interface unavailable')
    return response.status === 204 ? null : response.json()
  }
  async function check(job: ReleaseProbeJob) {
    const remaining = Date.parse(job.expiresAt) - Date.now()
    if (remaining <= 0) return
    const signal = AbortSignal.timeout(Math.min(90_000, remaining))
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false })
    const abort = () => { void context.close().catch(() => undefined) }
    signal.addEventListener('abort', abort, { once: true })
    let source: ReleaseProbeSource | null = null
    let evidence: ReleaseProbeEvidence = { decodedFrames: 0, advancedSeconds: 0, seeked: false, resumedSeconds: 0, failure: 'resolve' }
    try {
      await context.route('**/*', async route => {
        const request = route.request()
        if (!allowedBrowserUrl(request.url(), config.appOrigin, source)) return route.abort('blockedbyclient')
        const url = new URL(request.url())
        const headers = { ...request.headers() }
        if (url.origin === config.appOrigin && url.pathname === '/_internal/release-check' && request.isNavigationRequest()) {
          headers['x-consumit-check-id'] = job.id; headers['x-consumit-check-token'] = job.leaseToken
        }
        return route.continue({ headers })
      })
      const page = await context.newPage()
      page.on('popup', popup => { void popup.close() })
      await page.goto(`${config.appOrigin}/_internal/release-check`, { timeout: 10_000, waitUntil: 'domcontentloaded' })
      await page.waitForFunction(() => typeof (window as Window & { consumitReleaseProbe?: unknown }).consumitReleaseProbe === 'function', null, { timeout: 10_000 })
      for (let attempt = 0; attempt < 2; attempt++) {
        signal.throwIfAborted()
        source = null; setSource(null)
        const response = await send('/v1/internal/releases/source', { id: job.id, leaseToken: job.leaseToken, kind: job.ref.kind }, AbortSignal.any([signal, AbortSignal.timeout(20_000)])).catch(() => null)
        if (!response) continue
        source = z.object({ source: releaseProbeSourceSchema.nullable() }).parse(response).source
        if (!source) continue
        setSource(source)
        evidence = releaseProbeEvidenceSchema.parse(await page.evaluate(async input => {
          const probe = (window as Window & { consumitReleaseProbe?: (source: unknown) => Promise<unknown> }).consumitReleaseProbe
          if (!probe) throw new Error('Probe unavailable')
          return probe(input)
        }, source))
        if (!evidence.failure) break
      }
      await send('/v1/internal/releases/result', { id: job.id, leaseToken: job.leaseToken, evidence }, AbortSignal.any([signal, AbortSignal.timeout(8000)]))
      log(evidence.failure ? 'release_check_failed' : 'release_check_passed')
    } finally { signal.removeEventListener('abort', abort); setSource(null); await context.close().catch(() => undefined) }
  }
  return { async runOnce() {
    const result = z.object({ job: releaseProbeJobSchema.nullable() }).parse(await send('/v1/internal/releases/claim', {}, AbortSignal.timeout(8000)))
    if (!result.job) return false
    await check(result.job); return true
  } }
}
