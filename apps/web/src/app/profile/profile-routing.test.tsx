import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders as render } from '@/test/render'
import type { MemberProfileData, PublicProfile } from '@consumit/contracts'
import ListsRedirect from '../lists/page'
import WatchlistRedirect from '../watchlist/page'
import LibraryRedirect from '../library/page'
import ProfileArchivePage from './[username]/[section]/page'
import { ProfileArchiveScreen } from './profile-archive-screen'
import { movieSummary, seriesSummary } from '@/test/catalog-fixtures'
import userEvent from '@testing-library/user-event'
import { SessionProvider } from '../session/session'

const mocks = vi.hoisted(() => ({ session: vi.fn(), profile: vi.fn(), library: vi.fn(), archive: vi.fn(), list: vi.fn(), catalog: vi.fn(), ratings: vi.fn(), collection: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`) }, notFound: () => { throw new Error('not-found') }, useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/profile/hamza/lists' }))
vi.mock('@/lib/identity-server', () => ({ getServerSession: mocks.session }))
vi.mock('@/lib/member-server', () => ({ getPublicProfile: mocks.profile, getProfileRead: mocks.profile, getMemberLibrarySnapshot: mocks.library, getPublicProfileArchivePage: mocks.archive, getMemberList: mocks.list, getMemberRatingsForTitles: mocks.ratings, getPublicCollection: mocks.collection, MemberApiError: class extends Error {} }))
vi.mock('@/lib/catalog-api', () => ({ getCatalogBatchForRefs: mocks.catalog, MAX_PAGE_CATALOG_ENRICHMENT: 120 }))
const sectionVisibility = { favorites: true, ratings: true, reviews: true, lists: true, network: true, likes: true, tags: true, watchlist: true, watched: true, diary: true, history: true, activity: true }
const profile: MemberProfileData = { canonicalUsername: 'hamza', profile: { avatarStyle: 'dusk', avatarUrl: null, bannerUrl: null, bio: null, createdAt: '2026-01-01T00:00:00Z', displayName: 'Hamza', nextUsernameChangeAt: null, sectionVisibility, username: 'hamza', usernameChangedAt: null }, diary: [], favorites: [], lists: [], reviews: [], social: { followers: 0, following: 0 }, statistics: { activity: 0, diaryEntries: 0, history: 0, lists: 1, reviews: 0, watchlist: 0, watched: 0 } }
const ownList = { id: 'private-list', slug: 'private-list', name: 'My private collection', description: null, itemCount: 0, visibility: 'private', origin: 'native' }
const visitorProfile: PublicProfile = { viewerIsOwner: false, canonicalUsername: 'hamza', sectionVisibility, profile: { id: 'public-member-id', username: 'hamza', displayName: 'Hamza', avatarStyle: 'dusk', avatarUrl: null, bannerUrl: null, bio: null, isFollowing: false }, favorites: [], ratingDistribution: [], statistics: { activity: 0, diary: 0, history: 0, lists: 1, ratings: 4, reviews: 2, watchlist: 0, watched: 0 }, social: { followers: 3, following: 5 } }

describe('profile archive routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.session.mockResolvedValue({ status: 'authenticated', member: { username: 'hamza' } })
    mocks.profile.mockResolvedValue({ ...profile, viewerIsOwner: true })
    mocks.library.mockResolvedValue({ lists: { items: [ownList], nextCursor: null }, savedLists: { items: [], nextCursor: null } })
    mocks.list.mockResolvedValue({ items: [] })
    mocks.archive.mockResolvedValue({ collection: 'lists', items: [], nextCursor: null })
    mocks.ratings.mockResolvedValue([])
  })
  it('lets the owner open the full review and its discussion from the review archive', () => {
    render(<ProfileArchiveScreen data={profile} initialPage={{ collection: 'reviews', items: [{ kind: 'movie', id: movieSummary.id, origin: 'native', sourceKey: null, body: 'A patient masterpiece.', reviewId: 'review-one', reviewedOn: null, tags: [] }], nextCursor: null }} owner section="reviews" titles={[movieSummary]} />)
    expect(screen.getByRole('link', { name: `Read and discuss review of ${movieSummary.title}` })).toHaveAttribute('href', '/reviews/review-one')
    expect(screen.getByRole('link', { name: movieSummary.title })).toHaveAttribute('href', `/title/${movieSummary.id}`)
  })
  it('opens the published review from an Activity entry', () => {
    render(<ProfileArchiveScreen data={profile} initialPage={{ collection: 'activity', items: [{ kind: 'review', occurredAt: '2026-10-27T12:00:00.000Z', item: { kind: 'movie', id: movieSummary.id, origin: 'native', sourceKey: null, body: 'A patient masterpiece.', reviewId: 'review-one', reviewedOn: null, tags: [] } }], nextCursor: null }} owner section="activity" titles={[movieSummary]} />)
    expect(screen.getByRole('link', { name: movieSummary.title })).toHaveAttribute('href', '/reviews/review-one')
  })
  it('distinguishes a review search with no matches from an empty review archive', async () => {
    render(<ProfileArchiveScreen data={profile} initialPage={{ collection: 'reviews', items: [{ kind: 'movie', id: movieSummary.id, origin: 'native', sourceKey: null, body: 'A patient masterpiece.', reviewId: 'review-one', reviewedOn: null, tags: [] }], nextCursor: null }} owner section="reviews" titles={[movieSummary]} />)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search Reviews' }), 'unmatched title')
    expect(screen.getByText('No loaded reviews match this search. Try another title.')).toBeVisible()
    expect(screen.queryByText('No reviews have been published yet.')).not.toBeInTheDocument()
    await userEvent.clear(screen.getByRole('searchbox', { name: 'Search Reviews' }))
    expect(screen.getByRole('link', { name: `Read and discuss review of ${movieSummary.title}` })).toBeVisible()
  })
  it.each([[ListsRedirect, '/profile/hamza/lists'], [WatchlistRedirect, '/profile/hamza/watchlist'], [LibraryRedirect, '/profile/hamza/history']] as const)('redirects legacy entry points into the member profile', async (page, destination) => {
    await expect(page()).rejects.toThrow(`redirect:${destination}`)
  })
  it.each(['watchlist', 'likes', 'films', 'history', 'lists'])('keeps the requested %s destination through guest sign-in and opens only the signed-in member archive', async section => {
    const props = { searchParams: Promise.resolve({ section }) }
    mocks.session.mockResolvedValue({ status: 'anonymous' })
    await expect(LibraryRedirect(props)).rejects.toThrow(`redirect:/sign-in?next=${encodeURIComponent(`/library?section=${section}`)}`)
    expect(mocks.profile).not.toHaveBeenCalled()
    expect(mocks.archive).not.toHaveBeenCalled()
    mocks.session.mockResolvedValue({ status: 'authenticated', member: { username: 'hamza' } })
    await expect(LibraryRedirect(props)).rejects.toThrow(`redirect:/profile/hamza${section === 'profile' ? '' : `/${section}`}`)
  })
  it('shows guests their guest profile with a sign-in path instead of redirecting', async () => {
    mocks.session.mockResolvedValue({ status: 'anonymous' })
    render(await LibraryRedirect({ searchParams: Promise.resolve({ section: 'profile' }) }))
    const view = within(document.querySelector('[data-consumit-guest-profile]') as HTMLElement)
    expect(view.getByRole('heading', { level: 1, name: 'Browsing as a guest.' })).toBeInTheDocument()
    expect(view.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in?next=%2Flibrary%3Fsection%3Dprofile')
    expect(view.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/sign-up')
  })
  it.each(['network', '//evil.example', ['history', 'likes']])('rejects invalid library sections without loading a member session', async section => {
    await expect(LibraryRedirect({ searchParams: Promise.resolve({ section }) })).rejects.toThrow('not-found')
    expect(mocks.session).not.toHaveBeenCalled()
  })
  it('keeps private list creation inside the owner Lists tab', async () => {
    render(await ProfileArchivePage({ params: Promise.resolve({ section: 'lists', username: 'hamza' }), searchParams: Promise.resolve({}) }))
    expect(screen.getByRole('heading', { level: 1, name: 'Lists' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create a collection' })).toHaveAttribute('href', '/lists/new')
    expect(screen.getByRole('link', { name: 'My private collection, 0 titles' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Saved lists' })).not.toBeInTheDocument()
  })
  it('does not read private collections when visiting another member’s Lists', async () => {
    mocks.session.mockResolvedValue({ status: 'authenticated', member: { username: 'alex' } })
    await expect(ProfileArchivePage({ params: Promise.resolve({ section: 'lists', username: 'hamza' }), searchParams: Promise.resolve({}) })).rejects.toThrow('not-found')
    expect(mocks.library).not.toHaveBeenCalled()
    expect(mocks.archive).not.toHaveBeenCalled()
  })
  it.each(['followers', 'following'])('redirects the legacy %s section into the Network tab', async section => {
    await expect(ProfileArchivePage({ params: Promise.resolve({ section, username: 'hamza' }), searchParams: Promise.resolve({}) })).rejects.toThrow(`redirect:/profile/hamza/network?view=${section}`)
    expect(mocks.collection).not.toHaveBeenCalled()
  })
  it('opens the Network tab on the Followers view by default', async () => {
    mocks.collection.mockResolvedValue({ collection: 'followers', items: [], nextCursor: null })
    render(await ProfileArchivePage({ params: Promise.resolve({ section: 'network', username: 'hamza' }), searchParams: Promise.resolve({}) }))
    expect(mocks.collection).toHaveBeenCalledWith('hamza', 'followers')
    expect(screen.getByRole('link', { name: 'Followers, 0', current: 'page' })).toHaveAttribute('href', '/profile/hamza/network?view=followers')
    expect(screen.getByRole('link', { name: 'Following, 0' })).toHaveAttribute('href', '/profile/hamza/network?view=following')
    expect(screen.getByText('No followers to show yet.')).toBeInTheDocument()
  })
  it('renders the owner Network as a compact archive without offering to follow yourself', async () => {
    mocks.collection.mockResolvedValue({ collection: 'followers', items: [], nextCursor: null })
    const member = { id: 'owner-id', username: 'hamza', displayName: 'Hamza', avatarStyle: 'dusk', avatarUrl: null, createdAt: '2026-01-01T00:00:00Z', email: 'owner@example.test', emailVerified: true, role: 'member' } as const
    render(<SessionProvider initialMember={member} initialStatus="authenticated">{await ProfileArchivePage({ params: Promise.resolve({ section: 'network', username: 'hamza' }), searchParams: Promise.resolve({}) })}</SessionProvider>)
    expect(screen.queryByRole('button', { name: 'Follow' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit profile' })).toHaveAttribute('href', '/settings')
    expect(screen.getByRole('heading', { name: 'Network', level: 1 })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Hamza' })).not.toBeInTheDocument()
    const views = screen.getByRole('navigation', { name: 'Network views' })
    expect(within(views).getByRole('link', { name: 'Followers, 0', current: 'page' })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Hamza profile sections' })).getByRole('link', { name: 'Watched, 0' })).toBeInTheDocument()
  })
  it('reads the Following Network view from the query', async () => {
    mocks.collection.mockResolvedValue({ collection: 'following', items: [], nextCursor: null })
    render(await ProfileArchivePage({ params: Promise.resolve({ section: 'network', username: 'hamza' }), searchParams: Promise.resolve({ view: 'following' }) }))
    expect(mocks.collection).toHaveBeenCalledWith('hamza', 'following')
    expect(screen.getByRole('link', { name: 'Following, 0', current: 'page' })).toBeInTheDocument()
    expect(screen.getByText('No following to show yet.')).toBeInTheDocument()
  })
  it('keeps visitor Network compact with public counts and a sign-in return path', async () => {
    mocks.session.mockResolvedValue({ status: 'anonymous' })
    mocks.profile.mockResolvedValue(visitorProfile)
    mocks.collection.mockResolvedValue({ collection: 'followers', items: [], nextCursor: null })
    render(await ProfileArchivePage({ params: Promise.resolve({ section: 'network', username: 'hamza' }), searchParams: Promise.resolve({}) }))
    expect(screen.getByRole('heading', { name: 'Network', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in to follow' })).toHaveAttribute('href', '/sign-in?next=%2Fprofile%2Fhamza')
    expect(screen.getByRole('link', { name: 'Ratings, 4' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Followers, 3', current: 'page' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Following, 5' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Edit profile' })).not.toBeInTheDocument()
    const sections = within(screen.getByRole('navigation', { name: 'Hamza profile sections' }))
    expect(sections.getByRole('link', { name: 'Activity, 0' })).toHaveAttribute('href', '/profile/hamza/activity')
    expect(sections.getByRole('link', { name: 'Watched, 0' })).toHaveAttribute('href', '/profile/hamza/films')
    expect(sections.getByRole('link', { name: 'Diary, 0' })).toHaveAttribute('href', '/profile/hamza/diary')
    expect(sections.getByRole('link', { name: 'History, 0' })).toHaveAttribute('href', '/profile/hamza/history')
    expect(mocks.library).not.toHaveBeenCalled()
  })
  it('uses the API owner discriminator before showing private navigation', async () => {
    mocks.profile.mockResolvedValue(visitorProfile)
    mocks.collection.mockResolvedValue({ collection: 'followers', items: [], nextCursor: null })
    render(await ProfileArchivePage({ params: Promise.resolve({ section: 'network', username: 'hamza' }), searchParams: Promise.resolve({}) }))
    expect(screen.queryByRole('link', { name: 'Edit profile' })).not.toBeInTheDocument()
    const sections = within(screen.getByRole('navigation', { name: 'Hamza profile sections' }))
    expect(sections.getByRole('link', { name: 'Watched, 0' })).toHaveAttribute('href', '/profile/hamza/films')
    expect(sections.queryByRole('link', { name: 'Edit profile' })).not.toBeInTheDocument()
  })
  it('rejects an invalid Network view before loading member data', async () => {
    await expect(ProfileArchivePage({ params: Promise.resolve({ section: 'network', username: 'hamza' }), searchParams: Promise.resolve({ view: 'mutuals' }) })).rejects.toThrow('not-found')
    expect(mocks.profile).not.toHaveBeenCalled()
    expect(mocks.collection).not.toHaveBeenCalled()
  })
  it('continues to hide another member’s Watchlist', async () => {
    mocks.session.mockResolvedValue({ status: 'authenticated', member: { username: 'alex' } })
    await expect(ProfileArchivePage({ params: Promise.resolve({ section: 'watchlist', username: 'hamza' }), searchParams: Promise.resolve({}) })).rejects.toThrow('not-found')
    expect(mocks.library).not.toHaveBeenCalled()
  })

  it('combines Watched decade and genre choices and recovers from no matches', async () => {
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

  it('filters an owner Watched range over loaded watches without showing card ratings', async () => {
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

  it('rejects a visitor Diary before loading private records', async () => {
    mocks.session.mockResolvedValue({ status: 'authenticated', member: { username: 'alex' } })
    mocks.archive.mockResolvedValue({ collection: 'diary', items: [{ entryId: 'one', id: movieSummary.id, kind: 'movie', watchedOn: '2026-01-01', rewatch: false, tags: [], origin: 'native', sourceKey: null }], nextCursor: null })
    mocks.catalog.mockResolvedValue({ items: [movieSummary] })
    await expect(ProfileArchivePage({ params: Promise.resolve({ section: 'diary', username: 'hamza' }), searchParams: Promise.resolve({}) })).rejects.toThrow('not-found')
    expect(mocks.archive).not.toHaveBeenCalled()
    expect(mocks.ratings).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /Edit diary entry/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /your current rating/ })).not.toBeInTheDocument()
  })
})
