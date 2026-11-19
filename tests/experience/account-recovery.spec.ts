import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { defaultExperiencePreferences, GUIDE_VERSION } from '../../packages/contracts/src/index'

const api = 'http://127.0.0.1:18563'
const destination = '/lists/quiet-evenings?from=account#after-dark'
const next = new URLSearchParams({ next: destination }).toString()

test('password recovery retains the original task through reset and the next sign-in', async ({ page, request }) => {
  const username = `recover_${crypto.randomUUID().slice(0, 8)}`
  const email = `${username}@example.test`
  const password = 'recovery-old-password'
  const registered = await request.post(`${api}/v1/auth/register`, { headers: { origin: 'http://127.0.0.1:28114' }, data: { username, email, password } })
  expect(registered.ok(), await registered.text()).toBe(true)
  const verification = (await (await request.get(`${api}/__fixtures/code`)).json()).code
  const verified = await request.post(`${api}/v1/auth/verify-email`, { headers: { origin: 'http://127.0.0.1:28114' }, data: { email, code: verification.code } })
  expect(verified.ok()).toBe(true)
  const { member } = await verified.json()
  await request.post(`${api}/__fixtures/reset`, { data: { collectionFixture: true, publicCollection: true, collectionRole: 'visitor', memberId: member.id, preferences: { ...defaultExperiencePreferences(), guideVersion: GUIDE_VERSION, guideStatus: 'dismissed' } } })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/sign-in?${next}`)
  await page.getByRole('link', { name: 'Forgot password?', exact: true }).click()
  await expect(page).toHaveURL(`/forgot-password?${next}`)
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email)
  await page.getByRole('textbox', { name: 'Email', exact: true }).press('Enter')
  const continueLink = page.getByRole('link', { name: 'I have a reset code', exact: true })
  await expect(continueLink).toBeVisible()
  await continueLink.click()
  await expect(page).toHaveURL(`/reset-password?${next}`)
  const recovery = (await (await request.get(`${api}/__fixtures/recovery-code`)).json()).code
  expect(recovery.email).toBe(email)
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email)
  await page.getByRole('textbox', { name: 'Reset code', exact: true }).fill(recovery.code)
  await page.getByLabel('New password', { exact: true }).fill('recovery-new-password')
  await page.getByLabel('New password', { exact: true }).press('Enter')
  await expect(page).toHaveURL(`/sign-in?${next}&reset=success`)
  await expect(page.getByRole('status')).toHaveText('Password updated. Sign in with your new password.')
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('recovery-new-password')
  await page.getByLabel('Password', { exact: true }).press('Enter')
  await expect(page).toHaveURL(destination)
  await expect(page.getByRole('heading', { name: 'Quiet evenings, strange worlds', exact: true })).toBeVisible()
})

test('requesting a reset keeps the address through pending and failure and clears an outdated confirmation', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto(`/forgot-password?${next}`)
  const email = page.getByRole('textbox', { name: 'Email', exact: true })
  await email.fill('recovery@example.test')
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let requests = 0
  await page.route('**/v1/auth/recovery/request', async route => {
    requests += 1
    if (requests === 1) {
      await gate
      await route.fulfill({ status: 503, json: { error: { code: 'AUTH_STATE_UNAVAILABLE', message: 'Reset email is temporarily unavailable. Try again.', requestId: 'recovery-fixture', retryable: true } } })
    } else await route.fulfill({ json: { status: 'accepted', message: 'If the address matches a verified account, a reset code has been sent.' } })
  })
  await page.getByRole('button', { name: 'Send reset code', exact: true }).click()
  try {
    await expect(email).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Sending reset code…', exact: true })).toBeDisabled()
    expect(requests).toBe(1)
  } finally { release() }
  const error = page.getByRole('main').getByRole('alert')
  await expect(error).toHaveText('Reset email is temporarily unavailable. Try again.')
  await expect(error).toBeFocused()
  await expect(email).toHaveValue('recovery@example.test')
  await expect(email).toBeEnabled()
  await mkdir('.impeccable/review/account-recovery', { recursive: true })
  await page.screenshot({ path: '.impeccable/review/account-recovery/request-retry-mobile.png' })
  await page.getByRole('button', { name: 'Send reset code', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('If the address matches a verified account, a reset code has been sent.')
  expect(requests).toBe(2)
  const proceed = page.getByRole('link', { name: 'I have a reset code', exact: true })
  await expect(proceed).toHaveAttribute('href', `/reset-password?${next}`)
  await expect(proceed).toBeFocused()
  await email.fill('another@example.test')
  await expect(proceed).toBeVisible()
  await expect(page.getByRole('status')).not.toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('an existing reset code can recover a failed reset without losing fields or the return destination', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto(`/forgot-password?${next}`)
  const existing = page.getByRole('link', { name: 'I have a reset code', exact: true })
  await expect(existing).toBeVisible()
  await existing.click()
  await expect(page).toHaveURL(`/reset-password?${next}`)
  const email = page.getByRole('textbox', { name: 'Email', exact: true })
  const code = page.getByRole('textbox', { name: 'Reset code', exact: true })
  const password = page.getByLabel('New password', { exact: true })
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let requests = 0
  await page.route('**/v1/auth/recovery/confirm', async route => {
    requests += 1
    if (requests === 1) {
      await gate
      await route.fulfill({ status: 503, json: { error: { code: 'AUTH_STATE_UNAVAILABLE', message: 'Password reset is temporarily unavailable. Try again.', requestId: 'recovery-fixture', retryable: true } } })
    } else await route.fulfill({ status: 204 })
  })
  await email.fill('recovery@example.test')
  await code.fill('123')
  await password.fill('short')
  await page.getByRole('button', { name: 'Reset password', exact: true }).click()
  expect(await code.evaluate((element: HTMLInputElement) => element.validity.patternMismatch)).toBe(true)
  expect(requests).toBe(0)
  await code.fill('12345678')
  await password.fill('reset-password-preserved')
  await password.press('Enter')
  try {
    await expect(email).toBeDisabled()
    await expect(code).toBeDisabled()
    await expect(password).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Resetting password…', exact: true })).toBeDisabled()
    expect(requests).toBe(1)
  } finally { release() }
  const error = page.getByRole('main').getByRole('alert')
  await expect(error).toHaveText('Password reset is temporarily unavailable. Try again.')
  await expect(error).toBeFocused()
  await expect(email).toHaveValue('recovery@example.test')
  await expect(code).toHaveValue('12345678')
  await expect(password).toHaveValue('reset-password-preserved')
  await page.getByRole('button', { name: 'Show password', exact: true }).click()
  await expect(password).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Hide password', exact: true }).click()
  await expect(password).toHaveAttribute('type', 'password')
  await expect(page.getByRole('link', { name: 'Request another code', exact: true })).toHaveAttribute('href', `/forgot-password?${next}`)
  await expect(page).toHaveURL(`/reset-password?${next}`)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await mkdir('.impeccable/review/account-recovery', { recursive: true })
  await page.screenshot({ path: '.impeccable/review/account-recovery/reset-retry-mobile.png' })
  await page.getByRole('button', { name: 'Reset password', exact: true }).click()
  await expect(page).toHaveURL(`/sign-in?${next}&reset=success`)
  await expect(page.getByRole('status')).toHaveText('Password updated. Sign in with your new password.')
  expect(requests).toBe(2)
})

test('recovery pages offer a safe return to sign-in in the light desktop layout', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('consumit.home-theme', 'light'))
  await page.setViewportSize({ width: 1440, height: 900 })
  await mkdir('.impeccable/review/account-recovery', { recursive: true })
  for (const route of ['forgot-password', 'reset-password']) {
    await page.goto(`/${route}?${next}`)
    const back = page.getByRole('link', { name: 'Back to sign in', exact: true })
    await expect(back).toHaveAttribute('href', `/sign-in?${next}`)
    await expect(page.locator('[data-theme="light"]')).toBeVisible()
    await page.screenshot({ path: `.impeccable/review/account-recovery/${route}-light-desktop.png`, fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await back.click()
    await expect(page).toHaveURL(`/sign-in?${next}`)
    await page.goto(`/${route}?next=${encodeURIComponent('https://outside.example/task')}`)
    await expect(page.getByRole('link', { name: 'Back to sign in', exact: true })).toHaveAttribute('href', '/sign-in')
  }
  await page.goto(`/sign-in?${next}&reset=success`)
  const success = page.getByRole('status')
  await expect(success).toHaveText('Password updated. Sign in with your new password.')
  const contrast = await success.evaluate(element => {
    const channels = (color: string) => color.match(/[\d.]+/g)!.map(Number)
    const luminance = (color: string) => channels(color).slice(0, 3).map(value => {
      const channel = value / 255
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0)
    let surface: Element | null = element
    let background = getComputedStyle(surface).backgroundColor
    while (channels(background)[3] === 0 && surface.parentElement) {
      surface = surface.parentElement
      background = getComputedStyle(surface).backgroundColor
    }
    const tones = [luminance(getComputedStyle(element).color), luminance(background)]
    return (Math.max(...tones) + 0.05) / (Math.min(...tones) + 0.05)
  })
  expect(contrast).toBeGreaterThanOrEqual(4.5)
  await page.screenshot({ path: '.impeccable/review/account-recovery/password-reset-success-light-desktop.png', fullPage: true })

})
