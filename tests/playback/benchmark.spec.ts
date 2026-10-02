import { expect, test } from '@playwright/test'

test.skip(process.env.PLAYBACK_BENCHMARK !== '1', 'Run explicitly to compare controlled first-frame timing.')

test('records controlled first-frame p95 for the selected player core', async ({ page, request }) => {
  test.setTimeout(180_000)
  await page.addInitScript(() => {
    const view = window as Window & { __consumitFirstFrame?: number; __consumitLoadStart?: number; __consumitMetadata?: number; __consumitMediaEvents?: unknown[] }
    const connected = new WeakSet<HTMLVideoElement>()
    const inspect = () => {
      const video = document.querySelector('video')
      if (!video || connected.has(video)) return
      connected.add(video)
      video.addEventListener('loadstart', () => { view.__consumitLoadStart ??= performance.now() }, { once: true })
      video.addEventListener('loadedmetadata', () => { view.__consumitMetadata ??= performance.now() }, { once: true })
      video.addEventListener('error', () => {
        view.__consumitMediaEvents ??= []
        view.__consumitMediaEvents.push({ event: 'error', code: video.error?.code ?? null, message: video.error?.message ?? null, src: video.src, currentSrc: video.currentSrc, readyState: video.readyState })
      })
      if ('requestVideoFrameCallback' in video) {
        video.requestVideoFrameCallback(() => { view.__consumitFirstFrame ??= performance.now() })
      } else {
        video.addEventListener('playing', () => { view.__consumitFirstFrame ??= performance.now() }, { once: true })
      }
    }
    new MutationObserver(inspect).observe(document, { childList: true, subtree: true })
    document.addEventListener('DOMContentLoaded', inspect, { once: true })
  })
  const samples: number[] = []
  const phaseSamples: { frameMs: number; loadStartMs: number | null; loadStartToFrameMs: number | null }[] = []
  const loadStartSamples: number[] = []
  const mediaSamples: number[] = []
  const failedRequests: string[] = []
  page.on('requestfailed', (request) => failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'unknown error'}`))
  // Stay below the fixture API's 20-resolve/minute ceiling; one cold load is excluded.
  const runCount = Math.min(19, Math.max(7, Number(process.env.PLAYBACK_BENCHMARK_RUNS) || 19))
  for (let run = 0; run < runCount; run++) {
    const reset = await request.post('http://127.0.0.1:18559/__fixtures/reset')
    expect(reset.ok()).toBe(true)
    await page.goto('/watch/movie/1')
    const video = page.locator('video')
    const paused = () => video.evaluate((element: HTMLVideoElement) => element.paused)
    const play = page.getByRole('button', { name: 'Play', exact: true })
    if (await paused() && await play.count() > 0 && await play.isVisible()) {
      const enabled = await play.isEnabled({ timeout: 1_000 }).catch(() => false)
      if (enabled && await paused()) await play.click({ timeout: 1_000 }).catch(() => {})
    }
    try {
      await expect.poll(() => page.evaluate(() => (window as Window & { __consumitFirstFrame?: number }).__consumitFirstFrame), { timeout: 20_000 }).toBeGreaterThan(0)
    } catch (error) {
      const media = await page.locator('video').evaluate((video: HTMLVideoElement) => ({ currentSrc: video.currentSrc, src: video.src, readyState: video.readyState, networkState: video.networkState, error: video.error && { code: video.error.code, message: video.error.message } }))
      const events = await page.evaluate(() => (window as Window & { __consumitMediaEvents?: unknown[] }).__consumitMediaEvents ?? [])
      throw new Error(`No first video frame; media=${JSON.stringify(media)} events=${JSON.stringify(events)} failedRequests=${JSON.stringify(failedRequests)}`, { cause: error })
    }
    const timing = await page.evaluate(() => {
      const view = window as Window & { __consumitFirstFrame: number; __consumitLoadStart?: number }
      return { frame: view.__consumitFirstFrame, loadStart: view.__consumitLoadStart }
    })
    if (run > 0) {
      const frameMs = Math.round(timing.frame)
      const loadStartMs = timing.loadStart == null ? null : Math.round(timing.loadStart)
      const loadStartToFrameMs = timing.loadStart == null ? null : Math.round(timing.frame - timing.loadStart)
      samples.push(frameMs) // Exclude cold Next compilation.
      phaseSamples.push({ frameMs, loadStartMs, loadStartToFrameMs })
      if (loadStartMs != null && loadStartToFrameMs != null) {
        loadStartSamples.push(loadStartMs)
        mediaSamples.push(loadStartToFrameMs)
      }
    }
  }
  samples.sort((a, b) => a - b)
  loadStartSamples.sort((a, b) => a - b)
  mediaSamples.sort((a, b) => a - b)
  const middle = Math.floor(samples.length / 2)
  const p50 = samples.length % 2 ? samples[middle] : Math.round((samples[middle - 1] + samples[middle]) / 2)
  const p95 = samples[Math.ceil(samples.length * 0.95) - 1]
  const core = process.env.PLAYBACK_BENCHMARK_CORE ?? (process.env.NEXT_PUBLIC_PLAYBACK_CORE === 'next' ? 'next' : 'legacy')
  console.log(JSON.stringify({ core, metric: 'navigation-to-first-video-frame', sampleCount: samples.length, samplesMs: samples, p50Ms: p50, p95Ms: p95, loadStartMs: loadStartSamples, loadStartToFrameMs: mediaSamples, phaseSamplesMs: phaseSamples }))
})
