import { mkdir } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import axe from 'axe-core'
import { defaultExperiencePreferences } from '../../packages/contracts/src/index'

function dismissGuestWelcome(page: Page) {
  return page.addInitScript((preferences) => {
    localStorage.setItem('consumit.share-welcome-dismissed.v1', 'true')
    localStorage.setItem('consumit.experience.guest.v1', JSON.stringify({
      ...preferences,
      guideVersion: 1,
      guideStatus: 'dismissed',
    }))
  }, defaultExperiencePreferences())
}

async function expectWcag22Aa(page: Page, route: string) {
  await page.addScriptTag({ content: axe.source })
  const violations = await page.evaluate(async () => {
  const axeApi = (window as unknown as Window & { axe: typeof axe }).axe
    const report = await axeApi.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
      },
    })
    return report.violations.map(violation => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      targets: violation.nodes.map(node => node.target),
      ...(violation.id === 'color-contrast' ? { contrast: violation.nodes.map(node => ({ target: node.target, checks: node.any.map(check => check.data) })) } : {}),
    }))
  })

  expect(violations, `WCAG 2.2 AA issues on ${route}`).toEqual([])
}

async function expectMainAndScreen(page: Page, route: string, username: string) {
  if (route === '/lists') await expect(page).toHaveURL(`/profile/${username}/lists`)
  if (route === '/library?section=watchlist') {
    await expect(page).toHaveURL(`/profile/${username}/watchlist`)
    await expect(page.getByRole('heading', { name: 'Watchlist', exact: true })).toBeVisible()
  }
  await expect(page.locator('[data-filscreen-loading]')).toHaveCount(0)
  const main = page.getByRole('main')
  await expect(main).toHaveCount(1)
  await expect(main).toBeVisible()
  await expect(main).toHaveAttribute('id', 'consumit-main-content')
  if (route.startsWith('/watch/')) {
    await expect(main.getByRole('region', { name: /playback$/i }), `named Watch region on ${route}`).toBeVisible()
  } else {
    await expect(main.locator('h1:visible'), `one visible page heading on ${route}`).toHaveCount(1)
  }

  if (route === '/movies') await expect(page.getByRole('heading', { name: 'Movies.', exact: true })).toBeVisible()
  else if (route === '/title/693134') await expect(page.getByRole('heading', { name: /Northbound/ }).first()).toBeVisible()
  else if (route.startsWith('/watch/')) await expect(main).toHaveAttribute('data-session', 'ready')
  else if (route === `/profile/${username}`) await expect(main.locator('[data-consumit-profile-masthead]')).toBeVisible()
  else if (route === `/profile/${username}/reviews`) await expect(page.getByRole('heading', { name: 'Reviews', exact: true })).toBeVisible()
  else if (route === '/lists') {
    await expect(page).toHaveURL(`/profile/${username}/lists`)
    await expect(page.getByRole('heading', { name: 'Lists', exact: true })).toBeVisible()
  } else if (route === '/community') await expect(page.getByRole('heading', { name: 'Find your kind of people.', exact: true })).toBeVisible()
  else if (route === '/sign-up') await expect(page.getByRole('heading', { name: 'Create your account.', exact: true })).toBeVisible()
  else if (route === '/onboarding') await expect(page.getByRole('heading', { name: 'Make yourself at home.', exact: true })).toBeVisible()
  else if (route === '/settings#playback') await expect(page.getByRole('heading', { name: 'Settings.', exact: true })).toBeVisible()
  else if (route === '/library?section=watchlist') {
    await expect(page).toHaveURL(`/profile/${username}/watchlist`)
    await expect(page.getByRole('heading', { name: 'Watchlist', exact: true })).toBeVisible()
  }
}

test('keyboard users can skip browse navigation and focus the page main content', async ({ page }) => {
  await dismissGuestWelcome(page)
  await page.goto('/movies')
  const skipLink = page.getByRole('link', { name: 'Skip to main content' })

  await page.keyboard.press('Tab')
  await expect(skipLink).toBeFocused()
  await page.keyboard.press('Enter')

  const main = page.locator('main#consumit-main-content')
  await expect(main).toBeFocused()
  await expect(main).toHaveAttribute('tabindex', '-1')
})

test('the global skip link reaches one main landmark across distinct page shells', async ({ page }) => {
  await dismissGuestWelcome(page)

  for (const route of [
    '/search',
    '/sign-in',
    '/help',
    '/settings#playback',
    '/onboarding?next=%2Fmovies',
    '/watch/movie/693134',
    '/profile/experience_fixture',
  ]) {
    if (route.startsWith('/watch/')) await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(route)
    const main = page.locator('main#consumit-main-content')
    const skipLink = page.getByRole('link', { name: 'Skip to main content' })

    await expect(main).toHaveCount(1)
    await expect(main).toBeVisible()
    await expect(main).toHaveAttribute('tabindex', '-1')
    if (route.startsWith('/watch/')) await expect(main).toHaveAttribute('data-session', 'ready')
    await page.keyboard.press('Tab')
    await expect(skipLink, `skip link focus on ${route}`).toBeFocused()
    const focusTarget = await skipLink.boundingBox()
    expect(focusTarget?.height ?? 0, `visible focus target on ${route}`).toBeGreaterThanOrEqual(44)
    if (route.startsWith('/watch/')) await page.screenshot({ path: '.impeccable/review/accessibility/watch-skip-link-focus-390x844.png' })
    await page.keyboard.press('Enter')
    await expect(main, `main landmark focus on ${route}`).toBeFocused()
  }
})

test('Movies, Series and Anime browse keep 44px shell targets across breakpoints', async ({ page, context, request }) => {
  test.setTimeout(180_000)
  await dismissGuestWelcome(page)

  const viewports = [
    { width: 320, height: 720 },
    { width: 768, height: 900 },
    { width: 1023, height: 720 },
    { width: 1024, height: 768 },
    { width: 1440, height: 960 },
  ]
  const browseScreens = [
    { route: '/movies', tab: 'Movies', capture: 'movies' },
    { route: '/series', tab: 'Series', capture: 'series' },
    { route: '/anime', tab: 'Anime', capture: 'anime' },
  ]

  await mkdir('.impeccable/review/discovery', { recursive: true })
  for (const theme of ['dark', 'light'] as const) {
    await page.goto('/')
    await page.evaluate(value => localStorage.setItem('consumit.home-theme', value), theme)

    for (const viewport of viewports) {
      await page.setViewportSize(viewport)

      for (const screen of browseScreens) {
        await page.goto(screen.route)
        await expect(page.locator('html')).toHaveAttribute('data-consumit-theme', theme)
        await expect(page.locator('[data-filscreen-loading]')).toHaveCount(0)

        const mainLandmarks = page.locator('main#consumit-main-content')
        await expect(mainLandmarks, `${viewport.width}px ${theme} ${screen.route} settled main landmark`).toHaveCount(1)
        const mainNodes = await mainLandmarks.evaluateAll(nodes => nodes.map(node => {
          const element = node as HTMLElement
          const bounds = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          return {
            className: element.className,
            display: style.display,
            hiddenAncestor: Boolean(element.closest('[hidden]')),
            parent: `${element.parentElement?.tagName}.${String(element.parentElement?.className ?? '')}`,
            rect: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
            text: element.innerText.slice(0, 80),
            visibility: style.visibility,
          }
        }))
        expect(mainNodes, `${viewport.width}px ${theme} ${screen.route} main landmarks: ${JSON.stringify(mainNodes)}`).toHaveLength(1)
        const main = page.getByRole('main')
        await expect(main).toBeVisible()
        await expect(main.locator('h1:visible')).toHaveCount(1)
        await expect(main.getByRole('status')).toHaveText('1 title shown')

        if (viewport.width >= 1024) {
          const primary = page.getByRole('complementary', { name: 'Primary' })
          await expect(primary).toBeVisible()
          await expect(page.getByRole('button', { name: 'Open navigation' })).toBeHidden()
          for (const control of await primary.locator('a:visible, button:visible').all()) {
            const bounds = await control.boundingBox()
            expect(bounds?.width ?? 0, `${viewport.width}px ${theme} desktop rail target width`).toBeGreaterThanOrEqual(44)
            expect(bounds?.height ?? 0, `${viewport.width}px ${theme} desktop rail target height`).toBeGreaterThanOrEqual(44)
          }
        } else {
          await expect(page.getByRole('complementary', { name: 'Primary' })).toBeHidden()
          await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible()
        }

        const tabs = page.getByRole('navigation', { name: 'Catalog kinds' })
        const activeTab = tabs.getByRole('link', { name: screen.tab, exact: true })
        await expect(activeTab).toHaveAttribute('aria-current', 'page')
        for (const control of await tabs.locator('a:visible').all()) {
          const bounds = await control.boundingBox()
          expect(bounds?.width ?? 0, `${viewport.width}px ${theme} ${screen.tab} catalog target width`).toBeGreaterThanOrEqual(44)
          expect(bounds?.height ?? 0, `${viewport.width}px ${theme} ${screen.tab} catalog target height`).toBeGreaterThanOrEqual(44)
        }
        for (const control of await page.locator('.fs-utility').locator('a:visible, button:visible').all()) {
          const bounds = await control.boundingBox()
          expect(bounds?.width ?? 0, `${viewport.width}px ${theme} ${screen.tab} utility target width`).toBeGreaterThanOrEqual(44)
          expect(bounds?.height ?? 0, `${viewport.width}px ${theme} ${screen.tab} utility target height`).toBeGreaterThanOrEqual(44)
        }

        if (viewport.width === 320) {
          const featured = page.getByRole('region', { name: screen.route === '/movies' ? 'Now Playing' : 'Trending Now' })
          if (await featured.count()) {
            const featuredCount = await featured.getByRole('link').count()
            if (featuredCount <= 1) {
              const railState = await featured.evaluate(section => {
                const rail = section.querySelector('ul')
                return { children: rail?.children.length, clientWidth: rail?.clientWidth, scrollLeft: rail?.scrollLeft, scrollWidth: rail?.scrollWidth }
              })
              await expect(featured.getByRole('button', { name: /^Scroll featured titles/ }), `single-card featured rail: ${JSON.stringify(railState)}`).toHaveCount(0)
            }
          }
        }

        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${viewport.width}px ${theme} ${screen.tab} horizontal overflow`).toBe(true)
        await expectWcag22Aa(page, `${theme} ${screen.route} at ${viewport.width}x${viewport.height}`)
        await page.screenshot({ animations: 'disabled', path: `.impeccable/review/discovery/${screen.capture}-${theme}-${viewport.width}x${viewport.height}.png` })
      }
    }
  }

  const sessionResponse = await request.get('http://127.0.0.1:18563/__fixtures/session')
  expect(sessionResponse.ok(), await sessionResponse.text()).toBe(true)
  const { token, member } = await sessionResponse.json()
  const resetResponse = await request.post('http://127.0.0.1:18563/__fixtures/reset', {
    data: {
      memberId: member.id,
      preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed', communityDismissed: true },
    },
  })
  expect(resetResponse.ok(), await resetResponse.text()).toBe(true)
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])

  for (const theme of ['dark', 'light'] as const) {
    await page.goto('/')
    await page.evaluate(value => localStorage.setItem('consumit.home-theme', value), theme)

    for (const viewport of [viewports[0], viewports[4]]) {
      await page.setViewportSize(viewport)

      for (const screen of browseScreens) {
        await page.goto(screen.route)
        await expect(page.locator('html')).toHaveAttribute('data-consumit-theme', theme)
        const mainLandmarks = page.locator('main#consumit-main-content')
        await expect(mainLandmarks, `${viewport.width}px member ${theme} ${screen.route} settled main landmark`).toHaveCount(1)
        await expect(mainLandmarks.locator('h1:visible')).toHaveCount(1)
        const accountLink = page.getByRole('link', { name: `Your library, signed in as ${member.username}` })
        await expect(accountLink).toHaveAttribute('href', `/profile/${member.username}`)
        const accountBounds = await accountLink.boundingBox()
        expect(accountBounds?.width ?? 0, `${viewport.width}px member account link width`).toBeGreaterThanOrEqual(44)
        expect(accountBounds?.height ?? 0, `${viewport.width}px member account link height`).toBeGreaterThanOrEqual(44)

        if (viewport.width >= 1024) {
          const primary = page.getByRole('complementary', { name: 'Primary' })
          await expect(primary).toBeVisible()
          for (const control of await primary.locator('a:visible, button:visible').all()) {
            const bounds = await control.boundingBox()
            expect(bounds?.width ?? 0, `${viewport.width}px member desktop rail target width`).toBeGreaterThanOrEqual(44)
            expect(bounds?.height ?? 0, `${viewport.width}px member desktop rail target height`).toBeGreaterThanOrEqual(44)
          }
        } else {
          await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible()
        }

        const tabs = page.getByRole('navigation', { name: 'Catalog kinds' })
        await expect(tabs.getByRole('link', { name: screen.tab, exact: true })).toHaveAttribute('aria-current', 'page')
        for (const control of await tabs.locator('a:visible').all()) {
          const bounds = await control.boundingBox()
          expect(bounds?.width ?? 0, `${viewport.width}px member ${screen.tab} catalog target width`).toBeGreaterThanOrEqual(44)
          expect(bounds?.height ?? 0, `${viewport.width}px member ${screen.tab} catalog target height`).toBeGreaterThanOrEqual(44)
        }
        for (const control of await page.locator('.fs-utility').locator('a:visible, button:visible').all()) {
          const bounds = await control.boundingBox()
          expect(bounds?.width ?? 0, `${viewport.width}px member utility target width`).toBeGreaterThanOrEqual(44)
          expect(bounds?.height ?? 0, `${viewport.width}px member utility target height`).toBeGreaterThanOrEqual(44)
        }

        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${viewport.width}px member ${theme} ${screen.tab} horizontal overflow`).toBe(true)
        await expectWcag22Aa(page, `member ${theme} ${screen.route} at ${viewport.width}x${viewport.height}`)
        await page.screenshot({ animations: 'disabled', path: `.impeccable/review/discovery/member-${screen.capture}-${theme}-${viewport.width}x${viewport.height}.png` })
      }
    }
  }
})

test('the three member journeys meet WCAG 2.2 AA on their key screens', async ({ page, context, request }) => {
  test.setTimeout(240000)
  await dismissGuestWelcome(page)

  for (const route of ['/movies', '/title/693134', '/watch/movie/693134']) {
    await page.goto(route)
    await expectMainAndScreen(page, route, 'experience_fixture')
    await expectWcag22Aa(page, route)
  }

  const sessionResponse = await request.get('http://127.0.0.1:18563/__fixtures/session')
  expect(sessionResponse.ok(), await sessionResponse.text()).toBe(true)
  const { token, member } = await sessionResponse.json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  const resetResponse = await request.post('http://127.0.0.1:18563/__fixtures/reset', {
    data: {
      memberId: member.id,
      reviewFixture: true,
      collectionFixture: true,
      preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed', communityDismissed: true },
    },
  })
  expect(resetResponse.ok(), await resetResponse.text()).toBe(true)

  for (const route of [
    `/profile/${member.username}`,
    `/profile/${member.username}/reviews`,
    '/lists',
    '/community',
  ]) {
    await page.goto(route)
    await expectMainAndScreen(page, route, member.username)
    await expectWcag22Aa(page, route)
  }

  await context.clearCookies()
  for (const route of ['/sign-up', '/onboarding']) {
    await page.goto(route)
    await expectMainAndScreen(page, route, member.username)
    await expectWcag22Aa(page, route)
  }

  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  for (const route of ['/settings#playback', '/library?section=watchlist', `/profile/${member.username}`]) {
    await page.goto(route)
    await expectMainAndScreen(page, route, member.username)
    await expectWcag22Aa(page, route)
  }

  await page.addInitScript(() => window.localStorage.setItem('consumit.home-theme', 'light'))
  for (const route of [
    '/movies',
    '/title/693134',
    `/profile/${member.username}`,
    `/profile/${member.username}/reviews`,
    '/lists',
    '/community',
    '/settings#playback',
    '/library?section=watchlist',
  ]) {
    await page.goto(route)
    await expectMainAndScreen(page, route, member.username)
    await expect(page.locator('html')).toHaveAttribute('data-consumit-theme', 'light')
    await expectWcag22Aa(page, route)
  }
})

test('profile archive and legacy library entry keep one page main landmark', async ({ page, context, request }) => {
  await dismissGuestWelcome(page)
  const sessionResponse = await request.get('http://127.0.0.1:18563/__fixtures/session')
  expect(sessionResponse.ok(), await sessionResponse.text()).toBe(true)
  const { token, member } = await sessionResponse.json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])

  for (const route of [`/profile/${member.username}/watchlist`, '/library?section=watchlist']) {
    await page.goto(route)
    await expect(page).toHaveURL(`/profile/${member.username}/watchlist`)
    await expect(page.getByRole('heading', { name: 'Watchlist', exact: true })).toBeVisible()
    await expect(page.locator('main#consumit-main-content'), `main landmark on ${route}`).toHaveCount(1)
  }
})

test('Watch destination cards and nested settings meet WCAG 2.2 AA', async ({ page }) => {
  await dismissGuestWelcome(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/watch/movie/693134')
  await expect(page.locator('main#consumit-main-content')).toHaveAttribute('data-session', 'ready')

  for (const destination of ['Sources', 'Captions', 'Settings: audio, speed, brightness']) {
    const trigger = page.getByRole('button', { name: destination, exact: true })
    await trigger.click()
    const panel = page.getByRole('dialog').last()
    await expect(panel).toBeVisible()
    await expectWcag22Aa(page, `Watch ${destination}`)
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
  }

  await page.getByRole('button', { name: 'Settings: audio, speed, brightness' }).click()
  await page.getByRole('button', { name: /^Quality/ }).click()
  await expect(page.getByRole('dialog', { name: 'Quality' })).toBeVisible()
  await expectWcag22Aa(page, 'Watch nested Quality settings')
})

test('monthly edition reader and editor meet WCAG 2.2 AA in both themes', async ({ page, context, request }) => {
  await dismissGuestWelcome(page)
  const sessionResponse = await request.get('http://127.0.0.1:18563/__fixtures/session')
  expect(sessionResponse.ok(), await sessionResponse.text()).toBe(true)
  const { token, member } = await sessionResponse.json()
  const resetResponse = await request.post('http://127.0.0.1:18563/__fixtures/reset', {
    data: {
      memberId: member.id,
      reviewFixture: true,
      collectionFixture: true,
      publicCollection: true,
      preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed' },
    },
  })
  expect(resetResponse.ok(), await resetResponse.text()).toBe(true)
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  await page.goto('/')

  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate(value => localStorage.setItem('consumit.home-theme', value), theme)
    for (const route of [
      `/profile/${member.username}/editions/2026-10`,
      `/profile/${member.username}/editions/2026-10?edit=1`,
      `/profile/${member.username}/editions/new`,
    ]) {
      await page.goto(route)
      await expect(page.locator('html')).toHaveAttribute('data-consumit-theme', theme)
      await expect(page.locator('main#consumit-main-content h1').first()).toBeVisible()
      await expectWcag22Aa(page, route)
    }
  }
})

test('the remaining active member-facing screens meet WCAG 2.2 AA in both themes', async ({ page, context, request }) => {
  test.setTimeout(420000)
  await dismissGuestWelcome(page)
  await context.clearCookies()
  await page.goto('/')

  const guestRoutes = [
    '/',
    '/settings',
    '/series',
    '/series/95396',
    '/anime',
    '/anime/8',
    '/anime/8/reviews',
    '/search?q=north',
    '/search?q=north&type=people',
    '/title/693134/reviews',
    '/series/95396/reviews',
    '/about',
    '/sign-in',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
    '/help',
    '/report-issue?category=playback',
    '/privacy',
    '/terms',
    '/dmca',
  ]

  const sessionResponse = await request.get('http://127.0.0.1:18563/__fixtures/session')
  expect(sessionResponse.ok(), await sessionResponse.text()).toBe(true)
  const { token, member } = await sessionResponse.json()
  const resetResponse = await request.post('http://127.0.0.1:18563/__fixtures/reset', {
    data: {
      memberId: member.id,
      reviewFixture: true,
      collectionFixture: true,
      publicCollection: true,
      preferences: { ...defaultExperiencePreferences(), guideVersion: 1, guideStatus: 'dismissed', communityDismissed: true },
    },
  })
  expect(resetResponse.ok(), await resetResponse.text()).toBe(true)
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])

  const memberRoutes = [
    '/settings',
    '/onboarding/favorites',
    '/onboarding/ready',
    '/lists/quiet-evenings',
    '/lists/quiet-evenings/edit',
    '/lists/new',
    '/reviews/experience-review',
    '/community/settings',
    '/notifications',
    `/profile/${member.username}/activity`,
    `/profile/${member.username}/editions/2026-10`,
    `/profile/${member.username}/editions/2026-10?edit=1`,
    `/profile/${member.username}/editions/new`,
    `/profile/${member.username}/favorites`,
    `/profile/${member.username}/films`,
    `/profile/${member.username}/diary`,
    `/profile/${member.username}/history`,
    `/profile/${member.username}/watched`,
    `/profile/${member.username}/reviews`,
    `/profile/${member.username}/watchlist`,
    `/profile/${member.username}/lists`,
    `/profile/${member.username}/likes`,
    `/profile/${member.username}/tags`,
    `/profile/${member.username}/ratings`,
    `/profile/${member.username}/network`,
  ]

  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate(value => localStorage.setItem('consumit.home-theme', value), theme)
    for (const route of memberRoutes) {
      await page.goto(route)
      await expect(page.locator('html')).toHaveAttribute('data-consumit-theme', theme)
      const main = page.locator('main#consumit-main-content')
      await expect(main, `main landmark on ${route}`).toHaveCount(1)
      await expect(main).toBeVisible()
      await expect(main.locator('h1:visible'), `one visible page heading on ${route}`).toHaveCount(1)
      await expect(page.locator('h1:visible'), `one visible document heading on ${route}`).toHaveCount(1)
      await expectWcag22Aa(page, route)
    }
  }

  await context.clearCookies()
  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate(value => localStorage.setItem('consumit.home-theme', value), theme)
    for (const route of guestRoutes) {
      await page.goto(route)
      await expect(page.locator('html')).toHaveAttribute('data-consumit-theme', theme)
      const main = page.locator('main#consumit-main-content')
      await expect(main, `main landmark on ${route}`).toHaveCount(1)
      await expect(main).toBeVisible()
      await expect(main.locator('h1:visible'), `one visible page heading on ${route}`).toHaveCount(1)
      await expect(page.locator('h1:visible'), `one visible document heading on ${route}`).toHaveCount(1)
      await expectWcag22Aa(page, route)
    }
  }
})

test('community moderation hides reports from guests and regular members', async ({ page, context, request }) => {
  await request.post('http://127.0.0.1:18563/__fixtures/reset', { data: { moderationFixture: true } })
  await page.setViewportSize({ width: 320, height: 720 })
  const sessionResponse = await request.get('http://127.0.0.1:18563/__fixtures/session')
  expect(sessionResponse.ok(), await sessionResponse.text()).toBe(true)
  const { token, member } = await sessionResponse.json()
  expect(member.role).toBe('member')
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])

  await page.goto('/community/moderation')
  await expect(page.getByRole('heading', { name: 'We couldn’t find that page' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Community reports' })).toHaveCount(0)
  await expect(page.getByText('The ending reveals the hidden identity of the visitor.')).toHaveCount(0)

  await context.clearCookies()
  await page.goto('/community/moderation')
  await expect(page.getByRole('heading', { name: 'We couldn’t find that page' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Community reports' })).toHaveCount(0)
  await expect(page.getByText('The ending reveals the hidden identity of the visitor.')).toHaveCount(0)
})

test('admin moderation keeps its decision note and offers a safe retry after a failed action', async ({ page, context, request }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await dismissGuestWelcome(page)
  const sessionResponse = await request.get('http://127.0.0.1:18563/__fixtures/session?label=admin')
  expect(sessionResponse.ok(), await sessionResponse.text()).toBe(true)
  const { token, member } = await sessionResponse.json()
  expect(member.role).toBe('admin')

  const resetResponse = await request.post('http://127.0.0.1:18563/__fixtures/reset', {
    data: { moderationFixture: true, moderationFailure: true },
  })
  expect(resetResponse.ok(), await resetResponse.text()).toBe(true)
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])
  await page.goto('/')

  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate(value => localStorage.setItem('consumit.home-theme', value), theme)
    await page.goto('/community/moderation')
    await expect(page.locator('html')).toHaveAttribute('data-consumit-theme', theme)
    await expect(page.getByRole('heading', { name: 'Community reports' })).toBeVisible()
    await expectWcag22Aa(page, '/community/moderation')
  }

  const report = page.getByRole('article').filter({ hasText: 'The ending is revealed in this review.' })
  await expect(report).toBeVisible()
  await report.getByText('Inspect reported content (may contain spoilers)').click()
  await expect(report.getByText('The ending reveals the hidden identity of the visitor.')).toBeVisible()

  const note = report.getByLabel('Decision note')
  const remove = report.getByRole('button', { name: 'Remove content' })
  await expect(remove).toBeDisabled()
  await note.fill('The review violates the spoiler policy.')
  const noteBounds = await note.boundingBox()
  expect(noteBounds?.width ?? 0).toBeGreaterThan(0)
  expect((noteBounds?.x ?? 0) + (noteBounds?.width ?? 0)).toBeLessThanOrEqual(320)
  const decisions = report.getByRole('button')
  await expect(decisions).toHaveCount(4)
  for (let index = 0; index < await decisions.count(); index++) {
    const bounds = await decisions.nth(index).boundingBox()
    expect(bounds?.height ?? 0, 'Moderation decisions should be touch-safe').toBeGreaterThanOrEqual(44)
    expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(0)
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(320)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await remove.click()

  await expect(page.locator('.taste-status [role="alert"]')).toContainText('temporarily unavailable')
  await expect(note).toHaveValue('The review violates the spoiler policy.')
  await expectWcag22Aa(page, '/community/moderation decision retry')
  await mkdir('.impeccable/review/admin-moderation', { recursive: true })
  await page.screenshot({ animations: 'disabled', fullPage: true, path: '.impeccable/review/admin-moderation/decision-retry-320x720.png' })
  const retry = page.getByRole('button', { name: 'Retry this decision' })
  await expect(retry).toBeFocused()
  await retry.click()
  const success = page.locator('.taste-status[role="status"]')
  await expect(success).toContainText('Content removed and decision recorded.')
  await expect(success).toBeFocused()
  await expect(report).toHaveCount(0)
})

test('admin control room sections meet WCAG 2.2 AA in both themes on a phone', async ({ page, context, request }) => {
  test.setTimeout(180000)
  await dismissGuestWelcome(page)
  const sessionResponse = await request.get('http://127.0.0.1:18563/__fixtures/session?label=admin')
  expect(sessionResponse.ok(), await sessionResponse.text()).toBe(true)
  const { token, member } = await sessionResponse.json()
  await context.addCookies([{ name: 'consumit_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }])

  const provider = {
    id: 'fixture-provider', role: 'video', deliveryMode: 'direct', proxyApproved: true,
    audioCapabilities: { separateAudio: 'unverified', languages: [], health: 'untested' },
    enabled: true, regions: ['US'], configuredRegions: ['US'], mediaHosts: ['media.example.test'],
    upstreamGroup: 'fixture-upstream', concurrency: 1, requestsPerMinute: 60, priority: 1,
    mediaKinds: ['movie', 'series', 'anime'],
  }
  await page.route('**/v1/admin/**', async route => {
    const path = new URL(route.request().url()).pathname
    let body: unknown = {}
    if (path === '/v1/admin/health') body = { api: 'ok', store: 'ok' }
    else if (path === '/v1/admin/providers') body = { providers: [provider], readiness: { configuredRows: 1, enabledRows: 1 } }
    else if (path === '/v1/admin/providers/config') body = { overrides: {} }
    else if (/\/v1\/admin\/providers\/order\/(movie|series|anime)$/.test(path)) {
      const kind = path.split('/').at(-1)
      body = { kind, providerIds: ['fixture-provider'], revision: 0 }
    } else if (path === '/v1/admin/providers/health') body = { movie: [], series: [], anime: [], audio: [] }
    else if (path === '/v1/admin/providers/metrics') body = { available: false, windowMinutes: 15, metrics: {}, comparisonAvailable: false, comparisonRows: [] }
    else if (path === '/v1/admin/providers/alerts') body = { available: true, alerts: [] }
    else if (path === '/v1/admin/providers/changes') body = { changes: [] }
    else if (path === '/v1/admin/subtitles') body = { providers: [] }
    else if (path.startsWith('/v1/admin/members')) body = { members: [{ id: member.id, email: member.email, username: member.username, displayName: null, role: 'admin', createdAt: '2026-10-28T12:00:00.000Z', emailVerified: true }], total: 1, limit: 50, offset: 0 }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.setViewportSize({ width: 390, height: 844 })

  const sections = [
    { key: 'overview', label: 'Dashboard', heading: /Playback overview/ },
    { key: 'providers', label: 'Providers', heading: /^Providers$/ },
    { key: 'test-lab', label: 'Test Lab', heading: /^Test Lab\./ },
    { key: 'operations', label: 'Diagnostics', heading: /Provider operations/ },
    { key: 'members', label: 'Access', heading: /Membership/ },
  ]
  for (const theme of ['dark', 'light'] as const) {
    await page.goto('/')
    await page.evaluate(value => localStorage.setItem('consumit.home-theme', value), theme)
    for (const section of sections) {
      await page.goto(`/admin#${section.key}`)
      await expect(page.locator('html')).toHaveAttribute('data-consumit-theme', theme)
      const navigation = page.getByRole('navigation', { name: 'Admin sections' })
      await expect(navigation.getByRole('button', { name: section.label, exact: true })).toHaveAttribute('aria-current', 'page')
      await expect(page.getByRole('heading', { name: section.heading })).toBeVisible()
      await expect(page.locator('main#consumit-main-content')).toHaveCount(1)
      const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
      expect(overflows, `${section.label} must not overflow the phone viewport`).toBe(false)
      await expectWcag22Aa(page, `/admin#${section.key}`)
    }
  }
})
