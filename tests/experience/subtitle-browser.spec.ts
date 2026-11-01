import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import axe from 'axe-core'

test('caption discovery keeps radio groups limited to track choices on a short phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  const searchId = '78f506d8-4c60-44ed-88dc-c3a20f20b488'
  let languageAttempts = 0
  const media = await readFile('tests/playback/media/reference.mp4')

  await page.route('**/v1/playback/attempts', async route => {
    const response = await route.fetch()
    const attempt = await response.json()
    attempt.session.source.src = 'https://experience-media.example/caption-browser.mp4'
    attempt.session.source.subtitles = []
    await route.fulfill({ response, json: attempt })
  })
  await page.route('https://experience-media.example/caption-browser.mp4', async route => {
    const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/)
    const start = range ? Math.min(Number(range[1]), media.length - 1) : 0
    const end = range?.[2] ? Math.min(Number(range[2]), media.length - 1) : media.length - 1
    await route.fulfill({
      status: range ? 206 : 200,
      contentType: 'video/mp4',
      headers: { 'access-control-allow-origin': '*', 'accept-ranges': 'bytes', ...(range ? { 'content-range': `bytes ${start}-${end}/${media.length}` } : {}) },
      body: media.subarray(start, end + 1),
    })
  })
  await page.route('**/v1/subtitles/discover?*', route => route.fulfill({
    contentType: 'application/x-ndjson',
    body: [
      { type: 'snapshot', searchId, languages: [] },
      { type: 'complete', searchId, languages: [{ code: 'ar', count: 2 }] },
    ].map(event => JSON.stringify(event)).join('\n') + '\n',
  }))
  await page.route('**/v1/subtitles/discover/page?*', async route => {
    languageAttempts += 1
    if (languageAttempts === 1) {
      await route.fulfill({ status: 503, json: {} })
      return
    }
    await route.fulfill({ json: {
      tracks: [
        { id: 'arabic-1', label: 'Arabic · Full subtitles', language: 'ar', provider: 'Fixture' },
        { id: 'arabic-2', label: 'Arabic · SDH', language: 'ar', provider: 'Fixture', sdh: true },
      ],
      total: 2,
      nextCursor: null,
    } })
  })

  await page.goto('/watch/movie/693134')
  await expect(page.locator('video')).toBeVisible()
  await page.getByRole('button', { name: 'Captions', exact: true }).click()

  const captionGroup = page.getByRole('radiogroup', { name: 'Caption tracks' })
  await expect(captionGroup.getByRole('radio', { name: 'Off', exact: true })).toBeVisible()
  await expect(captionGroup.getByRole('searchbox')).toHaveCount(0)
  await expect(captionGroup.getByRole('button')).toHaveCount(0)

  const languageButton = page.getByRole('button', { name: /^العربية/ })
  await expect(languageButton).toBeVisible()
  await languageButton.click()
  await expect(page.getByRole('alert').getByText('These tracks could not load.')).toBeVisible()

  const retry = page.getByRole('button', { name: 'Try this language again' })
  const retryBounds = await retry.boundingBox()
  expect(retryBounds?.height).toBeGreaterThanOrEqual(44)
  await retry.click()
  await expect(page.getByRole('button', { name: /Full subtitles/ })).toBeVisible()
  await expect.poll(() => languageAttempts).toBe(2)
  for (const group of await page.getByRole('radiogroup').all()) {
    await expect(group.locator('button, input:not([type="radio"])')).toHaveCount(0)
  }

  const tools = page.getByRole('group', { name: 'Subtitle tools' })
  await expect(tools).toBeVisible()
  for (const label of ['Subtitle appearance', 'Sync subtitle to audio', 'Upload subtitle file']) {
    const button = page.getByRole('button', { name: label })
    const bounds = await button.boundingBox()
    expect(bounds?.height).toBeGreaterThanOrEqual(44)
    expect(bounds!.y).toBeGreaterThanOrEqual(0)
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(720)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.addScriptTag({ content: axe.source })
  const accessibility = await page.evaluate(async () => {
    const axeApi = (window as Window & { axe: typeof axe }).axe
    const panel = document.querySelector<HTMLElement>('[data-player-panel]')!
    return axeApi.run(panel, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
  })
  expect(accessibility.violations).toEqual([])
  await page.screenshot({ path: '.impeccable/review/watch-journey/captions-browser-320x720.png' })
})

test('subtitle appearance stays touch-safe, saves each choice, and restores them after Watch reload', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await page.route('**/v1/subtitles/discover?*', route => route.fulfill({
    contentType: 'application/x-ndjson',
    body: `${JSON.stringify({ type: 'complete', searchId: 'caption-appearance-fixture', languages: [] })}\n`,
  }))

  await page.goto('/watch/movie/693134')
  await expect(page.locator('video')).toBeVisible()
  await page.getByRole('button', { name: 'Captions', exact: true }).click()
  await page.getByRole('button', { name: 'Subtitle appearance' }).click()

  const appearance = page.getByRole('dialog', { name: 'Subtitle appearance' })
  await expect(appearance.getByRole('group', { name: 'Caption size' })).toBeVisible()
  await expect(appearance.getByRole('group', { name: 'Caption style' })).toBeVisible()
  await expect(appearance.getByRole('group', { name: 'Caption position' })).toBeVisible()
  await expect(appearance.getByRole('group', { name: 'Caption font' })).toBeVisible()
  await expect(appearance.getByRole('group', { name: 'Caption color' })).toBeVisible()

  await page.addScriptTag({ content: axe.source })
  const accessibility = await page.evaluate(async () => {
    const axeApi = (window as Window & { axe: typeof axe }).axe
    const panel = document.querySelector<HTMLElement>('[data-player-panel]')!
    return axeApi.run(panel, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
  })
  expect(accessibility.violations).toEqual([])
  for (const [groupName, label] of [
    ['Caption size', 'Large'],
    ['Caption style', 'Subtle'],
    ['Caption position', 'Bottom'],
    ['Caption font', 'Classic'],
    ['Caption color', 'Ivory'],
  ] as const) {
    await expect(appearance.getByRole('group', { name: groupName }).getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true')
  }
  const bodySize = await appearance.locator('.consumit-player-panel-body').evaluate(element => ({ scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }))
  expect(bodySize.scrollHeight).toBeLessThanOrEqual(bodySize.clientHeight)
  await page.screenshot({ path: '.impeccable/review/watch-journey/caption-appearance-320x720.png' })

  const choices = [
    ['Caption size', 'Extra large'],
    ['Caption style', 'Boxed'],
    ['Caption position', 'Top'],
    ['Caption font', 'Inter'],
    ['Caption color', 'Mint green'],
  ] as const
  for (const [groupName, label] of choices) {
    const choice = appearance.getByRole('group', { name: groupName }).getByRole('button', { name: label })
    await choice.scrollIntoViewIfNeeded()
    const bounds = await choice.boundingBox()
    expect(bounds?.height, `${label} target height`).toBeGreaterThanOrEqual(44)
    expect(bounds?.width, `${label} target width`).toBeGreaterThanOrEqual(44)
    expect(bounds!.y).toBeGreaterThanOrEqual(0)
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(720)
    await choice.click()
    await expect(choice).toHaveAttribute('aria-pressed', 'true')
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: '.impeccable/review/watch-journey/caption-appearance-saved-320x720.png' })

  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Captions', exact: true })).toBeFocused()
  await page.reload()
  await expect(page.locator('video')).toBeVisible()
  await page.getByRole('button', { name: 'Captions', exact: true }).click()
  await page.getByRole('button', { name: 'Subtitle appearance' }).click()
  const restored = page.getByRole('dialog', { name: 'Subtitle appearance' })
  for (const [groupName, label] of choices) {
    await expect(restored.getByRole('group', { name: groupName }).getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true')
  }
})
