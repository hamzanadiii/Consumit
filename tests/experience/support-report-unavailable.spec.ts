import axe from 'axe-core'
import { mkdir } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

const api = 'http://127.0.0.1:18563'

async function expectAccessible(page: Page) {
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return report.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))
  })
  expect(violations, 'The unavailable inbox state should meet WCAG 2.2 AA').toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'The unavailable inbox state should fit the phone').toBe(true)
}

test.beforeEach(async ({ request }) => { await request.post(`${api}/__fixtures/reset`, { data: {} }) })

test('Help returns the member to guidance when the configured support inbox is missing', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript(() => {
    localStorage.setItem('consumit.home-theme', 'light')
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
  })

  await page.goto('/help')
  await page.locator('main').getByRole('link', { name: 'Report an issue', exact: true }).first().click()
  await expect(page).toHaveURL('/report-issue')
  await expect(page.getByRole('heading', { name: 'Tell us what got in the way.', exact: true })).toBeFocused()
  await expect(page.locator('[data-filscreen-home]')).toHaveAttribute('data-theme', 'light')

  const unavailable = page.getByRole('status')
  await expect(unavailable.getByRole('heading', { name: 'Issue reporting is unavailable' })).toBeVisible()
  await expect(unavailable).toContainText('Consumit does not have a support email configured for this site')
  await expect(page.getByRole('link', { name: 'Prepare email' })).toHaveCount(0)
  await expect(page.getByRole('textbox')).toHaveCount(0)
  const helpLink = page.getByRole('link', { name: 'Go to Help Center' })
  expect((await helpLink.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await expectAccessible(page)

  await mkdir('.impeccable/review/support-report', { recursive: true })
  await page.screenshot({ animations: 'disabled', fullPage: true, path: '.impeccable/review/support-report/unavailable-light-320x720.png' })
  await helpLink.click()
  await expect(page).toHaveURL('/help')
  await expect(page.getByRole('heading', { name: 'A little help, when you need it.' })).toBeVisible()
})
