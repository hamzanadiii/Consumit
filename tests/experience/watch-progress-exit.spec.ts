import { expect, test, type APIRequestContext, type BrowserContext } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { defaultExperiencePreferences } from '../../packages/contracts/src/index'

const api = 'http://127.0.0.1:18563'

async function signIn(context: BrowserContext, request: APIRequestContext) {
  const { token, member } = await (await request.get(`${api}/__fixtures/session`)).json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  return member.id as string
}

test.beforeEach(async ({ request }) => { await request.post(`${api}/__fixtures/reset`, { data: {} }) })

test('leaving Watch flushes the newest checkpoint while an earlier account write is pending', async ({ page, context, request }) => {
  const media = await readFile('tests/playback/media/reference.mp4')
  const memberId = await signIn(context, request)
  await request.post(`${api}/__fixtures/reset`, {
    data: { memberId, preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed', communityDismissed: true } },
  })

  let progressWrites = 0
  let releaseFirstWrite!: () => void
  let firstWriteSeen!: () => void
  const firstWriteGate = new Promise<void>(resolve => { releaseFirstWrite = resolve })
  const firstWrite = new Promise<void>(resolve => { firstWriteSeen = resolve })

  await page.route('**/v1/progress', async route => {
    if (route.request().method() !== 'PUT') return route.continue()
    progressWrites += 1
    if (progressWrites === 1) {
      firstWriteSeen()
      await firstWriteGate
      await route.fulfill({ status: 503, json: { error: { code: 'AUTH_STATE_UNAVAILABLE', message: 'Progress sync is unavailable.', retryable: true } } })
      return
    }
    await route.continue()
  })
  await page.route('**/v1/playback/attempts', async route => {
    const response = await route.fetch()
    const attempt = await response.json()
    attempt.session.source.src = 'https://experience-media.example/exit-checkpoint.mp4'
    await route.fulfill({ response, json: attempt })
  })
  await page.route('https://experience-media.example/exit-checkpoint.mp4', async route => {
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

  try {
    await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
    await page.goto('/watch/movie/693134')
    const video = page.locator('video')
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(2)
    const seek = async (position: number) => video.evaluate((element: HTMLVideoElement, nextPosition: number) => {
      element.currentTime = nextPosition
      return new Promise<void>(resolve => element.addEventListener('seeked', () => resolve(), { once: true }))
    }, position)

    await seek(6)
    await firstWrite
    expect(progressWrites).toBe(1)
    await video.evaluate((element: HTMLVideoElement) => element.pause())
    await seek(9)
    expect(progressWrites).toBe(1)

    await page.getByRole('link', { name: 'Back', exact: true }).click()
    await expect(page).toHaveURL('/title/693134')
    await expect.poll(() => progressWrites, { timeout: 8000 }).toBe(2)
    releaseFirstWrite()
    await expect.poll(async () => {
      const state = await (await request.get(`${api}/__fixtures/state`)).json()
      return state.progress?.find((entry: { kind: string; id: number }) => entry.kind === 'movie' && entry.id === 693134)?.positionSeconds
    }).toBeGreaterThanOrEqual(9)

    await page.reload()
    await expect(page.getByRole('link', { name: 'Continue watching', exact: true })).toHaveAttribute('href', '/watch/movie/693134')
  } finally {
    releaseFirstWrite()
  }
})
