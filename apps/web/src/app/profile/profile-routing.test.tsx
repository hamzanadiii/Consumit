import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders as render } from '@/test/render'
import type { MemberProfileData } from '@consumit/contracts'
import ListsRedirect from '../lists/page'
import WatchlistRedirect from '../watchlist/page'
import LibraryRedirect from '../library/page'
import ProfileArchivePage from './[username]/[section]/page'
import { ProfileArchiveScreen } from './profile-archive-screen'
import { movieSummary, seriesSummary } from '@/test/catalog-fixtures'
import userEvent from '@testing-library/user-event'

const mocks = vi.hoisted(() => ({ session: vi.fn(), profile: vi.fn(), library: vi.fn(), archive: vi.fn(), list: vi.fn(), catalog: vi.fn(), ratings: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`) }, notFound: () => { throw new Error('not-found') }, useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/profile/hamza/lists' }))
vi.mock('@/lib/identity-server', () => ({ getServerSession: mocks.session }))
vi.mock('@/lib/member-server', () => ({ getPublicProfile: mocks.profile, getMemberLibrarySnapshot: mocks.library, getPublicProfileArchivePage: mocks.archive, getMemberList: mocks.list, getMemberRatingsForTitles: mocks.ratings, MemberApiError: class extends Error {} }))
vi.mock('@/lib/catalog-api', () => ({ getCatalogBatchForRefs: mocks.catalog, MAX_PAGE_CATALOG_ENRICHMENT: 120 }))
const profile: MemberProfileData = { canonicalUsername: 'hamza', profile: { avatarStyle: 'dusk', avatarUrl: null, bannerUrl: null, bio: null, createdAt: '2026-01-01T00:00:00Z', displayName: 'Hamza', location: null, nextUsernameChangeAt: null, username: 'hamza', usernameChangedAt: null, visibility: 'public' }, diary: [], favorites: [], lists: [], reviews: [], social: { followers: 0, following: 0 }, statistics: { diaryEntries: 0, lists: 1, reviews: 0, watched: 0 } }
const ownList = { id: 'private-list', slug: 'private-list', name: 'My private collection', description: null, itemCount: 0, visibility: 'private', origin: 'native' }
const savedList = { ...ownList, id: 'saved-list', slug: 'saved-list', name: 'A saved collection', visibility: 'public' }

describe('profile archive routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.session.mockResolvedValue({ status: 'authenticated', member: { username: 'hamza' } })
    mocks.profile.mockResolvedValue(profile)
    mocks.library.mockResolvedValue({ lists: { items: [ownList], nextCursor: null }, savedLists: { items: [{ coverTitles: [], list: savedList, owner: { displayName: 'Alex', username: 'alex' } }], nextCursor: null } })
    mocks.list.mockResolvedValue({ items: [] })
    mocks.archive.mockResolvedValue({ collection: 'lists', items: [], nextCursor: null })
    mocks.ratings.mockResolvedValue([])
  })
  it.each([[ListsRedirect, '/profile/hamza/lists'], [WatchlistRedirect, '/profile/hamza/watchlist'], [LibraryRedirect, '/profile/hamza/history']] as const)('redirects legacy entry points into the member profile', async (page, destination) => {
    await expect(page()).rejects.toThrow(`redirect:${destination}`)
  })
  it('keeps list creation and saved collections inside the owner Lists tab', async () => {
    render(await ProfileArchivePage({ params: Promise.resolve({ section: 'lists', username: 'hamza' }), searchParams: Promise.resolve({}) }))
    expect(screen.getByRole('heading', { level: 1, name: 'Lists' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create list' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'My private collection, 0 titles' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'A saved collection, 0 titles' })).toBeInTheDocument()
  })
  it('does not read private collections when visiting another member’s Lists', async () => {
    mocks.session.mockResolvedValue({ status: 'authenticated', member: { username: 'alex' } })
    render(await ProfileArchivePage({ params: Promise.resolve({ section: 'lists', username: 'hamza' }), searchParams: Promise.resolve({}) }))
    expect(mocks.library).not.toHaveBeenCalled()
    expect(mocks.archive).toHaveBeenCalledWith('hamza', 'lists')
    expect(screen.queryByRole('button', { name: 'Create list' })).not.toBeInTheDocument()
    expect(screen.queryByText('My private collection')).not.toBeInTheDocument()
  })
  it('continues to hide another member’s Watchlist', async () => {
    mocks.session.mockResolvedValue({ status: 'authenticated', member: { username: 'alex' } })
    await expect(ProfileArchivePage({ params: Promise.resolve({ section: 'watchlist', username: 'hamza' }), searchParams: Promise.resolve({}) })).rejects.toThrow('not-found')
    expect(mocks.library).not.toHaveBeenCalled()
  })

  it('combines Films decade and genre choices and recovers from no matches', async () => {
    const user = userEvent.setup()
    const titles = [{ ...movieSummary, year: 1973 }, { ...seriesSummary, genreNames: ['Drama'] }]
    render(<ProfileArchiveScreen data={profile} initialPage={{ collection: 'films', items: titles.map(({ id, kind }) => ({ id, kind, origin: 'native', sourceKey: null })), nextCursor: null }} owner section="films" titles={titles} />)
    await user.click(screen.getByRole('button', { name: /Filter by decade/ }))
    await user.click(screen.getByRole('option', { name: '1970s' }))
    expect(screen.getByRole('link', { name: movieSummary.title })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: seriesSummary.title })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Filter by genre/ }))
    await user.click(screen.getByRole('option', { name: 'Drama' }))
    expect(screen.getByText('0 titles shown from 2 loaded')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.getByRole('link', { name: movieSummary.title })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: seriesSummary.title })).toBeInTheDocument()
  })

  it('loads current title ratings only for the Diary owner', async () => {
    const entry = { entryId: 'one', id: movieSummary.id, kind: 'movie', watchedOn: '2026-01-01', rewatch: false, tags: [], origin: 'native', sourceKey: null }
    mocks.archive.mockResolvedValue({ collection: 'diary', items: [entry], nextCursor: null })
    mocks.catalog.mockResolvedValue({ items: [movieSummary] })
    mocks.ratings.mockResolvedValue([{ ...entry, value: 9 }])
    render(await ProfileArchivePage({ params: Promise.resolve({ section: 'diary', username: 'hamza' }), searchParams: Promise.resolve({}) }))
    expect(mocks.ratings).toHaveBeenCalledWith([{ id: movieSummary.id, kind: 'movie' }])
    expect(screen.getByRole('img', { name: 'Your current title rating: 9 out of 10' })).toBeInTheDocument()
  })

  it('filters an owner Films range over loaded watches without showing card ratings', async () => {
    mocks.archive.mockResolvedValue({ collection: 'films', items: [movieSummary, seriesSummary].map(({ id, kind }) => ({ id, kind, origin: 'native', sourceKey: null })), nextCursor: null })
    mocks.catalog.mockResolvedValue({ items: [movieSummary, seriesSummary] })
    mocks.ratings.mockResolvedValue([{ id: movieSummary.id, kind: 'movie', value: 8 }, { id: seriesSummary.id, kind: 'series', value: 3 }])
    render(await ProfileArchivePage({ params: Promise.resolve({ section: 'films', username: 'hamza' }), searchParams: Promise.resolve({ rating: '7-9' }) }))
    expect(screen.getByRole('link', { name: movieSummary.title })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: seriesSummary.title })).not.toBeInTheDocument()
    expect(screen.getByText('1 title shown from 2 loaded')).toBeInTheDocument()
    expect(screen.queryByText('out of 10', { exact: true })).not.toBeInTheDocument()
  })

  it('rejects visitor and invalid rating ranges before reading an archive', async () => {
    const params = Promise.resolve({ section: 'films', username: 'hamza' })
    await expect(ProfileArchivePage({ params, searchParams: Promise.resolve({ rating: '9-2' }) })).rejects.toThrow('not-found')
    mocks.session.mockResolvedValue({ status: 'authenticated', member: { username: 'alex' } })
    await expect(ProfileArchivePage({ params, searchParams: Promise.resolve({ rating: '7-9' }) })).rejects.toThrow('not-found')
    expect(mocks.archive).not.toHaveBeenCalled()
  })

  it('does not fetch private ratings or show editing in a visitor Diary', async () => {
    mocks.session.mockResolvedValue({ status: 'authenticated', member: { username: 'alex' } })
    mocks.archive.mockResolvedValue({ collection: 'diary', items: [{ entryId: 'one', id: movieSummary.id, kind: 'movie', watchedOn: '2026-01-01', rewatch: false, tags: [], origin: 'native', sourceKey: null }], nextCursor: null })
    mocks.catalog.mockResolvedValue({ items: [movieSummary] })
    render(await ProfileArchivePage({ params: Promise.resolve({ section: 'diary', username: 'hamza' }), searchParams: Promise.resolve({}) }))
    expect(mocks.ratings).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /Edit diary entry/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /your current rating/ })).not.toBeInTheDocument()
  })
})
