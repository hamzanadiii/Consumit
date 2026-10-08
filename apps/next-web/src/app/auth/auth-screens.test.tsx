import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { IdentityApiError } from '@/lib/identity-browser'
import { movieSummary } from '@/test/catalog-fixtures'
import { renderWithProviders as render } from '@/test/render'

import { SignInScreen, SignUpScreen } from './auth-screens'

const mocks = vi.hoisted(() => ({
  getUsernameAvailability: vi.fn(),
  loginMember: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  registerMember: vi.fn(),
  requestEmailVerification: vi.fn(),
  updateMemberProfile: vi.fn(),
  verifyMemberEmail: vi.fn(),
}))

vi.mock('next/navigation', () => ({usePathname: () => '/',
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}))

vi.mock('@/lib/identity-browser', () => ({
  confirmPasswordRecovery: vi.fn(),
  getUsernameAvailability: mocks.getUsernameAvailability,
  IdentityApiError: class IdentityApiError extends Error {
    code?: string | undefined
    constructor(message?: string, options?: { code?: string }) {
      super(message)
      this.code = options?.code
    }
  },
  loginMember: mocks.loginMember,
  registerMember: mocks.registerMember,
  requestEmailVerification: mocks.requestEmailVerification,
  requestPasswordRecovery: vi.fn(),
  updateMemberProfile: mocks.updateMemberProfile,
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
    mocks.updateMemberProfile.mockResolvedValue({})
    mocks.requestEmailVerification.mockResolvedValue({ message: 'A new code has been sent.' })
  })

  it('ignores a username lookup that finishes after the username changes', async () => {
    const user = userEvent.setup()
    let resolveLookup!: (value: { available: boolean; username: string }) => void
    mocks.getUsernameAvailability.mockReturnValueOnce(new Promise((resolve) => { resolveLookup = resolve }))
    render(<SignUpScreen titles={[]} />)
    await user.type(screen.getByLabelText('Email'), member.email)
    await user.type(screen.getByLabelText('Password'), 'a-secure-password')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.type(screen.getByLabelText('Username'), 'first_name')
    await user.tab()
    expect(screen.getByRole('status')).toHaveTextContent('Checking username')
    await user.clear(screen.getByLabelText('Username'))
    await user.type(screen.getByLabelText('Username'), 'second_name')
    await act(async () => resolveLookup({ available: true, username: 'first_name' }))
    expect(screen.queryByText('Username is available.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toHaveValue('second_name')
  })

  it('prevents overlapping code requests and keeps verification available after resend fails', async () => {
    const user = userEvent.setup()
    let rejectResend!: (error: Error) => void
    mocks.requestEmailVerification.mockReturnValueOnce(new Promise((_, reject) => { rejectResend = reject }))
    render(<SignUpScreen titles={[]} />)
    await user.type(screen.getByLabelText('Email'), member.email)
    await user.type(screen.getByLabelText('Password'), 'a-secure-password')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.type(screen.getByLabelText('Username'), member.username)
    await user.click(screen.getByRole('button', { name: 'Send verification code' }))
    await screen.findByRole('heading', { name: 'Check your email.' })
    const resend = screen.getByRole('button', { name: 'Send another code' })
    await user.dblClick(resend)
    expect(mocks.requestEmailVerification).toHaveBeenCalledTimes(1)
    expect(resend).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Verify and continue' })).toBeDisabled()
    await act(async () => rejectResend(new IdentityApiError('Email delivery is unavailable. Try again.', { code: 'EMAIL_DELIVERY_UNAVAILABLE', retryable: true, status: 503 })))
    expect(screen.getByRole('alert')).toHaveTextContent('Email delivery is unavailable')
    expect(resend).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Verify and continue' })).toBeEnabled()
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

  it('walks account, identity, and verification without OAuth controls', async () => {
    const user = userEvent.setup()
    render(<SignUpScreen titles={[movieSummary]} />)

    expect(screen.queryByText(/google|apple/i)).not.toBeInTheDocument()
    expect(screen.getAllByText('Your account and library are private by default.')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Need help?' })).toHaveAttribute('href', '/help')
    expect(screen.getByRole('progressbar', { name: 'Sign-up step 1 of 3' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Email'), member.email)
    await user.type(screen.getByLabelText('Password'), 'a-secure-password')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByRole('heading', { name: 'Choose your identity.' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Sign-up step 2 of 3' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Username'), member.username)
    await user.type(screen.getByLabelText('Display name'), 'Cinema Fan')
    await user.click(screen.getByRole('button', { name: 'Send verification code' }))

    await waitFor(() => expect(mocks.registerMember).toHaveBeenCalledWith({
      email: member.email,
      password: 'a-secure-password',
      username: member.username,
    }))
    expect(await screen.findByRole('heading', { name: 'Check your email.' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Sign-up step 3 of 3' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Verification code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Verify and continue' }))

    await waitFor(() => expect(mocks.verifyMemberEmail).toHaveBeenCalledWith({ code: '123456', email: member.email }))
    expect(mocks.updateMemberProfile).toHaveBeenCalledWith({ displayName: 'Cinema Fan' })
    expect(mocks.push).toHaveBeenCalledWith('/onboarding')
    expect(window.localStorage).toHaveLength(0)
  })

  it('keeps typed account details when stepping back and restarts cleanly', async () => {
    const user = userEvent.setup()
    render(<SignUpScreen titles={[movieSummary]} />)

    await user.type(screen.getByLabelText('Email'), member.email)
    await user.type(screen.getByLabelText('Password'), 'a-secure-password')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Back to account details' }))

    expect(screen.getByRole('heading', { name: 'Create your account.' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveValue(member.email)
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByRole('heading', { name: 'Choose your identity.' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Username'), member.username)
    await user.click(screen.getByRole('button', { name: 'Send verification code' }))
    expect(await screen.findByRole('heading', { name: 'Check your email.' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Use a different email' }))
    expect(screen.getByRole('heading', { name: 'Create your account.' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Sign-up step 1 of 3' })).toBeInTheDocument()
  })

  it('skips the display-name save when left empty', async () => {
    const user = userEvent.setup()
    render(<SignUpScreen titles={[movieSummary]} />)

    await user.type(screen.getByLabelText('Email'), member.email)
    await user.type(screen.getByLabelText('Password'), 'a-secure-password')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.type(screen.getByLabelText('Username'), member.username)
    await user.click(screen.getByRole('button', { name: 'Send verification code' }))
    expect(await screen.findByRole('heading', { name: 'Check your email.' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Verification code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Verify and continue' }))

    await waitFor(() => expect(mocks.verifyMemberEmail).toHaveBeenCalled())
    expect(mocks.updateMemberProfile).not.toHaveBeenCalled()
    expect(mocks.push).toHaveBeenCalledWith('/onboarding')
  })
  it('renders the member’s stored theme with no theme toggle on auth', async () => {
    const user = userEvent.setup()
    render(<SignInScreen nextPath="/library" titles={[]} />)

    expect(document.querySelector('[data-filscreen-home]')).toHaveAttribute('data-theme', 'dark')
    expect(screen.queryByRole('button', { name: /switch to (light|dark) mode/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument()
  })

  it('restores the stored light theme without flashing the wrong default', async () => {
    window.localStorage.setItem('consumit.next.theme', 'light')
    render(<SignInScreen nextPath="/library" titles={[]} />)

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(document.querySelector('[data-filscreen-home]')).toHaveAttribute('data-theme', 'light')
    expect(screen.queryByRole('button', { name: /switch to (light|dark) mode/i })).not.toBeInTheDocument()
  })

  it('explains which email to use and keeps password requirements visible', async () => {
    render(<SignInScreen nextPath="/library" titles={[]} />)

    expect(screen.getByText('Use the verified email for your account, not your username.')).toBeInTheDocument()
    expect(screen.getByText('12 or more characters.')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('minlength')
    expect(screen.getByText('Your account and library are private by default.')).toBeInTheDocument()
  })

  it('names unverified emails and offers verification instead of blame', async () => {
    const user = userEvent.setup()
    mocks.loginMember.mockRejectedValueOnce(new IdentityApiError('Verify your email before signing in.', { code: 'EMAIL_NOT_VERIFIED', retryable: false, status: 403 }))
    render(<SignInScreen nextPath="/library" titles={[]} />)

    await user.type(screen.getByLabelText('Email'), member.email)
    await user.type(screen.getByLabelText('Password'), 'a-secure-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('registered but not verified')
    expect(screen.getByRole('link', { name: 'Verify it now' })).toHaveAttribute('href', '/verify-email')
  })

  it('offers password reset on mismatched credentials', async () => {
    const user = userEvent.setup()
    mocks.loginMember.mockRejectedValueOnce(new IdentityApiError('Invalid email or password.', { code: 'INVALID_CREDENTIALS', retryable: false, status: 401 }))
    render(<SignInScreen nextPath="/library" titles={[]} />)

    await user.type(screen.getByLabelText('Email'), member.email)
    await user.type(screen.getByLabelText('Password'), 'a-secure-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('did not match')
    expect(screen.getByRole('link', { name: 'Reset your password' })).toHaveAttribute('href', '/forgot-password')
  })

  it('tabs email, password, reveal, recovery, then submit in visual order', async () => {
    const user = userEvent.setup()
    render(<SignInScreen nextPath="/library" titles={[]} />)

    await user.click(screen.getByLabelText('Email'))
    expect(document.activeElement).toBe(screen.getByLabelText('Email'))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByLabelText('Password'))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Show password' }))
    await user.tab()
    expect(document.activeElement).toHaveAccessibleName('Forgot password?')
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Sign in' }))
  })
})
