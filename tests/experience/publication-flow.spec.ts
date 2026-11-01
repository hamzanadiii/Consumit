import { expect, test, type Page } from '@playwright/test'
import axe from 'axe-core'
import { defaultExperiencePreferences, GUIDE_VERSION } from '../../packages/contracts/src/index'

const api = 'http://127.0.0.1:18563'

async function expectWcag22Aa(page: Page, route: string) {
  const axeLoaded = await page.evaluate(() => Boolean((window as Window & { axe?: unknown }).axe))
  if (!axeLoaded) await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => {
    const axeApi = (window as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    })
    return report.violations.map(violation => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map(node => node.target),
    }))
  })
  expect(violations, `WCAG 2.2 AA issues on ${route}`).toEqual([])
}

test('a visitor can recover from a failed collection update preference read', async ({ page, context, request }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const sessionResponse = await request.get(`${api}/__fixtures/session`)
  expect(sessionResponse.ok()).toBe(true)
  const { token, member } = await sessionResponse.json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  const reset = await request.post(`${api}/__fixtures/reset`, {
    data: {
      collectionFixture: true,
      collectionRole: 'visitor',
      memberId: member.id,
      publicCollection: true,
      preferences: { ...defaultExperiencePreferences(), guideVersion: GUIDE_VERSION, guideStatus: 'dismissed', communityDismissed: true },
    },
  })
  expect(reset.ok()).toBe(true)
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))

  let reads = 0
  let retrying = false
  let retryFailures = 0
  const subscriptionRoute = '**/v1/taste/subscriptions/**'
  await page.route(subscriptionRoute, route => {
    if (route.request().method() !== 'GET') return route.continue()
    reads += 1
    if (!retrying) return route.fulfill({
      status: 503,
      json: { error: { code: 'AUTH_STATE_UNAVAILABLE', message: 'Update preferences are temporarily unavailable.', requestId: 'publication-flow', retryable: true } },
    })
    if (retryFailures === 0) {
      retryFailures += 1
      return route.fulfill({
        status: 503,
        json: { error: { code: 'AUTH_STATE_UNAVAILABLE', message: 'Update preferences are still unavailable. Try again.', requestId: 'publication-flow', retryable: true } },
      })
    }
    return route.fulfill({ json: { subscribed: false, muted: false } })
  })

  await page.goto('/lists/quiet-evenings')
  await expect(page.getByRole('heading', { name: 'Quiet evenings, strange worlds', exact: true })).toBeVisible()
  await expect.poll(() => reads).toBeGreaterThanOrEqual(2)
  await expect(page.locator('.taste-status').getByRole('alert')).toContainText('Update preferences are temporarily unavailable.')
  const retry = page.getByRole('button', { name: 'Retry checking notification preferences', exact: true })
  await expect(retry).toBeVisible()
  const retryBox = await retry.boundingBox()
  expect(retryBox?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await expectWcag22Aa(page, 'public collection preference failure in dark theme')
  await page.screenshot({ path: testInfo.outputPath('subscription-error-mobile-dark.png'), fullPage: true })

  await page.evaluate(() => localStorage.setItem('consumit.home-theme', 'light'))
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-consumit-theme', 'light')
  await expect(page.locator('.taste-status').getByRole('alert')).toContainText('Update preferences are temporarily unavailable.')
  await expect.poll(() => reads).toBeGreaterThanOrEqual(4)
  await expectWcag22Aa(page, 'public collection preference failure in light theme')
  await page.screenshot({ path: testInfo.outputPath('subscription-error-mobile-light.png'), fullPage: true })

  retrying = true
  await retry.click()
  await expect(page.locator('.taste-status').getByRole('alert')).toContainText('Update preferences are still unavailable. Try again.')
  await expect(retry).toBeFocused()
  await retry.click()

  const notify = page.getByRole('button', { name: 'Notify me about updates', exact: true })
  await expect(notify).toBeEnabled()
  await expect(notify).toBeFocused()
  await expect(page.locator('.taste-status [role="alert"]')).toHaveCount(0)
  await expectWcag22Aa(page, 'public collection preference read recovered')
  expect(reads).toBeGreaterThanOrEqual(3)
})
