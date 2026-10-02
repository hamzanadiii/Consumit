import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { movieDetail } from '@/test/catalog-fixtures'

import { SessionProvider } from '../session/session'

import { TitleReviewsPage } from './title-reviews-page'

const mocks = vi.hoisted(() => {
  class CatalogApiError extends Error {
    readonly status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  }
  class MemberApiError extends Error {
    readonly status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  }
  class AnimeApiError extends Error {
    readonly status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  }
  return {
    AnimeApiError,
    CatalogApiError,
    MemberApiError,
    getAnimeTitle: vi.fn(),
    getCatalogTitle: vi.fn(),
    getTitleReviews: vi.fn(),
  }
})

vi.mock('@/lib/catalog-api', () => ({
  CatalogApiError: mocks.CatalogApiError,
  getCatalogTitle: mocks.getCatalogTitle,
}))

vi.mock('@/lib/anime-api', () => ({
  AnimeApiError: mocks.AnimeApiError,
  getAnimeTitle: mocks.getAnimeTitle,
}))

vi.mock('@/lib/member-server', () => ({
  MemberApiError: mocks.MemberApiError,
  getTitleReviews: mocks.getTitleReviews,
}))

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

function reviewItem(reviewId: string, username: string, body: string) {
  return {
    author: { avatarStyle: 'dusk', avatarUrl: null, displayName: username, username },
    body,
    liked: false,
    likesCount: 0,
    rating: null,
    reviewId,
    reviewedOn: '2026-09-06',
  }
}

describe('title reviews page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCatalogTitle.mockResolvedValue({ item: movieDetail, meta: { stale: false } })
  })

  it('renders the archive with sort tabs and pagination', async () => {
    mocks.getTitleReviews.mockResolvedValue({
      items: [reviewItem('recent-1', 'open_critic', 'First public take.'), reviewItem('recent-2', 'quiet_fan', 'Second take.')],
      page: 1,
      totalPages: 3,
      totalResults: 21,
    })
    render(<SessionProvider>{await TitleReviewsPage({ audience: 'all', id: 693134, kind: 'movie', page: 1, sort: 'recent' })}</SessionProvider>)

    expect(screen.getByRole('link', { name: 'Back to Dune: Part Two' })).toHaveAttribute('href', '/title/693134')
    expect(screen.getByText('First public take.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Popular' })).toHaveAttribute('href', '/title/693134/reviews?sort=popular&audience=all')
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Next →' })).toHaveAttribute('href', '/title/693134/reviews?sort=recent&audience=all&page=2')
    expect(screen.queryByRole('link', { name: '← Previous' })).not.toBeInTheDocument()
    expect(mocks.getTitleReviews).toHaveBeenCalledWith('movie', 693134, 1, 'recent', 'all')
  })

  it('links back from later pages and keeps the current sort', async () => {
    mocks.getTitleReviews.mockResolvedValue({
      items: [reviewItem('recent-11', 'open_critic', 'Older take.')],
      page: 3,
      totalPages: 3,
      totalResults: 21,
    })
    render(<SessionProvider>{await TitleReviewsPage({ audience: 'all', id: 693134, kind: 'movie', page: 3, sort: 'popular' })}</SessionProvider>)

    expect(screen.getByRole('link', { name: '← Previous' })).toHaveAttribute('href', '/title/693134/reviews?sort=popular&audience=all&page=2')
    expect(screen.queryByRole('link', { name: 'Next →' })).not.toBeInTheDocument()
  })

  it('shows an honest empty state without pagination', async () => {
    mocks.getTitleReviews.mockResolvedValue({ items: [], page: 1, totalPages: 0, totalResults: 0 })
    render(<SessionProvider>{await TitleReviewsPage({ audience: 'all', id: 693134, kind: 'movie', page: 1, sort: 'recent' })}</SessionProvider>)

    expect(screen.getByRole('heading', { name: 'No member reviews yet' })).toBeInTheDocument()
    expect(screen.queryByText(/Page \d/)).not.toBeInTheDocument()
  })

  it('rejects pages past the end and missing titles', async () => {
    mocks.getTitleReviews.mockResolvedValue({ items: [], page: 9, totalPages: 3, totalResults: 21 })
    await expect(TitleReviewsPage({ audience: 'all', id: 693134, kind: 'movie', page: 9, sort: 'recent' })).rejects.toThrow('NEXT_NOT_FOUND')

    mocks.getCatalogTitle.mockRejectedValue(new mocks.CatalogApiError('Not found.', 404))
    await expect(TitleReviewsPage({ audience: 'all', id: 1, kind: 'movie', page: 1, sort: 'recent' })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('explains review load failures with a retry destination', async () => {
    mocks.getTitleReviews.mockRejectedValue(new mocks.MemberApiError('Member data is temporarily unavailable.', 503))
    render(<SessionProvider>{await TitleReviewsPage({ audience: 'all', id: 693134, kind: 'movie', page: 1, sort: 'recent' })}</SessionProvider>)

    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded')
    expect(screen.getByRole('link', { name: 'Try again' })).toHaveAttribute('href', '/title/693134/reviews?sort=recent&audience=all&page=1')
  })

  it('keeps the review archive personal with no friends tab', async () => {
    mocks.getTitleReviews.mockResolvedValue({ items: [], page: 1, totalPages: 0, totalResults: 0 })
    render(<SessionProvider>{await TitleReviewsPage({ audience: 'all', id: 693134, kind: 'movie', page: 1, sort: 'recent' })}</SessionProvider>)

    expect(mocks.getTitleReviews).toHaveBeenCalledWith('movie', 693134, 1, 'recent', 'all')
    expect(screen.queryByRole('link', { name: 'Friends' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'No member reviews yet' })).toBeInTheDocument()
  })

  it('resolves anime titles from AniList and serves the anime archive', async () => {
    mocks.getAnimeTitle.mockResolvedValue({ anilistId: 21, coverImage: { url: null }, kind: 'anime', titles: { preferred: 'Frieren' } })
    mocks.getTitleReviews.mockResolvedValue({ items: [reviewItem('anime-1', 'open_critic', 'A quiet masterpiece.')], page: 1, totalPages: 1, totalResults: 1 })
    render(<SessionProvider>{await TitleReviewsPage({ audience: 'all', id: 21, kind: 'anime', page: 1, sort: 'recent' })}</SessionProvider>)

    expect(mocks.getCatalogTitle).not.toHaveBeenCalled()
    expect(mocks.getAnimeTitle).toHaveBeenCalledWith(21)
    expect(mocks.getTitleReviews).toHaveBeenCalledWith('anime', 21, 1, 'recent', 'all')
    expect(await screen.findByRole('heading', { level: 2, name: 'Frieren reviews' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Frieren' })).toHaveAttribute('href', '/anime/21')
    expect(screen.getByRole('link', { name: 'Popular' })).toHaveAttribute('href', '/anime/21/reviews?sort=popular&audience=all')
  })

  it('treats a missing anime title as not found', async () => {
    mocks.getAnimeTitle.mockRejectedValue(new mocks.AnimeApiError('Not found.', 404))
    await expect(TitleReviewsPage({ audience: 'all', id: 404, kind: 'anime', page: 1, sort: 'recent' })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

