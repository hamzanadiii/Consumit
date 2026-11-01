import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import axe from 'axe-core'

const api = 'http://127.0.0.1:18563'

test.beforeEach(async ({ request }) => {
  await request.post(`${api}/__fixtures/reset`, { data: {} })
})

test('Settings locks profile save controls while pending and keeps edits available for retry', async ({ page, context, request }) => {
  const { token, member } = await (await request.get(`${api}/__fixtures/session?label=settings-recovery`)).json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))

  let profileWrites = 0
  let startFirstWrite!: () => void
  let releaseFirstWrite!: () => void
  const firstWriteStarted = new Promise<void>(resolve => { startFirstWrite = resolve })
  const firstWriteRelease = new Promise<void>(resolve => { releaseFirstWrite = resolve })
  await page.route('**/v1/me/profile', async route => {
    if (route.request().method() !== 'PATCH') return route.continue()
    profileWrites += 1
    if (profileWrites === 1) {
      startFirstWrite()
      await firstWriteRelease
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'AUTH_STATE_UNAVAILABLE', message: 'Profile save is temporarily unavailable. Try again.', requestId: 'settings-profile-failure', retryable: true } }),
      })
      return
    }
    await route.continue()
  })

  await page.goto('/settings#account')
  await expect(page.getByRole('heading', { name: 'Settings.' })).toBeVisible()
  const displayName = page.getByRole('textbox', { name: 'Display name' })
  await displayName.fill('Experience profile update')
  const saveBar = page.locator('.consumit-settings-savebar')
  const save = saveBar.getByRole('button', { name: /^(Save|Saving…|Retry save)$/ })
  const discard = saveBar.getByRole('button', { name: 'Discard' })
  await expect(saveBar).toBeVisible()
  await expect(saveBar).toHaveRole('region')
  await save.click()
  await firstWriteStarted

  await expect(page.locator('#profile-settings-form')).toHaveAttribute('aria-busy', 'true')
  await expect(saveBar).toContainText('Saving profile changes…')
  await expect(displayName).toBeDisabled()
  await expect(save).toBeDisabled()
  await expect(discard).toBeDisabled()
  expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect((await discard.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  releaseFirstWrite()
  const failedSave = page.getByRole('alert', { name: 'Settings error' })
  await expect(failedSave).toContainText('Profile save is temporarily unavailable. Try again.')
  await expect(saveBar).toHaveRole('alert')
  await expect(displayName).toHaveValue('Experience profile update')
  await expect(displayName).toBeEnabled()
  await expect(save).toBeEnabled()
  await expect(save).toHaveAccessibleName('Retry save')
  await expect(discard).toBeEnabled()
  await expect(save).toBeFocused()
  expect(profileWrites).toBe(1)

  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => {
    const axeApi = (window as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return report.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))
  })
  expect(violations, 'Failed Settings save should meet WCAG 2.2 AA').toEqual([])

  await mkdir('.impeccable/review/settings', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/settings/profile-save-retry-320x720.png' })
  await save.click()
  await expect(page.getByText('Profile saved.', { exact: true })).toBeVisible()
  await expect(saveBar).toHaveCount(0)
  expect(profileWrites).toBe(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await page.goto(`/profile/${member.username}`)
  await expect(page.getByRole('heading', { name: 'Experience profile update' })).toBeVisible()
})
