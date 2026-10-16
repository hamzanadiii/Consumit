import { screen, within, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiaryEntry, MemberProfileData } from '@consumit/contracts'
import { renderWithProviders as render } from '@/test/render'
import { movieSummary, seriesSummary } from '@/test/catalog-fixtures'
import { DiaryCollection } from './diary-collection'
import { ProfileArchiveScreen } from './profile-archive-screen'

const mocks = vi.hoisted(() => ({ update: vi.fn(), remove: vi.fn(), refresh: vi.fn(), archive: vi.fn(), ratings: vi.fn(), catalog: vi.fn() }))
vi.mock('@/lib/identity-browser', () => ({ updateDiaryEntry: mocks.update, deleteDiaryEntry: mocks.remove, getProfileArchivePage: mocks.archive, getMemberRatingsForTitles: mocks.ratings }))
vi.mock('@/lib/catalog-browser', () => ({ browserCatalogBatches: mocks.catalog }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
const entries: DiaryEntry[] = [
  { entryId: 'one', id: movieSummary.id, kind: 'movie', watchedOn: '2026-01-01', rewatch: false, tags: ['new-year'], origin: 'native', sourceKey: null },
  { entryId: 'two', id: seriesSummary.id, kind: 'series', season: 2, episode: 4, watchedOn: '2025-12-31', rewatch: true, tags: [], origin: 'native', sourceKey: null },
  { entryId: 'three', id: seriesSummary.id, kind: 'series', season: 2, episode: 5, watchedOn: '2025-12-30', rewatch: false, tags: [], origin: 'native', sourceKey: null },
]
const props = { entries, hasMore: false, onDeleted: vi.fn(), onSaved: vi.fn(), owner: true, ratingsByTitle: { [`movie:${movieSummary.id}`]: 9 }, ratingsUnavailable: false, titles: [movieSummary, seriesSummary] }
async function pick(user: ReturnType<typeof userEvent.setup>, menu: RegExp, option: string) {
  await user.click(screen.getByRole('button', { name: menu }))
  await user.click(screen.getByRole('option', { name: option }))
}
describe('Diary journal', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.update.mockResolvedValue(undefined); mocks.remove.mockResolvedValue(undefined) })
  it('groups exact watched months and retains separate episode destinations and dates', () => {
    render(<DiaryCollection {...props} />)
    expect(screen.getByRole('region', { name: 'January 2026' })).toBeInTheDocument()
    const december = screen.getByRole('region', { name: 'December 2025' })
    expect(within(december).getAllByRole('link', { name: seriesSummary.title }).map(link => link.getAttribute('href'))).toEqual([`/watch/series/${seriesSummary.id}?season=2&episode=4`, `/watch/series/${seriesSummary.id}?season=2&episode=5`])
    expect(screen.getByLabelText('January 1, 2026')).toHaveAttribute('datetime', '2026-01-01')
    expect(screen.getByRole('img', { name: 'Your current title rating: 9 out of 10' })).toBeInTheDocument()
  })
  it('combines watched year, genre, release decade, rating, and search with Reset recovery', async () => {
    const user = userEvent.setup()
    render(<DiaryCollection {...props} />)
    await pick(user, /Filter by watched year/, '2026')
    await pick(user, /Filter Diary by release decade/, '2020s')
    await pick(user, /Filter Diary by genre/, 'Adventure')
    await user.click(screen.getByRole('button', { name: /Filter Diary by your current rating/ }))
    fireEvent.change(screen.getByRole('slider', { name: 'Minimum rating' }), { target: { value: '9' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Maximum rating' }), { target: { value: '9' } })
    await user.click(screen.getByRole('button', { name: 'Apply rating' }))
    expect(screen.getByText('1 entry shown from 3 loaded')).toBeInTheDocument()
    await user.type(screen.getByRole('searchbox', { name: 'Search Diary' }), 'missing')
    expect(screen.getByRole('heading', { name: 'No diary entries match.' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.getByText('3 entries loaded')).toBeInTheDocument()
  })
  it('filters rewatches and reverses chronology without collapsing repeated episodes', async () => {
    const user = userEvent.setup()
    render(<DiaryCollection {...props} />)
    await pick(user, /Filter Diary by watch type/, 'Rewatches')
    expect(screen.getByText('1 entry shown from 3 loaded')).toBeInTheDocument()
    expect(screen.getByText('S02 E04', { exact: false })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reset' }))
    await pick(user, /Sort Diary/, 'Oldest watches')
    expect(screen.getAllByRole('region').map(region => region.getAttribute('aria-label'))).toEqual(['December 2025', 'January 2026'])
    const december = screen.getByRole('region', { name: 'December 2025' })
    expect(within(december).getAllByRole('link', { name: seriesSummary.title })[0]).toHaveAttribute('href', `/watch/series/${seriesSummary.id}?season=2&episode=5`)
  })
  it('never renders title ratings or entry controls for a visitor', () => {
    render(<DiaryCollection {...props} owner={false} />)
    expect(screen.queryByRole('button', { name: /your current rating/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /current title rating/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit diary entry/ })).not.toBeInTheDocument()
    expect(screen.queryByText('9/10')).not.toBeInTheDocument()
  })
  it('distinguishes an unavailable rating lookup from unrated titles', async () => {
    const user = userEvent.setup()
    render(<DiaryCollection {...props} ratingsUnavailable />)
    await user.click(screen.getByRole('button', { name: /Filter Diary by your current rating/ }))
    expect(screen.getByRole('option', { name: 'No rating' })).toBeDisabled()
    expect(screen.getByRole('slider', { name: 'Minimum rating' })).toBeDisabled()
    expect(screen.getAllByText('Unavailable')).toHaveLength(3)
  })
  it('keeps missing catalog references findable and preserves tag filtering', () => {
    render(<DiaryCollection {...props} selectedTag="NEW-YEAR" titles={[]} />)
    expect(screen.getByRole('link', { name: `Movie #${movieSummary.id}` })).toBeInTheDocument()
    expect(screen.getByText('1 entry shown from 3 loaded')).toBeInTheDocument()
  })
  it('keeps failed edits open and updates the record only after a successful retry', async () => {
    mocks.update.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
    const user = userEvent.setup()
    render(<DiaryCollection {...props} />)
    await user.click(screen.getByRole('button', { name: `Edit diary entry for ${movieSummary.title}` }))
    const date = screen.getByLabelText('Watched date')
    expect(date).toHaveFocus()
    await user.clear(date); await user.type(date, '2025-11-14')
    await user.click(screen.getByRole('button', { name: 'Save entry' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved')
    expect(props.onSaved).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Save entry' }))
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith('one', expect.objectContaining({ watchedOn: '2025-11-14' })))
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })
  it('requires delete confirmation, retains failed entries, and restores focus on cancellation', async () => {
    mocks.remove.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
    const user = userEvent.setup()
    render(<DiaryCollection {...props} />)
    const trigger = () => screen.getByRole('button', { name: `Delete diary entry for ${movieSummary.title}` })
    await user.click(trigger())
    await user.click(screen.getByRole('button', { name: 'Keep entry' }))
    expect(trigger()).toHaveFocus()
    expect(mocks.remove).not.toHaveBeenCalled()
    await user.click(trigger())
    await user.click(screen.getByRole('button', { name: 'Delete entry' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be deleted')
    expect(props.onDeleted).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Delete entry' }))
    await waitFor(() => expect(props.onDeleted).toHaveBeenCalledWith('one'))
  })
  it('moves a successfully edited log to its new month and removes a deleted row in the archive', async () => {
    const user = userEvent.setup()
    const profile: MemberProfileData = { canonicalUsername: 'hamza', profile: { avatarStyle: 'dusk', avatarUrl: null, bannerUrl: null, bio: null, createdAt: '2026-01-01T00:00:00Z', displayName: 'Hamza', location: null, nextUsernameChangeAt: null, username: 'hamza', usernameChangedAt: null, visibility: 'private' }, diary: [], favorites: [], lists: [], reviews: [], social: { followers: 0, following: 0 }, statistics: { diaryEntries: 3, lists: 0, reviews: 0, watched: 2 } }
    render(<ProfileArchiveScreen data={profile} initialPage={{ collection: 'diary', items: entries, nextCursor: null }} owner section="diary" titles={props.titles} />)
    await user.click(screen.getByRole('button', { name: `Edit diary entry for ${movieSummary.title}` }))
    const date = screen.getByLabelText('Watched date')
    await user.clear(date); await user.type(date, '2025-11-14')
    await user.click(screen.getByRole('button', { name: 'Save entry' }))
    expect(await screen.findByRole('region', { name: 'November 2025' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'January 2026' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: `Delete diary entry for ${movieSummary.title}` }))
    await user.click(screen.getByRole('button', { name: 'Delete entry' }))
    await waitFor(() => expect(screen.queryByRole('link', { name: movieSummary.title })).not.toBeInTheDocument())
    expect(screen.getByText('2 entries loaded')).toBeInTheDocument()
  })
  it.each([true, false])('pages repeated watches without exposing ratings across ownership (owner=%s)', async owner => {
    const user = userEvent.setup()
    const profile: MemberProfileData = { canonicalUsername: 'hamza', profile: { avatarStyle: 'dusk', avatarUrl: null, bannerUrl: null, bio: null, createdAt: '2026-01-01T00:00:00Z', displayName: 'Hamza', location: null, nextUsernameChangeAt: null, username: 'hamza', usernameChangedAt: null, visibility: 'private' }, diary: [], favorites: [], lists: [], reviews: [], social: { followers: 0, following: 0 }, statistics: { diaryEntries: 2, lists: 0, reviews: 0, watched: 1 } }
    const earlier = { ...entries[0]!, entryId: 'earlier-watch', watchedOn: '2025-12-01', rewatch: true }
    mocks.archive.mockResolvedValue({ collection: 'diary', items: [earlier], nextCursor: null })
    mocks.ratings.mockRejectedValue(new Error('Rating lookup unavailable'))
    mocks.catalog.mockResolvedValue([movieSummary])
    render(<ProfileArchiveScreen data={profile} initialPage={{ collection: 'diary', items: [entries[0]!], nextCursor: 'next' }} owner={owner} section="diary" titles={[movieSummary]} />)
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(screen.getAllByRole('link', { name: movieSummary.title })).toHaveLength(2))
    expect(screen.getByText('2 entries loaded')).toBeInTheDocument()
    if (owner) {
      expect(mocks.ratings).toHaveBeenCalledWith([{ id: earlier.id, kind: earlier.kind }])
      expect(screen.getByText('Your ratings could not load; rating filters are unavailable.')).toBeInTheDocument()
    } else expect(mocks.ratings).not.toHaveBeenCalled()
  })
})
