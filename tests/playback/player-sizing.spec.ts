import { mkdir, writeFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'

test('preparation and caption choices fit wide, short desktop and phone viewports', async ({ page, request }, info) => {
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
    const preparation = new Promise<void>(resolve => { release = resolve })
    await page.route('**/v1/playback/attempts', async route => { await preparation; await route.continue() })
    await page.goto('/watch/movie/1')
    await expect(page.getByText('Finding your stream…', { exact: true })).toBeVisible()
    const artwork = await page.locator('[data-player-preparation-artwork]').boundingBox()
    const progress = (await page.locator('[data-player-preparation-progress]').boundingBox())!
    const picture = (await page.locator('.consumit-player-preparation').boundingBox())!
    await page.screenshot({ scale: 'css', path: `${directory}/${name}-preparation.png` })
    if (phase === 'after') {
      // The deterministic movie fixture has no logo artwork. When a title
      // provides artwork, keep checking its placement; otherwise verify the
      // preparation copy and progress still fit the picture.
      if (artwork) expect(artwork.y).toBeGreaterThan(picture.y + picture.height / 2)
      const bottomInset = width <= 600 ? 20 : name === 'landscape' ? 16 : 40
      expect(progress.y + progress.height).toBeLessThanOrEqual(picture.y + picture.height - bottomInset + 1)
      const activePreparationStroke = page.locator('.consumit-player-preparation-steps span').first()
      expect(await activePreparationStroke.evaluate(element => getComputedStyle(element, '::after').content)).toBe('""')
      expect(await activePreparationStroke.evaluate(element => getComputedStyle(element, '::after').animationName)).toBe('none')
      if (width <= 600) {
        const deck = page.locator('[data-player-controls]')
        await expect(deck).toHaveCSS('visibility', 'visible')
        await expect(deck).toHaveCSS('background-color', 'rgb(16, 16, 19)')
        await expect(deck.getByRole('button', { name: 'Play', exact: true })).toBeHidden()
        expect((await deck.boundingBox())!.y).toBeCloseTo(picture.y + picture.height, 0)
      }
    }
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
    expect(pauseArtwork.y + pauseArtwork.height / 2).toBeCloseTo(picture.y + picture.height / 2, 0)
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
    await expect(panel.getByText('Some tracks are unavailable. You can still choose from the available tracks.')).toBeAttached()
    const drawer = (await panel.boundingBox())!, list = (await panel.locator('.consumit-subtitle-browser').boundingBox())!, language = (await english.boundingBox())!
    const close = (await panel.getByRole('button', { name: 'Close captions' }).boundingBox())!
    const tools = (await panel.getByRole('group', { name: 'Subtitle tools' }).boundingBox())!
    measurements.push({ name, width, height, preparation: { artwork, progress, picture }, drawer, list, firstLanguage: language, close, tools })
    expect(drawer.x).toBeGreaterThanOrEqual(0)
    expect(drawer.y).toBeGreaterThanOrEqual(0)
    expect(drawer.x + drawer.width).toBeLessThanOrEqual(width)
    expect(drawer.y + drawer.height).toBeLessThanOrEqual(height)
    expect(close.width).toBeGreaterThanOrEqual(44)
    expect(close.height).toBeGreaterThanOrEqual(44)
    if (phase === 'after') {
      expect(language.y).toBeGreaterThanOrEqual(list.y)
      expect(language.y + language.height).toBeLessThanOrEqual(list.y + list.height)
      const secondLanguage = panel.getByRole('button', { name: /^Français \d+/ })
      await secondLanguage.scrollIntoViewIfNeeded()
      const secondLanguageBounds = (await secondLanguage.boundingBox())!
      expect(secondLanguageBounds.y + secondLanguageBounds.height).toBeLessThanOrEqual(list.y + list.height)
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
