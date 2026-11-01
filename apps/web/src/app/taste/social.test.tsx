import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { Discussion, PublicationActions } from './social'

const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), refresh: vi.fn(), member: { id: 'reader' } as { id: string } | null, pathname: '/lists/collection' }))
vi.mock('../session/session', () => ({ useSession: () => ({ member: mocks.member }) }))
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname, useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('./api', () => ({ tasteRead: mocks.read, tasteWrite: mocks.write, errorText: (e: Error) => e.message }))
beforeEach(() => { vi.clearAllMocks(); mocks.member = { id: 'reader' }; mocks.pathname = '/lists/collection'; mocks.write.mockResolvedValue(undefined) })

describe('discussion sign-in return', () => {
  it.each([['review', '/reviews/review-one'], ['list', '/lists/quiet-evenings']] as const)('keeps the %s publication destination in server and browser renders', (kind, pathname) => {
    mocks.member = null
    mocks.pathname = pathname
    mocks.read.mockResolvedValue({ items: [], nextCursor: null, muted: false, canComment: false })
    const discussion = <Discussion target={{ kind, id: 'publication-one' }} />
    const href = `/sign-in?next=${encodeURIComponent(pathname)}`
    expect(renderToString(discussion)).toContain(`href="${href}"`)
    render(discussion)
    expect(screen.getByRole('link', { name: 'Sign in to join in' })).toHaveAttribute('href', href)
  })
})

describe('publication update subscription', () => {
  it('restores the saved subscription and can turn it off on the first click', async () => {
    mocks.read.mockResolvedValue({ subscribed: true, muted: true })
    const user = userEvent.setup()
    render(<PublicationActions subscribe target={{ kind: 'list', id: 'collection' }} />)
    const button = await screen.findByRole('button', { name: 'Updates on' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    await user.click(button)
    await waitFor(() => expect(mocks.write).toHaveBeenCalledWith('subscriptions/list/collection', { mode: 'off' }))
    expect(await screen.findByRole('button', { name: 'Notify me about updates' })).toHaveAttribute('aria-pressed', 'false')
  })
  it('does not pretend a failed write changed the subscription', async () => {
    mocks.read.mockResolvedValue({ subscribed: false, muted: false })
    mocks.write.mockRejectedValue(new Error('Could not save. Try again.'))
    const user = userEvent.setup()
    render(<PublicationActions subscribe target={{ kind: 'member', id: 'curator' }} />)
    const button = await screen.findByRole('button', { name: 'Notify me about updates' })
    await waitFor(() => expect(button).toBeEnabled())
    await user.click(button)
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save')
    expect(button).toHaveAttribute('aria-pressed', 'false')
  })
  it('refreshes the public projection after blocking its author', async () => {
    const user = userEvent.setup()
    render(<PublicationActions target={{ kind: 'review', id: 'review-one' }} memberId="author" />)
    await user.click(screen.getByRole('button', { name: 'Block member' }))
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce())
    expect(await screen.findByRole('link', { name: 'Manage blocked members' })).toHaveAttribute('href', '/community/settings')
  })
})
