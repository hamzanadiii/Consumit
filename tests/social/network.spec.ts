import { expect, test } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
import { defaultExperiencePreferences } from '../../packages/contracts/src/index'

test.beforeEach(async ({ page, request }) => {
  await request.post('http://127.0.0.1:18562/__fixtures/reset', { data: {} })
  const avatar = await readFile('apps/web/public/assets/hamza-avatar.svg')
  await page.route('https://api.dicebear.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: avatar }))
  await page.route('**/v1/telemetry/web-vitals', route => route.fulfill({ status: 204 }))
  await page.route('**/v1/me/notifications?*', route => route.fulfill({ json: { items: [], nextCursor: null, unreadCount: 0 } }))
  await page.route('**/v1/me/experience-preferences', route => route.fulfill({ json: { preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'completed' }, saved: true } }))
})

test('owner Network stays compact and changes relationship lists through navigation', async ({ page, context, request }) => {
  const { token } = await (await request.get('http://127.0.0.1:18562/__fixtures/session')).json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/' }])
  await mkdir('.impeccable/review/network', { recursive: true })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/profile/cinephile/network')
  await page.getByRole('button', { name: 'Follow', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Following' })).toBeVisible()
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]] as const) {
    await page.setViewportSize({ width, height })
    await page.goto('/profile/social_owner/network')
    await expect(page.getByRole('heading', { name: 'Network', level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Edit profile' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Follow', exact: true })).toHaveCount(0)
    const sections = page.getByRole('navigation', { name: /profile sections/ })
    await expect.poll(async () => {
      const nav = (await sections.boundingBox())!
      const active = (await sections.getByRole('link', { name: 'Network', exact: true }).boundingBox())!
      return active.x >= nav.x - 1 && active.x + active.width <= nav.x + nav.width + 1
    }).toBe(true)
    const views = page.getByRole('navigation', { name: 'Network views' })
    await expect(views.getByRole('link', { name: 'Followers, 0', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByText('No followers to show yet.')).toBeVisible()
    await page.screenshot({ fullPage: true, path: `.impeccable/review/network/${name}-followers.png` })
    await views.getByRole('link', { name: 'Following, 1', exact: true }).click()
    await expect(page).toHaveURL(/network\?view=following$/)
    await expect(page.getByRole('link', { name: /Samira — Cinema after midnight/ })).toBeVisible()
    await expect(page.getByText('No followers to show yet.')).toHaveCount(0)
    await page.screenshot({ fullPage: true, path: `.impeccable/review/network/${name}-following.png` })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect((await page.locator('[data-consumit-archive-header]').boundingBox())!.height).toBeLessThan(200)
    await views.getByRole('link', { name: 'Followers, 0', exact: true }).click()
    await expect(page.getByText('No followers to show yet.')).toBeVisible()
    await expect(page.getByRole('link', { name: /Samira — Cinema after midnight/ })).toHaveCount(0)
  }
  expect(errors).toEqual([])
})

test('guest Network shows only public sections and sign-in action on desktop and mobile', async ({ page }) => {
  await mkdir('.impeccable/review/network', { recursive: true })
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]] as const) {
    await page.setViewportSize({ width, height })
    await page.goto('/profile/cinephile/network?view=following')
    await expect(page.getByRole('heading', { name: 'Network', level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sign in to follow' })).toHaveAttribute('href', '/sign-in?next=%2Fprofile%2Fcinephile')
    const navigation = page.getByRole('navigation', { name: /profile sections/ })
    await expect(navigation.getByRole('link', { name: 'Ratings, 1' })).toBeVisible()
    await expect(navigation.getByRole('link', { name: /Watched|Diary|History|Watchlist|Likes|Tags/ })).toHaveCount(0)
    await expect(page.getByText('No following to show yet.')).toBeVisible()
    await page.screenshot({ fullPage: true, path: `.impeccable/review/network/${name}-visitor.png` })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})
