import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SessionProvider } from '../session/session'

import { TitleActions } from './title-actions'

const setMemberSaved = vi.hoisted(() => vi.fn())
const getCachedMemberLibrary = vi.hoisted(() => vi.fn())
const replaceCachedMemberLibrary = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('@/lib/identity-browser', () => ({ getCachedMemberLibrary, replaceCachedMemberLibrary, setMemberSaved }))

const member = {
  avatarStyle: 'dusk',
  avatarUrl: null,
  createdAt: '2026-09-07T12:00:00.000Z',
  displayName: null,
  email: 'member@example.com',
  emailVerified: true,
  id: '9e0a21f4-31bc-4aa7-98ae-b3cb8da0a8ca',
  username: 'cinema_fan',
} as const

describe('title actions', () => {
  beforeEach(() => {
    setMemberSaved.mockReset()
    setMemberSaved.mockResolvedValue({ diary: [], favorites: [], lists: [], saved: [], watched: [] })
    getCachedMemberLibrary.mockReset()
    getCachedMemberLibrary.mockResolvedValue({ diary: [], favorites: [], lists: [], saved: [], watched: [] })
    replaceCachedMemberLibrary.mockReset()
  })
  it('joins the watchlist toggle and the details shortcut with no spacing', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <SessionProvider initialMember={member} initialStatus="authenticated">
        <TitleActions id={693134} kind="movie" title="Dune: Part Two" titleHref="/title/693134" />
      </SessionProvider>,
    )

    expect(screen.getByRole('link', { name: 'Details' })).toHaveAttribute('href', '/title/693134')
    const pair = container.firstElementChild
    expect(pair?.className).toMatch(/inline-flex/)
    expect(pair?.className).not.toMatch(/gap-/)

    await user.click(screen.getByRole('button', { name: 'Save Dune: Part Two to library' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove Dune: Part Two from library' })).toBeInTheDocument())
  })
})
