import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const STORAGE_KEY = 'consumit.ads.popunders'
const HOUR_MS = 60 * 60 * 1000

function popunderScript() {
  return document.querySelector('script[data-ad-popunder]')
}

async function mountPopunder() {
  const { PopunderAd } = await import('./popunder-ad')
  render(<PopunderAd />)
}

beforeEach(() => {
  window.localStorage.clear()
  document.querySelectorAll('script[data-ad-popunder]').forEach(script => script.remove())
  vi.resetModules()
})

afterEach(() => {
  window.localStorage.clear()
  document.querySelectorAll('script[data-ad-popunder]').forEach(script => script.remove())
})

describe('rate-limited popunder', () => {
  it('injects the network script once and records the injection', async () => {
    await mountPopunder()

    const script = popunderScript()
    expect(script).not.toBeNull()
    expect(script?.getAttribute('src')).toBe('https://pl29474263.profitableratecpmnetwork.com/a9/92/22/a9922243a391df320bd9848954d045e6.js')
    expect(script?.hasAttribute('async')).toBe(true)

    const recorded: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    expect(Array.isArray(recorded)).toBe(true)
    expect(recorded).toHaveLength(1)
  })

  it('injects a second time when only one popunder remains in the hour', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([Date.now() - 30_000]))

    await mountPopunder()

    expect(popunderScript()).not.toBeNull()
    const recorded = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]') as number[]
    expect(recorded).toHaveLength(2)
  })

  it('stops after two popunders in the rolling hour', async () => {
    const now = Date.now()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([now - 60_000, now - 30_000]))

    await mountPopunder()

    expect(popunderScript()).toBeNull()
    const recorded = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]') as number[]
    expect(recorded).toHaveLength(2)
  })

  it('prunes popunders older than an hour before counting', async () => {
    const now = Date.now()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([now - HOUR_MS - 1_000, now - HOUR_MS - 2_000, now - 60_000]))

    await mountPopunder()

    expect(popunderScript()).not.toBeNull()
    const recorded = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]') as number[]
    expect(recorded).toHaveLength(2)
    expect(recorded.every(entry => entry > now - HOUR_MS)).toBe(true)
  })

  it('treats a malformed store as empty and injects once', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'not-json')

    await mountPopunder()

    expect(popunderScript()).not.toBeNull()
  })

  it('injects only once per document even when the shell remounts', async () => {
    await mountPopunder()
    await mountPopunder()

    expect(document.querySelectorAll('script[data-ad-popunder]')).toHaveLength(1)
    const recorded = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]') as number[]
    expect(recorded).toHaveLength(1)
  })
})
