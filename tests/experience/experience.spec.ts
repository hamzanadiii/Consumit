import { test, expect, type APIRequestContext, type BrowserContext } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
import axe from 'axe-core'
import { defaultExperiencePreferences } from '../../packages/contracts/src/index'
import { movieSummary } from '../../apps/web/src/test/catalog-fixtures'
const api = 'http://127.0.0.1:18563'
async function signIn(context: BrowserContext, request: APIRequestContext, label?: string) {
  const { token, member } = await (await request.get(`${api}/__fixtures/session${label ? `?label=${label}` : ''}`)).json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  return member.id as string
}
test.beforeEach(async ({ request }) => { await request.post(`${api}/__fixtures/reset`, { data: {} }) })

test('guest welcome is skippable, remembers completion and keeps the browsing destination', async ({ page }) => {
  await page.goto('/movies')
  const welcome = page.getByRole('dialog', { name: 'Welcome to Consumit.' })
  await expect(welcome).toBeVisible()
  await page.getByRole('button', { name: 'Personalize my experience' }).click()
  await expect(page.getByRole('heading', { name: 'Make yourself at home.' })).toBeVisible()
  await page.getByRole('button', { name: 'Movie & series audio' }).click()
  await page.getByRole('option', { name: 'Français', exact: true }).click()
  await page.getByRole('button', { name: 'Save viewing preferences and continue', exact: true }).click()
  await page.getByRole('link', { name: 'Continue without an account' }).click()
  await expect(page.getByRole('link', { name: /Join us on Discord/ })).toHaveAttribute('href', 'https://discord.gg/p7XVyk6vs')
  await page.getByRole('button', { name: 'Start browsing' }).click()
  await expect(page).toHaveURL(/\/movies$/)
  await page.reload(); await expect(welcome).not.toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('consumit.experience.guest.v1')!).audioLanguage)).toBe('fr')
})

test('Watch History actions remain easy to reach on a narrow phone', async ({ page, context, request }) => {
  await signIn(context, request)
  await request.post(`${api}/__fixtures/reset`, { data: { watchHistoryFixture: true } })
  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto('/profile/experience_fixture/history')

  await expect(page.getByRole('heading', { name: 'Watch history', exact: true })).toBeVisible()
  const title = 'Northbound — a remarkably long title for a quiet evening at home'
  await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible()
  const watchAgain = page.getByRole('link', { name: 'Watch again', exact: true })
  const logToDiary = page.getByRole('button', { name: `Log ${title}, Movie, to diary`, exact: true })
  for (const action of [watchAgain, logToDiary]) {
    const box = await action.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0)
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => (await (window as Window & { axe: typeof axe }).axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  })).violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })))
  expect(violations).toEqual([])

  await mkdir('.impeccable/review/profile-archive', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/profile-archive/history-actions-320x720.png' })
  await logToDiary.click()
  const dialog = page.getByRole('dialog', { name: 'Remember this watch' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await expect(dialog.getByLabel('Watched on')).toHaveValue('2026-10-25')
})

test('empty Watch History offers a clear route back to finding titles', async ({ page, context, request }) => {
  await signIn(context, request)
  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto('/profile/experience_fixture/history')

  await expect(page.getByText('Finish a movie or episode in Watch and it will appear here.', { exact: true })).toBeVisible()
  const discover = page.getByRole('link', { name: 'Find something to watch', exact: true })
  await expect(discover).toHaveAttribute('href', '/search')
  const box = await discover.boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => (await (window as Window & { axe: typeof axe }).axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  })).violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })))
  expect(violations).toEqual([])

  await mkdir('.impeccable/review/profile-archive', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/profile-archive/history-empty-320x720.png' })
  await discover.click()
  await expect(page).toHaveURL(/\/search$/)
})

test('Watchlist retries personal ratings without losing saved titles or the active filter', async ({ page, context, request }) => {
  const memberId = await signIn(context, request)
  await request.post(`${api}/__fixtures/reset`, {
    data: { memberId, watchlistFixture: true, preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed' } },
  })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  await page.setViewportSize({ width: 320, height: 720 })

  let lookupCalls = 0
  let releaseFirst!: () => void
  const firstLookup = new Promise<void>(resolve => { releaseFirst = resolve })
  await page.route('**/v1/me/ratings/lookup*', async route => {
    lookupCalls += 1
    if (lookupCalls === 1) {
      await firstLookup
      await route.fulfill({ status: 503, json: { error: { code: 'AUTH_STATE_UNAVAILABLE', message: 'Ratings are temporarily unavailable.', requestId: 'watchlist-ratings', retryable: true } } })
      return
    }
    await route.fulfill({ json: [
      { id: 693134, kind: 'movie', origin: 'native', sourceKey: null, value: 8 },
      { id: 95396, kind: 'series', origin: 'native', sourceKey: null, value: 6 },
    ] })
  })

  await page.goto('/profile/experience_fixture/watchlist')
  const screen = page.locator('[data-consumit-watchlist-screen]')
  async function checkAxe(state: string) {
    const violations = await page.evaluate(async () => {
      const axeApi = (window as Window & { axe: typeof axe }).axe
      const report = await axeApi.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
      return report.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))
    })
    expect(violations, state).toEqual([])
  }
  await expect(screen.getByRole('status')).toContainText('personal rating filters are temporarily unavailable')
  await expect(screen.getByText('2 saved titles')).toBeVisible()
  const kindFilters = screen.getByRole('group', { name: 'Filter Watchlist by title type' })
  await kindFilters.getByRole('button', { name: 'Series' }).click()
  await expect(kindFilters.getByRole('button', { name: 'Series' })).toHaveAttribute('aria-pressed', 'true')
  await expect(screen.getByText('Severance', { exact: true })).toBeVisible()

  await screen.getByRole('button', { name: 'Retry rating lookup', exact: true }).click()
  try {
    await expect(screen.getByRole('button', { name: 'Retrying rating lookup…', exact: true })).toBeDisabled()
  } finally { releaseFirst() }
  await expect(screen.getByText(/Your titles and filters are unchanged/i)).toBeVisible()
  await expect(screen.getByText('Severance', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.addScriptTag({ content: axe.source })
  await checkAxe('Watchlist ratings unavailable at 320px')
  await mkdir('.impeccable/review/profile-watchlist', { recursive: true })
  await page.screenshot({ caret: 'initial', path: '.impeccable/review/profile-watchlist/rating-retry-unavailable-320x720.png', fullPage: true })
  await screen.getByRole('button', { name: 'Retry rating lookup', exact: true }).click()
  await expect(screen.getByText(/Your titles and filters are unchanged/i)).not.toBeVisible()
  await expect(screen.getByText(/Your saved titles are still here/i)).not.toBeVisible()
  await expect(kindFilters.getByRole('button', { name: 'Series' })).toHaveAttribute('aria-pressed', 'true')
  await screen.getByRole('button', { name: 'Shelf', exact: true }).click()
  await expect(screen.locator('[aria-label="Your rating: 6 out of 10"]')).toBeVisible()
  expect(lookupCalls).toBe(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await checkAxe('Watchlist rating recovery at 320px')
  await page.screenshot({ caret: 'initial', path: '.impeccable/review/profile-watchlist/rating-retry-320x720.png', fullPage: true })
})

test('Watched retries unavailable personal ratings without losing the title or rating filter', async ({ page, context, request }) => {
  const memberId = await signIn(context, request)
  await request.post(`${api}/__fixtures/reset`, {
    data: { memberId, watchedArchiveFixture: true, preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed' } },
  })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  await page.setViewportSize({ width: 320, height: 720 })

  let lookupCalls = 0
  await page.route('**/v1/me/ratings/lookup*', async route => {
    lookupCalls += 1
    if (lookupCalls === 1) {
      await route.fulfill({ status: 503, json: { error: { code: 'AUTH_STATE_UNAVAILABLE', message: 'Ratings are temporarily unavailable.', requestId: 'watched-ratings', retryable: true } } })
      return
    }
    await route.fulfill({ json: [] })
  })

  await page.goto('/profile/experience_fixture/films?rating=none')
  const retry = page.getByRole('button', { name: 'Retry rating lookup', exact: true })
  await expect(page.getByText('Your Watched titles are still here, but personal rating filters are temporarily unavailable.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Filter by your rating: No rating' })).toBeVisible()
  const initialBox = await retry.boundingBox()
  expect(initialBox?.height ?? 0).toBeGreaterThanOrEqual(44)

  await page.addScriptTag({ content: axe.source })
  async function checkAxe(state: string) {
    const violations = await page.evaluate(async () => (await (window as Window & { axe: typeof axe }).axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    })).violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })))
    expect(violations, state).toEqual([])
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await checkAxe('Watched rating lookup unavailable at 320px')
  await mkdir('.impeccable/review/profile-archive', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/profile-archive/watched-rating-retry-unavailable-320x720.png', fullPage: true })

  await retry.click()
  await expect(page.getByText(/Your records and filters are unchanged/i)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry rating lookup', exact: true })).toBeVisible()
  await retry.click()
  await expect(page.getByRole('link', { name: 'Northbound — a remarkably long title for a quiet evening at home', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry rating lookup', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Filter by your rating: No rating' })).toBeVisible()
  expect(lookupCalls).toBe(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await checkAxe('Watched rating lookup recovered at 320px')
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/profile-archive/watched-rating-retry-320x720.png', fullPage: true })
})

test('Notifications brings title recommendations, conversation updates and episode reminders together on a phone', async ({ page, context, request }) => {
  await signIn(context, request)
  await page.setViewportSize({ width: 320, height: 720 })
  const episodeId = 'cd35e0d7-32d2-4e80-94dc-12f89d3c9771'
  let episodeRead = false
  let socialRead = false
  let socialWrites = 0
  let libraryWrites = 0
  let recommendationWrites = 0
  let recommendationResponse: string | null = null
  const episode = {
    ref: { kind: 'series', id: 95396, season: 2, episode: 4 },
    title: 'Quiet Shore episode reminder', episodeTitle: 'A new beginning', imageUrl: null,
    releasedAt: '2026-10-27T00:00:00.000Z', datePrecision: 'date', checkedAt: '2026-10-28T12:00:00.000Z',
  }
  await page.route('**/v1/me/notifications?*', route => route.fulfill({ json: {
    items: [{ id: episodeId, episode, createdAt: '2026-10-28T12:00:00.000Z', readAt: episodeRead ? '2026-10-28T13:00:00.000Z' : null }],
    unreadCount: episodeRead ? 0 : 1, nextCursor: null,
  } }))
  await page.route(`**/v1/me/notifications/${episodeId}`, async route => {
    episodeRead = true
    await route.fulfill({ status: 204 })
  })
  await page.route('**/v1/me/notifications/read-all', async route => {
    episodeRead = true
    await route.fulfill({ status: 204 })
  })
  await page.route('**/v1/taste/notifications', route => route.fulfill({ json: { items: [
    { id: 'experience-social-notice', text: 'A curator replied to your review.', href: '/reviews/experience-review', createdAt: '2026-10-28T12:00:00.000Z', read: socialRead },
  ], nextCursor: null } }))
  await page.route('**/v1/taste/notifications/read-all', async route => {
    socialWrites += 1
    if (socialWrites === 1) await route.fulfill({ status: 503 })
    else { socialRead = true; await route.fulfill({ status: 204 }) }
  })
  await page.route('**/v1/taste/recommendations', route => route.fulfill({ json: { items: [
    { id: 'experience-title-recommendation', title: { kind: 'movie', id: 693134 }, sender: { id: 'curator', username: 'curator', name: 'A curator', avatarUrl: null }, response: recommendationResponse, createdAt: '2026-10-28T12:00:00.000Z' },
  ], nextCursor: null } }))
  await page.route('**/v1/me/library/titles/movie/693134', async route => {
    libraryWrites += 1
    await route.fulfill({ status: 204 })
  })
  await page.route('**/v1/taste/recommendations/experience-title-recommendation/response', async route => {
    recommendationWrites += 1
    if (recommendationWrites === 1) {
      await route.fulfill({ status: 503 })
      return
    }
    recommendationResponse = (route.request().postDataJSON() as { response: string }).response
    await route.fulfill({ status: 204 })
  })
  await page.route('**/v1/titles/batch?*', route => route.fulfill({ json: {
    items: [{ id: 693134, kind: 'movie', backdropUrl: null, genreNames: [], logoUrl: null, originalTitle: 'Northbound', overview: '', popularity: 0, posterUrl: null, releaseDate: null, title: 'Northbound', tmdbRating: 8.2, tmdbVoteCount: 2200, year: 2024 }],
    missing: [], meta: { fetchedAt: '2026-10-28T12:00:00.000Z', language: 'en-US', region: 'US', source: 'tmdb', stale: false },
  } }))

  await page.goto('/notifications')
  await expect(page.getByRole('heading', { name: 'Titles recommended to you' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'A curator replied to your review.' })).toHaveAttribute('href', '/reviews/experience-review')
  await expect(page.getByRole('link', { name: /Quiet Shore episode reminder.*Season 2.*Episode 4.*Playback checked/ })).toHaveAttribute('href', '/watch/series/95396?season=2&episode=4')
  const social = page.locator('section.taste').filter({ has: page.getByRole('heading', { name: 'Conversations & curators' }) })
  const socialNotice = social.locator('.taste-social-notice')
  const socialTextBounds = await socialNotice.getByRole('link', { name: 'A curator replied to your review.' }).boundingBox()
  const socialDateBounds = await socialNotice.locator('time').boundingBox()
  expect(socialDateBounds!.y).toBeGreaterThanOrEqual(socialTextBounds!.y + socialTextBounds!.height + 4)
  const socialMarkAll = social.getByRole('button', { name: 'Mark all read' })
  expect((await socialMarkAll.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await socialMarkAll.click()
  await expect(social.getByRole('alert')).toContainText('The account service is temporarily unavailable. Try again.')
  await expect(social.getByRole('link', { name: 'A curator replied to your review.' })).toBeVisible()
  await social.getByRole('button', { name: 'Retry marking all read' }).click()
  await expect(social.getByText('All conversations are marked read.')).toBeVisible()
  await expect(social.getByRole('button', { name: 'Mark all read' })).toBeDisabled()

  const episodeSection = page.locator('section[aria-labelledby="notifications-title"]')
  const markRead = episodeSection.getByRole('button', { name: 'Mark read' })
  expect((await markRead.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await markRead.click()
  await expect(episodeSection.getByRole('button', { name: 'Mark read' })).toHaveCount(0)
  const saveRecommendation = page.getByRole('button', { name: 'Save', exact: true })
  expect((await saveRecommendation.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await saveRecommendation.click()
  await expect(page.getByText('The account service is temporarily unavailable. Try again.')).toBeVisible()
  await page.getByRole('button', { name: 'Retry saving Northbound' }).click()
  await expect(page.getByText('Saved to your Watchlist.')).toBeVisible()
  expect(libraryWrites).toBe(2)
  expect(recommendationWrites).toBe(2)
  const recommendedTitle = page.getByRole('link', { name: 'Movie details: Northbound' })
  await expect(recommendedTitle).toHaveAttribute('href', '/title/693134')
  const fallbackTitle = recommendedTitle.locator('.taste-poster-art > span')
  await expect(fallbackTitle).toHaveText('N')
  expect(await fallbackTitle.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await expect(page.getByRole('link', { name: 'Northbound', exact: true })).toHaveAttribute('href', '/title/693134')

  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => {
    const axeApi = (window as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return report.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))
  })
  expect(violations, 'Notifications should meet WCAG 2.2 AA').toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await mkdir('.impeccable/review/notifications', { recursive: true })
  await page.screenshot({ animations: 'disabled', fullPage: true, path: '.impeccable/review/notifications/inbox-320x720.png' })
  await page.getByRole('link', { name: /Quiet Shore episode reminder.*Season 2.*Episode 4.*Playback checked/ }).click()
  await expect(page).toHaveURL('/watch/series/95396?season=2&episode=4')
  await page.goBack()
  await expect(page).toHaveURL('/notifications')
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-consumit-theme', 'light')
  await expect(page.getByRole('heading', { name: 'Titles recommended to you' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Northbound', exact: true })).toBeVisible()
  await expect(page.locator('section[aria-labelledby="notifications-title"]').getByRole('button', { name: 'Mark read' })).toHaveCount(0)
  await page.addScriptTag({ content: axe.source })
  const lightViolations = await page.evaluate(async () => {
    const axeApi = (window as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return report.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))
  })
  expect(lightViolations, 'Light desktop Notifications should meet WCAG 2.2 AA').toEqual([])
  await mkdir('.impeccable/review/notifications', { recursive: true })
  await page.screenshot({ animations: 'disabled', fullPage: true, path: '.impeccable/review/notifications/inbox-light-1440x960.png' })
})

test('Notifications retries initial failures into honest empty states', async ({ page, context, request }) => {
  await signIn(context, request)
  await page.setViewportSize({ width: 390, height: 844 })
  let episodeReads = 0
  let socialReads = 0
  let recommendationReads = 0
  let holdInitialFailures = true
  let releaseInitialFailures!: () => void
  const initialFailureGate = new Promise<void>(resolve => { releaseInitialFailures = resolve })
  await page.route('**/v1/me/notifications?*', async route => {
    episodeReads += 1
    if (holdInitialFailures) { await initialFailureGate; await route.fulfill({ status: 503 }) }
    else await route.fulfill({ json: { items: [], unreadCount: 0, nextCursor: null } })
  })
  await page.route('**/v1/taste/notifications', async route => {
    socialReads += 1
    if (holdInitialFailures) { await initialFailureGate; await route.fulfill({ status: 503 }) }
    else await route.fulfill({ json: { items: [], nextCursor: null } })
  })
  await page.route('**/v1/taste/recommendations', async route => {
    recommendationReads += 1
    if (holdInitialFailures) { await initialFailureGate; await route.fulfill({ status: 503 }) }
    else await route.fulfill({ json: { items: [], nextCursor: null } })
  })

  await page.goto('/notifications')
  const social = page.locator('section.taste').filter({ has: page.getByRole('heading', { name: 'Conversations & curators' }) })
  const recommendations = page.locator('section.taste').filter({ has: page.getByRole('heading', { name: 'Titles recommended to you' }) })
  const episodes = page.locator('section[aria-labelledby="notifications-title"]')
  await expect(social.getByRole('status')).toHaveText('Loading social notifications…')
  await expect(recommendations.getByRole('status')).toHaveText('Loading title recommendations…')
  await expect(episodes.getByText('Reading notifications…')).toBeVisible()
  releaseInitialFailures()
  await expect(social.getByRole('alert')).toContainText('The account service is temporarily unavailable. Try again.')
  await expect(recommendations.getByRole('alert')).toContainText('The account service is temporarily unavailable. Try again.')
  await expect(page.locator('[role="alert"]').filter({ hasText: 'Episode updates are temporarily unavailable.' })).toBeVisible()
  holdInitialFailures = false

  await social.getByRole('button', { name: 'Retry loading updates' }).click()
  await recommendations.getByRole('button', { name: 'Retry loading recommendations' }).click()
  await episodes.getByRole('button', { name: 'Try again' }).click()
  await expect(social.getByText('Replies and updates you subscribe to will appear here.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Titles recommended to you' })).toHaveCount(0)
  await expect(episodes.getByText(/No episode notifications yet/)).toBeVisible()

  await episodes.getByRole('button', { name: 'Unread' }).click()
  await expect(episodes.getByText('You’re all caught up. No unread episode updates.')).toBeVisible()
  expect(episodeReads).toBeGreaterThanOrEqual(3)
  expect(socialReads).toBeGreaterThanOrEqual(2)
  expect(recommendationReads).toBeGreaterThanOrEqual(2)
  await mkdir('.impeccable/review/notifications', { recursive: true })
  await page.screenshot({ animations: 'disabled', fullPage: true, path: '.impeccable/review/notifications/inbox-empty-390x844.png' })
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => {
    const axeApi = (window as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return report.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))
  })
  expect(violations, 'Recovered empty Notifications should meet WCAG 2.2 AA').toEqual([])
})

test('Notifications paginates each inbox independently and retries the same cursor', async ({ page, context, request }) => {
  await signIn(context, request)
  await page.setViewportSize({ width: 390, height: 844 })
  const episodeCursor = 'cd35e0d7-32d2-4e80-94dc-12f89d3c9701'
  const socialCursor = 'cd35e0d7-32d2-4e80-94dc-12f89d3c9702'
  const recommendationCursor = 'cd35e0d7-32d2-4e80-94dc-12f89d3c9703'
  const cursorReads = { episode: [] as Array<string | null>, social: [] as Array<string | null>, recommendations: [] as Array<string | null> }
  const failedCursorReads = new Set<string>()
  const episodeView = (number: number) => ({
    ref: { kind: 'series', id: 95396, season: 2, episode: number },
    title: `Quiet Shore episode ${number}`, episodeTitle: null, imageUrl: null,
    releasedAt: `2026-10-${String(27 + number - 4).padStart(2, '0')}T00:00:00.000Z`, datePrecision: 'date', checkedAt: '2026-10-28T12:00:00.000Z',
  })
  const socialNotice = (number: number) => ({ id: `cd35e0d7-32d2-4e80-94dc-12f89d3c97${String(10 + number).padStart(2, '0')}`, text: `Curator update page ${number}.`, href: `/reviews/review-page-${number}`, createdAt: '2026-10-28T12:00:00.000Z', read: false })
  const recommendation = (number: number) => ({ id: `cd35e0d7-32d2-4e80-94dc-12f89d3c98${String(10 + number).padStart(2, '0')}`, title: { kind: 'movie', id: number === 1 ? 693134 : 550 }, sender: { id: 'cd35e0d7-32d2-4e80-94dc-12f89d3c9800', username: 'curator', name: 'Film Friend', avatarUrl: null }, response: null, createdAt: '2026-10-28T12:00:00.000Z' })
  const failOnce = async (key: string, route: import('@playwright/test').Route) => {
    if (failedCursorReads.has(key)) return false
    failedCursorReads.add(key)
    await route.fulfill({ status: 503 })
    return true
  }
  await page.route('**/v1/me/notifications?*', async route => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor')
    cursorReads.episode.push(cursor)
    if (cursor === episodeCursor && await failOnce(`episode:${cursor}`, route)) return
    await route.fulfill({ json: cursor
      ? { items: [{ id: 'cd35e0d7-32d2-4e80-94dc-12f89d3c9712', episode: episodeView(5), createdAt: '2026-10-28T12:00:00.000Z', readAt: null }], unreadCount: 2, nextCursor: null }
      : { items: [{ id: 'cd35e0d7-32d2-4e80-94dc-12f89d3c9711', episode: episodeView(4), createdAt: '2026-10-28T12:00:00.000Z', readAt: null }], unreadCount: 1, nextCursor: episodeCursor } })
  })
  await page.route('**/v1/taste/notifications*', async route => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor')
    cursorReads.social.push(cursor)
    if (cursor === socialCursor && await failOnce(`social:${cursor}`, route)) return
    await route.fulfill({ json: cursor ? { items: [socialNotice(2)], nextCursor: null } : { items: [socialNotice(1)], nextCursor: socialCursor } })
  })
  await page.route('**/v1/taste/recommendations*', async route => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor')
    cursorReads.recommendations.push(cursor)
    if (cursor === recommendationCursor && await failOnce(`recommendations:${cursor}`, route)) return
    await route.fulfill({ json: cursor ? { items: [recommendation(2)], nextCursor: null } : { items: [recommendation(1)], nextCursor: recommendationCursor } })
  })
  await page.route('**/v1/titles/batch?*', async route => {
    const refs = new URL(route.request().url()).searchParams.get('refs')?.split(',') ?? []
    const items = refs.map(value => {
      const id = Number(value.split(':')[1])
      const title = id === 693134 ? 'Northbound' : 'The Arrival'
      return { id, kind: 'movie', backdropUrl: null, genreNames: [], logoUrl: null, originalTitle: title, overview: '', popularity: 0, posterUrl: null, releaseDate: null, title, tmdbRating: 8.2, tmdbVoteCount: 2200, year: 2024 }
    })
    await route.fulfill({ json: { items, missing: [], meta: { fetchedAt: '2026-10-28T12:00:00.000Z', language: 'en-US', region: 'US', source: 'tmdb', stale: false } } })
  })

  await page.goto('/notifications')
  const episodes = page.locator('section[aria-labelledby="notifications-title"]')
  const social = page.locator('section.taste').filter({ has: page.getByRole('heading', { name: 'Conversations & curators' }) })
  const recommendations = page.locator('section.taste').filter({ has: page.getByRole('heading', { name: 'Titles recommended to you' }) })
  await expect(page.getByRole('link', { name: /Quiet Shore episode 4/ })).toBeVisible()
  await expect(social.getByRole('link', { name: 'Curator update page 1.' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Northbound', exact: true })).toBeVisible()

  await episodes.getByRole('button', { name: 'Next' }).click()
  await expect(episodes.getByRole('alert')).toContainText('Episode updates are temporarily unavailable.')
  await expect(page.getByRole('link', { name: /Quiet Shore episode 4/ })).toBeVisible()
  await episodes.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('link', { name: /Quiet Shore episode 5/ })).toBeVisible()
  await episodes.getByRole('button', { name: 'Previous' }).click()
  await expect(page.getByRole('link', { name: /Quiet Shore episode 4/ })).toBeVisible()

  await social.getByRole('button', { name: 'More updates' }).click()
  await expect(social.getByRole('alert')).toContainText('The account service is temporarily unavailable. Try again.')
  await expect(social.getByRole('link', { name: 'Curator update page 1.' })).toBeVisible()
  await social.getByRole('button', { name: 'Retry loading more updates' }).click()
  await expect(social.getByRole('link', { name: 'Curator update page 2.' })).toBeVisible()
  await expect(social.getByRole('link', { name: 'Curator update page 1.' })).toBeVisible()

  await recommendations.getByRole('button', { name: 'More recommendations' }).click()
  await expect(recommendations.getByRole('alert')).toContainText('The account service is temporarily unavailable. Try again.')
  await expect(recommendations.getByRole('link', { name: 'Northbound', exact: true })).toBeVisible()
  await recommendations.getByRole('button', { name: 'Retry loading recommendations' }).click()
  await expect(recommendations.getByRole('link', { name: 'The Arrival', exact: true })).toBeVisible()
  await expect(recommendations.getByRole('link', { name: 'Northbound', exact: true })).toBeVisible()
  expect(cursorReads.episode.filter(cursor => cursor !== null)).toEqual([episodeCursor, episodeCursor])
  expect(cursorReads.social.filter(cursor => cursor !== null)).toEqual([socialCursor, socialCursor])
  expect(cursorReads.recommendations.filter(cursor => cursor !== null)).toEqual([recommendationCursor, recommendationCursor])
})

test('first-visit welcome waits through private Profile, Watchlist, Library and Settings tasks', async ({ page, context, request }) => {
  const memberId = await signIn(context, request)
  await request.post(`${api}/__fixtures/reset`, { data: { memberId, preferences: { ...defaultExperiencePreferences(), guideVersion: 0, guideStatus: 'pending' } } })
  await page.addInitScript(() => localStorage.removeItem('consumit.share-welcome-dismissed.v1'))
  await page.setViewportSize({ width: 390, height: 844 })
  const current = await context.request.get(`${api}/v1/me`)
  const member = (await current.json()).member

  await page.goto(`/profile/${member.username}`)
  await expect(page.getByRole('heading', { name: member.username, exact: true })).toBeVisible()
  const welcome = page.getByRole('dialog', { name: 'Welcome to Consumit.' })
  await expect(welcome).not.toBeVisible()
  const sections = page.getByRole('navigation', { name: `${member.username} profile sections` })
  await sections.getByRole('link', { name: 'Watchlist', exact: true }).click()
  await expect(page).toHaveURL(`/profile/${member.username}/watchlist`)
  await expect(welcome).not.toBeVisible()

  await page.goto('/library')
  await expect(page).toHaveURL(`/profile/${member.username}/history`)
  await expect(page.getByRole('heading', { name: 'Watch history', exact: true })).toBeVisible()
  await expect(welcome).not.toBeVisible()

  await page.goto('/settings#playback')
  await expect(page.getByRole('main').locator('#playback')).toBeVisible()
  await expect(welcome).not.toBeVisible()
  await page.goto('/movies')
  await expect(welcome).toBeVisible()
  await expect(welcome).toHaveJSProperty('open', true)
  const welcomeBox = await welcome.boundingBox()
  expect(welcomeBox!.x).toBeGreaterThanOrEqual(12)
  expect(welcomeBox!.x + welcomeBox!.width).toBeLessThanOrEqual(378)
  expect(welcomeBox!.height).toBeLessThanOrEqual(812)
  for (const button of [
    welcome.getByRole('button', { name: 'Close welcome', exact: true }),
    welcome.getByRole('button', { name: 'Start exploring', exact: true }),
    welcome.getByRole('button', { name: 'Personalize my experience', exact: true }),
  ]) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await mkdir('.impeccable/review/experience', { recursive: true })
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/experience/private-first-welcome-390x844.png' })
})

test('direct Watch applies saved preferences before resolving without a welcome interruption', async ({ page, request }) => {
  await page.route('**/v1/subtitles?*', route => route.fulfill({ json: { subtitles: [{ id: 'fr', label: 'French', language: 'fr', url: 'https://experience-media.example/french.vtt', format: 'vtt' }] } }))
  await page.route('https://experience-media.example/french.vtt', route => route.fulfill({ contentType: 'text/vtt', headers: { 'access-control-allow-origin': '*' }, body: 'WEBVTT\n\n00:00:00.000 --> 00:00:30.000\nSous-titres de démonstration.\n' }))
  await page.addInitScript(() => localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ audioLanguage: 'ar', animeAudio: 'sub', subtitlesEnabled: true, subtitleLanguages: ['ar', 'fr', 'en'], qualityHeight: 1080, autoplayNextEpisode: false, guideVersion: 0, guideStatus: 'pending', communityDismissed: false })))
  await page.goto('/watch/movie/693134')
  await expect(page.getByRole('dialog', { name: 'Welcome to Consumit.' })).not.toBeVisible()
  await expect.poll(async () => (await (await request.get(`${api}/__fixtures/state`)).json()).requests.length).toBe(1)
  const state = await (await request.get(`${api}/__fixtures/state`)).json()
  expect(state.requests[0]).toMatchObject({ audioLanguage: 'ar', preferences: { audioLanguage: 'ar', qualityHeight: 1080 } })
  await expect(page.locator('[data-consumit-player-caption]')).toHaveText('Sous-titres de démonstration.')
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => [...video.textTracks].find(track => track.language === 'fr')?.mode)).toBe('hidden')
})

test('a member can reopen an existing title review from discovery without losing the Watch destination', async ({ page, context, request }) => {
  const memberId = await signIn(context, request)
  await request.post(`${api}/__fixtures/reset`, {
    data: {
      memberId,
      startupProgressSeconds: 11,
      preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed' },
    },
  })
  await page.setViewportSize({ width: 320, height: 700 })
  await page.addInitScript(() => {
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    localStorage.setItem('consumit.browsing-notice.ads.dismissed.v1', 'true')
    localStorage.setItem('consumit.browsing-notice.feedback.dismissed.v1', 'true')
  })

  const title = 'Northbound — a remarkably long title for a quiet evening at home'
  const review = {
    body: 'The pauses make the final scene land.',
    id: 693134,
    kind: 'movie',
    origin: 'native',
    reviewId: 'experience-owned-review',
    reviewedOn: '2026-09-09',
    sourceKey: null,
    tags: ['quiet'],
  }
  await page.route('**/v1/me/titles/movie/693134', route => route.fulfill({ json: {
    like: { id: 693134, kind: 'movie', origin: 'native', sourceKey: null },
    rating: { id: 693134, kind: 'movie', origin: 'native', sourceKey: null, value: 8 },
    review,
    saved: true,
    watched: true,
  } }))
  await page.route('**/v1/taste/drafts/**', route => route.fulfill({ json: { revision: 0, data: {} } }))
  await page.route('**/v1/taste/reviews/experience-owned-review', route => route.fulfill({ json: {
    author: { avatarUrl: null, id: memberId, name: 'experience_fixture', username: 'experience_fixture' },
    body: review.body,
    createdAt: '2026-09-09T12:00:00.000Z',
    episode: null,
    id: 693134,
    kind: 'movie',
    liked: false,
    likes: 0,
    owner: true,
    rating: 8,
    reviewId: review.reviewId,
    revision: 3,
    season: null,
    spoiler: false,
  } }))

  await page.goto('/movies')
  await page.locator('a[href="/title/693134"]').first().click()
  const shelf = page.locator('[data-consumit-member-shelf]')
  await expect(shelf.getByRole('button', { name: `Mark ${title} as not watched` })).toHaveAttribute('aria-pressed', 'true')
  await expect(shelf.getByRole('button', { name: `Unlike ${title}` })).toHaveAttribute('aria-pressed', 'true')
  await expect(shelf.getByRole('button', { name: `Remove ${title} from library` })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('radio', { name: 'Rate 4 out of 5 stars' })).toBeChecked()

  const editReview = shelf.getByRole('button', { name: 'Edit review', exact: true })
  await expect(editReview).toBeVisible()
  expect((await editReview.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await editReview.click()
  const dialog = page.getByRole('dialog', { name: 'Edit your review' })
  await expect(dialog.getByLabel('Your review')).toHaveValue(review.body)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => (await (window as Window & { axe: typeof axe }).axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  })).violations.map(violation => violation.id))
  expect(violations).toEqual([])
  await mkdir('.impeccable/review/title-journey', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/title-journey/member-review-edit-320x700.png' })
  await dialog.getByRole('button', { name: 'Save draft & close' }).click()
  await expect(page.getByRole('link', { name: 'Continue watching', exact: true })).toHaveAttribute('href', '/watch/movie/693134')
})

test('movie discovery, Watch return and Continue watching preserve the saved checkpoint', async ({ page }) => {
  const checkpoint = 11
  const media = await readFile('tests/playback/media/reference.mp4')
  await mkdir('.impeccable/review/watch-journey', { recursive: true })
  await page.route('**/v1/playback/attempts', async route => {
    const response = await route.fetch()
    const attempt = await response.json()
    attempt.session.source.src = 'https://experience-media.example/resume.mp4'
    await route.fulfill({ response, json: attempt })
  })
  await page.route('https://experience-media.example/resume.mp4', async route => {
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
  await page.addInitScript((position) => {
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ audioLanguage: 'en', animeAudio: 'sub', subtitlesEnabled: false, subtitleLanguages: ['en'], qualityHeight: null, autoplayNextEpisode: false, guideVersion: 1, guideStatus: 'completed', communityDismissed: false }))
    localStorage.setItem('consumit.progress:guest:movie:693134:0:0', JSON.stringify({ kind: 'movie', id: 693134, positionSeconds: position, durationSeconds: 1000, completed: false, updatedAt: '2026-10-27T12:00:00.000Z' }))
  }, checkpoint)

  await page.goto('/movies')
  await page.locator('a[href="/title/693134"]').first().click()
  await expect(page).toHaveURL(/\/title\/693134$/)
  const activityLink = page.getByRole('link', { name: 'Sign in to view your activity', exact: true })
  await expect(activityLink).toHaveAttribute('href', '/sign-in?next=%2Ftitle%2F693134')
  await activityLink.click()
  await expect(page).toHaveURL('/sign-in?next=%2Ftitle%2F693134')
  await page.goBack()
  await expect(page).toHaveURL(/\/title\/693134$/)
  const titleScore = page.locator('[data-consumit-title-masthead] strong').filter({ hasText: '8.2' })
  await expect(titleScore).toHaveCount(1)
  await expect(titleScore).not.toContainText('★')
  await expect(titleScore.locator('svg')).toHaveCount(1)
  await page.setViewportSize({ width: 390, height: 844 })
  await mkdir('.impeccable/review/title-journey', { recursive: true })
  await page.screenshot({ fullPage: true, path: '.impeccable/review/title-journey/movie-title-390x844.png' })
  await page.setViewportSize({ width: 320, height: 700 })
  const titleSections = page.locator('[data-consumit-tabs]').first()
  await expect(titleSections.getByRole('link', { name: 'Overview', exact: true })).toBeVisible()
  await expect(titleSections.getByRole('link', { name: 'Reviews', exact: true })).toBeVisible()
  await expect(page.locator('[data-consumit-tabs-scroll-cue]')).toHaveCount(0)
  const overviewTab = titleSections.getByRole('link', { name: 'Overview', exact: true })
  const reviewsTab = titleSections.getByRole('link', { name: 'Reviews', exact: true })
  await reviewsTab.click()
  await expect(page).toHaveURL('/title/693134#reviews')
  await expect(page.getByRole('heading', { name: 'Reviews', exact: true })).toBeInViewport()
  await expect(reviewsTab).toHaveAttribute('aria-current', 'location')
  await expect(overviewTab).not.toHaveAttribute('aria-current')
  await page.screenshot({ fullPage: true, path: '.impeccable/review/title-journey/movie-reviews-tab-active-320x700.png' })
  await page.goBack()
  await expect(page).toHaveURL('/title/693134')
  await expect(overviewTab).toHaveAttribute('aria-current', 'location')
  const narrowContinueLink = page.getByRole('link', { name: 'Continue watching', exact: true })
  const narrowContinueBounds = await narrowContinueLink.boundingBox()
  expect(narrowContinueBounds!.height).toBeGreaterThanOrEqual(44)
  expect(narrowContinueBounds!.x).toBeGreaterThanOrEqual(0)
  expect(narrowContinueBounds!.x + narrowContinueBounds!.width).toBeLessThanOrEqual(320)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ fullPage: true, path: '.impeccable/review/title-journey/movie-title-320x700.png' })
  await page.setViewportSize({ width: 390, height: 844 })

  const continueLink = page.getByRole('link', { name: 'Continue watching', exact: true })
  await expect(continueLink).toHaveAttribute('href', '/watch/movie/693134')
  await continueLink.click()
  await expect(page).toHaveURL(/\/watch\/movie\/693134$/)
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThanOrEqual(checkpoint)

  const player = page.locator('[data-consumit-player]').first()
  for (const [width, height] of [[320, 700], [390, 844], [844, 390]] as const) {
    await page.setViewportSize({ width, height })
    await player.hover()
    await expect(player).toBeVisible()
    await expect(page.getByRole('button', { name: 'Captions', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Settings: audio, speed, brightness', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (height > width) {
      const stageTop = await player.locator('[data-player-stage]').evaluate(element => Math.round(element.getBoundingClientRect().top))
      expect(stageTop).toBeLessThanOrEqual(16)
    }
    await page.screenshot({ path: `.impeccable/review/watch-journey/${width}x${height}.png` })
  }

  await page.setViewportSize({ width: 390, height: 844 })
  await player.hover()
  const backToTitle = page.getByRole('link', { name: 'Back', exact: true })
  await expect(backToTitle).toHaveAttribute('href', '/title/693134')
  const backTarget = await backToTitle.boundingBox()
  expect(backTarget?.width).toBeGreaterThanOrEqual(44)
  expect(backTarget?.height).toBeGreaterThanOrEqual(44)
  await backToTitle.click()
  await expect(page).toHaveURL(/\/title\/693134$/)

  const savedProgress = await page.evaluate(() => JSON.parse(localStorage.getItem('consumit.progress:guest:movie:693134:0:0') ?? 'null')) as { positionSeconds?: number } | null
  expect(savedProgress?.positionSeconds).toBeGreaterThanOrEqual(checkpoint)
  const continueWatching = page.getByRole('link', { name: 'Continue watching', exact: true })
  await expect(continueWatching).toHaveAttribute('href', '/watch/movie/693134')
  const continueTarget = await continueWatching.boundingBox()
  expect(continueTarget?.height).toBeGreaterThanOrEqual(44)
  await continueWatching.click()
  await expect(page).toHaveURL(/\/watch\/movie\/693134$/)
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThanOrEqual(savedProgress!.positionSeconds!)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: '.impeccable/review/watch-journey/return-and-resume-390x844.png' })
})

test('a member can retry the same failed Not interested choice in next-watch recommendations', async ({ page, context, request }) => {
  const memberId = await signIn(context, request)
  const preferences = { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed' as const, communityDismissed: true }
  await request.post(`${api}/__fixtures/reset`, { data: { memberId, preferences } })
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript(({ owner, seed }) => {
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    localStorage.setItem(`consumit.progress:${owner}:movie:${seed.id}:0:0`, JSON.stringify({
      kind: 'movie', id: seed.id, completed: true, positionSeconds: 600, durationSeconds: 600,
      updatedAt: '2026-10-27T12:00:00.000Z',
    }))
  }, { owner: memberId, seed: movieSummary })

  const suggestion = { ...movieSummary, id: 550, originalTitle: 'Arrival', title: 'Arrival' }
  let dismissWrites = 0
  let dismissed = false
  await page.route(`**/v1/titles/movie/${movieSummary.id}`, async route => {
    const response = await route.fetch()
    const payload = await response.json()
    payload.item.recommendations = [suggestion]
    await route.fulfill({ response, json: payload })
  })
  await page.route('**/v1/me/recommendation-dismissals', async route => {
    const method = route.request().method()
    if (method === 'GET') {
      await route.fulfill({ json: { items: dismissed ? [{ kind: 'movie', id: suggestion.id }] : [] } })
      return
    }
    if (method === 'PUT') {
      dismissWrites += 1
      if (dismissWrites === 1) {
        await route.fulfill({ status: 503, json: { error: { code: 'AUTH_STATE_UNAVAILABLE', message: 'Recommendation choices could not be saved.', requestId: 'recommendation-dismissal', retryable: true } } })
        return
      }
      dismissed = true
    } else {
      dismissed = false
    }
    await route.fulfill({ status: 204 })
  })
  await page.route('**/v1/me/recommendations/filter', async route => {
    await route.fulfill({ json: { items: route.request().postDataJSON().items } })
  })

  await mkdir('.impeccable/review/home-resilience', { recursive: true })
  await page.goto('/')
  const recommendations = page.getByRole('region', { name: 'Your recommendations' })
  const suggestionLink = recommendations.getByRole('link', { name: suggestion.title, exact: true })
  await expect(suggestionLink).toHaveAttribute('href', '/title/550')
  const notInterested = recommendations.getByRole('button', { name: 'Not interested in Arrival' })
  const target = await notInterested.boundingBox()
  expect(target?.width ?? 0).toBeGreaterThanOrEqual(44)
  expect(target?.height ?? 0).toBeGreaterThanOrEqual(44)

  await page.addScriptTag({ content: axe.source })
  async function checkAxe(state: string) {
    const violations = await page.evaluate(async () => (await (window as Window & { axe: typeof axe }).axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    })).violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })))
    expect(violations, state).toEqual([])
  }

  await notInterested.click()
  await expect(recommendations.getByRole('alert')).toContainText('Your recommendation choice could not sync. Try again.')
  await expect(suggestionLink).toBeVisible()
  await checkAxe('failed next-watch choice')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/home-resilience/member-recommendation-retry-320x720.png' })

  await recommendations.getByRole('button', { name: 'Retry Not interested' }).click()
  await expect(suggestionLink).not.toBeVisible()
  await expect(recommendations.getByText('Hidden.')).toBeVisible()
  await expect(recommendations.getByRole('button', { name: 'Undo' })).toBeVisible()
  expect(dismissWrites).toBe(2)
  await checkAxe('retried next-watch choice')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/home-resilience/member-recommendation-hidden-320x720.png' })
})

test('a member can browse a category when next-watch recommendations have no matches', async ({ page, context, request }) => {
  const memberId = await signIn(context, request)
  const preferences = { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed' as const, communityDismissed: true }
  await request.post(`${api}/__fixtures/reset`, { data: { memberId, preferences } })
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript(({ owner, seed }) => {
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    localStorage.setItem('consumit.browsing-notice.ads.dismissed.v1', 'true')
    localStorage.setItem('consumit.browsing-notice.feedback.dismissed.v1', 'true')
    localStorage.setItem(`consumit.progress:${owner}:movie:${seed.id}:0:0`, JSON.stringify({
      kind: 'movie', id: seed.id, completed: true, positionSeconds: 600, durationSeconds: 600,
      updatedAt: '2026-10-27T12:00:00.000Z',
    }))
  }, { owner: memberId, seed: movieSummary })
  await page.route('**/v1/me/watch-history**', route => route.fulfill({ json: { items: [], nextCursor: null } }))
  await page.route('**/v1/me/recommendation-dismissals', route => route.fulfill({ json: { items: [] } }))
  await page.route(`**/v1/titles/movie/${movieSummary.id}`, async route => {
    const response = await route.fetch()
    const payload = await response.json()
    payload.item.recommendations = []
    await route.fulfill({ response, json: payload })
  })

  await mkdir('.impeccable/review/home-resilience', { recursive: true })
  await page.goto('/')
  const recommendations = page.getByRole('region', { name: 'Your recommendations' })
  await expect(recommendations.getByText('No titles fit your recent watches yet.')).toBeVisible()
  const categories = [
    recommendations.getByRole('link', { name: 'Browse movies' }),
    recommendations.getByRole('link', { name: 'Browse series' }),
    recommendations.getByRole('link', { name: 'Browse anime' }),
  ]
  for (const category of categories) {
    const bounds = await category.boundingBox()
    expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(44)
    expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(0)
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(320)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => (await (window as Window & { axe: typeof axe }).axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  })).violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })))
  expect(violations).toEqual([])
  await recommendations.scrollIntoViewIfNeeded()
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/home-resilience/no-personalized-matches-320x720.png' })
  await categories[2]!.click()
  await expect(page).toHaveURL('/anime')
})

test('title detail keeps its identity when artwork is unavailable and omits empty destinations', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await page.route(/\/_next\/image(?:\?|$)/, route => route.abort())
  await page.addInitScript((preferences) => {
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    localStorage.setItem('consumit.experience.guest.v1', JSON.stringify(preferences))
  }, { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed', communityDismissed: true })
  await mkdir('.impeccable/review/title-journey', { recursive: true })

  await page.goto('/title/693134')
  const movieHero = page.locator('[data-consumit-title-masthead]')
  await expect(movieHero.getByRole('heading', { level: 1, name: 'Northbound — a remarkably long title for a quiet evening at home' })).toBeVisible()
  await expect(movieHero.locator('[data-consumit-title-backdrop-fallback]')).toBeVisible()
  const movieSections = page.locator('[data-consumit-tabs]').first()
  await expect(movieSections.getByRole('link', { name: 'Cast & crew', exact: true })).toHaveCount(0)
  await expect(movieSections.getByRole('link', { name: 'Related', exact: true })).toHaveCount(0)
  await expect(page.locator('#cast')).toHaveCount(0)
  await expect(page.locator('#related')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ animations: 'disabled', fullPage: true, path: '.impeccable/review/title-journey/movie-artwork-unavailable-320x700.png' })

  await page.goto('/series/95396')
  const seriesSections = page.locator('[data-consumit-tabs]').first()
  await expect(seriesSections.getByRole('link', { name: 'Cast & crew', exact: true })).toHaveCount(0)
  await expect(seriesSections.getByRole('link', { name: 'Related', exact: true })).toHaveCount(0)
  await expect(page.locator('#cast')).toHaveCount(0)
  await expect(page.locator('section[aria-labelledby="series-related-heading"]')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ animations: 'disabled', fullPage: true, path: '.impeccable/review/title-journey/series-empty-metadata-320x700.png' })

  await page.goto('/anime/8')
  const animeSections = page.locator('[data-consumit-tabs]').first()
  await expect(animeSections.getByRole('link', { name: 'Characters', exact: true })).toHaveCount(0)
  await expect(page.locator('#cast')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ animations: 'disabled', fullPage: true, path: '.impeccable/review/title-journey/anime-empty-characters-320x700.png' })
})

test('guests can read visible public reviews from a title and its review archive', async ({ page, request }) => {
  const reset = await request.post(`${api}/__fixtures/reset`, { data: { reviewFixture: true, titleReviewFixture: true } })
  expect(reset.ok(), await reset.text()).toBe(true)
  await page.addInitScript((preferences) => {
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    localStorage.setItem('consumit.experience.guest.v1', JSON.stringify(preferences))
  }, { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed' })

  await page.goto('/title/693134')
  await expect(page.getByText('The quiet scenes carry the story.')).toBeVisible()
  const discussionLink = page.getByRole('link', { name: 'Read and discuss', exact: true }).first()
  await expect(discussionLink).toHaveAttribute('href', '/reviews/experience-review')

  await page.goto('/title/693134/reviews')
  await expect(page.locator('[data-consumit-title-reviews]')).toBeVisible()
  await expect(page.locator('[data-consumit-title-reviews]').getByRole('heading', { name: 'Northbound — a remarkably long title for a quiet evening at home reviews' })).toBeVisible()
  await expect(page.getByText('The quiet scenes carry the story.')).toBeVisible()
  await page.getByRole('link', { name: 'Read and discuss', exact: true }).first().click()
  await expect(page).toHaveURL(/\/reviews\/experience-review$/)
  await expect(page.locator('.taste-review-body')).toContainText('The final image brings those small moments together')
})

test('guest review archives paginate populated movie, series, and anime feeds', async ({ page, request }) => {
  const reset = await request.post(`${api}/__fixtures/reset`, { data: { reviewFixture: true, titleReviewFixture: true } })
  expect(reset.ok(), await reset.text()).toBe(true)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript((preferences) => {
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    localStorage.setItem('consumit.experience.guest.v1', JSON.stringify(preferences))
  }, { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed' })
  await page.addInitScript({ content: axe.source })

  const archives = [
    { route: '/title/693134/reviews', titleRoute: '/title/693134', label: 'Movie' },
    { route: '/series/95396/reviews', titleRoute: '/series/95396', label: 'Series' },
    { route: '/anime/8/reviews', titleRoute: '/anime/8', label: 'Anime' },
  ]
  for (const { route, titleRoute, label } of archives) {
    await page.goto(titleRoute)
    const firstReview = label === 'Movie' ? 'The quiet scenes carry the story.' : `${label} public review 1.`
    await expect(page.getByText(firstReview).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Reviews', exact: true })).toBeVisible()
    const browseAll = page.getByRole('link', { name: 'Browse all 11 public reviews' })
    await expect(browseAll).toHaveAttribute('href', route)
    await browseAll.click()
    await expect(page).toHaveURL(route)
    await expect(page.locator('[data-consumit-title-reviews]')).toBeVisible()
    const archive = page.locator('[data-consumit-title-reviews]')
    await expect(archive).toBeVisible()
    await expect(archive.getByRole('heading', { level: 2 })).toContainText(/reviews$/)
    await expect(archive).toContainText('11 public reviews.')
    await expect(archive).not.toContainText(/member reviews/i)
    await expect(archive.locator('article')).toHaveCount(10)
    await expect(archive.getByText(label === 'Movie' ? 'The quiet scenes carry the story.' : `${label} public review 1.`)).toBeVisible()
    await expect(archive.getByText(`${label} public review 10.`)).toBeVisible()
    await expect(archive.getByText(`${label} public review 11.`)).toHaveCount(0)
    await expect(archive.getByRole('status')).toHaveText('Page 1 of 2')

    const violations = await page.evaluate(async () => {
      const axeApi = (window as Window & { axe: typeof axe }).axe
      const report = await axeApi.run(document.querySelector('[data-consumit-title-reviews]')!, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      })
      return report.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))
    })
    expect(violations, `${label} review archive should meet WCAG 2.2 AA`).toEqual([])

    const next = archive.getByRole('link', { name: 'Next →' })
    await expect(next).toHaveAttribute('href', /page=2/)
    if (label === 'Anime') await page.setViewportSize({ width: 320, height: 720 })
    await next.click()
    await expect(page).toHaveURL(/page=2/)
    await expect(archive.getByRole('status')).toHaveText('Page 2 of 2')
    await expect(archive.locator('article')).toHaveCount(1)
    await expect(archive.getByText(`${label} public review 11.`)).toBeVisible()
    await expect(archive.getByText(`${label} public review 10.`)).toHaveCount(0)
    const previous = archive.getByRole('link', { name: '← Previous' })
    await expect(previous).toHaveAttribute('href', /page=1/)
    if (label === 'Anime') {
      for (const action of [previous]) expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await mkdir('.impeccable/review/public-title-reviews', { recursive: true })
      await page.screenshot({ animations: 'disabled', path: '.impeccable/review/public-title-reviews/anime-320x720.png', fullPage: true })
      await page.setViewportSize({ width: 390, height: 844 })
    }
  }

  const emptyReset = await request.post(`${api}/__fixtures/reset`, { data: {} })
  expect(emptyReset.ok(), await emptyReset.text()).toBe(true)
  await page.goto('/title/693134/reviews')
  const emptyArchive = page.locator('[data-consumit-title-reviews]')
  await expect(emptyArchive.getByRole('heading', { name: 'No public reviews yet' })).toBeVisible()
  await expect(emptyArchive).toContainText('Members can share a review from the title page.')
  await expect(emptyArchive).not.toContainText(/member reviews/i)
})

test('member playback progress survives a new browser context and resumes from the title', async ({ page, context, request, browser }) => {
  const checkpoint = 5
  const media = await readFile('tests/playback/media/reference.mp4')
  const memberId = await signIn(context, request)
  await request.post(`${api}/__fixtures/reset`, {
    data: { memberId, preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed', communityDismissed: true } },
  })

  const addMediaRoutes = async (target: typeof page) => {
    await target.route('**/v1/playback/attempts', async route => {
      const response = await route.fetch()
      const attempt = await response.json()
      attempt.session.source.src = 'https://experience-media.example/member-resume.mp4'
      await route.fulfill({ response, json: attempt })
    })
    await target.route('https://experience-media.example/member-resume.mp4', async route => {
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

  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  await addMediaRoutes(page)
  await page.goto('/movies')
  await page.locator('a[href="/title/693134"]').first().click()
  await expect(page).toHaveURL(/\/title\/693134$/)
  await page.getByRole('link', { name: 'Play', exact: true }).click()
  await expect(page).toHaveURL(/\/watch\/movie\/693134$/)
  const video = page.locator('video')
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThanOrEqual(2)
  await video.evaluate((el: HTMLVideoElement) => { el.currentTime = 5; return new Promise<void>(resolve => el.addEventListener('seeked', () => { el.pause(); resolve() }, { once: true })) })
  await expect.poll(async () => {
    const state = await (await request.get(`${api}/__fixtures/state`)).json()
    return state.progress?.find((entry: { kind: string; id: number }) => entry.kind === 'movie' && entry.id === 693134)?.positionSeconds
  }).toBeGreaterThanOrEqual(checkpoint)

  const otherContext = await browser.newContext()
  try {
    await signIn(otherContext, request)
    const otherPage = await otherContext.newPage()
    await otherPage.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
    await addMediaRoutes(otherPage)
    await otherPage.goto('/movies')
    await otherPage.locator('a[href="/title/693134"]').first().click()
    await expect(otherPage).toHaveURL(/\/title\/693134$/)
    const resume = otherPage.getByRole('link', { name: 'Continue watching', exact: true })
    await expect(resume).toHaveAttribute('href', '/watch/movie/693134')
    await resume.click()
    await expect(otherPage).toHaveURL(/\/watch\/movie\/693134$/)
    await expect.poll(() => otherPage.locator('video').evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThanOrEqual(checkpoint)
  } finally {
    await otherContext.close()
  }
})

test('series resume names the exact episode and restores it on another device', async ({ page, context, request, browser }) => {
  const seriesId = 95396
  const season = 2
  const episode = 4
  const checkpoint = 5
  const media = await readFile('tests/playback/media/reference.mp4')
  const memberId = await signIn(context, request)
  await request.post(`${api}/__fixtures/reset`, {
    data: { memberId, preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed', communityDismissed: true } },
  })

  const addMediaRoutes = async (target: typeof page) => {
    await target.route('**/v1/playback/attempts', async route => {
      const response = await route.fetch()
      const attempt = await response.json()
      attempt.session.source.src = 'https://experience-media.example/series-resume.mp4'
      await route.fulfill({ response, json: attempt })
    })
    await target.route('https://experience-media.example/series-resume.mp4', async route => {
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

  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  await addMediaRoutes(page)
  await page.goto(`/watch/series/${seriesId}?season=${season}&episode=${episode}`)
  const video = page.locator('video')
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(2)
  await video.evaluate((element: HTMLVideoElement, checkpoint: number) => {
    element.currentTime = checkpoint
    return new Promise<void>(resolve => element.addEventListener('seeked', () => { element.pause(); resolve() }, { once: true }))
  }, checkpoint)
  await expect.poll(async () => {
    const state = await (await request.get(`${api}/__fixtures/state`)).json()
    return state.progress?.find((entry: { kind: string; id: number; season?: number; episode?: number }) => entry.kind === 'series' && entry.id === seriesId && entry.season === season && entry.episode === episode)?.positionSeconds
  }).toBeGreaterThanOrEqual(checkpoint)

  const otherContext = await browser.newContext()
  try {
    await signIn(otherContext, request)
    const otherPage = await otherContext.newPage()
    await otherPage.setViewportSize({ width: 320, height: 720 })
    await otherPage.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
    await addMediaRoutes(otherPage)
    await otherPage.goto(`/series/${seriesId}`)
    const resume = otherPage.getByRole('link', { name: `Continue watching Season ${season} · Episode ${episode}` })
    await expect(resume).toBeVisible()
    await resume.scrollIntoViewIfNeeded()
    await expect(resume).toContainText(`Season ${season} · Episode ${episode}`)
    const bounds = await resume.boundingBox()
    expect(bounds!.height).toBeGreaterThanOrEqual(44)
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320)
    expect(await otherPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await otherPage.addScriptTag({ content: axe.source })
    const violations = await otherPage.evaluate(async () => {
      const axeApi = (window as Window & { axe: typeof axe }).axe
      const link = document.querySelector('main[data-consumit-series-detail] a[href*="season=2&episode=4"]')!
      const report = await axeApi.run(link, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
      return report.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))
    })
    expect(violations, 'The series resume action should meet WCAG 2.2 AA').toEqual([])
    await mkdir('.impeccable/review/watch-journey', { recursive: true })
    await otherPage.screenshot({ path: '.impeccable/review/watch-journey/series-exact-resume-320x720.png', fullPage: true })
    await resume.click()
    await expect(otherPage).toHaveURL(`/watch/series/${seriesId}?season=${season}&episode=${episode}`)
    await expect.poll(() => otherPage.locator('video').evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThanOrEqual(checkpoint)
    await otherPage.locator('video').hover()
    await expect(otherPage.locator('[data-player-title]')).toContainText(`S${season} · E${episode}`)
    await mkdir('.impeccable/review/watch-journey', { recursive: true })
    await otherPage.screenshot({ animations: 'disabled', path: '.impeccable/review/watch-journey/series-exact-watch-context-320x720.png' })
  } finally {
    await otherContext.close()
  }
})

test('member can retry a paused Watch checkpoint when account sync fails', async ({ page, context, request }) => {
  const media = await readFile('tests/playback/media/reference.mp4')
  const memberId = await signIn(context, request)
  await request.post(`${api}/__fixtures/reset`, {
    data: { memberId, preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed', communityDismissed: true } },
  })
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  let progressWrites = 0
  await page.route('**/v1/progress', async route => {
    if (route.request().method() !== 'PUT') return route.continue()
    progressWrites += 1
    if (progressWrites < 3) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'AUTH_STATE_UNAVAILABLE', message: 'Progress sync is unavailable.', retryable: true } }),
      })
    }
    return route.continue()
  })
  await page.route('**/v1/playback/attempts', async route => {
    const response = await route.fetch()
    const attempt = await response.json()
    attempt.session.source.src = 'https://experience-media.example/progress-sync.mp4'
    await route.fulfill({ response, json: attempt })
  })
  await page.route('https://experience-media.example/progress-sync.mp4', async route => {
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
  await mkdir('.impeccable/review/watch-journey', { recursive: true })

  await page.goto('/watch/movie/693134')
  const video = page.locator('video')
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(2)
  await video.evaluate((element: HTMLVideoElement) => {
    element.currentTime = 5
    return new Promise<void>(resolve => element.addEventListener('seeked', () => { element.pause(); resolve() }, { once: true }))
  })
  const syncStatus = page.getByRole('status').filter({ hasText: 'Progress saved on this device' })
  await expect(syncStatus).toBeVisible()
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => {
    const axeApi = (window as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document.querySelector('[data-player-toast]')!, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    })
    return report.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))
  })
  expect(violations, 'Watch progress sync recovery should meet WCAG 2.2 AA').toEqual([])
  const retry = page.getByRole('button', { name: 'Retry account sync', exact: true })
  const bounds = await retry.boundingBox()
  expect(bounds!.height).toBeGreaterThanOrEqual(44)
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/watch-journey/progress-sync-retry-320x720.png' })

  await retry.click()
  await expect.poll(() => progressWrites).toBe(2)
  await expect(syncStatus).toBeVisible()
  const retryAgain = page.getByRole('button', { name: 'Retry account sync', exact: true })
  await expect(retryAgain).toBeEnabled()
  await retryAgain.click()
  await expect.poll(() => progressWrites).toBe(3)
  await expect(syncStatus).not.toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('a completed member watch announces private follow-up choices from discovery through the title', async ({ page, context, request }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const memberId = await signIn(context, request)
  await request.post(`${api}/__fixtures/reset`, {
    data: { memberId, preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed', communityDismissed: true } },
  })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  await page.goto('/movies')
  await page.locator('a[href="/title/693134"]').first().click()
  await expect(page).toHaveURL(/\/title\/693134$/)
  const play = page.getByRole('link', { name: 'Play', exact: true })
  await expect(play).toHaveAttribute('href', '/watch/movie/693134')
  await play.click()
  await expect(page).toHaveURL(/\/watch\/movie\/693134$/)
  const video = page.locator('video')
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThanOrEqual(2)
  await video.evaluate((el: HTMLVideoElement) => { el.currentTime = Math.max(0, el.duration - 0.2); return el.play() })
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.ended), { timeout: 15_000 }).toBe(true)
  const announcement = page.getByRole('status').filter({ hasText: 'Playback finished. Optional private follow-up actions are available.' })
  await expect(announcement).toBeAttached()
  const followUp = page.getByRole('region', { name: 'After watching', exact: true })
  await expect(followUp).toBeVisible()
  await expect(page.locator('[data-consumit-player-pause]')).toHaveCount(0)
  await expect(followUp.getByRole('button', { name: 'Rate this title' })).toBeVisible()
  await expect(followUp.getByRole('button', { name: 'Add to Diary' })).toBeVisible()
  await expect(followUp.getByRole('button', { name: 'Write a review' })).toBeVisible()
  await expect(followUp.getByRole('button', { name: 'Not now' })).toBeVisible()
  await expect(video).toBeVisible()
  for (const action of ['Rate this title', 'Add to Diary', 'Write a review', 'Not now']) {
    const box = await followUp.getByRole('button', { name: action }).boundingBox()
    expect(box!.height, `${action} touch target`).toBeGreaterThanOrEqual(44)
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  }
  const bounds = await followUp.boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
  await mkdir('.impeccable/review/watch-journey', { recursive: true })
  await page.screenshot({ path: '.impeccable/review/watch-journey/post-watch-390x844.png' })
  await page.setViewportSize({ width: 320, height: 844 })
  for (const action of ['Rate this title', 'Add to Diary', 'Write a review', 'Not now']) {
    const box = await followUp.getByRole('button', { name: action }).boundingBox()
    expect(box!.height, `${action} narrow-phone touch target`).toBeGreaterThanOrEqual(44)
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(320)
  }
  const narrowBounds = await followUp.boundingBox()
  expect(narrowBounds!.x + narrowBounds!.width).toBeLessThanOrEqual(320)
  await page.screenshot({ path: '.impeccable/review/watch-journey/post-watch-320x844.png' })
})

test('a completed guest watch announces the end without implying a private member record', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ audioLanguage: 'en', animeAudio: 'sub', subtitlesEnabled: false, subtitleLanguages: ['en'], qualityHeight: null, autoplayNextEpisode: false, guideVersion: 1, guideStatus: 'completed', communityDismissed: true }))
  })
  await page.goto('/movies')
  await page.locator('a[href="/title/693134"]').first().click()
  await expect(page).toHaveURL(/\/title\/693134$/)
  const play = page.getByRole('link', { name: 'Play', exact: true })
  await expect(play).toHaveAttribute('href', '/watch/movie/693134')
  await play.click()
  await expect(page).toHaveURL(/\/watch\/movie\/693134$/)
  const video = page.locator('video')
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThanOrEqual(2)
  await video.evaluate((el: HTMLVideoElement) => { el.currentTime = Math.max(0, el.duration - 0.2); return el.play() })
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.ended), { timeout: 15_000 }).toBe(true)
  await expect(page.getByRole('status').filter({ hasText: 'Playback finished.' })).toBeAttached()
  await expect(page.getByRole('region', { name: 'After watching', exact: true })).toHaveCount(0)
})

test('a guest finale announces episode completion from the series detail without member-only actions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ audioLanguage: 'en', animeAudio: 'sub', subtitlesEnabled: false, subtitleLanguages: ['en'], qualityHeight: null, autoplayNextEpisode: false, guideVersion: 1, guideStatus: 'completed', communityDismissed: true }))
  })
  await page.goto('/series/95396')
  await expect(page.getByRole('heading', { name: 'Episodes', level: 2 })).toBeVisible()
  await page.getByRole('button', { name: 'Season Season 1 · 9 episodes' }).click()
  await page.getByRole('option', { name: 'Season 2 · 10 episodes' }).click()
  await page.getByRole('button', { name: 'Go to next episode page' }).click()
  const finale = page.getByRole('link', { name: /^Watch Episode 10:/ })
  await expect(finale).toHaveAttribute('href', '/watch/series/95396?season=2&episode=10')
  await finale.click()
  await expect(page).toHaveURL(/\/watch\/series\/95396\?season=2&episode=10$/)
  const video = page.locator('video')
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThanOrEqual(2)
  await video.evaluate((el: HTMLVideoElement) => { el.currentTime = Math.max(0, el.duration - 0.2); return el.play() })
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.ended), { timeout: 15_000 }).toBe(true)
  await expect(page.getByRole('status').filter({ hasText: 'Episode finished.' })).toBeAttached()
  await expect(page.getByRole('region', { name: 'After watching', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Next episode', exact: true })).toHaveCount(0)
  const finaleMessage = page.getByRole('group', { name: 'Episode finished' })
  await expect(finaleMessage.getByText('Episode finished.', { exact: true })).toBeVisible()
  const returnToSeries = finaleMessage.getByRole('link', { name: 'Return to series', exact: true })
  await expect(returnToSeries).toHaveAttribute('href', '/series/95396?season=2&episode=10#episode-2-10')
  await mkdir('.impeccable/review/watch-journey', { recursive: true })
  for (const [width, height] of [[390, 844], [320, 844]] as const) {
    await page.setViewportSize({ width, height })
    const panelBounds = await finaleMessage.boundingBox()
    const returnBounds = await returnToSeries.boundingBox()
    const controlRowBounds = await page.locator('[data-player-control-row]').boundingBox()
    expect(panelBounds!.x).toBeGreaterThanOrEqual(0)
    expect(panelBounds!.x + panelBounds!.width).toBeLessThanOrEqual(width)
    expect(panelBounds!.y + panelBounds!.height).toBeLessThanOrEqual(controlRowBounds!.y)
    expect(returnBounds!.height).toBeGreaterThanOrEqual(44)
    expect(returnBounds!.x + returnBounds!.width).toBeLessThanOrEqual(width)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `.impeccable/review/watch-journey/guest-series-finale-${width}x${height}.png` })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await returnToSeries.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/series/95396?season=2&episode=10#episode-2-10')
  await expect(page.getByRole('button', { name: 'Season Season 2 · 10 episodes' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Episode pages' }).getByRole('button', { name: 'Go to episode page 2' })).toHaveAttribute('aria-current', 'page')
  const restoredFinale = page.getByRole('link', { name: /^Watch Episode 10:/ })
  await expect(restoredFinale).toBeVisible()
  await expect(restoredFinale).toBeInViewport()
  const restoredCard = page.locator('#episode-2-10')
  await expect(restoredCard).toBeInViewport()
  expect((await restoredCard.boundingBox())!.y).toBeGreaterThanOrEqual(64)
  await expect(restoredCard).toBeFocused()
  await page.screenshot({ path: '.impeccable/review/watch-journey/guest-series-return-390x844.png' })
  await page.setViewportSize({ width: 320, height: 844 })
  await expect(restoredCard).toBeInViewport()
  expect((await restoredCard.boundingBox())!.y).toBeGreaterThanOrEqual(64)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: '.impeccable/review/watch-journey/guest-series-return-320x844.png' })
})

test('Anime discovery recovers related titles and opens a touch-safe exact episode', async ({ page }) => {
  const media = await readFile('tests/playback/media/reference.mp4')
  const animeSummary = {
    anilistId: 8,
    kind: 'anime' as const,
    titles: { preferred: 'Evening stories', english: null, romaji: null, native: null },
    format: 'TV' as const,
    status: 'RELEASING' as const,
    season: null,
    seasonYear: 2026,
    episodes: 10,
    episodeDuration: 24,
    genres: ['Drama'],
    coverImage: { url: null, color: null },
    bannerImage: null,
    averageScore: null,
    popularity: 0,
    description: 'A quiet, deterministic anime fixture for browser experience coverage.',
    nextAiringEpisode: null,
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ audioLanguage: 'en', animeAudio: 'sub', subtitlesEnabled: false, subtitleLanguages: ['en'], qualityHeight: null, autoplayNextEpisode: false, guideVersion: 1, guideStatus: 'completed', communityDismissed: true }))
  })
  await page.route('**/v1/anime/8/relations', route => route.fulfill({ json: {
    main: animeSummary,
    relations: [{ type: 'SEQUEL', anime: { ...animeSummary, anilistId: 9, titles: { ...animeSummary.titles, preferred: 'Evening stories: The next chapter' } } }],
  } }))
  await page.route('**/v1/playback/attempts', async route => {
    const response = await route.fetch()
    const attempt = await response.json()
    attempt.session.source.src = 'https://experience-media.example/anime.mp4'
    await route.fulfill({ response, json: attempt })
  })
  await page.route('https://experience-media.example/anime.mp4', async route => {
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

  await page.goto('/anime')
  await page.getByRole('link', { name: 'Evening stories', exact: true }).first().click()
  await expect(page).toHaveURL('/anime/8')
  await expect(page.getByRole('heading', { name: 'Evening stories', exact: true })).toBeVisible()
  const retryRelated = page.getByRole('button', { name: 'Retry related anime', exact: true })
  await retryRelated.focus()
  await page.keyboard.press('Enter')
  const sequel = page.locator('#related a[href="/anime/9"]')
  await expect(sequel).toBeFocused()

  await page.setViewportSize({ width: 320, height: 700 })
  const firstEpisode = page.locator('[data-filscreen-episode-card]').first()
  const playEpisode = firstEpisode.getByRole('link', { name: 'Play episode', exact: true })
  await expect(firstEpisode.getByRole('heading', { name: 'First light' })).toBeVisible()
  const actionBounds = await playEpisode.boundingBox()
  expect(actionBounds!.height).toBeGreaterThanOrEqual(44)
  expect(actionBounds!.x).toBeGreaterThanOrEqual(0)
  expect(actionBounds!.x + actionBounds!.width).toBeLessThanOrEqual(320)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await mkdir('.impeccable/review/title-journey', { recursive: true })
  await firstEpisode.screenshot({ path: '.impeccable/review/title-journey/anime-episode-320x700.png' })
  await playEpisode.click()
  await expect(page).toHaveURL('/watch/anime/8?episode=1')
  const video = page.locator('video')
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: '.impeccable/review/title-journey/anime-watch-320x700.png' })
})

test('profile reviews and lists keep Community discovery one step away', async ({ page, context, request }) => {
  await mkdir('.impeccable/review/profile-community', { recursive: true })
  const memberId = await signIn(context, request)
  await request.post(`${api}/__fixtures/reset`, {
    data: { memberId, preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed', communityDismissed: true } },
  })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  await page.goto('/profile/experience_fixture')

  const sections = page.getByRole('navigation', { name: 'experience_fixture profile sections' })
  await sections.getByRole('link', { name: 'Reviews' }).click()
  await expect(page).toHaveURL(/\/profile\/experience_fixture\/reviews$/)
  await expect(page.getByRole('region', { name: 'Reviews' }).getByText('No reviews have been published yet.')).toBeVisible()
  const reviewDiscovery = page.getByRole('link', { name: 'Find a title to review', exact: true })
  await expect(reviewDiscovery).toBeVisible()
  expect((await reviewDiscovery.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await reviewDiscovery.click()
  await expect(page).toHaveURL('/search')
  await page.goBack()
  await expect(page).toHaveURL(/\/profile\/experience_fixture\/reviews$/)
  await page.screenshot({ caret: 'initial', path: '.impeccable/review/profile-community/reviews-desktop.png', fullPage: true })
  await page.getByRole('link', { name: 'Community', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Find your kind of people.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'A new point of view starts here.' })).toBeVisible()
  await page.screenshot({ caret: 'initial', path: '.impeccable/review/profile-community/community-desktop.png', fullPage: true })

  await page.goBack()
  await expect(page).toHaveURL(/\/profile\/experience_fixture\/reviews$/)
  await page.getByRole('navigation', { name: 'experience_fixture profile sections' }).getByRole('link', { name: 'Lists' }).click()
  await expect(page).toHaveURL(/\/profile\/experience_fixture\/lists$/)
  await expect(page.getByText('No lists yet. Save a title to a list from any title page.')).toBeVisible()
  await page.screenshot({ caret: 'initial', path: '.impeccable/review/profile-community/lists-desktop.png', fullPage: true })
  await page.getByRole('link', { name: 'Community', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Find your kind of people.' })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/profile/experience_fixture/reviews')
  await expect(page.getByRole('heading', { name: 'Reviews' })).toBeVisible()
  const phoneReviewDiscovery = page.getByRole('link', { name: 'Find a title to review', exact: true })
  expect((await phoneReviewDiscovery.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  const profileSections = page.getByRole('navigation', { name: 'experience_fixture profile sections' })
  expect(await profileSections.evaluate(nav => nav.scrollWidth > nav.clientWidth)).toBe(true)
  const leftScrollCue = page.locator('[data-profile-scroll-cue="left"]')
  const rightScrollCue = page.locator('[data-profile-scroll-cue="right"]')
  await expect(leftScrollCue).toBeVisible()
  await expect(rightScrollCue).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.addScriptTag({ content: axe.source })
  const profileViolations = await page.evaluate(async () => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document.querySelector('main#consumit-main-content')!, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    })
    return report.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))
  })
  expect(profileViolations, 'empty owner Reviews archive should meet WCAG 2.2 AA').toEqual([])
  await page.screenshot({ caret: 'initial', path: '.impeccable/review/profile-community/reviews-mobile.png', fullPage: true })
  await profileSections.evaluate(nav => nav.scrollTo({ left: nav.scrollWidth, behavior: 'instant' }))
  await expect(leftScrollCue).toBeVisible()
  await expect(rightScrollCue).toHaveCount(0)
  await profileSections.evaluate(nav => nav.scrollTo({ left: 0, behavior: 'instant' }))
  await expect(leftScrollCue).toHaveCount(0)
  await expect(rightScrollCue).toBeVisible()
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('dialog', { name: 'CONSUMIT' }).getByRole('link', { name: 'Community' }).click()
  await expect(page.getByRole('heading', { name: 'Find your kind of people.' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ caret: 'initial', path: '.impeccable/review/profile-community/community-mobile.png', fullPage: true })
})

test('a failed Reviews archive keeps a direct return to the profile', async ({ page, context, request }) => {
  const memberId = await signIn(context, request)
  await request.post(`${api}/__fixtures/reset`, {
    data: { memberId, profileArchiveFailureCount: 1, preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed', communityDismissed: true } },
  })
  await page.addInitScript(() => {
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    localStorage.setItem('consumit.home-theme', 'dark')
  })
  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto('/profile/experience_fixture/reviews')

  await expect(page.getByRole('heading', { name: 'We couldn’t load Reviews right now', level: 1 })).toBeVisible()
  await expect(page.locator('[data-filscreen-home]')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('main#consumit-main-content')).toBeFocused()
  const retry = page.getByRole('button', { name: 'Try again' })
  const profileLink = page.getByRole('link', { name: 'Back to profile' })
  expect((await retry.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect((await profileLink.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await expect(profileLink).toHaveAttribute('href', '/profile/experience_fixture')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.addScriptTag({ content: axe.source })
  const errorViolations = await page.evaluate(async () => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document.querySelector('main#consumit-main-content')!, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    })
    return report.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))
  })
  expect(errorViolations, 'profile archive error recovery should meet WCAG 2.2 AA').toEqual([])

  await mkdir('.impeccable/review/profile-community', { recursive: true })
  await page.screenshot({ caret: 'initial', path: '.impeccable/review/profile-community/reviews-error-mobile-dark.png', fullPage: true, style: 'nextjs-portal { display: none !important; }' })
  await profileLink.click()
  await expect(page).toHaveURL('/profile/experience_fixture')
  await expect(page.getByRole('navigation', { name: 'experience_fixture profile sections' })).toBeVisible()
})

test('a failed Lists archive can retry in the light theme', async ({ page, context, request }) => {
  const memberId = await signIn(context, request)
  await request.post(`${api}/__fixtures/reset`, {
    data: { memberId, profileArchiveFailureCount: 1, preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed', communityDismissed: true } },
  })
  await page.addInitScript(() => {
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    localStorage.setItem('consumit.home-theme', 'light')
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/profile/experience_fixture/lists')

  await expect(page.getByRole('heading', { name: 'We couldn’t load Lists right now', level: 1 })).toBeVisible()
  await expect(page.locator('[data-filscreen-home]')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('main#consumit-main-content')).toBeFocused()
  const retry = page.getByRole('button', { name: 'Try again' })
  expect((await retry.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.addScriptTag({ content: axe.source })
  const errorViolations = await page.evaluate(async () => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document.querySelector('main#consumit-main-content')!, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    })
    return report.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))
  })
  expect(errorViolations, 'light profile archive error recovery should meet WCAG 2.2 AA').toEqual([])
  await mkdir('.impeccable/review/profile-community', { recursive: true })
  await page.screenshot({ caret: 'initial', path: '.impeccable/review/profile-community/lists-error-mobile-light.png', fullPage: true, style: 'nextjs-portal { display: none !important; }' })

  await retry.click()
  await expect(page).toHaveURL('/profile/experience_fixture/lists')
  await expect(page.getByText('No lists yet. Save a title to a list from any title page.')).toBeVisible()
})

test('Community review cards stay readable in the Profile to review to Community journey', async ({ page, context, request }) => {
  const memberId = await signIn(context, request)
  await request.post(`${api}/__fixtures/reset`, { data: { memberId, reviewFixture: true, communitySpoilerFixture: true, preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed' } } })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/profile/experience_fixture')
  await page.locator('[data-consumit-profile-activity] a[href="/reviews/experience-review"]').first().click()
  await expect(page).toHaveURL(/\/reviews\/experience-review$/)
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('dialog', { name: 'CONSUMIT' }).getByRole('link', { name: 'Community' }).click()
  await page.getByRole('navigation', { name: 'Community' }).getByRole('link', { name: 'Following', exact: true }).click()

  const communityReviewAction = page.getByRole('link', { name: 'Read review', exact: true })
  const communityReviewCard = page.locator('.taste-community-card').filter({ has: communityReviewAction })
  await expect(communityReviewCard).toBeVisible()
  const communityTypeSamples = [
    ['Community eyebrow', page.locator('.taste-community-eyebrow').first(), 12],
    ['review kind', communityReviewCard.locator('.taste-community-kind'), 12],
    ['author name', communityReviewCard.locator('.taste-community-curator strong'), 12],
    ['author handle', communityReviewCard.locator('.taste-community-curator .taste-muted'), 12],
    ['publication date', communityReviewCard.locator('.taste-community-byline time'), 12],
    ['Following tab', page.getByRole('navigation', { name: 'Community' }).getByRole('link', { name: 'Following', exact: true }), 12],
    ['spoiler disclosure', communityReviewCard.locator('.taste-spoiler summary'), 12],
    ['Read review action', communityReviewAction, 14],
  ] as const
  for (const [label, element, minimum] of communityTypeSamples) {
    const fontSize = await element.evaluate(node => Number.parseFloat(getComputedStyle(node).fontSize))
    expect(fontSize, `${label} should meet its design type role`).toBeGreaterThanOrEqual(minimum)
  }
  const communitySpoiler = communityReviewCard.locator('.taste-spoiler')
  await expect(communitySpoiler.locator('summary')).toHaveText('Contains spoilers · Reveal')
  expect((await communitySpoiler.locator('summary').boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect((await communityReviewAction.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect(await communityReviewCard.evaluate(card => card.scrollWidth <= card.clientWidth)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await mkdir('.impeccable/review/review-journey', { recursive: true })
  await page.screenshot({ caret: 'initial', path: '.impeccable/review/review-journey/community-following-320x700.png', fullPage: true })
  await page.addScriptTag({ content: axe.source })
  const communityViolations = async () => page.evaluate(async () => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document.querySelector('main#consumit-main-content')!, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    })
    return report.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))
  })
  expect(await communityViolations(), 'dark Community card should meet WCAG 2.2 AA').toEqual([])
  await communitySpoiler.locator('summary').click()
  await expect(communitySpoiler).toHaveAttribute('open', '')
  await expect(communitySpoiler.locator('.taste-community-excerpt')).toBeVisible()
  await page.getByRole('button', { name: 'Open navigation' }).click()
  const mobileMenu = page.getByRole('dialog', { name: 'CONSUMIT' })
  await mobileMenu.getByRole('button', { name: 'Switch to light mode' }).click()
  await mobileMenu.getByRole('button', { name: 'Close navigation' }).click()
  await expect(page.locator('[data-filscreen-home]')).toHaveAttribute('data-theme', 'light')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(await communityReviewCard.evaluate(card => card.scrollWidth <= card.clientWidth)).toBe(true)
  expect(await communityViolations(), 'light Community card should meet WCAG 2.2 AA').toEqual([])
  await page.screenshot({ caret: 'initial', path: '.impeccable/review/review-journey/community-following-320x700-light.png', fullPage: true })
})

test('a populated profile review opens its publication and stays reachable from Community', async ({ page, context, request }) => {
  const hydrationErrors: string[] = []
  page.on('console', message => { if (message.type() === 'error' && /hydrat/i.test(message.text())) hydrationErrors.push(message.text()) })
  const memberId = await signIn(context, request)
  await request.post(`${api}/__fixtures/reset`, { data: { memberId, reviewFixture: true, discussionFixture: true, preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed' } } })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  await mkdir('.impeccable/review/review-journey', { recursive: true })
  await page.goto('/profile/experience_fixture')
  await page.locator('[data-consumit-profile-activity] a[href="/reviews/experience-review"]').first().click()
  await expect(page).toHaveURL(/\/reviews\/experience-review$/)
  const reviewDate = page.locator('.taste-review-header time')
  await expect(reviewDate).toHaveAttribute('datetime', '2026-10-27T12:00:00.000Z')
  await expect(reviewDate).toHaveText('Oct 27, 2026')
  await expect(page.locator('.taste-review-body')).toContainText('The final image brings those small moments together')
  const commentDate = page.locator('.taste-comment time')
  await expect(commentDate).toHaveAttribute('datetime', '2026-10-28T12:00:00.000Z')
  await expect(commentDate).toHaveText('Oct 28, 2026')
  await expect(page.getByRole('textbox', { name: 'Join the conversation' })).toBeVisible()
  await page.screenshot({ caret: 'initial', path: '.impeccable/review/review-journey/publication-desktop.png', fullPage: true })

  await page.getByRole('link', { name: '← Reviews by experience_fixture' }).click()
  await expect(page).toHaveURL(/\/profile\/experience_fixture\/reviews$/)
  const search = page.getByRole('searchbox', { name: 'Search Reviews' })
  await search.fill('a title with no matching review')
  await expect(page.getByText('No loaded reviews match this search. Try another title.')).toBeVisible()
  await search.clear()
  await page.screenshot({ caret: 'initial', path: '.impeccable/review/review-journey/archive-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 320, height: 700 })
  const read = page.getByRole('link', { name: /^Read and discuss review of/ })
  await expect(read).toBeVisible()
  expect((await read.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await read.locator('xpath=ancestor::article').evaluate(card => card.scrollWidth <= card.clientWidth)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ caret: 'initial', path: '.impeccable/review/review-journey/archive-mobile.png', fullPage: true })
  await read.click()
  await expect(page.locator('.taste-review-body')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ caret: 'initial', path: '.impeccable/review/review-journey/publication-mobile.png', fullPage: true })

  await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('dialog', { name: 'CONSUMIT' }).getByRole('link', { name: 'Community' }).click()
  await page.getByRole('navigation', { name: 'Community' }).getByRole('link', { name: 'Following', exact: true }).click()
  await page.getByRole('link', { name: 'Read review', exact: true }).click()
  await expect(page).toHaveURL(/\/reviews\/experience-review$/)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Open navigation' }).click()
  const mobileMenu = page.getByRole('dialog', { name: 'CONSUMIT' })
  await mobileMenu.getByRole('button', { name: 'Switch to light mode' }).click()
  await mobileMenu.getByRole('button', { name: 'Close navigation' }).click()
  await expect(page.locator('[data-filscreen-home]')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('.taste-review-body')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ caret: 'initial', path: '.impeccable/review/review-journey/publication-light-mobile.png', fullPage: true })
  await page.getByRole('link', { name: '← Reviews by experience_fixture' }).click()
  await expect(page.getByRole('link', { name: /^Read and discuss review of/ })).toBeVisible()
  await page.screenshot({ caret: 'initial', path: '.impeccable/review/review-journey/archive-light-mobile.png', fullPage: true })
  await page.getByRole('link', { name: /^Read and discuss review of/ }).click()
  await expect(page).toHaveURL(/\/reviews\/experience-review$/)
  await context.clearCookies()
  await page.reload()
  const join = page.getByRole('link', { name: 'Sign in to join in' })
  await expect(join).toHaveAttribute('href', '/sign-in?next=%2Freviews%2Fexperience-review')
  await join.click()
  await expect(page).toHaveURL(/\/sign-in\?next=%2Freviews%2Fexperience-review$/)
  expect(hydrationErrors).toEqual([])
})

test('member setup keeps optional Favorites across Back, retries writes and restores across devices', async ({ page, context, request, browser }) => {
  await signIn(context, request)
  await page.goto('/onboarding?next=%2Fmovies')
  await page.getByRole('button', { name: /Anime audio/ }).click()
  await page.getByRole('option', { name: 'English DUB' }).click()
  const savePreferences = page.getByRole('button', { name: 'Save viewing preferences and continue', exact: true })
  await savePreferences.focus()
  await page.keyboard.press('Space')
  await expect(page.getByText('Your Favorites · 0/4')).toBeVisible()
  const favoritesHeading = page.getByRole('heading', { name: 'A few of your favorites.', exact: true })
  await expect(favoritesHeading).toBeFocused()
  await page.getByRole('checkbox').first().focus(); await page.keyboard.press('Space')
  await page.getByRole('link', { name: 'Back', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Make yourself at home.', exact: true })).toBeFocused()
  await expect(savePreferences).toBeEnabled()
  await savePreferences.focus()
  await page.keyboard.press('Space')
  await expect(page.getByText('Your Favorites · 1/4')).toBeVisible()
  const saveFavorites = page.getByRole('button', { name: 'Save Favorites and continue', exact: true })
  await expect(saveFavorites).toBeEnabled()
  await saveFavorites.focus()
  await page.keyboard.press('Space')
  const readyHeading = page.getByRole('heading', { name: 'You’re ready to watch.' })
  await expect(readyHeading).toBeFocused()
  await page.getByRole('button', { name: 'Start browsing' }).click()
  await expect(page).toHaveURL(/\/movies$/)
  await page.goto('/settings#playback')
  await page.getByRole('switch', { name: 'Autoplay next episode', exact: true }).click()
  await page.route('**/v1/me/experience-preferences', async route => route.request().method() === 'PATCH' ? route.fulfill({ status: 503, json: {} }) : route.continue())
  await page.getByRole('button', { name: 'Save viewing preferences' }).click()
  await expect(page.getByRole('button', { name: 'Retry save', exact: true })).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Autoplay next episode', exact: true })).toBeChecked()
  await page.unroute('**/v1/me/experience-preferences')
  await page.getByRole('button', { name: 'Retry save', exact: true }).click()
  await expect(page.getByText('Preferences saved.', { exact: true })).toBeVisible()
  const other = await browser.newContext(); await signIn(other, request)
  const second = await other.newPage(); await second.goto('http://127.0.0.1:28114/onboarding')
  await expect(second.getByRole('button', { name: /Anime audio/ })).toContainText('English DUB')
  await expect(second.getByRole('switch', { name: 'Autoplay next episode', exact: true })).toBeChecked()
  await other.close()
})

test('guide, community and settings fit desktop/mobile in both themes with keyboard controls', async ({ page, context, request }) => {
  test.setTimeout(240_000)
  await signIn(context, request)
  await mkdir('.impeccable/review/experience', { recursive: true })
  for (const [size, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]] as const) {
    await page.setViewportSize({ width, height })
    for (const theme of ['dark', 'light']) {
      const memberId = await signIn(context, request, `${size}-${theme}`)
      await page.goto('/onboarding')
      await page.evaluate(value => localStorage.setItem('consumit.home-theme', value), theme)
      await request.post(`${api}/__fixtures/reset`, { data: { memberId, preferences: { ...defaultExperiencePreferences(), playbackConfigured: true, subtitleLanguages: ['ar', 'fr', 'en'] } } })
      await page.goto('/'); await expect(page.getByRole('dialog', { name: 'Welcome to Consumit.' })).toBeVisible()
      await page.screenshot({ path: `.impeccable/review/experience/${size}-${theme}-welcome.png` })
      await page.keyboard.press('Escape')
      await page.locator('section[aria-labelledby="community-heading"]').screenshot({ path: `.impeccable/review/experience/${size}-${theme}-community.png` })
      await page.goto('/onboarding'); await expect(page.getByRole('heading', { name: 'Make yourself at home.' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Save viewing preferences and continue', exact: true })).toBeVisible()
      await page.screenshot({ path: `.impeccable/review/experience/${size}-${theme}-preferences.png`, fullPage: true })
      await page.goto('/onboarding/favorites'); await expect(page.getByRole('checkbox').first()).toBeVisible()
      await page.screenshot({ path: `.impeccable/review/experience/${size}-${theme}-favorites.png`, fullPage: true })
      await page.goto('/onboarding/ready'); await expect(page.getByRole('button', { name: 'Start browsing' })).toBeEnabled()
      await page.screenshot({ path: `.impeccable/review/experience/${size}-${theme}-ready.png`, fullPage: true })
      await page.goto('/settings#playback'); await page.getByRole('button', { name: 'Save viewing preferences' }).scrollIntoViewIfNeeded()
      await page.locator('#playback').screenshot({ path: `.impeccable/review/experience/${size}-${theme}-settings.png` })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
  }
  await page.goto('/'); await expect(page.getByRole('dialog', { name: 'Welcome to Consumit.' })).not.toBeVisible()
  await page.getByRole('button', { name: 'Hide community cards' }).click()
  await expect(page.getByRole('link', { name: /Join us on Discord/ })).not.toBeVisible()
})

test('guest signup offers device choices, saves only on consent, and retains its original destination', async ({ page, request }) => {
  const suffix = Date.now().toString().slice(-8)
  await page.addInitScript(() => localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ audioLanguage: 'fr', animeAudio: 'sub', subtitlesEnabled: true, subtitleLanguages: ['fr', 'en'], qualityHeight: null, autoplayNextEpisode: false, guideVersion: 1, guideStatus: 'dismissed', communityDismissed: false })))
  await page.goto('/onboarding/favorites?next=%2Fmovies')
  await page.getByRole('link', { name: 'Create an account', exact: true }).click()
  await page.getByLabel('Email', { exact: true }).fill(`guide_${suffix}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill('experience-fixture-password')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByLabel('Username', { exact: true }).fill(`guide_${suffix}`)
  await page.getByRole('button', { name: 'Send verification code' }).click()
  await expect(page.getByLabel('Verification code')).toBeVisible()
  const { code } = await (await request.get(`${api}/__fixtures/code`)).json()
  await page.getByLabel('Verification code').fill(code.code)
  await page.getByRole('button', { name: 'Verify and continue' }).click()
  await expect(page.getByRole('heading', { name: 'Make yourself at home.', exact: true })).toBeFocused()
  await expect(page.getByRole('button', { name: /Movie & series audio/ })).toContainText('English')
  await page.getByRole('button', { name: 'Use device choices' }).click()
  await expect(page.getByRole('button', { name: /Movie & series audio/ })).toContainText('Français')
  await page.getByRole('button', { name: 'Save viewing preferences and continue', exact: true }).click()
  await expect(page.getByText('Your Favorites · 0/4')).toBeVisible()
  await page.getByRole('link', { name: 'Continue without saving' }).click()
  await page.getByRole('button', { name: 'Start browsing' }).click()
  await expect(page).toHaveURL(/\/movies$/)
  await page.goto(`/profile/guide_${suffix}`)
  await expect(page.getByRole('heading', { name: `guide_${suffix}` })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Edit profile' })).toBeVisible()
  await page.goto('/watch/movie/693134')
  await expect.poll(async () => (await (await request.get(`${api}/__fixtures/state`)).json()).requests.at(-1)?.audioLanguage).toBe('fr')
})

test('viewing preferences and Favorites keep phone controls touch-safe', async ({ page, context, request }) => {
  await signIn(context, request)
  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto('/onboarding?next=%2Fmovies')

  const back = page.getByRole('link', { name: 'Back', exact: true })
  const skip = page.getByRole('link', { name: 'Skip', exact: true })
  await expect(back).toBeVisible()
  await expect(skip).toBeVisible()
  expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect((await skip.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  for (const name of ['Movie & series audio', 'Anime audio', 'Add subtitle language', 'Preferred quality']) {
    const control = page.getByRole('button', { name: new RegExp(name) })
    await expect(control).toBeVisible()
    expect((await control.boundingBox())!.height, name).toBeGreaterThanOrEqual(44)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await page.getByRole('button', { name: 'Save viewing preferences and continue', exact: true }).click()
  const search = page.getByRole('searchbox', { name: 'Search movies, series, or anime' })
  await expect(search).toBeVisible()
  expect((await search.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  for (const name of ['All', 'Movie', 'Series', 'Anime']) {
    const filter = page.getByRole('button', { name, exact: true })
    expect((await filter.boundingBox())!.height, name).toBeGreaterThanOrEqual(44)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
