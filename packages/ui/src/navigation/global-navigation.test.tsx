import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { GlobalNavigation } from './global-navigation'

describe('GlobalNavigation', () => {
  it('marks the current destination and exposes search semantics', () => {
    render(
      <GlobalNavigation
        activeHref="/series"
        searchAction="/find"
        searchDefaultValue="Severance"
      />,
    )

    expect(screen.getByRole('link', { name: 'Series' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      screen.getByRole('searchbox', {
        name: 'Search movies, series, and people',
      }),
    ).toHaveAttribute('name', 'q')
    expect(screen.getByRole('search')).toHaveAttribute('action', '/find')
  })

  it('opens a focused mobile dialog and restores focus when dismissed', async () => {
    const user = userEvent.setup()
    render(<GlobalNavigation activeHref="/" profileName="Hamza" />)

    const trigger = screen.getByRole('button', { name: 'Open navigation' })
    await user.click(trigger)

    const dialog = screen.getByRole('dialog', { name: 'Primary navigation' })
    expect(within(dialog).getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(dialog).getByRole('searchbox')).toBeVisible()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('keeps visual and announced presence in sync', () => {
    const { container } = render(
      <GlobalNavigation
        avatarSrc="/avatar.svg"
        isProfileOnline={false}
        profileName="Hamza"
      />,
    )

    expect(
      screen.getAllByRole('link', { name: 'Open Hamza profile' }),
    ).toHaveLength(1)
    expect(
      container.querySelector('[data-consumit-profile-presence]'),
    ).not.toBeInTheDocument()
  })
})
