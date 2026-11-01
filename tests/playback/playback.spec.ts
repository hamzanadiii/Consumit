import { test, expect, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import axe from 'axe-core'

test.beforeEach(async ({ request, page }) => {
  await page.route('https://fixture.example/english.vtt', (route) => route.fulfill({ contentType: 'text/vtt', body: 'WEBVTT\n\n00:00:00.000 --> 00:00:10.000\nTest caption\n' }))
  const response = await request.post('http://127.0.0.1:18559/__fixtures/reset')
  expect(response.ok()).toBe(true)
})

test('watch player hydrates without a disabled-control mismatch', async ({ page }) => {
  const hydrationErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && /hydration|did not match|server html/i.test(message.text())) {
      hydrationErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => {
    if (/hydration|did not match|server html/i.test(error.message)) hydrationErrors.push(error.message)
  })
  await page.goto('/watch/movie/1')
  await expect(page.locator('[data-consumit-player-screen]')).toHaveAttribute('data-session', 'ready')
  await expect(page.locator('[data-consumit-player]')).toHaveAttribute('data-player-core', process.env.NEXT_PUBLIC_PLAYBACK_CORE === 'next' ? 'next' : 'legacy')
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(2)
  await expect.poll(() => hydrationErrors).toEqual([])
})

test('browser-blocked autoplay shows a clear Play action and resumes from the gesture', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript(() => {
    const nativePlay = HTMLMediaElement.prototype.play
    let rejectInitialAutoplay = true
    HTMLMediaElement.prototype.play = function () {
      if (this instanceof HTMLVideoElement && rejectInitialAutoplay) {
        rejectInitialAutoplay = false
        return Promise.reject(new DOMException('User activation required', 'NotAllowedError'))
      }
      return nativePlay.call(this)
    }
  })
  await page.goto('/watch/movie/1')

  const video = page.locator('video')
  const guidance = page.getByRole('status').filter({ hasText: 'Tap play to start watching' })
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(2)
  await expect(video).toHaveJSProperty('paused', true)
  await expect(guidance).toBeVisible()
  const guidancePill = guidance.locator('span')
  await expect(guidancePill).toBeVisible()
  await expect(guidancePill).toHaveClass(/bg-black\/90/)

  const play = page.getByRole('button', { name: 'Play', exact: true })
  await expect(play).toBeVisible()
  const bounds = await play.boundingBox()
  expect(bounds?.width ?? 0).toBeGreaterThanOrEqual(44)
  expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => (await (window as unknown as Window & { axe: typeof axe }).axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  })).violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })))
  expect(violations).toEqual([])

  await mkdir('.impeccable/review/watch-journey', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/watch-journey/autoplay-gesture-320x720.png' })
  await play.click()
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(false)
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0)
  await expect(guidance).not.toBeVisible()
})

test('HLS transport exposes Play while paused and resumes from a touch gesture', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await start(page, 2)
  const video = page.locator('video')
  await video.evaluate((element: HTMLVideoElement) => element.pause())
  const play = page.getByRole('button', { name: 'Play', exact: true })
  await expect(play).toBeVisible()
  await mkdir('.impeccable/review/watch-journey', { recursive: true })
  await page.screenshot({ scale: 'css', path: '.impeccable/review/watch-journey/hls-paused-320x720.png' })
  await play.click()
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => !element.paused)).toBe(true)
})

async function start(page: Page, id: number) {
  await page.goto(`/watch/movie/${id}`)
  const startButton = page.getByRole('button', { name: 'Start watching', exact: true })
  if (await startButton.isVisible()) await startButton.click()
  const video = page.locator('video')
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState), { timeout: 20_000 }).toBeGreaterThanOrEqual(2)
  const playButton = page.getByRole('button', { name: 'Play', exact: true })
  await expect.poll(async () => !await video.evaluate((element: HTMLVideoElement) => element.paused) || await playButton.isVisible().catch(() => false), { timeout: 20_000 }).toBe(true)
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await video.evaluate((element: HTMLVideoElement) => element.currentTime > 0)) break
    if (await video.evaluate((element: HTMLVideoElement) => element.paused)) {
      await expect(playButton).toBeVisible()
      await playButton.click()
    }
    await expect.poll(async () => await video.evaluate((element: HTMLVideoElement) => element.currentTime > 0 || element.paused), { timeout: 20_000 }).toBe(true)
  }
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime), { timeout: 20_000 }).toBeGreaterThan(0)
}

async function waitForReadyAttempt(page: Page, providerId: string) {
  const response = await page.waitForResponse(async response => {
    if (!response.url().includes('/v1/playback/attempts') || response.request().method() !== 'POST' || response.status() !== 200) return false
    const result = await response.json().catch(() => null)
    return result?.status === 'ready' && result.session?.source?.providerId === providerId
  })
  return response.json()
}

test('seek controls keep their numeric labels legible on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await start(page, 1)
  await page.mouse.move(160, 360)

  for (const direction of ['backward', 'forward']) {
    const control = page.locator(`[data-player-skip-button="${direction}"]`)
    await expect(control).toBeVisible()
    const amount = control.locator('[aria-hidden="true"] span')
    await expect(amount).toHaveText('10')
    expect(Number.parseFloat(await amount.evaluate(element => getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(11)
  }
  await mkdir('.impeccable/review/watch-journey', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/watch-journey/seek-labels-320x720.png' })
  await page.locator('[data-player-skip-button="forward"]').click()
  const feedbackLabel = page.getByText('Seconds', { exact: true })
  await expect(feedbackLabel).toBeVisible()
  expect(Number.parseFloat(await feedbackLabel.evaluate(element => getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(11)
  const [videoBox, feedbackBox] = await Promise.all([page.locator('[data-player-stage] > video').boundingBox(), feedbackLabel.boundingBox()])
  expect(feedbackBox!.y + feedbackBox!.height).toBeLessThanOrEqual(videoBox!.y + videoBox!.height)
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/watch-journey/seek-feedback-320x720.png' })
})

test('an active Watch makes buffering clear on a narrow phone', async ({ page }) => {
  await start(page, 1)
  await page.setViewportSize({ width: 320, height: 720 })
  const video = page.locator('video').first()
  await video.evaluate(element => element.dispatchEvent(new Event('waiting')))

  const buffering = page.getByText('Buffering video', { exact: true })
  await expect(buffering).toBeVisible()
  expect((await buffering.boundingBox())?.width ?? 0).toBeGreaterThan(40)
  await expect(buffering.locator('../..')).toHaveCSS('z-index', '30')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => (await (window as unknown as Window & { axe: typeof axe }).axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  })).violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })))
  expect(violations).toEqual([])

  await mkdir('.impeccable/review/watch-journey', { recursive: true })
  await page.screenshot({ caret: 'initial', path: '.impeccable/review/watch-journey/buffering-320x720.png' })
  await video.evaluate(element => element.dispatchEvent(new Event('playing')))
  await expect(buffering).not.toBeVisible()
})

test('native playback saves guest progress and resumes after reload', async ({ page }) => {
  await start(page, 1)
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => { video.currentTime = 12; video.pause(); return video.paused })).toBe(true)
  await page.waitForTimeout(500)
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.paused)).toBe(true)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('consumit.progress:guest:movie:1:0:0') ?? '{}').positionSeconds)).toBeGreaterThanOrEqual(12)
  await page.reload()
  const startButton = page.getByRole('button', { name: 'Start watching', exact: true })
  if (await startButton.isVisible()) await startButton.click()
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThanOrEqual(12)
})

test('pointer playback lets transport controls fade away', async ({ page }) => {
  await page.goto('/watch/movie/1')
  const video = page.locator('video')
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThanOrEqual(2)
  await video.evaluate((el: HTMLVideoElement) => el.pause())
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.mouse.move(640, 300)
  await expect(page.locator('[data-consumit-player]')).toHaveAttribute('data-controls-visible', 'false', { timeout: 6000 })
})

test('focused player controls stay visible while video plays', async ({ page }) => {
  await start(page, 1)
  await page.getByRole('button', { name: 'Pause', exact: true }).focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeFocused()
  await page.waitForTimeout(3_200)
  await expect(page.locator('[data-consumit-player]')).toHaveAttribute('data-controls-visible', 'true')
})

test('direct HLS decodes video without attaching a raw provider caption URL', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit' && process.platform === 'win32', 'Windows Playwright WebKit does not expose a working HLS decoder for this fixture.')
  const resolved = waitForReadyAttempt(page, 'primary')
  await page.goto('/watch/movie/2')
  expect((await resolved).session.source.type).toBe('hls')
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.videoWidth)).toBe(640)
  // Provider sidecars are prepared through Consumit's same-origin subtitle
  // route before they join the player; raw upstream URLs stay out of the DOM.
  await expect(page.locator('video track[src="https://fixture.example/english.vtt"]')).toHaveCount(0)
})

test('the imported VixSrc adapter connects API extraction to actual HLS decoding', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit' && process.platform === 'win32', 'Windows Playwright WebKit does not expose a working HLS decoder for this fixture.')
  const resolved = waitForReadyAttempt(page, 'vixsrc')
  await page.goto('/watch/movie/4')
  const attempt = await resolved
  expect(attempt.session.source.providerId).toBe('vixsrc')
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.videoWidth)).toBe(640)
})

test('an unavailable source falls back to compatible media', async ({ page }) => {
  const fallback = waitForReadyAttempt(page, 'backup')
  await page.goto('/watch/movie/3')
  const startButton = page.getByRole('button', { name: 'Start watching', exact: true })
  if (await startButton.isVisible()) await startButton.click()
  expect((await fallback).session.source.providerId).toBe('backup')
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.videoWidth)).toBeGreaterThan(0)
})

test('recovery preserves a paused position', async ({ page }) => {
  await start(page, 1)
  await page.locator('video').evaluate((video: HTMLVideoElement) => { video.currentTime = 12; video.pause() })
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('consumit.progress:guest:movie:1:0:0') ?? '{}').positionSeconds)).toBeGreaterThanOrEqual(12)
  const fallback = waitForReadyAttempt(page, 'backup')
  await page.locator('video').evaluate((video) => video.dispatchEvent(new Event('error')))
  await fallback
  await expect(page.locator('[data-player-toast]')).toHaveText('Playback source restored. Your place is kept.')
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThanOrEqual(12)
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.paused)).toBe(true)
})

test('interrupted playback resumes from its checkpoint and keeps playing', async ({ page }) => {
  await start(page, 1)
  await page.setViewportSize({ width: 320, height: 720 })
  const video = page.locator('video')
  await video.evaluate((element: HTMLVideoElement) => { element.currentTime = 12 })
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(12)
  const checkpoint = await video.evaluate((element: HTMLVideoElement) => element.currentTime)
  const fallback = waitForReadyAttempt(page, 'backup')

  await video.evaluate((element: HTMLVideoElement) => element.dispatchEvent(new Event('error')))
  await fallback
  const restored = page.locator('[data-player-toast]')
  await expect(restored).toHaveText('Playback source restored. Your place is kept.')
  await expect(restored).toHaveAttribute('role', 'status')
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThanOrEqual(checkpoint)
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(false)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ scale: 'css', path: '.impeccable/review/watch-journey/interrupted-resume-320x720.png' })
})

test('narrow-phone playback adjustments stay reachable and retain their values', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await start(page, 1)
  const video = page.locator('video')
  await video.evaluate((element: HTMLVideoElement) => element.pause())
  const attachedVideo = await video.elementHandle()

  await page.getByRole('button', { name: /^Settings:/ }).click()
  await page.getByRole('dialog', { name: 'Settings options' }).getByRole('button', { name: /^Playback settings/ }).click()
  let panel = page.getByRole('dialog', { name: 'Playback settings', exact: true })
  const speed = panel.getByRole('slider', { name: 'Playback speed' })
  const brightness = panel.getByRole('slider', { name: 'Brightness' })
  await speed.press('ArrowRight')
  await speed.press('ArrowRight')
  await brightness.press('ArrowRight')
  await brightness.press('ArrowRight')

  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.playbackRate)).toBe(1.5)
  await expect(panel.locator('output').filter({ hasText: '1.5×' })).toBeVisible()
  await expect(panel.locator('output').filter({ hasText: '110%' })).toBeVisible()
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.style.filter)).toBe('brightness(1.1)')
  await panel.locator('.consumit-player-panel-body').evaluate(element => { element.scrollTop = element.scrollHeight })
  await expect(panel.getByText('60%', { exact: true })).toBeVisible()
  await expect(panel.getByText('100%', { exact: true })).toBeVisible()
  await expect(panel.getByText('130%', { exact: true })).toBeVisible()
  for (const slider of await panel.getByRole('slider').all()) {
    expect((await slider.boundingBox())?.height).toBeGreaterThanOrEqual(44)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.addScriptTag({ content: axe.source })
  const accessibility = await page.evaluate(async () => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    return axeApi.run(document.querySelector<HTMLElement>('[data-player-panel]')!, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    })
  })
  expect(accessibility.violations).toEqual([])
  await page.screenshot({ scale: 'css', path: '.impeccable/review/watch-journey/playback-adjustments-320x720.png' })

  await panel.getByRole('button', { name: 'Back to settings' }).click()
  await page.getByRole('button', { name: 'Close settings' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: /^Settings:/ }).click()
  await page.getByRole('dialog', { name: 'Settings options' }).getByRole('button', { name: /^Playback settings/ }).click()
  panel = page.getByRole('dialog', { name: 'Playback settings', exact: true })
  await expect(panel.locator('output').filter({ hasText: '1.5×' })).toBeVisible()
  await expect(panel.locator('output').filter({ hasText: '110%' })).toBeVisible()
  expect(await attachedVideo!.evaluate(element => element === document.querySelector('video'))).toBe(true)
  expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true)
})

test('quality choices show the active HLS tier and keep playback attached on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await start(page, 2)
  const video = page.locator('video')
  const attachedVideo = await video.elementHandle()

  await page.getByRole('button', { name: /^Settings:/ }).click()
  const settings = page.getByRole('dialog', { name: 'Settings options' })
  await settings.getByRole('button', { name: /^Quality/ }).click()
  const quality = page.getByRole('dialog', { name: 'Quality', exact: true })
  const options = quality.getByRole('radiogroup', { name: 'Quality options' })
  const auto = options.getByRole('radio', { name: 'Auto', exact: true })
  const standard = options.getByRole('radio', { name: '360p', exact: true })

  await expect(quality.getByRole('status')).toContainText('Playing at 640 × 360')
  await expect(auto).toBeChecked()
  await expect(standard).toBeVisible()
  expect(await options.getByRole('radio').count()).toBe(2)
  for (const choice of [auto, standard]) {
    expect((await choice.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.addScriptTag({ content: axe.source })
  const accessibility = await page.evaluate(async () => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    return axeApi.run(document.querySelector<HTMLElement>('[data-player-panel]')!, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    })
  })
  expect(accessibility.violations).toEqual([])

  await standard.click()
  await expect(quality).toHaveCount(0)
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => !element.paused && element.readyState >= 2)).toBe(true)
  expect(await attachedVideo!.evaluate(element => element === document.querySelector('video'))).toBe(true)
  await page.getByRole('button', { name: /^Settings:/ }).click()
  await expect(settings.getByRole('button', { name: /^Quality/ })).toContainText('360p')
  await settings.getByRole('button', { name: /^Quality/ }).click()
  await expect(standard).toBeChecked()
  await expect.poll(() => quality.evaluate(element => getComputedStyle(element).opacity)).toBe('1')
  await page.screenshot({ scale: 'css', path: '.impeccable/review/watch-journey/quality-selection-320x720.png' })
})

test('fixed provider quality switches to the decoded rendition and keeps the viewer’s place', async ({ page }) => {
  test.setTimeout(180000)
  await page.setViewportSize({ width: 320, height: 720 })
  const initialAttempt = waitForReadyAttempt(page, 'primary')
  await start(page, 9)
  const initial = await initialAttempt
  const video = page.locator('video')
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.videoHeight)).toBe(360)
  await video.evaluate((element: HTMLVideoElement) => { element.pause(); element.currentTime = 2 })
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => !element.seeking)).toBe(true)
  await page.getByRole('button', { name: 'Captions', exact: true }).click()
  const captions = page.getByRole('dialog', { name: 'Captions', exact: true })
  await captions.getByRole('button', { name: /^English \d+/ }).click()
  const englishTrack = captions.getByRole('radiogroup', { name: 'English caption tracks' }).getByRole('radio').nth(1)
  await englishTrack.click()
  await expect(captions).toHaveCount(0)
  const caption = page.locator('[data-consumit-player-caption]')
  await expect(caption).toContainText('Fixture caption')
  await video.evaluate((element: HTMLVideoElement) => { void element.play() })
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => !element.paused)).toBe(true)
  const initialVideoSource = await video.getAttribute('src')
  expect(initialVideoSource).toBeTruthy()
  await video.evaluate((element: HTMLVideoElement) => { element.volume = 0.37; element.muted = false })
  await video.evaluate((element: HTMLVideoElement) => { element.currentTime = 8 })
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(8)

  await page.getByRole('button', { name: /^Settings:/ }).click()
  const settings = page.getByRole('dialog', { name: 'Settings options' })
  await settings.getByRole('button', { name: /^Quality/ }).click()
  const quality = page.getByRole('dialog', { name: 'Quality', exact: true })
  const options = quality.getByRole('radiogroup', { name: 'Quality options' })
  await expect(options.getByRole('radio', { name: '360p', exact: true })).toBeChecked()
  const low = options.getByRole('radio', { name: '180p', exact: true })
  await expect(low).toBeVisible()
  for (const choice of await options.getByRole('radio').all()) {
    expect((await choice.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  }
  await page.addScriptTag({ content: axe.source })
  const accessibility = await page.evaluate(async () => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    return axeApi.run(document.querySelector<HTMLElement>('[data-player-panel]')!, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    })
  })
  expect(accessibility.violations).toEqual([])
  await mkdir('.impeccable/review/watch-journey', { recursive: true })
  await page.screenshot({ scale: 'css', path: '.impeccable/review/watch-journey/fixed-quality-selection-320x720.png' })

  let switchAttempts = 0
  await page.route('**/v1/playback/*/switch', async route => {
    switchAttempts += 1
    if (switchAttempts === 1) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
      return
    }
    await route.continue()
  })
  const positionBeforeFailure = await video.evaluate((element: HTMLVideoElement) => element.currentTime)
  const failedSwitch = page.waitForResponse(response => response.url().endsWith('/switch') && response.request().method() === 'POST' && response.status() === 503, { timeout: 15_000 })
  await low.click()
  const unavailable = await failedSwitch
  expect(unavailable.status()).toBe(503)
  expect(unavailable.url()).toContain(`/v1/playback/${initial.session.id}/switch`)
  const qualityFailure = page.getByRole('status').filter({ hasText: 'Quality unchanged. Playback continues; retry in Settings.' })
  await expect(qualityFailure).toBeVisible()
  const recoveryAccessibility = await page.evaluate(async () => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    return axeApi.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
  })
  expect(recoveryAccessibility.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expect(video).toHaveJSProperty('paused', false)
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => [element.videoWidth, element.videoHeight])).toEqual([640, 360])
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThanOrEqual(positionBeforeFailure)
  await expect(video).toHaveAttribute('src', initialVideoSource!)
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => [element.volume, element.muted])).toEqual([0.37, false])
  await expect(quality).toHaveCount(0)
  await page.screenshot({ animations: 'disabled', scale: 'css', path: '.impeccable/review/watch-journey/quality-switch-recovery-320x720.png' })

  await page.getByRole('button', { name: /^Settings:/ }).click()
  await expect(settings.getByRole('button', { name: /^Quality/ })).toContainText('360p')
  await settings.getByRole('button', { name: /^Quality/ }).click()
  await expect(options.getByRole('radio', { name: '360p', exact: true })).toBeChecked()
  await expect(low).toBeEnabled()

  const switchResponse = page.waitForResponse(response => response.url().endsWith('/switch') && response.request().method() === 'POST' && response.status() === 200, { timeout: 15_000 })
  await low.click()
  const switched = await switchResponse
  const next = await switched.json()
  expect(next).toMatchObject({
    id: initial.session.id,
    ref: { kind: 'movie', id: 9 },
    source: { providerId: 'primary', qualityHint: '180p', qualityHeights: [360, 180] },
  })
  await expect(quality).toHaveCount(0)
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => [element.videoWidth, element.videoHeight])).toEqual([320, 180])
  await expect(caption).toContainText('Fixture caption')
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThanOrEqual(7.5)
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => !element.paused && element.readyState >= 2)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await page.getByRole('button', { name: /^Settings:/ }).click()
  const settingsAfterReturn = page.getByRole('dialog', { name: 'Settings options' })
  await expect(settingsAfterReturn.getByRole('button', { name: /^Quality/ })).toContainText('180p')
  await settingsAfterReturn.getByRole('button', { name: /^Quality/ }).click()
  const roundTripQuality = page.getByRole('dialog', { name: 'Quality', exact: true })
  const standard = roundTripQuality.getByRole('radio', { name: '360p', exact: true })
  await expect(roundTripQuality.getByRole('radio', { name: '180p', exact: true })).toBeChecked()
  const roundTripAccessibility = await page.evaluate(async () => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    return axeApi.run(document.querySelector<HTMLElement>('[data-player-panel]')!, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    })
  })
  expect(roundTripAccessibility.violations).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ animations: 'disabled', scale: 'css', path: '.impeccable/review/watch-journey/quality-roundtrip-180p-320x720.png' })
  const returnResponse = page.waitForResponse(response => response.url().endsWith('/switch') && response.request().method() === 'POST' && response.status() === 200, { timeout: 15_000 })
  await standard.click()
  expect(await (await returnResponse).json()).toMatchObject({
    id: initial.session.id,
    ref: { kind: 'movie', id: 9 },
    source: { providerId: 'primary', qualityHint: '360p', qualityHeights: [360, 180] },
  })
  await expect(roundTripQuality).toHaveCount(0)
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => [element.videoWidth, element.videoHeight])).toEqual([640, 360])
  await expect(caption).toContainText('Fixture caption')
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThanOrEqual(7.5)
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => !element.paused && element.readyState >= 2)).toBe(true)
  await page.getByRole('button', { name: /^Settings:/ }).click()
  await expect(page.getByRole('dialog', { name: 'Settings options' }).getByRole('button', { name: /^Quality/ })).toContainText('360p')
  await page.getByRole('dialog', { name: 'Settings options' }).getByRole('button', { name: /^Quality/ }).click()
  await expect(page.getByRole('dialog', { name: 'Quality', exact: true }).getByRole('radio', { name: '360p', exact: true })).toBeChecked()
})

test('a saved quality preference is explained when the source has no selectable resolution', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript(() => localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({
    audioLanguage: 'en', animeAudio: 'sub', subtitlesEnabled: false, subtitleLanguages: ['en'], qualityHeight: 1080,
    autoplayNextEpisode: false, guideVersion: 1, guideStatus: 'completed', communityDismissed: false,
  })))
  await start(page, 1)

  await page.getByRole('button', { name: /^Settings:/ }).click()
  const settings = page.getByRole('dialog', { name: 'Settings options' })
  await settings.getByRole('button', { name: /^Quality/ }).click()
  const quality = page.getByRole('dialog', { name: 'Quality', exact: true })
  const notice = quality.getByRole('status').filter({ hasText: '1080p preferred; this source does not report a selectable resolution.' })
  await expect(notice).toBeVisible()

  const options = quality.getByRole('radiogroup', { name: 'Quality options' })
  const automatic = options.getByRole('radio', { name: 'Auto', exact: true })
  await expect(automatic).toBeChecked()
  expect((await automatic.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await options.getByRole('radio').count()).toBe(1)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('consumit.experience.guest.v1') ?? '{}').qualityHeight)).toBe(1080)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await page.addScriptTag({ content: axe.source })
  const accessibility = await page.evaluate(async () => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    return axeApi.run(document.querySelector<HTMLElement>('[data-player-panel]')!, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    })
  })
  expect(accessibility.violations).toEqual([])
  await mkdir('.impeccable/review/watch-journey', { recursive: true })
  await page.screenshot({ scale: 'css', path: '.impeccable/review/watch-journey/quality-preference-unavailable-320x720.png' })
})

test('renewing an unchanged media URL keeps playback running without reloading it', async ({ page }) => {
  await start(page, 6)
  const video = page.locator('video')
  await video.evaluate((element: HTMLVideoElement) => {
    const observed = element as HTMLVideoElement & { renewalReloads: number }
    observed.renewalReloads = 0
    element.addEventListener('loadstart', () => { observed.renewalReloads += 1 })
  })
  const renewed = await page.waitForResponse((response) => response.url().endsWith('/refresh') && response.status() === 200)
  const lease = (await renewed.json()).source
  const atRenewal = await video.evaluate((element: HTMLVideoElement) => element.currentTime)
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(atRenewal + 1)
  expect(await video.evaluate((element: HTMLVideoElement) => element.currentSrc)).toBe(lease.src)
  expect(await video.evaluate((element: HTMLVideoElement) => (element as HTMLVideoElement & { renewalReloads: number }).renewalReloads)).toBe(0)
  expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(false)
})

test('subtitle discovery shows all languages, pages tracks, and prepares the selected file', async ({ page }) => {
  await start(page, 5)
  await page.getByRole('button', { name: 'Captions' }).click()
  const menu = page.getByRole('dialog', { name: 'Captions' })
  await menu.getByRole('radio', { name: 'Off', exact: true }).click()
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => Array.from(video.textTracks).some((track) => track.mode === 'hidden' || track.mode === 'showing'))).toBe(false)
  await page.getByRole('button', { name: 'Captions' }).click()
  await expect(menu.getByRole('button', { name: /^English \d+$/ })).toBeVisible()
  await expect(menu.getByRole('button', { name: /^العربية \d+$/ })).toBeVisible()
  await menu.getByRole('button', { name: /^English \d+$/ }).click()
  await expect(menu.getByRole('button', { name: 'Load more tracks' })).toBeVisible()
  await menu.getByRole('button', { name: 'Load more tracks' }).click()
  await expect(menu.getByRole('button', { name: /English release 25/ })).toBeVisible()
  await menu.getByRole('button', { name: /English release 25/ }).click()
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => Array.from(video.textTracks).some((track) => track.language === 'en' && track.mode === 'hidden'))).toBe(true)
  await page.getByRole('button', { name: 'Captions' }).click()
  await page.locator('input[type="file"][accept*=".srt"]').setInputFiles({
    name: 'local.srt', mimeType: 'application/x-subrip',
    buffer: Buffer.from('1\n00:00:01,000 --> 00:00:20,000\nLocal caption\n'),
  })
  await expect(page.locator('video track[src^="blob:"]')).toHaveCount(1)
  await page.getByRole('button', { name: 'Captions' }).click()
  await page.getByRole('dialog', { name: 'Captions' }).getByRole('button', { name: 'Sync subtitle to audio' }).click()
  await expect(page.getByRole('dialog', { name: 'Subtitle sync' })).toBeVisible()
})

test('subtitle discovery failure stays distinct from an empty result and can be retried', async ({ page }) => {
  let requests = 0
  await page.route('**/v1/subtitles/discover?*', async route => {
    requests++
    if (requests <= 2) {
      await new Promise(resolve => setTimeout(resolve, 700))
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
      return
    }
    await route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'complete', searchId: '0d07a73e-7a7a-4f4a-8d40-a0ffb44812c5', languages: [] }) + '\n' })
  })
  const firstDiscovery = page.waitForRequest(request => request.url().includes('/v1/subtitles/discover?'))
  await page.goto('/watch/anime/8?episode=1&audio=sub')
  await firstDiscovery
  await page.getByRole('button', { name: 'Captions', exact: true }).click()
  const panel = page.getByRole('dialog', { name: 'Captions', exact: true })
  await expect(panel.getByRole('alert')).toContainText('Subtitle search is unavailable. Try again.')
  await expect(panel.getByText('No subtitles found for this title yet.')).toHaveCount(0)
  await panel.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect.poll(() => requests).toBe(3)
  await expect(panel.getByRole('alert')).toHaveCount(0)
  const emptyMessage = panel.getByText('No subtitles found for this title yet.')
  await expect(emptyMessage).toBeVisible()
  await expect(emptyMessage).toHaveAttribute('role', 'status')
})

test('separate audio keeps the current movie and resumes stream audio on request', async ({ page }) => {
  await page.route('https://fixture.example/**', async route => {
    const localUrl = `http://127.0.0.1:18560${new URL(route.request().url()).pathname}`
    await route.fulfill({ response: await route.fetch({ url: localUrl }) })
  })
  await start(page, 1)
  const video = page.locator('video')
  const originalVideo = await video.elementHandle()
  const originalSource = await video.evaluate((element: HTMLVideoElement) => element.currentSrc)
  await video.evaluate((element: HTMLVideoElement) => { element.currentTime = 8 })
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(8)

  await page.getByRole('button', { name: /^Settings:/ }).click()
  await page.getByRole('button', { name: /^Audio/ }).click()
  const panel = page.getByRole('dialog', { name: 'Audio', exact: true })
  const japanese = panel.getByRole('radio', { name: 'Japanese', exact: true })
  await expect(japanese).toBeVisible()
  await japanese.click()

  const separate = page.locator('audio[aria-hidden="true"]')
  await expect.poll(() => separate.evaluate((element: HTMLAudioElement) => Boolean(element.currentSrc && !element.paused && element.readyState >= 2)), { timeout: 20_000 }).toBe(true)
  await expect(japanese).toBeChecked()
  expect(await video.evaluate((element: HTMLVideoElement) => element.currentSrc)).toBe(originalSource)
  expect(await video.evaluate((element: HTMLVideoElement) => !element.paused)).toBe(true)
  expect(await originalVideo!.evaluate(element => element === document.querySelector('video'))).toBe(true)
  expect(Math.abs(await separate.evaluate((element: HTMLAudioElement) => element.currentTime) - await video.evaluate((element: HTMLVideoElement) => element.currentTime))).toBeLessThan(1)
  const audioSync = panel.getByRole('slider', { name: 'Audio sync' })
  for (let step = 0; step < 10; step++) await audioSync.press('ArrowRight')
  await expect(panel.getByText('+1.0s')).toBeVisible()
  await expect.poll(async () => (await separate.evaluate((element: HTMLAudioElement) => element.currentTime)) - (await video.evaluate((element: HTMLVideoElement) => element.currentTime))).toBeGreaterThan(0.5)
  await panel.getByRole('button', { name: 'Reset audio sync' }).click()
  await expect.poll(async () => Math.abs(await separate.evaluate((element: HTMLAudioElement) => element.currentTime) - await video.evaluate((element: HTMLVideoElement) => element.currentTime))).toBeLessThan(0.5)

  await panel.getByRole('radio', { name: 'Stream audio', exact: true }).click()
  await expect.poll(() => separate.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true)
  await expect(japanese).not.toBeChecked()
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(9)
})

test('audio language discovery retries failed and empty results from the open panel', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  let audioRequests = 0
  await page.route('**/v1/playback/*/audio', async route => {
    audioRequests++
    if (audioRequests === 1) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"temporary"}' })
      return
    }
    if (audioRequests === 2) {
      await route.fulfill({ json: { tracks: [] } })
      return
    }
    await route.continue()
  })

  await page.goto('/watch/movie/1')
  const video = page.locator('video')
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState), { timeout: 30_000 }).toBeGreaterThanOrEqual(2)
  await video.evaluate((element: HTMLVideoElement) => element.pause())
  await page.getByRole('button', { name: /^Settings:/ }).click()
  await page.getByRole('dialog', { name: 'Settings options' }).getByRole('button', { name: /^Audio/ }).click()
  await expect.poll(() => audioRequests).toBe(1)

  const panel = page.getByRole('dialog', { name: 'Audio', exact: true })
  await expect(panel.getByRole('status')).toContainText('More languages are unavailable')
  const retry = panel.getByRole('button', { name: 'Retry audio search', exact: true })
  expect((await retry.boundingBox())?.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.addScriptTag({ content: axe.source })
  const accessibility = await page.evaluate(async () => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    return axeApi.run(document.querySelector<HTMLElement>('[data-player-panel]')!, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    })
  })
  expect(accessibility.violations).toEqual([])
  await page.screenshot({ scale: 'css', path: '.impeccable/review/watch-journey/audio-retry-320x720.png' })

  await retry.click()
  await expect.poll(() => audioRequests).toBe(2)
  await expect(panel.getByRole('status')).toContainText('No additional audio languages were found')
  await expect(retry).toBeVisible()

  await retry.click()
  await expect(panel.getByRole('radio', { name: 'Japanese', exact: true })).toBeVisible()
  await expect.poll(() => audioRequests).toBe(3)
  await expect(panel.getByRole('status').filter({ hasText: /unavailable|No additional audio languages/ })).toHaveCount(0)
})

test('repeated short source renewals keep playback, captions, and paused position', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }))
  await start(page, 5)
  const video = page.locator('video')
  // Configure paused playback.
  await video.evaluate((element: HTMLVideoElement) => element.pause())
  await page.getByRole('button', { name: 'Settings: audio, speed, brightness' }).click()
  await page.getByRole('button', { name: /^Playback settings/ }).click()
  await page.getByRole('slider', { name: 'Playback speed' }).press('Home')
  await page.keyboard.press('Escape')
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.playbackRate)).toBe(0.5)
  await video.evaluate((element: HTMLVideoElement) => { element.currentTime = 12 })
  // This title has a deterministic English track. Discovery pagination and
  // track selection are covered separately, so this test stays focused on
  // retaining the selected caption during repeated short lease renewals.
  await expect(page.locator('video track[src*="/v1/subtitles/file/"]')).not.toHaveCount(0)
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => Array.from(element.textTracks).some((track) => track.language === 'en' && track.mode === 'hidden'))).toBe(true)
  const startingSource = await video.evaluate((element: HTMLVideoElement) => element.currentSrc)
  let reloads = 0
  await page.exposeFunction('recordRenewalReload', () => { reloads += 1 })
  await video.evaluate((element: HTMLVideoElement) => element.addEventListener('loadstart', () => { void (window as unknown as { recordRenewalReload: () => Promise<void> }).recordRenewalReload() }))
  const renewed: string[] = []
  const renewedSources: string[] = []
  page.on('response', async (response) => {
    if (!response.url().endsWith('/refresh') || response.status() !== 200) return
    try {
      const source = (await response.json()).source
      renewed.push(source.providerId as string)
      renewedSources.push(source.src as string)
    } catch { /* Ignore malformed fixture responses. */ }
  })
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect.poll(() => renewed.length, { timeout: 20_000 }).toBeGreaterThanOrEqual(1)
  expect(renewedSources[0]).not.toBe(startingSource)
  expect(await video.evaluate((element: HTMLVideoElement) => element.currentSrc)).toBe(startingSource)
  expect(reloads).toBe(0)
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.paused), { timeout: 15_000 }).toBe(false)
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.playbackRate)).toBe(0.5)
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime), { timeout: 15_000 }).toBeGreaterThanOrEqual(11)
  await video.evaluate((element: HTMLVideoElement) => { element.currentTime = 12; element.pause() })
  const renewalsWhilePaused = renewed.length
  await expect.poll(() => renewed.length, { timeout: 30_000 }).toBeGreaterThan(renewalsWhilePaused)
  expect(renewed.every((provider) => provider === 'primary')).toBe(true)
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime), { timeout: 10_000 }).toBeGreaterThanOrEqual(11)
  expect(Math.abs(await page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime) - 12)).toBeLessThanOrEqual(1)
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.paused)).toBe(true)
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => Array.from(video.textTracks).some((track) => track.mode === 'hidden'))).toBe(true)
  expect(await video.evaluate((element: HTMLVideoElement) => element.currentSrc)).toBe(startingSource)
  expect(reloads).toBe(0)
  // The latest renewed URL is used only when the attached stream fails.
  const standbySource = renewedSources.at(-1)!
  const beforeRecovery = renewed.length
  await video.evaluate((element: HTMLVideoElement) => element.dispatchEvent(new Event('error')))
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentSrc)).toBe(standbySource)
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThanOrEqual(11)
  expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true)
  expect(renewed.length).toBe(beforeRecovery)
})
