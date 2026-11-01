import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import axe from 'axe-core'
import { defaultExperiencePreferences } from '../../packages/contracts/src/index'

const api = 'http://127.0.0.1:18563'

test('review likes retain the exact choice and can recover on a narrow phone', async ({ page, context, request }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  const { token, member } = await (await request.get(`${api}/__fixtures/session`)).json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  await request.post(`${api}/__fixtures/reset`, {
    data: { memberId: member.id, reviewFixture: true, preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed' } },
  })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))

  const writes: boolean[] = []
  await page.route('**/v1/taste/reviews/experience-review/like', async route => {
    writes.push(route.request().postDataJSON().liked)
    if (writes.length === 1) {
      await route.fulfill({ status: 503, json: { error: { code: 'AUTH_STATE_UNAVAILABLE', message: 'The account request failed.', requestId: 'review-like', retryable: true } } })
    } else {
      await route.fulfill({ status: 204 })
    }
  })

  await page.goto('/profile/experience_fixture')
  await page.locator('[data-consumit-profile-activity] a[href="/reviews/experience-review"]').first().click()
  await expect(page).toHaveURL(/\/reviews\/experience-review$/)
  const like = page.getByRole('button', { name: 'Like · 0', exact: true })
  await like.click()

  const retry = page.getByRole('button', { name: 'Retry like', exact: true })
  await expect(retry).toBeVisible()
  await expect(page.getByRole('button', { name: 'Like · 0', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(retry).toBeFocused()
  expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await mkdir('.impeccable/review/review-journey', { recursive: true })
  await page.screenshot({ caret: 'initial', path: '.impeccable/review/review-journey/like-retry-320x720.png', fullPage: true })
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => (await (window as Window & { axe: typeof axe }).axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  })).violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })))
  expect(violations).toEqual([])

  await retry.click()
  await expect(page.getByRole('button', { name: 'Liked · 1', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Liked · 1', exact: true })).toBeFocused()
  expect(writes).toEqual([true, true])
})
