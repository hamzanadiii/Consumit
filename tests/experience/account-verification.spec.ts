import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import axe from 'axe-core'

const api = 'http://127.0.0.1:18563'
const destination = '/lists/quiet-evenings?from=verification#consumit-main-content'
const next = new URLSearchParams({ next: destination }).toString()
const origin = 'http://127.0.0.1:28114'

test('sign-in validates email and password length before sending credentials on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 })
  let loginCalls = 0
  await page.route('**/v1/auth/login', async route => {
    loginCalls += 1
    await route.fulfill({ status: 503, json: { error: { code: 'AUTH_STATE_UNAVAILABLE', message: 'Sign in is temporarily unavailable.', requestId: 'signin-validation', retryable: true } } })
  })
  await page.goto(`/sign-in?${next}`)
  const email = page.getByRole('textbox', { name: 'Email', exact: true })
  const password = page.getByLabel('Password', { exact: true })
  const submit = page.getByRole('button', { name: 'Sign in', exact: true })
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => (await (window as Window & { axe: typeof axe }).axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  })).violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })))
  expect(violations).toEqual([])
  await mkdir('.impeccable/review/account-verification', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/account-verification/sign-in-validation-320x844.png' })

  await email.fill('member@example.test')
  await password.fill('too-short')
  await submit.click()
  await expect(password).toBeFocused()
  expect(await password.evaluate(input => (input as HTMLInputElement).validity.tooShort)).toBe(true)
  expect(loginCalls).toBe(0)

  await password.fill('a-valid-password')
  await email.fill('not-an-email')
  await submit.click()
  await expect(email).toBeFocused()
  expect(await email.evaluate(input => (input as HTMLInputElement).validity.typeMismatch)).toBe(true)
  expect(loginCalls).toBe(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
})

test('sign-in outage retains credentials, announces recovery and retries the original Anime Search task', async ({ page }) => {
  const destination = '/search?q=evening&type=anime'
  await page.setViewportSize({ width: 320, height: 844 })
  await page.addInitScript(() => {
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ guideStatus: 'dismissed', guideVersion: 1, communityDismissed: true }))
  })
  let loginCalls = 0
  let release!: () => void
  const failureGate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/v1/auth/login', async route => {
    loginCalls += 1
    if (loginCalls === 1) {
      await failureGate
      await route.fulfill({ status: 503, json: { error: { code: 'AUTH_STATE_UNAVAILABLE', message: 'Sign in is temporarily unavailable. Try again.', requestId: 'signin-retry', retryable: true } } })
      return
    }
    await route.continue()
  })
  await page.goto(`/sign-in?${new URLSearchParams({ next: destination })}`)
  const email = page.getByRole('textbox', { name: 'Email', exact: true })
  const password = page.getByLabel('Password', { exact: true })
  const submit = page.getByRole('button', { name: 'Sign in', exact: true })
  await email.fill('experience@example.test')
  await password.fill('experience-fixture-password')

  await submit.click()
  try {
    await expect(email).toBeDisabled()
    await expect(password).toBeDisabled()
    await expect(submit).toBeDisabled()
    await expect(submit).toHaveAttribute('aria-busy', 'true')
  } finally { release() }

  const error = page.getByRole('main').getByRole('alert')
  await expect(error).toContainText('Sign in is temporarily unavailable. Try again.')
  await expect(error).toBeFocused()
  await expect(email).toHaveValue('experience@example.test')
  await expect(password).toHaveValue('experience-fixture-password')
  await expect(submit).toBeEnabled()
  expect((await submit.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)

  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => (await (window as Window & { axe: typeof axe }).axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  })).violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })))
  expect(violations, 'Sign-in service failure at 320px').toEqual([])
  await mkdir('.impeccable/review/account-verification', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/account-verification/sign-in-retry-320x844.png' })

  await submit.click()
  await expect(page).toHaveURL(destination)
  const welcome = page.getByRole('dialog', { name: 'Welcome to Consumit.' })
  if (await welcome.count()) await welcome.getByRole('button', { name: 'Start exploring', exact: true }).click()
  await expect(page.getByRole('searchbox', { name: 'Search movies, series, and anime' })).toHaveValue('evening')
  await expect(page.getByRole('group', { name: 'Filter results' }).getByRole('button', { name: 'Anime' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Evening stories', { exact: true })).toBeVisible()
  expect(loginCalls).toBe(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
})

test('sign-in connection loss keeps the credentials and restores the original search after retry', async ({ page }) => {
  const destination = '/search?q=evening&type=anime'
  await page.setViewportSize({ width: 320, height: 844 })
  await page.addInitScript(() => {
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ guideStatus: 'dismissed', guideVersion: 1, communityDismissed: true }))
  })
  let loginCalls = 0
  await page.route('**/v1/auth/login', async route => {
    loginCalls += 1
    if (loginCalls === 1) {
      await route.abort('failed')
      return
    }
    await route.continue()
  })
  await page.goto(`/sign-in?${new URLSearchParams({ next: destination })}`)
  const email = page.getByRole('textbox', { name: 'Email', exact: true })
  const password = page.getByLabel('Password', { exact: true })
  const submit = page.getByRole('button', { name: 'Sign in', exact: true })
  await email.fill('experience@example.test')
  await password.fill('experience-fixture-password')
  await submit.click()

  const error = page.getByRole('main').getByRole('alert')
  await expect(error).toHaveText('The account service could not be reached. Check your connection and try again.')
  await expect(error).toBeFocused()
  await expect(email).toHaveValue('experience@example.test')
  await expect(password).toHaveValue('experience-fixture-password')
  expect((await submit.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)

  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => (await (window as Window & { axe: typeof axe }).axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  })).violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })))
  expect(violations, 'Sign-in connection failure at 320px').toEqual([])
  await mkdir('.impeccable/review/account-verification', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/account-verification/sign-in-connection-retry-320x844.png' })

  await submit.click()
  await expect(page).toHaveURL(destination)
  const welcome = page.getByRole('dialog', { name: 'Welcome to Consumit.' })
  if (await welcome.count()) await welcome.getByRole('button', { name: 'Start exploring', exact: true }).click()
  await expect(page.getByRole('searchbox', { name: 'Search movies, series, and anime' })).toHaveValue('evening')
  await expect(page.getByRole('group', { name: 'Filter results' }).getByRole('button', { name: 'Anime' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Evening stories', { exact: true })).toBeVisible()
  expect(loginCalls).toBe(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
})

test('sign-in turns an unreadable server error into clear recovery and preserves the search task', async ({ page }) => {
  const destination = '/search?q=evening&type=anime'
  await page.setViewportSize({ width: 320, height: 844 })
  await page.addInitScript(() => {
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({ guideStatus: 'dismissed', guideVersion: 1, communityDismissed: true }))
  })
  let loginCalls = 0
  await page.route('**/v1/auth/login', async route => {
    loginCalls += 1
    if (loginCalls === 1) {
      await route.fulfill({ status: 503, contentType: 'text/html', body: '<html>upstream unavailable</html>' })
      return
    }
    await route.continue()
  })
  await page.goto(`/sign-in?${new URLSearchParams({ next: destination })}`)
  const email = page.getByRole('textbox', { name: 'Email', exact: true })
  const password = page.getByLabel('Password', { exact: true })
  const submit = page.getByRole('button', { name: 'Sign in', exact: true })
  await email.fill('experience@example.test')
  await password.fill('experience-fixture-password')
  await submit.click()

  const error = page.getByRole('main').getByRole('alert')
  await expect(error).toHaveText('The account service is temporarily unavailable. Try again.')
  await expect(error).toBeFocused()
  await expect(email).toHaveValue('experience@example.test')
  await expect(password).toHaveValue('experience-fixture-password')
  expect((await submit.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)

  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => (await (window as Window & { axe: typeof axe }).axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  })).violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })))
  expect(violations, 'Sign-in server failure at 320px').toEqual([])
  await mkdir('.impeccable/review/account-verification', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/account-verification/sign-in-server-retry-320x844.png' })

  await submit.click()
  await expect(page).toHaveURL(destination)
  const welcome = page.getByRole('dialog', { name: 'Welcome to Consumit.' })
  if (await welcome.count()) await welcome.getByRole('button', { name: 'Start exploring', exact: true }).click()
  await expect(page.getByRole('searchbox', { name: 'Search movies, series, and anime' })).toHaveValue('evening')
  await expect(page.getByRole('group', { name: 'Filter results' }).getByRole('button', { name: 'Anime' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Evening stories', { exact: true })).toBeVisible()
  expect(loginCalls).toBe(2)
})

test('sign-in rate limiting explains the pause and keeps credentials and the return task', async ({ page }) => {
  const destination = '/search?q=evening&type=anime'
  await page.setViewportSize({ width: 320, height: 844 })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  let loginCalls = 0
  await page.route('**/v1/auth/login', async route => {
    loginCalls += 1
    if (loginCalls === 1) {
      await route.fulfill({ status: 429, json: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Back off and retry.', requestId: 'signin-rate-limit', retryable: true } } })
      return
    }
    await route.continue()
  })
  await page.goto(`/sign-in?${new URLSearchParams({ next: destination })}`)
  const email = page.getByRole('textbox', { name: 'Email', exact: true })
  const password = page.getByLabel('Password', { exact: true })
  const submit = page.getByRole('button', { name: 'Sign in', exact: true })
  await email.fill('experience@example.test')
  await password.fill('experience-fixture-password')
  await submit.click()

  const error = page.getByRole('main').getByRole('alert')
  await expect(error).toHaveText('Too many sign-in attempts. Please wait a little, then try again.')
  await expect(error).toBeFocused()
  await expect(email).toHaveValue('experience@example.test')
  await expect(password).toHaveValue('experience-fixture-password')
  await expect(submit).toBeEnabled()
  expect((await submit.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => (await (window as Window & { axe: typeof axe }).axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  })).violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })))
  expect(violations, 'Sign-in rate-limit recovery at 320px').toEqual([])
  await mkdir('.impeccable/review/account-verification', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/account-verification/sign-in-rate-limit-320x844.png' })

  await submit.click()
  await expect(page).toHaveURL(destination)
  await expect(page.getByRole('searchbox', { name: 'Search movies, series, and anime' })).toHaveValue('evening')
  await expect(page.getByRole('group', { name: 'Filter results' }).getByRole('button', { name: 'Anime' })).toHaveAttribute('aria-pressed', 'true')
  expect(loginCalls).toBe(2)
})

test('switching between sign-in, signup and verification retains the intended task', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/sign-in?${next}`)
  await page.getByRole('link', { name: 'Create your account', exact: true }).click()
  await expect(page).toHaveURL(`/sign-up?${next}`)
  const signIn = page.getByRole('link', { name: 'Sign in', exact: true })
  expect((await signIn.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await signIn.click()
  await expect(page).toHaveURL(`/sign-in?${next}`)
  await page.route('**/v1/auth/login', route => route.fulfill({ status: 401, json: { error: { code: 'EMAIL_NOT_VERIFIED', message: 'Verify your email to continue.', requestId: 'verification-fixture', retryable: false } } }))
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('pending@example.test')
  await page.getByLabel('Password', { exact: true }).fill('still-a-secure-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const verify = page.getByRole('link', { name: 'Verify it now', exact: true })
  await expect(verify).toHaveAttribute('href', `/verify-email?${next}`)
  await verify.click()
  await expect(page).toHaveURL(`/verify-email?${next}`)
  await expect(page.getByRole('heading', { name: 'Verify your email.', exact: true })).toBeVisible()
})

test('standalone verification retains fields after failure and keeps the task through onboarding', async ({ page, request }) => {
  const username = `verify_${crypto.randomUUID().slice(0, 8)}`
  const email = `${username}@example.test`
  const registered = await request.post(`${api}/v1/auth/register`, { headers: { origin }, data: { username, email, password: 'verification-fixture-password' } })
  expect(registered.ok(), await registered.text()).toBe(true)
  const delivered = (await (await request.get(`${api}/__fixtures/code`)).json()).code
  await request.post(`${api}/__fixtures/reset`, { data: { collectionFixture: true, publicCollection: true, collectionRole: 'visitor' } })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto(`/verify-email?${next}`)
  const address = page.getByRole('textbox', { name: 'Email', exact: true })
  const code = page.getByRole('textbox', { name: 'Verification code', exact: true })
  await address.fill(email)
  await code.fill(delivered.code)
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const verificationRoute = '**/v1/auth/verify-email'
  await page.route(verificationRoute, async route => {
    await gate
    await route.fulfill({ status: 503, json: { error: { code: 'AUTH_STATE_UNAVAILABLE', message: 'Email verification is temporarily unavailable. Try again.', requestId: 'verification-fixture', retryable: true } } })
  })
  await code.press('Enter')
  try {
    await expect(address).toBeDisabled()
    await expect(code).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Verifying email…', exact: true })).toBeDisabled()
  } finally { release() }
  const error = page.getByRole('main').getByRole('alert')
  await expect(error).toHaveText('Email verification is temporarily unavailable. Try again.')
  await expect(error).toBeFocused()
  await expect(address).toHaveValue(email)
  await expect(code).toHaveValue(delivered.code)
  await expect(code).toBeEnabled()
  await mkdir('.impeccable/review/account-verification', { recursive: true })
  await page.screenshot({ path: '.impeccable/review/account-verification/standalone-retry-mobile.png' })
  await page.unroute(verificationRoute)
  await code.press('Enter')
  await expect(page).toHaveURL(`/onboarding?${next}`)
  await expect(page.getByRole('heading', { name: 'Make yourself at home.', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Skip', exact: true }).click()
  await expect(page).toHaveURL(destination)
  await expect(page.getByRole('heading', { name: 'Quiet evenings, strange worlds', exact: true })).toBeVisible()
})

test('an expired registration code offers signup restart and preserves the intended task', async ({ page, request }) => {
  await request.post(`${api}/__fixtures/reset`, { data: { collectionFixture: true, publicCollection: true, collectionRole: 'visitor' } })
  const username = `expired_${crypto.randomUUID().slice(0, 8)}`
  const email = `${username}@example.test`
  const registration = await request.post(`${api}/v1/auth/register`, { headers: { origin }, data: { email, username, password: 'expired-registration-password' } })
  expect(registration.ok(), await registration.text()).toBe(true)
  const expired = (await (await request.get(`${api}/__fixtures/code`)).json()).code
  expect((await request.post(`${api}/__fixtures/advance-identity-clock`, { data: { milliseconds: 660000 } })).ok()).toBe(true)
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto(`/verify-email?${next}`)
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email)
  await page.getByRole('textbox', { name: 'Verification code', exact: true }).fill(expired.code)
  await page.getByRole('button', { name: 'Verify email', exact: true }).click()
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('The code is invalid or has expired.')
  const restart = page.getByRole('link', { name: 'Start signup again', exact: true })
  await expect(restart).toHaveAttribute('href', `/sign-up?${next}`)
  await mkdir('.impeccable/review/account-verification', { recursive: true })
  await page.screenshot({ path: '.impeccable/review/account-verification/expired-code-mobile.png' })
  await restart.click()
  await expect(page).toHaveURL(`/sign-up?${next}`)
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('restarted-registration-password')
  await page.getByRole('checkbox', { name: 'I agree to the Terms and Privacy Policy' }).check()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill(username)
  await page.getByRole('button', { name: 'Send verification code', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Verification code', exact: true })).toBeVisible()
  const fresh = (await (await request.get(`${api}/__fixtures/code`)).json()).code
  expect(fresh.email).toBe(email)
  await page.getByRole('textbox', { name: 'Verification code', exact: true }).fill(fresh.code)
  await page.getByRole('button', { name: 'Verify and continue', exact: true }).click()
  await expect(page).toHaveURL(`/onboarding?${next}`)
  await page.getByRole('link', { name: 'Skip', exact: true }).click()
  await expect(page).toHaveURL(destination)
})

test('phone signup restarts an expired inline code with the saved details and keeps the destination', async ({ page, request }) => {
  await request.post(`${api}/__fixtures/reset`, { data: {} })
  const suffix = crypto.randomUUID().slice(0, 8)
  const username = `inline_${suffix}`
  const email = `${username}@example.test`
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto(`/sign-up?${next}`)
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('inline-expiry-password')
  await page.getByRole('checkbox', { name: 'I agree to the Terms and Privacy Policy' }).check()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill(username)
  await page.getByRole('button', { name: 'Send verification code', exact: true }).click()
  const code = page.getByRole('textbox', { name: 'Verification code', exact: true })
  await expect(code).toBeVisible()
  const stale = (await (await request.get(`${api}/__fixtures/code`)).json()).code
  expect((await request.post(`${api}/__fixtures/advance-identity-clock`, { data: { milliseconds: 660000 } })).ok()).toBe(true)
  await code.fill(stale.code)
  await page.getByRole('button', { name: 'Verify and continue', exact: true }).click()
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('The code is invalid or has expired.')
  const restart = page.getByRole('button', { name: 'Start signup again', exact: true })
  await expect(restart).toBeVisible()
  await mkdir('.impeccable/review/account-verification', { recursive: true })
  await page.screenshot({ path: '.impeccable/review/account-verification/inline-expired-code-320x844.png' })

  await restart.click()
  await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toHaveValue(email)
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('inline-expiry-password')
  await page.getByRole('checkbox', { name: 'I agree to the Terms and Privacy Policy' }).check()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  const usernameField = page.getByRole('textbox', { name: 'Username', exact: true })
  await expect(usernameField).toHaveValue(username)
  await page.getByRole('textbox', { name: 'Display name', exact: true }).focus()
  await expect(page.getByText('Username is available.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Return to pending verification', exact: true })).not.toBeVisible()
  await page.getByRole('button', { name: 'Send verification code', exact: true }).click()
  const fresh = (await (await request.get(`${api}/__fixtures/code`)).json()).code
  expect(fresh.email).toBe(email)
  await expect(code).toBeVisible()
  await code.fill(fresh.code)
  await page.getByRole('button', { name: 'Verify and continue', exact: true }).click()
  await expect(page).toHaveURL(`/onboarding?${next}`)
  await page.getByRole('link', { name: 'Skip', exact: true }).click()
  await expect(page).toHaveURL(destination)
})

test('username availability feedback keeps the signup submit button in place', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/sign-up?${next}`)
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('stable-signup@example.test')
  await page.getByLabel('Password', { exact: true }).fill('stable-signup-password')
  await page.getByRole('checkbox', { name: 'I agree to the Terms and Privacy Policy' }).check()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  const username = page.getByRole('textbox', { name: 'Username', exact: true })
  await username.fill('stable_signup')
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/v1/usernames/stable_signup/availability', async route => { await gate; await route.fulfill({ json: { username: 'stable_signup', available: true } }) })
  const submit = page.getByRole('button', { name: 'Send verification code', exact: true })
  const before = (await submit.boundingBox())!
  await username.blur()
  try {
    await expect(page.getByRole('status')).toHaveText('Checking username…')
    const pending = (await submit.boundingBox())!
    expect(Math.abs(pending.y - before.y)).toBeLessThanOrEqual(1)
  } finally { release() }
  await expect(page.getByRole('status')).toHaveText('Username is available.')
  const completed = (await submit.boundingBox())!
  expect(Math.abs(completed.y - before.y)).toBeLessThanOrEqual(1)
})

test('standalone verification retries code delivery without overlapping confirmation or losing a failed resend draft', async ({ page, request }) => {
  await request.post(`${api}/__fixtures/reset`, { data: { collectionFixture: true, publicCollection: true, collectionRole: 'visitor' } })
  const username = `resend_${crypto.randomUUID().slice(0, 8)}`
  const email = `${username}@example.test`
  expect((await request.post(`${api}/v1/auth/register`, { headers: { origin }, data: { email, username, password: 'resend-fixture-password' } })).ok()).toBe(true)
  const first = (await (await request.get(`${api}/__fixtures/code`)).json()).code
  const wrongCode = first.code === '000000' ? '111111' : '000000'
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/verify-email?${next}`)
  const address = page.getByRole('textbox', { name: 'Email', exact: true })
  const code = page.getByRole('textbox', { name: 'Verification code', exact: true })
  await address.fill(email)
  await code.fill(wrongCode)
  await page.getByRole('button', { name: 'Verify email', exact: true }).click()
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('The code is invalid or has expired.')
  const resend = page.getByRole('button', { name: 'Send another code', exact: true })
  await expect(resend).toBeVisible()
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const resendRoute = '**/v1/auth/verification/request'
  let requests = 0
  await page.route(resendRoute, async route => {
    requests += 1
    await gate
    await route.fulfill({ status: 429, json: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Back off and retry.', requestId: 'verification-fixture', retryable: true } } })
  })
  await resend.click()
  try {
    await expect(address).toBeDisabled()
    await expect(code).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Verify email', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Sending another code…', exact: true })).toBeDisabled()
    expect(requests).toBe(1)
  } finally { release() }
  const failure = page.getByRole('main').getByRole('alert')
  await expect(failure).toHaveText('Too many requests. Please wait a little, then try again.')
  await expect(failure).toBeFocused()
  await expect(address).toHaveValue(email)
  await expect(code).toHaveValue(wrongCode)
  await expect(page.getByRole('button', { name: 'Verify email', exact: true })).toBeEnabled()
  await mkdir('.impeccable/review/account-verification', { recursive: true })
  await page.screenshot({ path: '.impeccable/review/account-verification/resend-retry-mobile.png' })
  await page.unroute(resendRoute)
  expect((await request.post(`${api}/__fixtures/advance-identity-clock`, { data: { milliseconds: 61000 } })).ok()).toBe(true)
  await resend.click()
  await expect(page.getByRole('status')).toHaveText('If the address can continue, an email is on its way.')
  await expect(page.getByText('Give the email a minute to arrive and check spam before requesting another. A newly issued code replaces the previous one.')).toBeVisible()
  await expect(code).toHaveValue('')
  await expect(code).toBeFocused()
  const fresh = (await (await request.get(`${api}/__fixtures/code`)).json()).code
  expect(fresh.email).toBe(email)
  await code.fill(fresh.code)
  await code.press('Enter')
  await expect(page).toHaveURL(`/onboarding?${next}`)
})

test('phone signup keeps keyboard focus and locks identity fields through a failed registration', async ({ page, request }) => {
  await request.post(`${api}/__fixtures/reset`, { data: { collectionFixture: true, publicCollection: true, collectionRole: 'visitor' } })
  const usernameValue = `phone_${crypto.randomUUID().slice(0, 8)}`
  const emailValue = `${usernameValue}_${'a'.repeat(38)}@example.test`
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto(`/sign-up?${next}`)
  const email = page.getByRole('textbox', { name: 'Email', exact: true })
  const password = page.getByLabel('Password', { exact: true })
  await email.fill(emailValue)
  await password.fill('phone-signup-password')
  await page.getByRole('checkbox', { name: 'I agree to the Terms and Privacy Policy' }).check()
  await password.press('Enter')
  const username = page.getByRole('textbox', { name: 'Username', exact: true })
  const displayName = page.getByRole('textbox', { name: 'Display name', exact: true })
  await expect(username).toBeFocused()
  await username.fill(usernameValue)
  await displayName.fill('Phone Viewer')
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const registerRoute = '**/v1/auth/register'
  await page.route(registerRoute, async route => {
    await gate
    await route.fulfill({ status: 503, json: { error: { code: 'AUTH_STATE_UNAVAILABLE', message: 'Signup is temporarily unavailable. Try again.', requestId: 'verification-fixture', retryable: true } } })
  })
  await page.getByRole('button', { name: 'Send verification code', exact: true }).click()
  try {
    await expect(username).toBeDisabled()
    await expect(displayName).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Sending verification code…', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Back to account details', exact: true })).toBeDisabled()
  } finally { release() }
  const error = page.getByRole('main').getByRole('alert')
  await expect(error).toHaveText('Signup is temporarily unavailable. Try again.')
  await expect(error).toBeFocused()
  await expect(username).toHaveValue(usernameValue)
  await expect(displayName).toHaveValue('Phone Viewer')
  await page.getByRole('button', { name: 'Back to account details', exact: true }).click()
  await expect(email).toBeFocused()
  await expect(email).toHaveValue(emailValue)
  await expect(password).toHaveValue('phone-signup-password')
  await password.press('Enter')
  await expect(username).toBeFocused()
  await expect(username).toHaveValue(usernameValue)
  await expect(displayName).toHaveValue('Phone Viewer')
  await page.unroute(registerRoute)
  await page.getByRole('button', { name: 'Send verification code', exact: true }).click()
  const code = page.getByRole('textbox', { name: 'Verification code', exact: true })
  await expect(code).toBeFocused()
  await expect(page.getByRole('button', { name: 'Use a different email', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await mkdir('.impeccable/review/account-verification', { recursive: true })
  for (const control of [code, page.getByRole('button', { name: 'Verify and continue', exact: true }), page.getByRole('button', { name: 'Send another code', exact: true })]) {
    const box = await control.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(12)
    expect(box!.x + box!.width).toBeLessThanOrEqual(308)
  }
  await page.screenshot({ path: '.impeccable/review/account-verification/signup-code-phone.png' })
})

test('phone signup can resume its pending verification after editing account details', async ({ page, request }) => {
  await request.post(`${api}/__fixtures/reset`, { data: { collectionFixture: true, publicCollection: true, collectionRole: 'visitor' } })
  const username = `resume_${crypto.randomUUID().slice(0, 8)}`
  const email = `${username}@example.test`
  let registrations = 0
  page.on('request', request => { if (request.url().endsWith('/v1/auth/register') && request.method() === 'POST') registrations += 1 })
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto(`/sign-up?${next}`)
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('pending-signup-password')
  await page.getByRole('checkbox', { name: 'I agree to the Terms and Privacy Policy' }).check()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill(username)
  await page.getByRole('textbox', { name: 'Display name', exact: true }).fill('Original Viewer')
  await page.getByRole('button', { name: 'Send verification code', exact: true }).click()
  const code = page.getByRole('textbox', { name: 'Verification code', exact: true })
  await expect(code).toBeFocused()
  await code.fill('123')
  await page.getByRole('button', { name: 'Use a different email', exact: true }).click()
  const address = page.getByRole('textbox', { name: 'Email', exact: true })
  await expect(address).toBeFocused()
  await expect(address).toHaveValue(email)
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('pending-signup-password')
  await address.fill('another-address@example.test')
  await page.getByLabel('Password', { exact: true }).fill('a-different-draft-password')
  const resume = page.getByRole('button', { name: 'Return to pending verification', exact: true })
  await expect(resume).toBeVisible()
  await resume.click()
  await expect(code).toBeFocused()
  await expect(code).toHaveValue('')
  await expect(page.locator('form').getByText(email, { exact: true })).toBeVisible()
  expect(registrations).toBe(1)
  const delivered = (await (await request.get(`${api}/__fixtures/code`)).json()).code
  expect(delivered.email).toBe(email)
  await code.fill(delivered.code)
  await code.press('Enter')
  await expect(page).toHaveURL(`/onboarding?${next}`)
  const current = await page.context().request.get('/v1/me')
  expect(current.ok()).toBe(true)
  expect((await current.json()).member.displayName).toBe('Original Viewer')
  await page.getByRole('link', { name: 'Skip', exact: true }).click()
  await expect(page).toHaveURL(destination)
})

test('phone signup explains a reserved username when changing email and recovers with a new username', async ({ page, request }) => {
  await request.post(`${api}/__fixtures/reset`, { data: {} })
  const suffix = crypto.randomUUID().slice(0, 8)
  const originalEmail = `pending_${suffix}@example.test`
  const correctedEmail = `corrected_${suffix}@example.test`
  const reservedUsername = `pending_${suffix}`
  const replacementUsername = `viewer_${suffix}`
  const username = page.getByRole('textbox', { name: 'Username', exact: true })
  const sendVerification = page.getByRole('button', { name: 'Send verification code', exact: true })
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto(`/sign-up?${next}`)
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(originalEmail)
  await page.getByLabel('Password', { exact: true }).fill('pending-signup-password')
  await page.getByRole('checkbox', { name: 'I agree to the Terms and Privacy Policy' }).check()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  let releaseUsernameCheck!: () => void
  const usernameCheckGate = new Promise<void>(resolve => { releaseUsernameCheck = resolve })
  const availabilityRoute = `**/v1/usernames/${reservedUsername}/availability`
  await page.route(availabilityRoute, async route => { await usernameCheckGate; await route.continue() })
  await username.fill(reservedUsername)
  await page.getByRole('textbox', { name: 'Display name', exact: true }).focus()
  await expect(page.getByRole('status')).toHaveText('Checking username…')
  await expect(sendVerification).toBeEnabled()
  try { await sendVerification.click() } finally { releaseUsernameCheck() }
  await expect(page.getByRole('textbox', { name: 'Verification code', exact: true })).toBeVisible()
  await page.unroute(availabilityRoute)

  await page.getByRole('button', { name: 'Use a different email', exact: true }).click()
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(correctedEmail)
  await page.getByLabel('Password', { exact: true }).fill('corrected-signup-password')
  await page.getByRole('checkbox', { name: 'I agree to the Terms and Privacy Policy' }).check()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(username).toHaveValue(reservedUsername)
  await page.getByRole('textbox', { name: 'Display name', exact: true }).focus()
  await expect(page.getByText('That username is unavailable.', { exact: true })).toBeVisible()
  await expect(sendVerification).toBeDisabled()
  await expect(page.getByText(/This username stays reserved; another email needs a different one/)).toBeVisible()
  const returnToPending = page.getByRole('button', { name: 'Return to pending verification', exact: true })
  expect((await returnToPending.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await mkdir('.impeccable/review/account-verification', { recursive: true })
  await page.screenshot({ fullPage: true, path: '.impeccable/review/account-verification/reserved-username-email-switch-320x844.png' })

  await username.fill(replacementUsername)
  await page.getByRole('textbox', { name: 'Display name', exact: true }).focus()
  await expect(page.getByText('Username is available.', { exact: true })).toBeVisible()
  await expect(sendVerification).toBeEnabled()
  await sendVerification.click()
  const fresh = (await (await request.get(`${api}/__fixtures/code`)).json()).code
  expect(fresh.email).toBe(correctedEmail)
  await page.getByRole('textbox', { name: 'Verification code', exact: true }).fill(fresh.code)
  await page.getByRole('button', { name: 'Verify and continue', exact: true }).click()
  await expect(page).toHaveURL(`/onboarding?${next}`)
  const current = await page.context().request.get('/v1/me')
  expect((await current.json()).member.username).toBe(replacementUsername)
  await page.getByRole('link', { name: 'Skip', exact: true }).click()
  await expect(page).toHaveURL(destination)
})


test('inline signup recovers resend and verification failures without losing the code', async ({ page, request }) => {
  await request.post(`${api}/__fixtures/reset`, { data: { collectionFixture: true, publicCollection: true, collectionRole: 'visitor' } })
  const username = `retry_${crypto.randomUUID().slice(0, 8)}`
  const email = `${username}@example.test`
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto(`/sign-up?${next}`)
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('signup-retry-password')
  await page.getByRole('checkbox', { name: 'I agree to the Terms and Privacy Policy' }).check()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill(username)
  await page.getByRole('button', { name: 'Send verification code', exact: true }).click()
  const code = page.getByRole('textbox', { name: 'Verification code', exact: true })
  await expect(code).toBeFocused()
  await code.fill('123')
  let release!: () => void
  let gate = new Promise<void>(resolve => { release = resolve })
  const resendRoute = '**/v1/auth/verification/request'
  await page.route(resendRoute, async route => {
    await gate
    await route.fulfill({ status: 503, json: { error: { code: 'EMAIL_DELIVERY_UNAVAILABLE', message: 'Code delivery is temporarily unavailable. Try again.', requestId: 'inline-signup', retryable: true } } })
  })
  const resend = page.getByRole('button', { name: 'Send another code', exact: true })
  await resend.click()
  try {
    await expect(code).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Verify and continue', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Use a different email', exact: true })).toBeDisabled()
  } finally { release() }
  const error = page.getByRole('main').getByRole('alert')
  await expect(error).toHaveText('Code delivery is temporarily unavailable. Try again.')
  await expect(error).toBeFocused()
  await expect(code).toHaveValue('123')
  await page.unroute(resendRoute)
  expect((await request.post(`${api}/__fixtures/advance-identity-clock`, { data: { milliseconds: 61000 } })).ok()).toBe(true)
  await resend.click()
  await expect(page.getByRole('status')).toHaveText('If the address can continue, an email is on its way.')
  await expect(page.getByText('Give the email a minute to arrive and check spam before requesting another. A newly issued code replaces the previous one.')).toBeVisible()
  await expect(code).toHaveValue('')
  await expect(code).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => (await (window as Window & { axe: typeof axe }).axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  })).violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })))
  expect(violations).toEqual([])
  await mkdir('.impeccable/review/account-verification', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/account-verification/resend-guidance-320x844.png' })
  const fresh = (await (await request.get(`${api}/__fixtures/code`)).json()).code
  expect(fresh.email).toBe(email)
  await code.fill(fresh.code)
  gate = new Promise<void>(resolve => { release = resolve })
  const verifyRoute = '**/v1/auth/verify-email'
  await page.route(verifyRoute, async route => {
    await gate
    await route.fulfill({ status: 503, json: { error: { code: 'AUTH_STATE_UNAVAILABLE', message: 'Verification is temporarily unavailable. Try again.', requestId: 'inline-signup', retryable: true } } })
  })
  await code.press('Enter')
  try {
    await expect(code).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Verifying email…', exact: true })).toBeDisabled()
    await expect(resend).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Use a different email', exact: true })).toBeDisabled()
  } finally { release() }
  await expect(error).toHaveText('Verification is temporarily unavailable. Try again.')
  await expect(error).toBeFocused()
  await expect(code).toHaveValue(fresh.code)
  await mkdir('.impeccable/review/account-verification', { recursive: true })
  await page.screenshot({ path: '.impeccable/review/account-verification/inline-verification-retry-phone.png' })
  await page.unroute(verifyRoute)
  await code.press('Enter')
  await expect(page).toHaveURL(`/onboarding?${next}`)
  await page.getByRole('link', { name: 'Skip', exact: true }).click()
  await expect(page).toHaveURL(destination)
})
