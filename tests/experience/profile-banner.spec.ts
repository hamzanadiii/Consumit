import { test, expect } from '@playwright/test'
import axe from 'axe-core'

test('profile banner search retries in place before a member saves and sees the new backdrop', async ({ page, context, request }) => {
  const { token, member } = await (await request.get('http://127.0.0.1:18563/__fixtures/session')).json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  const backdropUrl = 'https://image.tmdb.org/t/p/w1280/fixture-backdrop.jpg'
  const backdropArt = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><defs><linearGradient id="night" x1="0" x2="1"><stop stop-color="#121216"/><stop offset="1" stop-color="#563b39"/></linearGradient></defs><rect width="1600" height="900" fill="url(#night)"/><circle cx="1180" cy="330" r="190" fill="#ff5d38" opacity=".7"/><path d="M0 760 460 420l330 300 270-240 540 400H0" fill="#09090b" opacity=".88"/></svg>'
  let failures = 1
  await page.route('**/v1/titles/search**', async route => {
    if (failures > 0) {
      failures -= 1
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'Catalog unavailable.', retryable: true } }) })
      return
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      items: [{ backdropUrl, genreNames: ['Drama'], id: 9201, kind: 'movie', logoUrl: null, originalTitle: 'Northbound', overview: 'A quiet fixture title.', popularity: 1, posterUrl: null, releaseDate: '2025-02-01', title: 'Northbound', tmdbRating: 8, tmdbVoteCount: 1, year: 2025 }],
      meta: { fetchedAt: '2026-10-29T12:00:00.000Z', language: 'en-US', region: 'US', source: 'tmdb', stale: false },
      page: 1,
      totalPages: 1,
      totalResults: 1,
    }) })
  })
  await page.route(/\/_next\/image\?url=.*fixture-backdrop\.jpg/, route => route.fulfill({ contentType: 'image/svg+xml', body: backdropArt }))

  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto(`/profile/${member.username}`)
  const trigger = page.getByRole('button', { name: 'Edit banner' })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Edit banner' })
  const search = dialog.getByRole('searchbox', { name: 'Search a movie or series for backdrop art' })
  await expect(search).toBeFocused()
  await search.fill('north')
  await expect(dialog.getByText('No wide backdrops match that search yet.')).toHaveCount(0)

  const error = dialog.getByRole('alert')
  await expect(error).toContainText('Search could not load. Your current banner is preserved.')
  await expect(dialog.getByText('No wide backdrops match that search yet.')).toHaveCount(0)
  const retry = error.getByRole('button', { name: 'Retry search' })
  await expect(retry).toBeFocused()
  expect((await retry.boundingBox())?.height).toBeGreaterThanOrEqual(44)
  expect(await retry.evaluate(element => getComputedStyle(element).boxShadow)).not.toBe('none')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await page.addScriptTag({ content: axe.source })
  const accessibility = await page.evaluate(async () => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    return axeApi.run(document.querySelector<HTMLElement>('[data-filscreen-profile-dialog]')!, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    })
  })
  expect(accessibility.violations).toEqual([])
  await page.screenshot({ path: '.impeccable/review/profile-avatar/banner-search-retry-320x720.png' })

  await retry.click()
  const choice = dialog.getByRole('button', { name: 'Use Northbound as banner' })
  await expect(choice).toBeVisible()
  await expect(choice).toHaveAttribute('aria-pressed', 'false')
  await choice.click()
  await expect(choice).toHaveAttribute('aria-pressed', 'true')
  const dialogBox = await dialog.boundingBox()
  for (const filter of await dialog.locator('[data-consumit-filter-chip]').all()) {
    const box = await filter.boundingBox()
    expect(box?.height).toBeGreaterThanOrEqual(44)
    expect(box!.x).toBeGreaterThanOrEqual(dialogBox!.x)
    expect(box!.x + box!.width).toBeLessThanOrEqual(dialogBox!.x + dialogBox!.width)
  }
  await page.screenshot({ path: '.impeccable/review/profile-avatar/banner-search-recovered-320x720.png' })
  await dialog.getByRole('button', { name: 'Save banner' }).click()
  await expect(page.getByRole('dialog', { name: 'Edit banner' })).toHaveCount(0)

  const masthead = page.locator('[data-consumit-profile-masthead]')
  await expect(masthead.locator('img[alt=""]')).toHaveAttribute('src', /fixture-backdrop\.jpg/)
  await page.reload()
  await expect(page.locator('[data-consumit-profile-masthead] img[alt=""]')).toHaveAttribute('src', /fixture-backdrop\.jpg/)
  await expect(trigger).toBeVisible()
})
