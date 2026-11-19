import { defaultExperiencePreferences } from '../../packages/contracts/src/index'
import axe from 'axe-core'
import { mkdir, readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

const api = 'http://127.0.0.1:18563'

test.beforeEach(async ({ request }) => {
  await request.post(`${api}/__fixtures/reset`, { data: {} })
})

test('the ten-second next-episode prompt is touch-safe and Cancel prevents auto-advance', async ({ page }) => {
  const media = await readFile('tests/playback/media/reference.mp4')
  const preferences = { ...defaultExperiencePreferences(), autoplayNextEpisode: true, guideVersion: 1, guideStatus: 'dismissed' as const, communityDismissed: true }
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript(value => {
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    localStorage.setItem('consumit.experience.guest.v1', JSON.stringify(value))
  }, preferences)
  await page.route('**/v1/playback/attempts', async route => {
    const response = await route.fetch()
    const attempt = await response.json()
    attempt.session.source.src = 'https://experience-media.example/autonext.mp4'
    await route.fulfill({ response, json: attempt })
  })
  await page.route('https://experience-media.example/autonext.mp4', async route => {
    const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/)
    const start = range ? Math.min(Number(range[1]), media.length - 1) : 0
    const end = range?.[2] ? Math.min(Number(range[2]), media.length - 1) : media.length - 1
    await route.fulfill({
      status: range ? 206 : 200,
      contentType: 'video/mp4',
      headers: {
        'access-control-allow-origin': '*',
        'accept-ranges': 'bytes',
        ...(range ? { 'content-range': `bytes ${start}-${end}/${media.length}` } : {}),
      },
      body: media.subarray(start, end + 1),
    })
  })

  await page.goto('/watch/series/95396?season=2&episode=4')
  const video = page.locator('video')
  await expect.poll(() => video.evaluate(element => element.readyState)).toBeGreaterThanOrEqual(2)
  await video.evaluate(element => {
    element.currentTime = Math.max(0, element.duration - 0.2)
    return element.play()
  })
  await expect.poll(() => video.evaluate(element => element.ended), { timeout: 15_000 }).toBe(true)

  const countdownGroup = page.getByRole('group', { name: 'Next episode countdown' })
  const countdown = countdownGroup.getByRole('status')
  await expect(countdown).toHaveText(/^Next episode in (?:[1-9]|10)s$/)
  await expect(page.getByRole('status').filter({ hasText: 'Up next' })).toHaveCount(0)
  const playNow = countdownGroup.getByRole('button', { name: 'Play now', exact: true })
  const cancel = countdownGroup.getByRole('button', { name: 'Cancel', exact: true })
  await expect(playNow).toBeVisible()
  await expect(cancel).toBeVisible()
  expect((await playNow.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect((await cancel.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => {
    const axeApi = (window as Window & { axe: typeof axe }).axe
    const region = document.querySelector('[aria-label="Next episode countdown"]')!
    const report = await axeApi.run(region, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return report.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))
  })
  expect(violations, 'The next-episode prompt should meet WCAG 2.2 AA').toEqual([])
  await mkdir('.impeccable/review/watch-journey', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/watch-journey/autonext-cancel-320x720.png' })

  await cancel.click()
  await expect(countdownGroup).toHaveCount(0)
  const upNext = page.getByRole('status').filter({ hasText: 'Up next' })
  await expect(upNext).toBeVisible()
  const manualNext = upNext.locator('xpath=..').getByRole('button', { name: 'Next episode', exact: true })
  await expect(manualNext).toBeVisible()
  expect((await manualNext.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await page.waitForTimeout(10_500)
  await expect(page).toHaveURL('/watch/series/95396?season=2&episode=4')
})
