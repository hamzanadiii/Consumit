import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SessionProvider } from '../session/session'

import { RatingWidget } from './rating-widget'

const mocks = vi.hoisted(() => {
  class IdentityApiError extends Error {
    readonly status: number
    constructor(message: string, options: { status: number }) {
      super(message)
      this.status = options.status
    }
  }
  return {
    IdentityApiError,
    clearMemberRating: vi.fn(),
    getMemberTitleState: vi.fn(),
    setMemberRating: vi.fn(),
  }
})

vi.mock('@/lib/identity-browser', () => ({
  clearMemberRating: mocks.clearMemberRating,
  getMemberTitleState: mocks.getMemberTitleState,
  IdentityApiError: mocks.IdentityApiError,
  setMemberRating: mocks.setMemberRating,
}))

const member = {
  avatarStyle: 'dusk',
  avatarUrl: null,
  createdAt: '2026-09-07T12:00:00.000Z',
  displayName: null,
  email: 'member@example.com',
  emailVerified: true,
  id: '9e0a21f4-31bc-4aa7-98ae-b3cb8da0a8ca',
  role: 'member',
  username: 'cinema_fan',
} as const

const storedRating = { id: 693134, kind: 'movie', origin: 'native', sourceKey: null, value: 8 }

describe('rating widget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getMemberTitleState.mockResolvedValue({ rating: storedRating, like: null, review: null })
    mocks.setMemberRating.mockImplementation(async (_title: unknown, value: number) => ({ ...storedRating, value }))
  })

  it('loads the stored rating and saves a new one', async () => {
    const user = userEvent.setup()
    render(<SessionProvider initialMember={member} initialStatus="authenticated"><RatingWidget id={693134} kind="movie" title="Dune: Part Two" /></SessionProvider>)

    expect(await screen.findByRole('radio', { name: 'Rate 8 out of 10' })).toBeChecked()

    await user.click(screen.getByRole('radio', { name: 'Rate 10 out of 10' }))
    await waitFor(() => expect(mocks.setMemberRating).toHaveBeenCalledWith({ id: 693134, kind: 'movie' }, 10))
  })

  it('clears the stored rating by clicking the set value again', async () => {
    const user = userEvent.setup()
    mocks.clearMemberRating.mockResolvedValue(undefined)
    render(<SessionProvider initialMember={member} initialStatus="authenticated"><RatingWidget id={693134} kind="movie" title="Dune: Part Two" /></SessionProvider>)

    expect(await screen.findByRole('radio', { name: 'Rate 8 out of 10' })).toBeChecked()
    expect(screen.queryByRole('button', { name: 'Clear rating' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Rate 8 out of 10' }))
    await waitFor(() => expect(mocks.clearMemberRating).toHaveBeenCalledWith({ id: 693134, kind: 'movie' }))
    expect(screen.getByRole('radio', { name: 'Rate 8 out of 10' })).not.toBeChecked()
  })

  it('treats a missing rating as unrated instead of an error', async () => {
    const user = userEvent.setup()
    mocks.getMemberTitleState.mockResolvedValue({ rating: null, like: null, review: null })
    render(<SessionProvider initialMember={member} initialStatus="authenticated"><RatingWidget id={693134} kind="movie" title="Dune: Part Two" /></SessionProvider>)

    expect(await screen.findByRole('radiogroup', { name: 'Rate Dune: Part Two out of 10' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Rate 8 out of 10' })).not.toBeChecked()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Rate 6 out of 10' }))
    await waitFor(() => expect(mocks.setMemberRating).toHaveBeenCalledWith({ id: 693134, kind: 'movie' }, 6))
  })

  it('surfaces load failures of the title state', async () => {
    mocks.getMemberTitleState.mockRejectedValue(new mocks.IdentityApiError('The account service returned an invalid response.', { status: 503 }))
    render(<SessionProvider initialMember={member} initialStatus="authenticated"><RatingWidget id={693134} kind="movie" title="Dune: Part Two" /></SessionProvider>)

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded')
  })

  it('asks guests to sign in instead of rating', () => {
    render(<SessionProvider><RatingWidget id={693134} kind="movie" title="Dune: Part Two" /></SessionProvider>)

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
  })
})
