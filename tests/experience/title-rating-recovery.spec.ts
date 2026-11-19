import axe from 'axe-core'
import { expect, test } from '@playwright/test'
import { defaultExperiencePreferences, GUIDE_VERSION } from '../../packages/contracts/src/index'

const api = 'http://127.0.0.1:18563'

test('a failed title rating save keeps the prior score and retries the requested score on a phone', async ({ page, context, request }) => {
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
  let retryStatus: number | null = null
  let retryBody = ''
  await page.route('**/v1/ratings', async route => {
    if (route.request().method() === 'PUT') {
      writes += 1
      if (writes === 1) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'fixture unavailable' }) })
        return
      }
      retryStatus = 200
      retryBody = JSON.stringify({ id: 693134, kind: 'movie', origin: 'native', sourceKey: null, value: 10 })
      await route.fulfill({ status: retryStatus, contentType: 'application/json', body: retryBody })
      return
    }
    await route.continue()
  })

  await page.goto('/title/693134')
  const widget = page.locator('[data-consumit-rating-input]').locator('xpath=..')
  const requested = page.getByRole('radio', { name: 'Rate 5 out of 5 stars' })
  await expect(requested).toBeVisible()
  await expect(requested).toBeEnabled()
  await page.locator('[data-consumit-rating-input] label[data-rating="10"]').click()

  const retry = page.getByRole('button', { name: 'Retry save' })
  await expect(widget.getByRole('alert')).toContainText('could not confirm')
  await expect(page.getByRole('radio', { name: 'Rate 4 out of 5 stars' })).not.toBeChecked()
  await expect(requested).toBeDisabled()
  await expect(retry).toBeVisible()
  expect((await retry.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await retry.scrollIntoViewIfNeeded()
  const retryBounds = await retry.boundingBox()
  expect(retryBounds?.y ?? -1).toBeGreaterThanOrEqual(0)
  expect((retryBounds?.y ?? Infinity) + (retryBounds?.height ?? 0)).toBeLessThanOrEqual(700)

  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => {
    const axeApi = (window as Window & { axe: typeof axe }).axe
    const region = document.querySelector('[aria-busy]')!.parentElement!
    return (await axeApi.run(region, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.map(item => item.id)
  })
  expect(violations).toEqual([])
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/title-journey/rating-retry-320x700.png' })

  await retry.click()
  await expect.poll(() => writes).toBe(2)
  expect(retryStatus, retryBody).toBe(200)
  await expect(requested).toBeChecked()
  await expect(widget.getByRole('alert')).toHaveCount(0)
})
