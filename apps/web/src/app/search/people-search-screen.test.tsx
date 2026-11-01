import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders as render } from '@/test/render'

import { PeopleSearchScreen } from './people-search-screen'

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), searchMembers: vi.fn() }))

vi.mock('@/lib/identity-browser', () => ({ searchMembers: mocks.searchMembers }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))

const firstPerson = {
  avatarStyle: 'dusk' as const,
  avatarUrl: null,
  displayName: 'First Curator',
  id: 'member-first',
  isFollowing: false,
  username: 'first_curator',
}
const secondPerson = {
  ...firstPerson,
  displayName: 'Second Curator',
  id: 'member-second',
  username: 'second_curator',
}

describe('PeopleSearchScreen pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.refresh.mockClear()
    window.sessionStorage.clear()
  })

  it('keeps loaded people and moves focus to retry when another page fails, then announces appended results', async () => {
    mocks.searchMembers
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({ items: [secondPerson], nextCursor: null })
    const user = userEvent.setup()
    const view = render(<PeopleSearchScreen initialPage={{ items: [firstPerson], nextCursor: 'next-page' }} initialQuery="curator" />)
    expect(screen.getByText('1 curator shown')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Load more people' }))

    expect(screen.getByRole('link', { name: /First Curator/ })).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: 'Try again' })
    expect(retry).toHaveFocus()
    expect(screen.getByRole('alert')).toHaveTextContent('People search could not load.')

    await user.click(retry)

    expect(mocks.searchMembers).toHaveBeenNthCalledWith(2, 'curator', 'next-page')
    expect(screen.getByRole('link', { name: /First Curator/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Second Curator/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'People to meet' })).toHaveFocus()
    expect(screen.getByRole('status')).toHaveTextContent('1 person loaded; 2 people shown.')

    view.unmount()
    render(<PeopleSearchScreen initialPage={{ items: [firstPerson], nextCursor: 'next-page' }} initialQuery="curator" />)
    expect(await screen.findByRole('link', { name: /Second Curator/ })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('2 people restored; 2 people shown.')
  })

  it('shows tailored no-match guidance beside relevant curator suggestions', () => {
    render(<PeopleSearchScreen initialPage={{ items: [], nextCursor: null }} initialQuery="no-such-curator" initialSuggestions={[firstPerson]} />)

    expect(screen.getByRole('heading', { name: 'No people found for “no-such-curator”.' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Curators to explore' })).toBeInTheDocument()
    const suggestedProfile = screen.getByRole('link', { name: /First Curator/ })
    expect(suggestedProfile).toBeInTheDocument()
    const suggestionFollow = within(suggestedProfile.closest('li')!).getByRole('link', { name: 'Sign in to follow' })
    expect(suggestionFollow).toHaveAttribute('href', '/sign-in?next=%2Fsearch%3Ftype%3Dpeople%26q%3Dno-such-curator')
    expect(screen.getByRole('link', { name: 'Explore collections' })).toHaveAttribute('href', '/community?mode=discover')
  })

  it('keeps the People query available and retries failed curator suggestions', async () => {
    const user = userEvent.setup()
    render(<PeopleSearchScreen initialPage={{ items: [], nextCursor: null }} initialQuery="no-such-curator" suggestionsError />)

    expect(screen.getByRole('searchbox', { name: 'Search people by name or username' })).toHaveValue('no-such-curator')
    expect(screen.getByRole('alert')).toHaveTextContent('Curator suggestions could not load.')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })

  it('tabs through each curator before their follow action with a 44px guest target', async () => {
    const user = userEvent.setup()
    render(<PeopleSearchScreen initialPage={{ items: [firstPerson, secondPerson], nextCursor: null }} initialQuery="curator" />)

    const firstProfile = screen.getByRole('link', { name: /First Curator/ })
    const secondProfile = screen.getByRole('link', { name: /Second Curator/ })
    const firstRow = firstProfile.closest('li')
    const secondRow = secondProfile.closest('li')
    const firstFollow = within(firstRow!).getByRole('link', { name: 'Sign in to follow' })
    const secondFollow = within(secondRow!).getByRole('link', { name: 'Sign in to follow' })

    expect(firstFollow).toHaveClass('min-h-[44px]')
    expect(firstFollow).toHaveAttribute('href', '/sign-in?next=%2Fsearch%3Ftype%3Dpeople%26q%3Dcurator')
    firstProfile.focus()
    await user.tab()
    expect(firstFollow).toHaveFocus()
    await user.tab()
    expect(secondProfile).toHaveFocus()
    await user.tab()
    expect(secondFollow).toHaveFocus()
  })
})
