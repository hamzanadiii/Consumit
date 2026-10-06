import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { movieSummary, seriesSummary } from '@/test/catalog-fixtures'
import { renderWithProviders as render } from '@/test/render'
import type { HeroDetail } from '../catalog/catalog-ui'

import { FilScreenHeroRotator, selectHeroSlides } from './hero-rotator'

const hero: HeroDetail = { ...movieSummary, tagline: 'Long live the fighters.' }
const severance: HeroDetail = { ...seriesSummary, backdropUrl: 'https://image.tmdb.org/t/p/w1280/severance.jpg', title: 'Severance' }
const second: HeroDetail = { ...movieSummary, backdropUrl: 'https://image.tmdb.org/t/p/w1280/second.jpg', id: 2, title: 'Second Feature' }

function stubReducedMotion(matches: boolean) {
  const query = { matches, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(query))
}

async function advanceOneSlide() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4_000)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('selectHeroSlides', () => {
  it('leads with the hero, drops artless and duplicate entries, and caps the reel', () => {
    const artless: HeroDetail = { ...seriesSummary, backdropUrl: null, id: 7, title: 'Artless' }
    const duplicate: HeroDetail = { ...movieSummary, title: 'Dune Again' }
    const slides = selectHeroSlides(hero, [artless, severance, duplicate, second, { ...second, id: 3, title: 'Third' }, { ...second, id: 4, title: 'Fourth' }, { ...second, id: 5, title: 'Fifth' }])

    expect(slides.map((item) => item.title)).toEqual(['Dune: Part Two', 'Severance', 'Second Feature', 'Third', 'Fourth'])
  })

  it('falls back to the bare hero when nothing carries backdrop art', () => {
    expect(selectHeroSlides(hero, [{ ...seriesSummary, backdropUrl: null }])).toEqual([hero])
  })
})

describe('filScreen hero rotator', () => {
  it('renders a static hero without rotation controls for a single slide', () => {
    render(<FilScreenHeroRotator hero={hero} spotlight={[{ ...seriesSummary, backdropUrl: null }]} />)

    expect(screen.getByRole('heading', { name: 'Dune: Part Two' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /pause featured titles|start featured titles/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Choose a featured title' })).not.toBeInTheDocument()
  })

  it('advances through backdropped titles on the four-second cadence', async () => {
    render(<FilScreenHeroRotator hero={hero} spotlight={[severance, second]} />)

    expect(screen.getByRole('heading', { name: 'Dune: Part Two' })).toBeInTheDocument()
    await advanceOneSlide()
    expect(screen.getByRole('heading', { name: 'Severance' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Dune: Part Two' })).not.toBeInTheDocument()
    await advanceOneSlide()
    expect(screen.getByRole('heading', { name: 'Second Feature' })).toBeInTheDocument()
  })

  it('pauses while hovered', async () => {
    render(<FilScreenHeroRotator hero={hero} spotlight={[severance]} />)

    fireEvent.mouseEnter(screen.getByRole('region', { name: 'Featured titles' }))
    await advanceOneSlide()
    expect(screen.getByRole('heading', { name: 'Dune: Part Two' })).toBeInTheDocument()
  })

  it('cancels the animation clock while paused and retains elapsed progress', async () => {
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame')
    const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame')
    render(<FilScreenHeroRotator hero={hero} spotlight={[severance]} />)

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    fireEvent.mouseEnter(screen.getByRole('region', { name: 'Featured titles' }))
    expect(cancelFrame).toHaveBeenCalled()
    const framesAtPause = requestFrame.mock.calls.length
    await advanceOneSlide()
    expect(requestFrame).toHaveBeenCalledTimes(framesAtPause)
    fireEvent.mouseLeave(screen.getByRole('region', { name: 'Featured titles' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(2_032) })
    expect(screen.getByRole('heading', { name: 'Severance' })).toBeInTheDocument()
    requestFrame.mockRestore()
    cancelFrame.mockRestore()
  })

  it('selects a title from the dots and keeps the reel flowing', async () => {
    render(<FilScreenHeroRotator hero={hero} spotlight={[severance, second]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show Severance' }))
    expect(screen.getByRole('heading', { name: 'Severance' })).toBeInTheDocument()
    await advanceOneSlide()
    expect(screen.getByRole('heading', { name: 'Second Feature' })).toBeInTheDocument()
  })

  it('pauses while focus sits inside the hero, then resumes on blur', async () => {
    render(<FilScreenHeroRotator hero={hero} spotlight={[severance]} />)

    fireEvent.focus(screen.getByRole('button', { name: 'Show Severance' }))
    await advanceOneSlide()
    expect(screen.getByRole('heading', { name: 'Dune: Part Two' })).toBeInTheDocument()
    fireEvent.blur(screen.getByRole('button', { name: 'Show Severance' }))
    await advanceOneSlide()
    expect(screen.getByRole('heading', { name: 'Severance' })).toBeInTheDocument()
  })

  it('never auto-advances for reduced motion while dots still select', async () => {
    stubReducedMotion(true)
    render(<FilScreenHeroRotator hero={hero} spotlight={[severance]} />)

    expect(screen.queryByRole('button', { name: /pause|start featured titles/i })).not.toBeInTheDocument()
    await advanceOneSlide()
    expect(screen.getByRole('heading', { name: 'Dune: Part Two' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show Severance' }))
    expect(screen.getByRole('heading', { name: 'Severance' })).toBeInTheDocument()
  })
})
