import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

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
    expect(screen.getByRole('link', { name: 'Friends' })).toHaveAttribute(
      'href',
      '/friends',
    )
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
      screen.getByRole('button', { name: 'Hamza menu' }),
    ).toBeInTheDocument()
    expect(
      container.querySelector('[data-consumit-profile-presence]'),
    ).not.toBeInTheDocument()
  })

  it('marks the profile destination as current without highlighting Home', async () => {
    const user = userEvent.setup()
    render(
      <GlobalNavigation
        activeHref="/profile"
        profileHref="/profile"
        profileName="Hamza"
      />,
    )

    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')

    await user.click(screen.getByRole('button', { name: 'Hamza menu, online' }))

    expect(screen.getByRole('menuitem', { name: 'My profile' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('opens the member menu with destinations, selection, and sign out', async () => {
    const user = userEvent.setup()
    const onSignOut = vi.fn()
    render(
      <GlobalNavigation
        activeHref="/library"
        helpHref="/help"
        memberHandle="hamza"
        onSignOut={onSignOut}
        profileName="Hamza"
        reportHref="/report"
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Hamza menu, online' })
    expect(trigger).toHaveClass('cursor-pointer', 'data-[state=open]:ring-orange')

    await user.click(trigger)
    expect(trigger).toHaveAttribute('data-state', 'open')
    expect(screen.getByText('Hamza')).toBeInTheDocument()
    expect(screen.getByText('@hamza')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'View profile' })).not.toBeInTheDocument()
    const items = screen.getAllByRole('menuitem')
    expect(items.map((item) => item.textContent)).toEqual([
      'My profile',
      'My Library',
      'Settings',
      'Help Center',
      'Report an issue',
      'Sign out',
    ])
    expect(screen.getByRole('menuitem', { name: 'My profile' })).toHaveAttribute('href', '/profile')
    expect(screen.getByRole('menuitem', { name: 'My Library' })).toHaveAttribute('href', '/library')
    expect(screen.getByRole('menuitem', { name: 'My Library' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toHaveAttribute('href', '/settings')
    expect(screen.getByRole('menuitem', { name: 'Help Center' })).toHaveAttribute('href', '/help')
    expect(screen.getByRole('menuitem', { name: 'Report an issue' })).toHaveAttribute('href', '/report')
    expect(screen.queryByRole('menuitem', { name: 'Friends activity' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Switch account' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })

  it('closes the member menu on Escape and returns focus to the trigger for keyboard use', async () => {
    const user = userEvent.setup()
    render(<GlobalNavigation profileName="Hamza" />)

    const trigger = screen.getByRole('button', { name: 'Hamza menu, online' })
    trigger.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('menuitem', { name: 'My Library' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('link', { name: 'My Library' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('leaves focus alone on pointer dismissal so no ring sticks to the avatar', async () => {
    const user = userEvent.setup()
    render(<GlobalNavigation profileName="Hamza" />)

    const trigger = screen.getByRole('button', { name: 'Hamza menu, online' })
    await user.click(trigger)
    expect(screen.getByRole('menuitem', { name: 'My Library' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('link', { name: 'My Library' })).not.toBeInTheDocument()
    expect(trigger).not.toHaveFocus()
  })

  it('hides help, report, and sign-out rows until they are provided', async () => {
    const user = userEvent.setup()
    render(<GlobalNavigation profileName="Hamza" />)

    await user.click(screen.getByRole('button', { name: 'Hamza menu, online' }))

    expect(screen.queryByRole('menuitem', { name: 'Help Center' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Report an issue' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Sign out' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'My Library' })).toBeInTheDocument()
  })

  it('replaces the member avatar with sign-in actions for signed-out visitors', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <GlobalNavigation profileName="Hamza" signedIn={false} />,
    )

    expect(container.querySelector('[data-session-state="signed-out"]')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Sign in' })).toHaveLength(2)
    expect(screen.queryByRole('link', { name: /Open Hamza profile/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open navigation' }))

    expect(
      within(screen.getByRole('dialog', { name: 'Primary navigation' })).getByRole('link', {
        name: 'Sign in',
      }),
    ).toHaveAttribute('href', '/sign-in')
  })
})
