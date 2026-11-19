import { afterEach, describe, expect, it } from 'vitest'

import { SIDEBAR_INIT_SCRIPT, THEME_STYLE } from './filscreen-theme'

function runInitScript() {
  // The layout inlines this script in <head>; run it against the jsdom
  // document the same way a blocking script runs before first paint.
  eval(SIDEBAR_INIT_SCRIPT)
}

describe('sidebar pre-paint stamp', () => {
  afterEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-consumit-sidebar')
    document.querySelector('[data-consumit-sidebar-css]')?.remove()
  })

  it('stamps the collapsed rail before first paint when stored', () => {
    window.localStorage.setItem('consumit.home-sidebar', 'collapsed')
    runInitScript()

    expect(document.documentElement.getAttribute('data-consumit-sidebar')).toBe('collapsed')
    const style = document.querySelector('[data-consumit-sidebar-css]')
    expect(style?.textContent).toContain('.fs-sidebar-shell')
    expect(style?.textContent).toContain('76px')
    expect(style?.textContent).toContain('.fs-sidebar-label')
  })

  it('leaves the document untouched for the default expanded rail', () => {
    runInitScript()

    expect(document.documentElement.hasAttribute('data-consumit-sidebar')).toBe(false)
    expect(document.querySelector('[data-consumit-sidebar-css]')).toBeNull()
  })
})

describe('title action shelf theme', () => {
  it('keeps the member action shelf on the deployed midnight palette, including pre-paint', () => {
    expect(THEME_STYLE).toContain('[data-filscreen-home][data-theme="light"] [data-consumit-title-masthead] [data-consumit-member-shelf]')
    expect(THEME_STYLE).toContain('html[data-consumit-theme="light"] [data-filscreen-home] [data-consumit-title-masthead] [data-consumit-member-shelf]')
    expect(THEME_STYLE).toContain('--fs-page:#09090b;--fs-shell:#0b0b0e;--fs-ink:#f4f0e8;')
    expect(THEME_STYLE).toContain('--color-surface:#121216;--color-surface-raised:#19191e;')
    expect(THEME_STYLE).toContain('--color-ink:#f4f0e8;--color-copy:#c9c4bc;')
  })
})
