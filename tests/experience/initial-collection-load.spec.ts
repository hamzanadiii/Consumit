import { expect, test } from '@playwright/test'
import { defaultExperiencePreferences, GUIDE_VERSION } from '../../packages/contracts/src/index'
const api = 'http://127.0.0.1:18563'
test('initial public collection route is available after fixture setup', async ({ page, context, request }) => {
  const { token } = await (await request.get(`${api}/__fixtures/session`)).json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  await request.post(`${api}/__fixtures/reset`, { data: { collectionFixture: true, publicCollection: true, collectionRole: 'visitor', preferences: { ...defaultExperiencePreferences(), guideVersion: GUIDE_VERSION, guideStatus: 'dismissed' } } })
  const response = await page.goto('/lists/quiet-evenings')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Quiet evenings, strange worlds', exact: true })).toBeVisible({ timeout: 5000 })
})
