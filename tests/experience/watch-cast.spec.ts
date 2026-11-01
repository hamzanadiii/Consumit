import axe from 'axe-core'
import { mkdir, readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

const api = 'http://127.0.0.1:18563'

type CastFixtureWindow = Window & {
  __castTestState?: {
    loadRequests: { currentTime: number; autoplay: boolean; media: { contentId: string; customData: Record<string, unknown> } }[]
    sessionRequests: number
    setRemoteStatus(position: number, playing: boolean): void
  }
}

test.skip(!process.env.NEXT_PUBLIC_CAST_RECEIVER_ID, 'Set NEXT_PUBLIC_CAST_RECEIVER_ID to run the simulated Cast browser flow.')

test.beforeEach(async ({ request }) => {
  await request.post(`${api}/__fixtures/reset`, { data: {} })
})

test('Watch connects only on request and resumes at the TV checkpoint after disconnect', async ({ page, request }) => {
  const media = await readFile('tests/playback/media/reference.mp4')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')

    const contextListeners = new Map<string, (event: { sessionState?: string; castState?: string }) => void>()
    const remoteListeners = new Map<string, () => void>()
    const loadRequests: { currentTime: number; autoplay: boolean; media: { contentId: string; customData: Record<string, unknown> } }[] = []
    const player = { currentTime: 0, duration: 0, isPaused: true, volumeLevel: 0.9, isMuted: false, isConnected: false }
    let currentSession: Record<string, unknown> | null = null
    const emitRemote = () => { for (const listener of remoteListeners.values()) listener() }
    const session = {
      getCastDevice: () => ({ friendlyName: 'Experience TV' }),
      endSession: () => {
        player.isConnected = false
        currentSession = null
        contextListeners.get('session')?.({ sessionState: 'ended' })
        emitRemote()
      },
      loadMedia: async (input: { media: { contentId: string; customData: Record<string, unknown> }; currentTime: number; autoplay: boolean }) => {
        loadRequests.push(input)
        player.currentTime = input.currentTime
        player.duration = 100
        player.isPaused = !input.autoplay
        emitRemote()
      },
    }
    const context = {
      setOptions: () => undefined,
      getCastState: () => 'NOT_CONNECTED',
      getCurrentSession: () => currentSession,
      requestSession: async () => {
        currentSession = session
        player.isConnected = true
        contextListeners.get('session')?.({ sessionState: 'started' })
      },
      addEventListener: (type: string, listener: (event: { sessionState?: string; castState?: string }) => void) => { contextListeners.set(type, listener) },
    }
    const controller = {
      playOrPause: () => { player.isPaused = !player.isPaused; emitRemote() },
      seek: () => emitRemote(),
      setVolumeLevel: () => emitRemote(),
      muteOrUnmute: () => { player.isMuted = !player.isMuted; emitRemote() },
      addEventListener: (type: string, listener: () => void) => { remoteListeners.set(type, listener) },
    }
    const cast = {
      framework: {
        CastContext: { getInstance: () => ({ ...context, addEventListener: context.addEventListener }) },
        RemotePlayer: function () { return player },
        RemotePlayerController: function () { return controller },
        CastContextEventType: { SESSION_STATE_CHANGED: 'session', CAST_STATE_CHANGED: 'cast' },
        SessionState: { SESSION_STARTED: 'started', SESSION_RESUMED: 'resumed', SESSION_ENDED: 'ended' },
        RemotePlayerEventType: { ANY_CHANGE: 'any', IS_CONNECTED_CHANGED: 'connected' },
      },
    }
    const fixtureWindow = window as CastFixtureWindow & { cast?: typeof cast }
    fixtureWindow.cast = cast
    fixtureWindow.__castTestState = {
      loadRequests,
      sessionRequests: 0,
      setRemoteStatus(position, playing) {
        player.currentTime = position
        player.isPaused = !playing
        emitRemote()
      },
    }
    const originalRequestSession = context.requestSession
    context.requestSession = async () => {
      fixtureWindow.__castTestState!.sessionRequests += 1
      await originalRequestSession()
    }
  })
  await page.route('**/v1/playback/attempts', async route => {
    const response = await route.fetch()
    const attempt = await response.json()
    attempt.session.source.src = 'https://experience-media.example/cast.mp4'
    await route.fulfill({ response, json: attempt })
  })
  await page.route('https://experience-media.example/cast.mp4', async route => {
    const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/)
    const start = range ? Math.min(Number(range[1]), media.length - 1) : 0
    const end = range?.[2] ? Math.min(Number(range[2]), media.length - 1) : media.length - 1
    await route.fulfill({
      status: range ? 206 : 200,
      contentType: 'video/mp4',
      headers: {
        'access-control-allow-origin': '*',
        'accept-ranges': 'bytes',
        ...(range ? { 'content-range': `bytes ${start}-${end}/${media.length}` } : {}),
      },
      body: media.subarray(start, end + 1),
    })
  })

  await page.goto('/watch/movie/693134')
  const video = page.locator('video')
  await expect.poll(() => video.evaluate(element => element.readyState)).toBeGreaterThanOrEqual(2)
  await video.evaluate(async element => {
    element.currentTime = 8
    await new Promise<void>(resolve => element.addEventListener('seeked', () => resolve(), { once: true }))
    element.pause()
  })
  await expect.poll(() => video.evaluate(element => element.currentTime)).toBeGreaterThanOrEqual(7.9)
  await expect.poll(() => video.evaluate(element => element.paused)).toBe(true)

  await page.getByRole('button', { name: /^Settings:/ }).click()
  await page.getByRole('button', { name: /Cast to TV/ }).click()
  const castPanel = page.getByRole('dialog', { name: 'Cast to TV' })
  await expect(castPanel).toContainText('A TV is available')
  expect(await page.evaluate(() => (window as CastFixtureWindow).__castTestState!.sessionRequests)).toBe(0)
  const chooseTv = castPanel.getByRole('button', { name: 'Choose TV', exact: true })
  expect((await chooseTv.boundingBox())!.height).toBeGreaterThanOrEqual(44)

  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => {
    const axeApi = (window as Window & { axe: typeof axe }).axe
    const panel = document.querySelector('[role="dialog"]')!
    const report = await axeApi.run(panel, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return report.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))
  })
  expect(violations, 'The Cast picker should meet WCAG 2.2 AA').toEqual([])
  await mkdir('.impeccable/review/watch-journey', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/watch-journey/cast-picker-390x844.png' })

  await chooseTv.click()
  const castStatus = page.locator('[data-consumit-casting]').getByRole('status')
  await expect(castStatus).toContainText('Experience TV')
  await expect.poll(() => page.evaluate(() => (window as CastFixtureWindow).__castTestState!.loadRequests.length)).toBe(1)
  const loadRequest = await page.evaluate(() => (window as CastFixtureWindow).__castTestState!.loadRequests[0])
  if (!loadRequest) throw new Error('Cast did not send media to the TV.')
  expect(Math.abs(loadRequest.currentTime - 8), 'Cast should resume at the paused phone checkpoint').toBeLessThan(0.25)
  expect(loadRequest.autoplay).toBe(false)

  await page.evaluate(() => (window as CastFixtureWindow).__castTestState!.setRemoteStatus(24, true))
  await expect(castStatus).toContainText('0:24 / 1:40')
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Playback resumed on this device at 0:24.' })).toBeVisible()
  await expect(page.locator('[data-consumit-casting]')).toHaveCount(0)
  await expect.poll(() => video.evaluate(element => element.currentTime)).toBeGreaterThanOrEqual(23.5)
  await expect.poll(() => video.evaluate(element => element.paused)).toBe(false)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
