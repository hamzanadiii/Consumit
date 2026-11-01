import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { expectHomeWcag22Aa } from './helpers'

test('Home keeps healthy recommendations visible through a catalog outage and recovers on retry', async ({ page, request }) => {
  await mkdir('.impeccable/review/home-resilience', { recursive: true })
  await page.setViewportSize({ width: 320, height: 720 })
  await request.post('http://127.0.0.1:18563/__fixtures/reset', { data: {} })
  await request.post('http://127.0.0.1:18563/__fixtures/home-catalog-mode', { data: { mode: 'tmdb-outage' } })
  const outageProbe = await request.get('http://127.0.0.1:18563/v1/titles/discover?kind=movie&feed=trending&page=1')
  expect(outageProbe.status()).toBe(503)
  await page.addInitScript(() => {
    localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ guideStatus: 'dismissed', guideVersion: 1, communityDismissed: true }))
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    localStorage.setItem('consumit.browsing-notice.ads.dismissed.v1', 'true')
    localStorage.setItem('consumit.browsing-notice.feedback.dismissed.v1', 'true')
  })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))

  await page.goto('/')
  const outage = page.getByRole('alert').filter({ hasText: 'Some recommendations couldn’t load.' })
  await expect(outage).toBeVisible()
  await expect(page.getByRole('heading', { name: /Northbound/ })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Trending Anime', exact: true })).toBeVisible()
  const retry = page.getByRole('button', { name: 'Retry recommendations' })
  expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expectHomeWcag22Aa(page, 'partial outage')
  await page.screenshot({ fullPage: true, path: '.impeccable/review/home-resilience/partial-outage-320x720.png' })

  await request.post('http://127.0.0.1:18563/__fixtures/home-catalog-mode', { data: { mode: 'normal' } })
  await retry.click()
  await expect(outage).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Trending Movies', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Trending Series', exact: true })).toBeVisible()
  await expect(page.locator('#consumit-main-content')).toBeFocused()
  await expect(page.getByRole('status')).toContainText('Home recommendations refreshed.')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expectHomeWcag22Aa(page, 'recovered')
  await page.screenshot({ fullPage: true, path: '.impeccable/review/home-resilience/recovered-320x720.png' })
  expect(errors).toEqual([])
})
