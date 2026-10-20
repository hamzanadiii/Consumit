import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const STORAGE_KEY = 'consumit.ads.popunders'
const WINDOW_MS = 30 * 60 * 1000
const MIN_GAP_MS = 5 * 60 * 1000
const POPUNDER_SRC = 'https://pl29474263.profitableratecpmnetwork.com/a9/92/22/a9922243a391df320bd9848954d045e6.js'

function popunderScript() {
  return document.querySelector<HTMLScriptElement>('script[data-ad-popunder]')
}

async function mountPopunder() {
  const { PopunderAd } = await import('./popunder-ad')
  const { ExperienceProvider } = await import('../experience/experience-provider')
  await act(async () => { render(<ExperienceProvider memberId={null} status="anonymous"><PopunderAd /></ExperienceProvider>) })
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

describe('rate-limited pop-under ads', () => {
  it('waits until account preferences resolve', async () => {
    const { PopunderAd } = await import('./popunder-ad')
    const { ExperienceProvider } = await import('../experience/experience-provider')
    render(<ExperienceProvider memberId="member" status="loading"><PopunderAd /></ExperienceProvider>)
    expect(popunderScript()).toBeNull()
  })

  it('honors the device opt-out', async () => {
    localStorage.setItem('consumit.ads.enabled', 'false')
    await mountPopunder()
    expect(popunderScript()).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('injects the existing publisher tag and records the injection', async () => {
    await mountPopunder()
    expect(popunderScript()?.src).toBe(POPUNDER_SRC)
    expect(popunderScript()?.async).toBe(true)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).toHaveLength(1)
  })

  it('enforces at least five minutes between injections', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([Date.now() - MIN_GAP_MS + 60_000]))
    await mountPopunder()
    expect(popunderScript()).toBeNull()
  })

  it('allows an injection after five minutes when below the rolling cap', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([Date.now() - MIN_GAP_MS - 1_000]))
    await mountPopunder()
    expect(popunderScript()).not.toBeNull()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).toHaveLength(2)
  })

  it('caps injections at four in a rolling 30-minute window', async () => {
    const now = Date.now()
    localStorage.setItem(STORAGE_KEY, JSON.stringify([now - 26 * 60_000, now - 19 * 60_000, now - 12 * 60_000, now - 6 * 60_000]))
    await mountPopunder()
    expect(popunderScript()).toBeNull()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).toHaveLength(4)
  })

  it('prunes timestamps outside the rolling 30-minute window before applying both limits', async () => {
    const now = Date.now()
    localStorage.setItem(STORAGE_KEY, JSON.stringify([now - WINDOW_MS - 1_000, now - WINDOW_MS - 2_000, now - MIN_GAP_MS - 1_000]))
    await mountPopunder()
    expect(popunderScript()).not.toBeNull()
    const recorded = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as number[]
    expect(recorded).toHaveLength(2)
    expect(recorded.every(timestamp => timestamp > now - WINDOW_MS)).toBe(true)
  })

  it('treats malformed history as empty and injects only once per document', async () => {
    localStorage.setItem(STORAGE_KEY, 'not-json')
    await mountPopunder()
    await mountPopunder()
    expect(document.querySelectorAll('script[data-ad-popunder]')).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).toHaveLength(1)
  })
})
