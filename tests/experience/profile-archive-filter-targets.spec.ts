import axe from 'axe-core'
import { mkdir } from 'node:fs/promises'
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test'
import { defaultExperiencePreferences } from '../../packages/contracts/src/index'

const api = 'http://127.0.0.1:18563'

async function signIn(context: BrowserContext, request: APIRequestContext) {
  const response = await request.get(`${api}/__fixtures/session`)
  expect(response.ok(), await response.text()).toBe(true)
  const { token, member } = await response.json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  return member as { id: string; username: string }
}

async function expectAccessible(page: Page) {
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    })
    return report.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))
  })
  expect(violations, 'Profile collection filters should meet WCAG 2.2 AA').toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'The archive should fit the phone').toBe(true)
}

test.beforeEach(async ({ request }) => { await request.post(`${api}/__fixtures/reset`, { data: {} }) })

test('owner Watched filters have touch-safe targets and still reveal the right empty state', async ({ page, context, request }) => {
  const member = await signIn(context, request)
  await request.post(`${api}/__fixtures/reset`, {
    data: {
      memberId: member.id,
      watchedArchiveFixture: true,
      ratingDistributionFixture: true,
      preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed', communityDismissed: true },
    },
  })
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  await page.goto(`/profile/${member.username}`)

  const ratingAxis = page.locator('[data-consumit-rating-axis]')
  await expect(ratingAxis).toBeVisible()
  await expect(ratingAxis.locator('[data-consumit-rating-value]')).toHaveText(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'])
  const ratingEight = page.getByRole('link', { name: 'Show 1 title rated 8 out of 10' })
  await expect(ratingEight).toHaveAttribute('href', `/profile/${member.username}/films?rating=8`)
  const ratingEightBounds = await ratingEight.boundingBox()
  expect(ratingEightBounds?.width ?? 0).toBeGreaterThanOrEqual(24)
  expect(ratingEightBounds?.height ?? 0).toBeGreaterThanOrEqual(24)
  await expectAccessible(page)
  await mkdir('.impeccable/review/profile-archive', { recursive: true })
  await page.screenshot({ animations: 'disabled', fullPage: true, path: '.impeccable/review/profile-archive/rating-axis-320x720.png' })
  await ratingEight.click()
  await expect(page).toHaveURL(`/profile/${member.username}/films?rating=8`)
  await expect(page.getByRole('link', { name: /Northbound/ })).toBeVisible()

  await page.goto(`/profile/${member.username}/films`)

  const search = page.getByRole('searchbox', { name: 'Search Watched' })
  await expect(search).toBeVisible()
  expect((await search.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  const filterGroup = page.getByRole('group', { name: 'Filter titles' })
  const selectTriggers = filterGroup.locator('button[aria-haspopup="listbox"]')
  expect(await selectTriggers.count()).toBeGreaterThan(0)
  for (let index = 0; index < await selectTriggers.count(); index++) {
    expect((await selectTriggers.nth(index).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  }
  await expectAccessible(page)

  await search.fill('northbound')
  await expect(page.getByText('1 title shown from 1 loaded')).toBeVisible()
  const reset = page.getByRole('button', { name: 'Reset', exact: true })
  expect((await reset.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await search.fill('no matching title')
  await expect(page.getByText('No loaded titles match these filters. Try another rating, genre, decade, or search.')).toBeVisible()
  await expectAccessible(page)
  await mkdir('.impeccable/review/profile-archive', { recursive: true })
  await page.screenshot({ animations: 'disabled', fullPage: true, path: '.impeccable/review/profile-archive/watched-search-no-match-320x720.png' })

  await reset.click()
  await expect(search).toHaveValue('')
  await expect(page.getByRole('link', { name: /Northbound/ })).toBeVisible()
})

test('owner Watchlist search, type, and display controls remain usable on a phone', async ({ page, context, request }) => {
  const member = await signIn(context, request)
  await request.post(`${api}/__fixtures/reset`, {
    data: {
      memberId: member.id,
      watchlistFixture: true,
      preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed', communityDismissed: true },
    },
  })
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  await page.goto(`/profile/${member.username}/watchlist`)

  const search = page.getByRole('searchbox', { name: 'Search your Watchlist' })
  await expect(search).toBeVisible()
  expect((await search.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  const typeGroup = page.getByRole('group', { name: 'Filter Watchlist by title type' })
  for (let index = 0; index < await typeGroup.getByRole('button').count(); index++) {
    expect((await typeGroup.getByRole('button').nth(index).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  }
  const viewGroup = page.getByRole('group', { name: 'Watchlist display' })
  for (let index = 0; index < await viewGroup.getByRole('button').count(); index++) {
    expect((await viewGroup.getByRole('button').nth(index).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  }
  await expectAccessible(page)

  await search.fill('northbound')
  await expect(page.getByText('1 title shown from 2 loaded')).toBeVisible()
  await typeGroup.getByRole('button', { name: 'Anime', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'No titles match that shelf.' })).toBeVisible()
  const clear = page.getByRole('button', { name: 'Clear filters' })
  expect((await clear.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await expectAccessible(page)
  await mkdir('.impeccable/review/profile-archive', { recursive: true })
  await page.screenshot({ animations: 'disabled', fullPage: true, path: '.impeccable/review/profile-archive/watchlist-filter-empty-320x720.png' })

  await clear.click()
  await expect(search).toHaveValue('')
  await expect(page.getByRole('link', { name: /Northbound/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Severance/ })).toBeVisible()

  await typeGroup.getByRole('button', { name: 'Series', exact: true }).click()
  await expect(page.getByRole('link', { name: /Severance/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Northbound/ })).toHaveCount(0)
  const shelf = viewGroup.getByRole('button', { name: 'Shelf', exact: true })
  const posters = viewGroup.getByRole('button', { name: 'Posters', exact: true })
  await shelf.click()
  await expect(shelf).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('link', { name: /Severance/ })).toBeVisible()
  await posters.click()
  await expect(posters).toHaveAttribute('aria-pressed', 'true')
  await typeGroup.getByRole('button', { name: 'All', exact: true }).click()
  await expect(page.getByRole('link', { name: /Northbound/ })).toBeVisible()
})

test('owner Diary search and filters have touch-safe targets and recover loaded entries', async ({ page, context, request }) => {
  const member = await signIn(context, request)
  await request.post(`${api}/__fixtures/reset`, {
    data: {
      memberId: member.id,
      diaryArchiveFixture: true,
      preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed', communityDismissed: true },
    },
  })
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  await page.goto(`/profile/${member.username}/diary`)

  const search = page.getByRole('searchbox', { name: 'Search Diary' })
  await expect(search).toBeVisible()
  expect((await search.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(160)
  expect(await search.evaluate(element => element.closest('label')?.getBoundingClientRect().height ?? 0)).toBeGreaterThanOrEqual(44)
  const filters = page.getByRole('group', { name: 'Filter Diary' })
  const filterButtons = filters.getByRole('button')
  expect(await filterButtons.count()).toBeGreaterThan(0)
  for (let index = 0; index < await filterButtons.count(); index++) {
    expect((await filterButtons.nth(index).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  }
  await expect(page.locator('[data-consumit-diary-row]')).toHaveCount(2)
  await filters.getByRole('button', { name: /Filter Diary by watch type/ }).click()
  await page.getByRole('option', { name: 'Rewatches' }).click()
  await expect(page.getByText('1 entry shown from 2 loaded')).toBeVisible()
  await expect(page.locator('[data-consumit-diary-row]')).toHaveCount(1)
  const reset = page.getByRole('button', { name: 'Reset', exact: true })
  expect((await reset.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await expectAccessible(page)
  await mkdir('.impeccable/review/profile-archive', { recursive: true })
  await page.screenshot({ animations: 'disabled', fullPage: true, path: '.impeccable/review/profile-archive/diary-rewatches-320x720.png' })

  await reset.click()
  await expect(page.locator('[data-consumit-diary-row]')).toHaveCount(2)
  await expect(page.getByRole('button', { name: /Filter Diary by watch type/ })).toContainText('All watches')
  await search.fill('no matching title')
  await expect(page.getByRole('heading', { name: 'No diary entries match.' })).toBeVisible()
  const clear = page.getByRole('button', { name: 'Clear filters' })
  expect((await clear.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await clear.click()
  await expect(page.locator('[data-consumit-diary-row]')).toHaveCount(2)

  await page.setViewportSize({ width: 1440, height: 960 })
  await page.evaluate(() => localStorage.setItem('consumit.home-theme', 'light'))
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-consumit-theme', 'light')
  await expect(page.locator('[data-consumit-diary-row]')).toHaveCount(2)
  expect((await search.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(160)
  for (let index = 0; index < await filterButtons.count(); index++) {
    expect((await filterButtons.nth(index).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  }
  await expectAccessible(page)
  await page.screenshot({ animations: 'disabled', fullPage: true, path: '.impeccable/review/profile-archive/diary-light-1440x960.png' })
})

test('owner Diary edit and delete confirmation actions are touch-safe and return focus', async ({ page, context, request }) => {
  const member = await signIn(context, request)
  await request.post(`${api}/__fixtures/reset`, {
    data: {
      memberId: member.id,
      diaryArchiveFixture: true,
      preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed', communityDismissed: true },
    },
  })
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  await page.goto(`/profile/${member.username}/diary`)

  const row = page.locator('[data-consumit-diary-row]').first()
  const edit = row.getByRole('button', { name: /Edit diary entry for/ })
  const remove = row.getByRole('button', { name: /Delete diary entry for/ })
  for (const action of [edit, remove]) {
    expect((await action.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  }
  await edit.click()
  const editor = page.getByRole('form', { name: /^Edit Northbound.*diary entry$/ })
  const date = editor.getByLabel('Watched date')
  const rewatch = editor.getByLabel('Rewatch')
  const tags = editor.getByLabel('Tags')
  const save = editor.getByRole('button', { name: 'Save entry' })
  const cancel = editor.getByRole('button', { name: 'Cancel' })
  await expect(date).toBeFocused()
  expect((await date.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect(await rewatch.evaluate(element => element.closest('label')?.getBoundingClientRect().height ?? 0)).toBeGreaterThanOrEqual(44)
  for (const control of [tags, save, cancel]) expect((await control.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await expectAccessible(page)
  await mkdir('.impeccable/review/profile-archive', { recursive: true })
  await page.screenshot({ animations: 'disabled', fullPage: true, path: '.impeccable/review/profile-archive/diary-edit-320x720.png' })

  await cancel.click()
  await expect(edit).toBeFocused()
  await remove.click()
  const confirmation = page.getByRole('group', { name: /^Delete Northbound.*diary entry$/ })
  const deleteEntry = confirmation.getByRole('button', { name: 'Delete entry' })
  const keepEntry = confirmation.getByRole('button', { name: 'Keep entry' })
  await expect(deleteEntry).toBeFocused()
  for (const action of [deleteEntry, keepEntry]) {
    expect((await action.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  }
  await expectAccessible(page)
  await page.screenshot({ animations: 'disabled', fullPage: true, path: '.impeccable/review/profile-archive/diary-delete-confirmation-320x720.png' })
  await keepEntry.click()
  await expect(remove).toBeFocused()
  await expect(row).toBeVisible()
})

test('public profile section navigation replaces the previously loaded archive', async ({ page, request }) => {
  const sessionResponse = await request.get(`${api}/__fixtures/session`)
  expect(sessionResponse.ok(), await sessionResponse.text()).toBe(true)
  const { member } = await sessionResponse.json()
  await request.post(`${api}/__fixtures/reset`, {
    data: {
      memberId: member.id,
      diaryArchiveFixture: true,
      preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed', communityDismissed: true },
    },
  })
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  await page.goto(`/profile/${member.username}/diary`)

  await expect(page.getByRole('link', { name: /Northbound/ }).first()).toBeVisible()
  const profileStats = page.locator('[data-consumit-public-profile] header a').filter({ hasText: /ratings|reviews|lists|followers|following/ })
  await expect(profileStats).toHaveCount(5)
  for (const target of await profileStats.all()) {
    expect((await target.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  }
  const navigation = page.getByRole('navigation', { name: `${member.username} profile sections` })
  await navigation.getByRole('link', { name: /^Watchlist/ }).click()
  await expect(page).toHaveURL(`/profile/${member.username}/watchlist`)
  await expect(page.getByRole('heading', { name: 'Watchlist', exact: true })).toBeVisible()
  await expect(page.getByText('No public titles saved for later yet.')).toBeVisible()
  await expect(page.getByRole('link', { name: /Northbound/ })).toHaveCount(0)
  await expectAccessible(page)
  await mkdir('.impeccable/review/profile-archive', { recursive: true })
  await page.screenshot({ animations: 'disabled', fullPage: true, path: '.impeccable/review/profile-archive/visitor-section-switch-320x720.png' })
})
