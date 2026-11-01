'use client'

import type { CatalogTitleSummary } from '@consumit/contracts'
import { AuthField, AuthShell, Button, ProgressRail } from '@consumit/ui'
import { ArrowLeft, Check, Eye, EyeOff } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'

import {
  confirmPasswordRecovery,
  completeGoogleSignup,
  getUsernameAvailability,
  getGoogleSignupPending,
  IdentityApiError,
  loginMember,
  type GoogleSignupCompletionResponse,
  registerMember,
  requestEmailVerification,
  requestPasswordRecovery,
  updateMemberProfile,
  verifyMemberEmail,
} from '@/lib/identity-browser'
import { trackConsumitAnalytics } from '@/lib/google-analytics'
import { internalNextPath } from '@/lib/internal-next-path'

import { useSession } from '../session/session'
import { AuthThemeScope } from './auth-theme'

function AuthBrand({ className = '' }: { className?: string }) {
  return (
    <Link aria-label="Consumit home" className={`inline-flex min-h-[44px] items-center gap-3 rounded-xl text-ink outline-none focus-visible:ring-2 focus-visible:ring-orange ${className}`} href="/">
      <Image alt="" className="size-8" height={32} src="/assets/consumit-mark.svg" width={32} />
      <span className="text-sm font-bold tracking-[0.2em]">CONSUMIT</span>
    </Link>
  )
}

function PrivacyHelpRow() {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <p className="min-w-0 flex-1 text-xs leading-5 text-muted">Your account and library are private by default.</p>
      <Link className="inline-flex min-h-[44px] shrink-0 items-center text-xs leading-5 text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-orange" href="/help">Need help?</Link>
    </div>
  )
}

function GoogleAuthAction({ label, nextPath }: { label: string; nextPath: string }) {
  const next = internalNextPath(nextPath)
  const href = `/v1/auth/google/start${next === '/' ? '' : `?${new URLSearchParams({ next })}`}`
  return (
    <a className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-control-outline bg-surface px-4 text-sm font-bold text-ink outline-none transition-colors hover:border-orange focus-visible:ring-2 focus-visible:ring-orange" href={href}>
      <svg aria-hidden="true" className="size-[18px] shrink-0" viewBox="0 0 48 48">
        <path d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11c-.5 2.5-1.9 4.7-4 6.1v5h6.5c3.8-3.5 6.1-8.7 6.1-14.8Z" fill="#4285F4" />
        <path d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.5-5c-1.8 1.2-4.1 2-7 2-5.3 0-9.8-3.6-11.4-8.4H5.9v5.2C9.3 39.6 16.1 44 24 44Z" fill="#34A853" />
        <path d="M12.6 27.8a12 12 0 0 1 0-7.6V15H5.9a20 20 0 0 0 0 18l6.7-5.2Z" fill="#FBBC05" />
        <path d="M24 11.8c3 0 5.7 1 7.8 3.1l5.8-5.8C34.1 5.8 29.5 4 24 4 16.1 4 9.3 8.4 5.9 15l6.7 5.2c1.6-4.8 6.1-8.4 11.4-8.4Z" fill="#EA4335" />
      </svg>
      <span>{label}</span>
    </a>
  )
}

function AuthDivider() {
  return <div aria-hidden="true" className="my-5 flex items-center gap-4 text-[10px] font-bold tracking-[0.12em] text-muted uppercase"><span className="h-px flex-1 bg-border" /><span>or continue with email</span><span className="h-px flex-1 bg-border" /></div>
}

function FormMessage({ action, error, message }: { action?: ReactNode; error?: string | null; message?: string | null }) {
  const errorRegion = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (error) {
      errorRegion.current?.focus({ preventScroll: true })
      errorRegion.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
    }
  }, [error])
  if (error) return <p className="rounded-control text-xs leading-5 text-[var(--fs-danger)] outline-none focus:ring-2 focus:ring-orange" ref={errorRegion} role="alert" tabIndex={-1}>{error}{action ? <span> {action}</span> : null}</p>
  if (message) return <p className="text-xs leading-5 text-ink" role="status">{message}</p>
  return null
}

function VerificationEmailGuidance() {
  return <p className="mt-4 text-xs leading-5 text-muted">Give the email a minute to arrive and check spam before requesting another. A newly issued code replaces the previous one.</p>
}

function errorMessage(error: unknown) {
  if (error instanceof IdentityApiError && error.code === 'RATE_LIMITED') return 'Too many requests. Please wait a little, then try again.'
  return error instanceof IdentityApiError ? error.message : 'Something went wrong. Please try again.'
}

function authDestination(path: string, nextPath: string) {
  const next = internalNextPath(nextPath)
  return next === '/' ? path : `${path}?${new URLSearchParams({ next })}`
}

function BackToSignIn({ nextPath }: { nextPath: string }) {
  return <Link className="mt-5 inline-flex min-h-[44px] items-center font-bold text-ink outline-none hover:text-orange focus-visible:ring-2 focus-visible:ring-orange" href={authDestination('/sign-in', nextPath)}>Back to sign in</Link>
}

function AuthFrame({ asideContent, children, description, footer, title, titles = [] }: {
  asideContent?: ReactNode | undefined
  children: ReactNode
  description: string
  footer?: ReactNode | null | undefined
  title: string
  titles?: readonly CatalogTitleSummary[]
}) {
  const backdropUrl = titles.find((title) => title.backdropUrl)?.backdropUrl ?? titles.find((title) => title.posterUrl)?.posterUrl ?? undefined
  return (
    <AuthThemeScope>
    <style>{`[data-theme="light"] .auth-aside-scrim{background-color:transparent;background-image:linear-gradient(100deg,var(--fs-shell) 30%,transparent 65%),linear-gradient(0deg,var(--fs-shell) 20%,transparent 45%);}`}</style>
    <AuthShell
      artworkOverlayClassName="auth-aside-scrim bg-[linear-gradient(100deg,var(--fs-shell)_8%,transparent_70%),linear-gradient(0deg,var(--fs-shell)_5%,transparent_55%)]"
      {...(backdropUrl ? { artworkSrc: backdropUrl } : {})}
      asideContent={asideContent}
      asideClassName="bg-[radial-gradient(120%_90%_at_78%_8%,var(--fs-accent-soft)_0%,transparent_60%),var(--fs-shell)] lg:px-[50px] lg:pt-[34px] lg:pb-[56px]"
      asideDescription="Build your private library, remember every watch, and keep your favorites, reviews, and lists together."
      asideTitle="Remember what you love."
      className="min-h-screen rounded-none border-0 lg:grid-cols-[54.86%_45.14%]"
      contentClassName="bg-field lg:py-10"
      contentHeader={<AuthBrand className="lg:hidden" />}
      description={description}
      footer={footer === undefined ? <p>Your account and library are private by default.</p> : (footer ?? undefined)}
      formClassName="lg:max-w-[26.875rem]"
      header={<AuthBrand />}
      title={title}
    >
      {children}
    </AuthShell>
    </AuthThemeScope>
  )
}

export function SignInScreen({ googleMessage, nextPath = '/', titles = [], passwordReset = false }: { googleMessage?: string | null; nextPath?: string; titles?: readonly CatalogTitleSummary[]; passwordReset?: boolean }) {
  const router = useRouter()
  const session = useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorAction, setErrorAction] = useState<ReactNode | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setErrorAction(null)
    const data = new FormData(event.currentTarget)
    try {
      const member = await loginMember({ email: String(data.get('email')), password: String(data.get('password')) })
      session.setMember(member)
      router.push(nextPath)
      router.refresh()
    } catch (caught) {
      if (caught instanceof IdentityApiError && caught.code === 'EMAIL_NOT_VERIFIED') {
        setError('This email is registered but not verified yet.')
        setErrorAction(<Link className="inline-flex min-h-[44px] items-center font-bold text-ink hover:text-orange" href={authDestination('/verify-email', nextPath)}>Verify it now</Link>)
      } else if (caught instanceof IdentityApiError && caught.code === 'INVALID_CREDENTIALS') {
        setError('That email and password did not match.')
        setErrorAction(<Link className="inline-flex min-h-[44px] items-center font-bold text-ink hover:text-orange" href={authDestination('/forgot-password', nextPath)}>Reset your password</Link>)
      } else if (caught instanceof IdentityApiError && caught.code === 'RATE_LIMITED') {
        setError('Too many sign-in attempts. Please wait a little, then try again.')
        setErrorAction(null)
      } else {
        setError(errorMessage(caught))
        setErrorAction(null)
      }
      setBusy(false)
    }
  }

  return (
    <AuthFrame description="Sign in or create an account to open your personal library." footer={null} title="Welcome back." titles={titles}>
      {passwordReset ? <p className="mb-5 text-sm leading-6 text-ink" role="status">Password updated. Sign in with your new password.</p> : null}
      {googleMessage ? <p className="mb-4 text-xs leading-5 text-[var(--fs-danger)]" role="alert">{googleMessage}</p> : null}
      <GoogleAuthAction label="Continue with Google" nextPath={nextPath} />
      <AuthDivider />
      <form className="flex flex-col gap-5" method="post" onSubmit={submit}>
        <AuthField autoComplete="email" disabled={busy} helper="Use the verified email for your account, not your username." id="sign-in-email" label="Email" name="email" required type="email" />
        <div className="space-y-2">
          <AuthField
            aria-describedby="sign-in-password-description"
            autoComplete="current-password"
            disabled={busy}
            id="sign-in-password"
            label="Password"
            maxLength={128}
            minLength={12}
            name="password"
            required
            trailingAction={<Button aria-label={showPassword ? 'Hide password' : 'Show password'} className="size-10 rounded-xl text-muted hover:text-ink" onClick={() => setShowPassword((value) => !value)} size="icon" variant="ghost">{showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</Button>}
            type={showPassword ? 'text' : 'password'}
          />
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <p className="text-xs leading-5 text-muted" id="sign-in-password-description">Use 12–128 characters.</p>
            <Link className="inline-flex min-h-[44px] shrink-0 items-center text-xs leading-5 text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-orange" href={authDestination('/forgot-password', nextPath)}>Forgot password?</Link>
          </div>
        </div>
        <FormMessage action={errorAction} error={error} />
        <Button className="mt-2 w-full text-xs font-bold uppercase tracking-[0.05em]" loading={busy} size="lg" type="submit" variant="accent">Sign in</Button>
      </form>
      <PrivacyHelpRow />
      <p className="mt-5 flex flex-wrap items-center gap-x-3 text-xs text-muted">New to Consumit? <Link className="inline-flex min-h-[44px] items-center font-bold text-ink hover:text-orange" href={authDestination('/sign-up', nextPath)}>Create your account</Link></p>
    </AuthFrame>
  )
}

function SignupStepHeader({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className="mb-6">
      <p className="text-xs font-bold tracking-[0.12em] text-muted uppercase">Step {current} of 3</p>
      <ProgressRail className="mt-2 rounded-full" label={`Sign-up step ${current} of 3`} value={(current / 3) * 100} />
    </div>
  )
}

export function SignUpScreen({ titles = [], nextPath = '/' }: { titles?: readonly CatalogTitleSummary[]; nextPath?: string }) {
  const router = useRouter()
  const session = useSession()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [pendingRegistration, setPendingRegistration] = useState<{ email: string; password: string; username: string; displayName: string } | null>(null)
  const [usernameState, setUsernameState] = useState<'idle' | 'checking' | 'available' | 'unavailable'>('idle')
  const usernameRequest = useRef(0)
  const resendRequest = useRef(false)
  const submitRequest = useRef(false)
  const emailField = useRef<HTMLInputElement>(null)
  const usernameField = useRef<HTMLInputElement>(null)
  const codeField = useRef<HTMLInputElement>(null)
  const restoreStepFocus = useRef(false)
  const [resending, setResending] = useState(false)
  const [step, setStep] = useState<'register' | 'identity' | 'verify'>('register')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => {
    if (!busy && !resending && restoreStepFocus.current) {
      restoreStepFocus.current = false
      const target = step === 'register' ? emailField.current : step === 'identity' ? usernameField.current : codeField.current
      target?.focus({ preventScroll: true })
      target?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
    }
  }, [step, busy, resending])

  function beginIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setEmail(String(data.get('email')))
    setPassword(String(data.get('password')))
    setError(null)
    restoreStepFocus.current = true
    setStep('identity')
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitRequest.current || resendRequest.current) return
    submitRequest.current = true
    setBusy(true)
    setError(null)
    try {
      const result = await registerMember({ email, password, username })
      setCode('')
      setPendingRegistration({ email, password, username, displayName })
      setMessage(result.message)
      restoreStepFocus.current = true
      setStep('verify')
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      submitRequest.current = false; setBusy(false)
    }
  }

  async function checkUsername() {
    const value = username.trim().toLowerCase()
    const request = ++usernameRequest.current
    if (!/^[a-z0-9_]{3,30}$/.test(value)) return
    setUsernameState('checking')
    try {
      const result = await getUsernameAvailability(value)
      if (request === usernameRequest.current) {
        setUsernameState(result.available ? 'available' : 'unavailable')
        if (result.available && pendingRegistration?.username === value) setPendingRegistration(null)
      }
    } catch {
      if (request === usernameRequest.current) setUsernameState('idle')
    }
  }

  async function resendCode() {
    if (resendRequest.current || submitRequest.current) return
    resendRequest.current = true
    setResending(true)
    setError(null)
    setMessage(null)
    try {
      setMessage((await requestEmailVerification(email)).message)
      setCode('')
      restoreStepFocus.current = true
    }
    catch (caught) { setError(errorMessage(caught)) }
    finally { resendRequest.current = false; setResending(false) }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitRequest.current || resendRequest.current) return
    submitRequest.current = true
    setBusy(true)
    setError(null)
    const data = new FormData(event.currentTarget)
    try {
      const member = await verifyMemberEmail({ code: String(data.get('code')), email })
      setPendingRegistration(null)
      trackConsumitAnalytics({ name: 'sign_up', method: 'email' })
      const name = displayName.trim()
      if (name) {
        try {
          await updateMemberProfile({ displayName: name })
          session.setMember({ ...member, displayName: name })
        } catch {
          session.setMember(member)
        }
      } else {
        session.setMember(member)
      }
      router.push(nextPath === '/' ? '/onboarding' : `/onboarding?${new URLSearchParams({ next: nextPath })}`)
      router.refresh()
    } catch (caught) {
      setError(errorMessage(caught))
      submitRequest.current = false; setBusy(false)
    }
  }

  function resumeVerification() {
    if (!pendingRegistration || submitRequest.current || resendRequest.current) return
    setEmail(pendingRegistration.email)
    setPassword(pendingRegistration.password)
    setUsername(pendingRegistration.username)
    setDisplayName(pendingRegistration.displayName)
    usernameRequest.current += 1
    setUsernameState('idle')
    setError(null)
    setCode('')
    setMessage('Continue with the code sent for these account details.')
    restoreStepFocus.current = true
    setStep('verify')
  }

  function restart() {
    if (submitRequest.current || resendRequest.current) return
    usernameRequest.current += 1
    setUsernameState('idle')
    restoreStepFocus.current = true
    setCode('')
    setStep('register')
    setError(null)
    setMessage(null)
  }

  return (
    <AuthFrame asideContent={step === 'verify' ? (
      <div>
        <dl className="grid gap-4">
          <div>
            <dt className="text-xs font-bold tracking-[0.12em] text-copy uppercase">Username</dt>
            <dd className="mt-1 truncate text-sm font-bold text-ink">{username}</dd>
          </div>
          {displayName.trim() ? (
            <div>
              <dt className="text-xs font-bold tracking-[0.12em] text-copy uppercase">Display name</dt>
              <dd className="mt-1 truncate text-sm font-bold text-ink">{displayName.trim()}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs font-bold tracking-[0.12em] text-copy uppercase">Email</dt>
            <dd className="mt-1 truncate text-sm font-bold text-ink">{email}</dd>
          </div>
        </dl>
      </div>
    ) : undefined} description="Two minutes to a library that remembers everything you watch." footer={null} title={step === 'register' ? 'Create your account.' : step === 'identity' ? 'Choose your identity.' : 'Check your email.'} titles={titles}>
      {step === 'register' ? (
        <>
        <GoogleAuthAction label="Create your account with Google" nextPath={nextPath} />
        <AuthDivider />
        <SignupStepHeader current={1} />
        {/* Keyed per step so React never recycles input DOM nodes across
            steps: without keys the register/identity/verify forms reconcile
            into each other and a recycled node flips uncontrolled to
            controlled (plus risks leaking DOM state between steps). */}
        <form className="space-y-5" key="signup-register" method="post" onSubmit={beginIdentity}>
          <AuthField autoComplete="email" id="sign-up-email" ref={emailField} label="Email" name="email" onChange={(event) => setEmail(event.currentTarget.value)} placeholder="you@example.com" required type="email" value={email} />
          <AuthField autoComplete="new-password" helper="Use 12–128 characters. A password manager is even better." id="sign-up-password" label="Password" maxLength={128} minLength={12} name="password" onChange={(event) => setPassword(event.currentTarget.value)} placeholder="At least 12 characters" required type="password" value={password} />
          <div className="relative flex min-h-[44px] items-center gap-3">
            <input aria-label="I agree to the Terms and Privacy Policy" checked={termsAccepted} className="peer absolute left-0 size-[44px] cursor-pointer opacity-0" id="account-terms" name="termsAccepted" onChange={event => setTermsAccepted(event.currentTarget.checked)} required type="checkbox" />
            <span aria-hidden="true" className="pointer-events-none grid size-4 shrink-0 place-items-center rounded-micro border border-control-outline bg-surface text-canvas peer-checked:border-orange peer-checked:bg-orange peer-focus-visible:ring-2 peer-focus-visible:ring-orange [&_svg]:size-3 [&_svg]:opacity-0 peer-checked:[&_svg]:opacity-100"><Check /></span>
            <p className="text-xs leading-5 text-muted"><label htmlFor="account-terms">I agree to the </label><Link className="text-copy underline" href="/terms">Terms</Link> and <Link className="text-copy underline" href="/privacy">Privacy Policy</Link>.</p>
          </div>
          <FormMessage error={error} />
          <Button className="w-full" loading={busy} size="lg" type="submit" variant="accent">Continue</Button>
        </form>
        </>
      ) : step === 'identity' ? (
        <>
        <SignupStepHeader current={2} />
        <form key="signup-identity" method="post" onSubmit={register}><fieldset className="min-w-0 space-y-5" disabled={busy}>
          <div className="space-y-4 rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <AuthField autoCapitalize="none" autoComplete="username" helper="3–30 lowercase letters, numbers, or underscores." id="sign-up-username" ref={usernameField} label="Username" maxLength={30} minLength={3} name="username" onBlur={() => void checkUsername()} onChange={(event) => { usernameRequest.current += 1; setUsername(event.currentTarget.value.toLowerCase()); setUsernameState('idle') }} pattern="[a-z0-9_]{3,30}" placeholder="cinema_fan" required value={username} />
          <p className={`min-h-5 text-xs leading-5 ${usernameState === 'unavailable' ? 'text-[var(--fs-danger)]' : usernameState === 'checking' ? 'text-muted' : 'text-ink'}`} role={usernameState === 'unavailable' ? 'alert' : 'status'}>{usernameState === 'checking' ? 'Checking username…' : usernameState === 'available' ? 'Username is available.' : usernameState === 'unavailable' ? 'That username is unavailable.' : ''}</p>
          <AuthField autoComplete="off" helper="Optional. Shown on your profile instead of your username." id="sign-up-display-name" label="Display name" maxLength={80} name="displayName" onChange={(event) => setDisplayName(event.currentTarget.value)} placeholder="Cinema Fan" value={displayName} />
          <FormMessage error={error} />
          </div>
          <Button className="w-full" disabled={busy || usernameState === 'unavailable'} loading={busy} size="lg" type="submit" variant="accent">{busy ? 'Sending verification code…' : 'Send verification code'}</Button>
        </fieldset></form>
        <button className="mt-5 inline-flex min-h-[44px] items-center gap-2 text-xs text-muted hover:text-ink" disabled={busy || resending} onClick={restart} type="button"><ArrowLeft aria-hidden="true" className="size-4" /> Back to account details</button>
        </>
      ) : (
        <>
        <SignupStepHeader current={3} />
        <form key="signup-verify" method="post" onSubmit={verify}><fieldset className="min-w-0 space-y-5" disabled={busy || resending}>
          <p className="text-sm leading-6 text-copy">Enter the 6-digit code sent to <strong className="break-words text-ink">{email}</strong>. Creating the account finishes only after this step.</p>
          <AuthField autoComplete="one-time-code" id="sign-up-code" ref={codeField} inputMode="numeric" label="Verification code" maxLength={6} name="code" onChange={event => setCode(event.currentTarget.value)} pattern="[0-9]{6}" required value={code} />
          <FormMessage error={error} message={message} />
          <Button className="w-full" disabled={resending} loading={busy} size="lg" type="submit" variant="accent">{busy ? 'Verifying email…' : 'Verify and continue'}</Button>
          <Button className="w-full" disabled={busy} loading={resending} onClick={() => void resendCode()} type="button" variant="secondary">Send another code</Button>
        </fieldset></form>
        <VerificationEmailGuidance />
        <button className="mt-5 inline-flex min-h-[44px] items-center rounded-control text-sm font-bold text-ink outline-none hover:text-orange focus-visible:ring-2 focus-visible:ring-orange disabled:opacity-50" disabled={busy || resending} onClick={restart} type="button">{error === 'The code is invalid or has expired.' ? 'Start signup again' : 'Use a different email'}</button>
        </>
      )}
      {step !== 'verify' && pendingRegistration ? <div className="mt-5 space-y-1">
        <p className="break-words text-xs leading-5 text-muted">Pending signup: {pendingRegistration.email} · {pendingRegistration.username}. This username stays reserved; another email needs a different one.</p>
        <button className="inline-flex min-h-[44px] items-center rounded-control text-sm font-bold text-ink outline-none hover:text-orange focus-visible:ring-2 focus-visible:ring-orange disabled:opacity-50" disabled={busy || resending} onClick={resumeVerification} type="button">Return to pending verification</button>
      </div> : null}
      <PrivacyHelpRow />
      <p className="mt-5 text-xs text-muted">Already a member? <Link className="inline-flex min-h-[44px] items-center rounded-control font-bold text-ink outline-none hover:text-orange focus-visible:ring-2 focus-visible:ring-orange" href={authDestination('/sign-in', nextPath)}>Sign in</Link></p>
    </AuthFrame>
  )
}

export function GoogleSignUpScreen({ nextPath = '/' }: { nextPath?: string }) {
  const router = useRouter()
  const session = useSession()
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'identity' | 'verify'>('identity')
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [usernameState, setUsernameState] = useState<'idle' | 'checking' | 'available' | 'unavailable'>('idle')
  const usernameRequest = useRef(0)
  const inFlight = useRef(false)
  const usernameField = useRef<HTMLInputElement>(null)
  const codeField = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    void getGoogleSignupPending().then((pending) => {
      if (!active) return
      setEmail(pending.email)
      setDisplayName(pending.name ?? '')
      setReady(true)
    }).catch(() => {
      if (active) setError('This Google sign-up has expired. Start again to continue.')
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!ready || busy || resending) return
    const target = step === 'identity' ? usernameField.current : codeField.current
    target?.focus({ preventScroll: true })
  }, [ready, step, busy, resending])

  async function checkUsername() {
    const value = username.trim().toLowerCase()
    const request = ++usernameRequest.current
    if (!/^[a-z0-9_]{3,30}$/.test(value)) return
    setUsernameState('checking')
    try {
      const result = await getUsernameAvailability(value)
      if (request === usernameRequest.current) setUsernameState(result.available ? 'available' : 'unavailable')
    } catch {
      if (request === usernameRequest.current) setUsernameState('idle')
    }
  }

  function finish(member: Awaited<ReturnType<typeof verifyMemberEmail>>) {
    session.setMember(member)
    trackConsumitAnalytics({ name: 'sign_up', method: 'google' })
    const destination = internalNextPath(nextPath)
    router.push(destination === '/' ? '/onboarding' : `/onboarding?${new URLSearchParams({ next: destination })}`)
    router.refresh()
  }

  async function complete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    setMessage(null)
    const data = new FormData(event.currentTarget)
    try {
      const result: GoogleSignupCompletionResponse = await completeGoogleSignup({
        ...(String(data.get('displayName')).trim() ? { displayName: String(data.get('displayName')).trim() } : {}),
        termsAccepted: true,
        username: String(data.get('username')).trim().toLowerCase(),
      })
      if (result.status === 'complete') {
        finish(result.member)
        return
      }
      setEmail(result.email)
      setCode('')
      setStep('verify')
      setMessage('We sent a verification code to your email. Enter it to finish creating your account.')
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    const data = new FormData(event.currentTarget)
    try {
      finish(await verifyMemberEmail({ code: String(data.get('code')), email }))
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  async function resendCode() {
    if (inFlight.current || resending) return
    inFlight.current = true
    setResending(true)
    setError(null)
    setMessage(null)
    try {
      setMessage((await requestEmailVerification(email)).message)
      setCode('')
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      inFlight.current = false
      setResending(false)
    }
  }

  return (
    <AuthFrame
      asideContent={email ? <p className="break-words text-sm font-bold text-ink">{email}</p> : undefined}
      description={step === 'identity' ? 'Choose a public username for your private Consumit library.' : 'Verify your email to finish creating your account.'}
      footer={null}
      title={step === 'identity' ? 'Choose your identity.' : 'Check your email.'}
    >
      {step === 'identity' ? (
        <form className="space-y-5" method="post" onSubmit={complete}>
          <AuthField autoCapitalize="none" autoComplete="username" disabled={!ready || busy} helper="3–30 lowercase letters, numbers, or underscores." id="google-sign-up-username" ref={usernameField} label="Username" maxLength={30} minLength={3} name="username" onBlur={() => void checkUsername()} onChange={(event) => { usernameRequest.current += 1; setUsername(event.currentTarget.value.toLowerCase()); setUsernameState('idle') }} pattern="[a-z0-9_]{3,30}" placeholder="cinema_fan" required value={username} />
          <p className={`min-h-5 text-xs leading-5 ${usernameState === 'unavailable' ? 'text-[var(--fs-danger)]' : usernameState === 'checking' ? 'text-muted' : 'text-ink'}`} role={usernameState === 'unavailable' ? 'alert' : 'status'}>{usernameState === 'checking' ? 'Checking username…' : usernameState === 'available' ? 'Username is available.' : usernameState === 'unavailable' ? 'That username is unavailable.' : ''}</p>
          <AuthField autoComplete="name" disabled={!ready || busy} helper="Optional. Shown on your profile instead of your username." id="google-sign-up-display-name" label="Display name" maxLength={80} name="displayName" onChange={(event) => setDisplayName(event.currentTarget.value)} placeholder="Cinema Fan" value={displayName} />
          <div className="relative flex min-h-[44px] items-center gap-3">
            <input aria-label="I agree to the Terms and Privacy Policy" className="peer absolute left-0 size-[44px] cursor-pointer opacity-0" disabled={!ready || busy} id="google-account-terms" name="termsAccepted" required type="checkbox" />
            <span aria-hidden="true" className="pointer-events-none grid size-4 shrink-0 place-items-center rounded-micro border border-control-outline bg-surface text-canvas peer-checked:border-orange peer-checked:bg-orange peer-focus-visible:ring-2 peer-focus-visible:ring-orange [&_svg]:size-3 [&_svg]:opacity-0 peer-checked:[&_svg]:opacity-100"><Check /></span>
            <p className="text-xs leading-5 text-muted"><label htmlFor="google-account-terms">I agree to the </label><Link className="text-copy underline" href="/terms">Terms</Link> and <Link className="text-copy underline" href="/privacy">Privacy Policy</Link>.</p>
          </div>
          <FormMessage error={error} />
          {!ready && error ? <GoogleAuthAction label="Restart Google sign-up" nextPath={nextPath} /> : null}
          <Button className="w-full" disabled={!ready || busy || usernameState === 'unavailable'} loading={busy} size="lg" type="submit" variant="accent">{busy ? 'Creating your account…' : 'Create account'}</Button>
          {!ready && !error ? <p className="text-xs text-muted" role="status">Checking your Google sign-up…</p> : null}
        </form>
      ) : (
        <>
          <form className="space-y-5" method="post" onSubmit={verify}>
            <p className="text-sm leading-6 text-copy">Enter the 6-digit code sent to <strong className="break-words text-ink">{email}</strong>.</p>
            <AuthField autoComplete="one-time-code" disabled={busy || resending} id="google-sign-up-code" inputMode="numeric" label="Verification code" maxLength={6} name="code" onChange={(event) => setCode(event.currentTarget.value)} pattern="[0-9]{6}" ref={codeField} required value={code} />
            <FormMessage error={error} message={message} />
            <Button className="w-full" disabled={resending} loading={busy} size="lg" type="submit" variant="accent">{busy ? 'Verifying email…' : 'Verify and continue'}</Button>
            <Button className="w-full" disabled={busy} loading={resending} onClick={() => void resendCode()} type="button" variant="secondary">Send another code</Button>
          </form>
          <VerificationEmailGuidance />
        </>
      )}
      <PrivacyHelpRow />
      <p className="mt-5 text-xs text-muted">Already a member? <Link className="inline-flex min-h-[44px] items-center rounded-control font-bold text-ink outline-none hover:text-orange focus-visible:ring-2 focus-visible:ring-orange" href={authDestination('/sign-in', nextPath)}>Sign in</Link></p>
    </AuthFrame>
  )
}

export function VerifyEmailScreen({ nextPath = '/' }: { nextPath?: string }) {
  const router = useRouter()
  const session = useSession()
  const pending = useRef(false)
  const emailField = useRef<HTMLInputElement>(null)
  const codeField = useRef<HTMLInputElement>(null)
  const restoreCodeFocus = useRef(false)
  const [action, setAction] = useState<'verify' | 'resend' | null>(null)
  const busy = action !== null
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [codeRejected, setCodeRejected] = useState(false)
  useEffect(() => {
    if (!busy && restoreCodeFocus.current) {
      restoreCodeFocus.current = false
      codeField.current?.focus({ preventScroll: true })
      codeField.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
    }
  }, [busy])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    pending.current = true
    const data = new FormData(event.currentTarget)
    setAction('verify'); setError(null); setMessage(null)
    try {
      const member = await verifyMemberEmail({ code: String(data.get('code')), email: String(data.get('email')) })
      session.setMember(member)
      router.push(authDestination('/onboarding', nextPath))
      router.refresh()
    } catch (caught) {
      setError(errorMessage(caught))
      if (caught instanceof IdentityApiError && caught.code === 'INVALID_VERIFICATION_CODE') setCodeRejected(true)
      pending.current = false; setAction(null)
    }
  }
  async function resendCode() {
    if (pending.current || !emailField.current?.reportValidity()) return
    const email = emailField.current.value
    pending.current = true
    setAction('resend'); setError(null); setMessage(null)
    try {
      const result = await requestEmailVerification(email)
      setMessage(result.message); setCode(''); restoreCodeFocus.current = true
    } catch (caught) { setError(errorMessage(caught)) }
    finally { pending.current = false; setAction(null) }
  }
  return <AuthFrame description="Enter the code sent to your email to finish creating your account." title="Verify your email.">
    <form method="post" onSubmit={submit}>
      <fieldset className="space-y-5" disabled={busy}>
        <AuthField autoComplete="email" id="verify-email" label="Email" name="email" onChange={() => { setMessage(null); setError(null); setCodeRejected(false) }} ref={emailField} required type="email" />
        <AuthField autoComplete="one-time-code" helper="Enter the 6-digit code from your email." id="verify-code" inputMode="numeric" label="Verification code" maxLength={6} name="code" onChange={event => setCode(event.currentTarget.value)} pattern="[0-9]{6}" ref={codeField} required value={code} />
        <FormMessage error={error} message={message} />
        <Button className="w-full" loading={action === 'verify'} type="submit" variant="accent">{action === 'verify' ? 'Verifying email…' : 'Verify email'}</Button>
        <Button className="w-full" loading={action === 'resend'} onClick={() => void resendCode()} type="button" variant="secondary">{action === 'resend' ? 'Sending another code…' : 'Send another code'}</Button>
      </fieldset>
    </form>
    <VerificationEmailGuidance />
    {!busy && codeRejected ? <div className="mt-5"><p className="text-xs leading-5 text-muted">If the code has expired, start signup again to request a new one.</p><Link className="inline-flex min-h-[44px] items-center rounded-control font-bold text-ink outline-none hover:text-orange focus-visible:ring-2 focus-visible:ring-orange" href={authDestination('/sign-up', nextPath)}>Start signup again</Link></div> : null}
    {!busy ? <BackToSignIn nextPath={nextPath} /> : null}
  </AuthFrame>
}

export function ForgotPasswordScreen({ nextPath = '/' }: { nextPath?: string }) {
  const pending = useRef(false)
  const proceedLink = useRef<HTMLAnchorElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!busy && message) {
      proceedLink.current?.focus({ preventScroll: true })
      proceedLink.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
    }
  }, [busy, message])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError(null)
    setMessage(null)
    const email = String(new FormData(event.currentTarget).get('email'))
    try { setMessage((await requestPasswordRecovery(email)).message) } catch (caught) { setError(errorMessage(caught)) } finally { pending.current = false; setBusy(false) }
  }
  return <AuthFrame description="Enter your account email to request a reset code." title="Reset your password."><form method="post" onSubmit={submit}><fieldset className="space-y-5" disabled={busy}><AuthField autoComplete="email" id="recovery-email" label="Email" name="email" onChange={() => setMessage(null)} required type="email" /><FormMessage error={error} message={message} /><Button className="w-full" loading={busy} type="submit" variant="accent">{busy ? 'Sending reset code…' : 'Send reset code'}</Button>{!busy ? <Link className="inline-flex min-h-[44px] items-center rounded-control font-bold text-ink outline-none hover:text-orange focus-visible:ring-2 focus-visible:ring-orange" ref={proceedLink} href={authDestination('/reset-password', nextPath)}>I have a reset code</Link> : null}</fieldset></form>{!busy ? <BackToSignIn nextPath={nextPath} /> : null}</AuthFrame>
}

export function ResetPasswordScreen({ nextPath = '/' }: { nextPath?: string }) {
  const router = useRouter()
  const pending = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    pending.current = true
    const data = new FormData(event.currentTarget)
    setBusy(true)
    setError(null)
    try {
      await confirmPasswordRecovery({ code: String(data.get('code')), email: String(data.get('email')), newPassword: String(data.get('newPassword')) })
      const target = authDestination('/sign-in', nextPath)
      router.push(`${target}${target.includes('?') ? '&' : '?'}reset=success`)
    } catch (caught) { setError(errorMessage(caught)); pending.current = false; setBusy(false) }
  }
  return <AuthFrame description="Use the code from your email and choose a new password." title="Choose a new password.">
    <form method="post" onSubmit={submit}>
      <fieldset className="space-y-5" disabled={busy}>
        <AuthField autoComplete="email" id="reset-email" label="Email" name="email" required type="email" />
        <AuthField autoComplete="one-time-code" helper="Enter the 6-digit code from your email." id="reset-code" inputMode="numeric" label="Reset code" maxLength={6} name="code" pattern="[0-9]{6}" required />
        <AuthField autoComplete="new-password" helper="Use 12–128 characters." id="reset-password" label="New password" maxLength={128} minLength={12} name="newPassword" required type={showPassword ? 'text' : 'password'} trailingAction={<Button aria-label={showPassword ? 'Hide password' : 'Show password'} className="size-11 rounded-xl text-muted hover:text-ink" onClick={() => setShowPassword(value => !value)} size="icon" type="button" variant="ghost">{showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</Button>} />
        <FormMessage error={error} />
        <Button className="w-full" loading={busy} type="submit" variant="accent">{busy ? 'Resetting password…' : 'Reset password'}</Button>
        {!busy ? <Link className="inline-flex min-h-[44px] items-center font-bold text-ink hover:text-orange" href={authDestination('/forgot-password', nextPath)}>Request another code</Link> : null}
      </fieldset>
    </form>
    {!busy ? <BackToSignIn nextPath={nextPath} /> : null}
  </AuthFrame>
}
