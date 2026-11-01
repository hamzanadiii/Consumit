import { expect, test } from '@playwright/test'
import { defaultExperiencePreferences, GUIDE_VERSION } from '../../packages/contracts/src/index'

const api = 'http://127.0.0.1:18563'

test.use({ hasTouch: true, isMobile: true })

test('phone title ratings keep all five star targets at 44px without page overflow', async ({ page, context, request }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  const sessionResponse = await request.get(`${api}/__fixtures/session`)
  expect(sessionResponse.ok(), await sessionResponse.text()).toBe(true)
  const { token, member } = await sessionResponse.json()
  expect({ token, id: member?.id }).toEqual({ token: expect.any(String), id: expect.any(String) })
  await request.post(`${api}/__fixtures/reset`, {
    data: {
      memberId: member.id,
      preferences: { ...defaultExperiencePreferences(), guideVersion: GUIDE_VERSION, guideStatus: 'dismissed' },
    },
  })
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  await page.goto('/title/693134')

  const rating = page.locator('[data-consumit-rating-input]')
  await expect(rating).toBeVisible()
  const stars = rating.locator(':scope > span[role="presentation"]')
  await expect(stars).toHaveCount(5)
  for (const star of await stars.all()) {
    const bounds = await star.boundingBox()
    expect(bounds?.width).toBeGreaterThanOrEqual(44)
    expect(bounds?.height).toBeGreaterThanOrEqual(44)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
