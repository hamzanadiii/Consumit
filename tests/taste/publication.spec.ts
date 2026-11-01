import { expect, test } from '@playwright/test'

type Fixture = { token: string; list: string; review: string }
async function fixture(name: 'owner' | 'viewer'): Promise<Fixture> {
  const response = await fetch(`http://127.0.0.1:18563/__fixtures/session/${name}`)
  if (!response.ok) throw new Error('Taste fixture is unavailable.')
  return response.json()
}
test.beforeEach(async ({ context }) => {
  const owner = await fixture('owner')
  await context.addCookies([{ name: 'consumit_session', value: owner.token, domain: '127.0.0.1', path: '/' }])
})

test('profile customization previews and persists the public statement', async ({ page }) => {
  await page.goto('/profile/samira/customize')
  const statement = page.getByLabel('Your statement')
  await expect(statement).toBeVisible()
  await statement.fill('A small collection of unforgettable worlds.')
  await expect(page.locator('.taste-cover-copy')).toContainText('A small collection of unforgettable worlds.')
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page).toHaveURL(/\/profile\/samira$/)
  await expect(page.locator('.taste-profile-main')).toBeVisible()
  await page.getByRole('link', { name: 'View as visitor' }).click()
  await expect(page.locator('.taste-cover-copy')).toContainText('A small collection of unforgettable worlds.')
  await expect(page.getByRole('link', { name: 'Customize profile' })).toHaveCount(0)
})

test('collection drafts survive reopening and preserve chapters when saved', async ({ page }) => {
  const { list } = await fixture('owner')
  await page.goto(`/lists/${list}/edit`)
  const note = page.getByLabel('Note for Violet Hours')
  await expect(note).toBeEnabled()
  await note.fill('A private thought, ready to return to.')
  await page.getByRole('button', { name: 'Save private draft', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Private draft saved')
  await page.reload()
  await expect(note).toHaveValue('A private thought, ready to return to.')
  await expect(page.getByLabel('Chapter 1 name')).toHaveValue('After the city sleeps')
  await page.getByRole('button', { name: 'Save collection', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/lists/${list}$`))
  await expect(page.getByRole('heading', { name: 'After the city sleeps' })).toBeVisible()
  await expect(page.getByText('A private thought, ready to return to.')).toBeVisible()
})

test('public artwork sharing offers both formats and downloads an image', async ({ page }) => {
  const { list } = await fixture('owner')
  await page.goto(`/lists/${list}`)
  await page.locator('main').getByRole('button', { name: 'Share', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'A little of your world' })
  await expect(dialog.getByRole('button', { name: 'Download image' })).toBeEnabled()
  await expect(dialog.getByRole('img')).toHaveJSProperty('width', 1080)
  await dialog.getByRole('button', { name: 'Story', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Download image' })).toBeEnabled()
  await expect(dialog.getByRole('img')).toHaveJSProperty('height', 1920)
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download image' }).click()
  expect((await download).suggestedFilename()).toBe('consumit-list-story.png')
})

test('a reader can discuss with spoiler disclosure and restore update preferences', async ({ page, context }) => {
  const viewer = await fixture('viewer')
  await context.addCookies([{ name: 'consumit_session', value: viewer.token, domain: '127.0.0.1', path: '/' }])
  await page.goto(`/reviews/${viewer.review}`)
  await page.getByLabel('Join the conversation').fill('The final image changes everything.')
  await page.getByLabel('Contains spoilers', { exact: true }).check()
  await page.getByRole('button', { name: 'Post comment', exact: true }).click()
  const comment = page.locator('.taste-comment').filter({ hasText: 'The final image changes everything.' }).last()
  await expect(comment.getByText('The final image changes everything.')).toBeHidden()
  await comment.getByText('Contains spoilers · Reveal').click()
  await expect(comment.getByText('The final image changes everything.')).toBeVisible()
  await page.goto(`/lists/${viewer.list}`)
  const enable = page.getByRole('button', { name: 'Notify me about updates' })
  if (await enable.count()) { await expect(enable).toBeEnabled(); await enable.click() }
  await expect(page.getByRole('button', { name: 'Updates on' })).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await page.getByRole('button', { name: 'Updates on' }).click()
  await expect(page.getByRole('button', { name: 'Notify me about updates' })).toHaveAttribute('aria-pressed', 'false')
})

test('phone profile keeps its content and remaining archives reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/profile/samira')
  await expect(page.getByRole('heading', { name: 'The four that define me' })).toBeVisible()
  await page.getByText('More', { exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Samira profile sections' }).getByRole('link', { name: 'Ratings', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
