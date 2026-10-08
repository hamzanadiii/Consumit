import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AdSlot } from './ad-slot'

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void

const intersections: ObserverCallback[] = []

class FakeIntersectionObserver {
  constructor(callback: ObserverCallback) {
    intersections.push(callback)
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

function intersect() {
  act(() => {
    for (const callback of intersections) callback([{ isIntersecting: true }])
  })
}

function layOut(width: number) {
  const root = document.querySelector('[data-ad-slot]')
  if (!(root instanceof HTMLElement)) throw new Error('ad slot root missing')
  Object.defineProperty(root, 'offsetParent', { configurable: true, value: document.body })
  Object.defineProperty(root, 'clientWidth', { configurable: true, value: width })
  return root
}

function frame() {
  const element = document.querySelector('iframe[title="Advertisement"]')
  if (!(element instanceof HTMLIFrameElement)) throw new Error('ad frame missing')
  return element
}

function resize() {
  act(() => {
    window.dispatchEvent(new Event('resize'))
  })
}

beforeEach(() => {
  intersections.length = 0
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('live advertisement slot', () => {
  it('stays empty until the slot scrolls near, then loads the leaderboard unit in a wide slot', () => {
    render(<AdSlot placement="home" />)
    expect(screen.queryByText('Advertisement')).not.toBeInTheDocument()

    layOut(800)
    intersect()

    expect(screen.getByText('Advertisement')).toBeInTheDocument()
    expect(frame().getAttribute('width')).toBe('728')
    expect(frame().getAttribute('height')).toBe('90')
    expect(frame().getAttribute('srcdoc')).toContain('3930b97bd3841d660aa9cc7c8344216d')
  })

  it('picks the mobile banner in a narrow slot and stays empty when no unit fits', () => {
    render(<AdSlot placement="catalog" />)
    layOut(360)
    intersect()

    expect(frame().getAttribute('width')).toBe('320')
    expect(frame().getAttribute('srcdoc')).toContain('ebb0ce11e95706ef527d3edb3c4df1ce')
  })

  it('leaves a too-narrow banner slot empty without reserving space', () => {
    render(<AdSlot placement="catalog" />)
    layOut(200)
    intersect()

    expect(screen.queryByText('Advertisement')).not.toBeInTheDocument()
    expect(document.querySelector('iframe')).toBeNull()
  })

  it('loads the rectangle unit when it fits', () => {
    render(<AdSlot placement="detail" shape="rectangle" />)
    layOut(340)
    intersect()

    expect(frame().getAttribute('width')).toBe('300')
    expect(frame().getAttribute('height')).toBe('250')
    expect(frame().getAttribute('srcdoc')).toContain('0fd3e3c04a4b0bd4b92631a5b071eaf8')
  })

  it('never injects the ad script for a hidden slot', () => {
    render(<AdSlot placement="catalog" />)
    intersect()

    expect(screen.queryByText('Advertisement')).not.toBeInTheDocument()
    expect(document.querySelector('iframe')).toBeNull()
  })

  it('collapses the slot when the creative never fills, as with a blocked ad script', () => {
    render(<AdSlot placement="home" />)
    layOut(800)
    intersect()
    expect(screen.getByText('Advertisement')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(10_000)
    })

    expect(document.querySelector('[data-ad-slot]')).toBeNull()
  })

  it('keeps a filled slot once the creative lands', () => {
    render(<AdSlot placement="home" />)
    layOut(800)
    intersect()

    const stage = document.querySelector('[data-ad-slot] div:last-child')
    expect(stage).toHaveStyle({ visibility: 'hidden' })

    const creative = document.createElement('iframe')
    frame().contentDocument?.body.appendChild(creative)
    act(() => {
      vi.advanceTimersByTime(10_000)
    })

    expect(screen.getByText('Advertisement')).toBeInTheDocument()
    expect(document.querySelector('[data-ad-slot]')).not.toBeNull()
    expect(document.querySelector('[data-ad-slot] div:last-child')).toHaveStyle({ visibility: 'visible' })
  })

  it('reloads the slot with the fitting unit when the container crosses a breakpoint', () => {
    render(<AdSlot placement="home" />)
    const root = layOut(800)
    intersect()
    expect(frame().getAttribute('width')).toBe('728')

    Object.defineProperty(root, 'clientWidth', { configurable: true, value: 500 })
    resize()

    expect(frame().getAttribute('width')).toBe('468')
    expect(frame().getAttribute('srcdoc')).toContain('1f517aa3358dbd1ef55d8b2e47d06e4c')
  })
})
