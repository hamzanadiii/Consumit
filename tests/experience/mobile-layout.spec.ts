import { expect, test, type Page } from '@playwright/test'

const api = 'http://127.0.0.1:18563'

async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

test.use({ hasTouch: true, isMobile: true })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
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
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const { token, member } = await (await request.get(`${api}/__fixtures/session`)).json()
  for (const [width, height] of [[320, 700], [390, 844], [844, 390]] as const) {
    await page.setViewportSize({ width, height })
    for (const route of ['/movies', '/series', '/title/693134', '/sign-in', '/onboarding']) {
      await page.goto(route)
      await expect(page.locator('h1').first()).toBeAttached()
      await fits(page)
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
  for (const route of ['/settings', `/profile/${member.username}`, `/profile/${member.username}/watchlist`, '/notifications']) {
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
