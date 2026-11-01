import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import axe from 'axe-core'

test('one member portrait matches the header, profile and Settings on desktop and mobile', async ({ page, context, request }) => {
  const { token, member } = await (await request.get('http://127.0.0.1:18563/__fixtures/session')).json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  const portrait = await readFile('apps/web/public/assets/hamza-avatar.svg')
  await page.route('https://api.dicebear.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: portrait }))
  for (const [label, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]] as const) {
    await page.setViewportSize({ width, height })
    await page.goto(`/profile/${member.username}`)
    const header = page.getByRole('link', { name: `Your library, signed in as ${member.username}` }).locator('img')
    const profile = page.locator('[data-consumit-profile-masthead] [data-consumit-avatar] img')
    await expect(header).toHaveAttribute('src', new RegExp(`seed=${member.username}&`))
    await expect(profile).toHaveAttribute('src', (await header.getAttribute('src'))!)
    await page.screenshot({ path: `.impeccable/review/profile-avatar/${label}.png` })
    await page.goto('/settings')
    const preview = page.locator('#profile-settings-form [data-consumit-avatar] img')
    await expect(preview).toHaveAttribute('src', new RegExp(`seed=${member.username}&`))
  }
})

test('a randomized portrait stays consistent after saving Settings and reloading the profile', async ({ page, context, request }) => {
  const { token, member } = await (await request.get('http://127.0.0.1:18563/__fixtures/session')).json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  const portrait = await readFile('apps/web/public/assets/hamza-avatar.svg')
  await page.route('https://api.dicebear.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: portrait }))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/settings#account')

  const preview = page.locator('#profile-settings-form [data-consumit-avatar] img')
  const originalPortrait = await preview.getAttribute('src')
  await page.getByRole('button', { name: 'Randomize' }).click()
  const chosenPortrait = await preview.getAttribute('src')
  expect(chosenPortrait).toMatch(/^https:\/\/api\.dicebear\.com\/7\.x\/notionists\/svg\?seed=.+/)
  expect(chosenPortrait).not.toBe(originalPortrait)
  await expect(page.getByRole('region', { name: 'Unsaved profile changes' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeEnabled()

  await page.addScriptTag({ content: axe.source })
  const accessibility = await page.evaluate(async () => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    return axeApi.run(document.querySelector<HTMLElement>('#profile-settings-form')!, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    })
  })
  expect(accessibility.violations).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: '.impeccable/review/settings/avatar-randomize-390x844.png' })

  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Profile saved.', { exact: true })).toBeVisible()
  await page.goto(`/profile/${member.username}`)
  const header = page.getByRole('link', { name: `Your library, signed in as ${member.username}` }).locator('img')
  const profile = page.locator('[data-consumit-profile-masthead] [data-consumit-avatar] img')
  await expect(header).toHaveAttribute('src', chosenPortrait!)
  await expect(profile).toHaveAttribute('src', chosenPortrait!)
  await page.reload()
  await expect(page.locator('[data-consumit-profile-masthead] [data-consumit-avatar] img')).toHaveAttribute('src', chosenPortrait!)
})
