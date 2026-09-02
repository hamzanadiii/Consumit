import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  ActivityItem,
  CommentCard,
  FriendRow,
  TrustedReaction,
} from './social'

describe('social components', () => {
  it('keeps activity identity, title, and rating readable', () => {
    render(
      <ActivityItem
        context="reviewed a movie · 18 min ago"
        memberName="Yasmine"
        quote="It respects silence without making silence feel like homework."
        rating={4.5}
        title="The Silent Year"
        titleHref="/titles/the-silent-year"
      />,
    )

    expect(screen.getByText('Yasmine')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '4.5 out of 5' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'The Silent Year' })).toHaveAttribute(
      'href',
      '/titles/the-silent-year',
    )
  })

  it('exposes follow state and forwards the requested action', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()

    render(
      <FriendRow
        detail="Patient dramas"
        name="Meriem Rahal"
        onAction={onAction}
        overlap={89}
        status="online"
      />,
    )

    const follow = screen.getByRole('button', { name: 'Follow' })
    expect(follow).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('online')).toHaveClass('sr-only')
    await user.click(follow)
    expect(onAction).toHaveBeenCalledOnce()
  })

  it('keeps trusted reactions visible and spoilers user-controlled', () => {
    render(
      <>
        <TrustedReaction
          memberName="Omar"
          quote="A mystery that respects you enough to leave the final door closed."
          rating={5}
        />
        <CommentCard
          comment="The third title changes the whole list."
          memberName="Nadia"
          spoilerHidden
        />
      </>,
    )

    expect(screen.getByText(/A mystery that respects you/)).toBeInTheDocument()
    expect(screen.getByText('Reveal spoiler')).toBeInTheDocument()
    expect(screen.getByText(/The third title changes/)).not.toBeVisible()
  })
})
