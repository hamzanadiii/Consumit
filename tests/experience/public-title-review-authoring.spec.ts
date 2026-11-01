import { mkdir } from 'node:fs/promises'
import axe from 'axe-core'
import { expect, test, type Page } from '@playwright/test'
import { defaultExperiencePreferences } from '../../packages/contracts/src/index'

const api = 'http://127.0.0.1:18563'
const reviewBody = 'The slow, quiet scenes made the ending stay with me.'

async function expectAccessible(page: Page, label: string, rootSelector = 'main#consumit-main-content') {
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async (selector) => {
    const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    const root = document.querySelector(selector)
    if (!root) throw new Error(`Accessibility root not found: ${selector}`)
    const report = await axeApi.run(root, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    })
    return report.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))
  }, rootSelector)
  expect(violations, `${label} should meet WCAG 2.2 AA`).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${label} should fit the phone`).toBe(true)
}

test('members can retry review publication and guests can read movie, series and anime reviews', async ({ page, context, request }) => {
  const sessionResponse = await request.get(`${api}/__fixtures/session`)
  expect(sessionResponse.ok(), await sessionResponse.text()).toBe(true)
  const { token, member } = await sessionResponse.json()
  const resetResponse = await request.post(`${api}/__fixtures/reset`, {
    data: { titleReviewFixture: true, publishReviewFailures: 1, memberId: member.id, preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed' } },
  })
  expect(resetResponse.ok(), await resetResponse.text()).toBe(true)
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  await page.setViewportSize({ width: 320, height: 720 })

  await page.goto('/title/693134#reviews')
  const welcome = page.getByRole('dialog', { name: 'Welcome to Consumit.' })
  if (await welcome.isVisible()) {
    await welcome.getByRole('button', { name: 'Close welcome', exact: true }).click()
    await expect(welcome).not.toBeVisible()
  }
  const writeReview = page.getByRole('button', { name: 'Write a review', exact: true })
  const writeReviewBounds = await writeReview.boundingBox()
  expect(writeReviewBounds?.height ?? 0, 'the review action should be easy to tap').toBeGreaterThanOrEqual(44)
  await writeReview.click()
  const composer = page.getByRole('dialog', { name: 'In your own words' })
  await expect(composer).toBeVisible()
  const review = composer.getByRole('textbox', { name: 'Your review' })
  await review.fill(reviewBody)
  const publish = composer.getByRole('button', { name: 'Publish review', exact: true })
  await publish.focus()
  await publish.press('Enter')
  const publishError = composer.getByRole('alert')
  await expect(publishError).toContainText('Review publishing is temporarily unavailable')
  await expect(publishError).toBeInViewport()
  await expect(review).toHaveValue(reviewBody)
  await expect(publishError.getByRole('button')).toHaveCount(0)
  const retryPublish = composer.getByRole('button', { name: 'Retry publishing', exact: true })
  await expect(retryPublish).toBeFocused()
  await expect.poll(() => retryPublish.evaluate(button => button.matches(':focus-visible'))).toBe(true)
  await expectAccessible(page, 'Member review composer after failed publish', 'dialog.taste-log-dialog')
  await mkdir('.impeccable/review/public-title-reviews', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/public-title-reviews/member-publish-retry-320x720.png' })
  await retryPublish.press('Enter')
  await expect(composer).not.toBeVisible()
  await expect(page.getByText(reviewBody, { exact: true })).toBeVisible()

  await context.clearCookies()
  await page.reload()
  await expect(page.getByRole('region', { name: 'Reviews' }).getByRole('link', { name: 'Sign in', exact: true })).toBeVisible()
  const guestWelcome = page.getByRole('dialog', { name: 'Welcome to Consumit.' })
  await expect(guestWelcome).toBeVisible()
  await guestWelcome.getByRole('button', { name: 'Start exploring', exact: true }).click()
  await expect(guestWelcome).not.toBeVisible()
  const guestReview = page.getByText(reviewBody, { exact: true })
  await expect(guestReview).toBeVisible()
  await guestReview.scrollIntoViewIfNeeded()
  await expectAccessible(page, 'Guest reading a newly published title review')
  await mkdir('.impeccable/review/public-title-reviews', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/public-title-reviews/guest-title-review-320x720.png' })

  const authoredReviewBodies = [reviewBody]
  for (const title of [
    { kind: 'series', path: '/series/95396#reviews', capture: 'guest-series-review-320x720.png' },
    { kind: 'anime', path: '/anime/8#reviews', capture: 'guest-anime-review-320x720.png' },
  ]) {
    const crossKindBody = `The ${title.kind} story made its quiet moments count.`
    authoredReviewBodies.push(crossKindBody)
    await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
    await page.goto(title.path)
    await page.getByRole('button', { name: 'Write a review', exact: true }).click()
    const crossKindComposer = page.getByRole('dialog', { name: 'In your own words' })
    await crossKindComposer.getByRole('textbox', { name: 'Your review' }).fill(crossKindBody)
    await crossKindComposer.getByRole('button', { name: 'Publish review', exact: true }).click()
    await expect(crossKindComposer).not.toBeVisible()
    await expect(page.getByText(crossKindBody, { exact: true })).toBeVisible()

    await context.clearCookies()
    await page.reload()
    await expect(page.getByRole('region', { name: 'Reviews' }).getByRole('link', { name: 'Sign in', exact: true })).toBeVisible()
    const crossKindWelcome = page.getByRole('dialog', { name: 'Welcome to Consumit.' })
    if (await crossKindWelcome.isVisible()) {
      await crossKindWelcome.getByRole('button', { name: 'Start exploring', exact: true }).click()
      await expect(crossKindWelcome).not.toBeVisible()
    }
    const publicReview = page.getByText(crossKindBody, { exact: true })
    await expect(publicReview).toBeVisible()
    await publicReview.scrollIntoViewIfNeeded()
    await expectAccessible(page, `Guest reading a ${title.kind} review`)
    await page.screenshot({ animations: 'disabled', path: `.impeccable/review/public-title-reviews/${title.capture}` })
  }

  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  await page.goto('/settings#account')
  const reviewsVisibility = page.getByRole('checkbox', { name: 'Reviews', exact: true })
  await expect(reviewsVisibility).toBeChecked()
  await reviewsVisibility.uncheck()
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByText('Profile saved.', { exact: true })).toBeVisible()
  await page.goto(`/profile/${member.username}/reviews`)
  for (const body of authoredReviewBodies) await expect(page.getByText(body, { exact: true })).toBeVisible()

  await context.clearCookies()
  for (const hiddenTitle of [
    { body: reviewBody, count: 10, label: 'movie', path: '/title/693134/reviews' },
    { body: authoredReviewBodies[1]!, count: 11, label: 'series', path: '/series/95396/reviews' },
    { body: authoredReviewBodies[2]!, count: 11, label: 'anime', path: '/anime/8/reviews' },
  ]) {
    await page.goto(hiddenTitle.path)
    const hiddenReviewFeed = page.locator('[data-consumit-title-reviews]')
    const renderedFeeds = await hiddenReviewFeed.all()
    expect(renderedFeeds.length, 'the public title review feed should render').toBeGreaterThan(0)
    for (const feed of renderedFeeds) {
      await expect(feed).toContainText(`${hiddenTitle.count} public reviews.`)
      await expect(feed).not.toContainText(hiddenTitle.body)
    }
    await expectAccessible(page, `Guest ${hiddenTitle.label} feed after the author hides Reviews`)
    if (hiddenTitle.label === 'movie') {
      await mkdir('.impeccable/review/public-title-reviews', { recursive: true })
      await page.screenshot({ animations: 'disabled', path: '.impeccable/review/public-title-reviews/guest-feed-hidden-review-320x720.png' })
    }
  }
})
