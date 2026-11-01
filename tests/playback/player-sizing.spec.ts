import { mkdir, writeFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'

test('startup source search and caption choices fit wide, short desktop and phone viewports', async ({ page, request }, info) => {
  test.skip(info.project.name !== 'chrome', 'One bounded capture pass covers all six sizes.')
  test.setTimeout(180000)
  const phase = process.env.PLAYER_SIZING_CAPTURE_PHASE ?? 'after'
  const directory = `.impeccable/review/player-sizing/${phase}`
  await mkdir(directory, { recursive: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('https://fixture.example/english.vtt', route => route.fulfill({ contentType: 'text/vtt', body: 'WEBVTT\n\n00:00:01.000 --> 00:00:20.000\nFixture caption\n' }))
  await page.route(/\/v1\/subtitles\/discover\?/, route => route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'complete', searchId: '09c82022-4e60-49b3-b9d7-21a65a4aef95', languages: [{ code: 'en', count: 25 }, { code: 'ar', count: 2 }, { code: 'fr', count: 1 }], provider: { id: 'fixture-partial', name: 'Fixture provider', state: 'failed', durationMs: 1, found: 0, failure: 'search' } }) + '\n' }))
  const measurements = []
  for (const [name, width, height] of [['wide', 1920, 822], ['desktop', 1440, 900], ['short-desktop', 1280, 548], ['intermediate', 1024, 600], ['phone', 390, 844], ['narrow', 320, 720], ['landscape', 844, 390]] as const) {
    await request.post('http://127.0.0.1:18559/__fixtures/reset')
    await page.setViewportSize({ width, height })
    let release = () => {}
    let releaseTimer: ReturnType<typeof setTimeout> | undefined
    const preparation = new Promise<void>(resolve => {
      const finish = () => { if (releaseTimer) clearTimeout(releaseTimer); resolve() }
      release = finish
      // Give Next time to hydrate before taking the loading-state capture;
      // the fixture remains bounded if a geometry assertion fails.
      releaseTimer = setTimeout(finish, 60000)
    })
    await page.route('**/v1/playback/attempts', async route => { await preparation; await route.continue() })
    await page.goto('/watch/movie/1')
    const searching = page.getByRole('dialog', { name: 'Finding a source', exact: true })
    await expect(searching).toBeVisible()
    await expect(searching.getByRole('status')).toHaveText('Checking configured sources.')
    const card = (await searching.boundingBox())!
    const stage = (await page.locator('[data-player-stage]').boundingBox())!
    expect(card.x).toBeGreaterThanOrEqual(0)
    expect(card.y).toBeGreaterThanOrEqual(0)
    expect(card.x + card.width).toBeLessThanOrEqual(width)
    expect(card.y + card.height).toBeLessThanOrEqual(height)
    for (const name of ['Cancel', 'Choose a source']) {
      const actionLocator = searching.getByRole('button', { name, exact: true })
      await expect(actionLocator).toBeVisible({ timeout: 3000 })
      const action = (await actionLocator.boundingBox())!
      expect(action.width).toBeGreaterThanOrEqual(44)
      expect(action.height).toBeGreaterThanOrEqual(44)
      expect(action.x).toBeGreaterThanOrEqual(card.x)
      expect(action.x + action.width).toBeLessThanOrEqual(card.x + card.width)
    }
    await page.screenshot({ scale: 'css', path: `${directory}/${name}-searching.png` })
    release()
    await page.unroute('**/v1/playback/attempts')
    await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState), { timeout: 30000 }).toBeGreaterThanOrEqual(2)
    await page.locator('video').evaluate((video: HTMLVideoElement) => { video.pause(); video.currentTime = 2 })
    await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => !video.seeking && video.readyState >= 2)).toBe(true)
    const volumeControl = page.locator('[data-player-volume-control]')
    if (width <= 600 || name === 'landscape') {
      await expect(volumeControl).toHaveCSS('display', 'none')
    } else {
      await expect(volumeControl).toBeVisible()
    }
    const pauseCard = page.locator('[data-consumit-player-pause]')
    await expect(pauseCard).toBeVisible()
    await expect(pauseCard.locator('.consumit-player-pause-facts')).toBeVisible()
    const pauseArtwork = (await page.locator('[data-player-pause-artwork]').boundingBox())!
    const videoBounds = (await page.locator('video').boundingBox())!
    expect(pauseArtwork.y).toBeGreaterThanOrEqual(videoBounds.y)
    expect(pauseArtwork.y + pauseArtwork.height).toBeLessThanOrEqual(videoBounds.y + videoBounds.height)
    if (width <= 600 || name === 'landscape') await expect(pauseCard.locator('.consumit-player-pause-overview')).toBeHidden()
    else await expect(pauseCard.locator('.consumit-player-pause-overview')).toBeVisible()
    if (width <= 600) {
      const transportButtons = [
        page.locator('[data-player-play-button]'),
        page.locator('[data-player-skip-button="backward"]'),
        page.locator('[data-player-skip-button="forward"]'),
        page.locator('[data-player-fullscreen] button'),
      ]
      const boxes = await Promise.all(transportButtons.map(button => button.boundingBox()))
      const centers = boxes.map(box => box!.x + box!.width / 2)
      const intervals = centers.slice(1).map((center, index) => center - centers[index]!)
      expect(Math.max(...intervals) - Math.min(...intervals)).toBeLessThan(1)
      for (const box of boxes) {
        expect(box!.width).toBeGreaterThanOrEqual(44)
        expect(box!.height).toBeGreaterThanOrEqual(44)
      }
      expect(await page.locator('[data-player-episode-navigation] img').evaluate(image => (image as HTMLImageElement).getBoundingClientRect().width)).toBeGreaterThanOrEqual(36)
    }
    await page.screenshot({ scale: 'css', path: `${directory}/${name}-paused.png` })
    await page.getByRole('button', { name: 'Captions', exact: true }).click()
    const panel = page.getByRole('dialog', { name: 'Captions', exact: true })
    const english = panel.getByRole('button', { name: /^English \d+/ })
    await expect(english).toBeVisible()
    await expect(panel.getByRole('status').filter({ hasText: 'Some tracks are unavailable. You can still choose from the available tracks.' })).toBeVisible()
    const drawer = (await panel.boundingBox())!, list = (await panel.locator('.consumit-subtitle-browser').boundingBox())!, language = (await english.boundingBox())!
    const close = (await panel.getByRole('button', { name: 'Close captions' }).boundingBox())!
    const tools = (await panel.getByRole('group', { name: 'Subtitle tools' }).boundingBox())!
    measurements.push({ name, width, height, searching: { card, stage }, drawer, list, firstLanguage: language, close, tools })
    expect(drawer.x).toBeGreaterThanOrEqual(0)
    expect(drawer.y).toBeGreaterThanOrEqual(0)
    expect(drawer.x + drawer.width).toBeLessThanOrEqual(width)
    expect(drawer.y + drawer.height).toBeLessThanOrEqual(height)
    expect(close.width).toBeGreaterThanOrEqual(44)
    expect(close.height).toBeGreaterThanOrEqual(44)
    if (phase === 'after') {
      expect(language.y).toBeGreaterThanOrEqual(list.y)
      expect(language.y + language.height).toBeLessThanOrEqual(list.y + list.height)
      await page.screenshot({ scale: 'css', path: `${directory}/${name}-captions-initial.png` })
      if (name === 'phone' || name === 'narrow' || name === 'landscape') {
        const scrollCue = panel.locator('[data-player-panel-scroll-cue]')
        await expect(scrollCue).toHaveText('More caption choices below')
        const cueBounds = (await scrollCue.boundingBox())!
        expect(cueBounds.y + cueBounds.height).toBeLessThanOrEqual(tools.y)

        const captionList = panel.locator('.consumit-subtitle-browser')
        const lastLanguage = panel.locator('.consumit-subtitle-language > button').last()
        await captionList.evaluate((element: HTMLElement) => { element.scrollTop = element.scrollHeight })
        await expect(scrollCue).toHaveCount(0)
        const listBounds = (await captionList.boundingBox())!
        const lastLanguageBounds = (await lastLanguage.boundingBox())!
        expect(lastLanguageBounds.y).toBeGreaterThanOrEqual(listBounds.y)
        expect(lastLanguageBounds.y + lastLanguageBounds.height).toBeLessThanOrEqual(listBounds.y + listBounds.height)
        await captionList.evaluate((element: HTMLElement) => { element.scrollTop = 0 })
        await expect(scrollCue).toBeVisible()
      }
      const secondLanguage = panel.getByRole('button', { name: /^Français \d+/ })
      await secondLanguage.scrollIntoViewIfNeeded()
      const secondLanguageBounds = (await secondLanguage.boundingBox())!
      // Layout rectangles can retain subpixel fractions that do not clip a
      // rendered edge; keep the actual visible bound within half a CSS pixel.
      expect(secondLanguageBounds.y + secondLanguageBounds.height).toBeLessThanOrEqual(list.y + list.height + 0.5)
      expect(tools.y + tools.height).toBeLessThanOrEqual(drawer.y + drawer.height)
      expect(await page.getByRole('button', { name: /^Settings:/ }).getAttribute('title')).toBeNull()
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ scale: 'css', path: `${directory}/${name}-captions.png` })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Captions', exact: true })).toBeFocused()
    await page.getByRole('button', { name: /^Settings:/ }).click()
    await page.screenshot({ scale: 'css', path: `${directory}/${name}-settings.png` })
    await page.keyboard.press('Escape')
  }
  await writeFile(`${directory}/measurements.json`, JSON.stringify(measurements, null, 2))
  expect(errors).toEqual([])
})
