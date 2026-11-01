import axe from 'axe-core'
import { mkdir } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { defaultExperiencePreferences } from '../../packages/contracts/src/index'

const api = 'http://127.0.0.1:18563'
const origin = 'http://127.0.0.1:28114'

async function expectAccessible(page: Page, label: string) {
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return report.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))
  })
  expect(violations, `${label} WCAG 2.2 AA`).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label} horizontal overflow`).toBe(true)
}

for (const scenario of [
  { theme: 'dark', width: 1440, height: 960 },
  { theme: 'light', width: 320, height: 720 },
] as const) test(`first-visit welcome explains the product and returns focus to Browse in ${scenario.theme} ${scenario.width}px layout`, async ({ page, request }) => {
  await request.post(`${api}/__fixtures/reset`, { data: {} })
  await page.setViewportSize({ width: scenario.width, height: scenario.height })
  await page.addInitScript(({ theme, preferences }) => {
    localStorage.setItem('consumit.home-theme', theme)
    localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ ...preferences, guideVersion: 1, guideStatus: 'dismissed' }))
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
  }, { theme: scenario.theme, preferences: defaultExperiencePreferences() })
  await page.goto('/movies')

  const welcome = page.getByRole('dialog', { name: 'Welcome to Consumit.' })
  await expect(welcome).toBeVisible()
  await page.screenshot({ animations: 'disabled', fullPage: true, path: `.impeccable/review/onboarding/welcome-first-visit-${scenario.theme}-${scenario.width}x${scenario.height}.png` })
  await expect(welcome).toContainText('Browse movies, series, and anime.')
  await expect(welcome).toContainText('Sign in to sync your Watchlist and progress across devices.')
  await expect(welcome).toContainText('A few pop-under ads may open while you browse; turn them off in Settings.')
  const explore = welcome.getByRole('button', { name: 'Start exploring', exact: true })
  const share = welcome.getByRole('button', { name: 'Share Consumit', exact: true })
  const copy = welcome.getByRole('button', { name: 'Copy Consumit link', exact: true })
  const close = welcome.getByRole('button', { name: 'Close welcome', exact: true })
  await expect(explore).toHaveClass(/bg-orange/)
  await expect(share).toHaveClass(/border/)
  expect((await explore.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  for (const target of [share, copy, close]) expect((await target.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await expectAccessible(page, `First-visit welcome ${scenario.theme} ${scenario.width}px`)

  await share.click()
  const shareOptions = welcome.locator('#welcome-share-options a')
  await expect(shareOptions).toHaveCount(5)
  for (let index = 0; index < await shareOptions.count(); index += 1) {
    expect((await shareOptions.nth(index).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  }
  await expectAccessible(page, `Expanded first-visit sharing ${scenario.theme} ${scenario.width}px`)

  await explore.click()
  await expect(welcome).not.toBeVisible()
  await expect(page.getByRole('heading', { name: 'Movies.', exact: true })).toBeVisible()
  await expect(page.locator('#consumit-main-content')).toBeFocused()
  expect(new URL(page.url()).pathname).toBe('/movies')

  await page.evaluate(() => localStorage.removeItem('consumit.share-welcome-dismissed.v1'))
  await page.reload()
  await expect(welcome).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(welcome).not.toBeVisible()
  await expect(page.locator('#consumit-main-content')).toBeFocused()
})

test('legacy onboarding routes preserve safe destinations and reject external ones', async ({ page }) => {
  await page.goto('/onboarding/history?next=%2Flibrary')
  await expect(page).toHaveURL('/onboarding?next=%2Flibrary')

  await page.goto('/onboarding/circle?next=%2Fprofile%2Fexperience_fixture%2Fhistory')
  await expect(page).toHaveURL('/profile/experience_fixture/history', { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible()

  await page.goto('/onboarding/circle?next=https%3A%2F%2Fevil.example')
  await expect(page).toHaveURL('/')
})

test('Google signup requires explicit consent on a light phone and keeps the requested destination', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 })
  await page.addInitScript(() => localStorage.setItem('consumit.home-theme', 'light'))
  await page.route('**/v1/auth/google/pending', route => route.fulfill({ json: { email: 'google@example.test', name: 'Google Fan' } }))
  await page.route('**/v1/usernames/*/availability', route => route.fulfill({ json: { available: true, username: 'google_fan' } }))
  let completions = 0
  await page.route('**/v1/auth/google/complete', route => {
    completions += 1
    return route.fulfill({ json: { status: 'complete', member: {
      avatarStyle: 'dusk', avatarUrl: null, createdAt: '2026-10-30T12:00:00.000Z', displayName: 'Google Fan',
      email: 'google@example.test', emailVerified: true, id: 'b5da6182-70bd-4335-8e7f-0f620d8faf43', role: 'member', username: 'google_fan',
    } } })
  })

  await page.goto('/sign-up/google?next=%2Flibrary')
  await expect(page.getByRole('heading', { name: 'Choose your identity.', exact: true })).toBeVisible()
  const termsAcceptance = page.getByRole('checkbox', { name: 'I agree to the Terms and Privacy Policy' })
  const createAccount = page.getByRole('button', { name: 'Create account', exact: true })
  await expect(termsAcceptance).not.toBeChecked()
  await expect(page.getByLabel('Username', { exact: true })).toBeEnabled()
  expect((await termsAcceptance.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(44)
  expect((await termsAcceptance.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect((await createAccount.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await expectAccessible(page, 'Google signup identity step')
  await mkdir('.impeccable/review/onboarding', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/onboarding/google-signup-light-320x844.png' })

  await page.getByLabel('Username', { exact: true }).fill('google_fan')
  await createAccount.click()
  await expect(page.getByRole('heading', { name: 'Choose your identity.', exact: true })).toBeVisible()
  expect(completions).toBe(0)
  await termsAcceptance.check()
  await createAccount.click()
  await expect(page).toHaveURL('/onboarding?next=%2Flibrary')
  expect(completions).toBe(1)
})

for (const scenario of [
  { theme: 'dark', height: 844 },
  { theme: 'light', height: 720 },
] as const) test(`a new member can finish onboarding and reach Library and Profile in ${scenario.theme} theme`, async ({ page, request }) => {
  const suffix = Date.now().toString().slice(-8)
  const username = `taste_${suffix}`
  await request.post(`${api}/__fixtures/reset`, { data: {} })
  await page.setViewportSize({ width: 320, height: scenario.height })
  await page.addInitScript((theme) => {
    localStorage.setItem('consumit.home-theme', theme)
    localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({
    audioLanguage: 'fr', animeAudio: 'sub', subtitlesEnabled: true, subtitleLanguages: ['fr', 'en'],
    qualityHeight: null, autoplayNextEpisode: false, guideVersion: 1, guideStatus: 'dismissed', communityDismissed: false,
    }))
  }, scenario.theme)
  await page.goto('/onboarding/favorites?next=%2Flibrary')
  await expect(page.locator('html')).toHaveAttribute('data-consumit-theme', scenario.theme)
  await page.getByRole('link', { name: 'Create an account', exact: true }).click()
  await expect(page).toHaveURL(/\/sign-up\?next=/)
  const signupContinue = page.getByRole('button', { name: 'Continue', exact: true })
  const termsAcceptance = page.locator('#account-terms')
  await expect(termsAcceptance).not.toBeChecked()
  expect((await signupContinue.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect((await termsAcceptance.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(44)
  expect((await termsAcceptance.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await expectAccessible(page, 'Sign-up account step')
  await mkdir('.impeccable/review/onboarding', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: `.impeccable/review/onboarding/signup-account-${scenario.theme}-320x${scenario.height}.png` })
  await page.getByLabel('Email', { exact: true }).fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill('experience-fixture-password')
  await signupContinue.click()
  await expect(page.getByRole('heading', { name: 'Create your account.', exact: true })).toBeVisible()
  await expect(page.getByLabel('Username', { exact: true })).toHaveCount(0)
  await termsAcceptance.check()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Choose your identity.', exact: true })).toBeVisible()
  await expectAccessible(page, 'Sign-up identity step')
  await page.screenshot({ animations: 'disabled', path: `.impeccable/review/onboarding/signup-identity-${scenario.theme}-320x${scenario.height}.png` })
  await page.getByLabel('Username', { exact: true }).fill(username)
  await page.getByRole('button', { name: 'Send verification code', exact: true }).click()
  await expect(page.getByLabel('Verification code')).toBeVisible()
  await expectAccessible(page, 'Sign-up verification step')
  await page.screenshot({ animations: 'disabled', path: `.impeccable/review/onboarding/signup-verification-${scenario.theme}-320x${scenario.height}.png` })
  const { code } = await (await request.get(`${api}/__fixtures/code`)).json()
  await page.getByLabel('Verification code').fill(code.code)
  await page.getByRole('button', { name: 'Verify and continue', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Make yourself at home.', exact: true })).toBeFocused()
  const savePreferences = page.getByRole('button', { name: 'Save viewing preferences and continue', exact: true })
  const preferenceActions = page.locator('[data-consumit-onboarding-actions]')
  await expect(savePreferences).toBeInViewport()
  await expect(preferenceActions).toHaveCSS('position', 'fixed')
  await expectAccessible(page, `${scenario.theme} member viewing preferences`)
  await mkdir('.impeccable/review/onboarding', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: `.impeccable/review/onboarding/preferences-member-${scenario.theme}-320x${scenario.height}.png` })
  await page.getByRole('button', { name: 'Use device choices', exact: true }).click()
  await expect(page.getByRole('button', { name: /Movie & series audio/ })).toContainText('Français')
  await expect(savePreferences).toBeInViewport()

  await page.setViewportSize({ width: 1440, height: 960 })
  await expect(preferenceActions).toHaveCSS('position', 'static')
  await expect(savePreferences).toBeInViewport()
  await expectAccessible(page, `${scenario.theme} member viewing preferences desktop`)
  await page.screenshot({ animations: 'disabled', path: `.impeccable/review/onboarding/preferences-member-${scenario.theme}-1440x960.png` })
  await page.setViewportSize({ width: 320, height: scenario.height })
  await expect(preferenceActions).toHaveCSS('position', 'fixed')

  let preferenceWrites = 0
  await page.route('**/v1/me/experience-preferences', async route => {
    if (route.request().method() !== 'PATCH') return route.continue()
    preferenceWrites += 1
    if (preferenceWrites === 1) return route.fulfill({ status: 503, json: {} })
    return route.continue()
  })
  const actionBoundsBeforeSave = (await preferenceActions.boundingBox())!
  await savePreferences.click()
  const preferenceFailure = page.getByRole('alert').filter({ hasText: 'Your choices are kept here. Retry to save them.' })
  await expect(preferenceFailure).toBeVisible()
  const retryPreferences = page.getByRole('button', { name: 'Retry save', exact: true })
  await expect(retryPreferences).toBeInViewport()
  expect((await retryPreferences.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  const actionBoundsAfterFailure = (await preferenceActions.boundingBox())!
  expect(Math.abs(actionBoundsAfterFailure.y - actionBoundsBeforeSave.y), 'A save error should not grow the fixed action over more preferences').toBeLessThan(1)
  await expectAccessible(page, `${scenario.theme} member viewing preference retry`)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ animations: 'disabled', path: `.impeccable/review/onboarding/preferences-save-retry-${scenario.theme}-320x${scenario.height}.png` })
  await retryPreferences.click()
  expect(preferenceWrites).toBe(2)
  await expect(page.getByText('Your Favorites · 0/4')).toBeVisible()
  await expectAccessible(page, `${scenario.theme} member Favorites`)

  const firstChoice = page.locator('[data-consumit-selectable-title]').first()
  const firstCheckbox = firstChoice.getByRole('checkbox')
  const selectedRef = await firstCheckbox.getAttribute('value')
  expect(selectedRef).toMatch(/^(movie|series):\d+$/)
  await firstChoice.click()
  await expect(firstCheckbox).toBeChecked()

  let favoriteWrites = 0
  await page.route('**/v1/me/favorites', async route => {
    if (route.request().method() !== 'PUT') return route.continue()
    favoriteWrites += 1
    if (favoriteWrites === 1) {
      await route.fulfill({ status: 503, json: { error: { code: 'AUTH_STATE_UNAVAILABLE', message: 'Favorite save is temporarily unavailable.', retryable: true } } })
      return
    }
    await route.continue()
  })

  const save = page.getByRole('button', { name: 'Save Favorites and continue', exact: true })
  expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await save.focus()
  await page.keyboard.press('Enter')
  const failure = page.getByRole('alert').filter({ hasText: 'Favorites could not be saved. Your selections are kept here.' })
  await expect(failure).toBeVisible()
  const retry = page.getByRole('button', { name: 'Retry saving Favorites', exact: true })
  await expect(retry).toBeFocused()
  expect(await retry.evaluate(element => element.matches(':focus-visible'))).toBe(true)
  await expect(firstCheckbox).toBeChecked()
  expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return report.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))
  })
  expect(violations, 'Favorites retry at 320px').toEqual([])
  await mkdir('.impeccable/review/onboarding', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: `.impeccable/review/onboarding/favorites-save-retry-${scenario.theme}-320x${scenario.height}.png` })

  await retry.click()
  await expect(page.getByRole('heading', { name: 'You’re ready to watch.', exact: true })).toBeVisible()
  await expectAccessible(page, `${scenario.theme} member onboarding complete`)
  expect(favoriteWrites).toBe(2)
  const member = (await (await page.request.get(`${origin}/v1/me`)).json()).member as { id: string; username: string }
  const state = await (await request.get(`${api}/__fixtures/state`)).json()
  expect(state.favorites.find(([owner]: [string, unknown]) => owner === member.id)?.[1]).toEqual([{ kind: selectedRef!.split(':')[0], id: Number(selectedRef!.split(':')[1]) }])

  await page.getByRole('button', { name: 'Start browsing', exact: true }).click()
  await expect(page).toHaveURL(`/profile/${username}/history`, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Watch history', exact: true })).toBeVisible()
  const profileSections = page.getByRole('navigation', { name: `${username} profile sections` })
  await profileSections.getByRole('link', { name: 'Overview', exact: true }).click()
  await expect(page).toHaveURL(`/profile/${username}`)
  await expect(page.getByRole('heading', { name: 'Favorite titles', exact: true })).toBeVisible()
  await expect(page.locator(`a[href="/title/${selectedRef!.split(':')[1]}"]`)).toBeVisible()
  await expectAccessible(page, `${scenario.theme} member Profile overview`)
})

test('guest onboarding stays readable in the light theme on a short phone and honors Browse destination', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript((preferences) => {
    localStorage.setItem('consumit.home-theme', 'light')
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ ...preferences, guideVersion: 1, guideStatus: 'dismissed' }))
  }, defaultExperiencePreferences())

  const expectAccessibleLayout = async (label: string) => {
    await expect(page.locator('html')).toHaveAttribute('data-consumit-theme', 'light')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label} horizontal overflow`).toBe(true)
    await page.addScriptTag({ content: axe.source })
    const violations = await page.evaluate(async () => {
      const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
      return (await axeApi.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.map(violation => ({
        id: violation.id,
        targets: violation.nodes.map(node => node.target),
        ...(violation.id === 'color-contrast' ? { contrast: violation.nodes.map(node => ({ target: node.target, checks: node.any.map(check => check.data) })) } : {}),
      }))
    })
    expect(violations, `${label} WCAG 2.2 AA`).toEqual([])
  }

  await page.goto('/onboarding?next=%2Fmovies')
  await expect(page.getByRole('heading', { name: 'Make yourself at home.', exact: true })).toBeFocused()
  const skip = page.getByRole('link', { name: 'Skip', exact: true })
  expect((await skip.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  const savePreferences = page.getByRole('button', { name: 'Save viewing preferences and continue', exact: true })
  await expect(savePreferences, 'The first onboarding action should be visible without scrolling on a short phone').toBeInViewport()
  expect((await savePreferences.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await expectAccessibleLayout('Viewing Preferences')
  await mkdir('.impeccable/review/onboarding', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/onboarding/preferences-light-320x720.png' })

  await savePreferences.focus()
  await page.keyboard.press('Shift+Tab')
  const autoplay = page.getByRole('switch', { name: 'Autoplay next episode', exact: true })
  await expect(autoplay).toBeFocused()
  expect(await autoplay.evaluate(element => element.matches(':focus-visible'))).toBe(true)
  const autoplayBounds = (await autoplay.boundingBox())!
  const actionBounds = (await page.locator('[data-consumit-onboarding-actions]').boundingBox())!
  expect(autoplayBounds.y + autoplayBounds.height, 'Focused preference controls must remain above the fixed action').toBeLessThanOrEqual(actionBounds.y)
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/onboarding/preferences-keyboard-light-320x720.png' })

  await savePreferences.click()
  await expect(page).toHaveURL('/onboarding/favorites?next=%2Fmovies')
  await expect(page.getByRole('heading', { name: 'A few of your favorites.', exact: true })).toBeFocused()
  await expectAccessibleLayout('Guest Favorites')
  await page.getByRole('link', { name: 'Continue without an account', exact: true }).click()
  await expect(page).toHaveURL('/onboarding/ready?next=%2Fmovies')
  await expect(page.getByRole('heading', { name: 'You’re ready to watch.', exact: true })).toBeVisible()
  await expectAccessibleLayout('Welcome Guide ready step')

  const startBrowsing = page.getByRole('button', { name: 'Start browsing', exact: true })
  expect((await startBrowsing.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await startBrowsing.click()
  await expect(page).toHaveURL('/movies')
  await expect(page.getByRole('heading', { name: 'Movies.', exact: true })).toBeVisible()
})
