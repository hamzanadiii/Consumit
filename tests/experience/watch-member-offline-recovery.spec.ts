import axe from 'axe-core'
import { mkdir, readFile } from 'node:fs/promises'
import { expect, test, type APIRequestContext, type BrowserContext } from '@playwright/test'
import { defaultExperiencePreferences } from '../../packages/contracts/src/index'

const api = 'http://127.0.0.1:18563'

async function signIn(context: BrowserContext, request: APIRequestContext) {
  const { token, member } = await (await request.get(`${api}/__fixtures/session`)).json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  return member.id as string
}

test.beforeEach(async ({ request }) => { await request.post(`${api}/__fixtures/reset`, { data: {} }) })

test('a signed-in member can recover playback and sync the latest checkpoint after going offline', async ({ page, context, request }) => {
  const media = await readFile('tests/playback/media/reference.mp4')
  const memberId = await signIn(context, request)
  await request.post(`${api}/__fixtures/reset`, {
    data: { memberId, preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed', communityDismissed: true } },
  })
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  await page.route('**/v1/playback/attempts', async route => {
    const response = await route.fetch()
    const attempt = await response.json()
    attempt.session.source.src = 'https://experience-media.example/member-offline.mp4'
    await route.fulfill({ response, json: attempt })
  })
  await page.route('https://experience-media.example/member-offline.mp4', async route => {
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

  await page.goto('/watch/movie/693134')
  const video = page.locator('video')
  await expect.poll(() => video.evaluate(element => element.readyState), { timeout: 30_000 }).toBeGreaterThanOrEqual(2)
  const seek = async (position: number) => video.evaluate((element: HTMLVideoElement, nextPosition: number) => {
    element.currentTime = nextPosition
    return new Promise<void>(resolve => element.addEventListener('seeked', () => resolve(), { once: true }))
  }, position)

  await seek(5)
  await video.evaluate(element => element.pause())
  await expect.poll(async () => {
    const state = await (await request.get(`${api}/__fixtures/state`)).json()
    return state.progress?.find((entry: { kind: string; id: number }) => entry.kind === 'movie' && entry.id === 693134)?.positionSeconds
  }).toBeGreaterThanOrEqual(5)

  await context.setOffline(true)
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false)
  await seek(12)
  await video.evaluate(element => element.pause())
  const localKey = `consumit.progress:${memberId}:movie:693134:0:0`
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}').positionSeconds, localKey)).toBeGreaterThanOrEqual(12)
  const syncNotice = page.getByRole('status').filter({ hasText: 'Progress saved on this device' })
  await expect(syncNotice).toBeVisible()
  await expect.poll(async () => {
    const state = await (await request.get(`${api}/__fixtures/state`)).json()
    return state.progress?.find((entry: { kind: string; id: number }) => entry.kind === 'movie' && entry.id === 693134)?.positionSeconds
  }).toBeLessThan(12)

  await video.evaluate(element => element.dispatchEvent(new Event('error')))
  const recovery = page.getByRole('alertdialog', { name: 'Playback was interrupted' })
  await expect(recovery).toContainText('Your device reports it’s offline. Reconnect, then try again with Auto or choose a source.')
  await expect(recovery).toContainText('Your place at 0:12 is saved.')
  await expect(syncNotice).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const recoveryBounds = (await recovery.boundingBox())!
  expect(recoveryBounds.x).toBeGreaterThanOrEqual(0)
  expect(recoveryBounds.x + recoveryBounds.width).toBeLessThanOrEqual(320)

  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return report.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))
  })
  expect(violations, 'signed-in offline Watch recovery at 320px').toEqual([])
  await mkdir('.impeccable/review/watch-journey', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/watch-journey/member-offline-recovery-320x720.png' })

  await context.setOffline(false)
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(true)
  await expect(recovery).toContainText('Your connection is back. Try again with Auto or choose a source.')
  await recovery.getByRole('button', { name: 'Try again with Auto', exact: true }).click()
  await expect.poll(() => video.evaluate(element => element.readyState), { timeout: 30_000 }).toBeGreaterThanOrEqual(2)
  await expect.poll(() => video.evaluate(element => element.currentTime), { timeout: 30_000 }).toBeGreaterThanOrEqual(11)
  expect(await video.evaluate(element => element.paused)).toBe(true)

  await expect(syncNotice).toHaveCount(0)
  await expect.poll(async () => {
    const state = await (await request.get(`${api}/__fixtures/state`)).json()
    return state.progress?.find((entry: { kind: string; id: number }) => entry.kind === 'movie' && entry.id === 693134)?.positionSeconds
  }).toBeGreaterThanOrEqual(12)
})
