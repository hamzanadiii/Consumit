import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { expectHomeWcag22Aa } from './helpers'

test('Home offers category routes when every recommendation feed is genuinely empty', async ({ page, request }) => {
  await mkdir('.impeccable/review/home-resilience', { recursive: true })
  await page.setViewportSize({ width: 320, height: 720 })
  await request.post('http://127.0.0.1:18563/__fixtures/reset', { data: {} })
  const emptyMode = await request.post('http://127.0.0.1:18563/__fixtures/home-catalog-mode', { data: { mode: 'empty' } })
  expect(emptyMode.ok()).toBe(true)
  await page.addInitScript(() => {
    localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ guideStatus: 'dismissed', guideVersion: 1, communityDismissed: true }))
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    localStorage.setItem('consumit.browsing-notice.ads.dismissed.v1', 'true')
    localStorage.setItem('consumit.browsing-notice.feedback.dismissed.v1', 'true')
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'No fresh recommendations are available yet.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Northbound/ })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Featured titles' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Watch', exact: true })).toHaveAttribute('href', '/watch/movie/693134')
  for (const region of [
    'Continue watching',
    'New this week',
    'Your recommendations',
    'New from your network',
    'Popular with members',
    'Trending with members',
    'Trending Movies',
    'Trending Series',
    'Trending Anime',
    'Top Rated Movies',
    'Top Rated Series',
    'Award Winning Shows',
    'Mindf*ck Movies',
  ]) {
    await expect(page.getByRole('region', { name: region, exact: true })).toHaveCount(0)
  }

  for (const [label, href] of [['Browse movies', '/movies'], ['Browse series', '/series'], ['Browse anime', '/anime']]) {
    const link = page.getByRole('link', { name: label, exact: true })
    await expect(link).toHaveAttribute('href', href)
    const bounds = await link.boundingBox()
    expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(44)
    expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(0)
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(320)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expectHomeWcag22Aa(page, 'genuinely empty recommendations')
  await page.screenshot({ fullPage: true, path: '.impeccable/review/home-resilience/empty-recommendations-320x720.png' })
})
