import axe from 'axe-core'
import { mkdir, readFile } from 'node:fs/promises'
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test'
import { defaultExperiencePreferences } from '../../packages/contracts/src/index'

const api = 'http://127.0.0.1:18563'

async function signIn(context: BrowserContext, request: APIRequestContext) {
  const sessionResponse = await request.get(`${api}/__fixtures/session`)
  expect(sessionResponse.ok(), await sessionResponse.text()).toBe(true)
  const { token, member } = await sessionResponse.json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  return member.id as string
}

async function expectAccessible(page: Page, label: string) {
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    })
    return report.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))
  })
  expect(violations, `${label} should meet WCAG 2.2 AA`).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${label} should fit the phone`).toBe(true)
}

async function useLocalMoviePlayback(page: Page) {
  const media = await readFile('tests/playback/media/reference.mp4')
  await page.route('**/v1/playback/attempts', async route => {
    const response = await route.fetch()
    const attempt = await response.json()
    if (attempt.status === 'ready') attempt.session.source.src = 'https://experience-media.example/member-interrupted.mp4'
    await route.fulfill({ response, json: attempt })
  })
  await page.route('https://experience-media.example/member-interrupted.mp4', async route => {
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
}

test.beforeEach(async ({ request }) => { await request.post(`${api}/__fixtures/reset`, { data: {} }) })

test('a signed-in member can retry online Watch recovery without losing the paused checkpoint', async ({ page, context, request }) => {
  const memberId = await signIn(context, request)
  await request.post(`${api}/__fixtures/reset`, {
    data: { memberId, recoveryFailureCount: 1, preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed', communityDismissed: true } },
  })
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  await useLocalMoviePlayback(page)

  await page.goto('/watch/movie/693134')
  const video = page.locator('video')
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).readyState), { timeout: 30_000 }).toBeGreaterThanOrEqual(2)
  await video.evaluate(element => {
    const mediaElement = element as HTMLVideoElement
    mediaElement.currentTime = 12
    return new Promise<void>(resolve => mediaElement.addEventListener('seeked', () => resolve(), { once: true }))
  })
  await video.evaluate(element => (element as HTMLVideoElement).pause())
  await expect.poll(async () => {
    const state = await (await request.get(`${api}/__fixtures/state`)).json()
    return state.progress?.find((entry: { kind: string; id: number }) => entry.kind === 'movie' && entry.id === 693134)?.positionSeconds
  }).toBeGreaterThanOrEqual(12)

  await video.evaluate(element => (element as HTMLVideoElement).dispatchEvent(new Event('error')))
  const recovery = page.getByRole('alertdialog', { name: 'Playback was interrupted' })
  await expect(recovery).toContainText('Your place at 0:12 is saved.')
  await expect(recovery).toContainText('Playback stopped before another source was ready.')
  await expect(recovery).not.toContainText('Your place is saved.')
  const retry = recovery.getByRole('button', { name: 'Try again with Auto', exact: true })
  await expect(retry).toBeVisible()
  expect((await retry.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await expectAccessible(page, 'Online member Watch recovery after automatic retry fails')
  await mkdir('.impeccable/review/watch-journey', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/watch-journey/member-interrupted-retry-320x720.png' })

  await retry.click()
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).readyState), { timeout: 30_000 }).toBeGreaterThanOrEqual(2)
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime), { timeout: 30_000 }).toBeGreaterThanOrEqual(11)
  expect(await video.evaluate(element => (element as HTMLVideoElement).paused)).toBe(true)
  await expect.poll(async () => {
    const state = await (await request.get(`${api}/__fixtures/state`)).json()
    return state.progress?.find((entry: { kind: string; id: number }) => entry.kind === 'movie' && entry.id === 693134)?.positionSeconds
  }).toBeGreaterThanOrEqual(12)
})

test('a signed-in member sees the saved checkpoint once when Auto retry also fails', async ({ page, context, request }) => {
  const memberId = await signIn(context, request)
  await request.post(`${api}/__fixtures/reset`, {
    data: { memberId, recoveryFailureCount: 1, preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed', communityDismissed: true } },
  })
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  await useLocalMoviePlayback(page)

  await page.goto('/watch/movie/693134')
  const video = page.locator('video')
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).readyState), { timeout: 30_000 }).toBeGreaterThanOrEqual(2)
  await video.evaluate(element => {
    const mediaElement = element as HTMLVideoElement
    mediaElement.currentTime = 12
    return new Promise<void>(resolve => mediaElement.addEventListener('seeked', () => resolve(), { once: true }))
  })
  await video.evaluate(element => (element as HTMLVideoElement).pause())
  await expect.poll(async () => {
    const state = await (await request.get(`${api}/__fixtures/state`)).json()
    return state.progress?.find((entry: { kind: string; id: number }) => entry.kind === 'movie' && entry.id === 693134)?.positionSeconds
  }).toBeGreaterThanOrEqual(12)
  await video.evaluate(element => (element as HTMLVideoElement).dispatchEvent(new Event('error')))

  const recovery = page.getByRole('alertdialog', { name: 'Playback was interrupted' })
  await expect(recovery).toContainText('Playback stopped before another source was ready.')
  await expect(recovery).toContainText('Your place at 0:12 is saved.')
  await page.route('**/v1/playback/attempts', async route => {
    const response = await route.fetch()
    const attempt = await response.json()
    await route.fulfill({ response, json: { status: 'exhausted', attemptId: attempt.attemptId, tried: attempt.tried, total: attempt.total } })
  })
  const retry = recovery.getByRole('button', { name: 'Try again with Auto', exact: true })
  await retry.click()
  await expect(recovery).toContainText('The current source couldn’t keep playing.')
  await expect(recovery).toContainText('Your place at 0:12 is saved.')
  await expect(recovery).not.toContainText('Your place is saved.')
  await expectAccessible(page, 'Member Watch recovery after Auto retry also fails')
  await mkdir('.impeccable/review/watch-journey', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/watch-journey/member-retry-exhausted-320x720.png' })
})

test('a signed-in member can retry Auto after startup source discovery is exhausted', async ({ page, context, request }) => {
  const memberId = await signIn(context, request)
  await request.post(`${api}/__fixtures/reset`, {
    data: { memberId, startupFailureCount: 1, startupProgressSeconds: 20, preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed', communityDismissed: true } },
  })
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  await useLocalMoviePlayback(page)

  await page.goto('/watch/movie/693134')
  const startupFailure = page.getByRole('alertdialog', { name: 'Couldn’t start playback' })
  await expect(startupFailure).toContainText('We couldn’t start this title from the available sources.')
  await expect(startupFailure).toContainText('Your place at 0:20 is saved.')
  const recoveryTitle = startupFailure.locator('p[title]')
  await expect(recoveryTitle).toHaveText('Northbound — a remarkably long title for a quiet evening at home')
  expect(await recoveryTitle.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  const retry = startupFailure.getByRole('button', { name: 'Try again with Auto', exact: true })
  await expect(retry).toBeVisible()
  expect((await retry.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  const heading = startupFailure.getByRole('heading', { name: 'Couldn’t start playback', exact: true })
  await expect(heading).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(retry).toBeFocused()
  expect(await retry.evaluate(element => element.matches(':focus-visible'))).toBe(true)
  await expectAccessible(page, 'Member Watch startup recovery after source discovery is exhausted')
  await mkdir('.impeccable/review/watch-journey', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/watch-journey/member-startup-retry-320x720.png' })

  await page.keyboard.press('Enter')
  const video = page.locator('video')
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).readyState), { timeout: 30_000 }).toBeGreaterThanOrEqual(2)
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime), { timeout: 30_000 }).toBeGreaterThanOrEqual(19)
  await video.evaluate(element => (element as HTMLVideoElement).pause())
  expect(await video.evaluate(element => (element as HTMLVideoElement).paused)).toBe(true)
  await expect(startupFailure).toBeHidden()
  await expect(page.getByText('Playing from Consumit')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
