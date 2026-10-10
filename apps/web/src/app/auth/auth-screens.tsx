'use client'

import type { CatalogTitleSummary } from '@consumit/contracts'
import { AuthField, AuthShell, Button, ProgressRail } from '@consumit/ui'
import { ArrowLeft, Check, Eye, EyeOff } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, type ReactNode, useRef, useState } from 'react'

import {
  confirmPasswordRecovery,
  getUsernameAvailability,
  IdentityApiError,
  loginMember,
  registerMember,
  requestEmailVerification,
  requestPasswordRecovery,
  updateMemberProfile,
  verifyMemberEmail,
} from '@/lib/identity-browser'

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

function FormMessage({ action, error, message }: { action?: ReactNode; error?: string | null; message?: string | null }) {  if (error) return <p className="text-xs leading-5 text-[var(--fs-danger)]" role="alert">{error}{action ? <span> {action}</span> : null}</p>
  if (message) return <p aria-live="polite" className="text-xs leading-5 text-lime">{message}</p>
  return null
}

function errorMessage(error: unknown) {
  return error instanceof IdentityApiError ? error.message : 'Something went wrong. Please try again.'
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

export function SignInScreen({ nextPath = '/', titles = [] }: { nextPath?: string; titles?: readonly CatalogTitleSummary[] }) {
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
        setErrorAction(<Link className="inline-flex min-h-[44px] items-center font-bold text-ink hover:text-orange" href="/verify-email">Verify it now</Link>)
      } else if (caught instanceof IdentityApiError && caught.code === 'INVALID_CREDENTIALS') {
        setError('That email and password did not match.')
        setErrorAction(<Link className="inline-flex min-h-[44px] items-center font-bold text-ink hover:text-orange" href="/forgot-password">Reset your password</Link>)
      } else {
        setError(errorMessage(caught))
        setErrorAction(null)
      }
      setBusy(false)
    }
  }

  return (
    <AuthFrame description="Sign in or create an account to open your personal library." footer={null} title="Welcome back." titles={titles}>
      <form className="flex flex-col gap-5" method="post" onSubmit={submit}>
        <AuthField autoComplete="email" helper="Use the verified email for your account, not your username." id="sign-in-email" label="Email" name="email" required type="email" />
        <div className="space-y-2">
          <AuthField
            aria-describedby="sign-in-password-description"
            autoComplete="current-password"
            id="sign-in-password"
            label="Password"
            name="password"
            required
            trailingAction={<Button aria-label={showPassword ? 'Hide password' : 'Show password'} className="size-10 rounded-xl text-muted hover:text-ink" onClick={() => setShowPassword((value) => !value)} size="icon" variant="ghost">{showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</Button>}
            type={showPassword ? 'text' : 'password'}
          />
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <p className="text-xs leading-5 text-muted" id="sign-in-password-description">12 or more characters.</p>
            <Link className="inline-flex min-h-[44px] shrink-0 items-center text-xs leading-5 text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-orange" href="/forgot-password">Forgot password?</Link>
          </div>
        </div>
        <FormMessage action={errorAction} error={error} />
        <Button className="mt-2 w-full text-xs font-bold uppercase tracking-[0.05em]" loading={busy} size="lg" type="submit" variant="accent">Sign in</Button>
      </form>
      <PrivacyHelpRow />
      <p className="mt-5 flex flex-wrap items-center gap-x-3 text-xs text-muted">New to Consumit? <Link className="inline-flex min-h-[44px] items-center font-bold text-ink hover:text-orange" href="/sign-up">Create your account</Link></p>
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
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [usernameState, setUsernameState] = useState<'idle' | 'checking' | 'available' | 'unavailable'>('idle')
  const usernameRequest = useRef(0)
  const resendRequest = useRef(false)
  const [resending, setResending] = useState(false)
  const [step, setStep] = useState<'register' | 'identity' | 'verify'>('register')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  function beginIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setEmail(String(data.get('email')))
    setPassword(String(data.get('password')))
    setError(null)
    setStep('identity')
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await registerMember({ email, password, username })
      setMessage(result.message)
      setStep('verify')
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

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

  async function resendCode() {
    if (resendRequest.current || busy) return
    resendRequest.current = true
    setResending(true)
    setError(null)
    setMessage(null)
    try { setMessage((await requestEmailVerification(email)).message) }
    catch (caught) { setError(errorMessage(caught)) }
    finally { resendRequest.current = false; setResending(false) }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || resendRequest.current) return
    setBusy(true)
    setError(null)
    const data = new FormData(event.currentTarget)
    try {
      const member = await verifyMemberEmail({ code: String(data.get('code')), email })
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
      setBusy(false)
    }
  }

  function restart() {
    usernameRequest.current += 1
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
        <Button className="mt-5" disabled={busy || resending} onClick={restart} size="sm" variant="secondary">Use a different email</Button>
      </div>
    ) : undefined} description="Two minutes to a library that remembers everything you watch." footer={null} title={step === 'register' ? 'Create your account.' : step === 'identity' ? 'Choose your identity.' : 'Check your email.'} titles={titles}>
      {step === 'register' ? (
        <>
        <SignupStepHeader current={1} />
        {/* Keyed per step so React never recycles input DOM nodes across
            steps: without keys the register/identity/verify forms reconcile
            into each other and a recycled node flips uncontrolled to
            controlled (plus risks leaking DOM state between steps). */}
        <form className="space-y-5" key="signup-register" method="post" onSubmit={beginIdentity}>
          <AuthField autoComplete="email" id="sign-up-email" label="Email" name="email" onChange={(event) => setEmail(event.currentTarget.value)} placeholder="you@example.com" required type="email" value={email} />
          <AuthField autoComplete="new-password" helper="Use 12–128 characters. A password manager is even better." id="sign-up-password" label="Password" maxLength={128} minLength={12} name="password" onChange={(event) => setPassword(event.currentTarget.value)} placeholder="At least 12 characters" required type="password" value={password} />
          <div className="relative flex min-h-[44px] items-center gap-3">
            <input className="peer absolute left-0 size-11 cursor-pointer opacity-0" defaultChecked id="account-terms" name="termsAccepted" required type="checkbox" />
            <span aria-hidden="true" className="pointer-events-none grid size-4 shrink-0 place-items-center rounded-micro border border-control-outline bg-surface text-canvas peer-checked:border-orange peer-checked:bg-orange [&_svg]:size-3 [&_svg]:opacity-0 peer-checked:[&_svg]:opacity-100"><Check /></span>
            <p className="text-xs leading-5 text-muted"><label htmlFor="account-terms">I agree to the </label><Link className="text-copy underline" href="/terms">Terms</Link> and <Link className="text-copy underline" href="/privacy">Privacy Policy</Link>.</p>
          </div>
          <FormMessage error={error} />
          <Button className="w-full" loading={busy} size="lg" type="submit" variant="accent">Continue</Button>
        </form>
        </>
      ) : step === 'identity' ? (
        <>
        <SignupStepHeader current={2} />
        <form className="space-y-5" key="signup-identity" method="post" onSubmit={register}>
          <div className="space-y-4 rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <AuthField autoCapitalize="none" autoComplete="username" helper="3–30 lowercase letters, numbers, or underscores." id="sign-up-username" label="Username" maxLength={30} minLength={3} name="username" onBlur={() => void checkUsername()} onChange={(event) => { usernameRequest.current += 1; setUsername(event.currentTarget.value.toLowerCase()); setUsernameState('idle') }} pattern="[a-z0-9_]{3,30}" placeholder="cinema_fan" required value={username} />
          {usernameState === 'checking' ? <p className="text-xs text-muted" role="status">Checking username…</p> : null}
          {usernameState === 'available' ? <p className="text-xs text-lime">Username is available.</p> : null}
          {usernameState === 'unavailable' ? <p className="text-xs text-danger" role="alert">That username is unavailable.</p> : null}
          <AuthField autoComplete="off" helper="Optional. Shown on your profile instead of your username." id="sign-up-display-name" label="Display name" maxLength={80} name="displayName" onChange={(event) => setDisplayName(event.currentTarget.value)} placeholder="Cinema Fan" value={displayName} />
          <FormMessage error={error} />
          </div>
          <Button className="w-full" loading={busy} size="lg" type="submit" variant="accent">Send verification code</Button>
        </form>
        <button className="mt-5 inline-flex min-h-[44px] items-center gap-2 text-xs text-muted hover:text-ink" onClick={restart} type="button"><ArrowLeft aria-hidden="true" className="size-4" /> Back to account details</button>
        </>
      ) : (
        <>
        <SignupStepHeader current={3} />
        <form className="space-y-5" key="signup-verify" method="post" onSubmit={verify}>
          <p className="text-sm leading-6 text-copy">Enter the six-digit code sent to <strong className="text-ink">{email}</strong>. Creating the account finishes only after this step.</p>
          <AuthField autoComplete="one-time-code" id="sign-up-code" inputMode="numeric" label="Verification code" maxLength={6} name="code" pattern="[0-9]{6}" required />
          <FormMessage error={error} message={message} />
          <Button className="w-full" disabled={resending} loading={busy} size="lg" type="submit" variant="accent">Verify and continue</Button>
          <Button className="w-full" disabled={busy} loading={resending} onClick={() => void resendCode()} type="button" variant="secondary">Send another code</Button>
        </form>
        </>
      )}
      <PrivacyHelpRow />
      <p className="mt-5 text-xs text-muted">Already a member? <Link className="font-bold text-ink hover:text-orange" href="/sign-in">Sign in</Link></p>
    </AuthFrame>
  )
}

export function VerifyEmailScreen() {
  const router = useRouter()
  const session = useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const data = new FormData(event.currentTarget)
    try {
      const member = await verifyMemberEmail({ code: String(data.get('code')), email: String(data.get('email')) })
      session.setMember(member)
      router.push('/onboarding')
      router.refresh()
    } catch (caught) {
      setError(errorMessage(caught))
      setBusy(false)
    }
  }
  return <AuthFrame description="Finish creating your account without putting private codes in a URL." title="Verify your email."><form className="space-y-5" method="post" onSubmit={submit}><AuthField autoComplete="email" id="verify-email" label="Email" name="email" required type="email" /><AuthField autoComplete="one-time-code" id="verify-code" inputMode="numeric" label="Verification code" maxLength={6} name="code" pattern="[0-9]{6}" required /><FormMessage error={error} /><Button className="w-full" loading={busy} type="submit" variant="accent">Verify email</Button></form></AuthFrame>
}

export function ForgotPasswordScreen() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const email = String(new FormData(event.currentTarget).get('email'))
    try { setMessage((await requestPasswordRecovery(email)).message) } catch (caught) { setError(errorMessage(caught)) } finally { setBusy(false) }
  }
  return <AuthFrame description="We answer the same way whether an address belongs to a member or not." title="Reset your password."><form className="space-y-5" method="post" onSubmit={submit}><AuthField autoComplete="email" id="recovery-email" label="Email" name="email" required type="email" /><FormMessage error={error} message={message} /><Button className="w-full" loading={busy} type="submit" variant="accent">Send reset code</Button>{message ? <Link className="inline-flex min-h-[44px] items-center font-bold text-ink hover:text-orange" href="/reset-password">I have a reset code</Link> : null}</form></AuthFrame>
}

export function ResetPasswordScreen() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const data = new FormData(event.currentTarget)
    try {
      await confirmPasswordRecovery({ code: String(data.get('code')), email: String(data.get('email')), newPassword: String(data.get('newPassword')) })
      router.push('/sign-in')
    } catch (caught) { setError(errorMessage(caught)); setBusy(false) }
  }
  return <AuthFrame description="Use the code from your email and choose a new password." title="Choose a new password."><form className="space-y-5" method="post" onSubmit={submit}><AuthField autoComplete="email" id="reset-email" label="Email" name="email" required type="email" /><AuthField autoComplete="one-time-code" id="reset-code" inputMode="numeric" label="Reset code" maxLength={6} name="code" pattern="[0-9]{6}" required /><AuthField autoComplete="new-password" id="reset-password" label="New password" minLength={12} name="newPassword" required type="password" /><FormMessage error={error} /><Button className="w-full" loading={busy} type="submit" variant="accent">Reset password</Button></form></AuthFrame>
}
