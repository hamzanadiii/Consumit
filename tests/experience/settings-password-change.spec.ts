import axe from 'axe-core'
import { mkdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

const api = 'http://127.0.0.1:18563'
const origin = 'http://127.0.0.1:28114'

test.beforeEach(async ({ request }) => {
  await request.post(`${api}/__fixtures/reset`, { data: {} })
})

test('password change locks credentials, recovers from failure, and accepts the new password after retry', async ({ page, context, request }) => {
  const { token } = await (await request.get(`${api}/__fixtures/session?label=settings-password`)).json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))

  let changes = 0
  let startFirstChange!: () => void
  let releaseFirstChange!: () => void
  const firstChangeStarted = new Promise<void>(resolve => { startFirstChange = resolve })
  const firstChangeRelease = new Promise<void>(resolve => { releaseFirstChange = resolve })
  await page.route('**/v1/auth/password/change', async route => {
    changes += 1
    if (changes === 1) {
      startFirstChange()
      await firstChangeRelease
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'AUTH_STATE_UNAVAILABLE', message: 'Password change is temporarily unavailable. Try again.', requestId: 'settings-password-failure', retryable: true } }),
      })
      return
    }
    await route.continue()
  })

  await page.goto('/settings#data')
  await expect(page.getByRole('heading', { name: 'Settings.' })).toBeVisible()
  await page.getByRole('button', { name: 'Change password', exact: true }).click()

  const form = page.getByRole('form', { name: 'Change password' })
  const currentPassword = form.getByRole('textbox', { name: 'Current password' })
  const newPassword = form.getByRole('textbox', { name: 'New password' })
  const submit = form.getByRole('button', { name: 'Update password', exact: true })
  await expect(currentPassword).toHaveAttribute('autocomplete', 'current-password')
  await expect(newPassword).toHaveAttribute('autocomplete', 'new-password')
  await expect(newPassword).toHaveAttribute('minlength', '12')
  await expect(newPassword).toHaveAttribute('maxlength', '128')
  await currentPassword.fill('experience-fixture-password')
  await newPassword.fill('replacement-experience-password')
  await submit.click()
  await firstChangeStarted

  await expect(form).toHaveAttribute('aria-busy', 'true')
  await expect(currentPassword).toBeDisabled()
  await expect(newPassword).toBeDisabled()
  await expect(form.getByRole('button', { name: 'Updating password…', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeDisabled()
  await form.evaluate(element => (element as HTMLFormElement).requestSubmit())
  expect(changes).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  releaseFirstChange()
  const error = form.getByRole('alert')
  await expect(error).toContainText('Password change is temporarily unavailable. Try again.')
  await expect(error).toBeFocused()
  await expect(form).toHaveAttribute('aria-busy', 'false')
  await expect(currentPassword).toHaveValue('experience-fixture-password')
  await expect(newPassword).toHaveValue('replacement-experience-password')
  await expect(currentPassword).toBeEnabled()
  await expect(newPassword).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeEnabled()

  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => {
    const axeApi = (window as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return report.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))
  })
  expect(violations, 'Password change failure recovery should meet WCAG 2.2 AA').toEqual([])

  await mkdir('.impeccable/review/settings', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/settings/password-change-retry-320x720.png' })

  await submit.click()
  await expect(page.getByText('Password updated.', { exact: true })).toBeVisible()
  await expect(form).toHaveCount(0)
  expect(changes).toBe(2)
  const signedInWithNewPassword = await request.post(`${api}/v1/auth/login`, {
    headers: { origin },
    data: { email: 'visual_settings_password@example.test', password: 'replacement-experience-password' },
  })
  expect(signedInWithNewPassword.status()).toBe(200)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
