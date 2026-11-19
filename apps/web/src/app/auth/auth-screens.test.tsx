import { act, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { IdentityApiError } from '@/lib/identity-browser'
import { movieSummary } from '@/test/catalog-fixtures'
import { renderWithProviders as render } from '@/test/render'

import { GoogleSignUpScreen, SignInScreen, SignUpScreen, VerifyEmailScreen } from './auth-screens'
// Authentication owns session issuance; preference persistence is covered by its own service and browser tests.
vi.mock('../experience/experience-provider', () => ({ ExperienceProvider: ({ children }: { children: ReactNode }) => children }))

const mocks = vi.hoisted(() => ({
  getUsernameAvailability: vi.fn(),
  getGoogleSignupPending: vi.fn(),
  completeGoogleSignup: vi.fn(),
  loginMember: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  registerMember: vi.fn(),
  requestEmailVerification: vi.fn(),
  updateMemberProfile: vi.fn(),
  verifyMemberEmail: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}))

vi.mock('@/lib/identity-browser', () => ({
  confirmPasswordRecovery: vi.fn(),
  getUsernameAvailability: mocks.getUsernameAvailability,
  getGoogleSignupPending: mocks.getGoogleSignupPending,
  completeGoogleSignup: mocks.completeGoogleSignup,
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
    mocks.getGoogleSignupPending.mockResolvedValue({ email: 'google@example.com', name: 'Google Fan' })
    mocks.completeGoogleSignup.mockResolvedValue({ member, status: 'complete' })
    mocks.loginMember.mockResolvedValue(member)
    mocks.registerMember.mockResolvedValue({ message: 'If the details can be used, a verification code has been sent.' })
    mocks.verifyMemberEmail.mockResolvedValue(member)
    mocks.updateMemberProfile.mockResolvedValue({})
    mocks.requestEmailVerification.mockResolvedValue({ message: 'A new code has been sent.' })
  })

  it('requires deliberate Terms and Privacy acceptance before moving to identity', async () => {
    const user = userEvent.setup()
    render(<SignUpScreen titles={[]} />)

    const termsAcceptance = screen.getByRole('checkbox', { name: 'I agree to the Terms and Privacy Policy' })
    expect(termsAcceptance).not.toBeChecked()
    await user.type(screen.getByLabelText('Email'), member.email)
    await user.type(screen.getByLabelText('Password'), 'a-secure-password')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.getByRole('heading', { name: 'Create your account.' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()

    await user.click(termsAcceptance)
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('heading', { name: 'Choose your identity.' })).toBeInTheDocument()
  })

  it('requires deliberate Terms and Privacy acceptance to complete Google signup', async () => {
    const user = userEvent.setup()
    render(<GoogleSignUpScreen nextPath="/library" />)

    const termsAcceptance = await screen.findByRole('checkbox', { name: 'I agree to the Terms and Privacy Policy' })
    expect(termsAcceptance).not.toBeChecked()
    await user.type(screen.getByLabelText('Username'), 'google_fan')
    const createAccount = screen.getByRole('button', { name: 'Create account' })
    await user.click(createAccount)
    expect(mocks.completeGoogleSignup).not.toHaveBeenCalled()

    await user.click(termsAcceptance)
    await user.click(createAccount)
    await waitFor(() => expect(mocks.completeGoogleSignup).toHaveBeenCalledWith({
      displayName: 'Google Fan',
      termsAccepted: true,
      username: 'google_fan',
    }))
    expect(mocks.push).toHaveBeenCalledWith('/onboarding?next=%2Flibrary')
  })

  it('ignores a username lookup that finishes after the username changes', async () => {
    const user = userEvent.setup()
    let resolveLookup!: (value: { available: boolean; username: string }) => void
    mocks.getUsernameAvailability.mockReturnValueOnce(new Promise((resolve) => { resolveLookup = resolve }))
    render(<SignUpScreen titles={[]} />)
    await user.type(screen.getByLabelText('Email'), member.email)
    await user.type(screen.getByLabelText('Password'), 'a-secure-password')
    await user.click(screen.getByRole('checkbox', { name: 'I agree to the Terms and Privacy Policy' }))
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
    await user.click(screen.getByRole('checkbox', { name: 'I agree to the Terms and Privacy Policy' }))
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

  it('explains resend timing after an accepted signup resend', async () => {
    const user = userEvent.setup()
    render(<SignUpScreen titles={[]} />)
    await user.type(screen.getByLabelText('Email'), member.email)
    await user.type(screen.getByLabelText('Password'), 'a-secure-password')
    await user.click(screen.getByRole('checkbox', { name: 'I agree to the Terms and Privacy Policy' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.type(screen.getByLabelText('Username'), member.username)
    await user.click(screen.getByRole('button', { name: 'Send verification code' }))
    await screen.findByRole('heading', { name: 'Check your email.' })

    const code = screen.getByLabelText('Verification code')
    await user.type(code, '123456')
    await user.click(screen.getByRole('button', { name: 'Send another code' }))

    expect(await screen.findByText('Give the email a minute to arrive and check spam before requesting another. A newly issued code replaces the previous one.')).toBeInTheDocument()
    expect(code).toHaveValue('')
    expect(code).toHaveFocus()
  })

  it('explains resend timing on standalone verification', async () => {
    const user = userEvent.setup()
    render(<VerifyEmailScreen nextPath="/library" />)
    await user.type(screen.getByLabelText('Email'), member.email)
    const code = screen.getByLabelText('Verification code')
    await user.type(code, '123456')
    await user.click(screen.getByRole('button', { name: 'Send another code' }))

    expect(await screen.findByText('Give the email a minute to arrive and check spam before requesting another. A newly issued code replaces the previous one.')).toBeInTheDocument()
    expect(code).toHaveValue('')
    expect(code).toHaveFocus()
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

  it('walks email account, identity, and verification with Google sign-up available', async () => {
    const user = userEvent.setup()
    render(<SignUpScreen titles={[movieSummary]} />)

    expect(screen.getByRole('link', { name: 'Create your account with Google' })).toHaveAttribute('href', '/v1/auth/google/start')
    expect(screen.getAllByText('Your account and library are private by default.')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Need help?' })).toHaveAttribute('href', '/help')
    expect(screen.getByRole('progressbar', { name: 'Sign-up step 1 of 3' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Email'), member.email)
    await user.type(screen.getByLabelText('Password'), 'a-secure-password')
    await user.click(screen.getByRole('checkbox', { name: 'I agree to the Terms and Privacy Policy' }))
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
    await user.click(screen.getByRole('checkbox', { name: 'I agree to the Terms and Privacy Policy' }))
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
    await user.click(screen.getByRole('checkbox', { name: 'I agree to the Terms and Privacy Policy' }))
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
    window.localStorage.setItem('consumit.home-theme', 'light')
    render(<SignInScreen nextPath="/library" titles={[]} />)

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(document.querySelector('[data-filscreen-home]')).toHaveAttribute('data-theme', 'light')
    expect(screen.queryByRole('button', { name: /switch to (light|dark) mode/i })).not.toBeInTheDocument()
  })

  it('explains sign-in fields and applies the API password length constraints before sending', async () => {
    render(<SignInScreen nextPath="/library" titles={[]} />)

    expect(screen.getByText('Use the verified email for your account, not your username.')).toBeInTheDocument()
    expect(screen.getByText('Use 12–128 characters.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText('Password')).toHaveAttribute('minlength', '12')
    expect(screen.getByLabelText('Password')).toHaveAttribute('maxlength', '128')
    expect(screen.getByText('Your account and library are private by default.')).toBeInTheDocument()
  })

  it('keeps a short sign-in password editable and exposes the minimum length', async () => {
    const user = userEvent.setup()
    render(<SignInScreen nextPath="/library" titles={[]} />)
    const email = screen.getByLabelText('Email')
    const password = screen.getByLabelText('Password')
    await user.type(email, member.email)
    await user.type(password, 'too-short')
    expect(password).toHaveValue('too-short')
    expect(password).toHaveAttribute('minlength', '12')
    expect(mocks.loginMember).not.toHaveBeenCalled()
  })

  it('names unverified emails and offers verification instead of blame', async () => {
    const user = userEvent.setup()
    mocks.loginMember.mockRejectedValueOnce(new IdentityApiError('Verify your email before signing in.', { code: 'EMAIL_NOT_VERIFIED', retryable: false, status: 403 }))
    render(<SignInScreen nextPath="/library" titles={[]} />)

    await user.type(screen.getByLabelText('Email'), member.email)
    await user.type(screen.getByLabelText('Password'), 'a-secure-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('registered but not verified')
    expect(screen.getByRole('link', { name: 'Verify it now' })).toHaveAttribute('href', '/verify-email?next=%2Flibrary')
  })

  it('offers password reset on mismatched credentials', async () => {
    const user = userEvent.setup()
    mocks.loginMember.mockRejectedValueOnce(new IdentityApiError('Invalid email or password.', { code: 'INVALID_CREDENTIALS', retryable: false, status: 401 }))
    render(<SignInScreen nextPath="/library" titles={[]} />)

    await user.type(screen.getByLabelText('Email'), member.email)
    await user.type(screen.getByLabelText('Password'), 'a-secure-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('did not match')
    expect(screen.getByRole('link', { name: 'Reset your password' })).toHaveAttribute('href', '/forgot-password?next=%2Flibrary')
  })

  it('keeps credentials and the return task after a retryable sign-in outage', async () => {
    const user = userEvent.setup()
    const nextPath = '/search?q=evening&type=anime'
    let rejectLogin!: (error: Error) => void
    mocks.loginMember.mockImplementationOnce(() => new Promise((_, reject) => { rejectLogin = reject })).mockResolvedValueOnce(member)
    render(<SignInScreen nextPath={nextPath} titles={[]} />)
    const email = screen.getByLabelText('Email')
    const password = screen.getByLabelText('Password')
    await user.type(email, member.email)
    await user.type(password, 'a-secure-password')

    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(email).toBeDisabled()
    expect(password).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveAttribute('aria-busy', 'true')

    await act(async () => rejectLogin(new IdentityApiError('The account service could not be reached. Try again.', { code: 'AUTH_STATE_UNAVAILABLE', retryable: true, status: 503 })))
    const error = await screen.findByRole('alert')

    expect(error).toHaveTextContent('Try again.')
    expect(error).toHaveFocus()
    expect(email).toHaveValue(member.email)
    expect(password).toHaveValue('a-secure-password')
    expect(email).toBeEnabled()
    expect(password).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(mocks.loginMember).toHaveBeenCalledTimes(2))
    expect(mocks.loginMember).toHaveBeenLastCalledWith({ email: member.email, password: 'a-secure-password' })
    expect(mocks.push).toHaveBeenCalledWith(nextPath)
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
