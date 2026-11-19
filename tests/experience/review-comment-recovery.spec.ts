import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import axe from 'axe-core'
import { defaultExperiencePreferences } from '../../packages/contracts/src/index'

declare global {
  interface Window { axe: typeof axe }
}

const api = 'http://127.0.0.1:18563'

test('a failed review comment keeps the draft and retries the same submission on a narrow phone', async ({ page, context, request }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  const { token, member } = await (await request.get(`${api}/__fixtures/session`)).json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  await request.post(`${api}/__fixtures/reset`, {
    data: { memberId: member.id, reviewFixture: true, preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed' } },
  })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))

  let created = false
  const submissions: Array<{ body: string; spoiler: boolean; parentId: string | null; idempotencyKey: string }> = []
  const commentBody = 'The quiet ending stayed with me.'
  await page.route('**/v1/taste/discussion/review/experience-review', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: {
        items: created ? [{
          id: 'review-comment-retry', parentId: null, body: commentBody, spoiler: true,
          createdAt: '2026-10-28T12:00:00.000Z', revision: 1,
          author: { id: member.id, username: member.username, name: member.username, avatarUrl: null },
          owner: true, deleted: false,
        }] : [],
        nextCursor: null, muted: false, canComment: true,
      } })
      return
    }

    submissions.push(route.request().postDataJSON())
    if (submissions.length === 1) {
      await route.fulfill({ status: 503, json: { error: { code: 'AUTH_STATE_UNAVAILABLE', message: 'The account request failed.', requestId: 'review-comment', retryable: true } } })
    } else {
      created = true
      await route.fulfill({ status: 204 })
    }
  })

  await page.goto('/profile/experience_fixture')
  await page.locator('[data-consumit-profile-activity] a[href="/reviews/experience-review"]').first().click()
  await expect(page).toHaveURL(/\/reviews\/experience-review$/)
  const textarea = page.getByRole('textbox', { name: 'Join the conversation' })
  await textarea.fill(commentBody)
  await page.getByRole('checkbox', { name: 'Contains spoilers' }).check()
  await page.getByRole('button', { name: 'Post comment', exact: true }).click()

  const discussion = page.locator('.taste-comments')
  await expect(discussion.getByRole('alert')).toContainText('The account request failed.')
  const retry = page.getByRole('button', { name: 'Retry posting comment', exact: true })
  await expect(retry).toBeVisible()
  await expect(retry).toBeFocused()
  await expect(textarea).toHaveValue(commentBody)
  await expect(page.getByRole('checkbox', { name: 'Contains spoilers' })).toBeChecked()
  expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await mkdir('.impeccable/review/review-journey', { recursive: true })
  await page.screenshot({ caret: 'initial', path: '.impeccable/review/review-journey/comment-retry-320x720.png', fullPage: true })
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => (await window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  })).violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })))
  expect(violations).toEqual([])

  await retry.click()
  const postedComment = page.locator('.taste-comment').filter({ hasText: commentBody })
  const spoilerReveal = page.locator('.taste-comment details summary', { hasText: 'Contains spoilers · Reveal' })
  await expect(spoilerReveal).toBeVisible()
  await expect(textarea).toHaveValue('')
  await expect(textarea).toBeFocused()
  await spoilerReveal.click()
  await expect(page.getByText(commentBody, { exact: true })).toBeVisible()
  await expect(postedComment).toBeVisible()
  expect(submissions).toHaveLength(2)
  expect(submissions[0]).toMatchObject({ body: commentBody, spoiler: true, parentId: null })
  expect(submissions[1]).toEqual(submissions[0])
})

test('mute replies retries the same moderation choice after a failed write', async ({ page, context, request }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  const { token, member } = await (await request.get(`${api}/__fixtures/session`)).json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  await request.post(`${api}/__fixtures/reset`, {
    data: { memberId: member.id, reviewFixture: true, preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed' } },
  })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))

  let muted = false
  const writes: Array<{ mode: string }> = []
  await page.route('**/v1/taste/discussion/review/experience-review', route => route.fulfill({ json: {
    items: [], nextCursor: null, muted, canComment: true,
  } }))
  await page.route('**/v1/taste/subscriptions/review/experience-review', async route => {
    const payload = route.request().postDataJSON() as { mode: string }
    writes.push(payload)
    if (writes.length === 1) {
      await route.fulfill({ status: 503, json: { error: { code: 'AUTH_STATE_UNAVAILABLE', message: 'The account request failed.', requestId: 'mute-replies', retryable: true } } })
      return
    }
    muted = payload.mode === 'mute'
    await route.fulfill({ status: 204 })
  })

  await page.goto('/profile/experience_fixture')
  await page.locator('[data-consumit-profile-activity] a[href="/reviews/experience-review"]').first().click()
  await expect(page).toHaveURL(/\/reviews\/experience-review$/)
  const discussion = page.locator('.taste-comments')
  await discussion.getByRole('button', { name: 'Mute replies', exact: true }).click()
  await expect(discussion.getByRole('alert')).toContainText('The account request failed.')

  const retryMute = discussion.getByRole('button', { name: 'Retry muting replies', exact: true })
  await expect(retryMute).toBeVisible()
  await expect(retryMute).toBeFocused()
  expect((await retryMute.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await mkdir('.impeccable/review/review-journey', { recursive: true })
  await page.screenshot({ caret: 'initial', path: '.impeccable/review/review-journey/mute-replies-retry-320x720.png', fullPage: true })
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => (await window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  })).violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })))
  expect(violations).toEqual([])

  await retryMute.click()
  await expect(discussion.getByRole('button', { name: 'Unmute replies', exact: true })).toBeVisible()
  await expect(discussion.getByRole('status')).toContainText('Replies muted.')
  expect(writes).toEqual([{ mode: 'mute' }, { mode: 'mute' }])
})

test('switching to a reply keeps an unfinished top-level comment in its own composer', async ({ page, context, request }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  const { token, member } = await (await request.get(`${api}/__fixtures/session`)).json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  await request.post(`${api}/__fixtures/reset`, {
    data: { memberId: member.id, reviewFixture: true, preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed' } },
  })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  await page.route('**/v1/taste/discussion/review/experience-review', route => route.fulfill({ json: {
    items: [{
      id: 'conversation-root', parentId: null, body: 'A question from another viewer.', spoiler: false,
      createdAt: '2026-10-28T12:00:00.000Z', revision: 1,
      author: { id: 'another-member', username: 'another_member', name: 'Another viewer', avatarUrl: null },
      owner: false, deleted: false,
    }],
    nextCursor: null, muted: false, canComment: true,
  } }))

  await page.goto('/profile/experience_fixture')
  await page.locator('[data-consumit-profile-activity] a[href="/reviews/experience-review"]').first().click()
  await expect(page).toHaveURL(/\/reviews\/experience-review$/)
  const discussion = page.locator('.taste-comments')
  const topLevelDraft = 'My main comment should stay a top-level comment.'
  const topLevelComposer = discussion.getByRole('textbox', { name: 'Join the conversation' })
  const spoilerToggle = discussion.getByRole('checkbox', { name: 'Contains spoilers' })
  await topLevelComposer.fill(topLevelDraft)
  await spoilerToggle.check()
  const rootComment = discussion.locator('.taste-comment').filter({ hasText: 'A question from another viewer.' })
  const replyAction = rootComment.getByRole('button', { name: 'Reply', exact: true })
  expect((await replyAction.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await replyAction.click()

  const replyComposer = discussion.getByRole('textbox', { name: 'Your reply' })
  await expect(replyComposer).toBeFocused()
  await expect(replyComposer).toHaveValue('')
  await expect(spoilerToggle).not.toBeChecked()
  await replyComposer.fill('A reply belongs to the question above.')
  await discussion.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(topLevelComposer).toHaveValue(topLevelDraft)
  await expect(spoilerToggle).toBeChecked()

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await mkdir('.impeccable/review/review-journey', { recursive: true })
  await page.screenshot({ caret: 'initial', path: '.impeccable/review/review-journey/comment-draft-context-320x720.png', fullPage: true })
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => (await window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  })).violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })))
  expect(violations).toEqual([])
})

test('retrying a failed discussion page keeps loaded comments and repeats its cursor', async ({ page, context, request }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  const { token, member } = await (await request.get(`${api}/__fixtures/session`)).json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  await request.post(`${api}/__fixtures/reset`, {
    data: { memberId: member.id, reviewFixture: true, preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed' } },
  })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  const pageCursors: string[] = []
  let failNextPage = true
  const comment = (id: string, body: string) => ({
    id, parentId: null, body, spoiler: false, createdAt: '2026-10-28T12:00:00.000Z', revision: 1,
    author: { id: 'another-member', username: 'another_member', name: 'Another viewer', avatarUrl: null },
    owner: false, deleted: false,
  })
  await page.route('**/v1/taste/discussion/review/experience-review*', async route => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor')
    if (cursor) {
      pageCursors.push(cursor)
      if (failNextPage) {
        failNextPage = false
        await route.fulfill({ status: 503, json: { error: { code: 'AUTH_STATE_UNAVAILABLE', message: 'The account request failed.', requestId: 'comment-page', retryable: true } } })
        return
      }
      await route.fulfill({ json: { items: [comment('second-comment', 'A second page comment.')], nextCursor: null, muted: false, canComment: true } })
      return
    }
    await route.fulfill({ json: { items: [comment('first-comment', 'The first page comment remains visible.')], nextCursor: 'after-first', muted: false, canComment: true } })
  })

  await page.goto('/profile/experience_fixture')
  await page.locator('[data-consumit-profile-activity] a[href="/reviews/experience-review"]').first().click()
  await expect(page).toHaveURL(/\/reviews\/experience-review$/)
  const discussion = page.locator('.taste-comments')
  await expect(discussion.getByText('The first page comment remains visible.', { exact: true })).toBeVisible()
  await discussion.getByRole('button', { name: 'More comments', exact: true }).click()
  await expect(discussion.getByRole('alert')).toContainText('The account request failed.')
  await expect(discussion.getByText('The first page comment remains visible.', { exact: true })).toBeVisible()
  const retry = discussion.getByRole('button', { name: 'Retry loading', exact: true })
  await expect(retry).toBeFocused()
  expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await mkdir('.impeccable/review/review-journey', { recursive: true })
  await page.screenshot({ caret: 'initial', path: '.impeccable/review/review-journey/comment-page-retry-320x720.png', fullPage: true })
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => (await window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  })).violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })))
  expect(violations).toEqual([])

  await retry.click()
  await expect(discussion.getByText('The first page comment remains visible.', { exact: true })).toBeVisible()
  await expect(discussion.getByText('A second page comment.', { exact: true })).toBeVisible()
  await expect(discussion.locator('[data-discussion-comment="second-comment"] a').first()).toBeFocused()
  expect(pageCursors).toEqual(['after-first', 'after-first'])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('a restricted member can read a review discussion without seeing unavailable comment actions', async ({ page, context, request }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  const { token, member } = await (await request.get(`${api}/__fixtures/session`)).json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  await request.post(`${api}/__fixtures/reset`, {
    data: { memberId: member.id, reviewFixture: true, preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed' } },
  })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  let deleted = false
  await page.route('**/v1/taste/discussion/review/experience-review', async route => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({ json: {
      items: deleted ? [] : [{
        id: 'restricted-review-comment', parentId: null, body: 'A readable comment remains part of the conversation.', spoiler: false,
        createdAt: '2026-10-28T12:00:00.000Z', revision: 1,
        author: { id: member.id, username: member.username, name: member.username, avatarUrl: null },
        owner: true, deleted: false,
      }],
      nextCursor: null, muted: false, canComment: false,
    } })
  })
  await page.route('**/v1/taste/comments/restricted-review-comment', async route => {
    if (route.request().method() !== 'DELETE') return route.fallback()
    deleted = true
    await route.fulfill({ status: 204 })
  })

  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('consumit.home-theme', 'dark'))
  await page.goto('/profile/experience_fixture')
  await page.locator('[data-consumit-profile-activity] a[href="/reviews/experience-review"]').first().click()
  await expect(page).toHaveURL(/\/reviews\/experience-review$/)
  const discussion = page.locator('.taste-comments')
  await mkdir('.impeccable/review/review-journey', { recursive: true })
  for (const theme of ['dark', 'light'] as const) {
    if (theme === 'light') {
      await page.evaluate(() => localStorage.setItem('consumit.home-theme', 'light'))
      await page.reload()
    }
    await expect(page.locator('html')).toHaveAttribute('data-consumit-theme', theme)
    await expect(discussion.getByText('A readable comment remains part of the conversation.')).toBeVisible()
    await expect(discussion.getByRole('button', { name: 'Reply' })).toHaveCount(0)
    await expect(discussion.getByRole('button', { name: 'Edit' })).toHaveCount(0)
    await expect(discussion.getByRole('button', { name: 'Delete' })).toBeVisible()
    await expect(discussion.getByRole('textbox')).toHaveCount(0)
    await expect(discussion.getByRole('status')).toContainText('Your account is currently restricted from publishing or commenting.')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `.impeccable/review/review-journey/restricted-commenting-${theme}-320x720.png`, fullPage: true })
    await page.addScriptTag({ content: axe.source })
    const violations = await page.evaluate(async () => (await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    })).violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })))
    expect(violations).toEqual([])
  }

  const deleteComment = discussion.getByRole('button', { name: 'Delete', exact: true })
  await deleteComment.click()
  const confirmation = page.getByRole('dialog', { name: 'Delete this comment?' })
  await expect(confirmation).toBeVisible()
  await confirmation.getByRole('button', { name: 'Delete comment', exact: true }).click()
  await expect(confirmation).not.toBeVisible()
  await expect(discussion.getByText('A readable comment remains part of the conversation.')).toHaveCount(0)
  await expect(discussion.getByRole('status').filter({ hasText: 'Comment deleted.' })).toBeVisible()
  await expect(discussion.getByText('No comments yet.', { exact: true })).toBeVisible()
  await expect(discussion.getByText('Start with a thought, a question, or a different reading.', { exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: '.impeccable/review/review-journey/restricted-commenting-empty-light-320x720.png', fullPage: true })
  const emptyViolations = await page.evaluate(async () => (await window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  })).violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })))
  expect(emptyViolations).toEqual([])
})

test('editing a paged review comment reloads its current revision and preserves the draft', async ({ page, context, request }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  const { token, member } = await (await request.get(`${api}/__fixtures/session`)).json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  await request.post(`${api}/__fixtures/reset`, {
    data: { memberId: member.id, reviewFixture: true, preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed' } },
  })
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))

  const firstBody = 'The first page remains visible after editing.'
  const originalBody = 'The saved version from before the other window.'
  const remoteBody = 'A newer version saved from another window.'
  const draftBody = 'My draft survives the conflict and remains a deliberate overwrite.'
  const comment = (id: string, body: string, revision: number, owner: boolean) => ({
    id, parentId: null, body, spoiler: false, createdAt: '2026-10-28T12:00:00.000Z', revision,
    author: { id: owner ? member.id : 'another-member', username: owner ? member.username : 'critic', name: owner ? member.username : 'A critic', avatarUrl: null },
    owner, deleted: false,
  })
  let remoteEdit = false
  let savedDraft = false
  const patches: Array<{ body: string; spoiler: boolean; revision: number }> = []
  await page.route('**/v1/taste/discussion/review/experience-review*', async route => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor')
    if (cursor === 'after-first') {
      await route.fulfill({ json: {
        items: [comment('editable-comment', savedDraft ? draftBody : remoteEdit ? remoteBody : originalBody, savedDraft ? 3 : remoteEdit ? 2 : 1, true)],
        nextCursor: null, muted: false, canComment: true,
      } })
      return
    }
    await route.fulfill({ json: { items: [comment('first-comment', firstBody, 1, false)], nextCursor: 'after-first', muted: false, canComment: true } })
  })
  await page.route('**/v1/taste/comments/editable-comment', async route => {
    patches.push(route.request().postDataJSON())
    if (patches.length === 1) {
      remoteEdit = true
      await route.fulfill({ status: 409, json: { error: {
        code: 'CONFLICT', message: 'This changed in another window. Your draft is safe; reload the latest version before saving.',
        requestId: 'comment-revision-conflict', retryable: false,
      } } })
      return
    }
    savedDraft = true
    await route.fulfill({ status: 204 })
  })

  await page.goto('/profile/experience_fixture')
  await page.locator('[data-consumit-profile-activity] a[href="/reviews/experience-review"]').first().click()
  await expect(page).toHaveURL(/\/reviews\/experience-review$/)
  const discussion = page.locator('.taste-comments')
  await discussion.getByRole('button', { name: 'More comments' }).click()
  await expect(discussion.getByText(originalBody, { exact: true })).toBeVisible()
  const editedComment = discussion.locator('.taste-comment').filter({ hasText: originalBody })
  await editedComment.getByRole('button', { name: 'Edit', exact: true }).click()
  const textarea = discussion.locator('textarea')
  await textarea.fill(draftBody)
  await discussion.getByRole('checkbox', { name: 'Contains spoilers' }).check()
  await discussion.getByRole('button', { name: 'Save comment', exact: true }).click()

  await expect(discussion.getByRole('alert')).toContainText('changed in another window')
  const loadLatest = discussion.getByRole('button', { name: 'Load latest version', exact: true })
  await expect(loadLatest).toBeFocused()
  await expect(textarea).toHaveValue(draftBody)
  await expect(discussion.getByRole('checkbox', { name: 'Contains spoilers' })).toBeChecked()
  await loadLatest.click()
  await expect(discussion.getByText(remoteBody, { exact: true })).toBeVisible()
  await expect(discussion.getByText(firstBody, { exact: true })).toBeVisible()
  await expect(textarea).toHaveValue(draftBody)
  await expect(discussion.getByRole('status')).toContainText('Your draft is still here')

  const saveOverLatest = discussion.getByRole('button', { name: 'Save my draft over latest', exact: true })
  expect((await saveOverLatest.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => (await window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  })).violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })))
  expect(violations, 'Review edit conflict at 320px').toEqual([])
  await mkdir('.impeccable/review/review-journey', { recursive: true })
  await page.screenshot({ caret: 'initial', path: '.impeccable/review/review-journey/comment-conflict-320x720.png', fullPage: true })

  await saveOverLatest.click()
  const savedComment = discussion.locator('[data-discussion-comment="editable-comment"]')
  const spoilerReveal = savedComment.locator('details summary', { hasText: 'Contains spoilers · Reveal' })
  await expect(spoilerReveal).toBeVisible()
  await spoilerReveal.click()
  await expect(savedComment.getByText(draftBody, { exact: true })).toBeVisible()
  await expect(discussion.getByText(firstBody, { exact: true })).toBeVisible()
  await expect(textarea).toHaveValue('')
  await expect(discussion.getByRole('status').filter({ hasText: 'Comment saved.' })).toBeVisible()
  expect(patches).toEqual([
    { body: draftBody, spoiler: true, revision: 1 },
    { body: draftBody, spoiler: true, revision: 2 },
  ])
})
