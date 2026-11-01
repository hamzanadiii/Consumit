import axe from 'axe-core'
import { expect, test } from '@playwright/test'
import { defaultExperiencePreferences, GUIDE_VERSION } from '../../packages/contracts/src/index'

const api = 'http://127.0.0.1:18563'

test('the title shelf locks while saving and retries the same choice on a phone', async ({ page, context, request }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  const sessionResponse = await request.get(`${api}/__fixtures/session`)
  expect(sessionResponse.ok(), await sessionResponse.text()).toBe(true)
  const { token, member } = await sessionResponse.json()
  const reset = await request.post(`${api}/__fixtures/reset`, {
    data: {
      memberId: member.id,
      preferences: { ...defaultExperiencePreferences(), guideVersion: GUIDE_VERSION, guideStatus: 'dismissed' },
    },
  })
  expect(reset.ok(), await reset.text()).toBe(true)
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  await page.addInitScript(() => {
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    localStorage.setItem('consumit.browsing-notice.ads.dismissed.v1', 'true')
    localStorage.setItem('consumit.browsing-notice.feedback.dismissed.v1', 'true')
  })

  let writes = 0
  let releaseFailure!: () => void
  const firstFailure = new Promise<void>(resolve => { releaseFailure = resolve })
  await page.route('**/v1/me/library/watched/movie/693134', async route => {
    if (route.request().method() !== 'PUT') return route.continue()
    writes += 1
    if (writes === 1) {
      await firstFailure
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'fixture unavailable' }) })
      return
    }
    await route.fulfill({ status: 204 })
  })

  await page.goto('/title/693134')
  const shelf = page.locator('[data-consumit-member-shelf]')
  const watched = shelf.getByRole('button', { name: /Northbound.*watched/ })
  await expect(watched).toBeVisible()
  await expect(watched).toBeEnabled()
  await watched.focus()
  await page.keyboard.press('Space')

  await expect(shelf.getByRole('status')).toContainText('Saving your shelf')
  await expect(watched).toHaveAttribute('aria-disabled', 'true')
  await watched.evaluate((element: HTMLButtonElement) => element.click())
  await expect.poll(() => writes).toBe(1)
  releaseFailure()
  await expect(shelf.getByRole('alert')).toContainText('We could not confirm whether this title was marked watched.')
  await expect(watched).toHaveAttribute('aria-pressed', 'false')
  const retry = shelf.getByRole('button', { name: 'Retry marking watched' })
  await expect(retry).toBeVisible()
  await expect(retry).toBeFocused()
  expect((await retry.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await retry.scrollIntoViewIfNeeded()
  const retryBounds = await retry.boundingBox()
  expect(retryBounds?.y ?? -1).toBeGreaterThanOrEqual(0)
  expect((retryBounds?.y ?? Infinity) + (retryBounds?.height ?? 0)).toBeLessThanOrEqual(700.5)
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => {
    const axeApi = (window as Window & { axe: typeof axe }).axe
    const region = document.querySelector('[data-consumit-member-shelf]')!
    return (await axeApi.run(region, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.map(item => item.id)
  })
  expect(violations).toEqual([])
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/title-journey/shelf-retry-320x700.png' })

  await retry.focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => writes).toBe(2)
  await expect(watched).toHaveAttribute('aria-pressed', 'true')
  await expect(watched).toHaveAttribute('aria-disabled', 'false')
  await expect(watched).toBeEnabled()
  await expect(watched).toBeFocused()
  await expect(shelf.getByRole('alert')).toHaveCount(0)
})
