import { afterEach, describe, expect, it } from 'vitest'

import { SIDEBAR_INIT_SCRIPT, SIDEBAR_STORAGE_KEY } from './filscreen-theme'

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
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, 'collapsed')
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
