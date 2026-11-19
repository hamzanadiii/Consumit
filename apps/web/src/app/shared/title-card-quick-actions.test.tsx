import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders as render } from '@/test/render'
import { SessionProvider } from '../session/session'
import { TitleCardQuickActions } from './title-card-quick-actions'

const mocks = vi.hoisted(() => ({ clearRating: vi.fn(), getState: vi.fn(), setLiked: vi.fn(), setRating: vi.fn(), setSaved: vi.fn(), setWatched: vi.fn() }))
vi.mock('@/lib/identity-browser', () => ({ clearMemberRating: mocks.clearRating, getMemberTitleState: mocks.getState, setMemberLiked: mocks.setLiked, setMemberRating: mocks.setRating, setMemberSaved: mocks.setSaved, setMemberWatched: mocks.setWatched }))

const member = { id: 'member-1', username: 'night_viewer', displayName: 'Night Viewer', avatarStyle: 'dusk', avatarUrl: null, email: 'member@example.test', emailVerified: true, createdAt: '2026-01-01T00:00:00Z', role: 'member' } as const
const state = { like: null, rating: null, review: null, saved: false, watched: false }

describe('unified title actions', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getState.mockResolvedValue(state); mocks.setLiked.mockResolvedValue({}); mocks.setRating.mockResolvedValue({}); mocks.setSaved.mockResolvedValue(undefined); mocks.setWatched.mockResolvedValue(undefined) })

  it('saves watched state with retry feedback and offers Undo', async () => {
    const user = userEvent.setup()
    mocks.setWatched.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined)
    render(<SessionProvider initialMember={member} initialStatus="authenticated"><TitleCardQuickActions id={693134} kind="movie" title="Dune: Part Two" /></SessionProvider>)
    await user.click(screen.getByRole('button', { name: 'More actions for Dune: Part Two' }))
    const action = await screen.findByRole('button', { name: 'Mark as watched' })
    await user.click(action)
    expect(await screen.findByText('Could not update Dune: Part Two. Try again.')).toBeVisible()
    await user.click(action)
    expect(await screen.findByText('Dune: Part Two added to your Watched.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(mocks.setWatched).toHaveBeenLastCalledWith({ id: 693134, kind: 'movie' }, false))
  })

  it('maps a half-star choice to the existing ten-point stored rating', async () => {
    const user = userEvent.setup()
    render(<SessionProvider initialMember={member} initialStatus="authenticated"><TitleCardQuickActions id={693134} kind="movie" title="Dune: Part Two" variant="details" /></SessionProvider>)
    await user.click(screen.getByRole('button', { name: 'Title actions for Dune: Part Two' }))
    await user.click(await screen.findByRole('button', { name: 'Rate this title' }))
    await user.click(screen.getByRole('radio', { name: 'Rate 4.5 out of 5 stars' }))
    await waitFor(() => expect(mocks.setRating).toHaveBeenCalledWith({ id: 693134, kind: 'movie' }, 9))
    expect(await screen.findByText(/Saved 4.5 of 5/)).toBeVisible()
  })

  it('returns guests to the requested title action after sign-in', async () => {
    const user = userEvent.setup()
    render(<TitleCardQuickActions id={693134} kind="movie" title="Dune: Part Two" />)
    await user.click(screen.getByRole('button', { name: 'More actions for Dune: Part Two' }))
    expect(screen.getByRole('link', { name: 'Add to a list' })).toHaveAttribute('href', '/sign-in?next=%2Ftitle%2F693134%3FconsumitAction%3Dlist')
    expect(screen.getByRole('link', { name: 'Rate this title' })).toHaveAttribute('href', '/sign-in?next=%2Ftitle%2F693134%3FconsumitAction%3Drate')
    expect(screen.getByRole('link', { name: 'Write a review' })).toHaveAttribute('href', '/sign-in?next=%2Ftitle%2F693134%3FconsumitAction%3Dreview')
  })
})
