import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SessionProvider, useSession } from './session'

const getCurrentMember = vi.hoisted(() => vi.fn())

vi.mock('@/lib/identity-browser', () => ({ getCurrentMember }))

const member = {
  avatarStyle: 'dusk',
  avatarUrl: null,
  createdAt: '2026-09-07T12:00:00.000Z',
  displayName: 'Hamza',
  email: 'member@example.com',
  emailVerified: true,
  id: '9e0a21f4-31bc-4aa7-98ae-b3cb8da0a8ca',
  role: 'member',
  username: 'hamzanadi',
} as const

function SessionState() {
  const session = useSession()
  return (
    <>
      <p data-testid="session-state">{session.status}:{session.member?.username ?? 'none'}</p>
      <button onClick={() => session.setMember({ ...member })} type="button">Sign in locally</button>
    </>
  )
}

describe('SessionProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/')
  })

  it('restores the current member before reporting an anonymous session', async () => {
    getCurrentMember.mockResolvedValue(member)
    render(<SessionProvider initialStatus="loading"><SessionState /></SessionProvider>)

    expect(screen.getByTestId('session-state')).toHaveTextContent('loading:none')
    await waitFor(() => expect(screen.getByTestId('session-state')).toHaveTextContent('authenticated:hamzanadi'))
    expect(getCurrentMember).toHaveBeenCalledTimes(1)
  })

  it('does not let a late bootstrap response overwrite a newer sign-in', async () => {
    let resolveLookup!: (value: null) => void
    getCurrentMember.mockReturnValue(new Promise((resolve) => { resolveLookup = resolve }))
    render(<SessionProvider initialStatus="loading"><SessionState /></SessionProvider>)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign in locally' }))
    expect(screen.getByTestId('session-state')).toHaveTextContent('authenticated:hamzanadi')

    await act(async () => resolveLookup(null))
    expect(screen.getByTestId('session-state')).toHaveTextContent('authenticated:hamzanadi')
  })

  it('retries a failed bootstrap once before reporting an unavailable session', async () => {
    getCurrentMember.mockRejectedValueOnce(new Error('unreachable')).mockResolvedValue(member)
    render(<SessionProvider initialStatus="loading"><SessionState /></SessionProvider>)

    expect(screen.getByTestId('session-state')).toHaveTextContent('loading:none')
    await waitFor(() => expect(screen.getByTestId('session-state')).toHaveTextContent('authenticated:hamzanadi'), { timeout: 5000 })
    expect(getCurrentMember).toHaveBeenCalledTimes(2)
  })

  it('skips the browser session lookup on Watch routes seeded by the server', () => {
    getCurrentMember.mockResolvedValue(null)
    window.history.replaceState({}, '', '/watch/movie/1')
    render(<SessionProvider initialStatus="loading"><SessionState /></SessionProvider>)

    expect(screen.getByTestId('session-state')).toHaveTextContent('loading:none')
    expect(getCurrentMember).not.toHaveBeenCalled()
  })
})
