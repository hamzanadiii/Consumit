import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import axe from 'axe-core'

const api = 'http://127.0.0.1:18563'

async function expectAccessible(page: import('@playwright/test').Page, label: string) {
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return report.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))
  })
  expect(violations, `${label} should meet WCAG 2.2 AA`).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label} should fit the phone`).toBe(true)
}

async function expectCheckboxAccentToMatchTheme(checkbox: import('@playwright/test').Locator) {
  const expected = await checkbox.evaluate(element => {
    const shell = element.closest<HTMLElement>('[data-filscreen-home]')
    if (!shell) return ''
    const probe = document.createElement('span')
    probe.style.color = getComputedStyle(shell).getPropertyValue('--fs-accent')
    probe.style.position = 'fixed'
    probe.style.visibility = 'hidden'
    document.body.append(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  })
  await expect.poll(() => checkbox.evaluate(element => getComputedStyle(element).accentColor)).toBe(expected)
}

test.beforeEach(async ({ request }) => {
  await request.post(`${api}/__fixtures/reset`, { data: {} })
})

test('Help prepares a playback report without diagnostics until the member consents', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript(diagnostics => {
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    sessionStorage.setItem('consumit.report.playback', JSON.stringify({ value: diagnostics, at: Date.now() }))
  }, {
    ref: { kind: 'series', id: 1399, season: 2, episode: 4 },
    provider: 'configured_source',
    browser: 'Chrome',
    delivery: 'direct',
    category: 'network',
  })

  await page.goto('/help')
  const supportNavigation = page.getByRole('navigation', { name: 'Support navigation' })
  for (const name of ['Help center', 'Sign in']) {
    const link = supportNavigation.getByRole('link', { name })
    const lineCount = await link.evaluate(element => {
      const range = document.createRange()
      range.selectNodeContents(element)
      return range.getClientRects().length
    })
    expect(lineCount, `${name} should remain on one line at 320px`).toBe(1)
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  }
  const playbackQuestion = page.locator('summary').filter({ hasText: 'What should I do if playback stops?' })
  await playbackQuestion.focus()
  await page.keyboard.press('Enter')
  const reportLink = page.getByRole('link', { name: 'report a playback issue' })
  await expect(reportLink).toBeVisible()
  await reportLink.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/report-issue?category=playback')
  const reportHeading = page.getByRole('heading', { name: 'Tell us what got in the way.', exact: true })
  await expect(reportHeading).toBeFocused()
  await mkdir('.impeccable/review/support-report', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/support-report/report-entry-dark-320x720.png' })
  await page.setViewportSize({ width: 1440, height: 960 })
  await expect(reportHeading).toBeFocused()
  await expectAccessible(page, 'Dark report entry at desktop width')
  await page.screenshot({ animations: 'disabled', fullPage: true, path: '.impeccable/review/support-report/report-entry-dark-1440x960.png' })
  await page.setViewportSize({ width: 320, height: 720 })
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Issue category Playback', exact: true })).toBeFocused()
  await expect(page.locator('[data-filscreen-home]')).toHaveAttribute('data-theme', 'dark')

  const checkbox = page.getByRole('checkbox', { name: 'Include playback diagnostics' })
  await expect(checkbox).toBeVisible()
  await expectCheckboxAccentToMatchTheme(checkbox)
  const summary = page.getByRole('textbox', { name: 'Short summary' })
  const description = page.getByRole('textbox', { name: 'What happened?' })
  const prepareEmail = page.getByRole('link', { name: 'Prepare email' })
  await summary.fill('Bad')
  await expect(summary).toHaveAttribute('aria-invalid', 'true')
  await description.fill('Too short')
  await expect(description).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByText('Use at least 4 characters.', { exact: true })).toBeVisible()
  await expect(page.getByText('Use at least 10 characters.', { exact: true })).toBeVisible()
  await expect(prepareEmail).toHaveCount(0)
  await mkdir('.impeccable/review/support-report', { recursive: true })
  await page.screenshot({ animations: 'disabled', caret: 'hide', fullPage: true, path: '.impeccable/review/support-report/validation-errors-320x720.png' })

  await summary.fill('Episode will not start')
  await description.fill('The episode stays on the loading screen after I press play.')
  await expect(summary).not.toHaveAttribute('aria-invalid', 'true')
  await expect(description).not.toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByText('Use at least 4 characters.', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Use at least 10 characters.', { exact: true })).toHaveCount(0)
  const replyEmail = page.getByRole('textbox', { name: /Reply email/ })
  await replyEmail.fill('not-an-email')
  await expect(replyEmail).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByText('Enter a valid email address or clear this field.')).toBeVisible()
  await expect(prepareEmail).toHaveCount(0)
  await replyEmail.fill('member@example.test')

  await expect(prepareEmail).toBeVisible()
  const draftHrefBeforeConsent = await prepareEmail.getAttribute('href')
  const draftBeforeConsent = new URL(draftHrefBeforeConsent!).searchParams.get('body')!
  expect(draftBeforeConsent).toContain('Category: Playback')
  expect(draftBeforeConsent).not.toContain('Playback diagnostics:')

  await checkbox.focus()
  await page.keyboard.press('Space')
  await expect(checkbox).toBeChecked()
  await expect(page.getByText('Playback diagnostics:', { exact: false })).toBeVisible()
  const draftHrefAfterConsent = await prepareEmail.getAttribute('href')
  const draftAfterConsent = new URL(draftHrefAfterConsent!).searchParams.get('body')!
  expect(draftAfterConsent).toContain('Playback diagnostics:\nTitle: series 1399 · S2 E4\nProvider: configured_source\nBrowser: Chrome\nDelivery: direct\nFailure: network')
  expect(draftAfterConsent).not.toMatch(/cookie|credential|https?:\/\//i)

  await page.getByRole('button', { name: 'Issue category Playback' }).click()
  await page.getByRole('option', { name: 'Account' }).click()
  await expect(checkbox).not.toBeVisible()
  expect(new URL((await prepareEmail.getAttribute('href'))!).searchParams.get('body')).not.toContain('Playback diagnostics:')
  await page.getByRole('button', { name: 'Issue category Account' }).click()
  await page.getByRole('option', { name: 'Playback' }).click()
  await expect(checkbox).not.toBeChecked()
  expect(new URL((await prepareEmail.getAttribute('href'))!).searchParams.get('body')).not.toContain('Playback diagnostics:')
  await checkbox.check()

  const checkboxRow = page.getByText('Include playback diagnostics').locator('..')
  expect((await checkboxRow.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect((await prepareEmail.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await expectAccessible(page, 'The consented dark-theme report flow')

  await mkdir('.impeccable/review/support-report', { recursive: true })
  await page.screenshot({ animations: 'disabled', fullPage: true, path: '.impeccable/review/support-report/playback-report-consent-320x720.png' })
})

test('Report Issue keeps diagnostics consent and validation clear in the light theme on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript(diagnostics => {
    localStorage.setItem('consumit.home-theme', 'light')
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    sessionStorage.setItem('consumit.report.playback', JSON.stringify({ value: diagnostics, at: Date.now() }))
  }, {
    ref: { kind: 'movie', id: 550 },
    provider: 'configured_source',
    browser: 'Chrome',
    delivery: 'direct',
    category: 'network',
  })

  await page.goto('/report-issue?category=playback')
  await expect(page.getByRole('heading', { name: 'Tell us what got in the way.', exact: true })).toBeFocused()
  await expect(page.locator('[data-filscreen-home]')).toHaveAttribute('data-theme', 'light')
  await mkdir('.impeccable/review/support-report', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/support-report/report-entry-light-320x720.png' })
  await page.setViewportSize({ width: 1440, height: 960 })
  await expectAccessible(page, 'Light report entry at desktop width')
  await page.screenshot({ animations: 'disabled', fullPage: true, path: '.impeccable/review/support-report/report-entry-light-1440x960.png' })
  await page.setViewportSize({ width: 320, height: 720 })
  const checkbox = page.getByRole('checkbox', { name: 'Include playback diagnostics' })
  await expect(checkbox).not.toBeChecked()
  await expectCheckboxAccentToMatchTheme(checkbox)
  await expect(page.getByText('Playback diagnostics:', { exact: false })).toHaveCount(0)

  const summary = page.getByRole('textbox', { name: 'Short summary' })
  const description = page.getByRole('textbox', { name: 'What happened?' })
  await summary.fill('Episode will not start')
  await description.fill('The episode stays on the loading screen after I press play.')
  const prepareEmail = page.getByRole('link', { name: 'Prepare email' })
  await expect(prepareEmail).toBeVisible()
  const draft = new URL((await prepareEmail.getAttribute('href'))!).searchParams.get('body')!
  expect(draft).not.toContain('Playback diagnostics:')

  await checkbox.check()
  await expect(page.getByText('Playback diagnostics:', { exact: false })).toBeVisible()
  const checkboxRow = page.getByText('Include playback diagnostics').locator('..')
  expect((await checkboxRow.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect((await prepareEmail.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await expectAccessible(page, 'The consented light-theme report flow')

  await mkdir('.impeccable/review/support-report', { recursive: true })
  await page.screenshot({ animations: 'disabled', fullPage: true, path: '.impeccable/review/support-report/playback-report-light-320x720.png' })
})
