import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { EmbedFrame, PlaybackReport, PlaybackTrustNote, SourceSelector, WatchHeader } from './playback'

describe('playback shell components', () => {
  it('renders reduced watch navigation', () => {
    const { container } = render(<WatchHeader backHref="/title" exitHref="/title" title="The Last City After Rain" />)

    expect(screen.getByRole('link', { name: 'Consumit home' })).toBeInTheDocument()
    expect(container.querySelector('img')).toHaveAttribute('src', '/assets/consumit-mark.svg')
    expect(screen.getByRole('link', { name: 'Back to title' })).toHaveAttribute('href', '/title')
    expect(screen.getByRole('link', { name: 'Exit watch' })).toBeInTheDocument()
  })

  it('requires a named embed frame', () => {
    render(<EmbedFrame src="about:blank" title="Movie provider" />)

    expect(screen.getByTitle('Movie provider')).toBeInTheDocument()
  })

  it('keeps source selection native and controlled', () => {
    const onValueChange = vi.fn()
    render(<SourceSelector name="source" onValueChange={onValueChange} sources={[{ label: 'Source 1', value: 'one' }, { label: 'Source 2', value: 'two' }]} value="one" />)

    const secondSource = screen.getByRole('radio', { name: /Source 2/ })
    expect(secondSource.closest('label')).toHaveClass('has-[:focus-visible]:ring-2')
    fireEvent.click(secondSource)
    expect(onValueChange).toHaveBeenCalledWith('two')
  })

  it('renders recovery and safety language', () => {
    render(
      <>
        <PlaybackReport description="Try another source." href="/report" />
        <PlaybackTrustNote>Never install a player extension.</PlaybackTrustNote>
      </>,
    )

    expect(screen.getByRole('link', { name: /Report an issue/ })).toHaveAttribute('href', '/report')
    expect(screen.getByText('Never install a player extension.')).toBeInTheDocument()
  })
})
