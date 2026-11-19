import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { expectHomeWcag22Aa } from './helpers'

test('Home keeps catalog navigation visible and offers retry when feeds stay loading', async ({ page, request }) => {
  await mkdir('.impeccable/review/home-resilience', { recursive: true })
  await page.setViewportSize({ width: 320, height: 720 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await request.post('http://127.0.0.1:18563/__fixtures/reset', { data: {} })
  await request.post('http://127.0.0.1:18563/__fixtures/home-catalog-mode', { data: { mode: 'loading' } })
  await page.addInitScript(() => {
    localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ guideStatus: 'dismissed', guideVersion: 1, communityDismissed: true }))
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    localStorage.setItem('consumit.browsing-notice.ads.dismissed.v1', 'true')
    localStorage.setItem('consumit.browsing-notice.feedback.dismissed.v1', 'true')
  })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))

  await page.goto('/', { waitUntil: 'commit' })
  await expect(page.locator('[data-filscreen-loading]')).toBeVisible()
  await expect(page.getByRole('status', { name: 'Loading' })).toBeVisible()
  const kindNavigation = page.getByRole('navigation', { name: 'Catalog kinds' })
  for (const name of ['New', 'Series', 'Movies', 'Anime']) {
    const link = kindNavigation.getByRole('link', { name, exact: true })
    await expect(link).toBeVisible()
    const box = (await link.boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(320)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  const prolongedStatus = page.getByRole('status', { name: 'Still loading' })
  await expect(prolongedStatus).toBeVisible({ timeout: 15_000 })
  await expect(prolongedStatus).toContainText('taking longer than usual')
  const retry = page.getByRole('button', { name: 'Try again', exact: true })
  await expect(retry).toBeVisible()
  const retryBox = (await retry.boundingBox())!
  expect(retryBox.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expectHomeWcag22Aa(page, 'prolonged loading')
  await page.screenshot({ fullPage: true, path: '.impeccable/review/home-resilience/slow-loading-320x720.png' })

  await request.post('http://127.0.0.1:18563/__fixtures/release-home-catalog', { data: {} })
  await expect(page.getByRole('heading', { name: /Northbound/ })).toBeVisible()
  await expect(page.locator('[data-filscreen-loading]')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expectHomeWcag22Aa(page, 'recovered from prolonged loading')
  await page.screenshot({ fullPage: true, path: '.impeccable/review/home-resilience/slow-loading-recovered-320x720.png' })
  expect(errors).toEqual([])
})
