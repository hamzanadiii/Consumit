import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders as render } from '@/test/render'

import { LogDialog } from './log-dialog'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

const emptyLibrary = { diary: [], favorites: [], lists: [], saved: [], watched: [] }
const storedDiary = { entryId: 'diary-9', id: 550, kind: 'movie', origin: 'native', rewatch: false, sourceKey: null, tags: ['cinema'], watchedOn: '2026-09-09' }
const storedRating = { id: 550, kind: 'movie', origin: 'native', sourceKey: null, value: 9 }
const storedLike = { id: 550, kind: 'movie', origin: 'native', sourceKey: null }
const storedReview = { body: 'A patient masterpiece.', id: 550, kind: 'movie', origin: 'native', reviewId: 'review-9', reviewedOn: '2026-09-09', sourceKey: null, tags: [] }

function dialogFetch() {
  return vi.fn().mockImplementation((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (url.includes('/v1/ratings/') || url.includes('/v1/likes/')) {
      return Promise.resolve(new Response('Not found', { status: 404 }))
    }
    if (url === '/v1/ratings' && method === 'PUT') {
      return Promise.resolve(new Response(JSON.stringify(storedRating), { status: 200 }))
    }
    if (url === '/v1/likes' && method === 'PUT') {
      return Promise.resolve(new Response(JSON.stringify(storedLike), { status: 200 }))
    }
    if (url.includes('/v1/me/library/watched/')) {
      return Promise.resolve(new Response(JSON.stringify(emptyLibrary), { status: 200 }))
    }
    if (url === '/v1/me/diary') {
      return Promise.resolve(new Response(JSON.stringify(storedDiary), { status: 201 }))
    }
    if (url === '/v1/me/reviews') {
      return Promise.resolve(new Response(JSON.stringify(storedReview), { status: 201 }))
    }
    if (url === '/v1/me/reviews/review-9' && method === 'PATCH') {
      return Promise.resolve(new Response(null, { status: 204 }))
    }
    return Promise.resolve(new Response(JSON.stringify(emptyLibrary), { status: 200 }))
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('log dialog', () => {
  it('opens the Letterboxd-shaped log with poster, date, review, tags, rating, and like', async () => {
    vi.stubGlobal('fetch', dialogFetch())
    const { container } = render(<LogDialog id={550} kind="movie" onClose={() => {}} onSaved={() => {}} posterUrl="https://image.tmdb.org/t/p/w500/poster.jpg" title="Fight Club" year={1999} />)

    expect(screen.getByRole('dialog', { name: 'Log Fight Club 1999' })).toBeInTheDocument()
    expect(container.querySelector('img[src*="poster.jpg"]')).not.toBeNull()
    expect(screen.getByLabelText('Watched date')).toHaveValue(new Date().toISOString().slice(0, 10))
    expect(screen.getByLabelText('Review', { selector: 'textarea' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('eg. cinema')).toBeInTheDocument()
    expect(await screen.findByRole('radiogroup', { name: 'Rate Fight Club out of 10' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Like Fight Club' })).toBeInTheDocument()
  })

  it('saves watched, diary, rating, like, and review in one commit', async () => {
    const user = userEvent.setup()
    const fetchMock = dialogFetch()
    vi.stubGlobal('fetch', fetchMock)
    const onSaved = vi.fn()
    render(<LogDialog id={550} kind="movie" onClose={() => {}} onSaved={onSaved} title="Fight Club" year={1999} />)

    await user.click(await screen.findByRole('radio', { name: 'Rate 8 out of 10' }))
    await user.click(screen.getByRole('button', { name: 'Like Fight Club' }))
    await user.click(screen.getByLabelText(/watched this before/))
    await user.type(screen.getByLabelText('Review', { selector: 'textarea' }), 'A patient masterpiece.')
    await user.type(screen.getByPlaceholderText('eg. cinema'), 'cinema, rewatch')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const today = new Date().toISOString().slice(0, 10)
    expect(fetchMock).toHaveBeenCalledWith('/v1/me/library/watched/movie/550', expect.objectContaining({ method: 'PUT' }))
    expect(fetchMock).toHaveBeenCalledWith('/v1/me/diary', expect.objectContaining({
      body: expect.stringContaining('"rewatch":true'),
      method: 'POST',
    }))
    expect(fetchMock).toHaveBeenCalledWith('/v1/ratings', expect.objectContaining({ method: 'PUT' }))
    expect(fetchMock).toHaveBeenCalledWith('/v1/likes', expect.objectContaining({ method: 'PUT' }))
    expect(fetchMock).toHaveBeenCalledWith('/v1/me/reviews', expect.objectContaining({
      body: expect.stringContaining('A patient masterpiece.'),
      method: 'POST',
    }))
    expect(fetchMock).toHaveBeenCalledWith('/v1/me/diary', expect.objectContaining({
      body: expect.stringContaining(`"watchedOn":"${today}"`),
    }))
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('requires a watched date and closes on cancel', async () => {
    const user = userEvent.setup()
    const fetchMock = dialogFetch()
    vi.stubGlobal('fetch', fetchMock)
    const onClose = vi.fn()
    render(<LogDialog id={550} kind="movie" onClose={onClose} onSaved={() => {}} title="Fight Club" />)

    await user.clear(screen.getByLabelText('Watched date'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Choose a watched date.')
    expect(fetchMock).not.toHaveBeenCalledWith('/v1/me/diary', expect.anything())

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('edits the stored review in place instead of writing a new one', async () => {
    const user = userEvent.setup()
    const fetchMock = dialogFetch()
    vi.stubGlobal('fetch', fetchMock)
    const onSaved = vi.fn()
    render(<LogDialog existingReview={{ body: 'A patient masterpiece.', reviewId: 'review-9', reviewedOn: '2026-09-09' }} id={550} kind="movie" onClose={() => {}} onSaved={onSaved} title="Fight Club" year={1999} />)

    expect(screen.getByLabelText('Review', { selector: 'textarea' })).toHaveValue('A patient masterpiece.')
    expect(screen.getByLabelText('Watched date')).toHaveValue('2026-09-09')

    const textarea = screen.getByLabelText('Review', { selector: 'textarea' })
    await user.clear(textarea)
    await user.type(textarea, 'Even better on rewatch.')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(fetchMock).toHaveBeenCalledWith('/v1/me/reviews/review-9', expect.objectContaining({
      body: expect.stringContaining('Even better on rewatch.'),
      method: 'PATCH',
    }))
    expect(fetchMock).not.toHaveBeenCalledWith('/v1/me/reviews', expect.objectContaining({ method: 'POST' }))
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('skips the review write when the stored text is unchanged', async () => {
    const user = userEvent.setup()
    const fetchMock = dialogFetch()
    vi.stubGlobal('fetch', fetchMock)
    const onSaved = vi.fn()
    render(<LogDialog existingReview={{ body: 'A patient masterpiece.', reviewId: 'review-9', reviewedOn: '2026-09-09' }} id={550} kind="movie" onClose={() => {}} onSaved={onSaved} title="Fight Club" year={1999} />)

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(fetchMock).not.toHaveBeenCalledWith('/v1/me/reviews/review-9', expect.anything())
    expect(fetchMock).not.toHaveBeenCalledWith('/v1/me/reviews', expect.objectContaining({ method: 'POST' }))
    expect(onSaved).toHaveBeenCalledTimes(1)
  })
})
