import { screen, render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LogDialog } from './log-dialog'

const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), title: vi.fn() }))
vi.mock('../session/session', () => ({ useSession: () => ({ member: { id: 'member-one' } }) }))
vi.mock('@/lib/identity-browser', () => ({ getMemberTitleState: mocks.title }))
vi.mock('../taste/api', () => ({ tasteRead: mocks.read, tasteWrite: mocks.write, errorText: (e: Error) => e.message }))
beforeEach(() => {
  vi.clearAllMocks()
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  mocks.title.mockResolvedValue({ rating: null })
  mocks.read.mockImplementation(async (path: string) => path.startsWith('drafts/') ? { revision: 0, data: {} } : { revision: 2, body: 'Existing words', spoiler: true })
  mocks.write.mockImplementation(async (path: string) => path === 'reviews' ? { reviewId: 'review-one' } : { revision: 1, data: {} })
})

describe('focused review and watch composer', () => {
  it('publishes a review without creating a diary event', async () => {
    const user = userEvent.setup(), saved = vi.fn()
    render(<LogDialog id={42} kind="movie" mode="review" title="Northbound" onClose={() => {}} onSaved={saved} />)
    await screen.findByText('Only published work appears on your profile.')
    expect(screen.queryByLabelText('Watched on')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Your review'), 'I kept thinking about the ending.')
    await user.click(screen.getByLabelText('Contains spoilers'))
    await user.click(screen.getByRole('button', { name: 'Publish review' }))
    await waitFor(() => expect(saved).toHaveBeenCalledWith({ reviewId: 'review-one', body: 'I kept thinking about the ending.', reviewedOn: null }))
    const input = mocks.write.mock.calls.find(c => c[0] === 'reviews')![1]
    expect(input).toMatchObject({ body: 'I kept thinking about the ending.', kind: 'movie', id: 42, spoiler: true })
    expect(input).not.toHaveProperty('log')
  })
  it('recovers only the exact episode draft and preserves its episode when logging', async () => {
    const user = userEvent.setup(), saved = vi.fn()
    mocks.read.mockResolvedValue({ revision: 3, data: { body: 'Episode two', date: '2026-10-20', rewatch: true, spoiler: true, rating: 8, tags: 'night' } })
    render(<LogDialog id={42} kind="series" season={1} episode={2} title="Northbound" onClose={() => {}} onSaved={saved} />)
    await screen.findByText('Private draft restored.')
    expect(mocks.read).toHaveBeenCalledWith('drafts/log-series-42-1-2-new', expect.anything())
    expect(screen.getByLabelText('Add a review, if you want')).toHaveValue('Episode two')
    await user.click(screen.getByRole('button', { name: 'Save watch' }))
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1))
    expect(mocks.write.mock.calls.find(c => c[0] === 'reviews')![1]).toMatchObject({ season: 1, episode: 2, log: { watchedOn: '2026-10-20', rewatch: true, tags: ['night'] } })
  })
  it('keeps a failed publication open and retries with the same idempotency key', async () => {
    const user = userEvent.setup(), saved = vi.fn()
    let fail = true
    mocks.write.mockImplementation(async (path: string) => { if (path === 'reviews' && fail) { fail = false; throw new Error('Connection lost. Try again.') } return { revision: 1 } })
    render(<LogDialog id={42} kind="anime" mode="review" title="Violet Hours" onClose={() => {}} onSaved={saved} />)
    await screen.findByText('Only published work appears on your profile.')
    await user.type(screen.getByLabelText('Your review'), 'A luminous world.')
    await user.click(screen.getByRole('button', { name: 'Publish review' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost')
    expect(saved).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Your review')).toHaveValue('A luminous world.')
    await user.click(screen.getByRole('button', { name: 'Retry publishing' }))
    await waitFor(() => expect(saved).toHaveBeenCalledOnce())
    const attempts = mocks.write.mock.calls.filter(c => c[0] === 'reviews')
    expect(attempts[0]![1].idempotencyKey).toBe(attempts[1]![1].idempotencyKey)
  })
  it('keeps restored text when a private draft save conflicts', async () => {
    const user = userEvent.setup(), closed = vi.fn()
    mocks.write.mockRejectedValue(new Error('Changed in another window.'))
    render(<LogDialog id={42} kind="movie" mode="review" title="Northbound" onClose={closed} onSaved={() => {}} />)
    await screen.findByText('Only published work appears on your profile.')
    await user.type(screen.getByLabelText('Your review'), 'Keep my words.')
    await user.click(screen.getByRole('button', { name: 'Save draft & close' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Changed in another window')
    expect(closed).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Your review')).toHaveValue('Keep my words.')
  })
  it('keeps a recovered edit based on its original revision and fetches the exact episode scope', async () => {
    const user = userEvent.setup(), saved = vi.fn()
    mocks.read.mockImplementation(async (path: string) => path.startsWith('drafts/')
      ? { revision: 3, data: { body: 'An unfinished reading.', date: '2026-10-20', rewatch: false, spoiler: true, rating: 8, tags: '', baseReviewRevision: 1 } }
      : { revision: 4, body: 'Newer published words.', spoiler: true, season: 2, episode: 3 })
    render(<LogDialog id={42} kind="series" mode="review" existingReview={{ reviewId: 'review-one', body: 'Newer published words.', reviewedOn: null }} title="Northbound" onClose={() => {}} onSaved={saved} />)
    await screen.findByText('Private draft restored.')
    expect(screen.getByText('Season 2 · Episode 3')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save review' }))
    await waitFor(() => expect(saved).toHaveBeenCalledOnce())
    expect(mocks.write.mock.calls.find(c => c[0] === 'reviews')![1]).toMatchObject({ reviewId: 'review-one', revision: 1, season: 2, episode: 3, body: 'An unfinished reading.' })
    expect(saved).toHaveBeenCalledWith({ reviewId: 'review-one', body: 'An unfinished reading.', reviewedOn: null })
  })
  it('reuses a durable publication attempt after an uncertain response and a remount', async () => {
    const user = userEvent.setup(), saved = vi.fn()
    let draft: Record<string, unknown> = {}, version = 0, fail = true
    mocks.read.mockImplementation(async () => ({ revision: version, data: draft }))
    mocks.write.mockImplementation(async (path: string, input: { data?: Record<string, unknown> }) => {
      if (path.startsWith('drafts/')) { draft = input.data!; return { revision: ++version, data: draft } }
      if (fail) { fail = false; throw new Error('Response lost. Retry safely.') }
      return { reviewId: null }
    })
    const first = render(<LogDialog id={42} kind="movie" title="Northbound" onClose={() => {}} onSaved={saved} />)
    await screen.findByText('Only published work appears on your profile.')
    await user.click(screen.getByRole('button', { name: 'Save watch' }))
    await screen.findByText(/Response lost/)
    const key = mocks.write.mock.calls.find(c => c[0] === 'reviews')![1].idempotencyKey
    expect(draft.pendingPublication).toMatchObject({ key })
    first.unmount()
    render(<LogDialog id={42} kind="movie" title="Northbound" onClose={() => {}} onSaved={saved} />)
    await screen.findByText('Private draft restored.')
    await user.click(screen.getByRole('button', { name: 'Save watch' }))
    await waitFor(() => expect(saved).toHaveBeenCalledOnce())
    const attempts = mocks.write.mock.calls.filter(c => c[0] === 'reviews')
    expect(attempts[1]![1].idempotencyKey).toBe(key)
  })
})
