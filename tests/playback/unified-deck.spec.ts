import { test, expect } from '@playwright/test'

test.beforeEach(async ({ request, page }) => {
  await request.post('http://127.0.0.1:18559/__fixtures/reset')
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

test('unified deck and drawers fit desktop, phone, narrow phone and landscape', async ({ page }, info) => {
  test.setTimeout(180000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/watch/series/7?season=1&episode=1')
  const video = page.locator('video').first()
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState), { timeout: 30000 }).toBeGreaterThanOrEqual(2)
  for (const [name, width, height] of [['desktop', 1440, 900], ['phone', 390, 844], ['narrow', 320, 700], ['tablet', 768, 1024], ['landscape', 844, 390]] as const) {
    await page.setViewportSize({ width, height })
    await video.evaluate((element: HTMLVideoElement) => { element.pause(); element.currentTime = 2 })
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => !element.seeking && element.readyState >= 2), { timeout: 30000 }).toBe(true)
    const videoHandle = await video.elementHandle()
    const deck = page.locator('[data-player-actions]')
    await expect(deck).toHaveText('SourcesCaptionsEpisodesSettings')
    for (const action of await deck.getByRole('button').all()) {
      const box = (await action.boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (width <= 600) expect((await page.getByRole('slider', { name: 'Playback position' }).boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await page.screenshot({ scale: 'css', path: `.impeccable/review/unified-deck/${name}.png` })
    for (const [button, panel] of [['Settings: audio, speed, brightness', 'Settings options'], ['Sources', 'Sources'], ['Captions', 'Captions'], ['Episodes', 'Episodes']] as const) {
      await page.getByRole('button', { name: button, exact: true }).click()
      const drawer = page.getByRole('dialog', { name: panel, exact: true })
      await expect(drawer).toBeVisible()
      if (panel === 'Settings options') {
        await expect(drawer.getByRole('heading', { name: 'Playback' })).toBeVisible()
        await expect(drawer.getByRole('heading', { name: 'Viewing' })).toBeVisible()
        await expect(drawer.getByRole('heading', { name: 'Watch preferences' })).toBeVisible()
        expect(await drawer.locator('.consumit-player-panel-body').evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
        const headerBox = (await drawer.locator('header').boundingBox())!
        const headerHit = await page.evaluate(({ x, y }) => { const hit = document.elementFromPoint(x, y); return hit?.closest('[data-player-panel]') === document.querySelector('[data-player-panel]') }, { x: headerBox.x + 24, y: headerBox.y + 24 })
        expect(headerHit).toBe(true)
      }
      const box = (await drawer.boundingBox())!
      const trigger = (await page.getByRole('button', { name: button, exact: true }).boundingBox())!
      const player = (await page.locator('[data-consumit-player]').boundingBox())!
      const inset = await page.locator('[data-consumit-player]').evaluate(element => ({ left: element.clientLeft, top: element.clientTop, width: element.clientWidth }))
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width)
      expect(box.y + box.height).toBeLessThanOrEqual(height)
      expect(box.y + box.height).toBeCloseTo(trigger.y - 8, 0)
      const expectedX = Math.max(player.x + inset.left + 12, Math.min(player.x + inset.left + inset.width - box.width - 12, trigger.x + trigger.width / 2 - box.width / 2))
      expect(box.x).toBeCloseTo(expectedX, 0)
      expect(box.height).toBeLessThanOrEqual(Math.min(height * .62, 520, trigger.y - player.y - inset.top - 8) + 1)
      await page.screenshot({ scale: 'css', path: `.impeccable/review/unified-deck/${name}-${panel.split(' ')[0].toLowerCase()}.png` })
      await page.keyboard.press('Escape')
      await expect(drawer).toHaveCount(0)
      if (info.project.name !== 'chrome-touch') await expect(page.getByRole('button', { name: button, exact: true })).toBeFocused()
    }
    expect(await videoHandle!.evaluate(element => element === document.querySelector('video'))).toBe(true)
  }
  expect(errors).toEqual([])
})

test('destination buttons toggle nested panels and switch without disturbing playback', async ({ page }, info) => {
  await page.goto('/watch/series/7?season=1&episode=1')
  const video = page.locator('video')
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState), { timeout: 30000 }).toBeGreaterThanOrEqual(2)
  await video.evaluate((element: HTMLVideoElement) => element.pause())
  const handle = await video.elementHandle()
  const paused = await video.evaluate((element: HTMLVideoElement) => element.paused)
  await page.getByRole('button', { name: /^Settings:/ }).click()
  await page.getByRole('button', { name: /^Playback settings/ }).click()
  await expect(page.getByRole('dialog', { name: 'Playback settings' })).toBeVisible()
  await page.getByRole('button', { name: /^Settings:/ }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  if (info.project.name !== 'chrome-touch') await expect(page.getByRole('button', { name: /^Settings:/ })).toBeFocused()
  await page.getByRole('button', { name: /^Settings:/ }).click()
  await page.getByRole('button', { name: /^Playback settings/ }).click()
  await page.getByRole('button', { name: 'Back to settings' }).click()
  await expect(page.getByRole('dialog', { name: 'Settings options' })).toBeVisible()
  await page.getByRole('button', { name: 'Close settings' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  if (info.project.name !== 'chrome-touch') await expect(page.getByRole('button', { name: /^Settings:/ })).toBeFocused()
  await page.getByRole('button', { name: 'Captions', exact: true }).click()
  await page.getByRole('button', { name: 'Subtitle appearance' }).click()
  await expect(page.getByRole('dialog', { name: 'Subtitle appearance' })).toBeVisible()
  await page.getByRole('button', { name: 'Captions', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  if (info.project.name !== 'chrome-touch') await expect(page.getByRole('button', { name: 'Captions', exact: true })).toBeFocused()
  await page.getByRole('button', { name: /^Settings:/ }).click()
  await page.getByRole('button', { name: 'Episodes', exact: true }).click()
  const episodes = page.getByRole('dialog', { name: 'Episodes', exact: true })
  await expect(episodes).toBeVisible()
  await expect(episodes.locator('a').first()).toBeVisible()
  const episode = (await episodes.locator('a').first().boundingBox())!
  expect(episode.height).toBeGreaterThanOrEqual(72)
  expect(episode.height).toBeLessThanOrEqual(96)
  await page.getByRole('button', { name: 'Episodes', exact: true }).click()
  await expect(episodes).toHaveCount(0)
  expect(await handle!.evaluate(element => element === document.querySelector('video'))).toBe(true)
  expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(paused)
})

test('Escape closes a drawer before leaving fullscreen', async ({ page }) => {
  await page.goto('/watch/series/7?season=1&episode=1')
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState), { timeout: 30000 }).toBeGreaterThanOrEqual(2)
  await page.getByRole('button', { name: 'Enter fullscreen', exact: true }).click()
  await page.getByRole('button', { name: /Settings:/ }).click()
  await page.getByRole('button', { name: /^Playback settings/ }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('[data-consumit-player]')).toHaveAttribute('data-fullscreen', 'true')
})

test('manual Sources selection keeps the paused position and recovery stays actionable', async ({ page }, info) => {
  await page.goto('/watch/movie/1')
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState), { timeout: 30000 }).toBeGreaterThanOrEqual(2)
  await page.locator('video').evaluate((video: HTMLVideoElement) => { video.pause(); video.currentTime = 12 })
  await page.getByRole('button', { name: 'Sources', exact: true }).click()
  const sources = page.getByRole('dialog', { name: 'Sources', exact: true })
  await sources.getByRole('textbox', { name: 'Search sources' }).fill('no matching fixture')
  await expect(sources.getByText('No matching sources. Try another name.')).toBeVisible()
  await sources.getByRole('button', { name: 'Clear source search' }).click()
  await sources.getByRole('button', { name: 'Server 2', exact: true }).click()
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime), { timeout: 30000 }).toBeGreaterThanOrEqual(11)
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.paused)).toBe(true)
  await page.route('**/v1/playback/attempts', route => route.fulfill({ status: 503, json: {} }))
  await page.reload()
  const error = page.getByRole('alert').filter({ hasText: 'Source search could not continue' })
  await expect(error).toBeVisible()
  await expect(error.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
  const manualRecovery = error.getByRole('button', { name: 'Server Auto', exact: true })
  await expect(manualRecovery).toBeVisible()
  const recoveryTarget = (await manualRecovery.boundingBox())!
  expect(recoveryTarget.width).toBeGreaterThanOrEqual(44)
  if (info.project.name === 'chrome-touch') expect(recoveryTarget.height).toBeGreaterThanOrEqual(44)
  await page.screenshot({ scale: 'css', path: `.impeccable/review/unified-deck/recovery-${info.project.name}.png` })
})

test('phone keyboard focus returns to the destination after Escape', async ({ page }, info) => {
  test.skip(info.project.name !== 'chrome-touch', 'Keyboard focus is checked in the touch-emulated phone project.')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/watch/series/7?season=1&episode=1')
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState), { timeout: 30000 }).toBeGreaterThanOrEqual(2)
  const settings = page.getByRole('button', { name: /^Settings:/ })
  await settings.focus()
  await page.keyboard.press('Enter')
  const panel = page.getByRole('dialog', { name: 'Settings options' })
  await expect(panel).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(settings).toBeFocused()
})

test('portrait captions remain over the picture when the stable deck hides', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('https://fixture.example/english.vtt', route => route.fulfill({ contentType: 'text/vtt', body: 'WEBVTT\n\n00:00:01.000 --> 00:00:20.000\nVisible over the picture\n' }))
  await page.goto('/watch/movie/5')
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState), { timeout: 30000 }).toBeGreaterThanOrEqual(2)
  await page.locator('video').evaluate(async (video: HTMLVideoElement) => { video.currentTime = 2; video.playbackRate = .1; await video.play() })
  await page.mouse.move(1, 1)
  await expect(page.locator('[data-consumit-player]')).toHaveAttribute('data-controls-visible', 'false')
  const cue = page.locator('[data-consumit-player-caption]')
  await expect(cue).toBeVisible()
  const caption = (await cue.boundingBox())!, video = (await page.locator('video').boundingBox())!
  expect(caption.y + caption.height).toBeLessThanOrEqual(video.y + video.height)
  await page.screenshot({ scale: 'css', path: `.impeccable/review/unified-deck/phone-hidden-captions-${info.project.name}.png` })
})

test('external Sources controls fill the panel on mobile and desktop without detaching the frame', async ({ page }, info) => {
  const frameUrl = 'https://embed.vidrift.net/embed/movie/1'
  await page.route('https://embed.vidrift.net/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body style="margin:0;background:#16161b;color:#f4f0e8;font:16px sans-serif;display:grid;place-items:center;height:100vh">External player fixture</body></html>' }))
  await page.route('**/v1/playback/providers', route => route.fulfill({
    contentType: 'application/json',
    json: { providers: [
      { id: 'fixture-direct', label: 'Fixture direct', deliveryMode: 'direct', available: true, regions: ['US'], health: 'ok', subtitles: [] },
      { id: 'fixture-external', label: 'Fixture external', deliveryMode: 'embed', available: true, regions: ['US'], health: 'ok', subtitles: [] },
    ] },
  }))
  await page.route(/\/v1\/playback\/attempts(?:\/[^/]+\/continue)?$/, async route => {
    const response = await route.fetch()
    const body = await response.json()
    if (body.session) body.session.source = { ...body.session.source, providerId: 'fixture-external', src: frameUrl, type: 'iframe', delivery: 'embed', frameSandbox: 'none' }
    await route.fulfill({ response, json: body })
  })
  await page.goto('/watch/movie/1')
  await expect(page.locator('[data-provider-frame]')).toBeVisible({ timeout: 30000 })
  await expect.poll(() => page.getByRole('link', { name: 'Back' }).evaluate(element => getComputedStyle(element).borderRadius)).toBe('5px')
  await expect(page.getByText('Automatic next episode unavailable')).toBeVisible()
  await expect(page.frameLocator('iframe').getByText('External player fixture')).toBeVisible()
  const frame = await page.locator('iframe').elementHandle()
  await expect.poll(() => page.getByRole('button', { name: 'Sources', exact: true }).evaluate(element => getComputedStyle(element).borderRadius)).toBe('5px')
  await expect.poll(() => page.getByRole('button', { name: 'Try another server' }).evaluate(element => getComputedStyle(element).borderRadius)).toBe('5px')
  await page.getByRole('button', { name: 'Sources', exact: true }).click()
  const sources = page.getByRole('dialog', { name: 'Sources' })
  await expect(sources).toBeVisible()
  const sourceSelect = sources.locator('[data-consumit-select] button[aria-haspopup="listbox"]').first()
  await sourceSelect.focus()
  await expect(sourceSelect).toBeEnabled()
  for (const [name, width, height] of [['reported viewport', 727, 370], ['phone', 390, 844], ['narrow phone', 320, 700], ['mobile landscape', 844, 390], ['desktop', 1440, 900]] as const) {
    await page.setViewportSize({ width, height })
    const available = await sources.locator('[data-consumit-select]').first().evaluate(element => {
      const parent = element.parentElement!
      const style = getComputedStyle(parent)
      return parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    })
    for (const control of await sources.locator('[data-consumit-select]').all()) {
      const box = (await control.boundingBox())!
      expect(box.width, `${name}: source controls should use the panel width`).toBeGreaterThanOrEqual(available * 0.9)
    }
    if (height <= 400) {
      await sourceSelect.click()
      const listbox = (await sources.getByRole('listbox').boundingBox())!
      expect(listbox.width, `${name}: source options should use the panel width`).toBeGreaterThanOrEqual(available * 0.9)
      const body = (await sources.locator('.consumit-player-panel-body').boundingBox())!
      expect(listbox.y, `${name}: source options should stay below the fixed panel header`).toBeGreaterThanOrEqual(body.y)
      expect(listbox.y + listbox.height, `${name}: source options should stay inside the scrollable panel body`).toBeLessThanOrEqual(body.y + body.height)
      if (name === 'reported viewport') await page.screenshot({ scale: 'css', path: `.impeccable/review/unified-deck/source-controls-${info.project.name}-727x370.png` })
      await sourceSelect.click()
    }
  }
  const sourcePanel = (await sources.boundingBox())!, sourceTrigger = (await page.getByRole('button', { name: 'Sources', exact: true }).boundingBox())!
  expect(sourcePanel.y + sourcePanel.height).toBeCloseTo(sourceTrigger.y - 8, 0)
  await page.getByRole('button', { name: /^Consumit Server/ }).focus()
  await expect(page.getByRole('button', { name: /External player.*Fixture external/ })).toBeVisible()
  expect(await frame!.evaluate(element => element === document.querySelector('iframe'))).toBe(true)
  expect(await page.getByRole('dialog', { name: 'Sources' }).evaluate(element => getComputedStyle(element).animationName)).toBe('none')
  await page.screenshot({ scale: 'css', path: `.impeccable/review/unified-deck/external-${info.project.name}.png` })
})

test('caption radio groups support native arrow selection', async ({ page }) => {
  await page.route('https://fixture.example/english.vtt', route => route.fulfill({ contentType: 'text/vtt', body: 'WEBVTT\n\n00:00:01.000 --> 00:00:20.000\nKeyboard fixture\n' }))
  await page.goto('/watch/movie/5')
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState), { timeout: 30000 }).toBeGreaterThanOrEqual(2)
  await page.locator('video').evaluate((video: HTMLVideoElement) => video.pause())
  await page.getByRole('button', { name: 'Captions', exact: true }).click()
  await page.getByRole('button', { name: /^English \d+/ }).click()
  const options = page.getByRole('radiogroup', { name: 'Caption tracks' })
  const english = options.getByRole('radio', { name: 'English', exact: true })
  await english.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Captions', exact: true }).click()
  await expect(page.getByRole('radio', { name: 'Off', exact: true })).toBeChecked()
})

test('keyboard transport and pointer or touch seeking retain a paused watch', async ({ page }, info) => {
  await page.goto('/watch/movie/1')
  const video = page.locator('video')
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState), { timeout: 30000 }).toBeGreaterThanOrEqual(2)
  await video.evaluate((element: HTMLVideoElement) => { element.pause(); element.currentTime = 2 })
  await page.getByRole('button', { name: 'Play', exact: true }).focus()
  await page.keyboard.press('l')
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeCloseTo(12, 0)
  await page.keyboard.press('j')
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeCloseTo(2, 0)
  await page.keyboard.press('m')
  expect(await video.evaluate((element: HTMLVideoElement) => element.muted)).toBe(true)
  const seek = (await page.getByRole('slider', { name: 'Playback position' }).boundingBox())!
  if (info.project.name === 'chrome-touch') await page.touchscreen.tap(seek.x + seek.width * .7, seek.y + seek.height / 2)
  else await page.mouse.click(seek.x + seek.width * .7, seek.y + seek.height / 2)
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(19)
  expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true)
})

test('caption preparation failure keeps the picture and other caption choices available', async ({ page }) => {
  await page.route('https://fixture.example/english.vtt', route => route.fulfill({ contentType: 'text/vtt', body: 'WEBVTT\n\n00:00:01.000 --> 00:00:20.000\nAvailable caption\n' }))
  await page.route(/\/v1\/subtitles\/discover\?/, route => route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ type: 'complete', searchId: '09c82022-4e60-49b3-b9d7-21a65a4aef95', languages: [{ code: 'en', count: 1 }] }) + '\n' }))
  await page.route('**/v1/subtitles/discover/page?**', route => route.fulfill({ json: { tracks: [{ id: 'failed-caption', label: 'English release 1', language: 'en', provider: 'fixture-subtitles', release: 'English release 1' }], total: 1, nextCursor: null } }))
  await page.route('**/v1/subtitles/discover/prepare', route => route.fulfill({ status: 503, json: {} }))
  await page.goto('/watch/movie/5')
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState), { timeout: 30000 }).toBeGreaterThanOrEqual(2)
  await page.locator('video').evaluate((video: HTMLVideoElement) => video.pause())
  const video = await page.locator('video').elementHandle()
  await page.getByRole('button', { name: 'Captions', exact: true }).click()
  const panel = page.getByRole('dialog', { name: 'Captions', exact: true })
  await panel.getByRole('button', { name: /^English \d+/ }).click()
  await panel.getByRole('button', { name: /English release 1$/ }).click()
  await expect(panel.getByRole('alert').filter({ hasText: 'This subtitle could not be prepared.' })).toBeVisible()
  await expect(panel.getByRole('radio', { name: 'Off', exact: true })).toBeEnabled()
  expect(await video!.evaluate(element => element === document.querySelector('video'))).toBe(true)
})

test('anime audio choices preserve the exact episode and carry DUB into navigation', async ({ page }) => {
  await page.goto('/watch/anime/8?episode=1&audio=sub')
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState), { timeout: 30000 }).toBeGreaterThanOrEqual(2)
  await page.locator('video').evaluate((video: HTMLVideoElement) => video.pause())
  await page.getByRole('button', { name: /^Settings:/ }).click()
  await expect(page.getByRole('radio', { name: 'SUB', exact: true })).toBeChecked()
  await page.getByText('DUB', { exact: true }).click()
  await expect(page).toHaveURL(/episode=1&audio=dub/)
  await page.getByRole('button', { name: 'Episodes', exact: true }).click()
  await expect(page.getByRole('link', { name: /^Watch episode 2:/ })).toHaveAttribute('href', '/watch/anime/8?episode=2&audio=dub')
})

test('anime preparation uses series artwork while the video keeps its episode still', async ({ page, request }) => {
  await request.post('http://127.0.0.1:18559/__fixtures/reset')
  let release = () => {}
  const preparation = new Promise<void>(resolve => { release = resolve })
  await page.route('**/v1/playback/attempts', async route => { await preparation; await route.continue() })
  await page.goto('/watch/anime/8?episode=1&audio=sub')
  await expect(page.locator('[data-player-preparation]')).toBeVisible()
  const backdrop = page.locator('[data-player-preparation-backdrop]')
  await expect(backdrop).toHaveAttribute('src', /anime-banner\.jpg/)
  await expect.poll(() => page.locator('video').getAttribute('poster')).toContain('anime-episode-still.jpg')
  release()
})
