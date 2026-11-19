import { act, render, screen, waitFor } from '@testing-library/react'
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

    const saved = await screen.findByRole('radio', { name: 'Rate 4 out of 5 stars' })
    await waitFor(() => expect(saved).toBeEnabled())
    expect(saved).toBeChecked()

    await user.click(screen.getByRole('radio', { name: 'Rate 5 out of 5 stars' }))
    await waitFor(() => expect(mocks.setMemberRating).toHaveBeenCalledWith({ id: 693134, kind: 'movie' }, 10))
  })

  it('keeps rating choices disabled until the stored value is known', async () => {
    let finishRead!: (state: { rating: typeof storedRating; like: null; review: null }) => void
    mocks.getMemberTitleState.mockReturnValueOnce(new Promise(resolve => { finishRead = resolve }))
    render(<SessionProvider initialMember={member} initialStatus="authenticated"><RatingWidget id={693134} kind="movie" title="Dune: Part Two" /></SessionProvider>)

    const radio = screen.getByRole('radio', { name: 'Rate 4 out of 5 stars' })
    expect(radio).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Loading your rating')

    await act(async () => { finishRead({ rating: storedRating, like: null, review: null }) })
    expect(radio).toBeEnabled()
    expect(radio).toBeChecked()
  })

  it('clears the stored rating by clicking the set value again', async () => {
    const user = userEvent.setup()
    mocks.clearMemberRating.mockResolvedValue(undefined)
    render(<SessionProvider initialMember={member} initialStatus="authenticated"><RatingWidget id={693134} kind="movie" title="Dune: Part Two" /></SessionProvider>)

    const saved = await screen.findByRole('radio', { name: 'Rate 4 out of 5 stars' })
    await waitFor(() => expect(saved).toBeEnabled())
    expect(saved).toBeChecked()
    expect(screen.queryByRole('button', { name: 'Clear rating' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Rate 4 out of 5 stars' }))
    await waitFor(() => expect(mocks.clearMemberRating).toHaveBeenCalledWith({ id: 693134, kind: 'movie' }))
    expect(screen.getByRole('radio', { name: 'Rate 4 out of 5 stars' })).not.toBeChecked()
  })

  it('treats a missing rating as unrated instead of an error', async () => {
    const user = userEvent.setup()
    mocks.getMemberTitleState.mockResolvedValue({ rating: null, like: null, review: null })
    render(<SessionProvider initialMember={member} initialStatus="authenticated"><RatingWidget id={693134} kind="movie" title="Dune: Part Two" /></SessionProvider>)

    const group = await screen.findByRole('radiogroup', { name: 'Rate Dune: Part Two out of 5 stars' })
    expect(group).toBeInTheDocument()
    const empty = screen.getByRole('radio', { name: 'Rate 4 out of 5 stars' })
    await waitFor(() => expect(empty).toBeEnabled())
    expect(empty).not.toBeChecked()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Rate 3 out of 5 stars' }))
    await waitFor(() => expect(mocks.setMemberRating).toHaveBeenCalledWith({ id: 693134, kind: 'movie' }, 6))
  })

  it('retries a failed rating read and then enables the stored value', async () => {
    const user = userEvent.setup()
    mocks.getMemberTitleState.mockRejectedValueOnce(new mocks.IdentityApiError('The account service returned an invalid response.', { status: 503 }))
    mocks.getMemberTitleState.mockResolvedValueOnce({ rating: storedRating, like: null, review: null })
    render(<SessionProvider initialMember={member} initialStatus="authenticated"><RatingWidget id={693134} kind="movie" title="Dune: Part Two" /></SessionProvider>)

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded')
    const retry = screen.getByRole('button', { name: 'Retry rating' })
    await user.click(retry)
    const previous = await screen.findByRole('radio', { name: 'Rate 4 out of 5 stars' })
    await waitFor(() => expect(previous).toBeEnabled())
    expect(previous).toBeChecked()
    expect(screen.queryByRole('button', { name: 'Retry rating' })).not.toBeInTheDocument()
  })

  it('retains the requested score and retries the same save after a failure', async () => {
    const user = userEvent.setup()
    mocks.setMemberRating.mockRejectedValueOnce(new Error('network unavailable'))
    render(<SessionProvider initialMember={member} initialStatus="authenticated"><RatingWidget id={693134} kind="movie" title="Dune: Part Two" /></SessionProvider>)

    expect(await screen.findByRole('radio', { name: 'Rate 4 out of 5 stars' })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'Rate 5 out of 5 stars' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('could not confirm')
    expect(screen.getByRole('radio', { name: 'Rate 4 out of 5 stars' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Rate 5 out of 5 stars' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Retry save' }))
    await waitFor(() => expect(mocks.setMemberRating).toHaveBeenNthCalledWith(2, { id: 693134, kind: 'movie' }, 10))
    expect(await screen.findByRole('radio', { name: 'Rate 5 out of 5 stars' })).toBeChecked()
    expect(screen.queryByRole('button', { name: 'Retry save' })).not.toBeInTheDocument()
  })

  it('retains and retries a failed rating clear', async () => {
    const user = userEvent.setup()
    mocks.clearMemberRating.mockRejectedValueOnce(new Error('network unavailable')).mockResolvedValueOnce(undefined)
    render(<SessionProvider initialMember={member} initialStatus="authenticated"><RatingWidget id={693134} kind="movie" title="Dune: Part Two" /></SessionProvider>)

    const saved = await screen.findByRole('radio', { name: 'Rate 4 out of 5 stars' })
    await waitFor(() => expect(saved).toBeEnabled())
    expect(saved).toBeChecked()
    await user.click(saved)
    expect(await screen.findByRole('alert')).toHaveTextContent('could not confirm')
    expect(saved).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Retry save' }))
    await waitFor(() => expect(mocks.clearMemberRating).toHaveBeenCalledTimes(2))
    expect(saved).not.toBeChecked()
    expect(screen.queryByRole('button', { name: 'Retry save' })).not.toBeInTheDocument()
  })

  it('asks guests to sign in instead of rating', () => {
    render(<SessionProvider><RatingWidget id={693134} kind="movie" title="Dune: Part Two" /></SessionProvider>)

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
    expect(screen.getByText('to rate Dune: Part Two.')).toHaveClass('text-[var(--fs-secondary)]')
  })
})
