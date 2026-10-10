import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page, request }) => {
  await request.post('http://127.0.0.1:18559/__fixtures/reset')
  await page.addInitScript(() => localStorage.setItem('consumit.player.auto-skip', '0'))
})

test('exact intro metadata uses decoded runtime and seeks without interrupting the player', async ({ page }, info) => {
  let requestedRuntime = 0
  await page.route('**/v1/playback/skip-times?**', async route => {
    const query = new URL(route.request().url()).searchParams
    expect(query.get('kind')).toBe('movie')
    expect(query.get('id')).toBe('5')
    requestedRuntime = Number(query.get('duration'))
    await route.fulfill({ json: { segments: [{ kind: 'intro', start: 10, end: 25 }] } })
  })
  await page.goto('/watch/movie/5')
  const video = page.locator('video')
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(2)
  await expect.poll(() => requestedRuntime).toBeGreaterThanOrEqual(30)
  expect(requestedRuntime).toBeCloseTo(await video.evaluate((element: HTMLVideoElement) => element.duration), 1)
  await video.evaluate((element: HTMLVideoElement) => { element.pause(); element.currentTime = 15 })
  await page.getByRole('button', { name: 'Skip intro', exact: true }).click()
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeCloseTo(25, 0)
  await expect(page.getByRole('button', { name: 'Skip intro', exact: true })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('exact-intro.png') })
})

test('missing intro timestamps leave playback usable and hide skip intro', async ({ page }) => {
  await page.route('**/v1/playback/skip-times?**', route => route.fulfill({ json: { segments: [] } }))
  await page.goto('/watch/movie/5')
  const video = page.locator('video')
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(2)
  await video.evaluate((element: HTMLVideoElement) => { element.pause(); element.currentTime = 15 })
  await expect(page.getByRole('button', { name: 'Skip intro', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
})
