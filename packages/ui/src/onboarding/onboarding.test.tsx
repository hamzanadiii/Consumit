import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ImportOption, MemberSuggestion, OnboardingHeader, SelectableTitle } from './onboarding'

describe('onboarding components', () => {
  it('announces onboarding progress', () => {
    const { container } = render(<OnboardingHeader current={2} skipHref="/skip" total={3} />)

    expect(screen.getByRole('progressbar', { name: 'Onboarding step 2 of 3' })).toHaveAttribute('aria-valuenow', '66.66666666666666')
    expect(screen.getByRole('link', { name: 'Consumit home' })).toBeInTheDocument()
    expect(container.querySelector('img')).toHaveAttribute('src', '/assets/consumit-mark.svg')
    expect(screen.getByText('Skip for now').closest('a')).not.toHaveClass('hidden')
  })

  it('renders import benefits and selection state', () => {
    const onChange = vi.fn()
    render(
      <>
        <ImportOption benefits={['Ratings and favorites']} description="Upload your export" selected title="Import from Letterboxd" />
        <SelectableTitle checked meta="2021 · Movie" onChange={onChange} title="The Silent Year" />
      </>,
    )

    expect(screen.getByText('Ratings and favorites')).toBeInTheDocument()
    expect(screen.getByText('Selected')).toHaveClass('sr-only')
    fireEvent.click(screen.getByRole('checkbox', { name: /The Silent Year/ }))
    expect(onChange).toHaveBeenCalled()
  })

  it('renders member overlap without relying on color', () => {
    render(<MemberSuggestion handle="@yasmineframes" name="Yasmine El Idrissi" overlap={93} />)

    expect(screen.getByText('93% overlap')).toBeInTheDocument()
  })
})
