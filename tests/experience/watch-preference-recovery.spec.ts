import axe from 'axe-core'
import { mkdir, readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

import { defaultExperiencePreferences } from '../../packages/contracts/src/index'

const api = 'http://127.0.0.1:18563'

test.beforeEach(async ({ request }) => {
  await request.post(`${api}/__fixtures/reset`, { data: {} })
})

test('Watch keeps playback and the selected preference while account sync recovers', async ({ page, context, request }) => {
  const media = await readFile('tests/playback/media/reference.mp4')
  const { token, member } = await (await request.get(`${api}/__fixtures/session`)).json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  await request.post(`${api}/__fixtures/reset`, {
    data: {
      memberId: member.id,
      preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed', communityDismissed: true },
      saveFailure: true,
    },
  })
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  await page.route('**/v1/playback/attempts', async route => {
    const response = await route.fetch()
    const attempt = await response.json()
    attempt.session.source.src = 'https://experience-media.example/watch-preference.mp4'
    await route.fulfill({ response, json: attempt })
  })
  await page.route('https://experience-media.example/watch-preference.mp4', async route => {
    const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/)
    const start = range ? Math.min(Number(range[1]), media.length - 1) : 0
    const end = range?.[2] ? Math.min(Number(range[2]), media.length - 1) : media.length - 1
    await route.fulfill({
      status: range ? 206 : 200,
      contentType: 'video/mp4',
      headers: { 'access-control-allow-origin': '*', 'accept-ranges': 'bytes', ...(range ? { 'content-range': `bytes ${start}-${end}/${media.length}` } : {}) },
      body: media.subarray(start, end + 1),
    })
  })

  await page.goto('/watch/series/95396?season=1&episode=1')
  const video = page.locator('video')
  const playerStage = page.locator('[data-player-stage]')
  const playerShell = page.locator('[data-consumit-player]')
  const playerSettings = page.getByRole('button', { name: /^Settings:/ })
  const openPlayerSettings = async () => {
    await playerStage.hover()
    await expect(playerShell).toHaveAttribute('data-controls-visible', 'true')
    await expect.poll(() => playerSettings.evaluate(button => {
      const bounds = button.getBoundingClientRect()
      const target = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
      return target === button || button.contains(target)
    }), { message: 'The Settings control should receive a natural pointer hit after the player reveals its controls' }).toBe(true)
    await playerSettings.click()
  }
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).readyState), { timeout: 30_000 }).toBeGreaterThanOrEqual(2)
  await video.evaluate(async element => { const media = element as HTMLVideoElement; media.loop = true; media.currentTime = 2; await media.play() })
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).paused)).toBe(false)

  await openPlayerSettings()
  const autoplay = page.getByRole('switch', { name: 'Autoplay next episode' })
  await expect(autoplay).not.toBeChecked()
  await autoplay.click()

  const alert = page.getByRole('alert').filter({ hasText: 'Your choices are kept on this device.' })
  await expect(alert).toBeVisible()
  await expect(autoplay).toBeChecked()
  await expect(alert).toContainText('Retry to sync them to your account.')
  const closeSettings = page.getByRole('dialog', { name: 'Settings options' }).getByRole('button', { name: 'Close settings' })
  const closeReceivesPointer = await closeSettings.evaluate(button => {
    const bounds = button.getBoundingClientRect()
    const target = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    return target === button || button.contains(target)
  })
  expect(closeReceivesPointer, 'The sync notice must not cover the open Watch settings controls').toBe(true)
  const retry = alert.getByRole('button', { name: 'Retry preference sync', exact: true })
  expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime), { timeout: 5_000 }).toBeGreaterThan(2.5)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    const target = document.querySelector('[data-player-preference-sync]')!
    const report = await axeApi.run(target, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return report.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))
  })
  expect(violations, 'Watch preference recovery should meet WCAG 2.2 AA').toEqual([])
  await mkdir('.impeccable/review/watch-journey', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/watch-journey/preference-sync-recovery-320x720.png' })

  await request.post(`${api}/__fixtures/recover`)
  await retry.click()
  await expect(alert).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Settings options' })).toHaveCount(0)
  await openPlayerSettings()
  await expect(autoplay).toBeChecked()
  const state = await (await request.get(`${api}/__fixtures/state`)).json()
  const saved = state.preferences.find(([owner]: [string, unknown]) => owner === member.id)?.[1]
  expect(saved).toMatchObject({ autoplayNextEpisode: true })
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).paused)).toBe(false)

  await video.evaluate(element => { element.dataset.watchIdentityBeforeAdOptOut = 'playing' })
  await expect(page.locator('script[data-ad-popunder]')).toHaveCount(0)
  const advertisingTab = await context.newPage()
  await advertisingTab.setViewportSize({ width: 320, height: 720 })
  await advertisingTab.goto('/settings#advertising')
  const adSwitch = advertisingTab.locator('#advertising').getByRole('switch', { name: 'Ad status: On' })
  await expect(adSwitch).toBeEnabled()
  await adSwitch.click()
  await expect(advertisingTab.locator('#advertising').getByRole('switch', { name: 'Ad status: Off' })).toBeVisible()

  await expect(video).toHaveAttribute('data-watch-identity-before-ad-opt-out', 'playing')
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).paused)).toBe(false)
  expect(await page.evaluate(() => (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type)).toBe('navigate')
  await advertisingTab.close()
})
