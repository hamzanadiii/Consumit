import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import axe from 'axe-core'
import { defaultExperiencePreferences } from '../../packages/contracts/src/index'

const api = 'http://127.0.0.1:18563'

test('review report and block actions recover from failed writes on a narrow phone', async ({ page, context, request }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  const { token, member } = await (await request.get(`${api}/__fixtures/session?label=mobile-dark`)).json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  await request.post(`${api}/__fixtures/reset`, {
    data: { memberId: member.id, reviewFixture: true, preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed' } },
  })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))

  const submissions: Array<{ kind: string; id: string; reason: string; idempotencyKey: string }> = []
  await page.route('**/v1/taste/reports', async route => {
    submissions.push(route.request().postDataJSON())
    if (submissions.length === 1) {
      await route.fulfill({ status: 503, json: { error: { code: 'AUTH_STATE_UNAVAILABLE', message: 'The account request failed.', requestId: 'review-report', retryable: true } } })
    } else {
      await route.fulfill({ status: 204 })
    }
  })

  await page.goto('/reviews/experience-review')
  await page.getByRole('button', { name: 'Report', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Report this content' })
  const reason = 'This review includes a personal detail.'
  await dialog.getByRole('textbox', { name: 'What should we know?' }).fill(reason)
  await dialog.getByRole('button', { name: 'Send report', exact: true }).click()

  await expect(dialog.getByRole('alert')).toContainText('The account request failed.')
  const retry = dialog.getByRole('button', { name: 'Retry sending report', exact: true })
  await expect(retry).toBeVisible()
  await expect(retry).toBeFocused()
  await expect(dialog.getByRole('textbox', { name: 'What should we know?' })).toHaveValue(reason)
  expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await mkdir('.impeccable/review/review-journey', { recursive: true })
  await page.screenshot({ caret: 'initial', path: '.impeccable/review/review-journey/report-retry-320x720.png', fullPage: true })
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => (await (window as unknown as Window & { axe: typeof axe }).axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  })).violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })))
  expect(violations).toEqual([])

  await retry.click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('status')).toContainText('Report received for review.')
  expect(submissions).toHaveLength(2)
  expect(submissions[0]).toMatchObject({ kind: 'review', id: 'experience-review', reason })
  expect(submissions[0]!.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i)
  expect(submissions[1]).toEqual(submissions[0])

  const blockWrites: Array<{ enabled: boolean }> = []
  await page.route('**/v1/taste/blocks/*', async route => {
    blockWrites.push(route.request().postDataJSON())
    if (blockWrites.length === 1) {
      await route.fulfill({ status: 503, json: { error: { code: 'AUTH_STATE_UNAVAILABLE', message: 'The account request failed.', requestId: 'review-block', retryable: true } } })
    } else {
      await route.continue()
    }
  })
  await page.getByRole('button', { name: 'Block member', exact: true }).click()
  const retryBlock = page.getByRole('button', { name: 'Retry block member', exact: true })
  await expect(retryBlock).toBeFocused()
  await expect(page.locator('.taste-status[role="alert"]')).toContainText('The account request failed.')
  expect((await retryBlock.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const blockViolations = await page.evaluate(async () => (await (window as unknown as Window & { axe: typeof axe }).axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  })).violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })))
  expect(blockViolations).toEqual([])
  await page.screenshot({ caret: 'initial', path: '.impeccable/review/review-journey/block-retry-320x720.png', fullPage: true })

  await retryBlock.click()
  const unavailable = page.getByRole('heading', { name: 'We couldn’t find that page' })
  await expect(unavailable).toBeVisible()
  await expect(page.locator('#consumit-main-content')).toBeFocused()
  await expect(page.getByRole('article').filter({ hasText: 'The quiet scenes carry the story.' })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const blockedPageViolations = await page.evaluate(async () => (await (window as unknown as Window & { axe: typeof axe }).axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  })).violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })))
  expect(blockedPageViolations, 'Review page after blocking its author').toEqual([])
  await page.screenshot({ caret: 'initial', path: '.impeccable/review/review-journey/blocked-author-removed-320x720.png', fullPage: true })
  expect(blockWrites).toEqual([{ enabled: true }, { enabled: true }])
})

test('blocking a commenter removes their loaded discussion row and keeps the review readable', async ({ page, context, request }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  const { token, member } = await (await request.get(`${api}/__fixtures/session?label=mobile-dark`)).json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  await request.post(`${api}/__fixtures/reset`, {
    data: { memberId: member.id, reviewFixture: true, discussionFixture: true, preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed' } },
  })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  await page.route('**/v1/taste/blocks/*', route => route.continue())
  await page.goto('/reviews/experience-review')

  const reviewBody = page.getByRole('article').filter({ hasText: 'The quiet scenes carry the story.' })
  const comment = page.locator('[data-discussion-comment="experience-comment"]')
  await expect(reviewBody).toBeVisible()
  await expect(comment).toContainText('The second reading makes this moment even better.')
  await comment.getByRole('button', { name: 'Block member', exact: true }).click()

  await expect(comment).toHaveCount(0)
  await expect(page.getByRole('status')).toContainText('Member blocked. Their comments are hidden in this discussion.')
  const manageBlocked = page.getByRole('link', { name: 'Manage blocked members', exact: true })
  await expect(manageBlocked).toHaveAttribute('href', '/community/settings')
  expect((await manageBlocked.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await expect(page.getByRole('heading', { name: 'The conversation' })).toBeFocused()
  await expect(reviewBody).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => (await (window as unknown as Window & { axe: typeof axe }).axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  })).violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })))
  expect(violations, 'Review discussion after blocking a commenter').toEqual([])
  await page.screenshot({ caret: 'initial', path: '.impeccable/review/review-journey/blocked-commenter-hidden-320x720.png', fullPage: true })

  await page.reload()
  await expect(comment).toHaveCount(0)
  await expect(reviewBody).toBeVisible()
})
