import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test'
import axe from 'axe-core'
import { defaultExperiencePreferences } from '../../packages/contracts/src/index'

const api = 'http://127.0.0.1:18563'

async function signIn(context: BrowserContext, request: APIRequestContext) {
  const { token, member } = await (await request.get(`${api}/__fixtures/session`)).json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  return member.id as string
}

async function expectWcag22Aa(page: Page) {
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => (await (window as unknown as Window & { axe: typeof axe }).axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  })).violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })))
  expect(violations, 'Community recovery should meet WCAG 2.2 AA').toEqual([])
}

test.beforeEach(async ({ request }) => { await request.post(`${api}/__fixtures/reset`, { data: {} }) })

test('Community recovers from an initial feed outage with focus and a clear announcement', async ({ page, context, request }) => {
  const memberId = await signIn(context, request)
  await request.post(`${api}/__fixtures/reset`, {
    data: {
      memberId,
      communityFailureCount: 1,
      communityRecoveryFixture: true,
      preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed', communityDismissed: true },
    },
  })
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  await page.goto('/community')

  const retry = page.getByRole('button', { name: 'Try again', exact: true })
  await expect(retry).toBeVisible()
  await expect(page.getByRole('heading', { name: 'We couldn’t load this community view.' })).toBeVisible()
  await retry.click()

  await expect(page.getByRole('heading', { name: 'Quiet evenings, strange worlds' })).toBeVisible()
  await expect(page.getByRole('main')).toBeFocused()
  await expect(page.getByRole('status')).toHaveText('Community loaded.')
  const action = page.getByRole('link', { name: 'Explore collection', exact: true })
  const bounds = await action.boundingBox()
  expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(0)
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(320)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expectWcag22Aa(page)
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/community/community-recovery-320x720.png', fullPage: true })
})

test('Community search filters restore through browser history and clear on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript(() => {
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ guideVersion: 1, guideStatus: 'dismissed', communityDismissed: true }))
  })
  await page.goto('/community')

  const communityNav = page.getByRole('navigation', { name: 'Community' })
  const modeLinks = communityNav.getByRole('link')
  await expect(modeLinks).toHaveCount(3)
  const navBounds = await communityNav.boundingBox()
  expect(navBounds).not.toBeNull()
  if (navBounds) {
    for (let index = 0; index < await modeLinks.count(); index += 1) {
      const bounds = await modeLinks.nth(index).boundingBox()
      expect(bounds).not.toBeNull()
      if (bounds) {
        expect(bounds.x).toBeGreaterThanOrEqual(navBounds.x)
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(navBounds.x + navBounds.width)
        expect(bounds.height).toBeGreaterThanOrEqual(44)
      }
    }
  }

  const search = page.getByRole('searchbox', { name: 'Search collections' })
  const searchBounds = await search.boundingBox()
  expect(searchBounds?.height ?? 0).toBeGreaterThanOrEqual(44)
  for (const label of ['Filter by title type', 'Filter by genre']) {
    const filterBounds = await page.getByLabel(label).boundingBox()
    expect(filterBounds?.height ?? 0, `${label} touch target`).toBeGreaterThanOrEqual(44)
  }
  for (const name of ['Find collections', 'Create a collection']) {
    const actionBounds = await page.getByRole(name === 'Find collections' ? 'button' : 'link', { name, exact: true }).boundingBox()
    expect(actionBounds?.height ?? 0, `${name} touch target`).toBeGreaterThanOrEqual(44)
  }
  await search.fill('slow cinema')
  await page.getByRole('button', { name: 'Find collections' }).click()
  await expect(page).toHaveURL('/community?mode=discover&q=slow+cinema')
  const kind = page.getByLabel('Filter by title type')
  await kind.selectOption('anime')
  await expect(page).toHaveURL('/community?mode=discover&q=slow+cinema&kind=anime')
  await expect(search).toHaveValue('slow cinema')

  await page.goBack()
  await expect(page).toHaveURL('/community?mode=discover&q=slow+cinema')
  await expect(page.getByLabel('Filter by title type')).toHaveValue('all')
  await page.goForward()
  await expect(page).toHaveURL('/community?mode=discover&q=slow+cinema&kind=anime')
  await expect(page.getByLabel('Filter by title type')).toHaveValue('anime')

  const clear = page.getByRole('button', { name: 'Clear filters' })
  const bounds = await clear.boundingBox()
  expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(0)
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(320)
  await clear.click()
  await expect(page).toHaveURL('/community?mode=discover')
  await expect(page.getByRole('searchbox', { name: 'Search collections' })).toHaveValue('')
  await expect(page.getByLabel('Filter by title type')).toHaveValue('all')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expectWcag22Aa(page)
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/community/search-filter-history-320x720.png', fullPage: true })
})

test('Community appends the next cursor page and retries without dropping loaded collections', async ({ page, request }) => {
  const communityResponses: number[] = []
  page.on('response', response => {
    if (new URL(response.url()).pathname === '/v1/taste/community') communityResponses.push(response.status())
  })
  await request.post(`${api}/__fixtures/reset`, { data: { communityPaginationFixture: true, communityPageFailureCount: 1 } })
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript(() => {
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ guideVersion: 1, guideStatus: 'dismissed', communityDismissed: true }))
  })
  await page.goto('/community')

  const first = page.getByRole('heading', { name: 'Quiet evenings, strange worlds' })
  const second = page.getByRole('heading', { name: 'Letters from the coast' })
  await expect(first).toBeVisible()
  await expect(second).toBeVisible()
  const more = page.getByRole('button', { name: 'Load more collections', exact: true })
  await expect(more).toBeVisible()
  const bounds = await more.boundingBox()
  expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(44)

  await more.click()
  await expect.poll(() => communityResponses).toEqual([503])
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Community collections could not be loaded. Try again.')
  await expect(first).toBeVisible()
  await expect(second).toBeVisible()
  const retry = page.getByRole('button', { name: 'Retry loading more collections', exact: true })
  await expect(retry).toBeFocused()
  const retryBounds = await retry.boundingBox()
  expect(retryBounds?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect(retryBounds?.x ?? -1).toBeGreaterThanOrEqual(0)
  expect((retryBounds?.x ?? 0) + (retryBounds?.width ?? 0)).toBeLessThanOrEqual(320)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expectWcag22Aa(page)
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/community/discovery-load-more-retry-320x720.png', fullPage: true })

  await retry.click()
  await expect(page.getByRole('heading', { name: 'Small stories, long shadows' })).toBeVisible()
  await expect(first).toBeVisible()
  await expect(second).toBeVisible()
  await expect(page.getByRole('main').getByRole('article')).toHaveCount(3)
  await expect(page).toHaveURL('/community')
  const end = page.getByRole('status')
  await expect(end).toHaveText('Loaded 1 more collection. You’re all caught up.')
  await expect(end).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expectWcag22Aa(page)
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/community/discovery-load-more-320x720.png', fullPage: true })
})

test('Community restarts filtered discovery when a cursor expires', async ({ page, request }) => {
  await request.post(`${api}/__fixtures/reset`, { data: { communityPaginationFixture: true, communityCursorExpired: true } })
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript(() => {
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ guideVersion: 1, guideStatus: 'dismissed', communityDismissed: true }))
  })
  await page.goto('/community?mode=discover&q=slow+cinema')

  const first = page.getByRole('heading', { name: 'Quiet evenings, strange worlds' })
  const second = page.getByRole('heading', { name: 'Letters from the coast' })
  await expect(first).toBeVisible()
  await expect(second).toBeVisible()
  await page.getByRole('button', { name: 'Load more collections', exact: true }).click()
  await expect(page.getByRole('main').getByRole('alert')).toContainText('This collection page has expired.')
  await expect(first).toBeVisible()
  await expect(second).toBeVisible()
  const restart = page.getByRole('button', { name: 'Restart discovery', exact: true })
  await expect(restart).toBeFocused()
  const restartBounds = await restart.boundingBox()
  expect(restartBounds?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect(restartBounds?.x ?? -1).toBeGreaterThanOrEqual(0)
  expect((restartBounds?.x ?? 0) + (restartBounds?.width ?? 0)).toBeLessThanOrEqual(320)
  await expectWcag22Aa(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/community/discovery-expired-cursor-320x720.png', fullPage: true })

  const restartNavigation = page.waitForEvent('load')
  await restart.click()
  await restartNavigation
  await expect(page).toHaveURL('/community?mode=discover&q=slow+cinema')
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0)
  await expect(first).toBeVisible()
  await expect(second).toBeVisible()
  await page.getByRole('button', { name: 'Load more collections', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Small stories, long shadows' })).toBeVisible()
  await expect(page.getByRole('main').getByRole('article')).toHaveCount(3)
  await expectWcag22Aa(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('Following keeps loaded publications while a later page retries', async ({ page, context, request }) => {
  const memberId = await signIn(context, request)
  await request.post(`${api}/__fixtures/reset`, {
    data: {
      memberId,
      reviewFixture: true,
      communityFollowingPaginationFixture: true,
      communityPageFailureCount: 1,
      preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed', communityDismissed: true },
    },
  })
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  await page.goto('/community?mode=following')

  const first = page.getByRole('heading', { name: 'The pauses leave room to think' })
  const second = page.getByRole('heading', { name: 'Letters in the dark' })
  await expect(first).toBeVisible()
  await expect(second).toBeVisible()
  const more = page.getByRole('button', { name: 'Load more publications', exact: true })
  await expect(more).toBeVisible()
  expect((await more.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)

  await more.click()
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Community publications could not be loaded.')
  await expect(first).toBeVisible()
  await expect(second).toBeVisible()
  const retry = page.getByRole('button', { name: 'Retry loading more publications', exact: true })
  await expect(retry).toBeFocused()
  expect((await retry.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expectWcag22Aa(page)
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/community/following-load-more-retry-320x720.png', fullPage: true })

  await retry.click()
  await expect(page.getByRole('heading', { name: 'A season of small beginnings' })).toBeVisible()
  await expect(first).toBeVisible()
  await expect(second).toBeVisible()
  await expect(page.getByRole('main').getByRole('article')).toHaveCount(3)
  await expect(page).toHaveURL('/community?mode=following')
  const end = page.getByRole('status')
  await expect(end).toHaveText('Loaded 1 more publication. You’re all caught up.')
  await expect(end).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expectWcag22Aa(page)
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/community/following-load-more-320x720.png', fullPage: true })

  await page.getByRole('link', { name: 'Read review', exact: true }).first().click()
  await expect(page).toHaveURL('/reviews/experience-review')
  await expect(page.getByText('The quiet scenes carry the story.')).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL('/community?mode=following')
  await expect(page.getByRole('main').getByRole('article')).toHaveCount(3)
  await expect(first).toBeVisible()
  await expect(second).toBeVisible()
  await expect(page.getByRole('heading', { name: 'A season of small beginnings' })).toBeVisible()
})

test('Following offers a clean restart when its feed cursor expires', async ({ page, context, request }) => {
  const memberId = await signIn(context, request)
  await request.post(`${api}/__fixtures/reset`, {
    data: {
      memberId,
      reviewFixture: true,
      communityFollowingPaginationFixture: true,
      communityCursorExpired: true,
      preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed', communityDismissed: true },
    },
  })
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  await page.goto('/community?mode=following')

  const first = page.getByRole('heading', { name: 'The pauses leave room to think' })
  const second = page.getByRole('heading', { name: 'Letters in the dark' })
  await expect(first).toBeVisible()
  await expect(second).toBeVisible()
  await page.getByRole('button', { name: 'Load more publications', exact: true }).click()
  const expired = page.getByRole('main').getByRole('alert')
  await expect(expired).toContainText('This Following page has expired.')
  await expect(expired).toContainText('Restart Following to get a fresh page.')
  await expect(first).toBeVisible()
  await expect(second).toBeVisible()
  const restart = page.getByRole('button', { name: 'Restart Following', exact: true })
  await expect(restart).toBeFocused()
  const restartBounds = await restart.boundingBox()
  expect(restartBounds?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect(restartBounds?.x ?? -1).toBeGreaterThanOrEqual(0)
  expect((restartBounds?.x ?? 0) + (restartBounds?.width ?? 0)).toBeLessThanOrEqual(320)
  await expectWcag22Aa(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/community/following-expired-cursor-320x720.png', fullPage: true })

  const restartNavigation = page.waitForEvent('load')
  await restart.click()
  await restartNavigation
  await expect(page).toHaveURL('/community?mode=following')
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0)
  await expect(first).toBeVisible()
  await expect(second).toBeVisible()
  await page.getByRole('button', { name: 'Load more publications', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'A season of small beginnings' })).toBeVisible()
  await expect(page.getByRole('main').getByRole('article')).toHaveCount(3)
  await expectWcag22Aa(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
