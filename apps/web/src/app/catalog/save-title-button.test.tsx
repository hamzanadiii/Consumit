import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SessionProvider } from '../session/session'
import { SaveTitleButton } from './save-title-button'

const setMemberSaved = vi.hoisted(() => vi.fn())
const getCachedMemberLibrary = vi.hoisted(() => vi.fn())
const replaceCachedMemberLibrary = vi.hoisted(() => vi.fn())

vi.mock('@/lib/identity-browser', () => ({ getCachedMemberLibrary, replaceCachedMemberLibrary, setMemberSaved }))

const member = {
  createdAt: '2026-09-07T12:00:00.000Z',
  displayName: null,
  email: 'member@example.com',
  emailVerified: true,
  id: '9e0a21f4-31bc-4aa7-98ae-b3cb8da0a8ca',
  avatarStyle: 'dusk',
  avatarUrl: null,
  username: 'cinema_fan',
} as const

describe('save title button', () => {
  beforeEach(() => {
    setMemberSaved.mockReset()
    setMemberSaved.mockResolvedValue({ diary: [], favorites: [], lists: [], saved: [], watched: [] })
    getCachedMemberLibrary.mockReset()
    getCachedMemberLibrary.mockResolvedValue({ diary: [], favorites: [], lists: [], saved: [], watched: [] })
    replaceCachedMemberLibrary.mockReset()
  })

  it('asks guests to sign in instead of pretending to save', () => {
    render(<SessionProvider><SaveTitleButton id={693134} kind="movie" title="Dune: Part Two" /></SessionProvider>)

    expect(screen.getByRole('link', { name: 'Sign in to save Dune: Part Two to your library' })).toHaveAttribute('href', '/sign-in')
  })

  it('speaks one visual language signed in or out', () => {
    const guest = render(<SessionProvider><SaveTitleButton id={693134} kind="movie" title="Dune: Part Two" /></SessionProvider>)
    const signedIn = render(<SessionProvider initialMember={member} initialStatus="authenticated"><SaveTitleButton id={693134} kind="movie" title="Dune: Part Two" /></SessionProvider>)

    expect(guest.container.querySelector('a')?.getAttribute('class')).toBe(
      signedIn.container.querySelector('button')?.getAttribute('class'),
    )
  })

  it('persists add and remove actions for an authenticated member', async () => {
    const user = userEvent.setup()
    render(<SessionProvider initialMember={member} initialStatus="authenticated"><SaveTitleButton id={693134} kind="movie" title="Dune: Part Two" /></SessionProvider>)

    await user.click(screen.getByRole('button', { name: 'Save Dune: Part Two to library' }))
    await waitFor(() => expect(setMemberSaved).toHaveBeenLastCalledWith({ id: 693134, kind: 'movie' }, true))
    expect(replaceCachedMemberLibrary).toHaveBeenCalledWith(member.id, expect.objectContaining({ saved: [] }))
    await user.click(screen.getByRole('button', { name: 'Remove Dune: Part Two from library' }))
    await waitFor(() => expect(setMemberSaved).toHaveBeenLastCalledWith({ id: 693134, kind: 'movie' }, false))
  })

  it('hydrates the stored saved state on load', async () => {
    getCachedMemberLibrary.mockResolvedValue({
      diary: [],
      favorites: [],
      lists: [],
      saved: [{ id: 693134, kind: 'movie', origin: 'native', sourceKey: null }],
      watched: [],
    })
    render(<SessionProvider initialMember={member} initialStatus="authenticated"><SaveTitleButton id={693134} kind="movie" title="Dune: Part Two" /></SessionProvider>)

    expect(await screen.findByRole('button', { name: 'Remove Dune: Part Two from library' })).toBeInTheDocument()
    expect(getCachedMemberLibrary).toHaveBeenCalledWith(member.id)
  })

  it('keeps the default state when the library cannot load', async () => {
    getCachedMemberLibrary.mockRejectedValue(new Error('offline'))
    render(<SessionProvider initialMember={member} initialStatus="authenticated"><SaveTitleButton id={693134} kind="movie" title="Dune: Part Two" /></SessionProvider>)

    expect(screen.getByRole('button', { name: 'Save Dune: Part Two to library' })).toBeInTheDocument()
    await waitFor(() => expect(getCachedMemberLibrary).toHaveBeenCalledTimes(1))
  })
})
