import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders as render } from '@/test/render'
import { SessionProvider } from '../session/session'

import { AddTitleToList } from './add-title-to-list'
import { MEMBER_TITLE_ACTION_ROW_CLASS } from './title-action-styles'
import { TitleCardQuickActions } from '../shared/title-card-quick-actions'

vi.mock('@/lib/identity-browser', () => ({
  appendMemberListTitle: vi.fn(async () => {}),
  createMemberList: vi.fn(async (input: { name: string; visibility: 'public' | 'private' }) => ({
    items: [],
    list: { description: null, id: 'new-list-id', itemCount: 0, name: input.name, origin: 'native', slug: 'arrival-picks', visibility: input.visibility },
    owner: { displayName: 'Film Fan', username: 'film_fan' },
    viewerHasSaved: false,
    viewerIsOwner: true,
  })),
  getMemberTitleState: vi.fn(async () => ({ like: null, rating: null, review: null, saved: false, watched: false })),
  getMemberLibraryPage: vi.fn(async () => ({ collection: 'lists', items: [], nextCursor: null })),
  setMemberLiked: vi.fn(async () => {}),
  setMemberSaved: vi.fn(async () => {}),
  setMemberWatched: vi.fn(async () => {}),
}))

import { appendMemberListTitle, createMemberList, getMemberTitleState } from '@/lib/identity-browser'

const member = {
  avatarStyle: 'dusk',
  avatarUrl: null,
  createdAt: '2026-09-07T12:00:00.000Z',
  displayName: 'Film Fan',
  email: 'member@example.com',
  emailVerified: true,
  id: '9e0a21f4-31bc-4aa7-98ae-b3cb8da0a8ca',
  role: 'member',
  username: 'film_fan',
} as const

describe('title page list action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', '') } })
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open') } })
  })

  it('opens a separate title-aware dialog for the list task', async () => {
    const user = userEvent.setup()
    render(<AddTitleToList title={{ id: 329865, kind: 'movie' }} titleName="Arrival" />)

    const trigger = screen.getByRole('button', { name: 'Add to a list' })
    expect(trigger.className).toBe(MEMBER_TITLE_ACTION_ROW_CLASS)
    await user.click(trigger)

    const dialog = await screen.findByRole('dialog', { name: 'Add to a list' })
    expect(dialog).toHaveAttribute('data-consumit-add-title-to-list')
    expect(dialog).toContainElement(screen.getByRole('heading', { name: 'Choose a list' }))
    expect(screen.getByRole('button', { name: 'Add to a list' })).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('button', { name: 'Close add to list' }))
    expect(screen.queryByRole('dialog', { name: 'Add to a list' })).not.toBeInTheDocument()
  })

  it('closes the title action menu before opening the standalone list dialog', async () => {
    const user = userEvent.setup()
    render(<SessionProvider initialMember={member} initialStatus="authenticated"><TitleCardQuickActions id={329865} kind="movie" posterUrl="/arrival.jpg" title="Arrival" /></SessionProvider>)

    await user.click(screen.getByRole('button', { name: 'More actions for Arrival' }))
    expect(await screen.findByRole('dialog', { name: 'Arrival actions' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add to a list' }))

    const listDialog = await screen.findByRole('dialog', { name: 'Add to a list' })
    expect(listDialog).toHaveAttribute('data-consumit-add-title-to-list')
    expect(screen.queryByRole('dialog', { name: 'Arrival actions' })).not.toBeInTheDocument()
    expect(getMemberTitleState).toHaveBeenCalledWith({ id: 329865, kind: 'movie' })
  })

  it('creates a public list from a title page and appends that title', async () => {
    const user = userEvent.setup()
    render(<AddTitleToList title={{ id: 329865, kind: 'movie' }} titleName="Arrival" />)

    await user.click(screen.getByRole('button', { name: 'Add to a list' }))
    expect(await screen.findByRole('heading', { name: 'Choose a list' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Visibility Public' })).toHaveAttribute('aria-haspopup', 'listbox')
    await user.click(screen.getByRole('button', { name: 'Create and add title' }))

    expect(createMemberList).toHaveBeenCalledWith(expect.objectContaining({ name: 'Arrival picks', visibility: 'public' }))
    expect(appendMemberListTitle).toHaveBeenCalledWith('new-list-id', { id: 329865, kind: 'movie' })
    expect(await screen.findByRole('status')).toHaveTextContent('Created Arrival picks and added Arrival.')
    expect(screen.getByRole('link', { name: 'Open list' })).toHaveAttribute('href', '/lists/arrival-picks')
  })

  it('retries a failed append in the created list without creating a second list', async () => {
    const user = userEvent.setup()
    vi.mocked(appendMemberListTitle).mockRejectedValueOnce(new Error('Temporary network failure'))
    render(<AddTitleToList title={{ id: 329865, kind: 'movie' }} titleName="Arrival" />)

    await user.click(screen.getByRole('button', { name: 'Add to a list' }))
    await screen.findByRole('heading', { name: 'Choose a list' })
    await user.click(screen.getByRole('button', { name: 'Create and add title' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Created Arrival picks, but could not add Arrival.')
    expect(screen.getByRole('button', { name: 'Retry add title' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry add title' }))

    expect(createMemberList).toHaveBeenCalledTimes(1)
    expect(appendMemberListTitle).toHaveBeenCalledTimes(2)
    expect(appendMemberListTitle).toHaveBeenNthCalledWith(1, 'new-list-id', { id: 329865, kind: 'movie' })
    expect(appendMemberListTitle).toHaveBeenNthCalledWith(2, 'new-list-id', { id: 329865, kind: 'movie' })
    expect(await screen.findByRole('status')).toHaveTextContent('Created Arrival picks and added Arrival.')
    expect(screen.getByRole('dialog', { name: 'Add to a list' })).toHaveTextContent(/1 title\s*·\s*public/)
  })
})
