import { mkdir } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import axe from 'axe-core'

test('Settings explains username rules before the browser blocks an invalid profile save', async ({ page, context, request }) => {
  const { token } = await (await request.get('http://127.0.0.1:18563/__fixtures/session')).json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  let profileWrites = 0
  await page.route('**/v1/me/profile', async route => {
    if (route.request().method() === 'PATCH') profileWrites++
    await route.continue()
  })

  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto('/settings#account')
  const username = page.getByRole('textbox', { name: 'Username' })
  await expect(username).toHaveAccessibleDescription(/3–30 characters: lowercase letters, numbers, and underscores\. Next username change:/)
  await expect(username).toHaveAttribute('title', 'Use 3–30 lowercase letters, numbers, and underscores.')
  await username.fill('Uppercase_Name')
  await page.getByRole('button', { name: 'Save changes' }).click()

  await expect(username).toBeFocused()
  expect(await username.evaluate(element => (element as HTMLInputElement).validity.patternMismatch)).toBe(true)
  expect(profileWrites).toBe(0)
  await expect(page.getByRole('region', { name: 'Unsaved profile changes' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await page.addScriptTag({ content: axe.source })
  const accessibility = await page.evaluate(async () => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    return axeApi.run(document.querySelector<HTMLElement>('#account')!, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    })
  })
  expect(accessibility.violations).toEqual([])
  await mkdir('.impeccable/review/settings', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/settings/username-validation-320x720.png' })
})
