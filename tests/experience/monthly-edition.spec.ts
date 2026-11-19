import { test, expect, type APIRequestContext, type BrowserContext } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import axe from 'axe-core'

const api = 'http://127.0.0.1:18563'
const originalIntroduction = 'Three stories that made an ordinary month feel worth remembering.'
const revisedIntroduction = 'A quieter month, held together by stories worth returning to.'

async function signIn(context: BrowserContext, request: APIRequestContext) {
  const { token, member } = await (await request.get(`${api}/__fixtures/session`)).json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  await request.post(`${api}/__fixtures/reset`, { data: {
    reviewFixture: true,
    collectionFixture: true,
    publicCollection: true,
    editionFixture: true,
    editionSaveFailures: 1,
    editionPublishFailures: 1,
    editionUnpublishFailures: 1,
  } })
  return { member: member as { id: string; username: string }, token }
}

async function expectAccessible(page: import('@playwright/test').Page, label: string) {
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => (await (window as unknown as Window & { axe: typeof axe }).axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  })).violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) })))
  expect(violations, label).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label} horizontal overflow`).toBe(true)
}

test('monthly edition draft, publish and unpublish recover without losing the public snapshot or private draft', async ({ page, context, request, browser }) => {
  const { member, token } = await signIn(context, request)
  await page.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  await page.setViewportSize({ width: 320, height: 720 })
  const root = `/profile/${member.username}/editions/2026-10`
  await page.goto(`${root}?edit=1`)

  const introduction = page.getByRole('textbox', { name: 'Your introduction' }).first()
  await expect(introduction).toHaveValue(originalIntroduction)
  await expect(page.getByRole('button', { name: 'Unpublish', exact: true })).toBeVisible()
  const draftSave = page.getByRole('button', { name: 'Save private draft', exact: true })
  await expect(draftSave.locator('.taste-editor-save-short')).toBeVisible()
  await expect(draftSave.locator('.taste-editor-save-long')).toBeHidden()
  const publish = page.getByRole('button', { name: 'Publish edition', exact: true })
  const publishBox = await publish.boundingBox()
  expect(publishBox?.height ?? 0).toBeGreaterThanOrEqual(44)
  const titleBox = await page.getByRole('textbox', { name: 'Title', exact: true }).boundingBox()
  const actionBarBox = await page.locator('.taste-editor-bar').boundingBox()
  expect(titleBox).not.toBeNull()
  expect(actionBarBox).not.toBeNull()
  expect(titleBox!.y + titleBox!.height).toBeLessThanOrEqual(actionBarBox!.y)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expectAccessible(page, 'Monthly edition editor')
  await mkdir('.impeccable/review/monthly-edition', { recursive: true })
  await page.screenshot({ animations: 'disabled', fullPage: false, path: '.impeccable/review/monthly-edition/editor-320x720.png' })

  await introduction.fill(revisedIntroduction)
  await page.getByRole('button', { name: 'Save private draft', exact: true }).click()
  await expect(page.locator('.taste-status[role="alert"]')).toContainText('Edition save failed. Try again.')
  await expect(introduction).toHaveValue(revisedIntroduction)
  const retry = page.getByRole('button', { name: 'Retry saving private draft', exact: true })
  await expect(retry).toBeFocused()
  await retry.click()
  await expect(page.getByRole('status')).toContainText('Private draft saved.')

  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Your introduction' }).first()).toHaveValue(revisedIntroduction)
  await page.goto(root)
  await expect(page.getByText(originalIntroduction, { exact: true }).first()).toBeVisible()

  await page.goto(`${root}?edit=1`)
  await expect(page.getByRole('textbox', { name: 'Your introduction' }).first()).toHaveValue(revisedIntroduction)
  await page.getByRole('button', { name: 'Publish edition', exact: true }).click()
  const publishFailure = page.locator('.taste-status[role="alert"]')
  await expect(publishFailure).toContainText('Edition publish failed. Try again.')
  await expect(page.getByRole('textbox', { name: 'Your introduction' }).first()).toHaveValue(revisedIntroduction)
  const retryPublish = page.getByRole('button', { name: 'Retry publishing edition', exact: true })
  await expect(retryPublish).toBeFocused()
  expect((await retryPublish.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await expectAccessible(page, 'Monthly edition publish retry')
  await mkdir('.impeccable/review/monthly-edition', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/monthly-edition/publish-retry-320x720.png' })
  await retryPublish.click()
  await expect(page).toHaveURL(root)
  await expect(page.getByText(revisedIntroduction, { exact: true })).toBeVisible()

  await context.clearCookies()
  await page.reload()
  await expect(page.getByText(revisedIntroduction, { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Edit edition', exact: true })).toHaveCount(0)
  await page.goto(`${root}?edit=1`)
  const editDestination = `${root}?edit=1`
  await expect(page).toHaveURL(`/sign-in?next=${encodeURIComponent(editDestination)}`)
  await expect(page.getByText(revisedIntroduction, { exact: true })).toHaveCount(0)
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])

  await page.goto(`${root}?edit=1`)
  await expect(page.getByRole('textbox', { name: 'Your introduction' }).first()).toHaveValue(revisedIntroduction)
  const unpublish = page.getByRole('button', { name: 'Unpublish', exact: true })
  await expect(unpublish).toBeVisible()
  await unpublish.click()
  const unpublishFailure = page.locator('.taste-status[role="alert"]')
  await expect(unpublishFailure).toContainText('Edition unpublish failed. Try again.')
  const retryUnpublish = page.getByRole('button', { name: 'Retry unpublishing edition', exact: true })
  await expect(retryUnpublish).toBeFocused()
  expect((await retryUnpublish.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await expectAccessible(page, 'Monthly edition unpublish retry')
  await mkdir('.impeccable/review/monthly-edition', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/monthly-edition/unpublish-retry-320x720.png' })

  const guestContext = await browser.newContext({ viewport: { width: 320, height: 720 } })
  await guestContext.addInitScript(() => localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true'))
  const guestPage = await guestContext.newPage()
  await guestPage.goto(root)
  await expect(guestPage.getByText(revisedIntroduction, { exact: true })).toBeVisible()
  await guestContext.close()

  await retryUnpublish.click()
  await expect(page).toHaveURL(new RegExp(`/profile/${member.username}$`))
  await page.goto(`${root}?edit=1`)
  await expect(page.getByRole('textbox', { name: 'Your introduction' }).first()).toHaveValue(revisedIntroduction)
  await expect(page.getByRole('button', { name: 'Unpublish', exact: true })).toHaveCount(0)

  await page.evaluate(() => localStorage.setItem('consumit.home-theme', 'light'))
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-consumit-theme', 'light')
  await expect(page.getByRole('heading', { name: 'A month, in your words.', exact: true })).toBeVisible()
  await expectAccessible(page, 'Monthly edition editor in light desktop layout')
  await mkdir('.impeccable/review/monthly-edition', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/monthly-edition/editor-light-1440x960.png' })

  await page.setViewportSize({ width: 844, height: 390 })
  const shortLandscapeBar = page.locator('.taste-editor-bar')
  const shortLandscapeTitle = page.getByRole('textbox', { name: 'Title', exact: true })
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect(shortLandscapeBar).toHaveCSS('position', 'static')
  await shortLandscapeTitle.evaluate(element => element.scrollIntoView({ block: 'center' }))
  await expect(shortLandscapeTitle).toBeInViewport()
  const shortLandscapeBarBox = await shortLandscapeBar.boundingBox()
  const shortLandscapeTitleBox = await shortLandscapeTitle.boundingBox()
  expect(shortLandscapeBarBox).not.toBeNull()
  expect(shortLandscapeTitleBox).not.toBeNull()
  expect(shortLandscapeTitleBox!.y + shortLandscapeTitleBox!.height).toBeLessThanOrEqual(shortLandscapeBarBox!.y)
  expect(shortLandscapeTitleBox!.y + shortLandscapeTitleBox!.height).toBeLessThanOrEqual(390)
  await expectAccessible(page, 'Monthly edition editor in short landscape')
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/monthly-edition/editor-short-landscape-844x390.png' })
  await shortLandscapeBar.scrollIntoViewIfNeeded()
  await expect(shortLandscapeBar).toBeInViewport()
})
