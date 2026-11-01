import axe from 'axe-core'
import { mkdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

const api = 'http://127.0.0.1:18563'

test.beforeEach(async ({ request }) => {
  await request.post(`${api}/__fixtures/reset`, { data: {} })
})

test('account deletion explains consequences, recovers from failure, and signs out after retry', async ({ page, context, request }) => {
  const { token } = await (await request.get(`${api}/__fixtures/session?label=settings-delete`)).json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript(() => {
    localStorage.setItem('consumit.home-theme', 'light')
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
  })

  let deletionRequests = 0
  let startFirstDelete!: () => void
  let releaseFirstDelete!: () => void
  const firstDeleteStarted = new Promise<void>(resolve => { startFirstDelete = resolve })
  const firstDeleteRelease = new Promise<void>(resolve => { releaseFirstDelete = resolve })
  await page.route('**/v1/me', async route => {
    if (route.request().method() !== 'DELETE') return route.continue()
    deletionRequests += 1
    if (deletionRequests === 1) {
      startFirstDelete()
      await firstDeleteRelease
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'AUTH_STATE_UNAVAILABLE', message: 'Deletion is temporarily unavailable. Try again.', requestId: 'settings-delete-failure', retryable: true } }),
      })
      return
    }
    await route.fulfill({ status: 204, headers: { 'set-cookie': 'consumit_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax' } })
  })

  await page.goto('/settings#data')
  await expect(page.getByRole('heading', { name: 'Settings.' })).toBeVisible()
  await page.getByRole('button', { name: 'Delete account', exact: true }).click()

  const form = page.getByRole('form', { name: 'Delete account confirmation' })
  const password = form.getByRole('textbox', { name: 'Confirm your password' })
  const acknowledgement = form.getByRole('checkbox', { name: /I understand this permanently deletes my account data/i })
  const submit = form.getByRole('button', { name: 'Delete my account permanently', exact: true })
  await expect(form).toContainText('profile, reviews, ratings, saved titles, lists, Watch History, and playback progress')
  await expect(form).toContainText('Your username stays reserved')
  await expect(form).toContainText('Use Request export above before continuing')
  await expect(password).toHaveAttribute('autocomplete', 'current-password')
  await expect(acknowledgement).toHaveAttribute('required', '')
  await expect(submit).toBeDisabled()

  await password.fill('experience-fixture-password')
  await acknowledgement.check()
  await expect(submit).toBeEnabled()
  expect((await submit.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect((await form.getByRole('button', { name: 'Cancel', exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await submit.click()
  await firstDeleteStarted
  await expect(form).toHaveAttribute('aria-busy', 'true')
  await expect(password).toBeDisabled()
  await expect(acknowledgement).toBeDisabled()
  await expect(submit).toBeDisabled()
  await expect(form.getByRole('status')).toContainText('Deleting your account…')
  await form.evaluate(element => (element as HTMLFormElement).requestSubmit())
  expect(deletionRequests).toBe(1)

  releaseFirstDelete()
  const error = form.getByRole('alert')
  await expect(error).toContainText('Deletion is temporarily unavailable. Try again.')
  await expect(error).toBeFocused()
  await expect(form).toHaveAttribute('aria-busy', 'false')
  await expect(password).toHaveValue('experience-fixture-password')
  await expect(acknowledgement).toBeChecked()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => {
    const axeApi = (window as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return report.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))
  })
  expect(violations, 'Deletion failure recovery should meet WCAG 2.2 AA').toEqual([])

  await mkdir('.impeccable/review/settings', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/settings/account-delete-retry-320x720-light.png' })
  await page.setViewportSize({ width: 1440, height: 960 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await submit.click()
  await expect(page).toHaveURL('/')
  await expect.poll(() => deletionRequests).toBe(2)
  await page.goto('/settings')
  await expect(page.getByRole('link', { name: 'Sign in for account settings' })).toBeVisible()
})
