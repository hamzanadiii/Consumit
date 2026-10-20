import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const api = 'http://127.0.0.1:18563'

async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

test.use({ hasTouch: true, isMobile: true })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ guideStatus: 'dismissed', guideVersion: 1, communityDismissed: true }))
  })
})

test('phone navigation contains focus, restores it, and keeps destinations reachable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/')
  const trigger = page.getByRole('button', { name: 'Open navigation' })
  await expect(trigger).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).not.toBeVisible()
  await fits(page)
  await trigger.click()
  const menu = page.getByRole('dialog', { name: 'CONSUMIT' })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('link', { name: 'Watchlist' })).toHaveAttribute('href', '/library?section=watchlist')
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden')
  const close = menu.getByRole('button', { name: 'Close navigation' })
  await close.focus()
  await page.keyboard.press('Shift+Tab')
  await expect(menu.getByRole('link', { name: 'Sign in', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).not.toBeVisible()
  await expect(trigger).toBeFocused()
  await trigger.click()
  await menu.getByRole('button', { name: 'Switch to light mode' }).click()
  await expect(page.locator('[data-filscreen-home]')).toHaveAttribute('data-theme', 'light')
  await close.click()
  await page.getByRole('navigation', { name: 'Catalog kinds' }).getByRole('link', { name: 'Movies' }).click()
  await expect(page).toHaveURL(/\/movies$/)
  await expect(menu).not.toBeVisible()
  await expect(page.locator('[data-filscreen-home]')).toHaveAttribute('data-theme', 'light')
  await fits(page)
})

test('phone Search has explicit dismissal, contained focus and readable fields', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const trigger = page.getByRole('button', { name: 'Search titles', exact: true })
  await trigger.click()
  const search = page.getByRole('dialog', { name: 'Search titles' })
  await expect(search).toBeVisible()
  const input = search.getByRole('combobox')
  await expect(input).toBeFocused()
  await input.fill('North')
  await expect(search.getByRole('option').first()).toBeVisible()
  await expect(search.getByRole('button', { name: 'Close search', exact: true })).toBeVisible()
  const bottom = search.getByRole('link', { name: 'See all results' })
  await bottom.focus()
  await page.keyboard.press('Tab')
  await expect(search.getByRole('button', { name: 'Search scope' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(search).not.toBeVisible()
  await expect(trigger).toBeFocused()
  await fits(page)
})

test('catalog, detail, forms and personal screens fit narrow phones and landscape', async ({ page, context, request }) => {
  test.setTimeout(180000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const captureDirectory = resolve('.impeccable/review/mobile-pass')
  await mkdir(captureDirectory, { recursive: true })
  const { token, member } = await (await request.get(`${api}/__fixtures/session`)).json()
  for (const [width, height] of [[320, 700], [390, 844], [768, 1024], [844, 390]] as const) {
    await page.setViewportSize({ width, height })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await fits(page)
    const heroTitle = page.locator('[id^="filscreen-hero-title"] > span').first()
    await expect(heroTitle).toBeVisible()
    if (width >= 640) {
      expect(await heroTitle.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(width * 0.35)
    }
    await page.screenshot({ path: resolve(captureDirectory, `home-${width}x${height}.png`), fullPage: true })
    for (const route of [
      '/movies', '/series', '/anime', '/title/693134',
      '/sign-in', '/sign-up', '/forgot-password', '/onboarding',
      '/help', '/report-issue', '/privacy', '/terms',
    ]) {
      await page.goto(route, { waitUntil: 'domcontentloaded' })
      const heading = page.locator('h1').first()
      const retry = page.getByRole('link', { name: 'Retry catalog' })
      await expect(heading.or(retry)).toBeVisible()
      await fits(page)
      if (route === '/movies' || route === '/title/693134') {
        const captureName = route === '/movies' ? 'catalog' : 'title'
        await page.screenshot({ path: resolve(captureDirectory, `${captureName}-${width}x${height}.png`), fullPage: true })
      }
      const fields = page.locator('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"])')
      for (const field of await fields.all()) {
        if (await field.isVisible()) expect(await field.evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16)
      }
    }
    await page.goto('/movies')
    await page.getByRole('button', { name: /^Genre / }).click()
    const bounds = await page.getByRole('listbox').boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.x).toBeGreaterThanOrEqual(15)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width - 15)
    await page.keyboard.press('Escape')
  }
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  await page.setViewportSize({ width: 320, height: 700 })
  for (const route of [
    '/settings', `/profile/${member.username}`, `/profile/${member.username}/watchlist`,
    '/library?section=watchlist', '/lists', '/notifications',
  ]) {
    await page.goto(route)
    await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible()
    await fits(page)
  }
  await page.goto('/title/693134')
  const ratings = page.locator('[data-consumit-rating-input] label')
  await expect(ratings).toHaveCount(10)
  for (const rating of await ratings.all()) {
    const bounds = await rating.boundingBox()
    expect(bounds!.width).toBeGreaterThanOrEqual(44)
    expect(bounds!.height).toBeGreaterThanOrEqual(44)
  }
  await fits(page)
  expect(errors).toEqual([])
})

test('profile editor fits short screens, contains keyboard focus and restores its trigger', async ({ page, context, request }) => {
  await mkdir(resolve('.impeccable/review/mobile-pass'), { recursive: true })
  const { token, member } = await (await request.get(`${api}/__fixtures/session`)).json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  for (const [width, height] of [[320, 700], [844, 390]] as const) {
    await page.setViewportSize({ width, height })
    await page.goto(`/profile/${member.username}`)
    const trigger = page.getByRole('button', { name: 'Edit banner', exact: true })
    await expect(trigger).toBeVisible()
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'Edit banner' })
    await expect(dialog).toBeVisible()
    const bounds = (await dialog.boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.y).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height)
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
    await page.keyboard.press('Shift+Tab')
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
    await page.screenshot({ path: resolve('.impeccable/review/mobile-pass', `profile-editor-open-${width}x${height}.png`), fullPage: true })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await fits(page)
  }
})
