import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { movieSummary } from '@/test/catalog-fixtures'
import { renderWithProviders as render } from '@/test/render'

import { SignInScreen, SignUpScreen } from './auth-screens'

const mocks = vi.hoisted(() => ({
  getUsernameAvailability: vi.fn(),
  loginMember: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  registerMember: vi.fn(),
  verifyMemberEmail: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}))

vi.mock('@/lib/identity-browser', () => ({
  confirmPasswordRecovery: vi.fn(),
  getUsernameAvailability: mocks.getUsernameAvailability,
  IdentityApiError: class IdentityApiError extends Error {},
  loginMember: mocks.loginMember,
  registerMember: mocks.registerMember,
  requestEmailVerification: vi.fn(),
  requestPasswordRecovery: vi.fn(),
  verifyMemberEmail: mocks.verifyMemberEmail,
}))

const member = {
  createdAt: '2026-09-07T12:00:00.000Z',
  displayName: 'Cinema Fan',
  email: 'member@example.com',
  emailVerified: true,
  id: '9e0a21f4-31bc-4aa7-98ae-b3cb8da0a8ca',
  avatarStyle: 'dusk',
  username: 'cinema_fan',
}

describe('server-backed authentication screens', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    window.sessionStorage.clear()
    mocks.getUsernameAvailability.mockResolvedValue({ available: true, username: 'cinema_fan' })
    mocks.loginMember.mockResolvedValue(member)
    mocks.registerMember.mockResolvedValue({ message: 'If the details can be used, a verification code has been sent.' })
    mocks.verifyMemberEmail.mockResolvedValue(member)
  })

  it('signs in through the identity API without browser-stored session tokens', async () => {
    const user = userEvent.setup()
    render(<SignInScreen nextPath="/library" titles={[movieSummary]} />)

    await user.type(screen.getByLabelText('Email'), member.email)
    await user.type(screen.getByLabelText('Password'), 'a-secure-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(mocks.loginMember).toHaveBeenCalledWith({ email: member.email, password: 'a-secure-password' }))
    expect(mocks.push).toHaveBeenCalledWith('/library')
    expect(window.localStorage).toHaveLength(0)
    expect(window.sessionStorage).toHaveLength(0)
  })

  it('requires a username and email verification without OAuth controls', async () => {
    const user = userEvent.setup()
    render(<SignUpScreen titles={[movieSummary]} />)

    expect(screen.queryByText(/google|apple/i)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Username'), member.username)
    await user.type(screen.getByLabelText('Email'), member.email)
    await user.type(screen.getByLabelText('Password'), 'a-secure-password')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(mocks.registerMember).toHaveBeenCalledWith({
      email: member.email,
      password: 'a-secure-password',
      username: member.username,
    }))
    expect(await screen.findByRole('heading', { name: 'Check your email.' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Verification code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Verify and continue' }))

    await waitFor(() => expect(mocks.verifyMemberEmail).toHaveBeenCalledWith({ code: '123456', email: member.email }))
    expect(mocks.push).toHaveBeenCalledWith('/onboarding')
    expect(window.localStorage).toHaveLength(0)
  })
})
