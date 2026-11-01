import { test, expect } from '@playwright/test'
import axe from 'axe-core'

test('notification preferences stay clear and recover from a failed save on a narrow phone', async ({ page, context, request }) => {
  const { token } = await (await request.get('http://127.0.0.1:18563/__fixtures/session')).json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  let saved = false
  let failedWrites = 1
  const writes: boolean[] = []
  await page.route('**/v1/me/notification-preferences', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ newEpisodes: saved }) })
      return
    }
    const next = route.request().postDataJSON().newEpisodes as boolean
    writes.push(next)
    if (failedWrites > 0) {
      failedWrites -= 1
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Service unavailable' }) })
      return
    }
    saved = next
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ newEpisodes: saved }) })
  })

  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto('/settings#notifications')
  const section = page.locator('#notifications')
  const preference = section.getByRole('switch', { name: 'New episodes from your Watchlist and Favorites' })
  await expect(preference).toBeEnabled()
  await expect(preference).not.toBeChecked()
  await preference.click()

  const error = section.getByRole('alert')
  await expect(error).toContainText('Your preference could not be saved.')
  const retry = error.getByRole('button', { name: 'Try again' })
  await expect(preference).not.toBeChecked()
  await expect(retry).toBeVisible()
  await expect(retry).toBeFocused()
  expect(await retry.evaluate(element => getComputedStyle(element).boxShadow)).not.toBe('none')
  expect((await retry.boundingBox())?.height).toBeGreaterThanOrEqual(44)

  await page.addScriptTag({ content: axe.source })
  const accessibility = await page.evaluate(async () => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    return axeApi.run(document.querySelector<HTMLElement>('#notifications')!, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    })
  })
  expect(accessibility.violations).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: '.impeccable/review/settings/notification-retry-320x720.png' })

  await retry.click()
  await expect(preference).toBeChecked()
  await expect(preference).toBeEnabled()
  expect(writes).toEqual([true, true])
  expect(saved).toBe(true)
  expect(await preference.boundingBox()).toMatchObject({ height: 44 })
})
