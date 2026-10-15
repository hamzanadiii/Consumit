import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'

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
