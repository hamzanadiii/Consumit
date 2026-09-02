import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  FilterChip,
  IssueSelector,
  SegmentedControl,
  Tabs,
  Toggle,
} from './selection'

const choices = [
  { label: 'Public', value: 'public' },
  { label: 'Friends', value: 'friends' },
  { label: 'Private', value: 'private' },
] as const

describe('selection components', () => {
  it('marks the active navigation tab and selected filter', () => {
    render(
      <>
        <Tabs
          activeValue="reviews"
          aria-label="Profile sections"
          items={[
            { href: '#overview', label: 'Overview', value: 'overview' },
            { href: '#reviews', label: 'Reviews', value: 'reviews' },
          ]}
        />
        <FilterChip selected>Watched</FilterChip>
      </>,
    )

    expect(screen.getByRole('navigation', { name: 'Profile sections' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Reviews' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('button', { name: 'Watched' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('preserves native radio behavior for segmented and issue choices', async () => {
    const user = userEvent.setup()
    const onPrivacyChange = vi.fn()
    const onIssueChange = vi.fn()

    render(
      <>
        <SegmentedControl
          defaultValue="public"
          legend="Profile visibility"
          name="privacy"
          onValueChange={onPrivacyChange}
          options={choices}
        />
        <IssueSelector
          defaultValue="video"
          legend="What went wrong?"
          name="issue"
          onValueChange={onIssueChange}
          options={[
            { label: "Video won't load", value: 'video' },
            { label: 'Subtitle issue', value: 'subtitle' },
          ]}
        />
      </>,
    )

    await user.click(screen.getByRole('radio', { name: 'Friends' }))
    await user.click(screen.getByRole('radio', { name: 'Subtitle issue' }))

    expect(onPrivacyChange).toHaveBeenCalledWith('friends')
    expect(onIssueChange).toHaveBeenCalledWith('subtitle')
  })

  it('announces and requests toggle state changes', async () => {
    const user = userEvent.setup()
    const onCheckedChange = vi.fn()

    render(
      <Toggle
        checked
        label="Share diary activity"
        onCheckedChange={onCheckedChange}
      />,
    )

    const toggle = screen.getByRole('switch', {
      name: 'Share diary activity',
    })
    expect(toggle).toHaveAttribute('aria-checked', 'true')

    await user.click(toggle)
    expect(onCheckedChange).toHaveBeenCalledWith(false)
  })
})
