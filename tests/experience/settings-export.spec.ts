import axe from 'axe-core'
import { mkdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

const api = 'http://127.0.0.1:18563'

test.beforeEach(async ({ request }) => {
  await request.post(`${api}/__fixtures/reset`, { data: {} })
})

test('data export locks account actions, focuses a retry after failure, and downloads on success', async ({ page, context, request }) => {
  const { token } = await (await request.get(`${api}/__fixtures/session?label=settings-export`)).json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript(() => {
    localStorage.setItem('consumit.home-theme', 'light')
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
  })

  let exportRequests = 0
  let startFirstExport!: () => void
  let releaseFirstExport!: () => void
  const firstExportStarted = new Promise<void>(resolve => { startFirstExport = resolve })
  const firstExportRelease = new Promise<void>(resolve => { releaseFirstExport = resolve })
  await page.route('**/v1/me/export', async route => {
    exportRequests += 1
    if (exportRequests === 1) {
      startFirstExport()
      await firstExportRelease
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'AUTH_STATE_UNAVAILABLE', message: 'The export service is temporarily unavailable. Try again.', requestId: 'settings-export-failure', retryable: true } }),
      })
      return
    }
    await route.continue()
  })

  await page.goto('/settings#data')
  const data = page.locator('#data')
  await expect(data.getByRole('heading', { name: 'Data & security' })).toBeVisible()
  const requestExport = data.getByRole('button', { name: 'Request export', exact: true })
  const accountActions = [
    requestExport,
    data.getByRole('button', { name: 'Change password', exact: true }),
    data.getByRole('button', { name: 'Delete account', exact: true }),
    page.getByRole('button', { name: 'Sign out', exact: true }),
  ]
  for (const action of accountActions) {
    expect(await action.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44)
  }
  await requestExport.click()
  await firstExportStarted

  const preparing = data.getByRole('button', { name: 'Preparing export…', exact: true })
  await expect(preparing).toBeDisabled()
  await expect(data.getByRole('status')).toContainText('Preparing your export…')
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeDisabled()
  await expect(data.getByRole('button', { name: 'Change password', exact: true })).toBeDisabled()
  await expect(data.getByRole('button', { name: 'Delete account', exact: true })).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  releaseFirstExport()
  const error = data.getByRole('alert')
  await expect(error).toContainText('The export service is temporarily unavailable. Try again.')
  await expect(error).toBeFocused()
  const retry = data.getByRole('button', { name: 'Try export again', exact: true })
  await expect(retry).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeEnabled()

  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => {
    const axeApi = (window as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return report.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))
  })
  expect(violations, 'Export failure recovery should meet WCAG 2.2 AA').toEqual([])

  await mkdir('.impeccable/review/settings', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/settings/data-export-retry-light-320x720.png' })

  const downloadPromise = page.waitForEvent('download')
  await retry.click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('consumit-member-export.json')
  await expect(data.getByRole('status')).toContainText('Your export file is ready.')
  await expect(data.getByRole('button', { name: 'Request export', exact: true })).toBeEnabled()
  const successViolations = await page.evaluate(async () => {
    const axeApi = (window as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return report.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))
  })
  expect(successViolations, 'Export success feedback should meet WCAG 2.2 AA in light theme').toEqual([])
  await mkdir('.impeccable/review/settings', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/settings/data-export-ready-light-320x720.png' })
  expect(exportRequests).toBe(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
