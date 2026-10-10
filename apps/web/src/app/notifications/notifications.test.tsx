import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SafeMember, ReleaseEpisode } from '@consumit/contracts'
import { SessionProvider } from '../session/session'
import { NewEpisodesRail } from '../home/new-episodes-rail'
import { NotificationBell } from './notification-bell'
import { NotificationPreference } from '../settings/notification-preference'

const member = { id: 'member', username: 'member', email: 'member@example.com' } as SafeMember
const episode: ReleaseEpisode = { ref: { kind: 'series', id: 95396, season: 2, episode: 4 }, title: 'A very long series title that should remain readable across a small mobile screen', episodeTitle: null, imageUrl: null, releasedAt: '2026-10-08T00:00:00.000Z', datePrecision: 'date', checkedAt: null }
afterEach(() => vi.unstubAllGlobals())
function wrap(children: React.ReactNode) { return <SessionProvider initialMember={member} initialStatus="authenticated">{children}</SessionProvider> }
function response(body: unknown) { return Promise.resolve(new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })) }
describe('personal release surfaces', () => {
  it('hides the shelf for guests and members without tracked titles', async () => {
    const fetch = vi.fn(() => response({ items: [], trackedCount: 0, partial: false })); vi.stubGlobal('fetch', fetch)
    const guest = render(<SessionProvider><NewEpisodesRail /></SessionProvider>)
    expect(screen.queryByText('New this week')).not.toBeInTheDocument(); expect(fetch).not.toHaveBeenCalled()
    guest.unmount(); const { container } = render(wrap(<NewEpisodesRail />))
    await act(async () => {})
    expect(fetch).toHaveBeenCalledWith('/v1/me/releases', expect.anything())
    expect(container).toBeEmptyDOMElement()
  })
  it('hides the shelf when tracked titles have no new episodes', async () => {
    vi.stubGlobal('fetch', vi.fn(() => response({ items: [], trackedCount: 2, partial: true })))
    const { container } = render(wrap(<NewEpisodesRail />))
    await act(async () => {})
    expect(container).toBeEmptyDOMElement()
  })
  it('hides a failed initial load', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')))
    const { container } = render(wrap(<NewEpisodesRail />))
    await act(async () => {})
    expect(container).toBeEmptyDOMElement()
  })
  it('appears only after new episodes have loaded', async () => {
    let resolveFetch!: (value: Response) => void
    vi.stubGlobal('fetch', vi.fn((path: string) => path === '/v1/me/releases' ? new Promise<Response>(resolve => { resolveFetch = resolve }) : response({})))
    const { container } = render(wrap(<NewEpisodesRail />))
    expect(container).toBeEmptyDOMElement()
    await act(async () => { resolveFetch(new Response(JSON.stringify({ items: [episode], trackedCount: 1, partial: false }))) })
    expect(await screen.findByRole('heading', { name: 'New this week' })).toBeInTheDocument()
  })
  it('distinguishes exact checked playback from an unconfirmed title destination', async () => {
    vi.stubGlobal('fetch', vi.fn(() => response({ items: [episode, { ...episode, ref: { ...episode.ref, episode: 5 }, checkedAt: '2026-10-09T11:00:00.000Z' }], trackedCount: 1, partial: true })))
    render(wrap(<NewEpisodesRail />))
    expect(await screen.findByText('Aired · playback not confirmed')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View episodes' }).getAttribute('href')).toMatch(/#episodes$/)
    expect(screen.getByRole('link', { name: 'Play episode' })).toHaveAttribute('href', '/watch/series/95396?season=2&episode=5')
    expect(screen.getByText(/Playback checked/)).toBeInTheDocument(); expect(screen.getByText(/Some episode updates/)).toBeInTheDocument()
  })
  it('keeps known episodes during a failed refresh, retries and discards member data on logout', async () => {
    let releasesRead = 0
    const fetch = vi.fn((path: string) => {
      if (path !== '/v1/me/releases') return response({})
      if (++releasesRead === 2) return Promise.reject(new Error('Offline'))
      return response({ items: [episode], trackedCount: 1, partial: false })
    }); vi.stubGlobal('fetch', fetch)
    const view = render(wrap(<NewEpisodesRail />))
    expect(await screen.findByText('Aired · playback not confirmed')).toBeInTheDocument()
    fireEvent(window, new Event('focus'))
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(screen.getByText('Aired · playback not confirmed')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument())
    view.unmount(); render(<SessionProvider><NewEpisodesRail /></SessionProvider>)
    expect(screen.queryByText('New this week')).not.toBeInTheDocument()
  })
  it('opens the bell by keyboard, marks exact episode read, and restores focus on Escape', async () => {
    const notification = { id: 'cd35e0d7-32d2-4e80-94dc-12f89d3c9771', episode: { ...episode, checkedAt: '2026-10-09T11:00:00.000Z' }, createdAt: '2026-10-09T11:00:00.000Z', readAt: null }
    const fetch = vi.fn((path: string) => path.includes(notification.id) ? Promise.resolve(new Response(null, { status: 204 })) : response({ items: [notification], unreadCount: 1, nextCursor: null })); vi.stubGlobal('fetch', fetch)
    const navigate = vi.fn(), user = userEvent.setup(); render(wrap(<NotificationBell pathname="/" navigate={navigate} />))
    const trigger = await screen.findByRole('button', { name: 'Notifications, 1 unread' })
    trigger.focus(); await user.keyboard('{Enter}'); expect(await screen.findByRole('dialog')).toHaveFocus()
    await user.keyboard('{Escape}'); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(trigger).toHaveFocus()
    await user.keyboard('{Enter}'); await user.click(screen.getByRole('link', { name: new RegExp(episode.title) }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/watch/series/95396?season=2&episode=4'))
    expect(fetch).toHaveBeenCalledWith(`/v1/me/notifications/${notification.id}`, expect.objectContaining({ method: 'PATCH', credentials: 'include', cache: 'no-store' }))
  })
  it('persists the initially disabled notification preference', async () => {
    let enabled = false
    const fetch = vi.fn((_path: string, init: RequestInit) => { if (init.method === 'PATCH') enabled = true; return response({ newEpisodes: enabled }) }); vi.stubGlobal('fetch', fetch)
    render(wrap(<NotificationPreference />))
    const toggle = await screen.findByRole('switch')
    await waitFor(() => expect(toggle).toBeEnabled()); expect(toggle).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(toggle); await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'))
    expect(fetch).toHaveBeenCalledWith('/v1/me/notification-preferences', expect.objectContaining({ method: 'PATCH', body: '{"newEpisodes":true}' }))
  })
  it('retries the failed preference value and clears the mutation error', async () => {
    let enabled = false, attempts = 0
    const fetch = vi.fn((_path: string, init: RequestInit) => {
      if (init.method === 'PATCH') {
        if (++attempts === 1) return Promise.resolve(new Response(null, { status: 503 }))
        enabled = JSON.parse(String(init.body)).newEpisodes
      }
      return response({ newEpisodes: enabled })
    })
    vi.stubGlobal('fetch', fetch); render(wrap(<NotificationPreference />))
    const toggle = await screen.findByRole('switch'); await waitFor(() => expect(toggle).toBeEnabled())
    fireEvent.click(toggle); fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'))
    expect(attempts).toBe(2); expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('retries a failed episode-open mutation before navigating', async () => {
    const notification = { id: 'cd35e0d7-32d2-4e80-94dc-12f89d3c9771', episode, createdAt: '2026-10-09T11:00:00.000Z', readAt: null }
    let attempts = 0
    vi.stubGlobal('fetch', vi.fn((_path: string, init: RequestInit) => init.method === 'PATCH'
      ? Promise.resolve(new Response(null, { status: ++attempts === 1 ? 503 : 204 }))
      : response({ items: [notification], unreadCount: 1, nextCursor: null })))
    const navigate = vi.fn(); render(wrap(<NotificationBell pathname="/" navigate={navigate} />))
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }))
    fireEvent.click(await screen.findByRole('link', { name: new RegExp(episode.title) }))
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/watch/series/95396?season=2&episode=4'))
    expect(attempts).toBe(2); expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
