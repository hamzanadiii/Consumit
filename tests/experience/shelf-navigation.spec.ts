import { expect, test, type Page } from '@playwright/test'
import axe from 'axe-core'
import { movieSummary } from '../../apps/web/src/test/catalog-fixtures'

async function expectWcag22Aa(page: Page, surface: string) {
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => {
    const axeApi = (window as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return report.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))
  })
  expect(violations, `${surface} WCAG 2.2 AA`).toEqual([])
}

for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }]) {
  test(`Home shelves retain their catalog feed at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ guideStatus: 'dismissed', guideVersion: 1, communityDismissed: true }))
      localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    })

    const shelves = [
      ['Trending Movies', '/movies', 'trending', 'Trending now', 'Trending'],
      ['Trending Series', '/series', 'trending', 'Trending now', 'Trending'],
      ['Top Rated Movies', '/movies', 'top-rated', 'Top rated', 'Top rated'],
      ['Top Rated Series', '/series', 'top-rated', 'Top rated', 'Top rated'],
    ] as const
    await page.goto('/')
    await expectWcag22Aa(page, `Home at ${viewport.width}px`)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `.impeccable/review/home-shelves-${viewport.width}x${viewport.height}.png`, fullPage: true })
    for (const [title, path, feed] of shelves) {
      await expect(page.getByRole('region', { name: title, exact: true }).getByRole('link', { name: `View all ${title.toLowerCase()}` }))
        .toHaveAttribute('href', `${path}?feed=${feed}`)
    }
    await page.getByRole('region', { name: shelves[0][0], exact: true }).getByRole('link', { name: 'View all trending movies' }).click()

    for (const [index, [, path, feed, heading, sort]] of shelves.entries()) {
      if (index > 0) await page.goto(`${path}?feed=${feed}`)
      await expect(page.getByRole('button', { name: `Sort by ${sort}` })).toBeVisible()
      const results = page.getByRole('region', { name: heading, exact: true })
      await expect(results.getByRole('link').first()).toBeVisible()
      await expect(results.getByRole('status')).toContainText('titles shown')
      if (index === shelves.length - 1) {
        await page.reload()
        await expect(page.getByRole('button', { name: `Sort by ${sort}` })).toBeVisible()
        await expect(results.getByRole('link').first()).toBeVisible()
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }

    await page.screenshot({ path: `.impeccable/review/shelf-navigation-${viewport.width}.png` })
    expect(errors).toEqual([])
  })
}

test('Catalog feed recovers from an outage, filters, and preserves browser history', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.addInitScript(() => {
    localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ guideStatus: 'dismissed', guideVersion: 1, communityDismissed: true }))
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
  })

  let failOnce = true
  let recoveryResponses = 0
  await page.route('**/v1/titles/discover?**', async route => {
    if (new URL(route.request().url()).searchParams.get('feed') !== 'top-rated') {
      await route.continue()
      return
    }
    if (failOnce) {
      failOnce = false
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
      return
    }
    recoveryResponses += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [movieSummary],
        meta: { fetchedAt: '2026-09-06T00:00:00.000Z', language: 'en-US', region: 'US', source: 'tmdb', stale: false },
        page: 1,
        totalPages: 1,
        totalResults: 1,
      }),
    })
  })

  await page.goto('/movies?feed=top-rated')
  const topRated = page.getByRole('region', { name: 'Top rated', exact: true })
  await expect(topRated.getByRole('alert')).toContainText('couldn’t load these titles')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(topRated.getByRole('link').first()).toBeVisible()
  expect(recoveryResponses).toBe(1)

  await page.getByRole('button', { name: 'Genre All genres' }).click()
  const filtered = page.waitForResponse(response => {
    const url = new URL(response.url())
    return url.pathname === '/v1/titles/discover' && url.searchParams.get('feed') === 'top-rated' && url.searchParams.get('genre') === 'Adventure'
  })
  await page.getByRole('option', { name: 'Adventure', exact: true }).click()
  await filtered
  await expect(topRated.getByRole('link').first()).toBeVisible()
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sort by Popular' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Popular now' }).getByRole('link').first()).toBeVisible()

  await page.goto('/movies?feed=invalid')
  await expect(page.getByRole('button', { name: 'Sort by Popular' })).toBeVisible()
  await page.getByRole('button', { name: 'Sort by Popular' }).click()
  const sortedTopRated = page.waitForResponse(response => {
    const url = new URL(response.url())
    return url.pathname === '/v1/titles/discover' && url.searchParams.get('feed') === 'top-rated' && !url.searchParams.has('genre')
  })
  await page.getByRole('option', { name: 'Top rated', exact: true }).click()
  await sortedTopRated
  await expect(page.getByRole('button', { name: 'Sort by Top rated' })).toBeVisible()
  await page.goto('/movies?feed=top-rated')
  await expect(page.getByRole('button', { name: 'Sort by Top rated' })).toBeVisible()
  await page.getByRole('navigation', { name: 'Catalog kinds' }).getByRole('link', { name: 'Movies', exact: true }).click()
  await expect(page).toHaveURL(/\/movies$/)
  await expect(page.getByRole('button', { name: 'Sort by Popular' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('button', { name: 'Sort by Top rated' })).toBeVisible()
  await expect(page.locator('[data-consumit-watch-card] > p')).toHaveCount(0)
})

test('catalog filters deep-link, follow browser history, and disable unsupported Trending filters', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.addInitScript(() => {
    localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ guideStatus: 'dismissed', guideVersion: 1, communityDismissed: true }))
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
  })

  await page.goto('/movies?feed=top-rated&genre=Adventure&year=2024')
  await expect(page.getByRole('button', { name: 'Sort by Top rated' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Genre Adventure' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Year 2024' })).toBeVisible()

  await page.getByRole('button', { name: 'Year 2024' }).click()
  await page.getByRole('option', { name: '2023', exact: true }).click()
  await expect(page).toHaveURL(/\/movies\?feed=top-rated&genre=Adventure&year=2023$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/movies\?feed=top-rated&genre=Adventure&year=2024$/)
  await expect(page.getByRole('button', { name: 'Year 2024' })).toBeVisible()
  await page.goForward()
  await expect(page).toHaveURL(/\/movies\?feed=top-rated&genre=Adventure&year=2023$/)
  await expect(page.getByRole('button', { name: 'Year 2023' })).toBeVisible()

  await page.getByRole('button', { name: 'Sort by Top rated' }).click()
  await page.getByRole('option', { name: 'Trending', exact: true }).click()
  await expect(page).toHaveURL(/\/movies\?feed=trending$/)
  await expect(page.getByRole('button', { name: 'Genre All genres' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Year All years' })).toBeDisabled()
  await expect(page.getByText('Choose Popular or Top rated to filter by genre or year.')).toBeVisible()
})

for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }]) {
test(`Anime filters deep-link and survive title visits and browser history at ${viewport.width}px`, async ({ page }) => {
  await page.setViewportSize(viewport)
  await page.addInitScript(() => {
    localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ guideStatus: 'dismissed', guideVersion: 1, communityDismissed: true }))
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
  })

  await page.goto('/anime?sort=top-rated&genre=Drama&year=2026&format=TV')
  await expect(page.getByRole('button', { name: 'Sort by Top rated' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Genre Drama' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Year 2026' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Format TV' })).toBeVisible()
  const results = page.getByRole('region', { name: 'Top rated', exact: true })
  const title = results.getByRole('link', { name: 'Evening stories', exact: true })
  await expect(title).toBeVisible()

  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => {
    const axeApi = (window as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return report.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))
  })
  expect(violations, `Anime filtered browse at ${viewport.width}px`).toEqual([])
  await page.screenshot({ path: `.impeccable/review/anime-browse-history-${viewport.width}x${viewport.height}.png`, fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await page.getByRole('button', { name: 'Year 2026' }).click()
  await page.getByRole('option', { name: '2025', exact: true }).click()
  await expect(page).toHaveURL('/anime?sort=top-rated&genre=Drama&year=2025&format=TV')
  await page.goBack()
  await expect(page).toHaveURL('/anime?sort=top-rated&genre=Drama&year=2026&format=TV')
  await expect(page.getByRole('button', { name: 'Year 2026' })).toBeVisible()
  await page.goForward()
  await expect(page).toHaveURL('/anime?sort=top-rated&genre=Drama&year=2025&format=TV')
  await expect(page.getByRole('button', { name: 'Year 2025' })).toBeVisible()

  await title.click()
  await expect(page).toHaveURL('/anime/8')
  await page.goBack()

  await expect(page).toHaveURL('/anime?sort=top-rated&genre=Drama&year=2025&format=TV')
  await expect(page.getByRole('button', { name: 'Sort by Top rated' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Genre Drama' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Year 2025' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Format TV' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
}
