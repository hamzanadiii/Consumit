import { mkdir } from 'node:fs/promises'
import axe from 'axe-core'
import { expect, test, type Page } from '@playwright/test'

const api = 'http://127.0.0.1:18563'
const ownReview = 'The quiet scenes carry the story.'
const longPublicReview = 'A patient viewer watches the small gestures and the silence between them. '.repeat(5)

test.use({ timezoneId: 'America/Los_Angeles' })

async function expectAccessible(page: Page, label: string) {
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document.querySelector('main#consumit-main-content')!, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    })
    return report.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))
  })
  expect(violations, `${label} should meet WCAG 2.2 AA`).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${label} should fit the phone`).toBe(true)
}

test('Reviews visibility controls the guest title feed while the owner keeps their archive', async ({ page, context, request }) => {
  const sessionResponse = await request.get(`${api}/__fixtures/session`)
  expect(sessionResponse.ok(), await sessionResponse.text()).toBe(true)
  const { token, member } = await sessionResponse.json()
  const resetResponse = await request.post(`${api}/__fixtures/reset`, {
    data: { memberId: member.id, reviewFixture: true, titleReviewFixture: true },
  })
  expect(resetResponse.ok(), await resetResponse.text()).toBe(true)
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  await page.setViewportSize({ width: 320, height: 720 })

  await page.goto('/title/693134/reviews')
  const publicFeed = page.locator('[data-consumit-title-reviews]')
  const title = 'Northbound — a remarkably long title for a quiet evening at home'
  const backToTitle = publicFeed.getByRole('link', { name: `Back to ${title}` })
  await expect(backToTitle).toHaveText('← Back to title')
  expect((await backToTitle.boundingBox())?.height).toBe(44)
  await expect(publicFeed.getByRole('heading', { name: `${title} reviews` })).toBeVisible()
  await expect(publicFeed.getByText(ownReview)).toBeVisible()
  await expect(publicFeed).toContainText('11 public reviews.')
  await expect(publicFeed.locator('time[datetime="2026-10-28"]')).toHaveText('Oct 28, 2026')
  const memberWelcome = page.getByRole('dialog', { name: 'Welcome to Consumit.' })
  await expect(memberWelcome).toBeVisible()
  await memberWelcome.getByRole('button', { name: 'Start exploring', exact: true }).click()
  await expect(memberWelcome).not.toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-consumit-theme', 'dark')
  await expectAccessible(page, 'Dark-theme member title reviews on a phone')
  await mkdir('.impeccable/review/profile-review-visibility', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/profile-review-visibility/member-feed-dark-320x720.png' })
  await page.setViewportSize({ width: 1440, height: 960 })
  await expectAccessible(page, 'Dark-theme member title reviews on desktop')
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/profile-review-visibility/member-feed-dark-1440x960.png' })
  await page.setViewportSize({ width: 320, height: 720 })
  const longReview = publicFeed.getByText(/A patient viewer watches/)
  const expandReview = longReview.getByRole('button')
  await expect(expandReview).toHaveAccessibleName('Show more')
  expect(await longReview.evaluate((element, expected) => element.textContent?.includes(expected), `${longPublicReview.slice(0, 220)}…`)).toBe(true)
  expect((await expandReview.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await expect(expandReview).toHaveClass(/min-h-11/)
  await expect(expandReview).toHaveClass(/focus-visible:ring-2/)
  const discussion = longReview.locator('xpath=ancestor::article[1]').getByRole('link', { name: 'Read and discuss', exact: true })
  expect((await discussion.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await expect(discussion).toHaveClass(/focus-visible:ring-2/)

  await page.goto('/settings#account')
  const reviewsVisibility = page.getByRole('checkbox', { name: 'Reviews', exact: true })
  await expect(reviewsVisibility).toBeChecked()
  const reviewVisibilityRow = page.locator('label').filter({ has: reviewsVisibility })
  expect((await reviewVisibilityRow.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await reviewsVisibility.uncheck()
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByText('Profile saved.', { exact: true })).toBeVisible()
  await expect(reviewsVisibility).not.toBeChecked()
  await mkdir('.impeccable/review/profile-review-visibility', { recursive: true })
  await reviewsVisibility.scrollIntoViewIfNeeded()
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/profile-review-visibility/reviews-hidden-settings-320x720.png' })
  await expectAccessible(page, 'Settings profile visibility on a phone')

  await page.goto(`/profile/${member.username}/reviews`)
  await expect(page.getByText(ownReview)).toBeVisible()
  await expect(page.locator('time[datetime="2026-10-27"]')).toHaveText('Oct 27, 2026')

  await page.context().clearCookies()
  await page.goto(`/profile/${member.username}/reviews`)
  await expect(page.getByRole('heading', { name: 'We couldn’t find that page' })).toBeVisible()
  await expect(page.getByText(ownReview)).toHaveCount(0)
  await page.addInitScript(() => {
    localStorage.setItem('consumit.home-theme', 'light')
    localStorage.removeItem('consumit.share-welcome-dismissed.v1')
  })
  await page.goto('/title/693134/reviews')
  await expect(page.locator('html')).toHaveAttribute('data-consumit-theme', 'light')
  const welcome = page.getByRole('dialog', { name: 'Welcome to Consumit.' })
  await expect(welcome).toBeVisible()
  await welcome.getByRole('button', { name: 'Start exploring', exact: true }).click()
  await expect(welcome).not.toBeVisible()
  const hiddenPublicFeed = page.locator('[data-consumit-title-reviews]')
  await expect(hiddenPublicFeed).toContainText('10 public reviews.')
  await expect(hiddenPublicFeed.getByText(ownReview)).toHaveCount(0)
  const guestLongReview = hiddenPublicFeed.getByText(/A patient viewer watches/)
  const guestExpand = guestLongReview.getByRole('button', { name: 'Show more', exact: true })
  await expect(guestExpand).toHaveAttribute('aria-expanded', 'false')
  await guestExpand.click()
  const guestCollapse = guestLongReview.getByRole('button', { name: 'Show less', exact: true })
  await expect(guestCollapse).toHaveAttribute('aria-expanded', 'true')
  expect(await guestLongReview.evaluate((element, fullReview) => element.textContent?.includes(fullReview), longPublicReview)).toBe(true)
  await expectAccessible(page, 'Light-theme guest title reviews after the author hides Reviews')
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/profile-review-visibility/guest-feed-light-320x720.png' })
  await page.setViewportSize({ width: 1440, height: 960 })
  await expectAccessible(page, 'Light-theme guest title reviews on desktop after the author hides Reviews')
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/profile-review-visibility/guest-feed-light-1440x960.png' })
})

test('hidden profile sections stay available to the owner and unavailable to visitors', async ({ page, context, request }) => {
  const sessionResponse = await request.get(`${api}/__fixtures/session`)
  expect(sessionResponse.ok(), await sessionResponse.text()).toBe(true)
  const { token, member } = await sessionResponse.json()
  const resetResponse = await request.post(`${api}/__fixtures/reset`, { data: { memberId: member.id } })
  expect(resetResponse.ok(), await resetResponse.text()).toBe(true)
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  await page.setViewportSize({ width: 320, height: 720 })
  const hiddenSections = ['Favorites', 'Ratings', 'Reviews', 'Lists', 'Network', 'Likes', 'Tags', 'Watchlist', 'Watched', 'Diary', 'History', 'Activity']

  await page.goto('/settings#account')
  for (const section of hiddenSections) {
    const checkbox = page.getByRole('checkbox', { name: section, exact: true })
    await expect(checkbox).toBeChecked()
    await checkbox.uncheck()
  }
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByText('Profile saved.', { exact: true })).toBeVisible()

  await page.goto(`/profile/${member.username}`)
  const ownerNavigation = page.getByRole('navigation', { name: `${member.username} profile sections` })
  for (const section of ['Ratings', 'Reviews', 'Lists', 'Network', 'Likes', 'Tags', 'Watchlist', 'Watched', 'Diary', 'History', 'Activity']) {
    await expect(ownerNavigation.getByRole('link', { name: new RegExp(`^${section}`) })).toBeVisible()
  }
  await page.goto(`/profile/${member.username}/reviews`)
  await expect(page.getByRole('heading', { name: 'Reviews', exact: true })).toBeVisible()

  await context.clearCookies()
  await page.goto(`/profile/${member.username}`)
  const publicProfile = page.locator('[data-consumit-public-profile]').first()
  await expect(publicProfile).toBeVisible()
  const publicName = publicProfile.getByRole('heading', { name: member.username, exact: true })
  await expect(publicName).toBeVisible()
  const nameLineWidths = await publicName.evaluate(element => {
    const range = document.createRange()
    range.selectNodeContents(element)
    return Array.from(range.getClientRects(), rect => rect.width)
  })
  expect(nameLineWidths.at(-1) ?? 0, 'the profile name should not leave a one-character tail on a phone').toBeGreaterThan(40)
  const visitorNavigation = page.getByRole('navigation', { name: `${member.username} profile sections` })
  await expectAccessible(page, 'visitor profile with every public section hidden')
  await mkdir('.impeccable/review/profile-review-visibility', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/profile-review-visibility/all-sections-hidden-guest-320x720.png' })
  for (const section of ['Ratings', 'Reviews', 'Lists', 'Network', 'Likes', 'Tags', 'Watchlist', 'Watched', 'Diary', 'History', 'Activity']) {
    await expect(visitorNavigation.getByRole('link', { name: new RegExp(`^${section}`) })).toHaveCount(0)
  }
  await expect(page.getByRole('heading', { name: 'Favorites', exact: true })).toHaveCount(0)

  for (const route of ['activity', 'films', 'diary', 'history', 'reviews', 'lists', 'likes', 'tags', 'watchlist', 'ratings', 'network']) {
    await page.goto(`/profile/${member.username}/${route}`)
    await expect(page.getByRole('heading', { name: 'We couldn’t find that page' })).toBeVisible()
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('a public Diary archive keeps its first page and retries the same cursor after an outage', async ({ page, request }) => {
  const sessionResponse = await request.get(`${api}/__fixtures/session`)
  expect(sessionResponse.ok(), await sessionResponse.text()).toBe(true)
  const { member } = await sessionResponse.json()
  const resetResponse = await request.post(`${api}/__fixtures/reset`, {
    data: { memberId: member.id, publicDiaryArchivePages: true },
  })
  expect(resetResponse.ok(), await resetResponse.text()).toBe(true)
  await page.addInitScript(() => {
    localStorage.setItem('consumit.home-theme', 'light')
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
  })
  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto(`/profile/${member.username}/diary`)

  const archive = page.locator('section[aria-labelledby="visitor-profile-section-heading"]')
  const firstEntry = archive.locator('[data-consumit-diary-row]').filter({ hasText: '#after-hours' })
  const secondEntry = archive.locator('[data-consumit-diary-row]').filter({ hasText: '#returning' })
  await expect(page.getByRole('heading', { name: 'Diary', exact: true })).toBeVisible()
  await expect(page.getByRole('navigation', { name: `${member.username} profile sections` }).getByRole('link', { name: 'Diary, 2' })).toBeVisible()
  await expect(firstEntry).toBeVisible()
  await expect(secondEntry).toHaveCount(0)

  let nextPageAttempts = 0
  const requestedCursors: string[] = []
  await page.route(/\/v1\/profiles\/[^/]+\/archives\/diary\?/, async route => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor')
    if (!cursor) return route.continue()
    requestedCursors.push(cursor)
    nextPageAttempts += 1
    if (nextPageAttempts === 1) {
      await route.fulfill({
        status: 503,
        json: { error: { code: 'AUTH_STATE_UNAVAILABLE', message: 'Older diary entries are temporarily unavailable.', requestId: 'visitor-archive-fixture', retryable: true } },
      })
      return
    }
    await route.continue()
  })

  const loadMore = archive.getByRole('button', { name: 'Load more diary' })
  expect((await loadMore.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await loadMore.click()
  const retry = archive.getByRole('button', { name: 'Try again' })
  await expect(archive.getByRole('alert')).toHaveText('Couldn’t load the next page. Everything already shown is still available.')
  await expect(retry).toBeFocused()
  await expect(firstEntry).toBeVisible()
  await expect(secondEntry).toHaveCount(0)
  expect((await retry.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await expectAccessible(page, 'Public Diary archive after a failed page load')
  await mkdir('.impeccable/review/profile-archive', { recursive: true })
  await page.screenshot({ animations: 'disabled', fullPage: true, path: '.impeccable/review/profile-archive/public-diary-page-retry-light-320x720.png' })

  await retry.click()
  await expect(secondEntry).toBeVisible()
  await expect(firstEntry).toBeVisible()
  expect(nextPageAttempts).toBe(2)
  expect(requestedCursors[1]).toBe(requestedCursors[0])
  await expect(page.getByRole('heading', { name: 'Diary', exact: true })).toBeFocused()
  await expect(archive.getByRole('button', { name: /Load more diary|Try again/ })).toHaveCount(0)
  await expectAccessible(page, 'Public Diary archive after page retry')
  await page.screenshot({ animations: 'disabled', fullPage: true, path: '.impeccable/review/profile-archive/public-diary-page-recovered-light-320x720.png' })
})

