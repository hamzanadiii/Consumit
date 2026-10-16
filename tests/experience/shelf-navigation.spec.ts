import { expect, test } from '@playwright/test'

for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }]) {
  test(`Home shelves retain their catalog feed at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ guideStatus: 'dismissed', guideVersion: 1, communityDismissed: true }))
    })

    for (const [title, path, feed, heading, sort] of [
      ['Trending Movies', '/movies', 'trending', 'Trending now', 'Trending'],
      ['Trending Series', '/series', 'trending', 'Trending now', 'Trending'],
      ['Top Rated Movies', '/movies', 'top-rated', 'Top rated', 'Top rated'],
      ['Top Rated Series', '/series', 'top-rated', 'Top rated', 'Top rated'],
    ] as const) {
      await page.goto('/')
      await page.getByRole('region', { name: title, exact: true }).getByRole('link', { name: `View all ${title.toLowerCase()}` }).click()
      await expect(page).toHaveURL(new RegExp(`${path}\\?feed=${feed}$`))
      await expect(page.getByRole('button', { name: `Sort by ${sort}` })).toBeVisible()
      const results = page.getByRole('region', { name: heading, exact: true })
      await expect(results.getByRole('link').first()).toBeVisible()
      await expect(results.getByRole('status')).toContainText('titles shown')
      await page.reload()
      await expect(page.getByRole('button', { name: `Sort by ${sort}` })).toBeVisible()
      await expect(results.getByRole('link').first()).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }

    let failOnce = true
    await page.route('**/v1/titles/discover?**', async route => {
      if (failOnce && new URL(route.request().url()).searchParams.get('feed') === 'top-rated') {
        failOnce = false
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
      } else await route.continue()
    })
    await page.goto('/movies?feed=top-rated')
    await expect(page.getByRole('region', { name: 'Top rated', exact: true }).getByRole('alert')).toContainText('couldn’t load these titles')
    await page.getByRole('button', { name: 'Try again' }).click()
    const results = page.getByRole('region', { name: 'Top rated', exact: true })
    await expect(results.getByRole('link').first()).toBeVisible()
    await page.getByRole('button', { name: 'Genre All genres' }).click()
    const filtered = page.waitForResponse(response => {
      const url = new URL(response.url())
      return url.pathname === '/v1/titles/discover' && url.searchParams.get('feed') === 'top-rated' && url.searchParams.get('genre') === 'Adventure'
    })
    await page.getByRole('option', { name: 'Adventure', exact: true }).click()
    await filtered
    await expect(page.getByRole('button', { name: 'Sort by Top rated' })).toBeVisible()
    await page.getByRole('button', { name: 'Reset', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Sort by Popular' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Popular now' }).getByRole('link').first()).toBeVisible()

    await page.goto('/movies?feed=invalid')
    await expect(page.getByRole('button', { name: 'Sort by Popular' })).toBeVisible()
    await page.goto('/movies?feed=top-rated')
    await page.getByRole('navigation', { name: 'Catalog kinds' }).getByRole('link', { name: 'Movies', exact: true }).click()
    await expect(page).toHaveURL(/\/movies$/)
    await expect(page.getByRole('button', { name: 'Sort by Popular' })).toBeVisible()
    await page.goBack()
    await expect(page.getByRole('button', { name: 'Sort by Top rated' })).toBeVisible()
    await expect(page.locator('[data-consumit-watch-card] > p')).toHaveCount(0)
    await page.getByRole('region', { name: 'Top rated', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: `.impeccable/review/shelf-navigation-${viewport.width}.png` })
    expect(errors).toEqual([])
  })
}
