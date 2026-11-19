import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test } from '@playwright/test'
import axe from 'axe-core'

test.use({ hasTouch: true, isMobile: true })

test('search scope stays in the URL through filtering, a new query, and browser Back', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ guideStatus: 'dismissed', guideVersion: 1, communityDismissed: true }))
  })

  await page.goto('/search?q=north&type=movie')
  const captureDirectory = resolve('.impeccable/review')
  await mkdir(captureDirectory, { recursive: true })
  await page.screenshot({ caret: 'initial', path: resolve(captureDirectory, 'search-scope-390x844.png'), fullPage: true })
  const filters = page.getByRole('group', { name: 'Filter results' })
  await expect(filters.getByRole('button', { name: 'Movies' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('heading', { name: 'Northbound — a remarkably long title for a quiet evening at home' })).toBeVisible()
  const missingArtworkCard = page.locator('[data-consumit-watch-card]:has([data-consumit-missing-artwork])')
  await expect(missingArtworkCard.getByText('Northbound — a remarkably long title for a quiet evening at home', { exact: true })).toBeVisible()

  await filters.getByRole('button', { name: 'Series' }).click()
  await expect(page).toHaveURL(/\/search\?q=north&type=series$/)
  await expect(filters.getByRole('button', { name: 'Series' })).toHaveAttribute('aria-pressed', 'true')
  await expect(filters.getByRole('button', { name: 'Series' })).toBeFocused()
  await expect(page.getByRole('heading', { name: 'No titles found' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Best match for “north”' })).not.toBeVisible()

  const search = page.getByRole('searchbox', { name: 'Search movies, series, and anime' })
  await search.fill('severance')
  await search.press('Enter')
  await expect(page).toHaveURL(/\/search\?q=severance&type=series$/)
  await expect(page.getByRole('heading', { name: 'Severance', exact: true })).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL(/\/search\?q=north&type=series$/)
  await expect(page.getByRole('heading', { name: 'No titles found' })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/\/search\?q=north&type=movie$/)
  await expect(page.getByRole('heading', { name: 'Northbound — a remarkably long title for a quiet evening at home' })).toBeVisible()

  await filters.getByRole('button', { name: 'Anime' }).click()
  await expect(page).toHaveURL(/\/search\?q=north&type=anime$/)
  await expect(page.getByRole('heading', { name: 'Sign in to search anime' })).toBeVisible()
  await expect(page.locator('a[href="/sign-in?next=%2Fsearch%3Fq%3Dnorth%26type%3Danime"]')).toHaveText('Sign in')
  expect(await page.locator('[data-search-hero-overlay]').evaluate(element => getComputedStyle(element).backgroundImage)).toContain('rgba(9, 9, 11, 0.98)')
  await page.screenshot({ caret: 'initial', path: resolve(captureDirectory, 'search-anime-sign-in-390x844.png'), fullPage: true })

  await page.setViewportSize({ width: 320, height: 720 })
  await page.evaluate(() => localStorage.setItem('consumit.home-theme', 'light'))
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Sign in to search anime' })).toBeVisible()
  expect(await page.locator('[data-search-hero-overlay]').evaluate(element => getComputedStyle(element).backgroundImage)).toContain('rgba(250, 247, 240, 0.98)')
  const signIn = page.locator('a[href="/sign-in?next=%2Fsearch%3Fq%3Dnorth%26type%3Danime"]')
  expect((await signIn.boundingBox())?.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => {
    const axeApi = (window as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return report.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))
  })
  expect(violations, 'Anime sign-in Search state at 320px in light theme').toEqual([])
  await page.screenshot({ caret: 'initial', path: resolve(captureDirectory, 'search-anime-sign-in-light-320x720.png'), fullPage: true })
})

test('signing in from Anime Search returns to the exact query and unlocks its results', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ guideStatus: 'dismissed', guideVersion: 1, communityDismissed: true }))
  })

  await page.goto('/search?q=evening&type=anime')
  await expect(page.getByRole('heading', { name: 'Sign in to search anime' })).toBeVisible()
  const signIn = page.getByRole('link', { name: 'Sign in', exact: true })
  await expect(signIn).toHaveAttribute('href', '/sign-in?next=%2Fsearch%3Fq%3Devening%26type%3Danime')
  await signIn.click()

  await expect(page).toHaveURL('/sign-in?next=%2Fsearch%3Fq%3Devening%26type%3Danime')
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('experience@example.test')
  await page.getByLabel('Password', { exact: true }).fill('experience-fixture-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()

  await expect(page).toHaveURL('/search?q=evening&type=anime')
  const welcome = page.getByRole('dialog', { name: 'Welcome to Consumit.' })
  await expect(welcome).toBeVisible()
  await welcome.getByRole('button', { name: 'Start exploring', exact: true }).click()
  await expect(welcome).not.toBeVisible()
  await expect(page.getByRole('searchbox', { name: 'Search movies, series, and anime' })).toHaveValue('evening')
  await expect(page.getByRole('group', { name: 'Filter results' }).getByRole('button', { name: 'Anime' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Evening stories', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sign in to search anime' })).not.toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => {
    const axeApi = (window as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return report.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))
  })
  expect(violations, 'Authenticated Anime Search after returning from sign-in').toEqual([])

  const captureDirectory = resolve('.impeccable/review')
  await mkdir(captureDirectory, { recursive: true })
  await page.screenshot({ caret: 'initial', path: resolve(captureDirectory, 'search-anime-authenticated-390x844.png'), fullPage: true })
})

test('keyboard reaches each Search result before its optional actions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ guideStatus: 'dismissed', guideVersion: 1, communityDismissed: true }))
  })

  await page.goto('/search')
  const filters = page.getByRole('group', { name: 'Filter results' })
  const peopleLink = filters.getByRole('link', { name: 'People' })
  const cards = page.locator('#results [data-consumit-watch-card]')
  const first = cards.nth(0)
  const second = cards.nth(1)
  const firstTitle = first.getByRole('link', { name: 'Northbound — a remarkably long title for a quiet evening at home', exact: true })
  const secondTitle = second.getByRole('link', { name: 'Severance', exact: true })
  const firstSave = first.getByRole('link', { name: 'Sign in to save Northbound — a remarkably long title for a quiet evening at home to your library', exact: true })
  const firstActions = first.getByRole('button', { name: 'More actions for Northbound — a remarkably long title for a quiet evening at home', exact: true })
  await expect(cards).toHaveCount(2)
  await expect(firstSave).toBeAttached()
  await expect(firstActions).toBeAttached()
  await peopleLink.focus()
  await page.keyboard.press('Tab')
  await expect(firstTitle).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(firstSave).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(firstActions).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(secondTitle).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(second.getByRole('link', { name: 'Sign in to save Severance to your library', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(second.getByRole('button', { name: 'More actions for Severance', exact: true })).toBeFocused()

  const captureDirectory = resolve('.impeccable/review')
  await mkdir(captureDirectory, { recursive: true })
  await page.screenshot({ caret: 'initial', path: resolve(captureDirectory, 'search-keyboard-results-390x844.png'), fullPage: true })
})
