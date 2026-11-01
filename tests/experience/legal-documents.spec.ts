import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import axe from 'axe-core'

async function wcagViolations(page: import('@playwright/test').Page) {
  await page.addScriptTag({ content: axe.source })
  return page.evaluate(async () => {
    const axeApi = (window as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return report.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))
  })
}

test('legal documents offer section navigation with keyboard reachability on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await page.addInitScript(() => {
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
  })

  for (const route of ['/privacy', '/terms', '/dmca']) {
    await page.goto(route)
    const navigation = page.getByRole('navigation', { name: 'On this page' })
    const links = navigation.getByRole('link')
    await expect(links.first()).toBeVisible()
    for (const link of await links.all()) {
      const href = await link.getAttribute('href')
      expect(href).toMatch(/^#[a-z-]+$/)
      const target = page.locator(href!)
      await expect(target).toHaveCount(1)
      await expect(target).toHaveAttribute('tabindex', '-1')
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (route === '/privacy') {
      await mkdir('.impeccable/review/legal', { recursive: true })
      await page.screenshot({ animations: 'disabled', path: '.impeccable/review/legal/privacy-index-dark-320x720.png' })
    }
  }

  await page.goto('/privacy')
  const playbackLink = page.getByRole('navigation', { name: 'On this page' }).getByRole('link', { name: '3. Playback and third-party sources' })
  await playbackLink.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/privacy#privacy-playback')
  const playbackHeading = page.getByRole('heading', { name: '3. Playback and third-party sources' })
  await expect(playbackHeading).toBeFocused()
  await expect(playbackHeading).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(await wcagViolations(page), 'Dark phone Privacy should meet WCAG 2.2 AA').toEqual([])

  await mkdir('.impeccable/review/legal', { recursive: true })
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/legal/privacy-playback-dark-320x720.png' })
  await page.evaluate(() => localStorage.setItem('consumit.home-theme', 'light'))
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-consumit-theme', 'light')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(await wcagViolations(page), 'Light phone Privacy should meet WCAG 2.2 AA').toEqual([])
  await page.screenshot({ animations: 'disabled', path: '.impeccable/review/legal/privacy-playback-light-320x720.png' })
})
