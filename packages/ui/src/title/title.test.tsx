import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CastCard, EpisodeRow, MemberPulse, SeasonSelector, TitleMasthead } from './title'

describe('title and series components', () => {
  it('renders a cinematic title masthead and social proof', () => {
    render(
      <TitleMasthead
        metadata="2026 · Drama"
        socialProof={<p>8 friends watched</p>}
        synopsis="A city erased every street."
        tasteScore={92}
        title="The Last City After Rain"
      />,
    )

    expect(screen.getByRole('heading', { name: 'The Last City After Rain' })).toBeInTheDocument()
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
