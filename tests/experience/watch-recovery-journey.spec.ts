import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import axe from 'axe-core'

const api = 'http://127.0.0.1:18563'

test.beforeEach(async ({ request }) => {
  await request.post(`${api}/__fixtures/reset`, { data: {} })
})

test('movie discovery reaches a keyboard-contained Watch recovery dialog', async ({ page }) => {
  let attempts = 0
  let retryPending = false
  let releaseRetry: (() => void) | undefined
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript(() => {
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ audioLanguage: 'en', animeAudio: 'sub', subtitlesEnabled: false, subtitleLanguages: ['en'], qualityHeight: null, autoplayNextEpisode: false, guideVersion: 1, guideStatus: 'completed', communityDismissed: false }))
  })
  await page.route('**/v1/playback/attempts', async route => {
    const attempt = attempts++
    if (attempt === 0) {
      await route.fulfill({ status: 503, json: { error: { code: 'PLAYBACK_UNAVAILABLE', message: 'Playback is temporarily unavailable.', retryable: true } } })
      return
    }
    if (attempt === 1) {
      retryPending = true
      await new Promise<void>(resolve => { releaseRetry = resolve })
    }
    await route.fulfill({ status: 503, json: { error: { code: 'PLAYBACK_UNAVAILABLE', message: 'Playback is temporarily unavailable.', retryable: true } } })
  })
  await page.goto('/movies')
  await page.locator('a[href="/title/693134"]').first().click()
  await expect(page).toHaveURL('/title/693134')
  await page.getByRole('link', { name: 'Play', exact: true }).click()
  await expect(page).toHaveURL('/watch/movie/693134')

  const playerHeading = page.locator('[data-player-heading]')
  await expect(playerHeading).toBeVisible()
  expect(await playerHeading.evaluate(element => getComputedStyle(element).fontSize), 'Phone title context should use the compact 18px scale').toBe('18px')

  const recovery = page.getByRole('alertdialog', { name: 'Couldn’t start playback' })
  const heading = recovery.getByRole('heading', { name: 'Couldn’t start playback' })
  const retry = recovery.getByRole('button', { name: 'Try again with Auto' })
  const chooseSource = recovery.getByRole('button', { name: 'Choose a source' })
  const returnToTitle = recovery.getByRole('link', { name: 'Return to title' })
  await expect(recovery).toHaveAttribute('aria-modal', 'true')
  await expect(heading).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(returnToTitle).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(retry).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(chooseSource).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(returnToTitle).toBeFocused()

  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => (await (window as unknown as Window & { axe: typeof axe }).axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  })).violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })))
  expect(violations, 'Watch startup recovery at 320px').toEqual([])
  await mkdir('.impeccable/review/watch-journey', { recursive: true })
  await page.screenshot({ animations: 'disabled', caret: 'initial', path: '.impeccable/review/watch-journey/recovery-focus-320x720.png' })

  await retry.click()
  await expect.poll(() => retryPending).toBe(true)
  const searching = page.getByRole('dialog', { name: 'Finding a source' })
  const searchingHeading = searching.getByRole('heading', { name: 'Finding a source' })
  const cancelSearch = searching.getByRole('button', { name: 'Cancel', exact: true })
  await expect(searching.getByRole('status')).toHaveText('Checking configured sources.')
  await expect(searchingHeading).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(cancelSearch).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(searching.getByRole('button', { name: 'Choose a source', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(cancelSearch).toBeFocused()
  const searchingViolations = await page.evaluate(async () => (await (window as unknown as Window & { axe: typeof axe }).axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  })).violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })))
  expect(searchingViolations, 'Watch source search at 320px').toEqual([])
  await page.screenshot({ animations: 'disabled', caret: 'initial', path: '.impeccable/review/watch-journey/recovery-searching-focus-320x720.png' })
  releaseRetry?.()
  await expect(recovery).toBeVisible()
  await expect(heading).toBeFocused()

  await chooseSource.click()
  const sources = page.getByRole('dialog', { name: 'Sources' })
  await expect(sources).toBeVisible()
  await expect(sources.getByRole('button', { name: 'Close sources' })).toBeFocused()
  const fixtureSource = sources.getByRole('button', { name: 'Server 1', exact: true })
  await expect(fixtureSource).toBeVisible()
  await fixtureSource.click({ timeout: 2_000 })
  await expect(recovery).toBeHidden()
  const video = page.locator('video')
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2)
  await expect(page.getByText('Playing from Consumit')).toBeVisible()
  const sourceChoiceViolations = await page.evaluate(async () => (await (window as unknown as Window & { axe: typeof axe }).axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  })).violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })))
  expect(sourceChoiceViolations, 'Watch after choosing a source from recovery at 320px').toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ animations: 'disabled', caret: 'initial', path: '.impeccable/review/watch-journey/recovery-source-choice-320x720.png' })
})
