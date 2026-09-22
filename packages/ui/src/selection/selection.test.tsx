import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  FilterChip,
  IssueSelector,
  SegmentedControl,
  Select,
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

  it('opens a themed listbox and commits the chosen option', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Select label="Season" onValueChange={onValueChange} options={[{ label: 'Season 1 · 9 episodes', value: '1' }, { label: 'Season 2 · 10 episodes', value: '2' }]} value="1" />)

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    const trigger = screen.getByRole('button', { name: 'Season Season 1 · 9 episodes' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger)
    expect(screen.getByRole('listbox', { name: 'Season' })).toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('option', { name: 'Season 1 · 9 episodes' })).toHaveAttribute('aria-selected', 'true')

    await user.click(screen.getByRole('option', { name: 'Season 2 · 10 episodes' }))
    expect(onValueChange).toHaveBeenCalledWith('2')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('supports arrow-key navigation and escape dismissal', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Select label="Sort by" onValueChange={onValueChange} options={[{ label: 'Popular', value: 'popular' }, { label: 'Top rated', value: 'top-rated' }]} value="popular" />)

    const trigger = screen.getByRole('button', { name: 'Sort by Popular' })
    trigger.focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('listbox', { name: 'Sort by' })).toBeInTheDocument()

    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Enter}')
    expect(onValueChange).toHaveBeenCalledWith('top-rated')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sort by Popular' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sort by Popular' })).toHaveFocus()
  })

  it('stays closed and muted while disabled and posts its value for forms', async () => {
    const user = userEvent.setup()
    const { container } = render(<Select disabled label="Profile visibility" name="visibility" options={[{ label: 'Private', value: 'private' }, { label: 'Public', value: 'public' }]} value="private" />)

    const trigger = screen.getByRole('button', { name: 'Profile visibility Private' })
    expect(trigger).toBeDisabled()
    expect(container.querySelector('input[name="visibility"]')).toHaveAttribute('value', 'private')
    await user.click(trigger)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
