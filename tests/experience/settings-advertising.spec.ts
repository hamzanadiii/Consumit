import { test, expect } from '@playwright/test'
import axe from 'axe-core'

const advertisingDescription = 'Choose whether our advertising partner can open pop-under ads while you browse.'
const popunderScript = 'https://pl29474263.profitableratecpmnetwork.com/a9/92/22/a9922243a391df320bd9848954d045e6.js'

test('member ad opt-out keeps the device choice and retries account sync with visible focus', async ({ page, context, request }) => {
  const { token } = await (await request.get('http://127.0.0.1:18563/__fixtures/session')).json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  let failedWrites = 1
  const writes: Record<string, unknown>[] = []
  await page.route('**/v1/me/experience-preferences', async route => {
    if (route.request().method() !== 'PATCH') return route.continue()
    writes.push(route.request().postDataJSON())
    if (failedWrites > 0) {
      failedWrites -= 1
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Service unavailable' }) })
      return
    }
    await route.continue()
  })

  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto('/settings#advertising')
  const section = page.locator('#advertising')
  await expect(section.getByText(advertisingDescription, { exact: true })).toBeVisible()

  const otherTab = await context.newPage()
  await otherTab.setViewportSize({ width: 320, height: 720 })
  await otherTab.goto('/settings#advertising')
  const otherSection = otherTab.locator('#advertising')
  await expect(otherSection.getByRole('switch', { name: 'Ad status: On' })).toBeEnabled()

  const enabled = section.getByRole('switch', { name: 'Ad status: On' })
  await expect(enabled).toBeEnabled()
  await enabled.click()
  const disabled = section.getByRole('switch', { name: 'Ad status: Off' })
  await expect(disabled).toBeVisible()
  await expect(otherSection.getByRole('switch', { name: 'Ad status: Off' })).toBeVisible()
  const status = section.getByRole('status')
  await expect(status).toContainText('Your choices are kept on this device. Retry to sync them to your account.')
  const retry = section.getByRole('button', { name: 'Retry ad preference sync' })
  await expect(retry).toBeFocused()
  expect((await retry.boundingBox())?.height).toBeGreaterThanOrEqual(44)
  expect(await retry.evaluate(element => getComputedStyle(element).boxShadow)).not.toBe('none')
  expect(await page.evaluate(() => localStorage.getItem('consumit.ads.enabled'))).toBe('false')

  await page.addScriptTag({ content: axe.source })
  const accessibility = await page.evaluate(async () => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    return axeApi.run(document.querySelector<HTMLElement>('#advertising')!, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    })
  })
  expect(accessibility.violations).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: '.impeccable/review/settings/advertising-sync-retry-320x720.png' })

  await retry.click()
  await expect(disabled).toBeEnabled()
  await expect(status).toHaveCount(0)
  expect(writes).toEqual([{ adsEnabled: false }, { adsEnabled: false }])

  await otherSection.getByRole('switch', { name: 'Ad status: Off' }).click()
  await expect(section.getByRole('switch', { name: 'Ad status: On' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('consumit.ads.enabled'))).toBe('true')
  await otherTab.close()
})

test('guest advertising choice stays on the device and account controls remain separate', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto('/settings')
  const section = page.locator('#advertising')
  await expect(section.getByText(advertisingDescription, { exact: true })).toBeVisible()
  const enabled = section.getByRole('switch', { name: 'Ad status: On' })
  await expect(enabled).toBeEnabled()

  const otherTab = await page.context().newPage()
  await otherTab.setViewportSize({ width: 320, height: 720 })
  await otherTab.goto('/settings#advertising')
  const otherSection = otherTab.locator('#advertising')
  const otherEnabled = otherSection.getByRole('switch', { name: 'Ad status: On' })
  await expect(otherEnabled).toBeEnabled()

  const browseTab = await page.context().newPage()
  await browseTab.setViewportSize({ width: 320, height: 720 })
  await browseTab.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  let publisherLoads = 0
  await browseTab.route(popunderScript, async route => {
    publisherLoads += 1
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.__fixturePopunderRan = (window.__fixturePopunderRan ?? 0) + 1' })
  })
  await browseTab.goto('/movies')
  await expect(browseTab.locator('script[data-ad-popunder]')).toHaveCount(1)
  await expect.poll(() => browseTab.evaluate(() => (window as unknown as { __fixturePopunderRan?: number }).__fixturePopunderRan ?? 0)).toBe(1)

  await enabled.click()
  await expect(section.getByRole('switch', { name: 'Ad status: Off' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('consumit.ads.enabled'))).toBe('false')
  await expect(otherSection.getByRole('switch', { name: 'Ad status: Off' })).toBeVisible()
  expect(await otherTab.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expect.poll(() => browseTab.evaluate(() => (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type)).toBe('reload')
  await expect(browseTab.locator('script[data-ad-popunder]')).toHaveCount(0)
  await expect.poll(() => browseTab.evaluate(() => (window as unknown as { __fixturePopunderRan?: number }).__fixturePopunderRan ?? 0)).toBe(0)
  expect(publisherLoads).toBe(1)

  await otherSection.getByRole('switch', { name: 'Ad status: Off' }).click()
  await expect(section.getByRole('switch', { name: 'Ad status: On' })).toBeVisible()
  await expect(browseTab.locator('script[data-ad-popunder]')).toHaveCount(0)

  await expect(page.getByRole('link', { name: 'Sign in for account settings' })).toBeVisible()
  await expect(page.locator('#profile-settings-form')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await browseTab.close()
  await otherTab.close()
})
