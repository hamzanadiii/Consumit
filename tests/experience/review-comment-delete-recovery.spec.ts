import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import axe from 'axe-core'
import { defaultExperiencePreferences } from '../../packages/contracts/src/index'

const api = 'http://127.0.0.1:18563'

test('deleting a review comment confirms first and recovers from an ambiguous phone-dialog write', async ({ page, context, request }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  const { token, member } = await (await request.get(`${api}/__fixtures/session`)).json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  await request.post(`${api}/__fixtures/reset`, {
    data: { memberId: member.id, reviewFixture: true, preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed' } },
  })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))

  let deleted = false
  const deletions: string[] = []
  await page.route('**/v1/taste/discussion/review/experience-review', route => route.fulfill({ json: {
    items: deleted ? [] : [{
      id: 'review-comment-delete', parentId: null, body: 'A comment the author can remove.', spoiler: false,
      createdAt: '2026-10-28T12:00:00.000Z', revision: 1,
      author: { id: member.id, username: member.username, name: member.username, avatarUrl: null },
      owner: true, deleted: false,
    }],
    nextCursor: null, muted: false, canComment: true,
  } }))
  await page.route('**/v1/taste/comments/review-comment-delete', async route => {
    deletions.push(route.request().method())
    if (deletions.length === 1) {
      deleted = true
      await route.fulfill({ status: 503, json: { error: { code: 'AUTH_STATE_UNAVAILABLE', message: 'The account request failed.', requestId: 'review-comment-delete', retryable: true } } })
    } else {
      deleted = true
      await route.fulfill({ status: 204 })
    }
  })

  await page.goto('/reviews/experience-review')
  const comment = page.locator('.taste-comment').filter({ hasText: 'A comment the author can remove.' })
  const deleteComment = comment.getByRole('button', { name: 'Delete', exact: true })
  await expect(comment).toBeVisible()
  await deleteComment.click()
  const dialog = page.getByRole('dialog', { name: 'Delete this comment?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Keep comment', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(deleteComment).toBeFocused()
  expect(deletions).toHaveLength(0)

  await deleteComment.click()
  await dialog.getByRole('button', { name: 'Delete comment', exact: true }).click()
  const retry = dialog.getByRole('button', { name: 'Retry deleting comment', exact: true })
  await expect(dialog.getByRole('alert')).toContainText('The account request failed.')
  await expect(comment).toBeVisible()
  await expect(retry).toBeFocused()
  expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await mkdir('.impeccable/review/review-journey', { recursive: true })
  await page.screenshot({ caret: 'initial', path: '.impeccable/review/review-journey/comment-delete-retry-320x720.png', fullPage: true })
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => (await (window as Window & { axe: typeof axe }).axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  })).violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })))
  expect(violations).toEqual([])

  await retry.click()
  await expect(dialog).not.toBeVisible()
  await expect(comment).toHaveCount(0)
  await expect(page.getByRole('status')).toContainText('Comment deleted.')
  await expect(page.getByRole('heading', { name: 'The conversation' })).toBeFocused()
  expect(deletions).toEqual(['DELETE', 'DELETE'])
})
