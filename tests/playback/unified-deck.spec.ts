import { test, expect } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
import axe from 'axe-core'

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
      for (const action of await drawer.locator('.consumit-player-panel-action').all()) {
        const target = (await action.boundingBox())!
        expect(target.width).toBeGreaterThanOrEqual(44)
        expect(target.height).toBeGreaterThanOrEqual(44)
      }
      if (panel === 'Settings options') {
        await expect(drawer.getByRole('heading', { name: 'Playback' })).toBeVisible()
        await expect(drawer.getByRole('heading', { name: 'Viewing' })).toBeVisible()
        await expect(drawer.getByRole('heading', { name: 'Watch preferences' })).toBeVisible()
        if (width === 1440) {
          const playbackWeight = await drawer.getByText('Quality', { exact: true }).evaluate(element => Number(getComputedStyle(element).fontWeight))
          const utilityWeight = await drawer.getByText('Keyboard shortcuts', { exact: true }).evaluate(element => Number(getComputedStyle(element).fontWeight))
          expect(playbackWeight, 'frequently changed playback controls scan ahead of optional utilities').toBeGreaterThan(utilityWeight)
          await page.addScriptTag({ content: axe.source })
          const violations = await page.evaluate(async () => {
            const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
            const panel = document.querySelector('[data-player-panel]')
            if (!panel) throw new Error('Settings panel is missing')
            const report = await axeApi.run(panel, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
            return report.violations.map(({ id, impact }) => ({ id, impact }))
          })
          expect(violations).toEqual([])
        }
        expect(await drawer.locator('.consumit-player-panel-body').evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
        if (width === 390 || width === 320 || width === 844) {
          const scrollCue = drawer.locator('[data-player-panel-scroll-cue]')
          await expect(scrollCue, 'phone and short-landscape settings tell viewers there are more options below').toBeVisible()
          await expect(scrollCue).toHaveText('More settings below')
        }
        if (width === 844) {
          const scrollCue = drawer.locator('[data-player-panel-scroll-cue]')
          await expect(scrollCue, 'short landscape settings indicate that more options are below').toBeVisible()
          const body = drawer.locator('.consumit-player-panel-body')
          await body.evaluate(element => { element.scrollTop = element.scrollHeight })
          await expect(drawer.getByRole('switch', { name: 'Auto-skip intros and outros' })).toBeInViewport()
          await expect(scrollCue, 'the continuation cue clears when the last options are reached').toHaveCount(0)
          await body.evaluate(element => { element.scrollTop = 0 })
          await expect(scrollCue, 'the continuation cue returns when the settings panel returns to its start').toBeVisible()
        }
        if (width === 320) {
          const autoSkip = drawer.getByRole('switch', { name: 'Auto-skip intros and outros' })
          await expect(drawer.getByRole('button', { name: 'Close settings' })).toBeFocused()
          let reachedAutoSkip = false
          for (let index = 0; index < 16; index += 1) {
            await page.keyboard.press('Tab')
            if (await autoSkip.evaluate(element => element === document.activeElement)) {
              reachedAutoSkip = true
              break
            }
          }
          expect(reachedAutoSkip, 'keyboard focus reaches the lower Watch preferences').toBe(true)
          const target = (await autoSkip.boundingBox())!
          const panelBounds = (await drawer.boundingBox())!
          expect(target.y).toBeGreaterThanOrEqual(panelBounds.y)
          expect(target.y + target.height).toBeLessThanOrEqual(panelBounds.y + panelBounds.height)
          expect(await autoSkip.evaluate(element => element.matches(':focus-visible'))).toBe(true)
          const scrollCue = drawer.locator('[data-player-panel-scroll-cue]')
          if (await scrollCue.isVisible()) {
            const cue = (await scrollCue.boundingBox())!
            expect(cue.x + cue.width <= target.x || target.x + target.width <= cue.x || cue.y + cue.height <= target.y || target.y + target.height <= cue.y, 'the settings continuation cue should not cover a focused Watch preference').toBe(true)
          }
          await page.screenshot({ scale: 'css', path: '.impeccable/review/watch-journey/settings-lower-preferences-keyboard-320x700.png' })
        }
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
    await page.screenshot({ scale: 'css', path: `.impeccable/review/unified-deck/${name}-${panel.split(' ', 1).join('').toLowerCase()}.png` })
      await page.keyboard.press('Escape')
      await expect(drawer).toHaveCount(0)
      if (info.project.name !== 'chrome-touch') await expect(page.getByRole('button', { name: button, exact: true })).toBeFocused()
    }
    expect(await videoHandle!.evaluate(element => element === document.querySelector('video'))).toBe(true)
  }
  expect(errors).toEqual([])
})

test('destination buttons toggle nested panels and switch without disturbing playback', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
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
  await page.getByRole('button', { name: 'Captions', exact: true }).click()
  await page.getByRole('button', { name: 'Sync subtitle to audio' }).click()
  const sync = page.getByRole('dialog', { name: 'Subtitle sync' })
  await expect(sync).toBeVisible()
  const resetSync = sync.getByRole('button', { name: 'Reset subtitle sync offset' })
  for (const action of await sync.getByRole('group', { name: 'Fine tune offset' }).getByRole('button').all()) {
    expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  }
  await resetSync.focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Shift+Tab')
  await expect(resetSync).toBeFocused()
  expect(await resetSync.evaluate(element => element.matches(':focus-visible'))).toBe(true)
  if (info.project.name === 'chrome-touch') await page.screenshot({ scale: 'css', path: '.impeccable/review/watch-journey/subtitle-sync-focus-phone.png' })
  await page.keyboard.press('Escape')
  await expect(sync).toHaveCount(0)
  await page.getByRole('button', { name: /^Settings:/ }).click()
  await page.getByRole('button', { name: /Cast to TV/ }).click()
  const cast = page.getByRole('dialog', { name: 'Cast to TV' })
  await expect(cast).toBeVisible()
  const recheck = cast.getByRole('button', { name: /Check again|Checking/ })
  await expect(recheck).toBeVisible()
  expect((await recheck.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await page.keyboard.press('Escape')
  await expect(cast).toHaveCount(0)
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
  const error = page.getByRole('alertdialog', { name: 'Couldn’t start playback' })
  await expect(error).toBeVisible()
  await expect(error).toContainText('Your place at 0:12 is saved.')
  const tryAgain = error.getByRole('button', { name: 'Try again with Auto', exact: true })
  const chooseSource = error.getByRole('button', { name: 'Choose a source', exact: true })
  await expect(tryAgain).toBeVisible()
  await expect(chooseSource).toBeVisible()
  for (const action of [tryAgain, chooseSource]) {
    const recoveryTarget = (await action.boundingBox())!
    expect(recoveryTarget.width).toBeGreaterThanOrEqual(44)
    expect(recoveryTarget.height).toBeGreaterThanOrEqual(44)
  }
  await chooseSource.click()
  const recoverySources = page.getByRole('dialog', { name: 'Sources', exact: true })
  await expect(recoverySources.getByRole('textbox', { name: 'Search sources' })).toBeVisible()
  await expect(recoverySources.getByRole('button', { name: 'Server 2', exact: true })).toBeVisible()
  await page.screenshot({ scale: 'css', path: `.impeccable/review/unified-deck/recovery-${info.project.name}.png` })
})

test('exhausted interrupted recovery keeps the checkpoint and next actions usable on a narrow phone', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto('/watch/movie/1')
  const video = page.locator('video')
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState), { timeout: 30000 }).toBeGreaterThanOrEqual(2)
  await video.evaluate((element: HTMLVideoElement) => { element.currentTime = 12; element.pause() })
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('consumit.progress:guest:movie:1:0:0') ?? '{}').positionSeconds)).toBeGreaterThanOrEqual(12)

  await page.route('**/v1/playback/attempts', route => route.fulfill({ status: 503, json: {} }))
  await video.evaluate((element: HTMLVideoElement) => element.dispatchEvent(new Event('error')))
  const recovery = page.getByRole('alertdialog', { name: 'Playback was interrupted' })
  await expect(recovery).toContainText('Playback stopped before another source was ready.')
  await expect(recovery).toContainText('Your place at 0:12 is saved.')
  await expect(recovery).not.toContainText('Your place is saved.')

  for (const label of ['Try again with Auto', 'Choose a source']) {
    const action = recovery.getByRole('button', { name: label, exact: true })
    const bounds = (await action.boundingBox())!
    expect(bounds.width).toBeGreaterThanOrEqual(44)
    expect(bounds.height).toBeGreaterThanOrEqual(44)
  }
  expect((await recovery.getByRole('button', { name: 'Choose a source', exact: true }).boundingBox())!.width).toBeGreaterThanOrEqual(220)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return report.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))
  })
  expect(violations, 'exhausted Watch recovery at 320px').toEqual([])
  await page.screenshot({ scale: 'css', path: `.impeccable/review/watch-journey/interrupted-exhausted-320x720-${info.project.name}.png` })

  await recovery.getByRole('button', { name: 'Try again with Auto', exact: true }).click()
  await expect(recovery).toContainText('Your place at 0:12 is saved.')
  await recovery.getByRole('button', { name: 'Choose a source', exact: true }).click()
  const sources = page.getByRole('dialog', { name: 'Sources', exact: true })
  await expect(sources.getByRole('textbox', { name: 'Search sources' })).toBeVisible()
  await expect(sources.getByRole('button', { name: 'Server 2', exact: true })).toBeVisible()
})

test('offline Watch recovery keeps the checkpoint and updates its retry guidance after reconnecting', async ({ page }, info) => {
  test.skip(info.project.name !== 'chrome-touch', 'Connection recovery is checked in the touch-emulated phone project.')
  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto('/watch/movie/1')
  const video = page.locator('video').first()
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState), { timeout: 30000 }).toBeGreaterThanOrEqual(2)
  await video.evaluate((element: HTMLVideoElement) => { element.currentTime = 12; element.pause() })
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('consumit.progress:guest:movie:1:0:0') ?? '{}').positionSeconds)).toBeGreaterThanOrEqual(12)

  await page.context().setOffline(true)
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false)
  await video.evaluate((element: HTMLVideoElement) => element.dispatchEvent(new Event('error')))
  const recovery = page.getByRole('alertdialog', { name: 'Playback was interrupted' })
  await expect(recovery).toContainText('Your device reports it’s offline. Reconnect, then try again with Auto or choose a source.')
  await expect(recovery).toContainText('Your place at 0:12 is saved.')
  await expect(recovery).not.toContainText('Your place is saved. Reconnect')
  const retry = recovery.getByRole('button', { name: 'Try again with Auto', exact: true })
  const retryBounds = (await retry.boundingBox())!
  expect(retryBounds.width).toBeGreaterThanOrEqual(44)
  expect(retryBounds.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return report.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))
  })
  expect(violations, 'offline Watch recovery at 320px').toEqual([])
  await page.screenshot({ scale: 'css', path: '.impeccable/review/watch-journey/offline-recovery-320x720-touch.png' })

  await page.context().setOffline(false)
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(true)
  await expect(recovery).toContainText('Your connection is back. Try again with Auto or choose a source.')
  await retry.click()
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState), { timeout: 30000 }).toBeGreaterThanOrEqual(2)
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime), { timeout: 30000 }).toBeGreaterThanOrEqual(11)
  expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true)
})

test('Watch renews an expiring source when a viewer returns from a hidden tab', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript(() => {
    let visibility: DocumentVisibilityState = 'visible'
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
    Object.defineProperty(window, 'setFixtureVisibility', {
      configurable: true,
      value: (next: DocumentVisibilityState) => {
        visibility = next
        document.dispatchEvent(new Event('visibilitychange'))
      },
    })
  })
  let renewals = 0
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/refresh')) renewals += 1
  })

  await page.goto('/watch/movie/5')
  const video = page.locator('video').first()
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState), { timeout: 30000 }).toBeGreaterThanOrEqual(2)
  const startingSource = await video.evaluate((element: HTMLVideoElement) => element.currentSrc)
  await video.evaluate((element: HTMLVideoElement) => { element.currentTime = 6; element.pause() })
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => !element.seeking && element.currentTime >= 6)).toBe(true)

  const setVisibility = (state: DocumentVisibilityState) => page.evaluate((next) => {
    (window as unknown as Window & { setFixtureVisibility: (value: DocumentVisibilityState) => void }).setFixtureVisibility(next)
  }, state)
  await setVisibility('hidden')
  expect(renewals).toBe(0)
  const renewal = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/refresh') && response.status() === 200)
  await setVisibility('visible')
  const renewalPayload = await (await renewal).json()
  const nextSource = renewalPayload.source.src as string
  expect(nextSource).not.toBe(startingSource)
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentSrc)).toBe(nextSource)
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState >= 2 && element.currentTime >= 5.5 && element.paused)).toBe(true)
  expect(renewals).toBe(1)
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return report.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))
  })
  expect(violations, 'returning Watch after a hidden tab should meet WCAG 2.2 AA').toEqual([])
  await mkdir('.impeccable/review/watch-journey', { recursive: true })
  await page.screenshot({ scale: 'css', path: '.impeccable/review/watch-journey/visible-tab-source-renewal-320x720.png' })
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
  await expect(page.getByText(/Progress sync unavailable.*Choose next episode manually/)).toBeVisible()
  await expect(page.frameLocator('iframe').getByText('External player fixture')).toBeVisible()
  const frame = await page.locator('iframe').elementHandle()
  await expect.poll(() => page.getByRole('button', { name: 'Sources', exact: true }).evaluate(element => getComputedStyle(element).borderRadius)).toBe('5px')
  await expect.poll(() => page.getByRole('button', { name: 'Reload player' }).evaluate(element => getComputedStyle(element).borderRadius)).toBe('5px')
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
  expect(sourcePanel.y).toBeCloseTo(sourceTrigger.y + sourceTrigger.height + 8, 0)
  await page.getByRole('button', { name: /^Consumit Server/ }).focus()
  await expect(page.getByRole('button', { name: /External player.*Fixture external/ })).toBeVisible()
  expect(await frame!.evaluate(element => element === document.querySelector('iframe'))).toBe(true)
  expect(await page.getByRole('dialog', { name: 'Sources' }).evaluate(element => getComputedStyle(element).animationName)).toBe('none')
  await page.screenshot({ scale: 'css', path: `.impeccable/review/unified-deck/external-${info.project.name}.png` })
})

test('a provider-frame no-load timeout automatically recovers and keeps the saved checkpoint', async ({ page }, info) => {
  test.skip(info.project.name !== 'chrome', 'The focused recovery flow runs once in desktop Chrome.')
  await page.clock.install()
  await page.setViewportSize({ width: 320, height: 700 })
  await mkdir('.impeccable/review/watch-journey', { recursive: true })
  await page.addInitScript(() => localStorage.setItem('consumit.progress:guest:movie:1:0:0', JSON.stringify({ kind: 'movie', id: 1, positionSeconds: 7, durationSeconds: 60, updatedAt: new Date().toISOString() })))

  let releaseFrameRequest!: () => void
  const frameRequestPending = new Promise<void>(resolve => { releaseFrameRequest = resolve })
  page.once('close', () => releaseFrameRequest())
  const frameUrl = 'https://embed.vidrift.net/embed/movie/1'
  await page.route('https://embed.vidrift.net/**', async route => {
    await frameRequestPending
    try { await route.abort() } catch { /* The Watch page may already have replaced the stalled frame. */ }
  })

  let externalized = false
  await page.route(/\/v1\/playback\/attempts(?:\/[^/]+\/continue)?$/, async route => {
    const response = await route.fetch()
    const body = await response.json()
    if (body.session && !externalized) {
      body.session.source = { ...body.session.source, providerId: 'fixture-external', src: frameUrl, type: 'iframe', delivery: 'embed', frameSandbox: 'none' }
      externalized = true
    }
    await route.fulfill({ response, json: body })
  })
  const fallbackStarted = page.waitForRequest(request => {
    if (!request.url().endsWith('/v1/playback/attempts') || request.method() !== 'POST') return false
    try { return request.postDataJSON()?.failure?.reason === 'network' } catch { return false }
  })

  await page.goto('/watch/movie/1')
  await expect(page.locator('[data-provider-frame]')).toBeVisible({ timeout: 30000 })
  await expect(page.locator('[data-provider-frame] [role="status"]')).toContainText('Connecting to')
  await page.clock.fastForward(20_000)
  await fallbackStarted
  await expect(page.locator('[data-provider-frame]')).toHaveCount(0, { timeout: 30000 })
  const video = page.locator('video')
  await expect(video).toBeVisible()
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).readyState), { timeout: 30000 }).toBeGreaterThanOrEqual(2)
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime), { timeout: 30000 }).toBeGreaterThanOrEqual(6)
  await video.evaluate(element => (element as HTMLVideoElement).pause())
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return report.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))
  })
  expect(violations, 'Watch after external-frame recovery at 320px').toEqual([])
  await page.screenshot({ scale: 'css', path: '.impeccable/review/watch-journey/provider-frame-recovery-320x700.png' })
  releaseFrameRequest()
})

test('external-player timeout failure keeps its checkpoint and Auto retry restores native playback', async ({ page }, info) => {
  await page.clock.install()
  await page.setViewportSize({ width: 320, height: 700 })
  await mkdir('.impeccable/review/watch-journey', { recursive: true })
  await page.addInitScript(() => localStorage.setItem('consumit.progress:guest:movie:1:0:0', JSON.stringify({ kind: 'movie', id: 1, positionSeconds: 7, durationSeconds: 60, updatedAt: new Date().toISOString() })))

  let releaseFrameRequest!: () => void
  const frameRequestPending = new Promise<void>(resolve => { releaseFrameRequest = resolve })
  page.once('close', () => releaseFrameRequest())
  const frameUrl = 'https://embed.vidrift.net/embed/movie/1'
  await page.route('https://embed.vidrift.net/**', async route => {
    await frameRequestPending
    try { await route.abort() } catch { /* The Watch page may already have replaced the stalled frame. */ }
  })

  let externalized = false
  await page.route(/\/v1\/playback\/attempts(?:\/[^/]+\/continue)?$/, async route => {
    let requestBody: Record<string, unknown> = {}
    try { requestBody = route.request().postDataJSON() as Record<string, unknown> } catch { /* The server handles malformed fixture requests. */ }
    if ((requestBody.failure as { reason?: string } | undefined)?.reason === 'network') {
      return route.fulfill({ status: 503, json: {} })
    }
    const response = await route.fetch()
    const body = await response.json()
    if (body.session && !externalized) {
      body.session.source = { ...body.session.source, providerId: 'fixture-external', src: frameUrl, type: 'iframe', delivery: 'embed', frameSandbox: 'none' }
      externalized = true
    }
    await route.fulfill({ response, json: body })
  })
  const fallbackStarted = page.waitForRequest(request => {
    if (!request.url().endsWith('/v1/playback/attempts') || request.method() !== 'POST') return false
    try { return request.postDataJSON()?.failure?.reason === 'network' } catch { return false }
  })

  await page.goto('/watch/movie/1')
  await expect(page.locator('[data-provider-frame]')).toBeVisible({ timeout: 30000 })
  await page.clock.fastForward(20_000)
  await fallbackStarted
  const recovery = page.getByRole('alertdialog', { name: 'This player couldn’t load' })
  await expect(recovery).toContainText('The provider player couldn’t load.')
  await expect(recovery).toContainText('Your place at 0:07 is saved.')
  await expect(recovery).not.toContainText('Your place is saved.')
  const frameBounds = (await page.locator('[data-provider-frame]').boundingBox())!
  const recoveryBounds = (await page.locator('[data-player-recovery]').boundingBox())!
  expect(recoveryBounds.x).toBeCloseTo(frameBounds.x, 0)
  expect(recoveryBounds.y).toBeCloseTo(frameBounds.y, 0)
  expect(recoveryBounds.width).toBeCloseTo(frameBounds.width, 0)
  expect(recoveryBounds.height).toBeCloseTo(frameBounds.height, 0)
  for (const label of ['Try again with Auto', 'Choose a source']) {
    const action = recovery.getByRole('button', { name: label, exact: true })
    const bounds = (await action.boundingBox())!
    expect(bounds.height).toBeGreaterThanOrEqual(44)
    expect(bounds.width).toBeGreaterThanOrEqual(220)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return report.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))
  })
  expect(violations, 'external-player timeout recovery at 320px').toEqual([])
  await page.screenshot({ scale: 'css', path: `.impeccable/review/watch-journey/external-exhausted-recovery-320x700-${info.project.name}.png` })

  await recovery.getByRole('button', { name: 'Try again with Auto', exact: true }).click()
  const video = page.locator('video')
  await expect(video).toBeVisible()
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState), { timeout: 30000 }).toBeGreaterThanOrEqual(2)
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime), { timeout: 30000 }).toBeGreaterThanOrEqual(6)
  expect(await page.locator('[data-provider-frame]').count()).toBe(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  releaseFrameRequest()
})

test('caption radio groups support native arrow selection', async ({ page }) => {
  await page.route('https://fixture.example/english.vtt', route => route.fulfill({ contentType: 'text/vtt', body: 'WEBVTT\n\n00:00:01.000 --> 00:00:20.000\nKeyboard fixture\n' }))
  await page.goto('/watch/movie/5')
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.readyState), { timeout: 30000 }).toBeGreaterThanOrEqual(2)
  await page.locator('video').evaluate((video: HTMLVideoElement) => video.pause())
  await page.getByRole('button', { name: 'Captions', exact: true }).click()
  await page.getByRole('button', { name: /^English \d+/ }).click()
  const options = page.getByRole('radiogroup', { name: 'English caption tracks' })
  const tracks = options.getByRole('radio')
  const english = tracks.first()
  expect(await tracks.count()).toBeGreaterThan(1)
  await expect(english).toBeChecked()
  await english.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('dialog', { name: 'Captions' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Captions', exact: true }).click()
  const englishLanguage = page.getByRole('button', { name: /^English \d+/ })
  if (await englishLanguage.getAttribute('aria-expanded') !== 'true') await englishLanguage.click()
  await expect(page.getByRole('radiogroup', { name: 'English caption tracks' }).getByRole('radio').nth(1)).toBeChecked()
  await expect(page.getByRole('radio', { name: 'Off', exact: true })).not.toBeChecked()
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

test('Audio choices expose stream audio as the selected radio and keep controls outside the radio group', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('https://fixture.example/**', async route => {
    const name = new URL(route.request().url()).pathname.slice(1)
    if (name !== 'audio.m3u8' && name !== 'audio.aac') {
      await route.fulfill({ status: 404 })
      return
    }
    await route.fulfill({
      body: await readFile(`tests/playback/media/${name}`),
      headers: { 'access-control-allow-origin': '*', 'content-type': name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'audio/aac' },
    })
  })
  await page.goto('/watch/movie/1')
  const video = page.locator('video')
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState), { timeout: 30000 }).toBeGreaterThanOrEqual(2)
  await video.evaluate((element: HTMLVideoElement) => element.pause())

  await page.getByRole('button', { name: /^Settings:/ }).click()
  const settings = page.getByRole('dialog', { name: 'Settings options' })
  await settings.getByRole('button', { name: /^Audio/ }).click()
  const audio = page.getByRole('dialog', { name: 'Audio' })
  const options = audio.getByRole('radiogroup', { name: 'Audio options' })
  const streamAudio = options.getByRole('radio', { name: 'Stream audio', exact: true })
  const japanese = options.getByRole('radio', { name: 'Japanese', exact: true })
  const attachedVideo = await video.elementHandle()
  await expect(streamAudio).toBeChecked()
  await expect(japanese).toBeVisible()
  await expect(options.locator('button, [role="button"], [role="status"], [role="alert"], input:not([type="radio"])')).toHaveCount(0)
  await page.addScriptTag({ content: axe.source })
  const accessibility = await page.evaluate(async () => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    const panel = document.querySelector<HTMLElement>('[data-player-panel]')!
    return axeApi.run(panel, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
  })
  expect(accessibility.violations).toEqual([])

  for (const choice of [streamAudio, options.getByRole('radio', { name: 'Japanese', exact: true })]) {
    expect((await choice.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ scale: 'css', path: '.impeccable/review/watch-journey/audio-menu-390x844.png' })

  await japanese.click()
  await expect(japanese).toBeChecked({ timeout: 30000 })
  expect(await attachedVideo!.evaluate(element => element === document.querySelector('video'))).toBe(true)
  await streamAudio.click()
  await expect(streamAudio).toBeChecked()
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

test('anime preparation uses series artwork while the video keeps its episode still', async ({ page, request }, info) => {
  await request.post('http://127.0.0.1:18559/__fixtures/reset')
  let release = () => {}
  const preparation = new Promise<void>(resolve => { release = resolve })
  await page.route('**/v1/playback/attempts', async route => { await preparation; await route.continue() })
  await page.route('**/_next/image**', route => {
    const source = new URL(route.request().url()).searchParams.get('url') ?? ''
    const art = source.includes('anime-banner.jpg')
      ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="#29354d"/><circle cx="12" cy="3" r="2" fill="#ff6848"/></svg>'
      : source.includes('anime-episode-still.jpg')
        ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="#433126"/><circle cx="4" cy="6" r="2" fill="#f5c46b"/></svg>'
        : null
    return art ? route.fulfill({ contentType: 'image/svg+xml', body: art }) : route.continue()
  })
  try {
    await page.goto('/watch/anime/8?episode=1&audio=sub')
    await expect(page.locator('[data-player-preparation]')).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Finding a source', exact: true })).toBeVisible()
    const backdrop = page.locator('[data-player-preparation-backdrop]')
    await expect(backdrop).toBeVisible()
    await expect(backdrop).toHaveAttribute('src', /anime-banner\.jpg/)
    await expect.poll(() => page.locator('video').getAttribute('poster')).toContain('anime-episode-still.jpg')
    const recovery = page.getByRole('dialog', { name: 'Finding a source', exact: true })
    for (const action of await recovery.getByRole('button').all()) {
      const bounds = (await action.boundingBox())!
      expect(bounds.width).toBeGreaterThanOrEqual(44)
      expect(bounds.height).toBeGreaterThanOrEqual(44)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.addScriptTag({ content: axe.source })
    const violations = await page.evaluate(async () => {
      const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
      const report = await axeApi.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
      return report.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))
    })
    expect(violations, `Anime source search at ${info.project.name}`).toEqual([])
    await page.screenshot({ scale: 'css', path: `.impeccable/review/watch-journey/anime-preparation-artwork-${info.project.name}.png` })
  } finally {
    release()
  }
})
