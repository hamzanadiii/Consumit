import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CastCard, EpisodeRow, MemberPulse, SeasonSelector, TitleMasthead } from './title'
import { HeroSpotlight, type HeroSpotlightItem } from './hero-spotlight'

const spotlightItems: HeroSpotlightItem[] = [
  { key: 'one', metadata: '2026 · Film', synopsis: 'First story.', title: 'First Light' },
  { key: 'two', metadata: '2025 · Series', synopsis: 'Second story.', title: 'Second Harbor' },
  { key: 'three', metadata: '2026 · Film', synopsis: 'Third story.', title: 'Third Meridian' },
]

afterEach(() => {
  vi.useRealTimers()
})

describe('title and series components', () => {
  it('renders a cinematic title masthead and social proof', () => {
    render(
      <TitleMasthead
        headingLevel="h1"
        metadata="2026 · Drama"
        socialProof={<p>8 friends watched</p>}
        synopsis="A city erased every street."
        tasteScore={92}
        title="The Last City After Rain"
      />,
    )

    expect(screen.getByRole('heading', { name: 'The Last City After Rain' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'The Last City After Rain' })).toBeInTheDocument()
    expect(screen.getByText('92%')).toBeInTheDocument()
    expect(screen.getByText('8 friends watched')).toBeInTheDocument()
  })

  it('exposes member rating as one readable label', () => {
    render(<MemberPulse count="12,846 ratings" value={4.3} />)

    expect(screen.getByLabelText('Member rating 4.3 out of 5 from 12,846 ratings')).toBeInTheDocument()
  })

  it('keeps season selection native', () => {
    const onValueChange = vi.fn()
    render(<SeasonSelector onValueChange={onValueChange} options={[{ label: 'Season 1', value: '1' }, { label: 'Season 2', value: '2' }]} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Season' }), { target: { value: '2' } })
    expect(onValueChange).toHaveBeenCalledWith('2')
  })

  it('renders cast and episode anatomy', () => {
    render(
      <>
        <CastCard character="Mara" name="Sara El Amrani" />
        <EpisodeRow episode="Episode 4" meta="52 min" progress={31} title="Glass Teeth" />
      </>,
    )

    expect(screen.getByText('Sara El Amrani')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Glass Teeth watched' })).toHaveAttribute('aria-valuenow', '31')
  })
})

describe('hero spotlight', () => {
  it('opens on the first title with carousel semantics', () => {
    render(<HeroSpotlight items={spotlightItems} label="New this week" />)

    expect(screen.getByRole('region', { name: 'New this week' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'First Light' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Second Harbor' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show Second Harbor' })).toBeInTheDocument()
    expect(screen.getByText('First story.').className).toMatch(/line-clamp-3/)
  })

  it('advances on a timer and wraps through dots and arrows', () => {
    vi.useFakeTimers()
    render(<HeroSpotlight autoAdvanceMs={7000} items={spotlightItems} />)

    act(() => {
      vi.advanceTimersByTime(7000)
    })
    expect(screen.getByRole('heading', { name: 'Second Harbor' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show Third Meridian' }))
    expect(screen.getByRole('heading', { name: 'Third Meridian' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next featured title' }))
    expect(screen.getByRole('heading', { name: 'First Light' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Previous featured title' }))
    expect(screen.getByRole('heading', { name: 'Third Meridian' })).toBeInTheDocument()
  })

  it('pauses rotation on hover while dots and arrows stay clickable', () => {
    vi.useFakeTimers()
    render(<HeroSpotlight autoAdvanceMs={7000} items={spotlightItems} />)

    expect(screen.queryByRole('button', { name: /rotation/ })).not.toBeInTheDocument()

    fireEvent.mouseEnter(screen.getByRole('region', { name: 'Featured titles' }))
    act(() => {
      vi.advanceTimersByTime(21_000)
    })
    expect(screen.getByRole('heading', { name: 'First Light' })).toBeInTheDocument()
  })

  it('resumes rotation after the focus grace period', () => {
    vi.useFakeTimers()
    render(<HeroSpotlight autoAdvanceMs={7000} items={spotlightItems} />)

    fireEvent.focus(screen.getByRole('region', { name: 'Featured titles' }))
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.getByRole('heading', { name: 'First Light' })).toBeInTheDocument()

    // Grace expires in its own flush so the auto timer it schedules can fire.
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(screen.getByRole('heading', { name: 'First Light' })).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(7000)
    })
    expect(screen.getByRole('heading', { name: 'Second Harbor' })).toBeInTheDocument()
  })

  it('renders a single title without carousel chrome', () => {
    render(<HeroSpotlight items={[spotlightItems[0]!]} />)

    expect(screen.getByRole('heading', { name: 'First Light' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Featured titles' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next featured title' })).not.toBeInTheDocument()
  })
})
