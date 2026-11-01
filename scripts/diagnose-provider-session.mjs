import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const argument = (name, fallback) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const ids = argument('ids', '').split(',').map(value => value.trim()).filter(Boolean)
if (!ids.length) throw new Error('Pass one or more provider ids with --ids=provider-a,provider-b.')

const apiOrigin = process.env.PLAYBACK_DIAGNOSTIC_PLAYBACK_API
  ?? process.env.PLAYBACK_DIAGNOSTIC_API
  ?? 'http://localhost:3001'
const browserOrigin = process.env.PLAYBACK_DIAGNOSTIC_ORIGIN ?? 'http://localhost:8080'
const relayPrototypeProxy = process.env.PLAYBACK_DIAGNOSTIC_RELAY_PROXY
if (relayPrototypeProxy) {
  const proxy = new URL(relayPrototypeProxy)
  if (proxy.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(proxy.hostname) || proxy.origin !== relayPrototypeProxy) throw new Error('The private relay prototype proxy must be an exact loopback HTTP origin.')
}
const providerConfigPath = process.env.PLAYBACK_MEDIA_CONFIG ?? 'infra/playback/providers.local.json'
const providerConfig = JSON.parse(await readFile(providerConfigPath, 'utf8'))
const providerRows = new Map(providerConfig.map(row => [row.id, row]))
const reportPath = argument('out', 'tmp/provider-session-diagnostics.json')
const requestedQuality = Number(argument('quality', '0'))
if (![0, 480, 720, 1080, 1440, 2160].includes(requestedQuality)) throw new Error('Choose a supported diagnostic height.')
const engineBundle = process.env.PLAYBACK_DIAGNOSTIC_ENGINE_BUNDLE
const movieId = Number(argument('movie', '550'))
const seriesCoordinates = argument('series', '1396:1:1').split(':').map(Number)
const animeId = Number(argument('anime', '21'))
const [seriesId, season, episode] = seriesCoordinates
if (![movieId, seriesId, season, episode, animeId].every(Number.isSafeInteger) || [movieId, seriesId, season, episode, animeId].some(value => value <= 0)) {
  throw new Error('Use positive integers for --movie, --series=tmdb-id:season:episode, and --anime.')
}

const allRefs = [
  { kind: 'movie', id: movieId },
  { kind: 'series', id: seriesId, season, episode },
  { kind: 'anime', id: animeId, episode: 1 },
]
const requestedKinds = argument('kind', 'movie,series').split(',').map(value => value.trim()).filter(Boolean)
if (requestedKinds.includes('all')) requestedKinds.splice(0, requestedKinds.length, 'movie', 'series', 'anime')
if (!requestedKinds.length || requestedKinds.some(kind => !['movie', 'series', 'anime'].includes(kind))) {
  throw new Error('Use --kind=movie, --kind=series, --kind=anime, or --kind=all.')
}
const refs = allRefs.filter(ref => requestedKinds.includes(ref.kind))
const require = createRequire(resolve('packages/ui/package.json'))
const hlsCode = require.resolve('hls.js/dist/hls.min.js')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = []

async function checkBrowserSource(source) {
  if (source.delivery === 'embed' || source.type === 'iframe') return { ok: false, code: 'embed-needs-frame-check' }
  const page = await browser.newPage()
  let browserStage = 'navigation'
  if (relayPrototypeProxy) {
    const sourceOrigin = new URL(source.src).origin
    await page.route(`${sourceOrigin}/media/**`, async route => {
      const target = new URL(route.request().url())
      const response = await route.fetch({ url: relayPrototypeProxy + target.pathname + target.search })
      await route.fulfill({ response })
    })
  }
  const network = new Map()
  const browserErrors = new Set()
  page.on('console', message => {
    if (message.type() !== 'error') return
    const value = message.text()
    if (!value.includes(new URL(source.src).hostname)) return
    if (/Content Security Policy|connect-src|media-src/i.test(value)) browserErrors.add('content-security-policy')
    else if (/CORS|Access-Control-Allow/i.test(value)) browserErrors.add('cors')
    else if (/certificate|ERR_CERT/i.test(value)) browserErrors.add('certificate')
  })
  const recordNetwork = (rawUrl, outcome) => {
    try {
      const parsed = new URL(rawUrl)
      if (parsed.origin === new URL(browserOrigin).origin && !parsed.pathname.startsWith('/v1/playback/')) return
      const key = `${parsed.hostname}|${outcome}`
      const current = network.get(key) ?? { host: parsed.hostname, count: 0 }
      current.count += 1
      if (outcome.startsWith('status:')) current.status = Number(outcome.slice(7))
      else current.error = outcome.slice(6)
      network.set(key, current)
    } catch {}
  }
  try {
    await page.goto(new URL('/about', browserOrigin).toString(), { waitUntil: 'domcontentloaded', timeout: 20_000 })
    browserStage = 'hls-script'
    await page.addScriptTag({ path: hlsCode })
    browserStage = 'engine-script'
    if (engineBundle) await page.addScriptTag({ path: engineBundle })
    browserStage = 'playback'
    page.on('response', response => recordNetwork(response.url(), `status:${response.status()}`))
    page.on('requestfailed', request => {
      const rawFailure = request.failure()?.errorText ?? ''
      const safeFailure = /^net::[A-Z0-9_.-]+$/.test(rawFailure) ? rawFailure.slice(5) : 'REQUEST_FAILED'
      recordNetwork(request.url(), `error:${safeFailure}`)
    })
    const playback = await page.evaluate(async ({ url, type, mediaSource, requestedQuality, useEngine }) => new Promise(resolve => {
      const startedAt = performance.now()
      let firstFrameMs
      const video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      document.body.append(video)

      let hls
      let engine
      let complete = false
      let firstFrame = false
      let playbackAdvanced = false
      let seekSucceeded = false
      let resumed = false
      let firstFrameMediaTime = 0
      let seekDeadline
      let advanceDeadline
      let resumeDeadline
      const finish = (code, ok = false, details) => {
        if (complete) return
        complete = true
        clearTimeout(firstFrameDeadline)
        clearTimeout(advanceDeadline)
        clearTimeout(seekDeadline)
        clearTimeout(resumeDeadline)
        const dimensions = { width: video.videoWidth, height: video.videoHeight }
        video.pause()
        hls?.destroy()
        engine?.destroy()
        video.remove()
        resolve({ ok, code, details, firstFrame, firstFrameMs, playbackAdvanced, seekSucceeded, resumed, ...dimensions })
      }
      const firstFrameDeadline = setTimeout(() => finish('first-frame-timeout'), 25_000)
      video.addEventListener('error', () => finish('media-error'))

      const waitForResume = (_now, metadata) => {
        if (metadata.mediaTime >= resumeFrom + 0.25 && video.currentTime >= resumeFrom + 0.25 && !video.paused) {
          resumed = true
          finish('first-frame-advance-seek-resume', true)
          return
        }
        if (!complete) video.requestVideoFrameCallback(waitForResume)
      }

      const waitForFrameAfterSeek = (_now, metadata) => {
        if (metadata.mediaTime >= target - 0.5 && video.currentTime >= target - 0.5 && video.readyState >= 2) {
          seekSucceeded = true
          resumeFrom = video.currentTime
          video.pause()
          setTimeout(() => {
            if (complete) return
            resumeDeadline = setTimeout(() => finish('resume-timeout'), 8_000)
            void video.play().then(() => video.requestVideoFrameCallback(waitForResume))
              .catch(() => finish('resume-play-error'))
          }, 200)
          return
        }
        if (!complete) video.requestVideoFrameCallback(waitForFrameAfterSeek)
      }

      const seekAfterAdvance = () => {
        clearTimeout(advanceDeadline)
        const duration = Number.isFinite(video.duration) ? video.duration : 0
        target = duration > 2 ? Math.min(10, duration - 1) : 5
        video.addEventListener('seeked', () => {
          seekDeadline = setTimeout(() => finish('seek-timeout'), 12_000)
          void video.play().then(() => video.requestVideoFrameCallback(waitForFrameAfterSeek))
            .catch(() => finish('seek-play-error'))
        }, { once: true })
        video.currentTime = target
      }

      const waitForAdvance = (_now, metadata) => {
        if (metadata.mediaTime >= firstFrameMediaTime + 0.5 && video.currentTime >= firstFrameMediaTime + 0.5) {
          playbackAdvanced = true
          seekAfterAdvance()
          return
        }
        if (!complete) video.requestVideoFrameCallback(waitForAdvance)
      }

      const afterFirstFrame = () => {
        if (complete || firstFrame) return
        if (requestedQuality && video.videoHeight < requestedQuality && !(requestedQuality === 2160 && video.videoWidth >= 3800)) {
          video.requestVideoFrameCallback(afterFirstFrame)
          return
        }
        firstFrame = true
        firstFrameMs = Math.round(performance.now() - startedAt)
        firstFrameMediaTime = video.currentTime
        advanceDeadline = setTimeout(() => finish('advance-timeout'), 8_000)
        video.requestVideoFrameCallback(waitForAdvance)
      }

      let target = 5
      let resumeFrom = 0
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(afterFirstFrame)
      else video.addEventListener('playing', afterFirstFrame, { once: true })

      if (useEngine) {
        void window.ConsumitDiagnosticEngine.attachMediaEngine(video, mediaSource, {
          fatal: (reason, deliveryFailure) => finish(`engine-${reason}`, false, { reason: deliveryFailure }),
          tracks: tracks => {
            if (!requestedQuality || !engine) return
            const option = tracks.qualities.find(option => option.height === requestedQuality)
            if (option) engine.quality(option.value)
          },
        }).then(attached => { engine = attached; if (complete) engine.destroy(); else void video.play().catch(() => finish('play-rejected')) }).catch(() => finish('engine-attach-error'))
      } else if (type === 'hls' && window.Hls?.isSupported()) {
        hls = new window.Hls({
          maxBufferLength: 3,
          maxMaxBufferLength: 6,
          maxBufferSize: 8 * 1024 * 1024,
          manifestLoadingMaxRetry: 0,
          levelLoadingMaxRetry: 0,
          fragLoadingMaxRetry: 0,
        })
        hls.on(window.Hls.Events.ERROR, (_event, info) => {
          if (info.fatal) finish(`hls-${info.type}`, false, { reason: info.details, status: info.response?.code, context: info.context?.type, parent: info.parent, track: info.frag?.type })
        })
        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          if (requestedQuality) {
            const level = hls.levels.findIndex(level => level.height === requestedQuality || requestedQuality === 2160 && level.width >= 3800)
            if (level < 0) { finish('quality-not-available'); return }
            hls.startLevel = level; hls.currentLevel = level
          }
          void video.play().catch(() => finish('play-rejected'))
        })
        hls.loadSource(url)
        hls.attachMedia(video)
      } else {
        video.src = url
        void video.play().catch(() => finish('play-rejected'))
      }
    }), { url: source.src, type: source.type, mediaSource: source, requestedQuality, useEngine: Boolean(engineBundle) })
    await page.waitForTimeout(150)
    return { ...playback, browserErrors: [...browserErrors], network: [...network.values()].slice(0, 12) }
  } catch (error) {
    return { ok: false, code: 'browser-error', details: { stage: browserStage, error: /(?:ReferenceError|TypeError|SyntaxError|TimeoutError)/.exec(String(error))?.[0] ?? 'browser-operation' } }
  } finally {
    await page.close()
  }
}

try {
  for (const providerId of ids) {
    for (const defaultRef of refs) {
      const providerProbe = providerRows.get(providerId)?.probes?.[defaultRef.kind]
      const ref = providerProbe?.ref ?? defaultRef
      const audioLanguage = providerProbe?.audioLanguage ?? (ref.kind === 'anime' ? 'ja' : 'en')
      const probeSource = providerProbe?.ref ? 'configured' : 'default'
      let response
      let session
      const resolveStarted = Date.now()
      try {
        response = await fetch(new URL('/v1/playback/resolve', apiOrigin), {
          method: 'POST',
          headers: { origin: browserOrigin, 'content-type': 'application/json' },
          body: JSON.stringify({
            ref,
            providerId,
            audioLanguage,
            ...(requestedQuality ? { preferences: { qualityHeight: requestedQuality } } : {}),
            capabilities: { native: true, hls: true, dash: false, nativeHls: false },
          }),
          signal: AbortSignal.timeout(70_000),
        })
        session = await response.json().catch(() => ({}))
      } catch {
        const result = { providerId, ref, probeSource, httpStatus: null, code: 'api-transport-error' }
        results.push(result)
        console.log(JSON.stringify(result))
        continue
      }

      const source = session.source
      const resolveMs = Date.now() - resolveStarted
      if (!source?.src) {
        const result = { providerId, ref, probeSource, httpStatus: response.status, code: session.error?.code ?? 'no-source' }
        results.push(result)
        console.log(JSON.stringify(result))
        continue
      }

      const playback = await checkBrowserSource(source)
      results.push({
        providerId,
        ref,
        probeSource,
        httpStatus: response.status,
        delivery: source.delivery,
        mediaType: source.type,
        resolveMs,
        sourceHost: new URL(source.src).hostname,
        firstFrame: playback.firstFrame ?? false,
        playbackAdvanced: playback.playbackAdvanced ?? false,
        seek: playback.seekSucceeded ?? false,
        resumed: playback.resumed ?? false,
        code: playback.code,
        ...(playback.details ? { details: playback.details } : {}),
        ...(playback.firstFrameMs !== undefined ? { firstFrameMs: playback.firstFrameMs } : {}),
        ...(playback.browserErrors?.length ? { browserErrors: playback.browserErrors } : {}),
        ...(playback.network?.length ? { network: playback.network } : {}),
        ...(playback.width && playback.height ? { dimensions: `${playback.width}x${playback.height}` } : {}),
      })
      console.log(JSON.stringify(results.at(-1)))
    }
  }
} finally {
  await browser.close()
}

await mkdir('tmp', { recursive: true })
await writeFile(reportPath, `${JSON.stringify({ at: new Date().toISOString(), browser: 'Chrome', requestedQuality, engine: engineBundle ? 'workspace-media-engine' : 'raw-hls', transport: relayPrototypeProxy ? 'private-relay-prototype' : 'configured-public-route', results }, null, 2)}\n`)
console.log(JSON.stringify({ checked: results.length, passed: results.filter(result => result.firstFrame && result.playbackAdvanced && result.seek && result.resumed).length, reportPath }))
